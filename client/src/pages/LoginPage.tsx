import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { colors, radii, fonts, commonStyles } from '../styles/theme';

interface LoginPageProps {
  onNavigateSignup: () => void;
  onNavigateForgotPassword: () => void;
}

export default function LoginPage({ onNavigateSignup, onNavigateForgotPassword }: LoginPageProps) {
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
      <div style={styles.inner}>
        {/* Logo */}
        <div style={styles.logoSection}>
          <h1 style={styles.logo}>GUESS THE GIF</h1>
          <p style={styles.tagline}>Eat my GIFS Jeff</p>
        </div>

        {/* BETA BANNER — remove this block when ready for production */}
        <div style={styles.betaBanner}>🚧 Beta — things may break. Feedback welcome!</div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          <h2 style={styles.formTitle}>Sign In</h2>

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
            <span style={styles.labelText}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              autoComplete="current-password"
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
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>

          <p style={styles.forgotText}>
            <button type="button" onClick={onNavigateForgotPassword} style={styles.linkBtn}>
              Forgot password?
            </button>
          </p>

          <p style={styles.switchText}>
            Don&apos;t have an account?{' '}
            <button type="button" onClick={onNavigateSignup} style={styles.linkBtn}>
              Sign up
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
  betaBanner: {
    width: '100%',
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'center' as const,
    borderRadius: 8,
    background: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid #f59e0b',
    color: '#f59e0b',
  },
  logo: {
    fontSize: 32,
    fontWeight: 900,
    letterSpacing: 2,
    margin: 0,
    background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: 16,
    margin: '8px 0 0',
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
  forgotText: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textSecondary,
    margin: 0,
  },
  linkBtn: {
    ...commonStyles.linkButton,
  },
};
