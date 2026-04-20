import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { io as ioClient, Socket } from 'socket.io-client';
import { supabase } from '../lib/supabase';

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

interface LeaderboardUpdateEntry {
  rank: number;
  username: string;
  correctGuessCount: number;
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

  // Socket.IO: listen for leaderboard:update
  useEffect(() => {
    let socket: Socket | null = null;

    async function connect() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      socket = ioClient({
        auth: { token: session?.access_token ?? '' },
        transports: ['websocket', 'polling'],
      });

      socket.on('leaderboard:update', (payload: { entries: LeaderboardUpdateEntry[] }) => {
        // Only update if we're viewing the current season
        setSelectedSeasonId((current) => {
          if (current === 'current') {
            setCurrentEntries(
              payload.entries.map((e) => ({
                rank: e.rank,
                playerId: '',
                username: e.username,
                correctGuessCount: e.correctGuessCount,
              }))
            );
          }
          return current;
        });
      });
    }

    connect();

    return () => {
      socket?.disconnect();
    };
  }, []);

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

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <button onClick={onBack} style={styles.backBtn} aria-label="Back to lobbies">
            ← Back
          </button>
          <h1 style={styles.title}>🏆 Leaderboard</h1>
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

        {/* Table */}
        {displayLoading ? (
          <p style={styles.muted}>Loading…</p>
        ) : entries.length === 0 ? (
          <p style={styles.muted}>No scores yet.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={{ ...styles.th, textAlign: 'left' }}>Player</th>
                <th style={styles.th}>Correct</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isMe = entry.username === currentUsername;
                return (
                  <tr
                    key={entry.username + entry.rank}
                    style={isMe ? styles.highlightRow : styles.row}
                  >
                    <td style={styles.td}>{entry.rank}</td>
                    <td style={{ ...styles.td, textAlign: 'left', fontWeight: isMe ? 700 : 400 }}>
                      {entry.username}
                      {isMe && <span style={styles.youBadge}> (you)</span>}
                    </td>
                    <td style={styles.td}>{entry.correctGuessCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  backBtn: {
    padding: '6px 12px',
    fontSize: 14,
    borderRadius: 6,
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
  },
  title: {
    margin: 0,
    fontSize: 22,
  },
  seasonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
  },
  select: {
    flex: 1,
    padding: '8px 10px',
    fontSize: 14,
    borderRadius: 6,
    border: '1px solid #ccc',
  },
  archiveInfo: {
    fontSize: 13,
    color: '#666',
    margin: '0 0 12px',
  },
  error: {
    color: '#d32f2f',
    fontSize: 14,
    margin: '0 0 12px',
  },
  muted: {
    color: '#888',
    fontSize: 14,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '8px 12px',
    fontSize: 13,
    textAlign: 'center',
    borderBottom: '2px solid #e0e0e0',
    color: '#555',
  },
  row: {
    borderBottom: '1px solid #f0f0f0',
  },
  highlightRow: {
    borderBottom: '1px solid #f0f0f0',
    background: '#eef2ff',
  },
  td: {
    padding: '10px 12px',
    fontSize: 15,
    textAlign: 'center',
  },
  youBadge: {
    fontSize: 12,
    color: '#4f46e5',
    fontWeight: 400,
  },
};
