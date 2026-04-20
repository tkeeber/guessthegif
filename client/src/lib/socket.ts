import { io, Socket } from 'socket.io-client';
import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Create a Socket.IO client connected to the backend.
 * Passes the Supabase access token in handshake auth and the lobbyId as a query param.
 * In production, connects to the Render backend URL (VITE_API_BASE_URL).
 * In dev, the Vite proxy handles /socket.io → backend.
 */
export async function createSocket(lobbyId: string): Promise<Socket> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const socket = io(API_BASE_URL || undefined, {
    auth: {
      token: session?.access_token ?? '',
    },
    query: {
      lobbyId,
    },
    transports: ['websocket', 'polling'],
  });

  return socket;
}
