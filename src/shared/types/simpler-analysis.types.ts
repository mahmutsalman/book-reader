/**
 * Simpler Analysis Types
 * For the Simpler Mode feature providing simplified language alternatives
 */

/**
 * Simplified word/phrase analysis result from AI
 */
export interface SimplerAnalysis {
  // Selected word/phrase specific
  simplerVersion: string;              // Simplified alternative (1-5 words)
  roleInContext: string;               // Explanation of the word's role (2-3 sentences)
  paraphrases: string[];               // 2-3 alternative paraphrased versions

  // Full view context
  simplifiedView: string;              // Entire current view simplified (paragraph)
  complexityReduction?: string;        // Optional: How much simpler (e.g., "B2 -> A2")
}

/**
 * Cache entry for simpler analysis
 * Cached per word/phrase + sentence combination
 */
export interface CachedSimplerData {
  cacheVersion: number;
  analysis: SimplerAnalysis;
  fetchedAt: number;
}

/**
 * Cache key format: `${bookId}-simpler-${word}-${sentenceHash}`
 */
export function generateSimplerCacheKey(
  bookId: number,
  word: string,
  sentence: string
): string {
  // Create simple hash from sentence to keep key manageable
  const sentenceHash = sentence.substring(0, 50).replace(/\s+/g, '-');
  return `${bookId}-simpler-${word}-${sentenceHash}`;
}

/**
 * Current cache version for simpler analysis
 */
export const SIMPLER_CACHE_VERSION = 1;
