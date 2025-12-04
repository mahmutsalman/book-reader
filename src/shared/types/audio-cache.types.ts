/**
 * Audio cache type definitions for pronunciation caching system.
 */

/**
 * Types of audio that can be cached.
 * Extensible for future audio sources (Tatoeba, movies, etc.)
 */
export enum AudioType {
  WORD = 'word',
  SENTENCE = 'sentence',
  SIMPLIFIED = 'simplified',
  TATOEBA = 'tatoeba',    // Future: Tatoeba example sentences
  MOVIE = 'movie',        // Future: Movie clip pronunciations
}

/**
 * A cached audio entry stored in IndexedDB or memory.
 */
export interface AudioCacheEntry {
  /** Unique cache key: {language}:{type}:{textHash} */
  key: string;
  /** Base64-encoded audio data */
  base64: string;
  /** Language code (e.g., 'en', 'ru', 'de') */
  language: string;
  /** Type of audio (word, sentence, etc.) */
  type: AudioType;
  /** First 50 chars of original text for debugging */
  textPreview: string;
  /** Timestamp when entry was created */
  createdAt: number;
  /** Timestamp when entry was last accessed */
  lastAccessedAt: number;
  /** Size of base64 data in bytes */
  size: number;
}

/**
 * Cache statistics for monitoring.
 */
export interface AudioCacheStats {
  /** Number of entries in memory cache */
  memoryCount: number;
  /** Number of entries in IndexedDB */
  dbCount: number;
  /** Total size of all cached audio in bytes */
  totalSizeBytes: number;
}

/**
 * Item to preload audio for.
 */
export interface AudioPreloadItem {
  text: string;
  language: string;
  type: AudioType;
}
