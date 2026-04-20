/**
 * LeaderboardService — queries season scores and builds ranked leaderboard entries.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.6
 */

import pool from '../db';
import { LeaderboardEntry } from '../types/entities';
import {
  ArchivedSeasonSummary,
  LeaderboardResponse,
  ArchivedSeasonsResponse,
  ArchivedSeasonLeaderboardResponse,
} from '../types/api';
import { TypedServer } from '../socket';

// ---------------------------------------------------------------------------
// Current season leaderboard
// ---------------------------------------------------------------------------

/**
 * Get the ranked leaderboard for the current active season.
 * Sorted by correct_guess_count DESC, tiebreak by last_correct_at ASC.
 */
export async function getCurrentSeasonLeaderboard(): Promise<LeaderboardResponse> {
  // Find the active season
  const seasonResult = await pool.query(
    'SELECT id, season_number FROM seasons WHERE is_active = true LIMIT 1'
  );

  if (seasonResult.rows.length === 0) {
    return { seasonId: '', seasonNumber: 0, entries: [] };
  }

  const season = seasonResult.rows[0];
  const entries = await getRankings(season.id);

  return {
    seasonId: season.id,
    seasonNumber: season.season_number,
    entries,
  };
}

/**
 * Get ranked leaderboard entries for a given season.
 */
export async function getRankings(seasonId: string): Promise<LeaderboardEntry[]> {
  const result = await pool.query(
    `SELECT ss.player_id, p.username, ss.correct_guess_count, ss.last_correct_at
       FROM season_scores ss
       JOIN players p ON p.id = ss.player_id
      WHERE ss.season_id = $1
      ORDER BY ss.correct_guess_count DESC, ss.last_correct_at ASC`,
    [seasonId]
  );

  return result.rows.map((row, index) => ({
    rank: index + 1,
    playerId: row.player_id,
    username: row.username,
    correctGuessCount: row.correct_guess_count,
  }));
}

// ---------------------------------------------------------------------------
// Archived seasons
// ---------------------------------------------------------------------------

/**
 * Get a list of all archived (completed) seasons.
 */
export async function getArchivedSeasons(): Promise<ArchivedSeasonsResponse> {
  const result = await pool.query(
    `SELECT s.id, s.season_number, s.started_at, s.ended_at, p.username AS winner_username
       FROM seasons s
       LEFT JOIN players p ON p.id = s.winner_id
      WHERE s.is_active = false AND s.ended_at IS NOT NULL
      ORDER BY s.season_number DESC`
  );

  const seasons: ArchivedSeasonSummary[] = result.rows.map((row) => ({
    id: row.id,
    seasonNumber: row.season_number,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    winnerUsername: row.winner_username ?? null,
  }));

  return { seasons };
}

/**
 * Get the leaderboard for a specific archived season.
 */
export async function getArchivedSeasonLeaderboard(
  seasonId: string
): Promise<ArchivedSeasonLeaderboardResponse | null> {
  // Fetch the season info
  const seasonResult = await pool.query(
    `SELECT s.id, s.season_number, s.started_at, s.ended_at, p.username AS winner_username
       FROM seasons s
       LEFT JOIN players p ON p.id = s.winner_id
      WHERE s.id = $1`,
    [seasonId]
  );

  if (seasonResult.rows.length === 0) {
    return null;
  }

  const row = seasonResult.rows[0];
  const season: ArchivedSeasonSummary = {
    id: row.id,
    seasonNumber: row.season_number,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    winnerUsername: row.winner_username ?? null,
  };

  const entries = await getRankings(seasonId);

  return { season, entries };
}

// ---------------------------------------------------------------------------
// Real-time broadcast
// ---------------------------------------------------------------------------

/**
 * Broadcast a leaderboard:update event to all connected clients.
 * Called after season scores change (e.g. after a correct guess or session end).
 */
export async function broadcastLeaderboardUpdate(io: TypedServer): Promise<void> {
  const leaderboard = await getCurrentSeasonLeaderboard();

  io.emit('leaderboard:update', {
    entries: leaderboard.entries.map((e) => ({
      rank: e.rank,
      username: e.username,
      correctGuessCount: e.correctGuessCount,
    })),
  });
}
