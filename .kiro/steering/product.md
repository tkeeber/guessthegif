# Product: Guess the Gif

A real-time multiplayer trivia game where players compete to identify movies from animated GIFs. Players join lobbies, watch a GIF play, and race to type the correct film title. The first correct guess wins the round and earns a point toward the season leaderboard.

## Core Features
- User authentication (Supabase Auth — email/password, password reset)
- Lobby system: create, join by code, list public lobbies, invite-only option
- Real-time gameplay via Socket.IO: GIF reveal, guess submission, clue system, round scoring
- Bot players: automated opponents that fill lobbies and participate in games
- Seasonal leaderboard tracking correct guess counts
- Admin panel for managing GIFs and players

## User Roles
- **Player** — authenticated user who can create/join lobbies and play
- **Host** — the player who created the lobby; controls game start and bot settings
- **Admin** — elevated role with access to the admin panel (managed via `is_admin` DB flag)
- **Bot** — automated player (`is_bot = true`) with tiered skill personalities (novice / intermediate / expert)
