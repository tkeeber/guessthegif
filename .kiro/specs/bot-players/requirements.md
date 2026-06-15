# Requirements Document

## Introduction

Always-On Bot Players is a production feature that introduces server-side automated players (bots) into Guess the Gif. Bots automatically join lobbies that allow them, participate in rounds by submitting guesses with varying skill levels and response times, and ensure the game always has activity. The feature includes multiple bot personality tiers ranging from novice to expert, a lobby-level option for hosts to exclude bots, visual identification of bots in the UI, and leaderboard rules that distinguish bot scores from human player scores.

## Glossary

- **Bot**: A server-side automated player that joins Lobbies and submits Guesses without human interaction
- **Bot_Manager**: The server-side service responsible for creating, scheduling, and coordinating all Bot activity
- **Bot_Personality**: A configuration defining a Bot skill tier, including guess accuracy probability, response delay range, and display name prefix
- **Novice_Bot**: A Bot_Personality with low accuracy (10-20% chance of correct guess) and slow response times (8-15 seconds)
- **Intermediate_Bot**: A Bot_Personality with moderate accuracy (30-50% chance of correct guess) and moderate response times (4-8 seconds)
- **Expert_Bot**: A Bot_Personality with high accuracy (60-80% chance of correct guess) and fast response times (2-5 seconds)
- **Bots_Allowed**: A boolean flag on a Lobby indicating whether Bots are permitted to join
- **Bot_Badge**: A visual indicator displayed alongside a Bot username in the UI to distinguish Bots from human Players
- **Bot_Pool**: The set of pre-registered Bot player records available for the Bot_Manager to assign to Lobbies

## Requirements

### Requirement 1: Bot Player Registration and Identity

**User Story:** As a system operator, I want bots to have persistent player records that are clearly identifiable, so that bots can participate in games without being confused for real players.

#### Acceptance Criteria

1. THE Bot_Manager SHALL maintain a Bot_Pool of pre-registered Bot player records in the players database table.
2. THE App SHALL store a boolean `is_bot` flag on each player record to distinguish Bot players from human Players.
3. WHEN the App displays a Bot username in the lobby player list, Guess_Feed, or round results, THE App SHALL render a Bot_Badge icon adjacent to the Bot username.
4. THE App SHALL assign each Bot a unique username following the format `[Personality]Bot_[Name]` (e.g., `NoviceBot_Charlie`, `ExpertBot_Ace`).
5. THE Bot_Manager SHALL NOT require Supabase authentication for Bot players.

### Requirement 2: Bot Personality and Skill Tiers

**User Story:** As a player, I want bots to have varying skill levels and response speeds, so that games feel natural and competitive.

#### Acceptance Criteria

1. THE Bot_Manager SHALL support at least 3 distinct Bot_Personality tiers: Novice_Bot, Intermediate_Bot, and Expert_Bot.
2. WHILE a Round is active, THE Novice_Bot SHALL submit Guesses with a delay between 8 and 15 seconds and a correct guess probability between 10% and 20%.
3. WHILE a Round is active, THE Intermediate_Bot SHALL submit Guesses with a delay between 4 and 8 seconds and a correct guess probability between 30% and 50%.
4. WHILE a Round is active, THE Expert_Bot SHALL submit Guesses with a delay between 2 and 5 seconds and a correct guess probability between 60% and 80%.
5. WHEN a Bot submits an incorrect Guess, THE Bot_Manager SHALL select the Guess text from a pool of plausible film titles rather than random strings.
6. WHEN a Bot submits a correct Guess, THE Bot_Manager SHALL use the exact film name associated with the current Round GIF.

### Requirement 3: Bot Lobby Joining and Activity

**User Story:** As a player, I want there to always be games available to join, so that I never have to wait alone for other players.

#### Acceptance Criteria

1. WHEN a Lobby with Bots_Allowed set to true has fewer than 4 players and has been in a waiting state for more than 30 seconds, THE Bot_Manager SHALL add 1 to 2 Bots from the Bot_Pool to the Lobby.
2. THE Bot_Manager SHALL NOT add Bots to a Lobby where Bots_Allowed is set to false.
3. THE Bot_Manager SHALL NOT add Bots to a Lobby that already has an active Session.
4. WHILE a Lobby contains at least 1 human Player and at least 1 Bot and the Lobby has been waiting for more than 60 seconds, THE Bot_Manager SHALL trigger the Session to start if the human Player is the host and the minimum player count of 2 is met.
5. THE Bot_Manager SHALL monitor all active Lobbies with Bots_Allowed set to true and manage Bot assignments continuously during server operation.
6. WHEN a Session ends in a Lobby that has Bots_Allowed set to true, THE Bot_Manager SHALL keep the Bots available for the next Session in that Lobby.

### Requirement 4: Lobby Creation with Bot Exclusion

**User Story:** As a player creating a lobby, I want to choose whether bots can join my game, so that I can have a purely human game when I prefer.

#### Acceptance Criteria

1. WHEN a Player creates a new Lobby, THE App SHALL display a "Allow Bots" toggle defaulting to enabled (Bots_Allowed = true).
2. WHEN a Player creates a Lobby with the "Allow Bots" toggle disabled, THE App SHALL set Bots_Allowed to false on the Lobby record.
3. THE App SHALL display the Bots_Allowed status on the lobby list so Players can see which Lobbies permit Bots before joining.
4. WHILE a Lobby is in the waiting state, THE App SHALL allow the Lobby host to change the Bots_Allowed setting.
5. WHEN the host changes Bots_Allowed from true to false on a Lobby that already contains Bots, THE Bot_Manager SHALL remove all Bots from that Lobby within 5 seconds.

### Requirement 5: Bot Gameplay Participation

**User Story:** As a player, I want bots to play the game like real players, so that the game feels active and competitive even with few human players.

#### Acceptance Criteria

1. WHEN a Round starts in a Session containing Bots, THE Bot_Manager SHALL cause each Bot in the Session to begin submitting Guesses according to the Bot Personality delay configuration.
2. WHEN a Round ends (won or timed out), THE Bot_Manager SHALL stop all Bot Guess submissions for that Round.
3. WHEN a Bot submits a Guess, THE App SHALL process the Guess through the same Guess matching logic used for human Player Guesses.
4. WHEN a Bot submits a Correct_Guess first, THE App SHALL award the Round win to the Bot and display the Bot username with Bot_Badge in the round results.
5. THE Bot_Manager SHALL ensure each Bot submits at most 1 Guess per configured delay interval to prevent guess spamming.
6. WHEN a Clue is provided during a Round, THE Expert_Bot SHALL increase the correct guess probability to 90% for the next Guess submission.

### Requirement 6: Bot Score and Leaderboard Handling

**User Story:** As a player, I want bot scores to make games feel active but not unfairly dominate the season leaderboard, so that human competition remains meaningful.

#### Acceptance Criteria

1. THE App SHALL track Bot Correct_Guess counts within Sessions the same way human Player scores are tracked.
2. THE App SHALL exclude Bot players from the Season Leaderboard rankings.
3. THE App SHALL NOT count Bot Correct_Guesses toward the Season_Winner threshold of 20.
4. WHEN displaying Session summary scores, THE App SHALL include Bot scores with Bot_Badge indicators so Players can see the full Session results.
5. THE App SHALL exclude Bot players from the archived Season Leaderboard results.

### Requirement 7: Bot Manager Lifecycle

**User Story:** As a system operator, I want the bot system to start automatically with the server and manage itself, so that no manual intervention is needed to keep games active.

#### Acceptance Criteria

1. WHEN the server application starts, THE Bot_Manager SHALL initialize and begin monitoring Lobbies within 10 seconds of server startup.
2. THE Bot_Manager SHALL run as an integrated server-side module within the existing Node.js application process.
3. IF the Bot_Manager encounters an error while processing a specific Lobby, THEN THE Bot_Manager SHALL log the error and continue operating for other Lobbies.
4. THE Bot_Manager SHALL use the same Socket.IO server instance and database pool as the main application.
5. WHEN the server application shuts down gracefully, THE Bot_Manager SHALL disconnect all active Bot socket connections and release resources.
6. THE Bot_Manager SHALL seed the Bot_Pool with at least 6 Bot player records (2 per personality tier) on first initialization if no Bot records exist.
