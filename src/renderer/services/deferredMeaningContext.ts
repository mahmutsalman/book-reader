/**
 * Deferred Meaning Context Service
 * Full caching service with LRU eviction and 30min expiration
 */

import type {
  MeaningAnalysis,
  MeaningAnalysisType,
  CachedMeaningData,
} from '../../shared/types/meaning-analysis.types';
import {
  generateMeaningCacheKey,
  MEANING_CACHE_VERSION
} from '../../shared/types/meaning-analysis.types';

// Configuration
const CACHE_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_ENTRIES = 100; // LRU eviction limit

interface CacheEntry {
  data: CachedMeaningData;
  lastAccessed: number; // For LRU tracking
}

/**
 * In-memory cache with LRU eviction
 */
class MeaningAnalysisCache {
  private cache: Map<string, CacheEntry> = new Map();

  /**
   * Get cached meaning analysis
   * Returns null if expired or not found
   */
  get(
    bookId: number,
    pageIndex: number,
    analysisType: MeaningAnalysisType,
    focusWord?: string,
    focusSentence?: string
  ): MeaningAnalysis | null {
    const key = generateMeaningCacheKey(bookId, pageIndex, analysisType, focusWord, focusSentence);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check expiration
    const now = Date.now();
    if (now - entry.data.fetchedAt > CACHE_EXPIRATION_MS) {
      this.cache.delete(key);
      return null;
    }

    // Check version
    if (entry.data.cacheVersion !== MEANING_CACHE_VERSION) {
      this.cache.delete(key);
      return null;
    }

    // Update LRU timestamp
    entry.lastAccessed = now;
    return entry.data.analysis;
  }

  /**
   * Store meaning analysis in cache
   * Triggers LRU eviction if needed
   */
  set(
    bookId: number,
    pageIndex: number,
    analysisType: MeaningAnalysisType,
    analysis: MeaningAnalysis,
    focusWord?: string,
    focusSentence?: string
  ): void {
    const key = generateMeaningCacheKey(bookId, pageIndex, analysisType, focusWord, focusSentence);
    const now = Date.now();

    // LRU eviction if cache is full
    if (this.cache.size >= MAX_CACHE_ENTRIES && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data: {
        cacheVersion: MEANING_CACHE_VERSION,
        analysis,
        fetchedAt: now,
      },
      lastAccessed: now,
    });
  }

  /**
   * Clear all cache entries for a specific book
   */
  clearBook(bookId: number): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${bookId}-meaning-`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Clear all cache entries for a specific page
   */
  clearPage(bookId: number, pageIndex: number): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${bookId}-meaning-${pageIndex}-`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Cleanup expired entries
   * Called periodically
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.data.fetchedAt > CACHE_EXPIRATION_MS) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

// Singleton instance
const meaningCache = new MeaningAnalysisCache();

// Periodic cleanup (every 5 minutes)
setInterval(() => meaningCache.cleanup(), 5 * 60 * 1000);

export default meaningCache;
