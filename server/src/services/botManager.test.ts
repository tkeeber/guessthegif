import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadBotConfig, BotManagerConfig } from './botManager';

describe('loadBotConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns defaults when no env vars are set', () => {
    delete process.env.BOT_ENABLED;
    delete process.env.BOT_POLL_INTERVAL_MS;
    delete process.env.BOT_LOBBY_WAIT_THRESHOLD_MS;
    delete process.env.BOT_AUTO_START_THRESHOLD_MS;
    delete process.env.BOT_MAX_PER_LOBBY;
    delete process.env.BOT_INTERNAL_SECRET;
    delete process.env.BOT_POOL_NOVICE;
    delete process.env.BOT_POOL_INTERMEDIATE;
    delete process.env.BOT_POOL_EXPERT;

    const config = loadBotConfig();

    expect(config.enabled).toBe(true);
    expect(config.pollIntervalMs).toBe(10000);
    expect(config.lobbyWaitThresholdMs).toBe(30000);
    expect(config.autoStartThresholdMs).toBe(60000);
    expect(config.maxBotsPerLobby).toBe(2);
    expect(config.botInternalSecret).toBe('');
    expect(config.poolSize).toEqual({ novice: 2, intermediate: 2, expert: 2 });
  });

  it('disables bots when BOT_ENABLED is explicitly "false"', () => {
    process.env.BOT_ENABLED = 'false';
    const config = loadBotConfig();
    expect(config.enabled).toBe(false);
  });

  it('keeps bots enabled for any value other than "false"', () => {
    process.env.BOT_ENABLED = 'true';
    expect(loadBotConfig().enabled).toBe(true);

    process.env.BOT_ENABLED = '1';
    expect(loadBotConfig().enabled).toBe(true);

    process.env.BOT_ENABLED = '';
    expect(loadBotConfig().enabled).toBe(true);
  });

  it('reads custom values from environment variables', () => {
    process.env.BOT_POLL_INTERVAL_MS = '5000';
    process.env.BOT_LOBBY_WAIT_THRESHOLD_MS = '15000';
    process.env.BOT_AUTO_START_THRESHOLD_MS = '45000';
    process.env.BOT_MAX_PER_LOBBY = '3';
    process.env.BOT_INTERNAL_SECRET = 'my-secret-key';
    process.env.BOT_POOL_NOVICE = '4';
    process.env.BOT_POOL_INTERMEDIATE = '3';
    process.env.BOT_POOL_EXPERT = '1';

    const config = loadBotConfig();

    expect(config.pollIntervalMs).toBe(5000);
    expect(config.lobbyWaitThresholdMs).toBe(15000);
    expect(config.autoStartThresholdMs).toBe(45000);
    expect(config.maxBotsPerLobby).toBe(3);
    expect(config.botInternalSecret).toBe('my-secret-key');
    expect(config.poolSize).toEqual({ novice: 4, intermediate: 3, expert: 1 });
  });
});
