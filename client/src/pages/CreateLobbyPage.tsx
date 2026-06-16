import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { colors, radii, commonStyles } from '../styles/theme';

interface CreateLobbyResponse {
  lobby: { id: string; join_code: string; host_id: string };
}

interface CreateLobbyPageProps {
  onBack: () => void;
  onCreated: (lobbyId: string, joinCode: string, hostId: string) => void;
}

export default function CreateLobbyPage({ onBack, onCreated }: CreateLobbyPageProps) {
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [botsAllowed, setBotsAllowed] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setCreating(true);
      setError('');
      const data = await apiFetch<CreateLobbyResponse>('/api/lobbies', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim() || undefined,
          maxPlayers,
          inviteOnly,
          botsAllowed,
        }),
      });
      onCreated(data.lobby.id, data.lobby.join_code, data.lobby.host_id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lobby');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {/* Back button */}
        <button onClick={onBack} style={styles.backBtn}>
          ← Back to lobbies
        </button>

        <h1 style={styles.heading}>Create Lobby</h1>

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Lobby Name */}
          <div style={styles.field}>
            <label style={styles.label} htmlFor="lobby-name">Lobby Name</label>
            <input
              id="lobby-name"
              type="text"
              placeholder="Friday Night Quiz"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              maxLength={100}
              aria-label="Lobby name"
            />
          </div>

          {/* Max Players */}
          <div style={styles.field}>
            <label style={styles.label} htmlFor="max-players">Max Players</label>
            <select
              id="max-players"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              style={styles.select}
              aria-label="Max players"
            >
              <option value={4}>4 players</option>
              <option value={6}>6 players</option>
              <option value={8}>8 players</option>
            </select>
          </div>

          {/* Invite Only toggle */}
          <div style={styles.toggleRow}>
            <div style={styles.toggleInfo}>
              <span style={styles.toggleLabel}>Invite Only</span>
              <span style={styles.toggleHelper}>Only joinable via code</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={inviteOnly}
              aria-label="Invite only toggle"
              onClick={() => setInviteOnly(!inviteOnly)}
              style={{
                ...styles.toggleTrack,
                background: inviteOnly ? colors.primary : colors.inputBorder,
              }}
            >
              <span
                style={{
                  ...styles.toggleThumb,
                  transform: inviteOnly ? 'translateX(20px)' : 'translateX(2px)',
                }}
              />
            </button>
          </div>

          {/* Allow Bots toggle */}
          <div style={styles.toggleRow}>
            <div style={styles.toggleInfo}>
              <span style={styles.toggleLabel}>Allow Bots</span>
              <span style={styles.toggleHelper}>Fill empty spots with AI players</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={botsAllowed}
              aria-label="Allow bots toggle"
              onClick={() => setBotsAllowed(!botsAllowed)}
              style={{
                ...styles.toggleTrack,
                background: botsAllowed ? colors.primary : colors.inputBorder,
              }}
            >
              <span
                style={{
                  ...styles.toggleThumb,
                  transform: botsAllowed ? 'translateX(20px)' : 'translateX(2px)',
                }}
              />
            </button>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          {/* Submit */}
          <button
            type="submit"
            disabled={creating}
            style={{
              ...styles.submitBtn,
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? 'Creating…' : 'Create Lobby'}
          </button>
        </form>
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
    color: colors.textSecondary,
    fontSize: 14,
    cursor: 'pointer',
    padding: '4px 0',
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: 700,
    color: colors.textPrimary,
    margin: '0 0 24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    ...commonStyles.input,
  },
  select: {
    padding: '12px 14px',
    fontSize: 16,
    borderRadius: radii.input,
    border: `1px solid ${colors.inputBorder}`,
    background: colors.inputBg,
    color: colors.textPrimary,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  },
  toggleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.card,
  },
  toggleInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: colors.textPrimary,
  },
  toggleHelper: {
    fontSize: 12,
    color: colors.textMuted,
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background 0.2s',
    flexShrink: 0,
  },
  toggleThumb: {
    display: 'block',
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#ffffff',
    position: 'absolute' as const,
    top: 2,
    transition: 'transform 0.2s',
  },
  error: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    margin: 0,
  },
  submitBtn: {
    ...commonStyles.primaryButton,
    marginTop: 8,
  },
};
