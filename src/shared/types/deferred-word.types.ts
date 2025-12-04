// Deferred Word Lookup Types
// Manages background word fetching and caching for seamless reading experience

/**
 * Generate a simple hash from a string
 * Uses djb2 algorithm - fast and produces good distribution
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to positive hex string, take first 8 chars for brevity
  return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
}

/**
 * Normalize a sentence for consistent hashing
 * - Lowercase
 * - Remove extra whitespace
 * - Trim
 */
export function normalizeSentence(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

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
  syllables?: string;
  simplifiedSentence?: string;
  wordEquivalent?: string;
  occurrences?: { page: number; sentence: string }[];
  tatoebaExamples?: { sentence: string; translation?: string }[];
  // Translation fields (for non-English books)
  wordTranslation?: string;        // English translation of the word
  sentenceTranslation?: string;    // English translation of original sentence
  simplifiedTranslation?: string;  // English translation of simplified sentence
  phraseTranslation?: string;      // English translation of phrase (for phrases)
  // Word type/part of speech (noun, verb, adjective, etc.)
  wordType?: string;
  // German definite article (der, die, das) - only for German nouns
  germanArticle?: string;
  fetchedAt: number;
}

/**
 * A word that has been queued for background fetch
 */
export interface QueuedWordEntry {
  word: string;           // Clean lowercase word
  sentence: string;       // Context sentence for AI and cache key
  bookId: number;
  language: string;       // Book language for AI prompts
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
 * Generate a unique key for a word in a specific book and sentence context
 * Key format: `${bookId}-${cleanWord}-s${sentenceHash}`
 * Each unique sentence context gets its own cache entry for context-specific translations
 * This makes caching zoom-independent: same word + same sentence = same cache entry
 */
export function generateWordKey(bookId: number, word: string, sentence: string): string {
  const normalizedSentence = normalizeSentence(sentence);
  const sentenceHash = hashString(normalizedSentence);
  return `${bookId}-${word.toLowerCase()}-s${sentenceHash}`;
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
