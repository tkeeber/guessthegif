// Shared dark-theme design system for Guess the Gif
// Mobile-first, max-width 480px, full viewport height

export const colors = {
  background: '#0f0f23',
  surface: '#1a1a3e',
  surfaceBorder: '#2a2a5e',
  primary: '#7c3aed',
  primaryHover: '#6d28d9',
  secondary: '#f59e0b',
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  success: '#22c55e',
  error: '#ef4444',
  inputBg: '#12122b',
  inputBorder: '#3f3f6e',
  cardBg: '#1a1a3e',
  cardBorder: '#2a2a5e',
} as const;

export const radii = {
  card: 12,
  button: 8,
  input: 8,
} as const;

export const fonts = {
  base: 'system-ui, -apple-system, sans-serif',
} as const;

// Common reusable styles
export const commonStyles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    minHeight: '100vh',
    padding: 16,
    fontFamily: fonts.base,
    background: colors.background,
    color: colors.textPrimary,
  },
  pageContainer: {
    width: '100%',
    maxWidth: 480,
    paddingTop: 24,
  },
  card: {
    background: colors.cardBg,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: radii.card,
    padding: 16,
  },
  input: {
    padding: '12px 14px',
    fontSize: 16,
    borderRadius: radii.input,
    border: `1px solid ${colors.inputBorder}`,
    background: colors.inputBg,
    color: colors.textPrimary,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  primaryButton: {
    padding: '14px 24px',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: radii.button,
    border: 'none',
    background: colors.primary,
    color: '#ffffff',
    cursor: 'pointer',
    width: '100%',
  },
  secondaryButton: {
    padding: '12px 24px',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: radii.button,
    border: `2px solid ${colors.primary}`,
    background: 'transparent',
    color: colors.primary,
    cursor: 'pointer',
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    margin: 0,
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: colors.primary,
    cursor: 'pointer',
    textDecoration: 'underline',
    fontSize: 14,
    padding: 0,
  },
};
