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
import { botManager } from '../services/botManager';

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
        l.bots_allowed,
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
      botsAllowed: row.bots_allowed,
      created_at: row.created_at,
    }));

    const response: ListLobbiesResponse = { lobbies };
    res.status(200).json(response);
  } catch (error) {
    console.error('List lobbies error:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

// GET /api/lobbies/active
// Check if the current player is in an active (in_session) lobby
router.get('/active', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const playerResult = await pool.query(
      'SELECT id FROM players WHERE supabase_user_id = $1',
      [req.user.id]
    );
    if (playerResult.rows.length === 0) {
      res.status(200).json({ activeLobby: null });
      return;
    }

    const playerId = playerResult.rows[0].id;

    const result = await pool.query(
      `SELECT l.id, l.join_code, l.host_id
         FROM lobby_players lp
         JOIN lobbies l ON l.id = lp.lobby_id
        WHERE lp.player_id = $1 AND l.status = 'in_session'
        LIMIT 1`,
      [playerId]
    );

    if (result.rows.length === 0) {
      res.status(200).json({ activeLobby: null });
      return;
    }

    res.status(200).json({
      activeLobby: {
        id: result.rows[0].id,
        joinCode: result.rows[0].join_code,
        hostId: result.rows[0].host_id,
      },
    });
  } catch (error) {
    console.error('Active lobby check error:', error);
    res.status(200).json({ activeLobby: null });
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

    // Remove player from any existing waiting/closed lobbies (one lobby at a time rule)
    await pool.query(
      `DELETE FROM lobby_players
        WHERE player_id = $1
          AND lobby_id IN (
            SELECT id FROM lobbies WHERE status IN ('waiting', 'closed')
          )`,
      [playerId]
    );

    const joinCode = await generateUniqueJoinCode();

    // Accept optional botsAllowed param (defaults to true)
    const botsAllowed = req.body.botsAllowed !== false;

    // Create lobby and add host as first player in a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lobbyResult = await client.query(
        `INSERT INTO lobbies (join_code, host_id, status, bots_allowed)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [joinCode, playerId, LobbyStatus.Waiting, botsAllowed]
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

    // Remove player from any existing waiting/closed lobbies (one lobby at a time rule)
    await pool.query(
      `DELETE FROM lobby_players
        WHERE player_id = $1
          AND lobby_id IN (
            SELECT id FROM lobbies WHERE status IN ('waiting', 'closed')
          )`,
      [playerId]
    );

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

// PATCH /api/lobbies/:id/bots-allowed
// Toggle bots_allowed setting. Only the host can toggle, only when lobby is waiting.
router.patch('/:id/bots-allowed', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const { botsAllowed } = req.body;

    if (typeof botsAllowed !== 'boolean') {
      res.status(400).json({ error: 'bad_request', message: 'botsAllowed must be a boolean' });
      return;
    }

    // Look up the player record
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE supabase_user_id = $1',
      [req.user.id]
    );

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Player profile not found' });
      return;
    }

    const playerId = playerResult.rows[0].id;

    // Fetch the lobby
    const lobbyResult = await pool.query(
      'SELECT * FROM lobbies WHERE id = $1',
      [id]
    );

    if (lobbyResult.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Lobby not found' });
      return;
    }

    const lobby = lobbyResult.rows[0];

    // Only the host can toggle
    if (lobby.host_id !== playerId) {
      res.status(403).json({ error: 'forbidden', message: 'Only the host can change bot settings' });
      return;
    }

    // Only when lobby is waiting
    if (lobby.status !== 'waiting') {
      res.status(409).json({ error: 'conflict', message: 'Can only change bot settings while lobby is waiting' });
      return;
    }

    // Update the setting
    await pool.query(
      'UPDATE lobbies SET bots_allowed = $1 WHERE id = $2',
      [botsAllowed, id]
    );

    // If toggling from true to false, remove bots from the lobby
    if (!botsAllowed && lobby.bots_allowed === true) {
      await botManager.removeBotsFromLobby(id);
    }

    res.status(200).json({ success: true, botsAllowed });
  } catch (error) {
    console.error('Toggle bots-allowed error:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

// POST /api/lobbies/:id/fill-bots
// Instantly fill a lobby with bots (up to 5 total players). Host only.
router.post('/:id/fill-bots', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    // Look up the player record
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE supabase_user_id = $1',
      [req.user.id]
    );
    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Player profile not found' });
      return;
    }
    const playerId = playerResult.rows[0].id;

    // Fetch the lobby
    const lobbyResult = await pool.query('SELECT * FROM lobbies WHERE id = $1', [id]);
    if (lobbyResult.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Lobby not found' });
      return;
    }
    const lobby = lobbyResult.rows[0];

    if (lobby.host_id !== playerId) {
      res.status(403).json({ error: 'forbidden', message: 'Only the host can fill with bots' });
      return;
    }
    if (lobby.status !== 'waiting') {
      res.status(409).json({ error: 'conflict', message: 'Lobby is not in waiting state' });
      return;
    }

    // Count current players
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM lobby_players WHERE lobby_id = $1',
      [id]
    );
    const currentCount = countResult.rows[0].count;
    const botsNeeded = Math.max(0, 5 - currentCount);

    if (botsNeeded === 0) {
      res.status(200).json({ success: true, botsAdded: 0, message: 'Lobby is already full' });
      return;
    }

    // Get available bot player records
    const botsResult = await pool.query(
      `SELECT id, username FROM players
        WHERE is_bot = true
          AND id NOT IN (SELECT player_id FROM lobby_players WHERE lobby_id = $1)
        LIMIT $2`,
      [id, botsNeeded]
    );

    if (botsResult.rows.length === 0) {
      res.status(400).json({ error: 'no_bots', message: 'No bot players available. Run the bot pool seed migration first.' });
      return;
    }

    // Add bots to lobby_players
    for (const bot of botsResult.rows) {
      await pool.query(
        'INSERT INTO lobby_players (lobby_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, bot.id]
      );
    }

    // Broadcast lobby:update so the player list refreshes
    const allPlayersResult = await pool.query(
      `SELECT p.id AS player_id, p.username
         FROM lobby_players lp
         JOIN players p ON p.id = lp.player_id
        WHERE lp.lobby_id = $1
        ORDER BY lp.joined_at ASC`,
      [id]
    );

    // Get host supabase_user_id for the client
    const hostInfoResult = await pool.query(
      `SELECT p.supabase_user_id FROM lobbies l JOIN players p ON p.id = l.host_id WHERE l.id = $1`,
      [id]
    );
    const hostSupabaseId = hostInfoResult.rows[0]?.supabase_user_id ?? '';

    // Import io from the server module isn't ideal in a route, so we use the app's io reference
    const { io } = require('../index');
    if (io) {
      io.to(id).emit('lobby:update', {
        players: allPlayersResult.rows.map((row: any) => ({
          playerId: row.player_id,
          username: row.username,
        })),
        hostSupabaseId,
      });
    }

    res.status(200).json({ success: true, botsAdded: botsResult.rows.length });
  } catch (error) {
    console.error('Fill bots error:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

export default router;
