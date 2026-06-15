import { Request, Response, NextFunction } from 'express';
import { getSupabase } from '../supabaseClient';
import pool from '../db';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // --- Dev bypass: skip JWT validation in development mode ---
  if (
    process.env.NODE_ENV === 'development' &&
    req.headers['x-dev-bypass'] === 'true' &&
    req.headers['x-dev-player-id']
  ) {
    const playerId = req.headers['x-dev-player-id'] as string;

    // Verify the player exists in the database
    const playerResult = await pool.query(
      'SELECT supabase_user_id, email FROM players WHERE id = $1',
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      res.status(401).json({ error: 'unauthorized', message: 'Dev bypass: player not found' });
      return;
    }

    req.user = {
      id: playerResult.rows[0].supabase_user_id,
      email: playerResult.rows[0].email,
    };

    next();
    return;
  }

  // --- Normal JWT auth flow ---
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { data, error } = await getSupabase().auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
      return;
    }

    req.user = {
      id: data.user.id,
      email: data.user.email || '',
    };

    next();
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
  }
}
