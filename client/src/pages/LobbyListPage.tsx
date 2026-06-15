import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';
import { colors, radii, commonStyles } from '../styles/theme';

interface LobbyWithHost {
  id: string;
  join_code: string;
  host_id: string;
  hostUsername: string;
  status: string;
  playerCount: number;
  created_at: string;
  botsAllowed?: boolean;
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
  const [botsAllowed, setBotsAllowed] = useState(true);
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [playerPoints, setPlayerPoints] = useState<number | null>(null);

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
    // Fetch player stats from leaderboard
    apiFetch<{ seasonId: string; entries: { rank: number; playerId: string; username: string; correctGuessCount: number }[] }>('/api/leaderboard')
      .then((data) => {
        // Find current player's entry by fetching their profile first
        apiFetch<{ player: { username: string } }>('/api/auth/me').then((profile) => {
          const myEntry = data.entries.find((e) => e.username === profile.player.username);
          if (myEntry) {
            setPlayerRank(myEntry.rank);
            setPlayerPoints(myEntry.correctGuessCount);
          } else {
            setPlayerRank(0);
            setPlayerPoints(0);
          }
        }).catch(() => {});
      })
      .catch(() => {});
  }, []);

  async function handleCreate() {
    try {
      setCreating(true);
      setError('');
      const data = await apiFetch<CreateLobbyResponse>('/api/lobbies', {
        method: 'POST',
        body: JSON.stringify({ botsAllowed }),
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
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.logo}>GUESS THE GIF</h1>
          <p style={styles.greeting}>{user?.email ?? 'Player'}</p>
        </div>

        {/* Stats row */}
        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <span style={styles.statValue}>{playerRank != null ? (playerRank || '—') : '…'}</span>
            <span style={styles.statLabel}>Rank</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statValue}>{playerPoints != null ? playerPoints : '…'}</span>
            <span style={styles.statLabel}>Points</span>
          </div>
        </div>

        {/* Bots toggle + Action buttons */}
        <div style={styles.botsToggleRow}>
          <label style={styles.botsToggleLabel}>
            <input
              type="checkbox"
              checked={botsAllowed}
              onChange={(e) => setBotsAllowed(e.target.checked)}
              style={styles.botsCheckbox}
            />
            <span>🤖 Allow Bots</span>
          </label>
        </div>

        {/* Action buttons */}
        <div style={styles.actionRow}>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              ...styles.actionBtn,
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? 'Creating…' : 'Create Lobby'}
          </button>
          <button
            onClick={() => {/* handled by join code section */}}
            disabled
            style={{
              ...styles.actionBtn,
              opacity: 0.5,
              cursor: 'default',
            }}
          >
            Join Lobby
          </button>
        </div>

        {/* Join with code */}
        <div style={styles.joinSection}>
          <span style={styles.joinLabel}>Join with Code</span>
          <div style={styles.joinRow}>
            <input
              type="text"
              placeholder="ABCDEF"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              style={styles.input}
              maxLength={6}
              aria-label="Join code"
            />
            <button
              onClick={handleJoinByCode}
              disabled={joining || !joinCode.trim()}
              style={{
                ...styles.joinBtn,
                opacity: joining || !joinCode.trim() ? 0.5 : 1,
              }}
            >
              {joining ? '…' : 'Join'}
            </button>
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        {/* Active lobbies */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Active Lobbies</h2>
            <button onClick={() => fetchLobbies()} style={styles.refreshBtn}>
              ↻
            </button>
          </div>

          {loading ? (
            <p style={styles.muted}>Loading lobbies…</p>
          ) : lobbies.length === 0 ? (
            <p style={styles.muted}>No lobbies available. Create one!</p>
          ) : (
            <ul style={styles.list}>
              {lobbies.map((lobby) => (
                <li key={lobby.id} style={styles.lobbyCard}>
                  <div style={styles.lobbyInfo}>
                    <span style={styles.lobbyName}>{lobby.hostUsername}&apos;s lobby</span>
                    <span style={styles.playerCount}>
                      {lobby.playerCount} player{lobby.playerCount !== 1 ? 's' : ''}
                      {lobby.botsAllowed && <span style={styles.botIndicator}> 🤖</span>}
                    </span>
                  </div>
                  <button
                    onClick={() => handleJoinLobby(lobby)}
                    style={styles.lobbyJoinBtn}
                  >
                    Join
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Bottom links */}
        <div style={styles.bottomSection}>
          {onOpenLeaderboard && (
            <button onClick={onOpenLeaderboard} style={styles.bottomBtn}>
              🏆 Leaderboard
            </button>
          )}
          {onOpenAdmin && (
            <button onClick={onOpenAdmin} style={styles.adminBtn}>
              🔧 Admin
            </button>
          )}
          <button onClick={signOut} style={styles.signOutBtn}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    ...commonStyles.pageWrapper,
  },
  container: {
    ...commonStyles.pageContainer,
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
  },
  logo: {
    fontSize: 24,
    fontWeight: 900,
    letterSpacing: 2,
    margin: 0,
    background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  greeting: {
    color: colors.textSecondary,
    fontSize: 14,
    margin: '6px 0 0',
  },
  statsRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '14px 12px',
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.card,
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  actionRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    padding: '14px 0',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: radii.button,
    border: 'none',
    background: colors.primary,
    color: '#ffffff',
    cursor: 'pointer',
  },
  joinSection: {
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.card,
    padding: 16,
    marginBottom: 20,
  },
  joinLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: colors.textSecondary,
    marginBottom: 10,
    display: 'block',
  },
  joinRow: {
    display: 'flex',
    gap: 10,
  },
  input: {
    ...commonStyles.input,
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 3,
    fontWeight: 600,
  },
  joinBtn: {
    padding: '12px 20px',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: radii.button,
    border: 'none',
    background: colors.primary,
    color: '#ffffff',
    cursor: 'pointer',
  },
  error: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    margin: '0 0 12px',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    margin: 0,
    color: colors.textPrimary,
  },
  refreshBtn: {
    background: 'none',
    border: 'none',
    color: colors.textSecondary,
    fontSize: 20,
    cursor: 'pointer',
    padding: '4px 8px',
  },
  muted: {
    color: colors.textMuted,
    fontSize: 14,
    margin: 0,
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  lobbyCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.card,
  },
  lobbyInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  lobbyName: {
    fontSize: 15,
    fontWeight: 600,
    color: colors.textPrimary,
  },
  playerCount: {
    fontSize: 13,
    color: colors.secondary,
    fontWeight: 600,
  },
  lobbyJoinBtn: {
    padding: '8px 18px',
    fontSize: 14,
    fontWeight: 600,
    borderRadius: radii.button,
    border: `2px solid ${colors.primary}`,
    background: 'transparent',
    color: colors.primary,
    cursor: 'pointer',
  },
  bottomSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginTop: 12,
    paddingTop: 16,
    borderTop: `1px solid ${colors.surfaceBorder}`,
  },
  bottomBtn: {
    padding: '12px 0',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: radii.button,
    border: `2px solid ${colors.primary}`,
    background: 'transparent',
    color: colors.primary,
    cursor: 'pointer',
    width: '100%',
  },
  adminBtn: {
    padding: '12px 0',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: radii.button,
    border: `2px solid ${colors.secondary}`,
    background: 'transparent',
    color: colors.secondary,
    cursor: 'pointer',
    width: '100%',
  },
  signOutBtn: {
    padding: '10px 0',
    fontSize: 14,
    borderRadius: radii.button,
    border: 'none',
    background: 'transparent',
    color: colors.textMuted,
    cursor: 'pointer',
    width: '100%',
  },
  botsToggleRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 12,
    padding: '10px 14px',
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.button,
  },
  botsToggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    fontWeight: 500,
    color: colors.textSecondary,
    cursor: 'pointer',
  },
  botsCheckbox: {
    width: 18,
    height: 18,
    cursor: 'pointer',
    accentColor: colors.primary,
  },
  botIndicator: {
    fontSize: 13,
  },
};
