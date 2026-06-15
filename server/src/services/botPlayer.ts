/**
 * BotPlayer — represents an individual bot's runtime state and socket connection.
 *
 * Each BotPlayer maintains an in-process Socket.IO client connection to the server,
 * handles round lifecycle events, and submits guesses according to its personality.
 *
 * Requirements: 1.5, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1, 5.2, 5.5, 5.6, 7.4
 */

import { io as ioClient, Socket } from 'socket.io-client';
import pool from '../db';
import { BotPersonality, getRandomDelay, shouldGuessCorrectly } from './botPersonalities';
import { getRandomFilmTitle } from './botFilmPool';

export class BotPlayer {
  playerId: string;
  username: string;
  personality: BotPersonality;
  socket: Socket | null = null;
  currentLobbyId: string | null = null;
  guessTimer: NodeJS.Timeout | null = null;
  hasReceivedClue: boolean = false;

  private currentRoundId: string | null = null;

  constructor(playerId: string, username: string, personality: BotPersonality) {
    this.playerId = playerId;
    this.username = username;
    this.personality = personality;
  }

  /**
   * Connect to the Socket.IO server using internal bot auth.
   * Uses an in-process connection (localhost) to avoid network overhead.
   */
  connect(lobbyId: string, serverPort: number): void {
    const botSecret = process.env.BOT_INTERNAL_SECRET || '';

    this.socket = ioClient(`http://localhost:${serverPort}`, {
      auth: {
        botSecret,
        botPlayerId: this.playerId,
      },
      query: {
        lobbyId,
      },
      // In-process connection settings
      transports: ['websocket'],
      reconnection: false,
    });

    this.currentLobbyId = lobbyId;

    // --- Round lifecycle event handlers (Task 6.4) ---
    this.socket.on('round:start', (payload: { roundNumber: number; gifUrl: string }) => {
      this.startGuessing();
    });

    this.socket.on('round:won', () => {
      this.stopGuessing();
    });

    this.socket.on('round:timeout', () => {
      this.stopGuessing();
    });

    this.socket.on('session:end', () => {
      this.stopGuessing();
    });

    // --- Expert post-clue probability boost (Task 6.3) ---
    this.socket.on('round:clue', () => {
      this.hasReceivedClue = true;
    });
  }

  /**
   * Disconnect the bot socket and clear all timers.
   */
  disconnect(): void {
    this.stopGuessing();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentLobbyId = null;
    this.currentRoundId = null;
  }

  /**
   * Start the guessing loop: schedule a guess after a random delay.
   */
  startGuessing(): void {
    this.stopGuessing();
    this.scheduleNextGuess();
  }

  /**
   * Stop all guess activity — clear the timer.
   */
  stopGuessing(): void {
    if (this.guessTimer) {
      clearTimeout(this.guessTimer);
      this.guessTimer = null;
    }
    this.currentRoundId = null;
  }

  /**
   * Schedule the next guess after a random delay within the personality's range.
   */
  private scheduleNextGuess(): void {
    const delay = getRandomDelay(this.personality);

    this.guessTimer = setTimeout(async () => {
      await this.submitGuess();
      // Schedule the next guess
      this.scheduleNextGuess();
    }, delay);
  }

  /**
   * Decide whether to guess correctly or incorrectly, then emit the guess.
   */
  private async submitGuess(): Promise<void> {
    if (!this.socket || !this.currentLobbyId) return;

    try {
      const correct = shouldGuessCorrectly(this.personality, this.hasReceivedClue);

      // Reset post-clue boost after using it
      if (this.hasReceivedClue) {
        this.hasReceivedClue = false;
      }

      let guessText: string;

      if (correct) {
        // Query DB for the current round's film name
        const filmName = await this.getCurrentRoundFilmName();
        if (!filmName) {
          // Round may have ended; just use random title
          guessText = getRandomFilmTitle();
        } else {
          guessText = filmName;
        }
      } else {
        guessText = getRandomFilmTitle();
      }

      // Emit guess via socket
      this.socket.emit('guess:submit', { text: guessText });
    } catch (err) {
      // Silently ignore errors (round may have ended)
      console.error(`Bot ${this.username} guess error:`, err);
    }
  }

  /**
   * Query the database for the current active round's film name in this bot's lobby.
   */
  private async getCurrentRoundFilmName(): Promise<string | null> {
    try {
      const result = await pool.query(
        `SELECT g.film_name
           FROM rounds r
           JOIN sessions s ON s.id = r.session_id
           JOIN gifs g ON g.id = r.gif_id
          WHERE s.lobby_id = $1
            AND r.status IN ('active', 'clue_given')
          ORDER BY r.round_number DESC
          LIMIT 1`,
        [this.currentLobbyId]
      );

      if (result.rows.length === 0) return null;
      return result.rows[0].film_name;
    } catch {
      return null;
    }
  }
}
