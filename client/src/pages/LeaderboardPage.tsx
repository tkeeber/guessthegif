import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { colors, radii, commonStyles } from '../styles/theme';

// ---------------------------------------------------------------------------
// Types (mirroring server API responses)
// ---------------------------------------------------------------------------

interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  correctGuessCount: number;
}

interface LeaderboardResponse {
  seasonId: string;
  seasonNumber: number;
  entries: LeaderboardEntry[];
}

interface ArchivedSeasonSummary {
  id: string;
  seasonNumber: number;
  startedAt: string;
  endedAt: string;
  winnerUsername: string | null;
}

interface ArchivedSeasonsResponse {
  seasons: ArchivedSeasonSummary[];
}

interface ArchivedSeasonLeaderboardResponse {
  season: ArchivedSeasonSummary;
  entries: LeaderboardEntry[];
}



// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LeaderboardPageProps {
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LeaderboardPage({ onBack }: LeaderboardPageProps) {
  // Current season leaderboard
  const [currentEntries, setCurrentEntries] = useState<LeaderboardEntry[]>([]);
  const [seasonNumber, setSeasonNumber] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Archived seasons
  const [archivedSeasons, setArchivedSeasons] = useState<ArchivedSeasonSummary[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('current');
  const [archivedEntries, setArchivedEntries] = useState<LeaderboardEntry[]>([]);
  const [archivedSeason, setArchivedSeason] = useState<ArchivedSeasonSummary | null>(null);
  const [loadingArchived, setLoadingArchived] = useState(false);

  // Current player username (resolved from auth callback profile)
  const [currentUsername, setCurrentUsername] = useState<string>('');

  // Resolve the current player's username
  useEffect(() => {
    async function fetchProfile() {
      try {
        const data = await apiFetch<{ player: { username: string } }>('/api/auth/me');
        setCurrentUsername(data.player.username);
      } catch {
        // Non-critical — highlighting just won't work
      }
    }
    fetchProfile();
  }, []);

  // Fetch current season leaderboard
  const fetchCurrent = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<LeaderboardResponse>('/api/leaderboard');
      setCurrentEntries(data.entries);
      setSeasonNumber(data.seasonNumber);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch archived seasons list
  const fetchArchivedSeasons = useCallback(async () => {
    try {
      const data = await apiFetch<ArchivedSeasonsResponse>('/api/leaderboard/seasons');
      setArchivedSeasons(data.seasons);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchCurrent();
    fetchArchivedSeasons();
  }, [fetchCurrent, fetchArchivedSeasons]);

  // Handle season dropdown change
  async function handleSeasonChange(value: string) {
    setSelectedSeasonId(value);

    if (value === 'current') {
      setArchivedSeason(null);
      setArchivedEntries([]);
      return;
    }

    try {
      setLoadingArchived(true);
      const data = await apiFetch<ArchivedSeasonLeaderboardResponse>(
        `/api/leaderboard/seasons/${encodeURIComponent(value)}`
      );
      setArchivedSeason(data.season);
      setArchivedEntries(data.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load season');
    } finally {
      setLoadingArchived(false);
    }
  }

  const isViewingCurrent = selectedSeasonId === 'current';
  const entries = isViewingCurrent ? currentEntries : archivedEntries;
  const displayLoading = isViewingCurrent ? loading : loadingArchived;

  // Split top 3 and remaining
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  // Find current user stats
  const myEntry = entries.find((e) => e.username === currentUsername);

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <button onClick={onBack} style={styles.backBtn} aria-label="Back to lobbies">
            ←
          </button>
          <h1 style={styles.title}>🏆 Leaderboard</h1>
        </div>

        {/* Tab selector */}
        <div style={styles.tabRow}>
          <button style={styles.tabActive}>Global</button>
        </div>

        {/* Season selector */}
        <div style={styles.seasonRow}>
          <label htmlFor="season-select" style={styles.label}>
            Season:
          </label>
          <select
            id="season-select"
            value={selectedSeasonId}
            onChange={(e) => handleSeasonChange(e.target.value)}
            style={styles.select}
          >
            <option value="current">
              Current Season{seasonNumber ? ` (#${seasonNumber})` : ''}
            </option>
            {archivedSeasons.map((s) => (
              <option key={s.id} value={s.id}>
                Season #{s.seasonNumber}
                {s.winnerUsername ? ` — Won by ${s.winnerUsername}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Archived season info */}
        {!isViewingCurrent && archivedSeason && (
          <p style={styles.archiveInfo}>
            {archivedSeason.winnerUsername
              ? `Winner: ${archivedSeason.winnerUsername}`
              : 'No winner'}
            {' · '}
            Ended {new Date(archivedSeason.endedAt).toLocaleDateString()}
          </p>
        )}

        {error && <p style={styles.error}>{error}</p>}

        {/* Content */}
        {displayLoading ? (
          <p style={styles.muted}>Loading…</p>
        ) : entries.length === 0 ? (
          <p style={styles.muted}>No scores yet.</p>
        ) : (
          <>
            {/* Top 3 Podium */}
            <div style={styles.podium}>
              {top3.map((entry, idx) => {
                const podiumColors = [colors.secondary, colors.textSecondary, '#cd7f32'];
                const sizes = [64, 52, 48];
                return (
                  <div key={entry.username + entry.rank} style={styles.podiumItem}>
                    <div style={{
                      ...styles.podiumAvatar,
                      width: sizes[idx],
                      height: sizes[idx],
                      border: `3px solid ${podiumColors[idx]}`,
                    }}>
                      <span style={styles.podiumRank}>{entry.rank}</span>
                    </div>
                    <span style={{
                      ...styles.podiumName,
                      fontWeight: entry.username === currentUsername ? 700 : 500,
                    }}>
                      {entry.username}
                    </span>
                    <span style={styles.podiumPoints}>
                      {entry.correctGuessCount} pts
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Remaining players */}
            {rest.length > 0 && (
              <ul style={styles.list}>
                {rest.map((entry) => {
                  const isMe = entry.username === currentUsername;
                  return (
                    <li
                      key={entry.username + entry.rank}
                      style={{
                        ...styles.listItem,
                        background: isMe ? '#1e1e4a' : colors.surface,
                      }}
                    >
                      <div style={styles.rankCircle}>
                        <span style={styles.rankNum}>{entry.rank}</span>
                      </div>
                      <span style={{
                        ...styles.listName,
                        fontWeight: isMe ? 700 : 400,
                      }}>
                        {entry.username}
                        {isMe && <span style={styles.youBadge}> (you)</span>}
                      </span>
                      <span style={styles.listPoints}>
                        {entry.correctGuessCount}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {/* Your Stats */}
        {myEntry && (
          <div style={styles.statsCard}>
            <h3 style={styles.statsTitle}>Your Stats</h3>
            <div style={styles.statsGrid}>
              <div style={styles.statsItem}>
                <span style={styles.statsValue}>{myEntry.rank}</span>
                <span style={styles.statsLabel}>Rank</span>
              </div>
              <div style={styles.statsItem}>
                <span style={styles.statsValue}>{myEntry.correctGuessCount}</span>
                <span style={styles.statsLabel}>Points</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    ...commonStyles.pageWrapper,
  },
  container: {
    ...commonStyles.pageContainer,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  backBtn: {
    padding: '8px 12px',
    fontSize: 16,
    borderRadius: radii.button,
    border: `1px solid ${colors.surfaceBorder}`,
    background: colors.surface,
    color: colors.textPrimary,
    cursor: 'pointer',
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  tabRow: {
    display: 'flex',
    gap: 0,
    marginBottom: 16,
  },
  tabActive: {
    padding: '10px 24px',
    fontSize: 14,
    fontWeight: 600,
    borderRadius: radii.button,
    border: 'none',
    background: colors.primary,
    color: '#ffffff',
    cursor: 'pointer',
  },
  seasonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.textSecondary,
  },
  select: {
    flex: 1,
    padding: '10px 12px',
    fontSize: 14,
    borderRadius: radii.button,
    border: `1px solid ${colors.inputBorder}`,
    background: colors.inputBg,
    color: colors.textPrimary,
  },
  archiveInfo: {
    fontSize: 13,
    color: colors.textMuted,
    margin: '0 0 12px',
  },
  error: {
    color: colors.error,
    fontSize: 14,
    margin: '0 0 12px',
  },
  muted: {
    color: colors.textMuted,
    fontSize: 14,
  },
  // Podium
  podium: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 20,
    marginBottom: 24,
    padding: '24px 0 16px',
  },
  podiumItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  podiumAvatar: {
    borderRadius: '50%',
    background: colors.surface,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumRank: {
    fontSize: 20,
    fontWeight: 800,
    color: colors.textPrimary,
  },
  podiumName: {
    fontSize: 13,
    color: colors.textPrimary,
    textAlign: 'center',
    maxWidth: 80,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  podiumPoints: {
    fontSize: 12,
    color: colors.secondary,
    fontWeight: 600,
  },
  // List
  list: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.button,
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: colors.surfaceBorder,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.textSecondary,
  },
  listName: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  listPoints: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.secondary,
  },
  youBadge: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: 400,
  },
  // Stats card
  statsCard: {
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.card,
    padding: 20,
    marginTop: 8,
  },
  statsTitle: {
    margin: '0 0 14px',
    fontSize: 16,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  statsGrid: {
    display: 'flex',
    gap: 16,
  },
  statsItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  statsValue: {
    fontSize: 24,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  statsLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
};
