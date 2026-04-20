import { describe, it, expect } from 'vitest';
import { getAvailableClueTypes, generateClue } from './clueService';
import { ClueType } from '../types/enums';
import { GifMetadata } from '../types/entities';

const multiWordMetadata: GifMetadata = {
  filmName: 'The Godfather',
  tmdbMovieId: 238,
  leadActors: 'Marlon Brando, Al Pacino',
  releaseYear: 1972,
  theme: 'Crime, Drama',
};

const singleWordMetadata: GifMetadata = {
  filmName: 'Jaws',
  tmdbMovieId: 578,
  leadActors: 'Roy Scheider',
  releaseYear: 1975,
  theme: 'Thriller',
};

const articleOnlyExtraWord: GifMetadata = {
  filmName: 'The A',
  tmdbMovieId: 1,
  leadActors: 'Actor',
  releaseYear: 2000,
  theme: 'Drama',
};

describe('clueService', () => {
  describe('getAvailableClueTypes', () => {
    it('includes title_word for multi-word titles', () => {
      const types = getAvailableClueTypes(multiWordMetadata);
      expect(types).toContain(ClueType.TitleWord);
    });

    it('excludes title_word for single-word titles', () => {
      const types = getAvailableClueTypes(singleWordMetadata);
      expect(types).not.toContain(ClueType.TitleWord);
    });

    it('always includes actors, year, and theme', () => {
      const types = getAvailableClueTypes(singleWordMetadata);
      expect(types).toContain(ClueType.Actors);
      expect(types).toContain(ClueType.Year);
      expect(types).toContain(ClueType.Theme);
    });
  });

  describe('generateClue', () => {
    it('generates an actors clue', () => {
      // randomFn returns 0 → picks first type (Actors)
      const clue = generateClue(multiWordMetadata, () => 0);
      expect(clue.clueType).toBe(ClueType.Actors);
      expect(clue.clueText).toBe('Lead actors: Marlon Brando, Al Pacino');
    });

    it('generates a year clue', () => {
      // randomFn returns 0.25 → index 1 (Year) out of 4 types
      const clue = generateClue(multiWordMetadata, () => 0.25);
      expect(clue.clueType).toBe(ClueType.Year);
      expect(clue.clueText).toBe('Release year: 1972');
    });

    it('generates a theme clue', () => {
      // randomFn returns 0.5 → index 2 (Theme) out of 4 types
      const clue = generateClue(multiWordMetadata, () => 0.5);
      expect(clue.clueType).toBe(ClueType.Theme);
      expect(clue.clueText).toBe('Theme: Crime, Drama');
    });

    it('generates a title_word clue excluding articles', () => {
      // randomFn returns 0.75 → index 3 (TitleWord) out of 4 types
      // Then for word selection, 0.75 picks from non-article words
      // "The Godfather" → non-article words: ["Godfather"]
      const clue = generateClue(multiWordMetadata, () => 0.75);
      expect(clue.clueType).toBe(ClueType.TitleWord);
      expect(clue.clueText).toBe('One word from the title: "Godfather"');
    });

    it('never generates title_word for single-word titles', () => {
      // With 3 types, any random value should not produce TitleWord
      for (const val of [0, 0.33, 0.66, 0.99]) {
        const clue = generateClue(singleWordMetadata, () => val);
        expect(clue.clueType).not.toBe(ClueType.TitleWord);
      }
    });
  });
});
