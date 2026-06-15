# Implementation Plan: Always-On Bot Players

## Overview

This plan implements server-side automated bot players that join lobbies, participate in rounds with personality-driven guessing behavior, and are excluded from season leaderboards. Implementation proceeds from database schema changes, through auth and service layers, to REST API/UI updates, and finally server startup integration.

## Tasks

- [x] 1. Database migration and schema setup
  - [x] 1.1 Create database migration for bot-related columns
    - Create `server/migrations/002_bot_players.sql`
    - Add `is_bot BOOLEAN NOT NULL DEFAULT FALSE` column to `players` table
    - Add `bots_allowed BOOLEAN NOT NULL DEFAULT TRUE` column to `lobbies` table
    - Create partial index `idx_players_is_bot` on `players(is_bot) WHERE is_bot = true`
    - Create composite index `idx_lobbies_bots_allowed` on `lobbies(bots_allowed, status)`
    - _Requirements: 1.2, 4.1_

- [ ] 2. Bot personality configuration and film pool
  - [x] 2.1 Create bot personality configuration module
    - Create `server/src/services/botPersonalities.ts`
    - Define `BotPersonality` interface with tier, displayPrefix, delayRange, correctProbability, and postClueProbability fields
    - Export `BOT_PERSONALITIES` record with novice, intermediate, and expert tiers matching the design doc values
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Create bot film title pool module
    - Create `server/src/services/botFilmPool.ts`
    - Export `FILM_TITLE_POOL` array with 50+ plausible film titles (reuse list from existing `server/scripts/bot-players.ts`)
    - Export `getRandomFilmTitle()` utility function
    - _Requirements: 2.5_

  - [ ]* 2.3 Write property test for personality tier ranges (Property 3)
    - **Property 3: Personality tier delay and probability ranges**
    - **Validates: Requirements 2.2, 2.3, 2.4**

- [x] 3. Socket.IO auth middleware update for bot connections
  - [x] 3.1 Add bot internal auth path to Socket.IO middleware
    - Modify `server/src/socket/index.ts` auth middleware
    - Add a new auth branch that checks `socket.handshake.auth.botSecret` against `process.env.BOT_INTERNAL_SECRET`
    - Validate `socket.handshake.auth.botPlayerId` exists and corresponds to a player with `is_bot = true`
    - Place this check after the dev bypass but before the JWT auth flow
    - Attach player data to `socket.data` same as existing flows
    - _Requirements: 1.5, 7.4_

  - [ ]* 3.2 Write unit tests for bot socket auth
    - Test bot connects successfully with valid internal secret and valid bot player ID
    - Test bot rejected when secret is missing or wrong
    - Test bot rejected when player ID doesn't exist or isn't a bot
    - _Requirements: 1.5_

- [x] 4. BotManager service core
  - [x] 4.1 Create BotManager configuration loader
    - Create `server/src/services/botManager.ts`
    - Implement `BotManagerConfig` interface and `loadBotConfig()` function reading from environment variables with defaults per design doc
    - _Requirements: 7.1, 7.2_

  - [x] 4.2 Implement bot pool seeding logic
    - Add `seedBotPool()` method to BotManager
    - Check if bot player records exist in DB; if not, create records for each personality tier (2 per tier minimum)
    - Use synthetic `supabase_user_id` (prefixed with `bot-`), `is_bot = true`, and username format `[Personality]Bot_[Name]`
    - Use `{username}@bot.internal` for email
    - _Requirements: 1.1, 1.4, 7.6_

  - [ ]* 4.3 Write property test for bot pool seeding completeness (Property 12)
    - **Property 12: Bot pool seeding completeness**
    - **Validates: Requirements 7.6**

  - [ ]* 4.4 Write property test for bot identity flag correctness (Property 1)
    - **Property 1: Bot identity flag correctness**
    - **Validates: Requirements 1.2**

  - [ ]* 4.5 Write property test for bot username format (Property 2)
    - **Property 2: Bot username format**
    - **Validates: Requirements 1.4**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. BotPlayer class implementation
  - [x] 6.1 Create BotPlayer class with socket connection
    - Create `server/src/services/botPlayer.ts`
    - Implement `BotPlayer` class with properties: playerId, username, personality, socket, currentLobbyId, guessTimer
    - Implement `connect(lobbyId)` method that creates an in-process `socket.io-client` connection using `BOT_INTERNAL_SECRET` auth
    - Implement `disconnect()` method that clears timers and disconnects socket
    - _Requirements: 1.5, 7.4_

  - [x] 6.2 Implement bot guess decision logic
    - Add `startGuessing(roundId)` and `stopGuessing()` methods to BotPlayer
    - On round start, schedule a guess after a random delay within the personality's `delayRange`
    - Roll accuracy probability: if correct, fetch `film_name` from current round GIF via DB query; if incorrect, pick from `FILM_TITLE_POOL`
    - Emit `guess:submit` via the bot's socket connection
    - Schedule next guess after another random delay (respecting minimum delay per personality)
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 5.1, 5.5_

  - [x] 6.3 Implement expert post-clue probability boost
    - Listen for `round:clue` event on the bot socket
    - When received by an expert bot, override next guess probability to 0.90
    - Reset boost after the next guess is submitted
    - _Requirements: 5.6_

  - [x] 6.4 Implement round lifecycle event handlers
    - Listen for `round:start`, `round:won`, `round:timeout`, and `session:end` on the bot socket
    - Start guessing on `round:start`, stop on `round:won`/`round:timeout`/`session:end`
    - _Requirements: 5.1, 5.2_

  - [ ]* 6.5 Write property test for bot guess text correctness (Property 4)
    - **Property 4: Bot guess text correctness**
    - **Validates: Requirements 2.5, 2.6**

  - [ ]* 6.6 Write property test for bot guess rate limiting (Property 7)
    - **Property 7: Bot guess rate limiting**
    - **Validates: Requirements 5.5**

  - [ ]* 6.7 Write property test for expert post-clue probability boost (Property 8)
    - **Property 8: Expert bot post-clue probability boost**
    - **Validates: Requirements 5.6**

- [ ] 7. Lobby polling and bot assignment
  - [x] 7.1 Implement lobby polling in BotManager
    - Add `pollLobbies()` method that executes the batched SQL query from the design (eligible lobbies with `bots_allowed = true`, `status = 'waiting'`, `player_count < 4`, `created_at < NOW() - threshold`)
    - For each eligible lobby, assign 1-2 available bots from the pool (up to `maxBotsPerLobby`)
    - Insert bot into `lobby_players`, then call `bot.connect(lobbyId)`
    - Wrap each lobby's processing in try/catch for error isolation
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 7.3_

  - [x] 7.2 Implement auto-start logic
    - During poll cycle, check if any lobby has been waiting > `autoStartThresholdMs` with at least 1 human + 1 bot and total players ≥ 2
    - If conditions met and host is human, emit session start trigger
    - _Requirements: 3.4_

  - [x] 7.3 Implement bot removal from lobby
    - Add `removeBotsFromLobby(lobbyId)` method to BotManager
    - Disconnect all bot sockets in that lobby, remove from `lobby_players`, return bots to available pool
    - _Requirements: 4.5_

  - [x] 7.4 Implement BotManager initialize and shutdown
    - `initialize(io)`: load config, seed bot pool, start polling interval timer
    - `shutdown()`: clear polling timer, disconnect all bot sockets, clear all guess timers
    - _Requirements: 7.1, 7.5_

  - [ ]* 7.5 Write property test for lobby eligibility (Property 5)
    - **Property 5: Lobby eligibility for bot assignment**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 7.6 Write property test for auto-start decision logic (Property 6)
    - **Property 6: Auto-start decision logic**
    - **Validates: Requirements 3.4**

  - [ ]* 7.7 Write property test for error isolation in lobby polling (Property 11)
    - **Property 11: Error isolation in lobby polling**
    - **Validates: Requirements 7.3**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Leaderboard and season manager updates
  - [x] 9.1 Update LeaderboardService to exclude bots
    - Modify `getRankings()` in `server/src/services/leaderboardService.ts` to add `AND p.is_bot = false` filter to the query
    - This applies to both current and archived season leaderboard queries
    - _Requirements: 6.2, 6.5_

  - [x] 9.2 Update SeasonManager to exclude bots from winner check
    - Modify `checkForSeasonWinner()` in `server/src/services/seasonManager.ts` to add `AND p.is_bot = false` filter
    - Ensure bots cannot trigger season win even if they exceed threshold
    - _Requirements: 6.3_

  - [ ]* 9.3 Write property test for leaderboard excludes bots (Property 9)
    - **Property 9: Leaderboard excludes bot players**
    - **Validates: Requirements 6.2, 6.5**

  - [ ]* 9.4 Write property test for season winner excludes bots (Property 10)
    - **Property 10: Season winner excludes bots**
    - **Validates: Requirements 6.3**

- [ ] 10. Lobby REST API updates
  - [x] 10.1 Update lobby creation endpoint to accept botsAllowed
    - Modify `POST /api/lobbies` in `server/src/routes/lobbies.ts`
    - Accept optional `botsAllowed` body parameter (default `true`)
    - Include `bots_allowed` in the INSERT query
    - _Requirements: 4.1, 4.2_

  - [x] 10.2 Update lobby list endpoint to include botsAllowed
    - Modify `GET /api/lobbies` to include `bots_allowed` field in response
    - Update `LobbyWithHost` type if needed
    - _Requirements: 4.3_

  - [x] 10.3 Create bots-allowed toggle endpoint
    - Add `PATCH /api/lobbies/:id/bots-allowed` endpoint
    - Only the host can toggle; reject for non-host or non-waiting lobbies
    - When toggling from `true` to `false`, call `BotManager.removeBotsFromLobby(lobbyId)`
    - _Requirements: 4.4, 4.5_

  - [ ]* 10.4 Write unit tests for lobby API bot-related changes
    - Test lobby creation with botsAllowed true/false
    - Test toggle endpoint access control (host-only, waiting-only)
    - Test bot removal triggered on toggle off
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 11. Client UI updates
  - [x] 11.1 Add "Allow Bots" toggle to lobby creation UI
    - Modify `client/src/pages/LobbyListPage.tsx` or lobby creation form
    - Add a toggle/checkbox for "Allow Bots" defaulting to enabled
    - Pass `botsAllowed` parameter in the POST request body
    - _Requirements: 4.1, 4.2_

  - [x] 11.2 Display bot badge in lobby player list and game UI
    - Add a bot badge indicator (icon or label) next to bot usernames
    - Apply in lobby player list, GuessFeed component, and round results
    - Identify bots by checking the `is_bot` flag from player data (or username pattern)
    - _Requirements: 1.3, 5.4, 6.4_

  - [x] 11.3 Display bots_allowed status on lobby list
    - Show a visual indicator on each lobby card in `LobbyListPage.tsx` showing whether bots are allowed
    - _Requirements: 4.3_

  - [x] 11.4 Add host toggle for bots_allowed in lobby waiting room
    - In `LobbyPage.tsx`, add a toggle for the host to enable/disable bots while in waiting state
    - Call `PATCH /api/lobbies/:id/bots-allowed` on toggle
    - _Requirements: 4.4_

- [ ] 12. Server startup integration
  - [x] 12.1 Initialize BotManager in server startup
    - Modify `server/src/index.ts` to import and initialize BotManager after Socket.IO server is created
    - Call `botManager.initialize(io)` after server starts listening
    - Only initialize if `BOT_ENABLED !== 'false'` and `BOT_INTERNAL_SECRET` is set
    - Add graceful shutdown handler to call `botManager.shutdown()` on SIGTERM/SIGINT
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [x] 12.2 Add BOT_INTERNAL_SECRET to .env.example
    - Add all bot-related environment variables to `server/.env.example` with comments
    - _Requirements: 7.1_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `server/scripts/bot-players.ts` dev script can remain as a manual testing tool; the new BotManager replaces its functionality for production use
- All bot socket connections are in-process (no network overhead) using `socket.io-client` connecting to the same server instance

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2"] },
    { "id": 1, "tasks": ["2.3", "3.1", "4.1"] },
    { "id": 2, "tasks": ["3.2", "4.2"] },
    { "id": 3, "tasks": ["4.3", "4.4", "4.5", "6.1"] },
    { "id": 4, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 5, "tasks": ["6.5", "6.6", "6.7", "7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 7, "tasks": ["7.5", "7.6", "7.7", "9.1", "9.2"] },
    { "id": 8, "tasks": ["9.3", "9.4", "10.1", "10.2"] },
    { "id": 9, "tasks": ["10.3", "10.4", "11.1", "11.3"] },
    { "id": 10, "tasks": ["11.2", "11.4", "12.1", "12.2"] }
  ]
}
```
