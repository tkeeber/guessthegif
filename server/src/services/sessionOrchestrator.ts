/**
 * SessionOrchestrator — orchestrates the flow between rounds within a
 * session. After a round ends (won or timeout), waits 5 seconds, then
 * starts the next round. After all 3 rounds, generates a session summary,
 * checks for a season winner, and broadcasts session:end.
 *
 * Requirements: 4.1, 4.3, 4.4
 */

import pool from '../db';
import { RoundStatus, SessionStatus, LobbyStatus } from '../types/enums';
import { PlayerSessionScore, SessionSummary } from '../types/entities';
import { TypedServer } from '../socket';
import { startRound } from './roundManager';
import { checkForSeasonWinner, endSeason } from './seasonManager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BETWEEN_ROUND_DELAY_MS = 5_000; // 5 seconds between rounds
const TOTAL_ROUNDS = 3;

// ---------------------------------------------------------------------------
// Active delay timers — keyed by session ID so they can be cleared if needed
// ---------------------------------------------------------------------------
const sessionTimers = new Map<string, NodeJS.Timeout>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Called after a round ends (won or timeout). Determines whether to start
 * the next round or end the session.
 */
export async function onRoundEnd(
  io: TypedServer,
  sessionId: string,
  lobbyId: string
): Promise<void> {
  // Fetch all rounds for this session to determine progress
  const roundsResult = await pool.query(
    `SELECT id, round_number, status
       FROM rounds
      WHERE session_id = $1
      ORDER BY round_number ASC`,
    [sessionId]
  );

  const rounds = roundsResult.rows;

  // Count completed rounds (won or timeout)
  const completedRounds = rounds.filter(
    (r: any) =>
      r.status === RoundStatus.Won || r.status === RoundStatus.Timeout
  );

  if (completedRounds.length >= TOTAL_ROUNDS) {
    // All rounds done — end the session
    await endSession(io, sessionId, lobbyId);
    return;
  }

  // Find the next pending round
  const nextRound = rounds.find(
    (r: any) => r.status === RoundStatus.Pending
  );

  if (!nextRound) {
    // No pending rounds left (shouldn't happen, but handle gracefully)
    await endSession(io, sessionId, lobbyId);
    return;
  }

  // Start the next round after a 5-second delay
  const timer = setTimeout(async () => {
    sessionTimers.delete(sessionId);
    try {
      await startRound(io, nextRound.id, lobbyId);
    } catch (err) {
      console.error('Error starting next round:', err);
    }
  }, BETWEEN_ROUND_DELAY_MS);

  sessionTimers.set(sessionId, timer);
}

/**
 * Start the first round of a session. Called from the session handler
 * when the host starts the session.
 */
export async function startFirstRound(
  io: TypedServer,
  sessionId: string,
  lobbyId: string
): Promise<void> {
  // Fetch the first round (round_number = 1)
  const roundResult = await pool.query(
    `SELECT id FROM rounds
      WHERE session_id = $1 AND round_number = 1`,
    [sessionId]
  );

  if (roundResult.rows.length === 0) {
    throw new Error('No rounds found for session.');
  }

  await startRound(io, roundResult.rows[0].id, lobbyId);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * End a session: generate summary, update statuses, check for season winner,
 * and broadcast session:end.
 */
async function endSession(
  io: TypedServer,
  sessionId: string,
  lobbyId: string
): Promise<void> {
  // Generate session summary — count correct guesses per player across all rounds
  const summary = await generateSessionSummary(sessionId);

  // Update session status to completed
  await pool.query(
    'UPDATE sessions SET status = $1, ended_at = NOW() WHERE id = $2',
    [SessionStatus.Completed, sessionId]
  );

  // Update lobby status back to waiting
  await pool.query(
    'UPDATE lobbies SET status = $1 WHERE id = $2',
    [LobbyStatus.Waiting, lobbyId]
  );

  // Build summary text
  const summaryText = summary.scores
    .map((s) => `${s.username}: ${s.points} point${s.points !== 1 ? 's' : ''}`)
    .join(', ');

  // Broadcast session:end
  io.to(lobbyId).emit('session:end', {
    scores: summary.scores.map((s) => ({
      playerId: s.playerId,
      username: s.username,
      points: s.points,
    })),
    sessionSummary: summaryText,
  });

  // Check for season winner
  const seasonResult = await pool.query(
    'SELECT season_id FROM sessions WHERE id = $1',
    [sessionId]
  );
  const seasonId = seasonResult.rows[0].season_id;

  const winner = await checkForSeasonWinner(seasonId);
  if (winner) {
    await endSeason(io, seasonId, winner.playerId, winner.username, lobbyId);
  }
}

/**
 * Generate a session summary with scores for all players in the session.
 * For each player in the lobby, count their correct guesses across the
 * session's 3 rounds.
 */
async function generateSessionSummary(
  sessionId: string
): Promise<SessionSummary> {
  // Get the lobby_id for this session to find all players
  const sessionResult = await pool.query(
    'SELECT lobby_id FROM sessions WHERE id = $1',
    [sessionId]
  );
  const lobbyId = sessionResult.rows[0].lobby_id;

  // Get all players in the lobby
  const playersResult = await pool.query(
    `SELECT p.id AS player_id, p.username
       FROM lobby_players lp
       JOIN players p ON p.id = lp.player_id
      WHERE lp.lobby_id = $1`,
    [lobbyId]
  );

  // Count correct guesses per player across all rounds in this session
  const guessCountResult = await pool.query(
    `SELECT g.player_id, COUNT(*)::int AS correct_count
       FROM guesses g
       JOIN rounds r ON r.id = g.round_id
      WHERE r.session_id = $1
        AND g.is_correct = true
      GROUP BY g.player_id`,
    [sessionId]
  );

  const correctCountMap = new Map<string, number>();
  for (const row of guessCountResult.rows) {
    correctCountMap.set(row.player_id, row.correct_count);
  }

  // Build scores for all players (including those with 0 points)
  const scores: PlayerSessionScore[] = playersResult.rows.map((player: any) => ({
    playerId: player.player_id,
    username: player.username,
    points: correctCountMap.get(player.player_id) ?? 0,
  }));

  // Sort by points descending
  scores.sort((a, b) => b.points - a.points);

  return {
    sessionId,
    scores,
  };
}

// ---------------------------------------------------------------------------
// Cleanup helper (for testing / graceful shutdown)
// ---------------------------------------------------------------------------

export function clearAllSessionTimers(): void {
  for (const timer of sessionTimers.values()) {
    clearTimeout(timer);
  }
  sessionTimers.clear();
}
