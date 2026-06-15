import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { colors, radii, fonts, commonStyles } from '../styles/theme';

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
      <div style={styles.inner}>
        {/* Logo */}
        <div style={styles.logoSection}>
          <h1 style={styles.logo}>GUESS THE GIF</h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          <h2 style={styles.formTitle}>Create Account</h2>

          <label style={styles.label}>
            <span style={styles.labelText}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              autoComplete="email"
              placeholder="you@example.com"
            />
            {errors.email && <span style={styles.error}>{errors.email}</span>}
          </label>

          <label style={styles.label}>
            <span style={styles.labelText}>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={styles.input}
              autoComplete="username"
              placeholder="coolplayer99"
            />
            {errors.username && <span style={styles.error}>{errors.username}</span>}
          </label>

          <label style={styles.label}>
            <span style={styles.labelText}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              autoComplete="new-password"
              placeholder="••••••••"
            />
            {errors.password && <span style={styles.error}>{errors.password}</span>}
          </label>

          {errors.form && <p style={styles.formError}>{errors.form}</p>}

          <button
            type="submit"
            disabled={submitting}
            style={{
              ...styles.submitBtn,
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Creating account…' : 'Sign Up'}
          </button>

          <p style={styles.switchText}>
            Already have an account?{' '}
            <button type="button" onClick={onNavigateLogin} style={styles.linkBtn}>
              Sign in
            </button>
          </p>
        </form>
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
    fontFamily: fonts.base,
    background: colors.background,
    color: colors.textPrimary,
  },
  inner: {
    width: '100%',
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 32,
  },
  logoSection: {
    textAlign: 'center',
  },
  logo: {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 2,
    margin: 0,
    background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.card,
    padding: 24,
  },
  formTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  labelText: {
    fontSize: 14,
    fontWeight: 500,
    color: colors.textSecondary,
  },
  input: {
    ...commonStyles.input,
  },
  error: {
    ...commonStyles.errorText,
    fontSize: 12,
  },
  formError: {
    ...commonStyles.errorText,
    textAlign: 'center',
  },
  submitBtn: {
    ...commonStyles.primaryButton,
    marginTop: 4,
  },
  switchText: {
    textAlign: 'center',
    fontSize: 14,
    color: colors.textSecondary,
    margin: 0,
  },
  linkBtn: {
    ...commonStyles.linkButton,
  },
};
