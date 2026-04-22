import { useEffect, useState, useRef, useCallback } from 'react';
import { createSocket } from '../lib/socket';
import type { Socket } from 'socket.io-client';

interface LobbyPlayer {
  playerId: string;
  username: string;
}

interface LobbyPageProps {
  lobbyId: string;
  joinCode: string;
  /** The host's player ID (from the lobby record). Empty string if current user is host. */
  hostId: string;
  currentUserId: string;
  onBack: () => void;
  onGameStart: (lobbyId: string) => void;
}

export default function LobbyPage({
  lobbyId,
  joinCode,
  hostId,
  currentUserId,
  onBack,
  onGameStart,
}: LobbyPageProps) {
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [isHost, setIsHost] = useState(!hostId);
  const socketRef = useRef<Socket | null>(null);

  const connectSocket = useCallback(async () => {
    try {
      const socket = await createSocket(lobbyId);
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        setError('');
      });

      socket.on('disconnect', () => {
        setConnected(false);
      });

      socket.on('lobby:update', (payload: { players: LobbyPlayer[]; hostSupabaseId?: string }) => {
        setPlayers(payload.players);
        if (payload.hostSupabaseId) {
          setIsHost(payload.hostSupabaseId === currentUserId);
        }
      });

      socket.on('round:start', () => {
        onGameStart(lobbyId);
      });

      socket.on('connect_error', (err: Error) => {
        setError(err.message || 'Connection failed');
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [lobbyId, onGameStart]);

  useEffect(() => {
    connectSocket();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connectSocket]);

  function handleStart() {
    if (!socketRef.current) return;
    setStarting(true);
    setError('');
    socketRef.current.emit('session:start', {});

    // Listen for errors from the server
    socketRef.current.once('error', (payload: { message?: string }) => {
      setError(payload.message ?? 'Failed to start session');
      setStarting(false);
    });
  }

  const canStart = isHost && players.length >= 2 && !starting;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <button onClick={onBack} style={styles.backBtn}>
          ← Back to lobbies
        </button>

        <h1 style={styles.title}>Lobby</h1>

        <div style={styles.codeBox}>
          <span style={styles.codeLabel}>Join Code</span>
          <span style={styles.code}>{joinCode}</span>
        </div>

        <p style={styles.status}>
          {connected ? '🟢 Connected' : '🔴 Connecting…'}
        </p>

        {error && <p style={styles.error}>{error}</p>}

        <h2 style={styles.sectionTitle}>
          Players ({players.length})
        </h2>

        {players.length === 0 ? (
          <p style={styles.muted}>Waiting for players…</p>
        ) : (
          <ul style={styles.list}>
            {players.map((p) => (
              <li key={p.playerId} style={styles.listItem}>
                {p.username}
              </li>
            ))}
          </ul>
        )}

        {isHost && players.length < 2 && (
          <p style={styles.muted}>Need at least 2 players to start.</p>
        )}

        {isHost && (
          <button
            onClick={handleStart}
            disabled={!canStart}
            style={{
              ...styles.startBtn,
              opacity: canStart ? 1 : 0.5,
              cursor: canStart ? 'pointer' : 'not-allowed',
            }}
          >
            {starting ? 'Starting…' : 'Start Game'}
          </button>
        )}

        {!isHost && (
          <p style={styles.muted}>Waiting for the host to start the game…</p>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    minHeight: '100vh',
    padding: 16,
    fontFamily: 'system-ui, sans-serif',
  },
  container: {
    width: '100%',
    maxWidth: 480,
    paddingTop: 24,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#4f46e5',
    cursor: 'pointer',
    fontSize: 14,
    padding: 0,
    marginBottom: 12,
  },
  title: { margin: '0 0 12px' },
  codeBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    borderRadius: 8,
    background: '#f5f3ff',
    border: '1px solid #ddd6fe',
    marginBottom: 12,
  },
  codeLabel: { fontSize: 14, color: '#666' },
  code: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: 4,
    color: '#4f46e5',
  },
  status: { fontSize: 14, margin: '0 0 12px' },
  error: { color: '#d32f2f', fontSize: 14, margin: '0 0 12px' },
  sectionTitle: { fontSize: 18, margin: '0 0 8px' },
  muted: { color: '#888', fontSize: 14, margin: '4px 0 12px' },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 16px',
  },
  listItem: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #e0e0e0',
    marginBottom: 6,
    fontSize: 16,
  },
  startBtn: {
    padding: '14px 0',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 6,
    border: 'none',
    background: '#16a34a',
    color: '#fff',
    width: '100%',
  },
};
