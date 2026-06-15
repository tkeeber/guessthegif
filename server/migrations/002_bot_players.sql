-- 002_bot_players.sql
-- Add bot-related columns to players and lobbies tables

-- Add is_bot flag to players table
ALTER TABLE players ADD COLUMN is_bot BOOLEAN NOT NULL DEFAULT FALSE;

-- Add bots_allowed flag to lobbies table
ALTER TABLE lobbies ADD COLUMN bots_allowed BOOLEAN NOT NULL DEFAULT TRUE;

-- Partial index for quick bot player lookups (only indexes rows where is_bot = true)
CREATE INDEX idx_players_is_bot ON players(is_bot) WHERE is_bot = true;

-- Composite index for lobby monitoring queries (bot eligibility polling)
CREATE INDEX idx_lobbies_bots_allowed ON lobbies(bots_allowed, status);
