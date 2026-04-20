// REST API request and response types

import { Player, Lobby, LeaderboardEntry, Gif, Season, GifMetadata } from './entities';
import { LobbyStatus } from './enums';

// ============================================================
// Auth endpoints
// ============================================================

// POST /api/auth/callback
export interface AuthCallbackRequest {
  supabaseUserId: string;
  email: string;
  username: string;
}

export interface AuthCallbackResponse {
  player: Player;
}

// GET /api/auth/me
export interface AuthMeResponse {
  player: Player;
}

// ============================================================
// Lobby endpoints
// ============================================================

// GET /api/lobbies
export interface ListLobbiesResponse {
  lobbies: LobbyWithHost[];
}

export interface LobbyWithHost {
  id: string;
  join_code: string;
  host_id: string;
  hostUsername: string;
  status: LobbyStatus;
  playerCount: number;
  created_at: string;
}

// POST /api/lobbies
export interface CreateLobbyResponse {
  lobby: Lobby;
}

// POST /api/lobbies/:code/join
export interface JoinLobbyResponse {
  lobby: Lobby;
}

// ============================================================
// Leaderboard endpoints
// ============================================================

// GET /api/leaderboard
export interface LeaderboardResponse {
  seasonId: string;
  seasonNumber: number;
  entries: LeaderboardEntry[];
}

// GET /api/leaderboard/seasons
export interface ArchivedSeasonsResponse {
  seasons: ArchivedSeasonSummary[];
}

export interface ArchivedSeasonSummary {
  id: string;
  seasonNumber: number;
  startedAt: string;
  endedAt: string;
  winnerUsername: string | null;
}

// GET /api/leaderboard/seasons/:id
export interface ArchivedSeasonLeaderboardResponse {
  season: ArchivedSeasonSummary;
  entries: LeaderboardEntry[];
}

// ============================================================
// Admin GIF management endpoints
// ============================================================

// GET /api/admin/gifs
export interface ListGifsResponse {
  gifs: Gif[];
}

// POST /api/admin/gifs
export interface CreateGifRequest {
  filmName: string;
  tmdbMovieId: number;
  giphyGifId: string;
  gifUrl: string;
  leadActors: string;
  releaseYear: number;
  theme: string;
}

export interface CreateGifResponse {
  gif: Gif;
}

// PUT /api/admin/gifs/:id
export interface UpdateGifRequest {
  filmName?: string;
  tmdbMovieId?: number;
  giphyGifId?: string;
  gifUrl?: string;
  leadActors?: string;
  releaseYear?: number;
  theme?: string;
}

export interface UpdateGifResponse {
  gif: Gif;
}

// DELETE /api/admin/gifs/:id — returns 204 No Content

// ============================================================
// Admin TMDB endpoints
// ============================================================

// GET /api/admin/tmdb/search?q=query
export interface TMDBSearchResponse {
  results: TMDBMovie[];
}

export interface TMDBMovie {
  tmdbMovieId: number;
  title: string;
  releaseYear: number;
  posterUrl: string | null;
  overview: string;
}

// GET /api/admin/tmdb/movie/:id
export interface TMDBMovieDetailsResponse {
  movie: TMDBMovieDetails;
}

export interface TMDBMovieDetails extends TMDBMovie {
  leadActors: string;
  genres: string[];
}

// ============================================================
// Admin GIPHY endpoints
// ============================================================

// GET /api/admin/giphy/search?q=query
export interface GIPHYSearchResponse {
  results: GIPHYGif[];
}

export interface GIPHYGif {
  giphyGifId: string;
  gifUrl: string;
  previewUrl: string;
  title: string;
}

// ============================================================
// Common error response
// ============================================================

export interface ApiErrorResponse {
  error: string;
  message: string;
}
