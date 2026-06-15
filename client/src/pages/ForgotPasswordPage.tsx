import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { colors, radii, fonts, commonStyles } from '../styles/theme';

interface ForgotPasswordPageProps {
  onNavigateLogin: () => void;
}

export default function ForgotPasswordPage({ onNavigateLogin }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email');
      return;
    }

    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    setSubmitting(false);

    if (resetError) {
      setError(resetError.message || 'Failed to send reset link. Please try again.');
    } else {
      setSent(true);
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
          <h2 style={styles.formTitle}>Reset Password</h2>

          {sent ? (
            <div style={styles.successBox}>
              <p style={styles.successText}>Check your email for a reset link</p>
            </div>
          ) : (
            <>
              <p style={styles.description}>
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>

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
                {error && <span style={styles.error}>{error}</span>}
              </label>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  ...styles.submitBtn,
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Sending…' : 'Send Reset Link'}
              </button>
            </>
          )}

          <p style={styles.switchText}>
            <button type="button" onClick={onNavigateLogin} style={styles.linkBtn}>
              Back to Sign In
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
  successBox: {
    padding: 16,
    borderRadius: radii.input,
    background: 'rgba(34, 197, 94, 0.1)',
    border: `1px solid ${colors.success}`,
    textAlign: 'center',
  },
  successText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: 500,
    margin: 0,
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
