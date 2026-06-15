/**
 * BotManager — configuration and service for automated bot players.
 *
 * Manages the bot pool, polls for eligible lobbies, assigns bots,
 * and handles bot lifecycle (connect/disconnect/shutdown).
 *
 * Requirements: 1.1, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import pool from '../db';
import { TypedServer } from '../socket';
import { BotPlayer } from './botPlayer';
import { BOT_PERSONALITIES, BotPersonality } from './botPersonalities';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface BotManagerConfig {
  enabled: boolean;
  pollIntervalMs: number;
  lobbyWaitThresholdMs: number;
  autoStartThresholdMs: number;
  maxBotsPerLobby: number;
  botInternalSecret: string;
  poolSize: { novice: number; intermediate: number; expert: number };
}

/**
 * Load bot system configuration from environment variables.
 * All values have sensible defaults; BOT_INTERNAL_SECRET should be set
 * in production for bot auth to work.
 */
export function loadBotConfig(): BotManagerConfig {
  return {
    enabled: process.env.BOT_ENABLED !== 'false',
    pollIntervalMs: parseInt(process.env.BOT_POLL_INTERVAL_MS || '10000', 10),
    lobbyWaitThresholdMs: parseInt(process.env.BOT_LOBBY_WAIT_THRESHOLD_MS || '30000', 10),
    autoStartThresholdMs: parseInt(process.env.BOT_AUTO_START_THRESHOLD_MS || '60000', 10),
    maxBotsPerLobby: parseInt(process.env.BOT_MAX_PER_LOBBY || '2', 10),
    botInternalSecret: process.env.BOT_INTERNAL_SECRET || '',
    poolSize: {
      novice: parseInt(process.env.BOT_POOL_NOVICE || '2', 10),
      intermediate: parseInt(process.env.BOT_POOL_INTERMEDIATE || '2', 10),
      expert: parseInt(process.env.BOT_POOL_EXPERT || '2', 10),
    },
  };
}

// ---------------------------------------------------------------------------
// Bot Pool Seeding
// ---------------------------------------------------------------------------

/** Preset bot names per personality tier. */
export const BOT_NAMES: Record<string, string[]> = {
  novice: ['Charlie', 'River', 'Sage', 'Wren'],
  intermediate: ['Quinn', 'Morgan', 'Avery', 'Riley'],
  expert: ['Ace', 'Nova', 'Phoenix', 'Blaze'],
};

/** Display prefix per tier (used in username format). */
const TIER_PREFIX: Record<string, string> = {
  novice: 'NoviceBot',
  intermediate: 'IntermediateBot',
  expert: 'ExpertBot',
};

/**
 * Seed the bot pool in the database.
 *
 * 1. Reads the config to determine how many bots per tier.
 * 2. Checks the existing bot count in the database.
 * 3. Only seeds if fewer bots exist than the configured total.
 * 4. Creates missing bot player records with:
 *    - `is_bot = true`
 *    - synthetic `supabase_user_id` prefixed with `bot-` (e.g., `bot-novice-001`)
 *    - username format: `[Personality]Bot_[Name]`
 *    - email format: `{username}@bot.internal`
 */
export async function seedBotPool(config?: BotManagerConfig): Promise<void> {
  const cfg = config ?? loadBotConfig();
  const tiers = ['novice', 'intermediate', 'expert'] as const;

  // Determine total configured pool size
  const totalConfigured = cfg.poolSize.novice + cfg.poolSize.intermediate + cfg.poolSize.expert;

  // Check existing bot count
  const countResult = await pool.query(
    'SELECT COUNT(*) FROM players WHERE is_bot = true'
  );
  const existingCount = parseInt(countResult.rows[0].count, 10);

  if (existingCount >= totalConfigured) {
    return; // Pool already seeded
  }

  // Build the list of bot records to insert
  const botsToCreate: Array<{
    supabaseUserId: string;
    username: string;
    email: string;
  }> = [];

  for (const tier of tiers) {
    const count = cfg.poolSize[tier];
    const names = BOT_NAMES[tier];
    const prefix = TIER_PREFIX[tier];

    for (let i = 0; i < count; i++) {
      const name = names[i % names.length];
      const index = String(i + 1).padStart(3, '0');
      const supabaseUserId = `bot-${tier}-${index}`;
      const username = `${prefix}_${name}`;
      const email = `${username}@bot.internal`;

      botsToCreate.push({ supabaseUserId, username, email });
    }
  }

  // Insert only bots that don't already exist (by supabase_user_id)
  for (const bot of botsToCreate) {
    await pool.query(
      `INSERT INTO players (supabase_user_id, username, email, is_bot)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (supabase_user_id) DO NOTHING`,
      [bot.supabaseUserId, bot.username, bot.email]
    );
  }
}

// ---------------------------------------------------------------------------
// BotManager Singleton
// ---------------------------------------------------------------------------

class BotManagerService {
  private config: BotManagerConfig | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private availablePool: BotPlayer[] = [];
  private lobbyAssignments: Map<string, BotPlayer[]> = new Map();
  private serverPort: number = 3001;
  private io: TypedServer | null = null;

  /**
   * Initialize the bot system:
   * 1. Load config and check if enabled
   * 2. Seed bot pool in DB
   * 3. Build in-memory BotPlayer pool
   * 4. Get the server port from the io instance
   * 5. Start lobby polling interval
   */
  async initialize(io: TypedServer): Promise<void> {
    this.config = loadBotConfig();
    this.io = io;

    if (!this.config.enabled) {
      console.log('[BotManager] Disabled via BOT_ENABLED=false');
      return;
    }

    if (!this.config.botInternalSecret) {
      console.log('[BotManager] BOT_INTERNAL_SECRET not set, skipping initialization');
      return;
    }

    // Seed the database pool
    await seedBotPool(this.config);

    // Determine server port from the io's httpServer
    const httpServer = (io as any).httpServer || (io as any).engine?.transport?.server;
    const address = httpServer?.address?.();
    if (address && typeof address === 'object' && 'port' in address) {
      this.serverPort = address.port;
    } else {
      this.serverPort = parseInt(process.env.PORT || '3001', 10);
    }

    // Load bot player records from DB and build in-memory pool
    await this.loadBotPool();

    // Start polling
    this.pollInterval = setInterval(() => {
      this.pollLobbies().catch((err) =>
        console.error('[BotManager] Poll error:', err)
      );
    }, this.config.pollIntervalMs);

    console.log(`[BotManager] Initialized with ${this.availablePool.length} bots, polling every ${this.config.pollIntervalMs}ms`);
  }

  /**
   * Graceful shutdown: clear interval, disconnect all bots.
   */
  async shutdown(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Disconnect all assigned bots
    for (const [lobbyId, bots] of this.lobbyAssignments.entries()) {
      for (const bot of bots) {
        bot.disconnect();
      }
    }
    this.lobbyAssignments.clear();

    // Disconnect all available pool bots (in case any are connected)
    for (const bot of this.availablePool) {
      bot.disconnect();
    }

    console.log('[BotManager] Shutdown complete');
  }

  /**
   * Poll for eligible lobbies and assign bots.
   * Executes a single batched SQL query to find all eligible lobbies.
   */
  async pollLobbies(): Promise<void> {
    if (!this.config) return;

    const thresholdMs = this.config.lobbyWaitThresholdMs;

    const result = await pool.query(
      `SELECT l.id, l.created_at, COUNT(lp.player_id) AS player_count
         FROM lobbies l
         LEFT JOIN lobby_players lp ON lp.lobby_id = l.id
        WHERE l.status = 'waiting' AND l.bots_allowed = true
          AND l.created_at < NOW() - INTERVAL '${thresholdMs} milliseconds'
        GROUP BY l.id HAVING COUNT(lp.player_id) < 4`
    );

    for (const row of result.rows) {
      try {
        await this.processLobby(row.id, parseInt(row.player_count, 10));
      } catch (err) {
        // Error isolation: log and continue to next lobby
        console.error(`[BotManager] Error processing lobby ${row.id}:`, err);
      }
    }
  }

  /**
   * Process a single eligible lobby: assign available bots up to maxBotsPerLobby.
   */
  private async processLobby(lobbyId: string, currentPlayerCount: number): Promise<void> {
    if (!this.config) return;

    // Check how many bots are already assigned to this lobby
    const existingBots = this.lobbyAssignments.get(lobbyId) || [];
    const botsNeeded = Math.min(
      this.config.maxBotsPerLobby - existingBots.length,
      4 - currentPlayerCount
    );

    if (botsNeeded <= 0) return;

    const botsToAssign = this.availablePool.splice(0, botsNeeded);

    for (const bot of botsToAssign) {
      // Insert bot into lobby_players
      await pool.query(
        `INSERT INTO lobby_players (lobby_id, player_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [lobbyId, bot.playerId]
      );

      // Connect the bot socket
      bot.connect(lobbyId, this.serverPort);
    }

    // Track assignment
    const assigned = this.lobbyAssignments.get(lobbyId) || [];
    assigned.push(...botsToAssign);
    this.lobbyAssignments.set(lobbyId, assigned);
  }

  /**
   * Remove all bots from a specific lobby.
   * Disconnects sockets, removes from lobby_players, returns bots to available pool.
   */
  async removeBotsFromLobby(lobbyId: string): Promise<void> {
    const bots = this.lobbyAssignments.get(lobbyId);
    if (!bots || bots.length === 0) return;

    for (const bot of bots) {
      bot.disconnect();

      // Remove from lobby_players
      await pool.query(
        'DELETE FROM lobby_players WHERE lobby_id = $1 AND player_id = $2',
        [lobbyId, bot.playerId]
      );

      // Return to available pool
      this.availablePool.push(bot);
    }

    this.lobbyAssignments.delete(lobbyId);
  }

  /**
   * Load bot player records from the database and build in-memory BotPlayer instances.
   */
  private async loadBotPool(): Promise<void> {
    const result = await pool.query(
      `SELECT id, username, supabase_user_id FROM players WHERE is_bot = true`
    );

    for (const row of result.rows) {
      // Determine personality tier from supabase_user_id (e.g., "bot-novice-001")
      const tier = this.getTierFromUserId(row.supabase_user_id);
      const personality = BOT_PERSONALITIES[tier];
      if (!personality) continue;

      const botPlayer = new BotPlayer(row.id, row.username, personality);
      this.availablePool.push(botPlayer);
    }
  }

  /**
   * Extract the personality tier from a synthetic supabase_user_id.
   * e.g., "bot-novice-001" → "novice"
   */
  private getTierFromUserId(supabaseUserId: string): string {
    const parts = supabaseUserId.split('-');
    // Format: bot-{tier}-{index}
    if (parts.length >= 2) {
      return parts[1];
    }
    return 'novice'; // fallback
  }
}

// Export singleton instance
export const botManager = new BotManagerService();
