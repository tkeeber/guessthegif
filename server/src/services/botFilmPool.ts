/**
 * Bot Film Title Pool
 *
 * A curated pool of plausible film titles used by bots when submitting
 * incorrect guesses. This ensures bot guesses look realistic rather than
 * being random strings.
 */

export const FILM_TITLE_POOL: string[] = [
  'The Shawshank Redemption',
  'The Godfather',
  'The Dark Knight',
  'Pulp Fiction',
  'Forrest Gump',
  'Inception',
  'The Matrix',
  'Fight Club',
  'Goodfellas',
  'The Silence of the Lambs',
  'Star Wars',
  'Jurassic Park',
  'Titanic',
  'The Lion King',
  'Back to the Future',
  'Gladiator',
  'The Departed',
  'Interstellar',
  'The Prestige',
  'Memento',
  'Toy Story',
  'Finding Nemo',
  'Avatar',
  'Jaws',
  'Alien',
  'Die Hard',
  'Home Alone',
  'Ghostbusters',
  'Indiana Jones',
  'The Terminator',
  'Rocky',
  'E.T.',
  "Schindler's List",
  'Braveheart',
  'The Truman Show',
  'Saving Private Ryan',
  'The Green Mile',
  'Django Unchained',
  'Mad Max: Fury Road',
  'Whiplash',
  'La La Land',
  'Get Out',
  'Parasite',
  'Joker',
  'Dune',
  'Top Gun',
  'The Shining',
  'Psycho',
  'The Exorcist',
  'A Quiet Place',
];

/**
 * Returns a random film title from the pool.
 * Used by bots when submitting incorrect guesses.
 */
export function getRandomFilmTitle(): string {
  return FILM_TITLE_POOL[Math.floor(Math.random() * FILM_TITLE_POOL.length)];
}
