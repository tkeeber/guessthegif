/**
 * Bot Personality Configuration
 *
 * Defines the personality tiers for automated bot players, including
 * guess delay ranges, accuracy probabilities, and display settings.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

export interface BotPersonality {
  tier: 'novice' | 'intermediate' | 'expert';
  displayPrefix: string;
  delayRange: { minMs: number; maxMs: number };
  correctProbability: { min: number; max: number };
  postClueProbability?: number;
}

export const BOT_PERSONALITIES: Record<string, BotPersonality> = {
  novice: {
    tier: 'novice',
    displayPrefix: 'NoviceBot',
    delayRange: { minMs: 8000, maxMs: 15000 },
    correctProbability: { min: 0.10, max: 0.20 },
  },
  intermediate: {
    tier: 'intermediate',
    displayPrefix: 'IntermediateBot',
    delayRange: { minMs: 4000, maxMs: 8000 },
    correctProbability: { min: 0.30, max: 0.50 },
  },
  expert: {
    tier: 'expert',
    displayPrefix: 'ExpertBot',
    delayRange: { minMs: 2000, maxMs: 5000 },
    correctProbability: { min: 0.60, max: 0.80 },
    postClueProbability: 0.90,
  },
};

/**
 * Returns a random delay in milliseconds within the personality's configured range.
 */
export function getRandomDelay(personality: BotPersonality): number {
  const { minMs, maxMs } = personality.delayRange;
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Determines whether a bot should guess correctly based on its personality
 * probability range. If the bot is an expert and has received a clue, the
 * postClueProbability (0.90) is used instead.
 */
export function shouldGuessCorrectly(
  personality: BotPersonality,
  hasReceivedClue: boolean
): boolean {
  let probability: number;

  if (hasReceivedClue && personality.postClueProbability != null) {
    probability = personality.postClueProbability;
  } else {
    const { min, max } = personality.correctProbability;
    probability = min + Math.random() * (max - min);
  }

  return Math.random() < probability;
}
