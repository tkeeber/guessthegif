import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import { createSocket } from '../lib/socket';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  connectToLobby: (lobbyId: string) => Promise<void>;
  disconnect: () => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const currentLobbyRef = useRef<string | null>(null);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setSocket(null);
    setConnected(false);
    currentLobbyRef.current = null;
  }, []);

  const connectToLobby = useCallback(
    async (lobbyId: string) => {
      // If already connected to this lobby, no-op
      if (currentLobbyRef.current === lobbyId && socketRef.current?.connected) {
        return;
      }

      // Disconnect any existing socket first
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }

      const newSocket = await createSocket(lobbyId);
      socketRef.current = newSocket;
      currentLobbyRef.current = lobbyId;
      setSocket(newSocket);

      newSocket.on('connect', () => {
        setConnected(true);
      });

      newSocket.on('disconnect', () => {
        setConnected(false);
      });

      // If socket is already connected (rare race), update state
      if (newSocket.connected) {
        setConnected(true);
      }
    },
    []
  );

  return (
    <SocketContext.Provider value={{ socket, connected, connectToLobby, disconnect }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider');
  return ctx;
}
