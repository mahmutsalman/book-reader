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
