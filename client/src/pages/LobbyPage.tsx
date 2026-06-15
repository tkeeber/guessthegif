import { useEffect, useState, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { apiFetch } from '../lib/api';
import { colors, radii, commonStyles } from '../styles/theme';

const BOT_PREFIXES = ['NoviceBot_', 'IntermediateBot_', 'ExpertBot_'];

function isBot(username: string): boolean {
  return BOT_PREFIXES.some((prefix) => username.startsWith(prefix));
}

interface LobbyPlayer {
  playerId: string;
  username: string;
}

export interface RoundStartData {
  roundNumber: number;
  gifUrl: string;
  players: { playerId: string; username: string }[];
}

interface LobbyPageProps {
  lobbyId: string;
  joinCode: string;
  /** The host's player ID (from the lobby record). Empty string if current user is host. */
  hostId: string;
  currentUserId: string;
  onBack: () => void;
  onGameStart: (lobbyId: string, initialRound: RoundStartData) => void;
}

export default function LobbyPage({
  lobbyId,
  joinCode,
  hostId,
  currentUserId,
  onBack,
  onGameStart,
}: LobbyPageProps) {
  const { socket, connected } = useSocket();
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [isHost, setIsHost] = useState(!hostId);
  const [copied, setCopied] = useState(false);
  const [botsAllowed, setBotsAllowed] = useState(true);
  const [togglingBots, setTogglingBots] = useState(false);
  const [fillingBots, setFillingBots] = useState(false);

  // Register event listeners on the shared socket
  useEffect(() => {
    if (!socket) return;

    function handleLobbyUpdate(payload: { players: LobbyPlayer[]; hostSupabaseId?: string }) {
      setPlayers(payload.players);
      if (payload.hostSupabaseId) {
        setIsHost(payload.hostSupabaseId === currentUserId);
      }
    }

    function handleRoundStart(payload: { roundNumber: number; gifUrl: string }) {
      onGameStart(lobbyId, { roundNumber: payload.roundNumber, gifUrl: payload.gifUrl, players });
    }

    function handleError(payload: { message?: string }) {
      setError(payload.message ?? 'An error occurred');
      setStarting(false);
    }

    socket.on('lobby:update', handleLobbyUpdate);
    socket.on('round:start', handleRoundStart);
    socket.on('error' as any, handleError);

    return () => {
      socket.off('lobby:update', handleLobbyUpdate);
      socket.off('round:start', handleRoundStart);
      socket.off('error' as any, handleError);
    };
  }, [socket, lobbyId, onGameStart, currentUserId]);

  const handleStart = useCallback(() => {
    if (!socket) return;
    setStarting(true);
    setError('');
    socket.emit('session:start', {});
  }, [socket]);

  function handleCopyCode() {
    navigator.clipboard.writeText(joinCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback: do nothing
    });
  }

  async function handleToggleBots() {
    const newValue = !botsAllowed;
    setBotsAllowed(newValue);
    setTogglingBots(true);
    try {
      await apiFetch(`/api/lobbies/${lobbyId}/bots-allowed`, {
        method: 'PATCH',
        body: JSON.stringify({ botsAllowed: newValue }),
      });
    } catch (err) {
      setBotsAllowed(!newValue);
      setError(err instanceof Error ? err.message : 'Failed to toggle bots');
    } finally {
      setTogglingBots(false);
    }
  }

  async function handleFillBots() {
    setFillingBots(true);
    setError('');
    try {
      await apiFetch(`/api/lobbies/${lobbyId}/fill-bots`, { method: 'POST' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add bots');
    } finally {
      setFillingBots(false);
    }
  }

  const canStart = isHost && players.length >= 2 && !starting;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {/* Back button */}
        <button onClick={onBack} style={styles.backBtn}>
          ← Back to lobbies
        </button>

        {/* Lobby header */}
        <div style={styles.headerCard}>
          <h1 style={styles.title}>Lobby</h1>
          <div style={styles.codeRow}>
            <span style={styles.codeLabel}>Join Code</span>
            <span style={styles.code}>{joinCode}</span>
          </div>
          <button onClick={handleCopyCode} style={styles.copyBtn}>
            {copied ? '✓ Copied!' : 'Copy Code'}
          </button>
        </div>

        {/* Connection status */}
        <p style={styles.status}>
          <span style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: connected ? colors.success : colors.error,
            marginRight: 8,
          }} />
          {connected ? 'Connected' : 'Connecting…'}
        </p>

        {error && <p style={styles.error}>{error}</p>}

        {/* Players list */}
        <div style={styles.playersSection}>
          <h2 style={styles.sectionTitle}>
            Players ({players.length})
          </h2>

          {players.length === 0 ? (
            <p style={styles.muted}>Waiting for players…</p>
          ) : (
            <ul style={styles.list}>
              {players.map((p, idx) => (
                <li key={p.playerId} style={styles.playerItem}>
                  <div style={styles.playerLeft}>
                    <span style={styles.onlineDot} />
                    <span style={styles.playerName}>
                      {p.username}
                      {isBot(p.username) && <span style={styles.botBadge}> 🤖</span>}
                    </span>
                  </div>
                  {idx === 0 && <span style={styles.hostBadge}>👑</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Host controls */}
        {isHost && players.length < 2 && (
          <p style={styles.waitingText}>Need at least 2 players to start.</p>
        )}

        {isHost && (
          <div style={styles.botsToggleRow}>
            <label style={styles.botsToggleLabel}>
              <input
                type="checkbox"
                checked={botsAllowed}
                onChange={handleToggleBots}
                disabled={togglingBots}
                style={styles.botsCheckbox}
              />
              <span>🤖 Allow Bots</span>
            </label>
            <button onClick={handleFillBots} disabled={fillingBots} style={styles.fillBotsBtn}>
              {fillingBots ? 'Adding…' : '🤖 Fill with Bots'}
            </button>
          </div>
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
          <p style={styles.waitingText}>Waiting for the host to start the game…</p>
        )}
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
  backBtn: {
    background: 'none',
    border: 'none',
    color: colors.primary,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    padding: 0,
    marginBottom: 16,
  },
  headerCard: {
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.card,
    padding: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  title: {
    margin: '0 0 12px',
    fontSize: 22,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  codeRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    marginBottom: 14,
  },
  codeLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  code: {
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: 6,
    color: colors.secondary,
  },
  copyBtn: {
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: radii.button,
    border: `2px solid ${colors.primary}`,
    background: 'transparent',
    color: colors.primary,
    cursor: 'pointer',
  },
  status: {
    fontSize: 14,
    color: colors.textSecondary,
    margin: '0 0 12px',
    display: 'flex',
    alignItems: 'center',
  },
  error: {
    color: colors.error,
    fontSize: 14,
    margin: '0 0 12px',
  },
  playersSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    margin: '0 0 12px',
    color: colors.textPrimary,
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
  playerItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.button,
  },
  playerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  onlineDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: colors.success,
  },
  playerName: {
    fontSize: 15,
    fontWeight: 500,
    color: colors.textPrimary,
  },
  hostBadge: {
    fontSize: 18,
  },
  waitingText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    margin: '0 0 16px',
  },
  startBtn: {
    padding: '16px 0',
    fontSize: 16,
    fontWeight: 700,
    borderRadius: radii.button,
    border: 'none',
    background: `linear-gradient(135deg, ${colors.primary}, ${colors.success})`,
    color: '#ffffff',
    width: '100%',
  },
  botBadge: {
    fontSize: 14,
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
  fillBotsBtn: {
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: radii.button,
    border: 'none',
    background: colors.primary,
    color: '#fff',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
};
