import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { getSupabase } from '../supabaseClient';
import pool from '../db';
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../types/websocket';
import { registerSessionHandler } from './handlers/sessionHandler';
import { registerGuessHandler } from './handlers/guessHandler';
import { registerChatHandler } from './handlers/chatHandler';

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface AuthenticatedSocket extends TypedSocket {
  data: {
    playerId: string;
    supabaseUserId: string;
    email: string;
  };
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

/** Per-player rate limit buckets: Map<playerId, Map<eventType, bucket>> */
const rateLimits = new Map<string, Map<string, RateLimitBucket>>();

const RATE_LIMIT_WINDOW_MS = 10_000; // 10 seconds

const RATE_LIMITS: Record<string, number> = {
  'guess:submit': 10,   // 10 guesses per 10s
  'chat:message': 5,    // 5 chat messages per 10s
};

/**
 * Returns true if the action is allowed, false if rate-limited.
 */
export function checkRateLimit(playerId: string, event: string): boolean {
  const maxCount = RATE_LIMITS[event];
  if (maxCount === undefined) return true; // no limit for this event

  if (!rateLimits.has(playerId)) {
    rateLimits.set(playerId, new Map());
  }
  const playerBuckets = rateLimits.get(playerId)!;

  const now = Date.now();
  let bucket = playerBuckets.get(event);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    playerBuckets.set(event, bucket);
  }

  bucket.count++;
  return bucket.count <= maxCount;
}

// ---------------------------------------------------------------------------
// Disconnect handling
// ---------------------------------------------------------------------------

const DISCONNECT_TIMEOUT_MS = 30_000; // 30 seconds

/** Pending disconnect timers: Map<playerId, timeoutHandle> */
const disconnectTimers = new Map<string, NodeJS.Timeout>();

/**
 * Broadcast the current player list for a lobby to all connected sockets in that room.
 */
async function broadcastLobbyUpdate(io: TypedServer, lobbyId: string): Promise<void> {
  const result = await pool.query(
    `SELECT p.id AS player_id, p.username,
            CASE WHEN l.host_id = p.id THEN true ELSE false END AS is_host
       FROM lobby_players lp
       JOIN players p ON p.id = lp.player_id
       JOIN lobbies l ON l.id = lp.lobby_id
      WHERE lp.lobby_id = $1
      ORDER BY lp.joined_at ASC`,
    [lobbyId]
  );

  // Get the host's supabase_user_id so the client can match it
  const hostResult = await pool.query(
    `SELECT p.supabase_user_id
       FROM lobbies l
       JOIN players p ON p.id = l.host_id
      WHERE l.id = $1`,
    [lobbyId]
  );
  const hostSupabaseId = hostResult.rows[0]?.supabase_user_id ?? '';

  io.to(lobbyId).emit('lobby:update', {
    players: result.rows.map((row) => ({
      playerId: row.player_id,
      username: row.is_host ? `${row.username} (host)` : row.username,
    })),
    hostSupabaseId,
  } as any);
}

/**
 * Initialize Socket.IO on the HTTP server with Supabase JWT authentication
 * on handshake, room management, rate limiting, and disconnect handling.
 */
export function initSocketServer(httpServer: HttpServer): TypedServer {
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:5173'];

  const io: TypedServer = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  // Supabase JWT authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;

      if (!token) {
        return next(new Error('not_authenticated'));
      }

      const { data, error } = await getSupabase().auth.getUser(token);

      if (error || !data.user) {
        return next(new Error('not_authenticated'));
      }

      // Look up the player record
      const playerResult = await pool.query(
        'SELECT id FROM players WHERE supabase_user_id = $1',
        [data.user.id]
      );

      if (playerResult.rows.length === 0) {
        return next(new Error('not_authenticated'));
      }

      // Attach player info to socket data
      socket.data = {
        playerId: playerResult.rows[0].id,
        supabaseUserId: data.user.id,
        email: data.user.email || '',
      };

      next();
    } catch {
      next(new Error('not_authenticated'));
    }
  });

  io.on('connection', (socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const playerId = authSocket.data.playerId;

    // If this player had a pending disconnect timer, cancel it (reconnected in time)
    const existingTimer = disconnectTimers.get(playerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      disconnectTimers.delete(playerId);
    }

    // Join lobby room based on query param
    const lobbyId = socket.handshake.query.lobbyId as string | undefined;
    if (lobbyId) {
      socket.join(lobbyId);

      // Broadcast updated player list to everyone in the lobby
      broadcastLobbyUpdate(io, lobbyId).catch((err) =>
        console.error('lobby:update broadcast error:', err)
      );
    }

    // Register event handlers
    registerSessionHandler(io, authSocket);
    registerGuessHandler(io, authSocket);
    registerChatHandler(io, authSocket);

    // Handle disconnect
    socket.on('disconnect', () => {
      // Broadcast updated player list immediately
      if (lobbyId) {
        broadcastLobbyUpdate(io, lobbyId).catch((err) =>
          console.error('lobby:update broadcast error on disconnect:', err)
        );
      }

      // Start a 30-second timer. If the player doesn't reconnect, remove them.
      const timer = setTimeout(async () => {
        disconnectTimers.delete(playerId);

        try {
          // Look up the player's username for the broadcast
          const playerResult = await pool.query(
            'SELECT username FROM players WHERE id = $1',
            [playerId]
          );
          if (playerResult.rows.length === 0) return;
          const username = playerResult.rows[0].username;

          // Broadcast player:disconnected to the lobby room
          if (lobbyId) {
            io.to(lobbyId).emit('player:disconnected', { username });
          }
        } catch (err) {
          console.error('Disconnect handler error:', err);
        }
      }, DISCONNECT_TIMEOUT_MS);

      disconnectTimers.set(playerId, timer);
    });
  });

  return io;
}

/** Cleanup helper for testing / graceful shutdown */
export function clearAllDisconnectTimers(): void {
  for (const timer of disconnectTimers.values()) {
    clearTimeout(timer);
  }
  disconnectTimers.clear();
  rateLimits.clear();
}
