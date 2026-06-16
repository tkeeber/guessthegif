import { PoolClient } from 'pg';
import pool from '../db';
import { Session, Round, Gif } from '../types/entities';
import { LobbyStatus, SessionStatus, RoundStatus } from '../types/enums';

export interface SessionCreateResult {
  session: Session;
  rounds: Round[];
  firstRoundGifUrl: string;
  gifDurationSeconds: number;
  roundsPerSession: number;
}

const VALID_NUM_GIFS = [3, 5, 10] as const;
const TIME_PER_GIF_MIN = 10;
const TIME_PER_GIF_MAX = 300;

/**
 * Validates that a lobby can start a session and creates the session with the
 * specified number of rounds.
 *
 * Validation:
 * - Lobby must exist
 * - Requesting user must be the host
 * - Lobby must have ≥ 2 players
 * - GIF library must have ≥ numGifs active GIFs
 * - numGifs must be one of [3, 5, 10]
 * - timePerGif must be between 10 and 300 (seconds)
 *
 * Creates:
 * - Gets or creates the current active season
 * - Session record linked to lobby and season
 * - numGifs Round records with distinct random GIFs
 * - Updates lobby status to 'in_session'
 */
export async function startSession(
  lobbyId: string,
  hostPlayerId: string,
  numGifs: number = 3,
  timePerGif: number = 60
): Promise<SessionCreateResult> {
  // Validate numGifs
  if (!(VALID_NUM_GIFS as readonly number[]).includes(numGifs)) {
    throw new SessionError(
      'invalid_config',
      `numGifs must be one of ${VALID_NUM_GIFS.join(', ')}.`
    );
  }

  // Validate timePerGif
  if (timePerGif < TIME_PER_GIF_MIN || timePerGif > TIME_PER_GIF_MAX) {
    throw new SessionError(
      'invalid_config',
      `timePerGif must be between ${TIME_PER_GIF_MIN} and ${TIME_PER_GIF_MAX} seconds.`
    );
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Validate lobby exists and user is host
    const lobbyResult = await client.query(
      'SELECT * FROM lobbies WHERE id = $1 FOR UPDATE',
      [lobbyId]
    );

    if (lobbyResult.rows.length === 0) {
      throw new SessionError('not_found', 'Lobby not found.');
    }

    const lobby = lobbyResult.rows[0];

    if (lobby.host_id !== hostPlayerId) {
      throw new SessionError('not_authorized', 'Only the host can start a session.');
    }

    if (lobby.status === LobbyStatus.InSession) {
      throw new SessionError('lobby_in_session', 'Session is already in progress.');
    }

    // 2. Validate ≥ 2 players in lobby
    const playerCountResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM lobby_players WHERE lobby_id = $1',
      [lobbyId]
    );

    const playerCount = playerCountResult.rows[0].count;
    if (playerCount < 2) {
      throw new SessionError(
        'insufficient_players',
        'Lobby needs at least 2 players to start.'
      );
    }

    // 3. Validate enough active GIFs and select distinct random ones
    const gifsResult = await client.query(
      'SELECT * FROM gifs WHERE is_active = true ORDER BY RANDOM() LIMIT $1',
      [numGifs]
    );

    if (gifsResult.rows.length < numGifs) {
      throw new SessionError(
        'insufficient_gifs',
        'Not enough GIFs in the library to start a session.'
      );
    }

    const selectedGifs: Gif[] = gifsResult.rows;

    // 4. Get or create the current active season
    const seasonId = await getOrCreateActiveSeason(client);

    // 5. Create Session record
    const sessionResult = await client.query(
      `INSERT INTO sessions (lobby_id, season_id, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [lobbyId, seasonId, SessionStatus.Active]
    );

    const session: Session = sessionResult.rows[0];

    // 6. Create numGifs Round records
    const rounds: Round[] = [];
    for (let i = 0; i < numGifs; i++) {
      const roundResult = await client.query(
        `INSERT INTO rounds (session_id, gif_id, round_number, status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [session.id, selectedGifs[i].id, i + 1, RoundStatus.Pending]
      );
      rounds.push(roundResult.rows[0]);
    }

    // 7. Set lobby status to 'in_session'
    await client.query(
      'UPDATE lobbies SET status = $1 WHERE id = $2',
      [LobbyStatus.InSession, lobbyId]
    );

    await client.query('COMMIT');

    return {
      session,
      rounds,
      firstRoundGifUrl: selectedGifs[0].gif_url,
      gifDurationSeconds: timePerGif,
      roundsPerSession: numGifs,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Gets the current active season, or creates one if none exists.
 */
async function getOrCreateActiveSeason(client: PoolClient): Promise<string> {
  const activeSeasonResult = await client.query(
    'SELECT id FROM seasons WHERE is_active = true LIMIT 1'
  );

  if (activeSeasonResult.rows.length > 0) {
    return activeSeasonResult.rows[0].id;
  }

  // Determine next season number
  const maxSeasonResult = await client.query(
    'SELECT COALESCE(MAX(season_number), 0) AS max_num FROM seasons'
  );
  const nextSeasonNumber = maxSeasonResult.rows[0].max_num + 1;

  const newSeasonResult = await client.query(
    `INSERT INTO seasons (season_number, is_active)
     VALUES ($1, true)
     RETURNING id`,
    [nextSeasonNumber]
  );

  return newSeasonResult.rows[0].id;
}

/**
 * Custom error class for session-related errors with a machine-readable code.
 */
export class SessionError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SessionError';
  }
}
