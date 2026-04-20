import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { LobbyStatus } from '../types';

// Mock the db pool
const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockConnect = vi.fn();

vi.mock('../db', () => ({
  default: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
  },
}));

// Mock the Supabase auth middleware to inject a test user
vi.mock('../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'supabase-user-123', email: 'test@example.com' };
    next();
  },
}));

import lobbyRoutes from './lobbies';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/lobbies', lobbyRoutes);
  return app;
}

describe('Lobby Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });
  });

  describe('GET /api/lobbies', () => {
    it('returns waiting lobbies with host username and player count', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'lobby-1',
            join_code: 'ABC123',
            host_id: 'player-1',
            host_username: 'alice',
            status: 'waiting',
            created_at: '2024-01-01T00:00:00Z',
            player_count: 2,
          },
        ],
      });

      const app = createApp();
      const res = await request(app).get('/api/lobbies');

      expect(res.status).toBe(200);
      expect(res.body.lobbies).toHaveLength(1);
      expect(res.body.lobbies[0]).toEqual({
        id: 'lobby-1',
        join_code: 'ABC123',
        host_id: 'player-1',
        hostUsername: 'alice',
        status: 'waiting',
        playerCount: 2,
        created_at: '2024-01-01T00:00:00Z',
      });
    });

    it('returns empty array when no waiting lobbies exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const app = createApp();
      const res = await request(app).get('/api/lobbies');

      expect(res.status).toBe(200);
      expect(res.body.lobbies).toEqual([]);
    });
  });

  describe('POST /api/lobbies', () => {
    it('creates a lobby with a unique join code and adds host as first player', async () => {
      // Player lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'player-1' }] });
      // Join code uniqueness check
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Transaction queries
      mockClientQuery
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'lobby-new',
              join_code: 'XYZ789',
              host_id: 'player-1',
              status: 'waiting',
              created_at: '2024-01-01T00:00:00Z',
            },
          ],
        }) // INSERT lobby
        .mockResolvedValueOnce(undefined) // INSERT lobby_players
        .mockResolvedValueOnce(undefined); // COMMIT

      const app = createApp();
      const res = await request(app).post('/api/lobbies');

      expect(res.status).toBe(201);
      expect(res.body.lobby).toBeDefined();
      expect(res.body.lobby.host_id).toBe('player-1');
      expect(res.body.lobby.status).toBe('waiting');
    });

    it('returns 404 if player profile not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const app = createApp();
      const res = await request(app).post('/api/lobbies');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });
  });

  describe('POST /api/lobbies/:code/join', () => {
    it('adds a player to an existing waiting lobby', async () => {
      // Player lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'player-2' }] });
      // Lobby lookup
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'lobby-1',
            join_code: 'ABC123',
            host_id: 'player-1',
            status: LobbyStatus.Waiting,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      });
      // Check if already in lobby
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Insert into lobby_players
      mockQuery.mockResolvedValueOnce(undefined);

      const app = createApp();
      const res = await request(app).post('/api/lobbies/ABC123/join');

      expect(res.status).toBe(200);
      expect(res.body.lobby).toBeDefined();
      expect(res.body.lobby.id).toBe('lobby-1');
    });

    it('returns 409 when lobby is in_session', async () => {
      // Player lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'player-2' }] });
      // Lobby lookup - in_session
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'lobby-1',
            join_code: 'ABC123',
            host_id: 'player-1',
            status: LobbyStatus.InSession,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const app = createApp();
      const res = await request(app).post('/api/lobbies/ABC123/join');

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('conflict');
      expect(res.body.message).toBe('Session is already in progress.');
    });

    it('returns 404 when lobby not found', async () => {
      // Player lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'player-2' }] });
      // Lobby lookup - not found
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const app = createApp();
      const res = await request(app).post('/api/lobbies/NOPE00/join');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });

    it('returns 200 if player is already in the lobby', async () => {
      // Player lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'player-2' }] });
      // Lobby lookup
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'lobby-1',
            join_code: 'ABC123',
            host_id: 'player-1',
            status: LobbyStatus.Waiting,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      });
      // Already in lobby
      mockQuery.mockResolvedValueOnce({ rows: [{ lobby_id: 'lobby-1', player_id: 'player-2' }] });

      const app = createApp();
      const res = await request(app).post('/api/lobbies/ABC123/join');

      expect(res.status).toBe(200);
      expect(res.body.lobby).toBeDefined();
    });

    it('returns 409 when lobby is closed', async () => {
      // Player lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'player-2' }] });
      // Lobby lookup - closed
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'lobby-1',
            join_code: 'ABC123',
            host_id: 'player-1',
            status: LobbyStatus.Closed,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      });

      const app = createApp();
      const res = await request(app).post('/api/lobbies/ABC123/join');

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('conflict');
    });
  });
});
