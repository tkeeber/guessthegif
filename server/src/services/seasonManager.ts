/**
 * SeasonManager — manages season lifecycle including score tracking,
 * winner detection, season archival, and new season creation.
 *
 * Requirements: 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5
 */

import pool from '../db';
import { Season, SeasonScore } from '../types/entities';
import { TypedServer } from '../socket';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SEASON_WIN_THRESHOLD = 20;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Update season scores for all players who earned points in a session.
 * Points are already tracked per-guess in roundManager's submitGuess
 * (upserted into season_scores). This function is a no-op for the
 * score update itself but checks for a season winner after a session ends.
 *
 * If a player has reached the win threshold, returns their info.
 * Otherwise returns null.
 */
export async function checkForSeasonWinner(
  seasonId: string
): Promise<{ playerId: string; username: string } | null> {
  // Verify the season is still active before checking
  const seasonResult = await pool.query(
    'SELECT is_active FROM seasons WHERE id = $1',
    [seasonId]
  );

  if (seasonResult.rows.length === 0) {
    return null;
  }

  if (!seasonResult.rows[0].is_active) {
    // Season already completed — reject
    return null;
  }

  // Check if any player has reached the win threshold
  const winnerResult = await pool.query(
    `SELECT ss.player_id, p.username, ss.correct_guess_count
       FROM season_scores ss
       JOIN players p ON p.id = ss.player_id
      WHERE ss.season_id = $1
        AND ss.correct_guess_count >= $2
      ORDER BY ss.last_correct_at ASC
      LIMIT 1`,
    [seasonId, SEASON_WIN_THRESHOLD]
  );

  if (winnerResult.rows.length === 0) {
    return null;
  }

  return {
    playerId: winnerResult.rows[0].player_id,
    username: winnerResult.rows[0].username,
  };
}

/**
 * End the current season: archive it with the winner, then create a new
 * season with incremented season_number and zero scores.
 *
 * Broadcasts `season:won` to the lobby room.
 */
export async function endSeason(
  io: TypedServer,
  seasonId: string,
  winnerId: string,
  winnerUsername: string,
  lobbyId: string
): Promise<Season> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Archive the current season
    await client.query(
      `UPDATE seasons
          SET is_active = false,
              ended_at = NOW(),
              winner_id = $1
        WHERE id = $2`,
      [winnerId, seasonId]
    );

    // Create a new season with incremented season_number
    const maxSeasonResult = await client.query(
      'SELECT COALESCE(MAX(season_number), 0) AS max_num FROM seasons'
    );
    const nextSeasonNumber = maxSeasonResult.rows[0].max_num + 1;

    const newSeasonResult = await client.query(
      `INSERT INTO seasons (season_number, is_active)
       VALUES ($1, true)
       RETURNING *`,
      [nextSeasonNumber]
    );

    const newSeason: Season = newSeasonResult.rows[0];

    await client.query('COMMIT');

    // Broadcast season:won to the lobby room
    io.to(lobbyId).emit('season:won', {
      winnerUsername,
    });

    return newSeason;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reject score updates to a completed (inactive) season.
 * Returns true if the season is active and can accept updates,
 * false if it's completed.
 */
export async function isSeasonActive(seasonId: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT is_active FROM seasons WHERE id = $1',
    [seasonId]
  );

  if (result.rows.length === 0) {
    return false;
  }

  return result.rows[0].is_active;
}

/**
 * Get the season scores for a given season.
 */
export async function getSeasonScores(
  seasonId: string
): Promise<SeasonScore[]> {
  const result = await pool.query(
    `SELECT * FROM season_scores
      WHERE season_id = $1
      ORDER BY correct_guess_count DESC, last_correct_at ASC`,
    [seasonId]
  );

  return result.rows;
}
