import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { colors, radii, fonts, commonStyles } from '../styles/theme';

interface ResetPasswordPageProps {
  onComplete: () => void;
}

export default function ResetPasswordPage({ onComplete }: ResetPasswordPageProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const next: typeof errors = {};
    if (!password) next.password = 'Password is required';
    else if (password.length < 6) next.password = 'Password must be at least 6 characters';
    if (!confirmPassword) next.confirm = 'Please confirm your password';
    else if (password !== confirmPassword) next.confirm = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setErrors({});

    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setErrors({ form: error.message || 'Failed to update password. Please try again.' });
    } else {
      // Clear the hash so the app doesn't re-render this page
      window.location.hash = '';
      onComplete();
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
          <h2 style={styles.formTitle}>Set New Password</h2>

          <p style={styles.description}>Enter your new password below.</p>

          <label style={styles.label}>
            <span style={styles.labelText}>New Password</span>
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

          <label style={styles.label}>
            <span style={styles.labelText}>Confirm Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={styles.input}
              autoComplete="new-password"
              placeholder="••••••••"
            />
            {errors.confirm && <span style={styles.error}>{errors.confirm}</span>}
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
            {submitting ? 'Updating…' : 'Update Password'}
          </button>
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
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    margin: 0,
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
};
