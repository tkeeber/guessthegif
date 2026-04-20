import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import pool from '../db';
import * as tmdbService from '../services/tmdbService';
import * as giphyService from '../services/giphyService';
import {
  TMDBSearchResponse,
  TMDBMovieDetailsResponse,
  GIPHYSearchResponse,
  ListGifsResponse,
  CreateGifRequest,
  CreateGifResponse,
  UpdateGifRequest,
  UpdateGifResponse,
} from '../types';

const router = Router();

// All admin routes require auth + admin check
router.use(requireAuth);
router.use(async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Not authenticated' });
      return;
    }

    const result = await pool.query(
      'SELECT is_admin FROM players WHERE supabase_user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

// ============================================================
// TMDB endpoints
// ============================================================

// GET /api/admin/tmdb/search?q=query
router.get('/tmdb/search', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const q = req.query.q as string | undefined;
    if (!q || q.trim().length === 0) {
      res.status(400).json({ error: 'bad_request', message: 'Query parameter "q" is required' });
      return;
    }

    const results = await tmdbService.searchMovies(q);
    const response: TMDBSearchResponse = { results };
    res.status(200).json(response);
  } catch (error) {
    console.error('TMDB search error:', error);
    res.status(502).json({ error: 'bad_gateway', message: 'Unable to search films. Please try again.' });
  }
});

// GET /api/admin/tmdb/movie/:id
router.get('/tmdb/movie/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tmdbId = parseInt(req.params.id, 10);
    if (isNaN(tmdbId)) {
      res.status(400).json({ error: 'bad_request', message: 'Invalid TMDB movie ID' });
      return;
    }

    const movie = await tmdbService.getMovieDetails(tmdbId);
    const response: TMDBMovieDetailsResponse = { movie };
    res.status(200).json(response);
  } catch (error) {
    console.error('TMDB movie details error:', error);
    res.status(502).json({ error: 'bad_gateway', message: 'Unable to search films. Please try again.' });
  }
});

// ============================================================
// GIPHY endpoints
// ============================================================

// GET /api/admin/giphy/search?q=query
router.get('/giphy/search', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const q = req.query.q as string | undefined;
    if (!q || q.trim().length === 0) {
      res.status(400).json({ error: 'bad_request', message: 'Query parameter "q" is required' });
      return;
    }

    const results = await giphyService.searchGifs(q);
    const response: GIPHYSearchResponse = { results };
    res.status(200).json(response);
  } catch (error) {
    console.error('GIPHY search error:', error);
    res.status(502).json({ error: 'bad_gateway', message: 'Unable to search GIFs. Please try again.' });
  }
});

// ============================================================
// GIF library CRUD
// ============================================================

const REQUIRED_GIF_FIELDS: (keyof CreateGifRequest)[] = [
  'filmName',
  'gifUrl',
  'tmdbMovieId',
  'leadActors',
  'releaseYear',
  'theme',
];

// GET /api/admin/gifs
router.get('/gifs', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT * FROM gifs ORDER BY created_at DESC'
    );
    const response: ListGifsResponse = { gifs: result.rows };
    res.status(200).json(response);
  } catch (error) {
    console.error('List gifs error:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

// POST /api/admin/gifs
router.post('/gifs', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const body = req.body as CreateGifRequest;

    // Validate required fields
    const missing = REQUIRED_GIF_FIELDS.filter((f) => {
      const val = body[f];
      return val === undefined || val === null || val === '';
    });

    if (missing.length > 0) {
      res.status(400).json({
        error: 'bad_request',
        message: `Missing required fields: ${missing.join(', ')}`,
      });
      return;
    }

    const result = await pool.query(
      `INSERT INTO gifs (film_name, tmdb_movie_id, giphy_gif_id, gif_url, lead_actors, release_year, theme)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        body.filmName,
        body.tmdbMovieId,
        body.giphyGifId || '',
        body.gifUrl,
        body.leadActors,
        body.releaseYear,
        body.theme,
      ]
    );

    const response: CreateGifResponse = { gif: result.rows[0] };
    res.status(201).json(response);
  } catch (error) {
    console.error('Create gif error:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

// PUT /api/admin/gifs/:id
router.put('/gifs/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = req.body as UpdateGifRequest;

    // Build dynamic SET clause from provided fields
    const fieldMap: Record<string, string> = {
      filmName: 'film_name',
      tmdbMovieId: 'tmdb_movie_id',
      giphyGifId: 'giphy_gif_id',
      gifUrl: 'gif_url',
      leadActors: 'lead_actors',
      releaseYear: 'release_year',
      theme: 'theme',
    };

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      const val = body[jsKey as keyof UpdateGifRequest];
      if (val !== undefined) {
        setClauses.push(`${dbCol} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'bad_request', message: 'No fields to update' });
      return;
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE gifs SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'GIF not found' });
      return;
    }

    const response: UpdateGifResponse = { gif: result.rows[0] };
    res.status(200).json(response);
  } catch (error) {
    console.error('Update gif error:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

// DELETE /api/admin/gifs/:id — soft-delete (set is_active=false)
router.delete('/gifs/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE gifs SET is_active = false WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'GIF not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete gif error:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

export default router;
