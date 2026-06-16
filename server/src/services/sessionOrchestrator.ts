/**
 * SessionOrchestrator — orchestrates the flow between rounds within a
 * session. After a round ends (won or timeout), broadcasts round:pending,
 * starts a 30-second auto-start timer, and allows the host to skip via
 * triggerNextRound(). After all rounds, generates a session summary,
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
const AUTO_START_SECONDS = 30; // seconds before next round auto-starts

// ---------------------------------------------------------------------------
// Per-session config — stores timePerGifMs and totalRounds set at session start
// ---------------------------------------------------------------------------
interface SessionConfig {
  timePerGifMs: number;
  totalRounds: number;
}
const sessionConfigs = new Map<string, SessionConfig>();

// ---------------------------------------------------------------------------
// Pending rounds — keyed by session ID, tracks next-round auto-start timers
// ---------------------------------------------------------------------------
interface PendingRound {
  nextRoundId: string;
  lobbyId: string;
  startTimer: NodeJS.Timeout;
}
const pendingRounds = new Map<string, PendingRound>();

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

  // Look up this session's config (total rounds)
  const config = sessionConfigs.get(sessionId);
  const totalRounds = config?.totalRounds ?? 3;

  // Count completed rounds (won or timeout)
  const completedRounds = rounds.filter(
    (r: any) =>
      r.status === RoundStatus.Won || r.status === RoundStatus.Timeout
  );

  if (completedRounds.length >= totalRounds) {
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

  // Broadcast round:pending so all clients show the countdown
  io.to(lobbyId).emit('round:pending', {
    nextRoundNumber: nextRound.round_number,
    autoStartInSeconds: AUTO_START_SECONDS,
  });

  // Start auto-start timer — host can skip this via triggerNextRound()
  const startTimer = setTimeout(async () => {
    pendingRounds.delete(sessionId);
    try {
      const cfg = sessionConfigs.get(sessionId);
      const tpgMs = cfg?.timePerGifMs ?? 60_000;
      await startRound(io, nextRound.id, lobbyId, tpgMs / 1000);
    } catch (err) {
      console.error('Error auto-starting next round:', err);
    }
  }, AUTO_START_SECONDS * 1000);

  pendingRounds.set(sessionId, { nextRoundId: nextRound.id, lobbyId, startTimer });
}

/**
 * Start the first round of a session. Called from the session handler
 * when the host starts the session. Stores timePerGifMs and totalRounds
 * for subsequent rounds.
 */
export async function startFirstRound(
  io: TypedServer,
  sessionId: string,
  lobbyId: string,
  timePerGifMs: number = 60_000,
  totalRounds: number = 3
): Promise<void> {
  // Store session config for use in subsequent rounds
  sessionConfigs.set(sessionId, { timePerGifMs, totalRounds });

  // Fetch the first round (round_number = 1)
  const roundResult = await pool.query(
    `SELECT id FROM rounds
      WHERE session_id = $1 AND round_number = 1`,
    [sessionId]
  );

  if (roundResult.rows.length === 0) {
    throw new Error('No rounds found for session.');
  }

  await startRound(io, roundResult.rows[0].id, lobbyId, timePerGifMs / 1000);
}

/**
 * Called by the host (via round:next socket event) to skip the auto-start
 * timer and start the next round immediately.
 */
export async function triggerNextRound(
  io: TypedServer,
  sessionId: string
): Promise<void> {
  const pending = pendingRounds.get(sessionId);
  if (!pending) {
    // No pending round for this session — nothing to do
    return;
  }

  // Cancel the auto-start timer
  clearTimeout(pending.startTimer);
  pendingRounds.delete(sessionId);

  const config = sessionConfigs.get(sessionId);
  const timePerGifMs = config?.timePerGifMs ?? 60_000;

  try {
    await startRound(io, pending.nextRoundId, pending.lobbyId, timePerGifMs / 1000);
  } catch (err) {
    console.error('Error triggering next round:', err);
  }
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
  // Clean up session config
  sessionConfigs.delete(sessionId);

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
  for (const pending of pendingRounds.values()) {
    clearTimeout(pending.startTimer);
  }
  pendingRounds.clear();
  sessionConfigs.clear();
}
