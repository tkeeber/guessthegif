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
}

interface RoundTimeoutPayload {
  filmName: string;
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
  | 'waiting'       // waiting for round to start (between rounds)
  | 'active'        // round in progress
  | 'round-result'  // showing round result briefly
  | 'session-end'   // all 3 rounds done
  | 'disconnected';

interface RoundResult {
  type: 'won' | 'timeout';
  winnerUsername?: string;
  filmName: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GamePageProps {
  lobbyId: string;
  initialRound?: { roundNumber: number; gifUrl: string } | null;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

let feedIdCounter = 0;

export default function GamePage({ lobbyId: _lobbyId, initialRound, onBack }: GamePageProps) {
  const { socket, connected } = useSocket();
  const [phase, setPhase] = useState<GamePhase>('waiting');
  const [socketError, setSocketError] = useState('');

  // Round state
  const [roundNumber, setRoundNumber] = useState(0);
  const [gifUrl, setGifUrl] = useState('');
  const [timer, setTimer] = useState(0);
  const [clue, setClue] = useState<{ type: string; text: string } | null>(null);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [betweenRoundCountdown, setBetweenRoundCountdown] = useState(0);

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
      setBetweenRoundCountdown(0);
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
      setPhase('active');
      setRoundNumber(payload.roundNumber);
      setGifUrl(payload.gifUrl);
      setClue(null);
      setRoundResult(null);
      setFeedEntries([]);
      setBetweenRoundCountdown(0);
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
      });
      setPhase('round-result');
      startBetweenRoundCountdown();
    }

    function handleRoundTimeout(payload: RoundTimeoutPayload) {
      stopTimer();
      setRoundResult({
        type: 'timeout',
        filmName: payload.filmName,
      });
      setPhase('round-result');
      startBetweenRoundCountdown();
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
      setBetweenRoundCountdown(0);
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
    };
  }, []);

  // Helper for between-round countdown
  function startBetweenRoundCountdown() {
    setBetweenRoundCountdown(5);
    let count = 5;
    const iv = setInterval(() => {
      count--;
      setBetweenRoundCountdown(count);
      if (count <= 0) clearInterval(iv);
    }, 1000);
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function handleSubmitGuess(text: string) {
    socket?.emit('guess:submit', { text });
  }

  function handleSubmitChat(text: string) {
    socket?.emit('chat:message', { text });
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
            {betweenRoundCountdown > 0
              ? `Next round in ${betweenRoundCountdown}s…`
              : 'Waiting for the round to start…'}
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
  const showResult = phase === 'round-result' && roundResult;

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {/* Header: round number + timer */}
        <div style={styles.header}>
          <span style={styles.roundLabel}>
            Round {roundNumber}/3
          </span>
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
        </div>

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
              <>
                <span style={styles.resultIcon}>🎉</span>
                <strong>{roundResult.winnerUsername}</strong> guessed it!
                <div style={styles.filmReveal}>{roundResult.filmName}</div>
              </>
            ) : (
              <>
                <span style={styles.resultIcon}>⏰</span>
                Time's up! The film was:
                <div style={styles.filmReveal}>{roundResult.filmName}</div>
              </>
            )}
            {betweenRoundCountdown > 0 && (
              <div style={styles.nextRound}>
                Next round in {betweenRoundCountdown}s…
              </div>
            )}
          </div>
        )}

        {/* Guess feed */}
        <GuessFeed
          entries={feedEntries}
          onSubmitGuess={handleSubmitGuess}
          onSubmitChat={handleSubmitChat}
          disabled={!isRoundActive}
        />
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
  nextRound: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textMuted,
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
};
