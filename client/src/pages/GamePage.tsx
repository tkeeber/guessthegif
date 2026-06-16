import { useEffect, useState, useRef, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import GuessFeed, { FeedEntry } from '../components/GuessFeed';
import { colors, radii, fonts, commonStyles } from '../styles/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoundStartPayload {
  roundNumber: number;
  gifUrl: string;
}

interface RoundWonPayload {
  winnerUsername: string;
  filmName: string;
  releaseYear: number;
  director: string | null;
  leadActors: string;
  trivia: string | null;
}

interface RoundTimeoutPayload {
  filmName: string;
  releaseYear: number;
  director: string | null;
  leadActors: string;
  trivia: string | null;
}

interface RoundPendingPayload {
  nextRoundNumber: number;
  autoStartInSeconds: number;
}

interface RoundCluePayload {
  clueType: string;
  clueText: string;
}

interface GuessNewPayload {
  username: string;
  text: string;
  timestamp: string;
  isCorrect: boolean;
}

interface ChatNewPayload {
  username: string;
  text: string;
  timestamp: string;
}

interface SessionEndPayload {
  scores: { playerId: string; username: string; points: number }[];
  sessionSummary: string;
}

interface SeasonWonPayload {
  winnerUsername: string;
}

interface PlayerDisconnectedPayload {
  username: string;
}

type GamePhase =
  | 'waiting'       // waiting for round to start (before first round)
  | 'active'        // round in progress
  | 'round-result'  // showing round result briefly
  | 'round-pending' // between rounds: countdown + host "Start Next Round" button
  | 'session-end'   // all rounds done
  | 'disconnected';

interface RoundResult {
  type: 'won' | 'timeout';
  winnerUsername?: string;
  filmName: string;
  releaseYear?: number;
  director?: string | null;
  leadActors?: string;
  trivia?: string | null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GamePageProps {
  lobbyId: string;
  initialRound?: { roundNumber: number; gifUrl: string; players?: { playerId: string; username: string }[] } | null;
  isHost?: boolean;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

let feedIdCounter = 0;

export default function GamePage({ lobbyId: _lobbyId, initialRound, isHost = false, onBack }: GamePageProps) {
  const { socket, connected } = useSocket();
  const [phase, setPhase] = useState<GamePhase>('waiting');
  const [socketError, setSocketError] = useState('');

  // Round state
  const [roundNumber, setRoundNumber] = useState(0);
  const [gifUrl, setGifUrl] = useState('');
  const [timer, setTimer] = useState(0);
  const [clue, setClue] = useState<{ type: string; text: string } | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);

  // Between-round pending state
  const [nextRoundNumber, setNextRoundNumber] = useState(0);
  const [pendingCountdown, setPendingCountdown] = useState(0);
  const pendingCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Feed state
  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([]);

  // Session end state
  const [sessionScores, setSessionScores] = useState<
    { playerId: string; username: string; points: number }[]
  >([]);
  const [sessionSummary, setSessionSummary] = useState('');
  const [seasonWinner, setSeasonWinner] = useState<string | null>(null);

  // Notifications
  const [notification, setNotification] = useState('');
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Timer interval ref
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clueReceivedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Timer management
  // ---------------------------------------------------------------------------

  const startCountdown = useCallback((durationSec: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimer(durationSec);
    const endTime = Date.now() + durationSec * 1000;
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setTimer(remaining);
      if (remaining <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, 500);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Use initial round data on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (initialRound) {
      setPhase('active');
      setRoundNumber(initialRound.roundNumber);
      setGifUrl(initialRound.gifUrl);
      setClue(null);
      setRoundResult(null);
      setFeedEntries([]);
      setPendingCountdown(0);
      clueReceivedRef.current = false;
      startCountdown(120);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Socket event wiring
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!socket) return;

    function handleRoundStart(payload: RoundStartPayload) {
      // Clear any pending countdown
      if (pendingCountdownRef.current) {
        clearInterval(pendingCountdownRef.current);
        pendingCountdownRef.current = null;
      }
      setPhase('active');
      setRoundNumber(payload.roundNumber);
      setGifUrl(payload.gifUrl);
      setClue(null);
      setRoundResult(null);
      setFeedEntries([]);
      setPendingCountdown(0);
      clueReceivedRef.current = false;
      startCountdown(120);
    }

    function handleRoundClue(payload: RoundCluePayload) {
      setClue({ type: payload.clueType, text: payload.clueText });
      clueReceivedRef.current = true;
      startCountdown(60);
    }

    function handleRoundWon(payload: RoundWonPayload) {
      stopTimer();
      setRoundResult({
        type: 'won',
        winnerUsername: payload.winnerUsername,
        filmName: payload.filmName,
        releaseYear: payload.releaseYear,
        director: payload.director,
        leadActors: payload.leadActors,
        trivia: payload.trivia,
      });
      setPhase('round-result');
    }

    function handleRoundTimeout(payload: RoundTimeoutPayload) {
      stopTimer();
      setRoundResult({
        type: 'timeout',
        filmName: payload.filmName,
        releaseYear: payload.releaseYear,
        director: payload.director,
        leadActors: payload.leadActors,
        trivia: payload.trivia,
      });
      setPhase('round-result');
    }

    function handleRoundPending(payload: RoundPendingPayload) {
      setNextRoundNumber(payload.nextRoundNumber);
      setPendingCountdown(payload.autoStartInSeconds);
      setPhase('round-pending');

      // Start client-side countdown
      if (pendingCountdownRef.current) clearInterval(pendingCountdownRef.current);
      let remaining = payload.autoStartInSeconds;
      pendingCountdownRef.current = setInterval(() => {
        remaining -= 1;
        setPendingCountdown(remaining);
        if (remaining <= 0 && pendingCountdownRef.current) {
          clearInterval(pendingCountdownRef.current);
          pendingCountdownRef.current = null;
        }
      }, 1000);
    }

    function handleGuessNew(payload: GuessNewPayload) {
      setFeedEntries((prev) => [
        ...prev,
        {
          id: `guess-${++feedIdCounter}`,
          type: 'guess',
          username: payload.username,
          text: payload.text,
          timestamp: payload.timestamp,
          isCorrect: payload.isCorrect,
        },
      ]);
    }

    function handleChatNew(payload: ChatNewPayload) {
      setFeedEntries((prev) => [
        ...prev,
        {
          id: `chat-${++feedIdCounter}`,
          type: 'chat',
          username: payload.username,
          text: payload.text,
          timestamp: payload.timestamp,
        },
      ]);
    }

    function handleSessionEnd(payload: SessionEndPayload) {
      stopTimer();
      if (pendingCountdownRef.current) {
        clearInterval(pendingCountdownRef.current);
        pendingCountdownRef.current = null;
      }
      setPendingCountdown(0);
      setSessionScores(payload.scores);
      setSessionSummary(payload.sessionSummary);
      setPhase('session-end');
    }

    function handleSeasonWon(payload: SeasonWonPayload) {
      setSeasonWinner(payload.winnerUsername);
    }

    function handlePlayerDisconnected(payload: PlayerDisconnectedPayload) {
      setNotification(`${payload.username} disconnected`);
      setTimeout(() => setNotification(''), 4000);
    }

    function handleError(payload: { code?: string; message?: string }) {
      setSocketError(payload.message ?? 'An error occurred');
    }

    socket.on('round:start', handleRoundStart);
    socket.on('round:clue', handleRoundClue);
    socket.on('round:won', handleRoundWon);
    socket.on('round:timeout', handleRoundTimeout);
    socket.on('round:pending', handleRoundPending);
    socket.on('guess:new', handleGuessNew);
    socket.on('chat:new', handleChatNew);
    socket.on('session:end', handleSessionEnd);
    socket.on('season:won', handleSeasonWon);
    socket.on('player:disconnected', handlePlayerDisconnected);
    socket.on('error' as any, handleError);

    return () => {
      socket.off('round:start', handleRoundStart);
      socket.off('round:clue', handleRoundClue);
      socket.off('round:won', handleRoundWon);
      socket.off('round:timeout', handleRoundTimeout);
      socket.off('round:pending', handleRoundPending);
      socket.off('guess:new', handleGuessNew);
      socket.off('chat:new', handleChatNew);
      socket.off('session:end', handleSessionEnd);
      socket.off('season:won', handleSeasonWon);
      socket.off('player:disconnected', handlePlayerDisconnected);
      socket.off('error' as any, handleError);
    };
  }, [socket, startCountdown, stopTimer]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pendingCountdownRef.current) clearInterval(pendingCountdownRef.current);
    };
  }, []);

  // Helper for between-round countdown — kept for compatibility, now unused
  // (removed startBetweenRoundCountdown)

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function handleSubmitGuess(text: string) {
    socket?.emit('guess:submit', { text });
  }

  function handleStartNextRound() {
    console.log('[GamePage] Emitting round:next, socket connected:', socket?.connected);
    socket?.emit('round:next', {});
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function formatTimer(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // Disconnected
  // ---------------------------------------------------------------------------

  if (!connected && phase !== 'session-end') {
    return (
      <div style={styles.wrapper}>
        <div style={styles.center}>
          <h2 style={{ color: colors.textPrimary }}>Reconnecting…</h2>
          <p style={{ color: colors.textSecondary, fontSize: 15 }}>
            Trying to restore your connection. Please wait.
          </p>
          {socketError && (
            <p style={{ color: colors.error, fontSize: 14, marginTop: 12 }}>
              {socketError}
            </p>
          )}
          <button onClick={onBack} style={{ ...styles.primaryBtn, marginTop: 16 }}>
            Back to Lobbies
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Waiting
  // ---------------------------------------------------------------------------

  if (phase === 'waiting') {
    return (
      <div style={styles.wrapper}>
        <div style={styles.center}>
          <h2 style={{ color: colors.textPrimary }}>🎬 Guess the GIF</h2>
          <p style={{ color: colors.textSecondary }}>
            Waiting for the round to start…
          </p>
          {socketError && (
            <p style={{ color: colors.error, fontSize: 14, marginTop: 12 }}>
              {socketError}
            </p>
          )}
          {socketError && (
            <button onClick={onBack} style={{ ...styles.primaryBtn, marginTop: 12 }}>
              Back to Lobbies
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Round pending (between rounds — countdown + start button)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Session end
  // ---------------------------------------------------------------------------

  if (phase === 'session-end') {
    return (
      <div style={styles.wrapper}>
        <div style={styles.container}>
          <h2 style={{ textAlign: 'center', color: colors.textPrimary }}>🏁 Session Complete</h2>

          {seasonWinner && (
            <div style={styles.seasonBanner}>
              🏆 {seasonWinner} won the season!
            </div>
          )}

          <table style={styles.scoreTable}>
            <thead>
              <tr>
                <th style={styles.th}>Player</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {sessionScores.map((s) => (
                <tr key={s.playerId}>
                  <td style={styles.td}>{s.username}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>
                    {s.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {sessionSummary && (
            <p style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }}>
              {sessionSummary}
            </p>
          )}

          <button onClick={onBack} style={styles.primaryBtn}>
            Back to Lobbies
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Active round / Round result
  // ---------------------------------------------------------------------------

  const isRoundActive = phase === 'active';
  const showResult = (phase === 'round-result' || phase === 'round-pending') && roundResult;
  const showPending = phase === 'round-pending';

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {/* Header: round number + timer + exit */}
        <div style={styles.header}>
          <span style={styles.roundLabel}>
            Round {roundNumber}/3
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isRoundActive && (
              <span
                style={{
                  ...styles.timerLabel,
                  color: timer <= 10 ? colors.error : colors.textPrimary,
                }}
              >
                ⏱ {formatTimer(timer)}
              </span>
            )}
            <button
              onClick={() => setShowExitConfirm(true)}
              style={styles.exitBtn}
              aria-label="Exit game"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Exit confirmation */}
        {showExitConfirm && (
          <div style={styles.confirmOverlay}>
            <div style={styles.confirmBox}>
              <p style={styles.confirmText}>Are you sure you want to exit the game?</p>
              <div style={styles.confirmButtons}>
                <button onClick={onBack} style={styles.confirmYes}>
                  Yes, exit
                </button>
                <button onClick={() => setShowExitConfirm(false)} style={styles.confirmNo}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {notification && (
          <div style={styles.notification}>{notification}</div>
        )}

        {/* GIF display */}
        <div style={styles.gifContainer}>
          {gifUrl ? (
            <img
              src={gifUrl}
              alt="Guess this film"
              style={styles.gif}
            />
          ) : (
            <div style={styles.gifPlaceholder}>Loading GIF…</div>
          )}
        </div>

        {/* Clue */}
        {clue && (
          <div style={styles.clueBox}>
            <span style={styles.clueLabel}>Clue ({clue.type}):</span>{' '}
            {clue.text}
          </div>
        )}

        {/* Round result overlay */}
        {showResult && roundResult && (
          <div style={styles.resultBox}>
            {roundResult.type === 'won' ? (
              <div style={{ marginBottom: 4 }}>✅ WINNER: <strong>{roundResult.winnerUsername}</strong> 🔥 🔥</div>
            ) : (
              <div style={{ marginBottom: 4 }}>⏰ Time's up! Nobody guessed it.</div>
            )}
            <div style={styles.filmReveal}>{roundResult.filmName}</div>
            <div style={styles.metadataList}>
              {roundResult.releaseYear && (
                <div style={styles.metadataItem}>📅 {roundResult.releaseYear}</div>
              )}
              {roundResult.director && (
                <div style={styles.metadataItem}>🎥 {roundResult.director}</div>
              )}
              {roundResult.leadActors && (
                <div style={styles.metadataItem}>⭐️ {roundResult.leadActors}</div>
              )}
              {roundResult.trivia && (
                <div style={styles.metadataItem}>🤔 {roundResult.trivia}</div>
              )}
            </div>
          </div>
        )}

        {/* Pending — next round controls */}
        {showPending && (
          <div style={styles.pendingBox}>
            <div style={styles.pendingTitle}>Round {nextRoundNumber} coming up</div>
            <div style={styles.pendingCountdown}>
              {pendingCountdown > 0
                ? `Starts in ${pendingCountdown}s`
                : 'Starting…'}
            </div>
            {isHost ? (
              <button
                onClick={handleStartNextRound}
                style={{ ...styles.primaryBtn, marginTop: 0 }}
              >
                ▶ Start Next Round
              </button>
            ) : (
              <p style={{ color: colors.textMuted, fontSize: 14, margin: 0 }}>
                Waiting for the host to start next round…
              </p>
            )}
          </div>
        )}

        {/* Guess feed */}
        <GuessFeed
          entries={feedEntries}
          onSubmit={handleSubmitGuess}
          disabled={!isRoundActive}
        />

        {/* Player list */}
        {initialRound?.players && initialRound.players.length > 0 && (
          <div style={styles.playerListSection}>
            <span style={styles.playerListTitle}>Players</span>
            <div style={styles.playerChips}>
              {initialRound.players.map((p) => (
                <span key={p.playerId} style={styles.playerChip}>
                  {p.username.startsWith('NoviceBot_') || p.username.startsWith('IntermediateBot_') || p.username.startsWith('ExpertBot_')
                    ? `🤖 ${p.username}`
                    : p.username}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    minHeight: '100vh',
    padding: 12,
    fontFamily: fonts.base,
    background: colors.background,
    color: colors.textPrimary,
  },
  container: {
    width: '100%',
    maxWidth: 520,
    paddingTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  center: {
    textAlign: 'center' as const,
    paddingTop: 80,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roundLabel: {
    fontSize: 18,
    fontWeight: 700,
    color: colors.primary,
  },
  timerLabel: {
    fontSize: 20,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  notification: {
    background: 'rgba(245, 158, 11, 0.15)',
    color: colors.secondary,
    padding: '6px 12px',
    borderRadius: radii.input,
    fontSize: 13,
    textAlign: 'center' as const,
    border: `1px solid ${colors.secondary}`,
  },
  gifContainer: {
    width: '100%',
    borderRadius: radii.card,
    overflow: 'hidden',
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  gif: {
    width: '100%',
    maxHeight: 320,
    objectFit: 'contain' as const,
    display: 'block',
  },
  gifPlaceholder: {
    color: colors.textMuted,
    padding: 40,
  },
  clueBox: {
    background: 'rgba(245, 158, 11, 0.1)',
    border: `1px solid ${colors.secondary}`,
    borderRadius: radii.input,
    padding: '10px 14px',
    fontSize: 15,
    color: colors.textPrimary,
  },
  clueLabel: {
    fontWeight: 700,
    color: colors.secondary,
  },
  resultBox: {
    background: colors.surface,
    border: `1px solid ${colors.success}`,
    borderRadius: radii.card,
    padding: '16px',
    textAlign: 'center' as const,
    fontSize: 16,
    color: colors.textPrimary,
  },
  resultIcon: {
    fontSize: 28,
    display: 'block',
    marginBottom: 4,
  },
  filmReveal: {
    fontSize: 20,
    fontWeight: 700,
    color: colors.primary,
    marginTop: 6,
  },
  metadataList: {
    marginTop: 12,
    textAlign: 'left' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  metadataItem: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 1.4,
  },
  pendingBox: {
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.card,
    padding: '20px 16px',
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    alignItems: 'center',
  },
  pendingTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  pendingCountdown: {
    fontSize: 15,
    color: colors.textMuted,
    fontVariantNumeric: 'tabular-nums',
  },
  primaryBtn: {
    ...commonStyles.primaryButton,
    display: 'block',
    marginTop: 12,
  },
  seasonBanner: {
    background: 'rgba(245, 158, 11, 0.15)',
    border: `1px solid ${colors.secondary}`,
    borderRadius: radii.input,
    padding: '12px',
    textAlign: 'center' as const,
    fontSize: 18,
    fontWeight: 700,
    color: colors.secondary,
  },
  scoreTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    marginTop: 8,
  },
  th: {
    padding: '8px 12px',
    borderBottom: `2px solid ${colors.surfaceBorder}`,
    textAlign: 'left' as const,
    fontSize: 14,
    color: colors.textSecondary,
  },
  td: {
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.surfaceBorder}`,
    fontSize: 15,
    color: colors.textPrimary,
  },
  exitBtn: {
    padding: '6px 10px',
    fontSize: 16,
    borderRadius: radii.button,
    border: `1px solid ${colors.surfaceBorder}`,
    background: colors.surface,
    color: colors.textMuted,
    cursor: 'pointer',
    lineHeight: 1,
  },
  confirmOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  confirmBox: {
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.card,
    padding: '24px 28px',
    textAlign: 'center' as const,
    maxWidth: 320,
    width: '90%',
  },
  confirmText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: 500,
    margin: '0 0 20px',
  },
  confirmButtons: {
    display: 'flex',
    gap: 12,
  },
  confirmYes: {
    flex: 1,
    padding: '12px 0',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: radii.button,
    border: 'none',
    background: colors.error,
    color: '#fff',
    cursor: 'pointer',
  },
  confirmNo: {
    flex: 1,
    padding: '12px 0',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: radii.button,
    border: `1px solid ${colors.surfaceBorder}`,
    background: 'transparent',
    color: colors.textSecondary,
    cursor: 'pointer',
  },
  playerListSection: {
    marginTop: 12,
    padding: '10px 14px',
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.button,
  },
  playerListTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 8,
    display: 'block',
  },
  playerChips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  playerChip: {
    fontSize: 13,
    padding: '4px 10px',
    borderRadius: 12,
    background: colors.inputBg,
    border: `1px solid ${colors.inputBorder}`,
    color: colors.textSecondary,
  },
};
