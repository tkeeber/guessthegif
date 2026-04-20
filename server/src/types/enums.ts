// Status enums matching PostgreSQL enum types in 001_initial_schema.sql

export enum LobbyStatus {
  Waiting = 'waiting',
  InSession = 'in_session',
  Closed = 'closed',
}

export enum SessionStatus {
  Active = 'active',
  Completed = 'completed',
}

export enum RoundStatus {
  Pending = 'pending',
  Active = 'active',
  ClueGiven = 'clue_given',
  Won = 'won',
  Timeout = 'timeout',
  Completed = 'completed',
}

export enum ClueType {
  Actors = 'actors',
  Year = 'year',
  TitleWord = 'title_word',
  Theme = 'theme',
}

export enum FeedMessageType {
  Guess = 'guess',
  Chat = 'chat',
}
