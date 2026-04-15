# Implementation Plan: Guess the Gif

## Overview

MVP implementation of a real-time multiplayer GIF guessing game. React frontend, Node.js/Express backend, Supabase Auth, PostgreSQL (via Supabase), Socket.IO for real-time, GIPHY + TMDB APIs for GIF curation. Tasks are ordered to build core infrastructure first, then game logic, then UI, wiring everything together incrementally.

## Tasks

- [ ] 1. Project scaffolding and database setup
  - [ ] 1.1 Initialize monorepo with server (Node.js/Express/TypeScript) and client (React/TypeScript) packages
    - Set up `server/` and `client/` directories with `tsconfig.json`, `package.json`
    - Install core dependencies: express, socket.io, pg, fast-check (dev), vitest (dev), supabase-js
    - Install client dependencies: react, react-dom, socket.io-client, @supabase/supabase-js
    - _Requirements: 9.1_

  - [ ] 1.2 Create PostgreSQL schema and migration files
    - Create tables: `players`, `seasons`, `season_scores`, `lobbies`, `lobby_players`, `sessions`, `rounds`, `gifs`, `guesses`, `feed_messages`
    - Add all constraints, foreign keys, unique indexes, and enums from the data model
    - Add unique constraint on `(player_id, season_id)` for `season_scores`
    - Add `is_active` soft-delete flag on `gifs`
    - _Requirements: 1.1, 2.2, 4.1, 5.1, 7.5_

  - [ ] 1.3 Create shared TypeScript interfaces and types
    - Define interfaces for all entities: Player, Season, Lobby, Session, Round, Gif, Guess, FeedMessage, SeasonScore
    - Define enums for statuses: LobbyStatus, RoundStatus, SessionStatus
    - Define WebSocket event payload types (client→server and server→client)
    - Define REST API request/response types
    - _Requirements: 3.2, 4.1, 8.2, 9.1_

- [ ] 2. Authentication and player management
  - [ ] 2.1 Implement Supabase Auth middleware and auth routes
    - Create Express middleware that validates Supabase JWT from Authorization header
    - Implement `POST /api/auth/callback` to create/sync Player record from Supabase user
    - Implement `GET /api/auth/me` to return current player profile
    - Handle duplicate email error from Supabase with generic message
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 2.2 Write property tests for auth callback
    - **Property 1: Player profile creation on auth callback**
    - **Property 2: Duplicate Supabase user sync is idempotent**
    - **Validates: Requirements 1.1, 1.3**

  - [ ] 2.3 Implement React auth pages (login, signup, logout)
    - Create login and signup forms using Supabase client SDK
    - Implement sign-out flow that clears session and redirects to login
    - Add inline validation and error display for auth forms
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_

- [ ] 3. Checkpoint - Auth flow working
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Lobby system and session creation
  - [ ] 4.1 Implement lobby REST endpoints and lobby manager
    - Implement `GET /api/lobbies` to list available lobbies (status=waiting)
    - Implement `POST /api/lobbies` to create lobby with unique 6-char join code
    - Implement `POST /api/lobbies/:code/join` to add player to lobby
    - Reject join if lobby is in active session (return 409)
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [ ]* 4.2 Write property tests for lobby system
    - **Property 4: Lobby join codes are unique**
    - **Property 5: Lobby join round trip**
    - **Property 7: Cannot join lobby with active session**
    - **Validates: Requirements 2.2, 2.3, 2.6**

  - [ ] 4.3 Implement session start logic
    - On `session:start` WebSocket event from host, validate ≥ 2 players and ≥ 3 active GIFs
    - Create Session record with 3 Rounds, select 3 distinct random GIFs from active library
    - Set lobby status to `in_session`
    - Return errors for insufficient players or GIFs
    - _Requirements: 2.4, 2.5, 7.7, 7.8_

  - [ ]* 4.4 Write property tests for session creation
    - **Property 6: Session start requires minimum players**
    - **Property 13: Session contains exactly 3 rounds**
    - **Property 26: Session GIFs are distinct**
    - **Validates: Requirements 2.4, 2.5, 4.1, 7.4**

  - [ ] 4.5 Implement lobby and session UI
    - Create lobby list page showing available lobbies
    - Create lobby detail page with join code display, player list, and start button
    - Wire up Socket.IO `lobby:update` event for real-time player list
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 5. Checkpoint - Lobby and session creation working
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Core game engine - guess matching and round management
  - [ ] 6.1 Implement GuessMatcher with Levenshtein distance
    - Normalize both strings: lowercase, trim whitespace
    - Compute Levenshtein distance; return correct if distance ≤ 2
    - _Requirements: 3.5, 3.6_

  - [ ]* 6.2 Write property test for guess matching
    - **Property 8: Guess matching with fuzzy tolerance**
    - **Validates: Requirements 3.5, 3.6**

  - [ ] 6.3 Implement RoundManager with timer logic
    - Start round: broadcast `round:start` with GIF URL to all players in session room
    - Accept guesses on active/clue_given rounds; reject on won/completed rounds
    - On correct guess: record winner, award 1 point, broadcast `round:won`, end round
    - On incorrect guess: broadcast `guess:new` to feed
    - Implement 120s timer → trigger clue phase; 60s post-clue timer → timeout
    - On timeout: broadcast `round:timeout` with film name, award no points
    - Use server-side mutex per round for concurrent correct guess race condition
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.10, 3.11, 4.2, 4.3_

  - [ ]* 6.4 Write property tests for round management
    - **Property 9: Active round accepts guesses**
    - **Property 10: Won round rejects further guesses**
    - **Property 12: Round result includes film name**
    - **Property 14: Round winner gets exactly 1 point**
    - **Validates: Requirements 3.2, 3.4, 3.11, 4.2**

  - [ ] 6.5 Implement ClueService
    - Build available clue types from GIF metadata (actors, year, title_word, theme)
    - Exclude `title_word` for single-word film titles
    - Randomly select one clue type and generate clue text
    - For `title_word`, exclude articles ("the", "a", "an") and pick random remaining word
    - Broadcast `round:clue` event to all players
    - _Requirements: 3.8, 3.9_

  - [ ]* 6.6 Write property test for clue generation
    - **Property 11: Clue generation respects metadata constraints**
    - **Validates: Requirements 3.8, 3.9**

- [ ] 7. Session flow, scoring, and season management
  - [ ] 7.1 Implement session flow orchestration
    - After round ends, start next round after 5-second delay
    - After 3 rounds complete, generate session summary with all player scores
    - Broadcast `session:end` with scores and summary
    - Update lobby status to `waiting` after session ends
    - _Requirements: 4.1, 4.3, 4.4_

  - [ ]* 7.2 Write property test for session summary
    - **Property 15: Session summary contains all player scores**
    - **Validates: Requirements 4.4**

  - [ ] 7.3 Implement SeasonManager and season scoring
    - Track cumulative correct guess count per player per season
    - On session end, update season scores
    - Check if any player reached 20 correct guesses → declare winner
    - On season win: broadcast `season:won`, archive season, create new season with zero scores
    - Reject score updates to completed seasons
    - Handle disconnected player point retention
    - _Requirements: 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 7.4 Write property tests for season management
    - **Property 16: Season score accumulation**
    - **Property 17: Disconnected player retains points**
    - **Property 18: Season winner at 20 correct guesses**
    - **Property 19: Season reset on completion**
    - **Property 20: Completed season rejects new results**
    - **Validates: Requirements 4.5, 4.6, 5.1, 5.2, 5.4, 5.5**

- [ ] 8. Leaderboard
  - [ ] 8.1 Implement LeaderboardService and REST endpoints
    - Implement `GET /api/leaderboard` for current season rankings
    - Implement `GET /api/leaderboard/seasons` for archived season list
    - Implement `GET /api/leaderboard/seasons/:id` for archived season leaderboard
    - Sort by correct_guess_count descending, tiebreak by last_correct_at ascending
    - Each entry includes rank, username, correct_guess_count
    - Broadcast `leaderboard:update` via Socket.IO when scores change
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

  - [ ]* 8.2 Write property tests for leaderboard
    - **Property 21: Leaderboard sorting with tiebreaker**
    - **Property 22: Leaderboard entry data completeness**
    - **Validates: Requirements 6.1, 6.3, 6.4**

  - [ ] 8.3 Implement leaderboard UI
    - Create leaderboard page with current season rankings
    - Highlight current player's entry
    - Add season archive dropdown to view past seasons
    - Wire up `leaderboard:update` Socket.IO event for real-time updates
    - _Requirements: 6.1, 6.3, 6.5, 6.6_

- [ ] 9. Checkpoint - Core gameplay loop complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. GIF content management (admin)
  - [ ] 10.1 Implement TMDB and GIPHY service integrations
    - Implement `GET /api/admin/tmdb/search` to search TMDB for films by title
    - Implement `GET /api/admin/tmdb/movie/:id` to get full movie details (cast, year, genres)
    - Implement `GET /api/admin/giphy/search` to search GIPHY for GIFs by query
    - Handle API failures with 502 responses and descriptive messages
    - Cache TMDB results for 1 hour
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 10.2 Implement GIF library CRUD endpoints
    - Implement `POST /api/admin/gifs` to save curated GIF with TMDB metadata
    - Implement `GET /api/admin/gifs` to list GIF library
    - Implement `PUT /api/admin/gifs/:id` to update GIF metadata
    - Implement `DELETE /api/admin/gifs/:id` to soft-delete (set is_active=false)
    - Validate required fields: film_name, gif_url, tmdb_movie_id, lead_actors, release_year, theme
    - Reject saves with missing required metadata
    - _Requirements: 7.4, 7.5, 7.6, 7.9, 7.10_

  - [ ]* 10.3 Write property tests for GIF management
    - **Property 23: GIF upload round trip**
    - **Property 24: GIF entry requires complete metadata**
    - **Property 25: Removed GIF excluded from selection**
    - **Property 27: GIF film name update round trip**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5, 7.6**

  - [ ] 10.4 Implement admin GIF curation UI
    - Create admin page with TMDB film search
    - Display TMDB results; on selection, auto-populate metadata fields
    - Add GIPHY search panel to browse and select GIFs for the film
    - Allow manual override of any auto-populated field
    - Save curated GIF + metadata to library
    - Create GIF library list view with edit and delete actions
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.9, 7.10_

- [ ] 11. Guess feed and chat
  - [ ] 11.1 Implement guess feed and chat message handling
    - On `guess:submit` event: validate round active, record guess, run matcher, broadcast `guess:new` with username, text, timestamp, isCorrect
    - On `chat:message` event: validate round active, record feed message, broadcast `chat:new`
    - Ensure feed entries are stored with timestamps for chronological ordering
    - Retain feed data after round ends for review
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 11.2 Write property tests for guess feed
    - **Property 28: Guess feed entry data completeness**
    - **Property 29: Guess feed chronological order**
    - **Property 30: Correct guess is marked in feed**
    - **Property 31: Chat messages accepted during active round**
    - **Property 32: Feed retained after round ends**
    - **Validates: Requirements 8.2, 8.4, 8.5, 8.6, 8.7**

  - [ ] 11.3 Implement guess feed UI component
    - Create scrollable feed component showing guesses and chat messages
    - Display username and timestamp for each entry
    - Visually distinguish correct guesses (highlight/indicator)
    - Add guess input field and chat message input
    - Auto-scroll to latest entry
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6_

- [ ] 12. Real-time communication and WebSocket infrastructure
  - [ ] 12.1 Implement Socket.IO server with auth and room management
    - Configure Socket.IO server with Supabase JWT validation on handshake
    - Implement room management: join session room on lobby join, leave on disconnect
    - Implement auto-reconnect handling (30s window)
    - On disconnect > 30s: remove player from session, broadcast `player:disconnected`
    - Implement rate limiting: 10 guesses/10s, 5 chat messages/10s per player
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 12.2 Write property test for auth round trip
    - **Property 3: Authentication round trip**
    - **Validates: Requirements 1.2, 1.6**

  - [ ] 12.3 Implement Socket.IO client integration in React
    - Set up Socket.IO client with Supabase access token in handshake
    - Implement reconnection UI overlay ("Reconnecting...")
    - Wire all game events to React state (round:start, round:won, round:timeout, guess:new, etc.)
    - Handle disconnection message and redirect to lobby list on failure
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 13. Game play UI - round view
  - [ ] 13.1 Implement the main game round view
    - Display GIF prominently when round starts
    - Show round number (1/3, 2/3, 3/3) and countdown timer
    - Show clue when `round:clue` event received
    - Show round result (winner or timeout with film name reveal)
    - Show session summary after all 3 rounds with player scores
    - Show 5-second countdown between rounds
    - _Requirements: 3.1, 3.3, 3.7, 3.10, 3.11, 4.3, 4.4_

- [ ] 14. Final checkpoint - Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (32 properties via fast-check)
- Unit tests validate specific examples and edge cases
- All game state transitions are server-authoritative to prevent cheating
