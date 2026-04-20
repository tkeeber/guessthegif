import { describe, it, expect } from 'vitest';
import {
  normalize,
  levenshteinDistance,
  isCorrectGuess,
} from './guessMatcher';

describe('guessMatcher', () => {
  describe('normalize', () => {
    it('lowercases and trims', () => {
      expect(normalize('  The Godfather  ')).toBe('the godfather');
    });

    it('handles empty string', () => {
      expect(normalize('')).toBe('');
    });
  });

  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(levenshteinDistance('abc', 'abc')).toBe(0);
    });

    it('returns length of other string when one is empty', () => {
      expect(levenshteinDistance('', 'abc')).toBe(3);
      expect(levenshteinDistance('abc', '')).toBe(3);
    });

    it('returns 1 for single substitution', () => {
      expect(levenshteinDistance('cat', 'car')).toBe(1);
    });

    it('returns 1 for single insertion', () => {
      expect(levenshteinDistance('cat', 'cats')).toBe(1);
    });

    it('returns 1 for single deletion', () => {
      expect(levenshteinDistance('cats', 'cat')).toBe(1);
    });

    it('returns 2 for two edits', () => {
      // "godfahter" → "godfather" requires transposition = 2 edits
      expect(levenshteinDistance('godfahter', 'godfather')).toBe(2);
    });
  });

  describe('isCorrectGuess', () => {
    it('accepts exact match', () => {
      expect(isCorrectGuess('The Godfather', 'The Godfather')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isCorrectGuess('the godfather', 'The Godfather')).toBe(true);
    });

    it('trims whitespace', () => {
      expect(isCorrectGuess('  The Godfather  ', 'The Godfather')).toBe(true);
    });

    it('accepts guess with 1 typo', () => {
      expect(isCorrectGuess('The Godfathir', 'The Godfather')).toBe(true);
    });

    it('accepts guess with 2 typos', () => {
      expect(isCorrectGuess('The Godfahter', 'The Godfather')).toBe(true);
    });

    it('rejects guess with 3+ differences', () => {
      expect(isCorrectGuess('The Godfaxyzr', 'The Godfather')).toBe(false);
    });

    it('rejects completely wrong guess', () => {
      expect(isCorrectGuess('Star Wars', 'The Godfather')).toBe(false);
    });
  });
});
