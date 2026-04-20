-- 001_initial_schema.sql
-- Initial database schema for Guess the Gif
-- PostgreSQL via Supabase

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE lobby_status AS ENUM ('waiting', 'in_session', 'closed');
CREATE TYPE session_status AS ENUM ('active', 'completed');
CREATE TYPE round_status AS ENUM ('pending', 'active', 'clue_given', 'won', 'timeout', 'completed');

-- ============================================================
-- TABLES
-- ============================================================

-- Players
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supabase_user_id UUID NOT NULL UNIQUE,
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seasons
CREATE TABLE seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_number INTEGER NOT NULL UNIQUE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    winner_id UUID REFERENCES players(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE
);

-- Season Scores
CREATE TABLE season_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    correct_guess_count INTEGER NOT NULL DEFAULT 0,
    last_correct_at TIMESTAMPTZ,
    UNIQUE (player_id, season_id)
);

-- Lobbies
CREATE TABLE lobbies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    join_code VARCHAR(6) NOT NULL UNIQUE,
    host_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    status lobby_status NOT NULL DEFAULT 'waiting',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lobby Players (join table)
CREATE TABLE lobby_players (
    lobby_id UUID NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (lobby_id, player_id)
);

-- GIFs
CREATE TABLE gifs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    film_name VARCHAR(500) NOT NULL,
    tmdb_movie_id INTEGER NOT NULL,
    giphy_gif_id VARCHAR(255) NOT NULL,
    gif_url TEXT NOT NULL,
    lead_actors TEXT NOT NULL,
    release_year INTEGER NOT NULL,
    theme VARCHAR(500) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id UUID NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    status session_status NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- Rounds
CREATE TABLE rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    gif_id UUID NOT NULL REFERENCES gifs(id) ON DELETE RESTRICT,
    round_number INTEGER NOT NULL,
    status round_status NOT NULL DEFAULT 'pending',
    winner_id UUID REFERENCES players(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    clue_given BOOLEAN NOT NULL DEFAULT FALSE
);

-- Guesses
CREATE TABLE guesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feed Messages
CREATE TABLE feed_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Players
CREATE INDEX idx_players_supabase_user_id ON players(supabase_user_id);

-- Season Scores
CREATE INDEX idx_season_scores_player_id ON season_scores(player_id);
CREATE INDEX idx_season_scores_season_id ON season_scores(season_id);
CREATE INDEX idx_season_scores_ranking ON season_scores(season_id, correct_guess_count DESC, last_correct_at ASC);

-- Lobbies
CREATE INDEX idx_lobbies_status ON lobbies(status);
CREATE INDEX idx_lobbies_join_code ON lobbies(join_code);

-- Lobby Players
CREATE INDEX idx_lobby_players_player_id ON lobby_players(player_id);

-- GIFs
CREATE INDEX idx_gifs_is_active ON gifs(is_active);

-- Sessions
CREATE INDEX idx_sessions_lobby_id ON sessions(lobby_id);
CREATE INDEX idx_sessions_season_id ON sessions(season_id);

-- Rounds
CREATE INDEX idx_rounds_session_id ON rounds(session_id);
CREATE INDEX idx_rounds_gif_id ON rounds(gif_id);

-- Guesses
CREATE INDEX idx_guesses_round_id ON guesses(round_id);
CREATE INDEX idx_guesses_player_id ON guesses(player_id);
CREATE INDEX idx_guesses_submitted_at ON guesses(round_id, submitted_at ASC);

-- Feed Messages
CREATE INDEX idx_feed_messages_round_id ON feed_messages(round_id);
CREATE INDEX idx_feed_messages_created_at ON feed_messages(round_id, created_at ASC);
