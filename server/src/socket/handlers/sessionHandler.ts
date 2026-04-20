import pool from '../../db';
import { startSession, SessionError } from '../../services/sessionService';
import { startFirstRound } from '../../services/sessionOrchestrator';
import { TypedServer, AuthenticatedSocket } from '../index';
import { SessionStartPayload, WSErrorPayload } from '../../types/websocket';

/**
 * Register the session:start event handler on a socket.
 *
 * Flow:
 * 1. Host emits `session:start` from the lobby
 * 2. Server resolves the player's lobby membership
 * 3. Calls sessionService.startSession to validate and create session + rounds
 * 4. Delegates to sessionOrchestrator.startFirstRound to activate and broadcast the first round
 */
export function registerSessionHandler(
  io: TypedServer,
  socket: AuthenticatedSocket
): void {
  socket.on('session:start', async (_payload: SessionStartPayload) => {
    try {
      const playerId = socket.data.playerId;

      // Find the lobby this player is the host of and is currently in
      const lobbyResult = await pool.query(
        `SELECT l.id FROM lobbies l
         JOIN lobby_players lp ON lp.lobby_id = l.id
         WHERE l.host_id = $1 AND lp.player_id = $1 AND l.status = 'waiting'
         LIMIT 1`,
        [playerId]
      );

      if (lobbyResult.rows.length === 0) {
        const errorPayload: WSErrorPayload = {
          code: 'not_authorized',
          message: 'You are not the host of any waiting lobby.',
          recoverable: false,
        };
        socket.emit('error' as any, errorPayload);
        return;
      }

      const lobbyId = lobbyResult.rows[0].id;

      // Start the session (validates players, GIFs, creates session + rounds)
      const result = await startSession(lobbyId, playerId);

      // Use the orchestrator to start the first round (activates, broadcasts, starts timer)
      await startFirstRound(io, result.session.id, lobbyId);
    } catch (error) {
      if (error instanceof SessionError) {
        const errorPayload: WSErrorPayload = {
          code: error.code,
          message: error.message,
          recoverable: false,
        };
        socket.emit('error' as any, errorPayload);
      } else {
        console.error('session:start error:', error);
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
