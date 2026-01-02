/**
 * Deferred Simpler Context Service
 * In-memory caching with LRU eviction and expiration
 */

import type { SimplerAnalysis, CachedSimplerData } from '../../shared/types/simpler-analysis.types';
import {
  generateSimplerCacheKey,
  SIMPLER_CACHE_VERSION
} from '../../shared/types/simpler-analysis.types';

const CACHE_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_ENTRIES = 150; // LRU eviction limit

interface CacheEntry {
  data: CachedSimplerData;
  lastAccessed: number;
}

class SimplerAnalysisCache {
  private cache: Map<string, CacheEntry> = new Map();

  get(bookId: number, word: string, sentence: string): SimplerAnalysis | null {
    const key = generateSimplerCacheKey(bookId, word, sentence);
    const entry = this.cache.get(key);

    if (!entry) return null;

    const now = Date.now();
    if (now - entry.data.fetchedAt > CACHE_EXPIRATION_MS) {
      this.cache.delete(key);
      return null;
    }

    if (entry.data.cacheVersion !== SIMPLER_CACHE_VERSION) {
      this.cache.delete(key);
      return null;
    }

    entry.lastAccessed = now;
    return entry.data.analysis;
  }

  set(bookId: number, word: string, sentence: string, analysis: SimplerAnalysis): void {
    const key = generateSimplerCacheKey(bookId, word, sentence);
    const now = Date.now();

    if (this.cache.size >= MAX_CACHE_ENTRIES && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data: {
        cacheVersion: SIMPLER_CACHE_VERSION,
        analysis,
        fetchedAt: now,
      },
      lastAccessed: now,
    });
  }

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
}

const simplerCache = new SimplerAnalysisCache();

setInterval(() => simplerCache.cleanup(), 5 * 60 * 1000);

export default simplerCache;
