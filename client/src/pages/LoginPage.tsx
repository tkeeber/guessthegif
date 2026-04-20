import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface LoginPageProps {
  onNavigateSignup: () => void;
}

export default function LoginPage({ onNavigateSignup }: LoginPageProps) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email';
    if (!password) next.password = 'Password is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setErrors({});

    const { error } = await signIn(email, password);
    setSubmitting(false);

    if (error) {
      setErrors({ form: 'Invalid credentials.' });
    }
  }

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.form} noValidate>
        <h1 style={styles.title}>Sign In</h1>

        <label style={styles.label}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            autoComplete="email"
          />
          {errors.email && <span style={styles.error}>{errors.email}</span>}
        </label>

        <label style={styles.label}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            autoComplete="current-password"
          />
          {errors.password && <span style={styles.error}>{errors.password}</span>}
        </label>

        {errors.form && <p style={styles.formError}>{errors.form}</p>}

        <button type="submit" disabled={submitting} style={styles.button}>
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>

        <p style={styles.link}>
          Don&apos;t have an account?{' '}
          <button type="button" onClick={onNavigateSignup} style={styles.linkBtn}>
            Sign up
          </button>
        </p>
      </form>
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
  form: {
    width: '100%',
    maxWidth: 380,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  title: { textAlign: 'center' as const, margin: 0 },
  label: { display: 'flex', flexDirection: 'column' as const, gap: 4, fontSize: 14 },
  input: {
    padding: '10px 12px',
    fontSize: 16,
    borderRadius: 6,
    border: '1px solid #ccc',
  },
  error: { color: '#d32f2f', fontSize: 12 },
  formError: { color: '#d32f2f', fontSize: 14, textAlign: 'center' as const, margin: 0 },
  button: {
    padding: '12px 0',
    fontSize: 16,
    borderRadius: 6,
    border: 'none',
    background: '#4f46e5',
    color: '#fff',
    cursor: 'pointer',
  },
  link: { textAlign: 'center' as const, fontSize: 14 },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#4f46e5',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontSize: 14,
    padding: 0,
  },
};
