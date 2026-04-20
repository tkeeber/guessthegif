/**
 * RoundManager — orchestrates round lifecycle including timers,
 * guess processing, clue delivery, and win/timeout resolution.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.10, 3.11, 4.2, 4.3
 */

import pool from '../db';
import { RoundStatus } from '../types/enums';
import { Round, Gif, GuessResult, RoundResult, Clue } from '../types/entities';
import { isCorrectGuess } from './guessMatcher';
import { generateClue } from './clueService';
import { TypedServer } from '../socket';
import { onRoundEnd } from './sessionOrchestrator';

// ---------------------------------------------------------------------------
// Timer constants (in milliseconds)
// ---------------------------------------------------------------------------
const INITIAL_TIMER_MS = 120_000; // 120 seconds before clue
const POST_CLUE_TIMER_MS = 60_000; // 60 seconds after clue

// ---------------------------------------------------------------------------
// Per-round mutex map — prevents race conditions on concurrent correct guesses
// ---------------------------------------------------------------------------
const roundLocks = new Map<string, Promise<void>>();

function withRoundLock<T>(roundId: string, fn: () => Promise<T>): Promise<T> {
  const prev = roundLocks.get(roundId) ?? Promise.resolve();
  const next = prev.then(fn, fn); // always chain, even on rejection
  // Store the void version so the chain keeps growing
  roundLocks.set(roundId, next.then(() => {}, () => {}));
  return next;
}

// ---------------------------------------------------------------------------
// Active round timers — keyed by round ID so they can be cleared on win
// ---------------------------------------------------------------------------
const roundTimers = new Map<string, NodeJS.Timeout>();

function clearRoundTimer(roundId: string): void {
  const timer = roundTimers.get(roundId);
  if (timer) {
    clearTimeout(timer);
    roundTimers.delete(roundId);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a round: set status to active, record start time, broadcast
 * `round:start` to all players in the session room, and kick off the
 * 120-second initial timer.
 */
export async function startRound(
  io: TypedServer,
  roundId: string,
  lobbyId: string
): Promise<Round> {
  const result = await pool.query(
    `UPDATE rounds
        SET status = $1, started_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [RoundStatus.Active, roundId]
  );
  const round: Round = result.rows[0];

  // Fetch the GIF URL for this round
  const gifResult = await pool.query(
    'SELECT gif_url FROM gifs WHERE id = $1',
    [round.gif_id]
  );
  const gifUrl: string = gifResult.rows[0].gif_url;

  // Broadcast round:start
  io.to(lobbyId).emit('round:start', {
    roundNumber: round.round_number,
    gifUrl,
  });

  // Schedule the 120-second clue timer
  const timer = setTimeout(() => {
    handleCluePhase(io, roundId, lobbyId).catch((err) =>
      console.error('Clue phase error:', err)
    );
  }, INITIAL_TIMER_MS);
  roundTimers.set(roundId, timer);

  return round;
}

/**
 * Submit a guess for a round.
 *
 * - Rejects if round is not active or clue_given.
 * - Uses a per-round mutex to prevent concurrent correct-guess races.
 * - On correct guess: records winner, awards 1 point, broadcasts round:won.
 * - On incorrect guess: broadcasts guess:new to the feed.
 */
export async function submitGuess(
  io: TypedServer,
  roundId: string,
  playerId: string,
  text: string,
  lobbyId: string
): Promise<GuessResult> {
  return withRoundLock(roundId, async () => {
    // Fetch round + associated GIF film name
    const roundResult = await pool.query(
      `SELECT r.*, g.film_name
         FROM rounds r
         JOIN gifs g ON g.id = r.gif_id
        WHERE r.id = $1`,
      [roundId]
    );

    if (roundResult.rows.length === 0) {
      throw new RoundError('not_found', 'Round not found.');
    }

    const round = roundResult.rows[0];
    const filmName: string = round.film_name;

    // Only accept guesses on active or clue_given rounds
    if (
      round.status !== RoundStatus.Active &&
      round.status !== RoundStatus.ClueGiven
    ) {
      throw new RoundError(
        'round_not_active',
        'This round is no longer accepting guesses.'
      );
    }

    const correct = isCorrectGuess(text, filmName);

    // Record the guess in the database
    const guessResult = await pool.query(
      `INSERT INTO guesses (round_id, player_id, text, is_correct)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [roundId, playerId, text, correct]
    );
    const guess = guessResult.rows[0];

    // Look up the player's username
    const playerResult = await pool.query(
      'SELECT username FROM players WHERE id = $1',
      [playerId]
    );
    const username: string = playerResult.rows[0].username;

    if (correct) {
      // --- Correct guess path ---

      // Update round: set winner, status = won, ended_at
      await pool.query(
        `UPDATE rounds
            SET status = $1, winner_id = $2, ended_at = NOW()
          WHERE id = $3`,
        [RoundStatus.Won, playerId, roundId]
      );

      // Award 1 point: upsert into season_scores
      const sessionResult = await pool.query(
        'SELECT season_id FROM sessions WHERE id = (SELECT session_id FROM rounds WHERE id = $1)',
        [roundId]
      );
      const seasonId: string = sessionResult.rows[0].season_id;

      await pool.query(
        `INSERT INTO season_scores (player_id, season_id, correct_guess_count, last_correct_at)
         VALUES ($1, $2, 1, NOW())
         ON CONFLICT (player_id, season_id)
         DO UPDATE SET correct_guess_count = season_scores.correct_guess_count + 1,
                       last_correct_at = NOW()`,
        [playerId, seasonId]
      );

      // Clear the round timer
      clearRoundTimer(roundId);

      // Broadcast round:won
      io.to(lobbyId).emit('round:won', {
        winnerUsername: username,
        filmName,
      });

      // Also broadcast the winning guess to the feed
      io.to(lobbyId).emit('guess:new', {
        username,
        text,
        timestamp: guess.submitted_at,
        isCorrect: true,
      });

      // Trigger session orchestrator to handle next round or session end
      const sessionIdResult = await pool.query(
        'SELECT session_id FROM rounds WHERE id = $1',
        [roundId]
      );
      const sessionId = sessionIdResult.rows[0].session_id;
      // Fire-and-forget — orchestrator handles its own errors
      onRoundEnd(io, sessionId, lobbyId).catch((err) =>
        console.error('Session orchestrator error after round:won:', err)
      );
    } else {
      // --- Incorrect guess path ---
      io.to(lobbyId).emit('guess:new', {
        username,
        text,
        timestamp: guess.submitted_at,
        isCorrect: false,
      });
    }

    return { isCorrect: correct, guess };
  });
}

/**
 * End a round and return the result (used for both won and timeout).
 */
export async function endRound(roundId: string): Promise<RoundResult> {
  const result = await pool.query(
    `SELECT r.*, g.film_name, p.username AS winner_username
       FROM rounds r
       JOIN gifs g ON g.id = r.gif_id
       LEFT JOIN players p ON p.id = r.winner_id
      WHERE r.id = $1`,
    [roundId]
  );

  if (result.rows.length === 0) {
    throw new RoundError('not_found', 'Round not found.');
  }

  const row = result.rows[0];

  return {
    roundId: row.id,
    filmName: row.film_name,
    winnerId: row.winner_id,
    winnerUsername: row.winner_username ?? null,
    status: row.status,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Triggered after 120 seconds with no correct guess.
 * Generates a clue, broadcasts it, transitions round to clue_given,
 * and starts the 60-second post-clue timer.
 */
async function handleCluePhase(
  io: TypedServer,
  roundId: string,
  lobbyId: string
): Promise<void> {
  // Re-check round status — it may have been won in the meantime
  const roundResult = await pool.query(
    `SELECT r.status, g.film_name, g.lead_actors, g.tmdb_movie_id,
            g.release_year, g.theme
       FROM rounds r
       JOIN gifs g ON g.id = r.gif_id
      WHERE r.id = $1`,
    [roundId]
  );

  if (roundResult.rows.length === 0) return;

  const row = roundResult.rows[0];
  if (row.status !== RoundStatus.Active) return; // already resolved

  // Generate clue
  const clue: Clue = generateClue({
    filmName: row.film_name,
    tmdbMovieId: row.tmdb_movie_id,
    leadActors: row.lead_actors,
    releaseYear: row.release_year,
    theme: row.theme,
  });

  // Update round status to clue_given
  await pool.query(
    'UPDATE rounds SET status = $1, clue_given = true WHERE id = $2',
    [RoundStatus.ClueGiven, roundId]
  );

  // Broadcast clue
  io.to(lobbyId).emit('round:clue', {
    clueType: clue.clueType,
    clueText: clue.clueText,
  });

  // Schedule the 60-second post-clue timeout
  const timer = setTimeout(() => {
    handleTimeout(io, roundId, lobbyId).catch((err) =>
      console.error('Timeout error:', err)
    );
  }, POST_CLUE_TIMER_MS);
  roundTimers.set(roundId, timer);
}

/**
 * Triggered 60 seconds after the clue with no correct guess.
 * Ends the round with status timeout, reveals the film name, awards no points.
 */
async function handleTimeout(
  io: TypedServer,
  roundId: string,
  lobbyId: string
): Promise<void> {
  // Re-check round status
  const roundResult = await pool.query(
    `SELECT r.status, g.film_name
       FROM rounds r
       JOIN gifs g ON g.id = r.gif_id
      WHERE r.id = $1`,
    [roundId]
  );

  if (roundResult.rows.length === 0) return;

  const row = roundResult.rows[0];
  if (row.status !== RoundStatus.ClueGiven) return; // already resolved

  // Update round to timeout
  await pool.query(
    'UPDATE rounds SET status = $1, ended_at = NOW() WHERE id = $2',
    [RoundStatus.Timeout, roundId]
  );

  // Clear timer entry
  roundTimers.delete(roundId);

  // Broadcast round:timeout with film name
  io.to(lobbyId).emit('round:timeout', {
    filmName: row.film_name,
  });

  // Trigger session orchestrator to handle next round or session end
  const sessionIdResult = await pool.query(
    'SELECT session_id FROM rounds WHERE id = $1',
    [roundId]
  );
  const sessionId = sessionIdResult.rows[0].session_id;
  // Fire-and-forget — orchestrator handles its own errors
  onRoundEnd(io, sessionId, lobbyId).catch((err) =>
    console.error('Session orchestrator error after round:timeout:', err)
  );
}

// ---------------------------------------------------------------------------
// Cleanup helper (for testing / graceful shutdown)
// ---------------------------------------------------------------------------

export function clearAllTimers(): void {
  for (const timer of roundTimers.values()) {
    clearTimeout(timer);
  }
  roundTimers.clear();
  roundLocks.clear();
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class RoundError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'RoundError';
  }
}
