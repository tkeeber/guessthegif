# Requirements Document

## Introduction

Guess the Gif is a real-time multiplayer web application game where players compete to identify films from short GIF clips. Players join game sessions containing 3 GIF rounds each. The first player to correctly guess the film name in each round scores a point. Players compete across multiple sessions within a season, and the first player to accumulate 20 correct guesses wins the season. The application includes user registration, real-time gameplay, GIF content management, and a season leaderboard.

## Glossary

- **App**: The Guess the Gif web application
- **Player**: A registered user who participates in game sessions
- **Session**: A single game instance consisting of 3 GIF rounds played in sequence
- **Round**: A single GIF display where players attempt to guess the film name
- **GIF**: An animated image clip sourced from a film, used as the visual prompt in a round
- **Guess**: A text input submitted by a Player during a Round
- **Correct_Guess**: A Guess that matches the film name associated with the current GIF
- **Season**: A competitive period during which Players accumulate correct guesses across multiple Sessions
- **Season_Winner**: The first Player to reach 20 Correct_Guesses within a Season
- **Leaderboard**: A ranked display of Players ordered by their Correct_Guess count within the current Season
- **Lobby**: A waiting area where Players gather before a Session begins
- **Admin**: A user with elevated privileges who manages GIF content and Seasons
- **GIF_Library**: The collection of all available GIFs with their associated film metadata
- **Guess_Feed**: A real-time chat-like display showing all Player Guesses and reactions visible to all Players in a Session
- **Clue**: A hint provided to Players when no Correct_Guess has been submitted within 2 minutes, drawn from film metadata such as actors, release year, a word from the title, or the general theme

## Requirements

### Requirement 1: Player Registration and Authentication

**User Story:** As a visitor, I want to create an account and sign in, so that I can participate in game sessions and have my scores tracked.

#### Acceptance Criteria

1. WHEN a visitor signs up via Supabase Auth with a valid email address and password, THE App SHALL create a Player profile with a chosen username linked to the Supabase user account.
2. WHEN a Player signs in via Supabase Auth with valid credentials, THE App SHALL authenticate the Player and establish a session.
3. IF a visitor attempts to sign up with an email address already associated with an existing Supabase account, THEN THE App SHALL display an error message indicating the email is already in use.
4. IF a Player submits invalid login credentials, THEN THE App SHALL display a generic error message without revealing which field is wrong.
5. THE App SHALL delegate password policy enforcement to Supabase Auth.
6. WHEN an authenticated Player requests to sign out, THE App SHALL terminate the Supabase session and redirect to the login page.

### Requirement 2: Game Lobby and Session Creation

**User Story:** As a Player, I want to join a game lobby and start a session with other players, so that I can compete in real-time.

#### Acceptance Criteria

1. WHEN an authenticated Player navigates to the game area, THE App SHALL display available Lobbies that the Player can join.
2. WHEN a Player creates a new Lobby, THE App SHALL generate a unique join code and display it to the creating Player.
3. WHEN a Player enters a valid join code, THE App SHALL add the Player to the corresponding Lobby.
4. WHILE a Lobby has fewer than 2 Players, THE App SHALL prevent the Session from starting and display a waiting message.
5. WHEN the Lobby host initiates the Session and the Lobby contains 2 or more Players, THE App SHALL start the Session and begin the first Round.
6. IF a Player attempts to join a Lobby that is already in an active Session, THEN THE App SHALL display a message indicating the Session is in progress.

### Requirement 3: Real-Time Round Gameplay

**User Story:** As a Player, I want to see a GIF clip and submit my guess in real time, so that I can compete to be the first to identify the film.

#### Acceptance Criteria

1. WHEN a Round begins, THE App SHALL display the GIF to all Players in the Session simultaneously.
2. WHILE a Round is active, THE App SHALL accept Guess submissions from all Players in the Session.
3. WHEN a Player submits a Correct_Guess, THE App SHALL immediately notify all Players in the Session that the Round has been won and display the winning Player username.
4. WHEN a Correct_Guess is submitted, THE App SHALL end the current Round and prevent further Guess submissions for that Round.
5. THE App SHALL compare Guesses to the film name using case-insensitive matching.
6. THE App SHALL accept Guesses that match the film name with minor spelling variations of up to 2 character differences.
7. IF no Player submits a Correct_Guess within 120 seconds of the Round starting, THEN THE App SHALL provide a Clue to all Players in the Session.
8. THE App SHALL select a Clue from one of the following categories: actors appearing in the film, the release year of the film, one word from the film title (only for titles containing more than one word), or the general theme of the film.
9. THE App SHALL NOT provide a word-from-title Clue for films with a single-word title.
10. IF no Player submits a Correct_Guess within 60 seconds after a Clue is provided, THEN THE App SHALL end the Round, reveal the correct film name, and award no points.
11. WHEN a Round ends, THE App SHALL display the correct film name to all Players in the Session.

### Requirement 4: Session Flow and Scoring

**User Story:** As a Player, I want to play through 3 rounds per session and see my score, so that I can track my progress.

#### Acceptance Criteria

1. THE App SHALL configure each Session to contain exactly 3 Rounds.
2. WHEN a Round ends, THE App SHALL award 1 point to the Player who submitted the first Correct_Guess for that Round.
3. WHEN a Round ends and the Session has remaining Rounds, THE App SHALL start the next Round after a 5-second delay.
4. WHEN all 3 Rounds in a Session are complete, THE App SHALL display the Session summary showing each Player score for that Session.
5. WHEN a Session ends, THE App SHALL update each Player cumulative Season score with the points earned during the Session.
6. IF a Player disconnects during a Session, THEN THE App SHALL retain the Player earned points and allow the Session to continue for remaining Players.

### Requirement 5: Season Management and Winning

**User Story:** As a Player, I want to compete across multiple sessions to reach 20 correct guesses and win the season, so that I have a long-term goal to work toward.

#### Acceptance Criteria

1. THE App SHALL track each Player cumulative Correct_Guess count within the current Season.
2. WHEN a Player cumulative Correct_Guess count reaches 20, THE App SHALL declare that Player as the Season_Winner.
3. WHEN a Season_Winner is declared, THE App SHALL notify all Players and display a congratulatory message with the Season_Winner username.
4. WHEN a Season ends, THE App SHALL archive the Season results and start a new Season with all Player scores reset to zero.
5. THE App SHALL prevent a completed Season from accepting new Session results.

### Requirement 6: Leaderboard

**User Story:** As a Player, I want to view a leaderboard showing player rankings, so that I can see how I compare to other players.

#### Acceptance Criteria

1. THE App SHALL display a Leaderboard showing all Players ranked by their Correct_Guess count in the current Season in descending order.
2. WHEN a Player Correct_Guess count changes, THE App SHALL update the Leaderboard within 5 seconds.
3. THE App SHALL display each Leaderboard entry with the Player rank, username, and Correct_Guess count.
4. WHEN two or more Players have the same Correct_Guess count, THE App SHALL rank the Player who reached that count first as higher.
5. WHEN an authenticated Player views the Leaderboard, THE App SHALL highlight the current Player entry.
6. THE App SHALL allow Players to view archived Leaderboard results from previous Seasons.

### Requirement 7: GIF Content Management

**User Story:** As an Admin, I want to manage the GIF library, so that there is a curated collection of film GIFs available for game sessions.

#### Acceptance Criteria

1. WHEN an Admin searches for a film by title, THE App SHALL query the TMDB API and display matching film results with title, year, and poster.
2. WHEN an Admin selects a film from the TMDB search results, THE App SHALL auto-populate the GIF metadata fields (film name, lead actors, release year, and theme/genre) from TMDB.
3. WHEN an Admin searches for GIFs of the selected film, THE App SHALL query the GIPHY API and display matching GIF results.
4. WHEN an Admin selects a GIF and confirms the metadata, THE App SHALL save the GIF URL and metadata to the GIF_Library.
5. THE App SHALL require each GIF entry in the GIF_Library to have a film name, a GIF URL, a TMDB movie ID, and clue metadata including: lead actors, release year, and general theme of the film.
6. WHEN an Admin requests to remove a GIF from the GIF_Library, THE App SHALL remove the GIF and prevent it from appearing in future Sessions.
7. THE App SHALL select 3 random GIFs from the GIF_Library for each new Session, ensuring no GIF is repeated within the same Session.
8. IF the GIF_Library contains fewer than 3 GIFs, THEN THE App SHALL prevent new Sessions from starting and display a message indicating insufficient content.
9. WHEN an Admin edits the film name associated with a GIF, THE App SHALL update the GIF_Library entry and use the updated film name for future Rounds.
10. THE App SHALL allow an Admin to manually override any auto-populated metadata field before saving a GIF to the library.

### Requirement 8: Visible Guess Feed

**User Story:** As a Player, I want to see all guesses from other players in real time during a round, so that the game feels social and interactive like a group chat.

#### Acceptance Criteria

1. WHILE a Round is active, THE App SHALL display all submitted Guesses from all Players in the Session in a scrollable feed visible to every Player.
2. THE App SHALL display each Guess in the feed with the submitting Player username and a timestamp.
3. THE App SHALL deliver each submitted Guess to all Players in the Session within 1 second of submission.
4. THE App SHALL display Guesses in the feed in chronological order.
5. WHEN a Correct_Guess is submitted, THE App SHALL visually distinguish it in the feed (e.g., highlight or special indicator) so all Players can see which guess won the Round.
6. THE App SHALL allow Players to send non-guess chat messages (reactions or comments) in the feed during a Round.
7. WHEN a Round ends, THE App SHALL retain the Guess_Feed for that Round so Players can review it during the between-round delay.

### Requirement 9: Real-Time Communication

**User Story:** As a Player, I want the game to update in real time without refreshing the page, so that the gameplay feels responsive and competitive.

#### Acceptance Criteria

1. THE App SHALL use persistent connections to deliver Round events, Guess results, and Session updates to all Players in a Session without requiring page refreshes.
2. WHEN a Player submits a Guess, THE App SHALL deliver the Guess to the server within 1 second under normal network conditions.
3. WHEN a Round event occurs, THE App SHALL deliver the event to all connected Players in the Session within 1 second.
4. IF a Player connection is lost, THEN THE App SHALL attempt to reconnect automatically for up to 30 seconds.
5. IF a Player connection cannot be re-established within 30 seconds, THEN THE App SHALL remove the Player from the active Session and display a disconnection message.
