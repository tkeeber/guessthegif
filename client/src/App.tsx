import { useState, useCallback, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider, useSocket } from './contexts/SocketContext';
import { apiFetch } from './lib/api';
import { colors, fonts } from './styles/theme';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import LobbyListPage from './pages/LobbyListPage';
import LobbyPage from './pages/LobbyPage';
import LeaderboardPage from './pages/LeaderboardPage';
import AdminPage from './pages/AdminPage';
import GamePage from './pages/GamePage';
import type { RoundStartData } from './pages/LobbyPage';

type AuthPage = 'login' | 'signup' | 'forgot-password';
type AppView = 'lobby-list' | 'lobby' | 'game' | 'leaderboard' | 'admin';

interface LobbyInfo {
  lobbyId: string;
  joinCode: string;
  hostId: string;
}

function AppContent() {
  const { user, loading } = useAuth();
  const { connectToLobby, disconnect } = useSocket();
  const [authPage, setAuthPage] = useState<AuthPage>('login');
  const [view, setView] = useState<AppView>('lobby-list');
  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo | null>(null);
  const [initialRound, setInitialRound] = useState<RoundStartData | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Detect Supabase recovery token in URL hash on mount
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      setShowResetPassword(true);
    }
  }, []);

  // Check admin status when user is authenticated
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    apiFetch<{ player: { is_admin: boolean } }>('/api/auth/me')
      .then((data) => setIsAdmin(data.player.is_admin))
      .catch(() => setIsAdmin(false));
  }, [user]);

  const handleEnterLobby = useCallback(
    (lobbyId: string, joinCode: string, hostId: string) => {
      setLobbyInfo({ lobbyId, joinCode, hostId });
      setView('lobby');
      connectToLobby(lobbyId);
    },
    [connectToLobby]
  );

  const handleBackToList = useCallback(() => {
    disconnect();
    setView('lobby-list');
    setLobbyInfo(null);
  }, [disconnect]);

  const handleGameStart = useCallback((_lobbyId: string, roundData: RoundStartData) => {
    setInitialRound(roundData);
    setView('game');
  }, []);

  const handleOpenLeaderboard = useCallback(() => {
    setView('leaderboard');
  }, []);

  const handleOpenAdmin = useCallback(() => {
    setView('admin');
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: colors.background, fontFamily: fonts.base }}>
        <p style={{ color: colors.textPrimary }}>Loading…</p>
      </div>
    );
  }

  // Show reset password page when recovery token is detected
  if (showResetPassword) {
    return (
      <ResetPasswordPage
        onComplete={() => {
          setShowResetPassword(false);
          setView('lobby-list');
        }}
      />
    );
  }

  if (!user) {
    if (authPage === 'signup') {
      return <SignupPage onNavigateLogin={() => setAuthPage('login')} />;
    }
    if (authPage === 'forgot-password') {
      return <ForgotPasswordPage onNavigateLogin={() => setAuthPage('login')} />;
    }
    return (
      <LoginPage
        onNavigateSignup={() => setAuthPage('signup')}
        onNavigateForgotPassword={() => setAuthPage('forgot-password')}
      />
    );
  }

  // Authenticated views
  if (view === 'leaderboard') {
    return <LeaderboardPage onBack={handleBackToList} />;
  }

  if (view === 'admin' && isAdmin) {
    return <AdminPage onBack={handleBackToList} />;
  }

  if (view === 'lobby' && lobbyInfo) {
    return (
      <LobbyPage
        lobbyId={lobbyInfo.lobbyId}
        joinCode={lobbyInfo.joinCode}
        hostId={lobbyInfo.hostId}
        currentUserId={user.id}
        onBack={handleBackToList}
        onGameStart={handleGameStart}
      />
    );
  }

  if (view === 'game' && lobbyInfo) {
    return (
      <GamePage
        lobbyId={lobbyInfo.lobbyId}
        initialRound={initialRound}
        onBack={handleBackToList}
      />
    );
  }

  return <LobbyListPage onEnterLobby={handleEnterLobby} onOpenLeaderboard={handleOpenLeaderboard} onOpenAdmin={isAdmin ? handleOpenAdmin : undefined} />;
}

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppContent />
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
