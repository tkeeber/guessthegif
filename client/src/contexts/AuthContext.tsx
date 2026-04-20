import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';

interface AuthState {
  user: User | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (
    email: string,
    password: string,
    username: string
  ) => Promise<{ error: AuthError | Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Ensure a player profile exists in the backend for the given Supabase user.
 * Called on both signup and login to handle cases where the profile wasn't
 * created during signup (e.g. email confirmation flow, production URL issues).
 */
async function ensurePlayerProfile(user: User, username?: string): Promise<void> {
  try {
    // Check if profile already exists
    await apiFetch('/api/auth/me');
  } catch {
    // Profile doesn't exist — create it
    try {
      await apiFetch('/api/auth/callback', {
        method: 'POST',
        body: JSON.stringify({
          supabaseUserId: user.id,
          email: user.email,
          username: username || user.email?.split('@')[0] || 'player',
        }),
      });
    } catch (err) {
      console.error('Failed to create player profile:', err);
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  // Bootstrap: check for an existing session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setState({ user, loading: false });
      // Auto-sync profile on session restore
      if (user) {
        ensurePlayerProfile(user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setState((prev) => ({ ...prev, user }));
      // Auto-sync profile on auth state change (login, token refresh)
      if (user && _event === 'SIGNED_IN') {
        ensurePlayerProfile(user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, username: string) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error };

      // Create player profile if session is immediately available
      if (data.session && data.user) {
        await ensurePlayerProfile(data.user, username);
      }

      return { error: null };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
