-- 003_lobby_options.sql
-- Add lobby configuration options: name, max players, invite-only

ALTER TABLE lobbies ADD COLUMN name VARCHAR(100);
ALTER TABLE lobbies ADD COLUMN max_players INTEGER NOT NULL DEFAULT 8;
ALTER TABLE lobbies ADD COLUMN invite_only BOOLEAN NOT NULL DEFAULT FALSE;
