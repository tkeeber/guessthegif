// Entity interfaces matching the database schema in server/migrations/001_initial_schema.sql

import {
  LobbyStatus,
  SessionStatus,
  RoundStatus,
  ClueType,
} from './enums';

export interface Player {
  id: string;
  supabase_user_id: string;
  username: string;
  email: string;
  is_admin: boolean;
  created_at: string;
}

export interface Season {
  id: string;
  season_number: number;
  started_at: string;
  ended_at: string | null;
  winner_id: string | null;
  is_active: boolean;
}

export interface SeasonScore {
  id: string;
  player_id: string;
  season_id: string;
  correct_guess_count: number;
  last_correct_at: string | null;
}

export interface Lobby {
  id: string;
  join_code: string;
  host_id: string;
  status: LobbyStatus;
  created_at: string;
}

export interface LobbyPlayer {
  lobby_id: string;
  player_id: string;
  joined_at: string;
}

export interface Session {
  id: string;
  lobby_id: string;
  season_id: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
}

export interface Round {
  id: string;
  session_id: string;
  gif_id: string;
  round_number: number;
  status: RoundStatus;
  winner_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  clue_given: boolean;
}

export interface Gif {
  id: string;
  film_name: string;
  tmdb_movie_id: number;
  giphy_gif_id: string;
  gif_url: string;
  lead_actors: string;
  release_year: number;
  theme: string;
  is_active: boolean;
  created_at: string;
}

export interface Guess {
  id: string;
  round_id: string;
  player_id: string;
  text: string;
  is_correct: boolean;
  submitted_at: string;
}

export interface FeedMessage {
  id: string;
  round_id: string;
  player_id: string;
  type: string;
  text: string;
  created_at: string;
}

// Derived types used by game logic

export interface Clue {
  clueType: ClueType;
  clueText: string;
}

export interface GuessResult {
  isCorrect: boolean;
  guess: Guess;
}

export interface RoundResult {
  roundId: string;
  filmName: string;
  winnerId: string | null;
  winnerUsername: string | null;
  status: RoundStatus;
}

export interface SessionSummary {
  sessionId: string;
  scores: PlayerSessionScore[];
}

export interface PlayerSessionScore {
  playerId: string;
  username: string;
  points: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  correctGuessCount: number;
}

export interface GifMetadata {
  filmName: string;
  tmdbMovieId: number;
  leadActors: string;
  releaseYear: number;
  theme: string;
}
