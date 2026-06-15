import { useEffect, useState, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { createSocket } from '../lib/socket';
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
  | 'connecting'
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
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

let feedIdCounter = 0;

export default function GamePage({ lobbyId, onBack }: GamePageProps) {
  const socketRef = useRef<Socket | null>(null);
  const [phase, setPhase] = useState<GamePhase>('connecting');
  const [reconnecting, setReconnecting] = useState(false);

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
  const roundStartTimeRef = useRef<number>(0);
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
  // Socket connection and event wiring
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let mounted = true;

    async function connect() {
      try {
        const socket = await createSocket(lobbyId);
        if (!mounted) { socket.disconnect(); return; }
        socketRef.current = socket;

        socket.on('connect', () => {
          if (!mounted) return;
          setReconnecting(false);
          // If we were disconnected, we're back
          setPhase((prev) => (prev === 'disconnected' ? 'waiting' : prev));
        });

        socket.on('disconnect', () => {
          if (!mounted) return;
          setReconnecting(true);
        });

        socket.on('connect_error', () => {
          if (!mounted) return;
          setReconnecting(true);
        });

        // --- Game events ---

        socket.on('round:start', (payload: RoundStartPayload) => {
          if (!mounted) return;
          setPhase('active');
          setRoundNumber(payload.roundNumber);
          setGifUrl(payload.gifUrl);
          setClue(null);
          setRoundResult(null);
          setFeedEntries([]);
          setBetweenRoundCountdown(0);
          clueReceivedRef.current = false;
          roundStartTimeRef.current = Date.now();
          startCountdown(120); // 120s initial timer
        });

        socket.on('round:clue', (payload: RoundCluePayload) => {
          if (!mounted) return;
          setClue({ type: payload.clueType, text: payload.clueText });
          clueReceivedRef.current = true;
          startCountdown(60); // 60s post-clue timer
        });

        socket.on('round:won', (payload: RoundWonPayload) => {
          if (!mounted) return;
          stopTimer();
          setRoundResult({
            type: 'won',
            winnerUsername: payload.winnerUsername,
            filmName: payload.filmName,
          });
          setPhase('round-result');
          // Start 5-second between-round countdown
          startBetweenRoundCountdown();
        });

        socket.on('round:timeout', (payload: RoundTimeoutPayload) => {
          if (!mounted) return;
          stopTimer();
          setRoundResult({
            type: 'timeout',
            filmName: payload.filmName,
          });
          setPhase('round-result');
          startBetweenRoundCountdown();
        });

        socket.on('guess:new', (payload: GuessNewPayload) => {
          if (!mounted) return;
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
        });

        socket.on('chat:new', (payload: ChatNewPayload) => {
          if (!mounted) return;
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
        });

        socket.on('session:end', (payload: SessionEndPayload) => {
          if (!mounted) return;
          stopTimer();
          setBetweenRoundCountdown(0);
          setSessionScores(payload.scores);
          setSessionSummary(payload.sessionSummary);
          setPhase('session-end');
        });

        socket.on('season:won', (payload: SeasonWonPayload) => {
          if (!mounted) return;
          setSeasonWinner(payload.winnerUsername);
        });

        socket.on('player:disconnected', (payload: PlayerDisconnectedPayload) => {
          if (!mounted) return;
          setNotification(`${payload.username} disconnected`);
          setTimeout(() => {
            if (mounted) setNotification('');
          }, 4000);
        });

        // Connection established — wait for round:start
        setPhase('waiting');
      } catch {
        if (mounted) setPhase('disconnected');
      }
    }

    function startBetweenRoundCountdown() {
      setBetweenRoundCountdown(5);
      let count = 5;
      const iv = setInterval(() => {
        count--;
        if (!mounted) { clearInterval(iv); return; }
        setBetweenRoundCountdown(count);
        if (count <= 0) clearInterval(iv);
      }, 1000);
    }

    connect();

    // Reconnection timeout: if reconnecting for > 30s, give up
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    const checkReconnect = setInterval(() => {
      if (!mounted) return;
      // If socket is disconnected, start a 30s timer
      const sock = socketRef.current;
      if (sock && !sock.connected) {
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            if (!mounted) return;
            setPhase('disconnected');
            setReconnecting(false);
          }, 30_000);
        }
      } else {
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
      }
    }, 2000);

    return () => {
      mounted = false;
      clearInterval(checkReconnect);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      socketRef.current?.disconnect();
      socketRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [lobbyId, startCountdown, stopTimer]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function handleSubmitGuess(text: string) {
    socketRef.current?.emit('guess:submit', { text });
  }

  function handleSubmitChat(text: string) {
    socketRef.current?.emit('chat:message', { text });
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
  // Reconnecting overlay
  // ---------------------------------------------------------------------------

  if (reconnecting) {
    return (
      <div style={styles.overlay}>
        <div style={styles.overlayBox}>
          <h2 style={{ margin: '0 0 8px', color: colors.textPrimary }}>Reconnecting…</h2>
          <p style={{ color: colors.textSecondary, margin: 0 }}>
            Trying to restore your connection. Please wait.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Disconnected
  // ---------------------------------------------------------------------------

  if (phase === 'disconnected') {
    return (
      <div style={styles.wrapper}>
        <div style={styles.center}>
          <h2 style={{ color: colors.textPrimary }}>Disconnected</h2>
          <p style={{ color: colors.textSecondary }}>
            Could not reconnect to the game server.
          </p>
          <button onClick={onBack} style={styles.primaryBtn}>
            Back to Lobbies
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Connecting / Waiting
  // ---------------------------------------------------------------------------

  if (phase === 'connecting' || phase === 'waiting') {
    return (
      <div style={styles.wrapper}>
        <div style={styles.center}>
          <h2 style={{ color: colors.textPrimary }}>🎬 Guess the GIF</h2>
          <p style={{ color: colors.textSecondary }}>
            {phase === 'connecting'
              ? 'Connecting to game…'
              : betweenRoundCountdown > 0
                ? `Next round in ${betweenRoundCountdown}s…`
                : 'Waiting for the round to start…'}
          </p>
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
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(15, 15, 35, 0.85)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    fontFamily: fonts.base,
  },
  overlayBox: {
    background: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: radii.card,
    padding: '32px 40px',
    textAlign: 'center' as const,
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
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
