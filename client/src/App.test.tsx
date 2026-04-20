import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

// Hoisted mock — no external variable references allowed inside vi.mock factory
vi.mock('./lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
      },
    },
  };
});

// Access the mock after vi.mock has been set up
async function getMockedSupabase() {
  const mod = await import('./lib/supabase');
  return mod.supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('App', () => {
  it('renders login page when not authenticated', async () => {
    const supabase = await getMockedSupabase();
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as never);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign In' })).toBeDefined();
    });
  });

  it('shows loading state initially', async () => {
    const supabase = await getMockedSupabase();
    vi.mocked(supabase.auth.getSession).mockReturnValue(new Promise(() => {}) as never);

    render(<App />);
    expect(screen.getByText('Loading…')).toBeDefined();
  });
});
