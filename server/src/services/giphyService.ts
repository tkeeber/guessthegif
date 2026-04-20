import { GIPHYGif } from '../types';

const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

function getApiKey(): string {
  const key = process.env.GIPHY_API_KEY;
  if (!key) throw new Error('GIPHY_API_KEY environment variable is required');
  return key;
}

export async function searchGifs(query: string, limit: number = 25): Promise<GIPHYGif[]> {
  const apiKey = getApiKey();
  const url = `${GIPHY_BASE_URL}/search?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&limit=${limit}&rating=pg-13`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GIPHY API error: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as {
    data: Array<{
      id: string;
      title: string;
      images: {
        original: { url: string };
        fixed_height: { url: string };
      };
    }>;
  };

  return body.data.map((g) => ({
    giphyGifId: g.id,
    gifUrl: g.images.original.url,
    previewUrl: g.images.fixed_height.url,
    title: g.title,
  }));
}
