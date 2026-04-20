/**
 * GuessMatcher — compares a player's guess against the correct film name
 * using Levenshtein distance with a tolerance of ≤ 2.
 *
 * Requirements: 3.5, 3.6
 */

/**
 * Normalize a string for comparison: lowercase and trim whitespace.
 */
export function normalize(input: string): string {
  return input.toLowerCase().trim();
}

/**
 * Compute the Levenshtein distance between two strings using a
 * full dynamic-programming matrix.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Create a (m+1) x (n+1) matrix
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,       // deletion
        dp[i][j - 1] + 1,       // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Returns true if the guess is within Levenshtein distance ≤ 2 of the
 * film name (case-insensitive, trimmed).
 */
export function isCorrectGuess(guess: string, filmName: string): boolean {
  const normalizedGuess = normalize(guess);
  const normalizedFilm = normalize(filmName);
  return levenshteinDistance(normalizedGuess, normalizedFilm) <= 2;
}
