import { useState, useCallback, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { apiFetch } from './lib/api';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import LobbyListPage from './pages/LobbyListPage';
import LobbyPage from './pages/LobbyPage';
import LeaderboardPage from './pages/LeaderboardPage';
import AdminPage from './pages/AdminPage';
import GamePage from './pages/GamePage';

type AuthPage = 'login' | 'signup';
type AppView = 'lobby-list' | 'lobby' | 'game' | 'leaderboard' | 'admin';

interface LobbyInfo {
  lobbyId: string;
  joinCode: string;
  hostId: string;
}

function AppContent() {
  const { user, loading } = useAuth();
  const [authPage, setAuthPage] = useState<AuthPage>('login');
  const [view, setView] = useState<AppView>('lobby-list');
  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
    },
    []
  );

  const handleBackToList = useCallback(() => {
    setView('lobby-list');
    setLobbyInfo(null);
  }, []);

  const handleGameStart = useCallback((_lobbyId: string) => {
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    if (authPage === 'signup') {
      return <SignupPage onNavigateLogin={() => setAuthPage('login')} />;
    }
    return <LoginPage onNavigateSignup={() => setAuthPage('signup')} />;
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
        onBack={handleBackToList}
      />
    );
  }

  return <LobbyListPage onEnterLobby={handleEnterLobby} onOpenLeaderboard={handleOpenLeaderboard} onOpenAdmin={isAdmin ? handleOpenAdmin : undefined} />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
