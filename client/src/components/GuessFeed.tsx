import { useEffect, useRef } from 'react';
import { colors, radii, fonts } from '../styles/theme';

const BOT_PREFIXES = ['NoviceBot_', 'IntermediateBot_', 'ExpertBot_'];

function isBot(username: string): boolean {
  return BOT_PREFIXES.some((prefix) => username.startsWith(prefix));
}

export interface FeedEntry {
  id: string;
  type: 'guess' | 'chat';
  username: string;
  text: string;
  timestamp: string;
  isCorrect?: boolean;
}

interface GuessFeedProps {
  entries: FeedEntry[];
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export default function GuessFeed({
  entries,
  onSubmit,
  disabled = false,
}: GuessFeedProps) {
  const feedEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest entry
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || !input.value.trim()) return;
    onSubmit(input.value.trim());
    input.value = '';
  }

  function formatTime(ts: string): string {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  }

  return (
    <div style={styles.container}>
      {/* Scrollable feed */}
      <div style={styles.feed} role="log" aria-label="Game feed">
        {entries.length === 0 && (
          <p style={styles.empty}>No guesses yet. Be the first!</p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              ...styles.entry,
              ...(entry.isCorrect ? styles.correctEntry : {}),
            }}
          >
            <div style={styles.entryHeader}>
              <span style={styles.username}>
                {entry.username}
                {isBot(entry.username) && <span style={styles.botBadge}> 🤖</span>}
                {entry.isCorrect && <span style={styles.correctBadge}> ✓ Correct!</span>}
              </span>
              <span style={styles.timestamp}>{formatTime(entry.timestamp)}</span>
            </div>
            <div style={styles.entryText}>{entry.text}</div>
          </div>
        ))}
        <div ref={feedEndRef} />
      </div>

      {/* Single input — everything is a guess */}
      <form onSubmit={handleSubmit} style={styles.inputRow}>
        <input
          ref={inputRef}
          type="text"
          placeholder={disabled ? 'Waiting for next round…' : 'Type your guess…'}
          disabled={disabled}
          style={styles.input}
          aria-label="Guess input"
          autoComplete="off"
        />
        <button type="submit" disabled={disabled} style={styles.submitBtn}>
          Send
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    fontFamily: fonts.base,
  },
  feed: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minHeight: 120,
    maxHeight: 300,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.input,
    background: colors.surface,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    padding: 16,
    margin: 0,
  },
  entry: {
    padding: '6px 10px',
    borderRadius: 6,
    background: colors.inputBg,
    border: `1px solid ${colors.inputBorder}`,
  },
  correctEntry: {
    background: 'rgba(34, 197, 94, 0.1)',
    border: `1px solid ${colors.success}`,
  },
  entryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  username: {
    fontWeight: 600,
    fontSize: 13,
    color: colors.textPrimary,
  },
  correctBadge: {
    color: colors.success,
    fontWeight: 700,
    fontSize: 12,
  },
  timestamp: {
    fontSize: 11,
    color: colors.textMuted,
  },
  entryText: {
    fontSize: 14,
    color: colors.textSecondary,
    wordBreak: 'break-word' as const,
  },
  botBadge: {
    fontSize: 12,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    marginTop: 8,
  },
  input: {
    flex: 1,
    padding: '12px 14px',
    fontSize: 16,
    borderRadius: radii.input,
    border: `1px solid ${colors.inputBorder}`,
    background: colors.inputBg,
    color: colors.textPrimary,
    outline: 'none',
  },
  submitBtn: {
    padding: '12px 20px',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: radii.button,
    border: 'none',
    background: colors.primary,
    color: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
};
