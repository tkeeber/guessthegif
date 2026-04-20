/**
 * ClueService — generates clues from GIF metadata when a round's
 * initial timer expires without a correct guess.
 *
 * Requirements: 3.8, 3.9
 */

import { ClueType } from '../types/enums';
import { Clue, GifMetadata } from '../types/entities';

const ARTICLES = new Set(['the', 'a', 'an']);

/**
 * Build the list of available clue types from the GIF metadata.
 * `title_word` is excluded when the film title is a single word.
 */
export function getAvailableClueTypes(metadata: GifMetadata): ClueType[] {
  const types: ClueType[] = [
    ClueType.Actors,
    ClueType.Year,
    ClueType.Theme,
  ];

  const words = getNonArticleWords(metadata.filmName);
  if (words.length > 0 && metadata.filmName.trim().split(/\s+/).length > 1) {
    types.push(ClueType.TitleWord);
  }

  return types;
}

/**
 * Get non-article words from a film title.
 */
function getNonArticleWords(filmName: string): string[] {
  return filmName
    .trim()
    .split(/\s+/)
    .filter((w) => !ARTICLES.has(w.toLowerCase()));
}

/**
 * Generate a clue for the given GIF metadata.
 * Randomly selects one of the available clue types and produces the
 * corresponding clue text.
 *
 * An optional `randomFn` parameter allows deterministic testing.
 */
export function generateClue(
  metadata: GifMetadata,
  randomFn: () => number = Math.random
): Clue {
  const availableTypes = getAvailableClueTypes(metadata);

  const typeIndex = Math.floor(randomFn() * availableTypes.length);
  const clueType = availableTypes[typeIndex];

  const clueText = buildClueText(clueType, metadata, randomFn);

  return { clueType, clueText };
}

/**
 * Build the human-readable clue text for a given clue type.
 */
function buildClueText(
  clueType: ClueType,
  metadata: GifMetadata,
  randomFn: () => number
): string {
  switch (clueType) {
    case ClueType.Actors:
      return `Lead actors: ${metadata.leadActors}`;

    case ClueType.Year:
      return `Release year: ${metadata.releaseYear}`;

    case ClueType.Theme:
      return `Theme: ${metadata.theme}`;

    case ClueType.TitleWord: {
      const words = getNonArticleWords(metadata.filmName);
      const wordIndex = Math.floor(randomFn() * words.length);
      return `One word from the title: "${words[wordIndex]}"`;
    }
  }
}
