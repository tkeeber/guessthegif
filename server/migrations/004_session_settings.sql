-- 004_session_settings.sql
-- Add configurable session settings to lobbies: gif duration and rounds per session

ALTER TABLE lobbies ADD COLUMN gif_duration_seconds INTEGER NOT NULL DEFAULT 60;
ALTER TABLE lobbies ADD COLUMN rounds_per_session INTEGER NOT NULL DEFAULT 3;
ALTER TABLE lobbies ADD CONSTRAINT chk_gif_duration CHECK (gif_duration_seconds >= 10);
ALTER TABLE lobbies ADD CONSTRAINT chk_rounds CHECK (rounds_per_session IN (3, 5, 10));
