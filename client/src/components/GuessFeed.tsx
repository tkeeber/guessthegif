import { useEffect, useRef } from 'react';

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
  onSubmitGuess: (text: string) => void;
  onSubmitChat: (text: string) => void;
  disabled?: boolean;
}

export default function GuessFeed({
  entries,
  onSubmitGuess,
  onSubmitChat,
  disabled = false,
}: GuessFeedProps) {
  const feedEndRef = useRef<HTMLDivElement>(null);
  const guessInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest entry
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  function handleGuessSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = guessInputRef.current;
    if (!input || !input.value.trim()) return;
    onSubmitGuess(input.value.trim());
    input.value = '';
  }

  function handleChatSubmit(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const input = e.currentTarget;
    if (!input.value.trim()) return;
    onSubmitChat(input.value.trim());
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
      <div style={styles.feed} role="log" aria-label="Guess feed">
        {entries.length === 0 && (
          <p style={styles.empty}>No guesses yet. Be the first!</p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              ...styles.entry,
              ...(entry.isCorrect ? styles.correctEntry : {}),
              ...(entry.type === 'chat' ? styles.chatEntry : {}),
            }}
          >
            <div style={styles.entryHeader}>
              <span style={styles.username}>
                {entry.username}
                {entry.isCorrect && <span style={styles.correctBadge}> ✓ Correct!</span>}
              </span>
              <span style={styles.timestamp}>{formatTime(entry.timestamp)}</span>
            </div>
            <div style={styles.entryText}>
              {entry.type === 'chat' && <span style={styles.chatPrefix}>💬 </span>}
              {entry.text}
            </div>
          </div>
        ))}
        <div ref={feedEndRef} />
      </div>

      {/* Guess input */}
      <form onSubmit={handleGuessSubmit} style={styles.inputRow}>
        <input
          ref={guessInputRef}
          type="text"
          placeholder={disabled ? 'Round not active' : 'Type your guess…'}
          disabled={disabled}
          style={styles.input}
          aria-label="Guess input"
        />
        <button type="submit" disabled={disabled} style={styles.submitBtn}>
          Guess
        </button>
      </form>

      {/* Chat input */}
      <div style={styles.inputRow}>
        <input
          type="text"
          placeholder={disabled ? 'Chat disabled' : 'Chat message…'}
          disabled={disabled}
          onKeyDown={handleChatSubmit}
          style={{ ...styles.input, ...styles.chatInput }}
          aria-label="Chat input"
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
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
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    background: '#fafafa',
  },
  empty: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    padding: 16,
    margin: 0,
  },
  entry: {
    padding: '6px 10px',
    borderRadius: 6,
    background: '#fff',
    border: '1px solid #eee',
  },
  correctEntry: {
    background: '#ecfdf5',
    border: '1px solid #6ee7b7',
  },
  chatEntry: {
    background: '#f0f4ff',
    border: '1px solid #c7d2fe',
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
    color: '#333',
  },
  correctBadge: {
    color: '#16a34a',
    fontWeight: 700,
    fontSize: 12,
  },
  timestamp: {
    fontSize: 11,
    color: '#999',
  },
  entryText: {
    fontSize: 14,
    color: '#444',
    wordBreak: 'break-word' as const,
  },
  chatPrefix: {
    fontSize: 13,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    marginTop: 6,
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    fontSize: 15,
    borderRadius: 6,
    border: '1px solid #ccc',
    outline: 'none',
  },
  chatInput: {
    borderColor: '#c7d2fe',
  },
  submitBtn: {
    padding: '10px 20px',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 6,
    border: 'none',
    background: '#4f46e5',
    color: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
};
