/**
 * WebSocket handler for `chat:message` events.
 *
 * Flow:
 * 1. Player emits `chat:message` with { text }
 * 2. Handler resolves the player's active round (via their lobby → session → active round)
 * 3. Records the feed message in the feed_messages table
 * 4. Broadcasts `chat:new` to all players in the lobby room
 *
 * Requirements: 8.6, 8.7
 */

import pool from '../../db';
import { TypedServer, AuthenticatedSocket, checkRateLimit } from '../index';
import { ChatMessagePayload, WSErrorPayload } from '../../types/websocket';
import { RoundStatus, FeedMessageType } from '../../types/enums';

export function registerChatHandler(
  io: TypedServer,
  socket: AuthenticatedSocket
): void {
  socket.on('chat:message', async (payload: ChatMessagePayload) => {
    try {
      const playerId = socket.data.playerId;
      const text = payload.text;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        const errorPayload: WSErrorPayload = {
          code: 'invalid_input',
          message: 'Chat message cannot be empty.',
          recoverable: true,
        };
        socket.emit('error' as any, errorPayload);
        return;
      }

      // Rate limit check
      if (!checkRateLimit(playerId, 'chat:message')) {
        const errorPayload: WSErrorPayload = {
          code: 'rate_limited',
          message: 'Too many messages. Please slow down.',
          recoverable: true,
        };
        socket.emit('error' as any, errorPayload);
        return;
      }

      // Find the player's lobby with an active session
      const lobbyResult = await pool.query(
        `SELECT lp.lobby_id
           FROM lobby_players lp
           JOIN lobbies l ON l.id = lp.lobby_id
          WHERE lp.player_id = $1 AND l.status = 'in_session'
          LIMIT 1`,
        [playerId]
      );

      if (lobbyResult.rows.length === 0) {
        const errorPayload: WSErrorPayload = {
          code: 'round_not_active',
          message: 'You are not in an active session.',
          recoverable: false,
        };
        socket.emit('error' as any, errorPayload);
        return;
      }

      const lobbyId = lobbyResult.rows[0].lobby_id;

      // Find the active round for this lobby's session
      const roundResult = await pool.query(
        `SELECT r.id
           FROM rounds r
           JOIN sessions s ON s.id = r.session_id
          WHERE s.lobby_id = $1
            AND r.status IN ($2, $3)
          ORDER BY r.round_number ASC
          LIMIT 1`,
        [lobbyId, RoundStatus.Active, RoundStatus.ClueGiven]
      );

      if (roundResult.rows.length === 0) {
        const errorPayload: WSErrorPayload = {
          code: 'round_not_active',
          message: 'No active round to send a chat message to.',
          recoverable: false,
        };
        socket.emit('error' as any, errorPayload);
        return;
      }

      const roundId = roundResult.rows[0].id;

      // Record the feed message in the database
      const feedResult = await pool.query(
        `INSERT INTO feed_messages (round_id, player_id, type, text)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [roundId, playerId, FeedMessageType.Chat, text.trim()]
      );
      const feedMessage = feedResult.rows[0];

      // Look up the player's username
      const playerResult = await pool.query(
        'SELECT username FROM players WHERE id = $1',
        [playerId]
      );
      const username: string = playerResult.rows[0].username;

      // Broadcast chat:new to all players in the lobby room
      io.to(lobbyId).emit('chat:new', {
        username,
        text: text.trim(),
        timestamp: feedMessage.created_at,
      });
    } catch (error) {
      console.error('chat:message error:', error);
      const errorPayload: WSErrorPayload = {
        code: 'server_error',
        message: 'An unexpected error occurred.',
        recoverable: false,
      };
      socket.emit('error' as any, errorPayload);
    }
  });
}
