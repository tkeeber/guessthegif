import { TMDBMovie, TMDBMovieDetails } from '../types';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('TMDB_API_KEY environment variable is required');
  return key;
}

export async function searchMovies(query: string): Promise<TMDBMovie[]> {
  const cacheKey = `tmdb:search:${query.toLowerCase().trim()}`;
  const cached = getCached<TMDBMovie[]>(cacheKey);
  if (cached) return cached;

  const apiKey = getApiKey();
  const url = `${TMDB_BASE_URL}/search/movie?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as {
    results: Array<{
      id: number;
      title: string;
      release_date?: string;
      poster_path?: string | null;
      overview?: string;
    }>;
  };

  const results: TMDBMovie[] = body.results.slice(0, 20).map((m) => ({
    tmdbMovieId: m.id,
    title: m.title,
    releaseYear: m.release_date ? parseInt(m.release_date.slice(0, 4), 10) : 0,
    posterUrl: m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : null,
    overview: m.overview ?? '',
  }));

  setCache(cacheKey, results);
  return results;
}

export async function getMovieDetails(tmdbMovieId: number): Promise<TMDBMovieDetails> {
  const cacheKey = `tmdb:movie:${tmdbMovieId}`;
  const cached = getCached<TMDBMovieDetails>(cacheKey);
  if (cached) return cached;

  const apiKey = getApiKey();
  const url = `${TMDB_BASE_URL}/movie/${tmdbMovieId}?api_key=${encodeURIComponent(apiKey)}&append_to_response=credits`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as {
    id: number;
    title: string;
    release_date?: string;
    poster_path?: string | null;
    overview?: string;
    genres?: Array<{ name: string }>;
    credits?: {
      cast?: Array<{ name: string; order: number }>;
    };
  };

  const cast = body.credits?.cast ?? [];
  const leadActors = cast
    .sort((a, b) => a.order - b.order)
    .slice(0, 5)
    .map((c) => c.name)
    .join(', ');

  const genres = (body.genres ?? []).map((g) => g.name);

  const details: TMDBMovieDetails = {
    tmdbMovieId: body.id,
    title: body.title,
    releaseYear: body.release_date ? parseInt(body.release_date.slice(0, 4), 10) : 0,
    posterUrl: body.poster_path ? `https://image.tmdb.org/t/p/w200${body.poster_path}` : null,
    overview: body.overview ?? '',
    leadActors,
    genres,
  };

  setCache(cacheKey, details);
  return details;
}
