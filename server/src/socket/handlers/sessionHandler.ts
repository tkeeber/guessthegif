import pool from '../../db';
import { startSession, SessionError } from '../../services/sessionService';
import { startFirstRound, triggerNextRound } from '../../services/sessionOrchestrator';
import { TypedServer, AuthenticatedSocket } from '../index';
import { SessionStartPayload, WSErrorPayload } from '../../types/websocket';

/**
 * Register the session:start event handler on a socket.
 */
export function registerSessionHandler(
  io: TypedServer,
  socket: AuthenticatedSocket
): void {
  socket.on('session:start', async (payload: SessionStartPayload) => {
    console.log('[session:start] Received from player:', socket.data.playerId);
    console.log('[session:start] Socket rooms:', Array.from(socket.rooms));

    // Extract config with defaults
    const timePerGif = payload.timePerGif ?? 60;
    const numGifs = payload.numGifs ?? 3;

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

      console.log('[session:start] Lobby query result rows:', lobbyResult.rows.length);

      if (lobbyResult.rows.length === 0) {
        console.log('[session:start] ERROR: Player is not host of any waiting lobby');
        const errorPayload: WSErrorPayload = {
          code: 'not_authorized',
          message: 'You are not the host of any waiting lobby.',
          recoverable: false,
        };
        socket.emit('error' as any, errorPayload);
        return;
      }

      const lobbyId = lobbyResult.rows[0].id;
      console.log('[session:start] Found lobby:', lobbyId);

      // Start the session (validates players, GIFs, creates session + rounds)
      console.log('[session:start] Calling startSession...');
      const result = await startSession(lobbyId, playerId, numGifs, timePerGif);
      console.log('[session:start] Session created:', result.session.id, 'with', result.rounds.length, 'rounds');

      // Use the orchestrator to start the first round
      console.log('[session:start] Calling startFirstRound...');
      await startFirstRound(io, result.session.id, lobbyId, timePerGif * 1000, numGifs);
      console.log('[session:start] First round started successfully');

    } catch (error) {
      if (error instanceof SessionError) {
        console.log('[session:start] SessionError:', error.code, error.message);
        const errorPayload: WSErrorPayload = {
          code: error.code,
          message: error.message,
          recoverable: false,
        };
        socket.emit('error' as any, errorPayload);
      } else {
        console.error('[session:start] Unexpected error:', error);
        const errorPayload: WSErrorPayload = {
          code: 'server_error',
          message: 'An unexpected error occurred.',
          recoverable: false,
        };
        socket.emit('error' as any, errorPayload);
      }
    }
  });

  // -------------------------------------------------------------------------
  // round:next — host skips the auto-start timer to begin the next round now
  // -------------------------------------------------------------------------
  socket.on('round:next', async (_payload: Record<string, never>) => {
    const playerId = socket.data.playerId;
    console.log('[round:next] Received from player:', playerId);

    try {
      // Find the active session for a lobby where this player is the host
      const result = await pool.query(
        `SELECT s.id AS session_id
           FROM sessions s
           JOIN lobbies l ON l.id = s.lobby_id
          WHERE l.host_id = $1
            AND s.status = 'active'
          ORDER BY s.started_at DESC
          LIMIT 1`,
        [playerId]
      );

      console.log('[round:next] Session query rows:', result.rows.length);

      if (result.rows.length === 0) {
        console.log('[round:next] No active session found for this host — ignoring');
        return;
      }

      const sessionId = result.rows[0].session_id;
      console.log('[round:next] Triggering next round for session:', sessionId);
      await triggerNextRound(io, sessionId);
      console.log('[round:next] triggerNextRound completed');
    } catch (err) {
      console.error('[round:next] Error:', err);
    }
  });
}
