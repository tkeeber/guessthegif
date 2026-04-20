/**
 * WebSocket handler for `guess:submit` events.
 *
 * Flow:
 * 1. Player emits `guess:submit` with { text }
 * 2. Handler resolves the player's active round (via their lobby → session → active round)
 * 3. Delegates to RoundManager.submitGuess for matching, recording, and broadcasting
 */

import pool from '../../db';
import { submitGuess, RoundError } from '../../services/roundManager';
import { TypedServer, AuthenticatedSocket, checkRateLimit } from '../index';
import { GuessSubmitPayload, WSErrorPayload } from '../../types/websocket';
import { RoundStatus } from '../../types/enums';

export function registerGuessHandler(
  io: TypedServer,
  socket: AuthenticatedSocket
): void {
  socket.on('guess:submit', async (payload: GuessSubmitPayload) => {
    try {
      const playerId = socket.data.playerId;
      const text = payload.text;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        const errorPayload: WSErrorPayload = {
          code: 'invalid_input',
          message: 'Guess text cannot be empty.',
          recoverable: true,
        };
        socket.emit('error' as any, errorPayload);
        return;
      }

      // Rate limit check
      if (!checkRateLimit(playerId, 'guess:submit')) {
        const errorPayload: WSErrorPayload = {
          code: 'rate_limited',
          message: 'Too many guesses. Please slow down.',
          recoverable: true,
        };
        socket.emit('error' as any, errorPayload);
        return;
      }

      // Find the player's lobby
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
          message: 'No active round to submit a guess to.',
          recoverable: false,
        };
        socket.emit('error' as any, errorPayload);
        return;
      }

      const roundId = roundResult.rows[0].id;

      await submitGuess(io, roundId, playerId, text.trim(), lobbyId);
    } catch (error) {
      if (error instanceof RoundError) {
        const errorPayload: WSErrorPayload = {
          code: error.code,
          message: error.message,
          recoverable: error.code === 'round_not_active',
        };
        socket.emit('error' as any, errorPayload);
      } else {
        console.error('guess:submit error:', error);
        const errorPayload: WSErrorPayload = {
          code: 'server_error',
          message: 'An unexpected error occurred.',
          recoverable: false,
        };
        socket.emit('error' as any, errorPayload);
      }
    }
  });
}
