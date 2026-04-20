/**
 * HomePage is no longer the primary authenticated view.
 * After login, users are directed to LobbyListPage via App.tsx routing.
 * This component is kept for backward compatibility but simply re-exports
 * a minimal placeholder.
 */
import { useAuth } from '../contexts/AuthContext';

export default function HomePage() {
  const { user, signOut } = useAuth();

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h1 style={styles.title}>🎬 Guess the Gif</h1>
        <p style={styles.greeting}>
          Welcome, <strong>{user?.email ?? 'Player'}</strong>
        </p>
        <p style={styles.subtitle}>Game coming soon…</p>
        <button onClick={signOut} style={styles.button}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: 16,
    fontFamily: 'system-ui, sans-serif',
  },
  container: {
    textAlign: 'center' as const,
    width: '100%',
    maxWidth: 400,
  },
  title: { margin: '0 0 8px' },
  greeting: { fontSize: 16, margin: '0 0 4px' },
  subtitle: { color: '#666', margin: '0 0 24px' },
  button: {
    padding: '12px 24px',
    fontSize: 16,
    borderRadius: 6,
    border: '1px solid #d32f2f',
    background: '#fff',
    color: '#d32f2f',
    cursor: 'pointer',
  },
};
