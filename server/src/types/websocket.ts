// WebSocket event payload types for Socket.IO communication

// ============================================================
// Client → Server event payloads
// ============================================================

export interface GuessSubmitPayload {
  text: string;
}

export interface ChatMessagePayload {
  text: string;
}

// session:start has an empty payload
export type SessionStartPayload = Record<string, never>;

export interface ClientToServerEvents {
  'guess:submit': (payload: GuessSubmitPayload) => void;
  'chat:message': (payload: ChatMessagePayload) => void;
  'session:start': (payload: SessionStartPayload) => void;
}

// ============================================================
// Server → Client event payloads
// ============================================================

export interface RoundStartPayload {
  roundNumber: number;
  gifUrl: string;
}

export interface RoundWonPayload {
  winnerUsername: string;
  filmName: string;
}

export interface RoundTimeoutPayload {
  filmName: string;
}

export interface RoundCluePayload {
  clueType: string;
  clueText: string;
}

export interface GuessNewPayload {
  username: string;
  text: string;
  timestamp: string;
  isCorrect: boolean;
}

export interface ChatNewPayload {
  username: string;
  text: string;
  timestamp: string;
}

export interface SessionEndPayload {
  scores: SessionEndPlayerScore[];
  sessionSummary: string;
}

export interface SessionEndPlayerScore {
  playerId: string;
  username: string;
  points: number;
}

export interface SeasonWonPayload {
  winnerUsername: string;
}

export interface LobbyUpdatePayload {
  players: LobbyUpdatePlayer[];
}

export interface LobbyUpdatePlayer {
  playerId: string;
  username: string;
}

export interface PlayerDisconnectedPayload {
  username: string;
}

export interface LeaderboardUpdatePayload {
  entries: LeaderboardUpdateEntry[];
}

export interface LeaderboardUpdateEntry {
  rank: number;
  username: string;
  correctGuessCount: number;
}

export interface ServerToClientEvents {
  'round:start': (payload: RoundStartPayload) => void;
  'round:won': (payload: RoundWonPayload) => void;
  'round:timeout': (payload: RoundTimeoutPayload) => void;
  'round:clue': (payload: RoundCluePayload) => void;
  'guess:new': (payload: GuessNewPayload) => void;
  'chat:new': (payload: ChatNewPayload) => void;
  'session:end': (payload: SessionEndPayload) => void;
  'season:won': (payload: SeasonWonPayload) => void;
  'lobby:update': (payload: LobbyUpdatePayload) => void;
  'player:disconnected': (payload: PlayerDisconnectedPayload) => void;
  'leaderboard:update': (payload: LeaderboardUpdatePayload) => void;
}

// ============================================================
// WebSocket error event
// ============================================================

export interface WSErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
}

export type WSErrorCode =
  | 'round_not_active'
  | 'session_full'
  | 'lobby_in_session'
  | 'not_authenticated'
  | 'not_authorized'
  | 'server_error';
