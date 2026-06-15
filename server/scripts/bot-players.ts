/**
 * Bot Players Script
 *
 * Simulates multiple players connecting to a game lobby via Socket.IO.
 * Uses dev bypass (NODE_ENV=development) to skip Supabase auth.
 *
 * Usage:
 *   npm run bots -- --lobby-code ABC123 --bots 3
 *   npm run bots -- --lobby-code ABC123 --bots 5 --server-url http://localhost:3001
 */

import { io, Socket } from 'socket.io-client';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load env from server/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): { serverUrl: string; lobbyCode: string; botCount: number } {
  const args = process.argv.slice(2);
  let serverUrl = 'http://localhost:3001';
  let lobbyCode = '';
  let botCount = 2;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--server-url':
        serverUrl = args[++i];
        break;
      case '--lobby-code':
        lobbyCode = args[++i];
        break;
      case '--bots':
        botCount = parseInt(args[++i], 10);
        break;
    }
  }

  if (!lobbyCode) {
    console.error('❌ --lobby-code is required');
    console.error('Usage: npm run bots -- --lobby-code ABC123 --bots 3');
    process.exit(1);
  }

  if (isNaN(botCount) || botCount < 1) {
    console.error('❌ --bots must be a positive number');
    process.exit(1);
  }

  return { serverUrl, lobbyCode, botCount };
}

// ---------------------------------------------------------------------------
// Film title corpus for random guesses
// ---------------------------------------------------------------------------

const FILM_TITLES = [
  'The Shawshank Redemption',
  'The Godfather',
  'The Dark Knight',
  'Pulp Fiction',
  'Forrest Gump',
  'Inception',
  'The Matrix',
  'Fight Club',
  'Goodfellas',
  'The Silence of the Lambs',
  'Star Wars',
  'Jurassic Park',
  'Titanic',
  'The Lion King',
  'Back to the Future',
  'Gladiator',
  'The Departed',
  'Interstellar',
  'The Prestige',
  'Memento',
  'Toy Story',
  'Finding Nemo',
  'Avatar',
  'Jaws',
  'Alien',
  'Die Hard',
  'Home Alone',
  'Ghostbusters',
  'Indiana Jones',
  'The Terminator',
  'Rocky',
  'E.T.',
  'Schindler\'s List',
  'Braveheart',
  'The Truman Show',
  'Saving Private Ryan',
  'The Green Mile',
  'Django Unchained',
  'Mad Max: Fury Road',
  'Whiplash',
  'La La Land',
  'Get Out',
  'Parasite',
  'Joker',
  'Dune',
  'Top Gun',
  'The Shining',
  'Psycho',
  'The Exorcist',
  'A Quiet Place',
];

function getRandomFilmTitle(): string {
  return FILM_TITLES[Math.floor(Math.random() * FILM_TITLES.length)];
}

function getRandomDelay(): number {
  // 3-8 seconds in ms
  return (3 + Math.random() * 5) * 1000;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

function createPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });
}

async function createBotPlayer(
  pool: Pool,
  botIndex: number
): Promise<{ id: string; username: string }> {
  const username = `Bot_${botIndex}_${Date.now().toString(36)}`;
  const email = `bot-${botIndex}-${Date.now()}@bot.local`;
  // Use a fake supabase_user_id (UUID format)
  const fakeSupabaseId = `00000000-0000-0000-0000-${String(Date.now()).slice(-12).padStart(12, '0').slice(0, 11)}${botIndex}`;

  const result = await pool.query(
    `INSERT INTO players (supabase_user_id, username, email)
     VALUES ($1, $2, $3)
     RETURNING id, username`,
    [fakeSupabaseId, username, email]
  );

  return result.rows[0];
}

async function getLobbyId(pool: Pool, lobbyCode: string): Promise<string> {
  const result = await pool.query(
    'SELECT id FROM lobbies WHERE join_code = $1',
    [lobbyCode.toUpperCase()]
  );

  if (result.rows.length === 0) {
    throw new Error(`Lobby with code "${lobbyCode}" not found`);
  }

  return result.rows[0].id;
}

async function getCorrectAnswer(pool: Pool, lobbyId: string): Promise<string | null> {
  // Look for the active round in the current session for this lobby
  const result = await pool.query(
    `SELECT g.film_name
       FROM rounds r
       JOIN sessions s ON s.id = r.session_id
       JOIN gifs g ON g.id = r.gif_id
      WHERE s.lobby_id = $1
        AND r.status IN ('active', 'clue_given')
      ORDER BY r.round_number DESC
      LIMIT 1`,
    [lobbyId]
  );

  return result.rows[0]?.film_name ?? null;
}

// ---------------------------------------------------------------------------
// Bot class
// ---------------------------------------------------------------------------

class Bot {
  public name: string;
  public playerId: string;
  private socket: Socket | null = null;
  private guessInterval: NodeJS.Timeout | null = null;
  private pool: Pool;
  private lobbyId: string;
  private serverUrl: string;
  private isRoundActive = false;

  constructor(
    name: string,
    playerId: string,
    pool: Pool,
    lobbyId: string,
    serverUrl: string
  ) {
    this.name = name;
    this.playerId = playerId;
    this.pool = pool;
    this.lobbyId = lobbyId;
    this.serverUrl = serverUrl;
  }

  async joinLobby(lobbyCode: string): Promise<void> {
    const response = await fetch(
      `${this.serverUrl}/api/lobbies/${lobbyCode}/join`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-bypass': 'true',
          'x-dev-player-id': this.playerId,
        },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to join lobby: ${response.status} ${body}`);
    }

    this.log(`✅ Joined lobby via REST API`);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, {
        auth: {
          devBypass: true,
          playerId: this.playerId,
        },
        query: {
          lobbyId: this.lobbyId,
        },
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        this.log(`🔌 Connected to Socket.IO (id: ${this.socket!.id})`);
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        this.log(`❌ Connection error: ${err.message}`);
        reject(err);
      });

      this.socket.on('disconnect', (reason) => {
        this.log(`🔌 Disconnected: ${reason}`);
        this.stopGuessing();
      });

      // Listen for game events
      this.socket.on('round:start', (payload) => {
        this.log(`🎬 Round ${payload.roundNumber} started! GIF: ${payload.gifUrl.substring(0, 50)}...`);
        this.isRoundActive = true;
        this.startGuessing();
      });

      this.socket.on('round:won', (payload) => {
        this.log(`🏆 Round won by ${payload.winnerUsername}! Film: ${payload.filmName}`);
        this.isRoundActive = false;
        this.stopGuessing();
      });

      this.socket.on('round:timeout', (payload) => {
        this.log(`⏰ Round timed out! Film was: ${payload.filmName}`);
        this.isRoundActive = false;
        this.stopGuessing();
      });

      this.socket.on('round:clue', (payload) => {
        this.log(`💡 Clue received [${payload.clueType}]: ${payload.clueText}`);
      });

      this.socket.on('guess:new', (payload) => {
        if (payload.username !== this.name) {
          const status = payload.isCorrect ? '✅' : '❌';
          this.log(`  ${status} ${payload.username} guessed: "${payload.text}"`);
        }
      });

      this.socket.on('session:end', (payload) => {
        this.log(`🏁 Session ended! Summary: ${payload.sessionSummary}`);
        this.isRoundActive = false;
        this.stopGuessing();
      });

      this.socket.on('lobby:update', (payload) => {
        this.log(`👥 Lobby update: ${payload.players.length} players`);
      });
    });
  }

  private startGuessing(): void {
    this.stopGuessing();
    this.scheduleNextGuess();
  }

  private stopGuessing(): void {
    if (this.guessInterval) {
      clearTimeout(this.guessInterval);
      this.guessInterval = null;
    }
  }

  private scheduleNextGuess(): void {
    if (!this.isRoundActive) return;

    const delay = getRandomDelay();
    this.guessInterval = setTimeout(async () => {
      if (!this.isRoundActive || !this.socket?.connected) return;

      let guessText: string;

      // 20% chance of guessing the correct answer
      if (Math.random() < 0.2) {
        const correctAnswer = await getCorrectAnswer(this.pool, this.lobbyId);
        if (correctAnswer) {
          guessText = correctAnswer;
          this.log(`🎯 Submitting correct answer: "${guessText}"`);
        } else {
          guessText = getRandomFilmTitle();
          this.log(`🎲 Guessing (random): "${guessText}"`);
        }
      } else {
        guessText = getRandomFilmTitle();
        this.log(`🎲 Guessing (random): "${guessText}"`);
      }

      this.socket!.emit('guess:submit', { text: guessText });

      // Schedule next guess
      this.scheduleNextGuess();
    }, delay);
  }

  disconnect(): void {
    this.stopGuessing();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.log('👋 Disconnected');
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[${timestamp}] [${this.name}] ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { serverUrl, lobbyCode, botCount } = parseArgs();

  console.log('🤖 Bot Players Script');
  console.log(`   Server:     ${serverUrl}`);
  console.log(`   Lobby Code: ${lobbyCode}`);
  console.log(`   Bot Count:  ${botCount}`);
  console.log('');

  const pool = createPool();

  // Verify the lobby exists
  let lobbyId: string;
  try {
    lobbyId = await getLobbyId(pool, lobbyCode);
    console.log(`✅ Found lobby: ${lobbyId}`);
  } catch (err: any) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  // Create bot players and connect them
  const bots: Bot[] = [];

  for (let i = 1; i <= botCount; i++) {
    try {
      const player = await createBotPlayer(pool, i);
      console.log(`✅ Created bot player: ${player.username} (${player.id})`);

      const bot = new Bot(player.username, player.id, pool, lobbyId, serverUrl);

      // Join lobby via REST
      await bot.joinLobby(lobbyCode);

      // Connect via Socket.IO
      await bot.connect();

      bots.push(bot);
    } catch (err: any) {
      console.error(`❌ Failed to create/connect bot ${i}: ${err.message}`);
    }
  }

  if (bots.length === 0) {
    console.error('❌ No bots connected successfully. Exiting.');
    await pool.end();
    process.exit(1);
  }

  console.log('');
  console.log(`🤖 ${bots.length} bots connected and waiting for rounds.`);
  console.log('   Press Ctrl+C to stop.');
  console.log('');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down bots...');

    for (const bot of bots) {
      bot.disconnect();
    }

    // Clean up bot player records from the database
    for (const bot of bots) {
      try {
        await pool.query('DELETE FROM lobby_players WHERE player_id = $1', [bot.playerId]);
        await pool.query('DELETE FROM players WHERE id = $1', [bot.playerId]);
      } catch {
        // Best effort cleanup
      }
    }

    await pool.end();
    console.log('👋 All bots disconnected. Bye!');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
