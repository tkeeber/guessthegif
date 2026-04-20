import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import pool from '../db';
import {
  ListLobbiesResponse,
  CreateLobbyResponse,
  JoinLobbyResponse,
  LobbyWithHost,
} from '../types';
import { LobbyStatus } from '../types';

const router = Router();

/**
 * Generate a unique 6-character alphanumeric join code.
 * Retries if the generated code already exists in the database.
 */
async function generateUniqueJoinCode(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const codeLength = 6;
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let code = '';
    for (let i = 0; i < codeLength; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const existing = await pool.query(
      'SELECT 1 FROM lobbies WHERE join_code = $1',
      [code]
    );

    if (existing.rows.length === 0) {
      return code;
    }
  }

  throw new Error('Failed to generate unique join code after maximum attempts');
}

// GET /api/lobbies
// List available lobbies with status='waiting', include host username and player count
router.get('/', requireAuth, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT
        l.id,
        l.join_code,
        l.host_id,
        p.username AS host_username,
        l.status,
        l.created_at,
        COUNT(lp.player_id)::int AS player_count
      FROM lobbies l
      JOIN players p ON p.id = l.host_id
      LEFT JOIN lobby_players lp ON lp.lobby_id = l.id
      WHERE l.status = $1
      GROUP BY l.id, p.username
      ORDER BY l.created_at DESC`,
      [LobbyStatus.Waiting]
    );

    const lobbies: LobbyWithHost[] = result.rows.map((row) => ({
      id: row.id,
      join_code: row.join_code,
      host_id: row.host_id,
      hostUsername: row.host_username,
      status: row.status,
      playerCount: row.player_count,
      created_at: row.created_at,
    }));

    const response: ListLobbiesResponse = { lobbies };
    res.status(200).json(response);
  } catch (error) {
    console.error('List lobbies error:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

// POST /api/lobbies
// Create a new lobby with a unique 6-char join code, add host as first player
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    // Look up the player record for this Supabase user
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE supabase_user_id = $1',
      [req.user.id]
    );

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Player profile not found. Please complete registration first.' });
      return;
    }

    const playerId = playerResult.rows[0].id;

    const joinCode = await generateUniqueJoinCode();

    // Create lobby and add host as first player in a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lobbyResult = await client.query(
        `INSERT INTO lobbies (join_code, host_id, status)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [joinCode, playerId, LobbyStatus.Waiting]
      );

      const lobby = lobbyResult.rows[0];

      // Add host as first player in lobby_players
      await client.query(
        `INSERT INTO lobby_players (lobby_id, player_id)
         VALUES ($1, $2)`,
        [lobby.id, playerId]
      );

      await client.query('COMMIT');

      const response: CreateLobbyResponse = { lobby };
      res.status(201).json(response);
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create lobby error:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

// POST /api/lobbies/:code/join
// Join a lobby by its join code. Reject if lobby is in_session (409).
router.post('/:code/join', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const { code } = req.params;

    // Look up the player record for this Supabase user
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE supabase_user_id = $1',
      [req.user.id]
    );

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Player profile not found. Please complete registration first.' });
      return;
    }

    const playerId = playerResult.rows[0].id;

    // Find lobby by join code
    const lobbyResult = await pool.query(
      'SELECT * FROM lobbies WHERE join_code = $1',
      [code.toUpperCase()]
    );

    if (lobbyResult.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Lobby not found' });
      return;
    }

    const lobby = lobbyResult.rows[0];

    // Reject if lobby is in an active session
    if (lobby.status === LobbyStatus.InSession) {
      res.status(409).json({ error: 'conflict', message: 'Session is already in progress.' });
      return;
    }

    // Reject if lobby is closed
    if (lobby.status === LobbyStatus.Closed) {
      res.status(409).json({ error: 'conflict', message: 'Lobby is closed.' });
      return;
    }

    // Check if player is already in the lobby
    const existingPlayer = await pool.query(
      'SELECT 1 FROM lobby_players WHERE lobby_id = $1 AND player_id = $2',
      [lobby.id, playerId]
    );

    if (existingPlayer.rows.length > 0) {
      // Player already in lobby, return the lobby
      const response: JoinLobbyResponse = { lobby };
      res.status(200).json(response);
      return;
    }

    // Add player to lobby
    await pool.query(
      `INSERT INTO lobby_players (lobby_id, player_id)
       VALUES ($1, $2)`,
      [lobby.id, playerId]
    );

    const response: JoinLobbyResponse = { lobby };
    res.status(200).json(response);
  } catch (error) {
    console.error('Join lobby error:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

export default router;
