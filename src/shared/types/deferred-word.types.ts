// Deferred Word Lookup Types
// Manages background word fetching and caching for seamless reading experience

/**
 * Status of a queued word's AI fetch
 */
export type QueuedWordStatus = 'pending' | 'fetching' | 'ready' | 'error';

/**
 * Cached AI data for a word
 */
export interface CachedWordData {
  definition?: string;
  ipa?: string;
  simplifiedSentence?: string;
  wordEquivalent?: string;
  occurrences?: { page: number; sentence: string }[];
  tatoebaExamples?: { sentence: string; translation?: string }[];
  fetchedAt: number;
}

/**
 * A word that has been queued for background fetch
 */
export interface QueuedWordEntry {
  word: string;           // Clean lowercase word
  sentence: string;       // Context sentence for AI
  pageNumber: number;     // Original book page where word was clicked
  bookId: number;
  status: QueuedWordStatus;
  data?: CachedWordData;
  error?: string;
  queuedAt: number;
  fetchStartedAt?: number;
  fetchCompletedAt?: number;
}

/**
 * Context state for deferred word system
 */
export interface DeferredWordState {
  queuedWords: Map<string, QueuedWordEntry>;
  maxConcurrentFetches: number;
  cacheExpirationMs: number;
}

/**
 * Generate a unique key for a word in a specific book
 * Key format: `${bookId}-${cleanWord}`
 * This allows the same word to show red dots across all pages
 */
export function generateWordKey(bookId: number, word: string): string {
  return `${bookId}-${word.toLowerCase()}`;
}

/**
 * A phrase selection (multiple words)
 */
export interface SelectedPhrase {
  phrase: string;           // Combined phrase text (e.g., "look up")
  wordIndices: number[];    // All selected word indices (sorted)
  middleIndex: number;      // Index for dot placement (middle word)
  isPhrase: true;           // Discriminator for type checking
}

/**
 * Generate a unique key for a phrase in a specific book
 * Key format: `${bookId}-phrase-${normalizedPhrase}`
 */
export function generatePhraseKey(bookId: number, phrase: string): string {
  return `${bookId}-phrase-${phrase.toLowerCase().replace(/\s+/g, '-')}`;
}

/**
 * Calculate the middle index of a phrase selection for dot placement
 */
export function calculateMiddleIndex(indices: number[]): number {
  if (indices.length === 0) return -1;
  const sorted = [...indices].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Check if a word index is within valid adjacency of existing selection
 * Allows up to 1-word gap between selected words
 */
export function isWithinAdjacency(newIndex: number, selectedIndices: number[], maxGap = 1): boolean {
  if (selectedIndices.length === 0) return true;
  const sorted = [...selectedIndices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  // Check if new index is within maxGap of either end
  return (newIndex >= min - maxGap - 1 && newIndex <= max + maxGap + 1);
}
