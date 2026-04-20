import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';

interface LobbyWithHost {
  id: string;
  join_code: string;
  host_id: string;
  hostUsername: string;
  status: string;
  playerCount: number;
  created_at: string;
}

interface ListLobbiesResponse {
  lobbies: LobbyWithHost[];
}

interface CreateLobbyResponse {
  lobby: { id: string; join_code: string };
}

interface JoinLobbyResponse {
  lobby: { id: string; join_code: string; host_id: string };
}

interface LobbyListPageProps {
  onEnterLobby: (lobbyId: string, joinCode: string, hostId: string) => void;
  onOpenLeaderboard?: () => void;
  onOpenAdmin?: () => void;
}

export default function LobbyListPage({ onEnterLobby, onOpenLeaderboard, onOpenAdmin }: LobbyListPageProps) {
  const { user, signOut } = useAuth();
  const [lobbies, setLobbies] = useState<LobbyWithHost[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  async function fetchLobbies() {
    try {
      setLoading(true);
      const data = await apiFetch<ListLobbiesResponse>('/api/lobbies');
      setLobbies(data.lobbies);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lobbies');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLobbies();
  }, []);

  async function handleCreate() {
    try {
      setCreating(true);
      setError('');
      const data = await apiFetch<CreateLobbyResponse>('/api/lobbies', {
        method: 'POST',
      });
      onEnterLobby(data.lobby.id, data.lobby.join_code, '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lobby');
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinByCode() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    try {
      setJoining(true);
      setError('');
      const data = await apiFetch<JoinLobbyResponse>(
        `/api/lobbies/${encodeURIComponent(code)}/join`,
        { method: 'POST' }
      );
      onEnterLobby(data.lobby.id, data.lobby.join_code, data.lobby.host_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join lobby');
    } finally {
      setJoining(false);
    }
  }

  async function handleJoinLobby(lobby: LobbyWithHost) {
    try {
      setError('');
      const data = await apiFetch<JoinLobbyResponse>(
        `/api/lobbies/${encodeURIComponent(lobby.join_code)}/join`,
        { method: 'POST' }
      );
      onEnterLobby(data.lobby.id, data.lobby.join_code, data.lobby.host_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join lobby');
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h1 style={styles.title}>🎬 Guess the Gif</h1>
        <p style={styles.greeting}>
          Welcome, <strong>{user?.email ?? 'Player'}</strong>
        </p>

        {/* Create / Join controls */}
        <div style={styles.actions}>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={styles.primaryBtn}
          >
            {creating ? 'Creating…' : 'Create Lobby'}
          </button>

          <div style={styles.joinRow}>
            <input
              type="text"
              placeholder="Enter join code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              style={styles.input}
              maxLength={6}
              aria-label="Join code"
            />
            <button
              onClick={handleJoinByCode}
              disabled={joining || !joinCode.trim()}
              style={styles.secondaryBtn}
            >
              {joining ? 'Joining…' : 'Join'}
            </button>
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        {/* Lobby list */}
        <h2 style={styles.sectionTitle}>Available Lobbies</h2>

        {loading ? (
          <p style={styles.muted}>Loading lobbies…</p>
        ) : lobbies.length === 0 ? (
          <p style={styles.muted}>No lobbies available. Create one!</p>
        ) : (
          <ul style={styles.list}>
            {lobbies.map((lobby) => (
              <li key={lobby.id} style={styles.listItem}>
                <div>
                  <strong>{lobby.hostUsername}</strong>'s lobby
                  <span style={styles.badge}>
                    {lobby.playerCount} player{lobby.playerCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  onClick={() => handleJoinLobby(lobby)}
                  style={styles.joinBtn}
                >
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}

        <button onClick={() => fetchLobbies()} style={styles.refreshBtn}>
          Refresh
        </button>

        <button onClick={signOut} style={styles.signOutBtn}>
          Sign Out
        </button>

        {onOpenLeaderboard && (
          <button onClick={onOpenLeaderboard} style={styles.leaderboardBtn}>
            🏆 Leaderboard
          </button>
        )}

        {onOpenAdmin && (
          <button onClick={onOpenAdmin} style={styles.adminBtn}>
            🔧 Admin
          </button>
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
    paddingTop: 32,
  },
  title: { textAlign: 'center', margin: '0 0 4px' },
  greeting: { textAlign: 'center', fontSize: 14, margin: '0 0 20px', color: '#555' },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginBottom: 16,
  },
  joinRow: {
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    fontSize: 16,
    borderRadius: 6,
    border: '1px solid #ccc',
    textTransform: 'uppercase',
  },
  primaryBtn: {
    padding: '12px 0',
    fontSize: 16,
    borderRadius: 6,
    border: 'none',
    background: '#4f46e5',
    color: '#fff',
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '10px 20px',
    fontSize: 16,
    borderRadius: 6,
    border: '1px solid #4f46e5',
    background: '#fff',
    color: '#4f46e5',
    cursor: 'pointer',
  },
  error: { color: '#d32f2f', fontSize: 14, textAlign: 'center', margin: '0 0 12px' },
  sectionTitle: { fontSize: 18, margin: '0 0 8px' },
  muted: { color: '#888', fontSize: 14 },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 12px',
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid #e0e0e0',
    marginBottom: 8,
  },
  badge: {
    marginLeft: 8,
    fontSize: 12,
    color: '#666',
    background: '#f0f0f0',
    padding: '2px 8px',
    borderRadius: 10,
  },
  joinBtn: {
    padding: '6px 16px',
    fontSize: 14,
    borderRadius: 6,
    border: '1px solid #4f46e5',
    background: '#fff',
    color: '#4f46e5',
    cursor: 'pointer',
  },
  refreshBtn: {
    padding: '8px 0',
    fontSize: 14,
    borderRadius: 6,
    border: '1px solid #ccc',
    background: '#fff',
    color: '#333',
    cursor: 'pointer',
    width: '100%',
    marginBottom: 8,
  },
  signOutBtn: {
    padding: '8px 0',
    fontSize: 14,
    borderRadius: 6,
    border: '1px solid #d32f2f',
    background: '#fff',
    color: '#d32f2f',
    cursor: 'pointer',
    width: '100%',
  },
  leaderboardBtn: {
    padding: '8px 0',
    fontSize: 14,
    borderRadius: 6,
    border: '1px solid #4f46e5',
    background: '#fff',
    color: '#4f46e5',
    cursor: 'pointer',
    width: '100%',
    marginTop: 8,
  },
  adminBtn: {
    padding: '8px 0',
    fontSize: 14,
    borderRadius: 6,
    border: '1px solid #d97706',
    background: '#fff',
    color: '#d97706',
    cursor: 'pointer',
    width: '100%',
    marginTop: 8,
  },
};
