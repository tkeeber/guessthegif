import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import pool from '../db';
import {
  AuthCallbackRequest,
  AuthCallbackResponse,
  AuthMeResponse,
} from '../types';

const router = Router();

// POST /api/auth/callback
// Creates or returns existing Player record for the authenticated Supabase user
router.post('/callback', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { supabaseUserId, email, username } = req.body as AuthCallbackRequest;

    if (!supabaseUserId || !email || !username) {
      res.status(400).json({ error: 'bad_request', message: 'Missing required fields: supabaseUserId, email, username' });
      return;
    }

    // Check if player already exists for this Supabase user
    const existing = await pool.query(
      'SELECT * FROM players WHERE supabase_user_id = $1',
      [supabaseUserId]
    );

    if (existing.rows.length > 0) {
      const response: AuthCallbackResponse = { player: existing.rows[0] };
      res.status(200).json(response);
      return;
    }

    // Create new player record
    try {
      const result = await pool.query(
        `INSERT INTO players (supabase_user_id, email, username)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [supabaseUserId, email, username]
      );

      const response: AuthCallbackResponse = { player: result.rows[0] };
      res.status(201).json(response);
    } catch (insertError: unknown) {
      // Handle duplicate email/username constraint violations
      if (
        insertError instanceof Error &&
        'code' in insertError &&
        (insertError as { code: string }).code === '23505'
      ) {
        res.status(409).json({ error: 'conflict', message: 'Email is already in use.' });
        return;
      }
      throw insertError;
    }
  } catch (error) {
    console.error('Auth callback error:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

// GET /api/auth/me
// Returns the current player's profile based on the authenticated Supabase user
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const result = await pool.query(
      'SELECT * FROM players WHERE supabase_user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Player profile not found' });
      return;
    }

    const response: AuthMeResponse = { player: result.rows[0] };
    res.status(200).json(response);
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

export default router;
