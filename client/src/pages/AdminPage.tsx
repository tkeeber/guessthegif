import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

// ---- Types matching server API responses ----

interface TMDBMovie {
  tmdbMovieId: number;
  title: string;
  releaseYear: number;
  posterUrl: string | null;
  overview: string;
}

interface TMDBMovieDetails extends TMDBMovie {
  leadActors: string;
  genres: string[];
}

interface GIPHYGif {
  giphyGifId: string;
  gifUrl: string;
  previewUrl: string;
  title: string;
}

interface Gif {
  id: string;
  film_name: string;
  tmdb_movie_id: number;
  giphy_gif_id: string;
  gif_url: string;
  lead_actors: string;
  release_year: number;
  theme: string;
  is_active: boolean;
  created_at: string;
}

// ---- Styles ----

const styles = {
  page: { maxWidth: 960, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' } as const,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 } as const,
  section: { marginBottom: 32, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 } as const,
  sectionTitle: { fontSize: 18, fontWeight: 600, marginBottom: 12 } as const,
  searchRow: { display: 'flex', gap: 8, marginBottom: 12 } as const,
  input: { flex: 1, padding: '8px 12px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6 } as const,
  btn: { padding: '8px 16px', fontSize: 14, borderRadius: 6, border: 'none', cursor: 'pointer', background: '#4f46e5', color: '#fff' } as const,
  btnDanger: { padding: '6px 12px', fontSize: 13, borderRadius: 6, border: 'none', cursor: 'pointer', background: '#dc2626', color: '#fff' } as const,
  btnSecondary: { padding: '8px 16px', fontSize: 14, borderRadius: 6, border: '1px solid #4f46e5', cursor: 'pointer', background: '#fff', color: '#4f46e5' } as const,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 } as const,
  card: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, cursor: 'pointer', textAlign: 'center' as const } as const,
  cardSelected: { border: '2px solid #4f46e5', borderRadius: 8, padding: 8, cursor: 'pointer', textAlign: 'center' as const } as const,
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 } as const,
  label: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 } as const,
  fieldInput: { width: '100%', padding: '6px 10px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' as const } as const,
  error: { color: '#dc2626', fontSize: 13, marginTop: 4 } as const,
  success: { color: '#16a34a', fontSize: 13, marginTop: 4 } as const,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as const,
  th: { textAlign: 'left' as const, padding: '8px 6px', borderBottom: '2px solid #e5e7eb', fontWeight: 600 } as const,
  td: { padding: '8px 6px', borderBottom: '1px solid #f3f4f6' } as const,
};

// ---- Component ----

interface AdminPageProps {
  onBack: () => void;
}

export default function AdminPage({ onBack }: AdminPageProps) {
  // TMDB search
  const [tmdbQuery, setTmdbQuery] = useState('');
  const [tmdbResults, setTmdbResults] = useState<TMDBMovie[]>([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);

  // Selected movie details
  const [selectedMovie, setSelectedMovie] = useState<TMDBMovieDetails | null>(null);

  // GIPHY search
  const [giphyQuery, setGiphyQuery] = useState('');
  const [giphyResults, setGiphyResults] = useState<GIPHYGif[]>([]);
  const [giphyLoading, setGiphyLoading] = useState(false);
  const [selectedGif, setSelectedGif] = useState<GIPHYGif | null>(null);

  // Metadata form (editable)
  const [filmName, setFilmName] = useState('');
  const [leadActors, setLeadActors] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [theme, setTheme] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  // GIF library
  const [library, setLibrary] = useState<Gif[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ filmName: string; leadActors: string; releaseYear: string; theme: string }>({ filmName: '', leadActors: '', releaseYear: '', theme: '' });

  const [error, setError] = useState('');

  // Load library on mount
  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const data = await apiFetch<{ gifs: Gif[] }>('/api/admin/gifs');
      setLibrary(data.gifs);
    } catch (e) {
      console.error('Failed to load GIF library', e);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  // TMDB search
  const handleTmdbSearch = async () => {
    if (!tmdbQuery.trim()) return;
    setTmdbLoading(true);
    setError('');
    setTmdbResults([]);
    setSelectedMovie(null);
    try {
      const data = await apiFetch<{ results: TMDBMovie[] }>(`/api/admin/tmdb/search?q=${encodeURIComponent(tmdbQuery)}`);
      setTmdbResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'TMDB search failed');
    } finally {
      setTmdbLoading(false);
    }
  };

  // Select a TMDB movie → fetch details and auto-populate
  const handleSelectMovie = async (movie: TMDBMovie) => {
    setError('');
    try {
      const data = await apiFetch<{ movie: TMDBMovieDetails }>(`/api/admin/tmdb/movie/${movie.tmdbMovieId}`);
      const m = data.movie;
      setSelectedMovie(m);
      setFilmName(m.title);
      setLeadActors(m.leadActors);
      setReleaseYear(String(m.releaseYear));
      setTheme(m.genres.join(', '));
      // Auto-trigger GIPHY search with film title
      setGiphyQuery(m.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load movie details');
    }
  };

  // GIPHY search
  const handleGiphySearch = async () => {
    if (!giphyQuery.trim()) return;
    setGiphyLoading(true);
    setGiphyResults([]);
    setSelectedGif(null);
    try {
      const data = await apiFetch<{ results: GIPHYGif[] }>(`/api/admin/giphy/search?q=${encodeURIComponent(giphyQuery)}`);
      setGiphyResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'GIPHY search failed');
    } finally {
      setGiphyLoading(false);
    }
  };

  // Save curated GIF
  const handleSave = async () => {
    setSaveError('');
    setSaveSuccess('');

    if (!selectedMovie) { setSaveError('Select a film from TMDB first'); return; }
    if (!selectedGif) { setSaveError('Select a GIF from GIPHY first'); return; }
    if (!filmName.trim() || !leadActors.trim() || !releaseYear.trim() || !theme.trim()) {
      setSaveError('All metadata fields are required');
      return;
    }

    setSaving(true);
    try {
      await apiFetch<{ gif: Gif }>('/api/admin/gifs', {
        method: 'POST',
        body: JSON.stringify({
          filmName: filmName.trim(),
          tmdbMovieId: selectedMovie.tmdbMovieId,
          giphyGifId: selectedGif.giphyGifId,
          gifUrl: selectedGif.gifUrl,
          leadActors: leadActors.trim(),
          releaseYear: parseInt(releaseYear, 10),
          theme: theme.trim(),
        }),
      });
      setSaveSuccess('GIF saved to library!');
      // Reset curation form
      setSelectedMovie(null);
      setSelectedGif(null);
      setTmdbResults([]);
      setGiphyResults([]);
      setTmdbQuery('');
      setGiphyQuery('');
      setFilmName('');
      setLeadActors('');
      setReleaseYear('');
      setTheme('');
      loadLibrary();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save GIF');
    } finally {
      setSaving(false);
    }
  };

  // Delete (soft-delete)
  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/admin/gifs/${id}`, { method: 'DELETE' });
      loadLibrary();
    } catch (e) {
      console.error('Delete failed', e);
    }
  };

  // Edit
  const startEdit = (gif: Gif) => {
    setEditingId(gif.id);
    setEditForm({ filmName: gif.film_name, leadActors: gif.lead_actors, releaseYear: String(gif.release_year), theme: gif.theme });
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      await apiFetch(`/api/admin/gifs/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          filmName: editForm.filmName,
          leadActors: editForm.leadActors,
          releaseYear: parseInt(editForm.releaseYear, 10),
          theme: editForm.theme,
        }),
      });
      setEditingId(null);
      loadLibrary();
    } catch (e) {
      console.error('Update failed', e);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={{ margin: 0 }}>🎬 Admin — GIF Curation</h1>
        <button style={styles.btnSecondary} onClick={onBack}>← Back</button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {/* TMDB Film Search */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>1. Search for a Film (TMDB)</div>
        <div style={styles.searchRow}>
          <input
            style={styles.input}
            placeholder="Film title…"
            value={tmdbQuery}
            onChange={(e) => setTmdbQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTmdbSearch()}
          />
          <button style={styles.btn} onClick={handleTmdbSearch} disabled={tmdbLoading}>
            {tmdbLoading ? 'Searching…' : 'Search TMDB'}
          </button>
        </div>

        {tmdbResults.length > 0 && (
          <div style={styles.grid}>
            {tmdbResults.map((m) => (
              <div
                key={m.tmdbMovieId}
                style={selectedMovie?.tmdbMovieId === m.tmdbMovieId ? styles.cardSelected : styles.card}
                onClick={() => handleSelectMovie(m)}
              >
                {m.posterUrl && <img src={m.posterUrl} alt={m.title} style={{ width: '100%', borderRadius: 4 }} />}
                <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{m.releaseYear || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GIPHY GIF Search */}
      {selectedMovie && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>2. Find a GIF (GIPHY)</div>
          <div style={styles.searchRow}>
            <input
              style={styles.input}
              placeholder="GIF search query…"
              value={giphyQuery}
              onChange={(e) => setGiphyQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGiphySearch()}
            />
            <button style={styles.btn} onClick={handleGiphySearch} disabled={giphyLoading}>
              {giphyLoading ? 'Searching…' : 'Search GIPHY'}
            </button>
          </div>

          {giphyResults.length > 0 && (
            <div style={styles.grid}>
              {giphyResults.map((g) => (
                <div
                  key={g.giphyGifId}
                  style={selectedGif?.giphyGifId === g.giphyGifId ? styles.cardSelected : styles.card}
                  onClick={() => setSelectedGif(g)}
                >
                  <img src={g.previewUrl} alt={g.title} style={{ width: '100%', borderRadius: 4 }} />
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{g.title}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Metadata Form */}
      {selectedMovie && selectedGif && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>3. Confirm Metadata & Save</div>
          <div style={styles.formGrid}>
            <div>
              <label style={styles.label}>Film Name</label>
              <input style={styles.fieldInput} value={filmName} onChange={(e) => setFilmName(e.target.value)} />
            </div>
            <div>
              <label style={styles.label}>Release Year</label>
              <input style={styles.fieldInput} value={releaseYear} onChange={(e) => setReleaseYear(e.target.value)} />
            </div>
            <div>
              <label style={styles.label}>Lead Actors</label>
              <input style={styles.fieldInput} value={leadActors} onChange={(e) => setLeadActors(e.target.value)} />
            </div>
            <div>
              <label style={styles.label}>Theme / Genre</label>
              <input style={styles.fieldInput} value={theme} onChange={(e) => setTheme(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Selected GIF:</strong>{' '}
            <img src={selectedGif.previewUrl} alt="" style={{ height: 60, verticalAlign: 'middle', borderRadius: 4, marginLeft: 8 }} />
          </div>
          <button style={styles.btn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save to Library'}
          </button>
          {saveError && <p style={styles.error}>{saveError}</p>}
          {saveSuccess && <p style={styles.success}>{saveSuccess}</p>}
        </div>
      )}

      {/* GIF Library */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>GIF Library</div>
        {libraryLoading ? (
          <p>Loading…</p>
        ) : library.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No GIFs in library yet.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Film</th>
                <th style={styles.th}>Year</th>
                <th style={styles.th}>Actors</th>
                <th style={styles.th}>Theme</th>
                <th style={styles.th}>Active</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {library.map((gif) => (
                <tr key={gif.id}>
                  {editingId === gif.id ? (
                    <>
                      <td style={styles.td}>
                        <input style={{ ...styles.fieldInput, width: 140 }} value={editForm.filmName} onChange={(e) => setEditForm({ ...editForm, filmName: e.target.value })} />
                      </td>
                      <td style={styles.td}>
                        <input style={{ ...styles.fieldInput, width: 60 }} value={editForm.releaseYear} onChange={(e) => setEditForm({ ...editForm, releaseYear: e.target.value })} />
                      </td>
                      <td style={styles.td}>
                        <input style={{ ...styles.fieldInput, width: 140 }} value={editForm.leadActors} onChange={(e) => setEditForm({ ...editForm, leadActors: e.target.value })} />
                      </td>
                      <td style={styles.td}>
                        <input style={{ ...styles.fieldInput, width: 100 }} value={editForm.theme} onChange={(e) => setEditForm({ ...editForm, theme: e.target.value })} />
                      </td>
                      <td style={styles.td}>{gif.is_active ? '✅' : '❌'}</td>
                      <td style={styles.td}>
                        <button style={{ ...styles.btn, marginRight: 4, fontSize: 12, padding: '4px 10px' }} onClick={handleUpdate}>Save</button>
                        <button style={{ ...styles.btnSecondary, fontSize: 12, padding: '4px 10px' }} onClick={() => setEditingId(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={styles.td}>{gif.film_name}</td>
                      <td style={styles.td}>{gif.release_year}</td>
                      <td style={styles.td}>{gif.lead_actors}</td>
                      <td style={styles.td}>{gif.theme}</td>
                      <td style={styles.td}>{gif.is_active ? '✅' : '❌'}</td>
                      <td style={styles.td}>
                        <button style={{ ...styles.btnSecondary, fontSize: 12, padding: '4px 10px', marginRight: 4 }} onClick={() => startEdit(gif)}>Edit</button>
                        {gif.is_active && (
                          <button style={{ ...styles.btnDanger, fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(gif.id)}>Delete</button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
