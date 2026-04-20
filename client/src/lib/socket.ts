import { io, Socket } from 'socket.io-client';
import { supabase } from './supabase';

/**
 * Create a Socket.IO client connected to the backend.
 * Passes the Supabase access token in handshake auth and the lobbyId as a query param.
 */
export async function createSocket(lobbyId: string): Promise<Socket> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const socket = io({
    auth: {
      token: session?.access_token ?? '',
    },
    query: {
      lobbyId,
    },
    // In dev, Vite proxy handles /socket.io → backend
    // In prod, same origin serves both
    transports: ['websocket', 'polling'],
  });

  return socket;
}
