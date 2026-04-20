/**
 * Leaderboard REST endpoints — all require authentication.
 *
 * GET /api/leaderboard              — Current season rankings
 * GET /api/leaderboard/seasons      — Archived season list
 * GET /api/leaderboard/seasons/:id  — Archived season leaderboard
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.6
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import {
  getCurrentSeasonLeaderboard,
  getArchivedSeasons,
  getArchivedSeasonLeaderboard,
} from '../services/leaderboardService';

const router = Router();

// GET /api/leaderboard
router.get(
  '/',
  requireAuth,
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const leaderboard = await getCurrentSeasonLeaderboard();
      res.status(200).json(leaderboard);
    } catch (error) {
      console.error('Get leaderboard error:', error);
      res.status(500).json({ error: 'server_error', message: 'Internal server error' });
    }
  }
);

// GET /api/leaderboard/seasons
router.get(
  '/seasons',
  requireAuth,
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const seasons = await getArchivedSeasons();
      res.status(200).json(seasons);
    } catch (error) {
      console.error('Get archived seasons error:', error);
      res.status(500).json({ error: 'server_error', message: 'Internal server error' });
    }
  }
);

// GET /api/leaderboard/seasons/:id
router.get(
  '/seasons/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await getArchivedSeasonLeaderboard(id);

      if (!result) {
        res.status(404).json({ error: 'not_found', message: 'Season not found' });
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Get archived season leaderboard error:', error);
      res.status(500).json({ error: 'server_error', message: 'Internal server error' });
    }
  }
);

export default router;
