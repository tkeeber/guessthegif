import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface SignupPageProps {
  onNavigateLogin: () => void;
}

export default function SignupPage({ onNavigateLogin }: SignupPageProps) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{
    email?: string;
    username?: string;
    password?: string;
    form?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email';
    if (!username.trim()) next.username = 'Username is required';
    else if (username.trim().length < 3) next.username = 'Username must be at least 3 characters';
    if (!password) next.password = 'Password is required';
    else if (password.length < 6) next.password = 'Password must be at least 6 characters';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setErrors({});

    const { error } = await signUp(email, password, username.trim());
    setSubmitting(false);

    if (error) {
      const msg = error.message ?? 'Signup failed. Please try again.';
      if (/already/i.test(msg)) {
        setErrors({ form: 'Email is already in use.' });
      } else {
        setErrors({ form: msg });
      }
    }
  }

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.form} noValidate>
        <h1 style={styles.title}>Create Account</h1>

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
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
            autoComplete="username"
          />
          {errors.username && <span style={styles.error}>{errors.username}</span>}
        </label>

        <label style={styles.label}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            autoComplete="new-password"
          />
          {errors.password && <span style={styles.error}>{errors.password}</span>}
        </label>

        {errors.form && <p style={styles.formError}>{errors.form}</p>}

        <button type="submit" disabled={submitting} style={styles.button}>
          {submitting ? 'Creating account…' : 'Sign Up'}
        </button>

        <p style={styles.link}>
          Already have an account?{' '}
          <button type="button" onClick={onNavigateLogin} style={styles.linkBtn}>
            Sign in
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
