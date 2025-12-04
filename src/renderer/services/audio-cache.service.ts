/**
 * Audio Cache Service
 *
 * Two-tier caching system for pronunciation audio:
 * - Memory cache: Fast access, limited to 50 entries (~5MB)
 * - IndexedDB: Persistent storage, limited to 500 entries (~50MB), 7-day expiration
 */

import type { AudioCacheEntry, AudioCacheStats, AudioPreloadItem } from '../../shared/types/audio-cache.types';
import { AudioType } from '../../shared/types/audio-cache.types';

// Configuration
const DB_NAME = 'book-reader-audio-cache';
const DB_VERSION = 1;
const STORE_NAME = 'audio';
const MEMORY_CACHE_LIMIT = 50;
const INDEXED_DB_LIMIT = 500;
const EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LRU_EVICT_COUNT = 10;

/**
 * Simple djb2 hash function for generating cache keys.
 */
function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate a unique cache key for audio.
 */
function generateCacheKey(text: string, language: string, type: AudioType): string {
  const normalizedText = text.toLowerCase().trim();
  const textHash = hashText(normalizedText);
  return `${language}:${type}:${textHash}`;
}

/**
 * AudioCacheService - Singleton service for caching pronunciation audio.
 */
class AudioCacheService {
  private memoryCache: Map<string, AudioCacheEntry> = new Map();
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;
  private dbReadyResolve: (() => void) | null = null;

  constructor() {
    this.dbReady = new Promise((resolve) => {
      this.dbReadyResolve = resolve;
    });
    this.initIndexedDB();
  }

  /**
   * Initialize IndexedDB connection.
   */
  private initIndexedDB(): void {
    if (typeof indexedDB === 'undefined') {
      console.warn('[AudioCache] IndexedDB not available');
      this.dbReadyResolve?.();
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[AudioCache] Failed to open IndexedDB:', request.error);
      this.dbReadyResolve?.();
    };

    request.onsuccess = () => {
      this.db = request.result;
      console.log('[AudioCache] IndexedDB ready');
      this.dbReadyResolve?.();
      // Clean expired entries on startup
      this.cleanExpiredEntries();
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        console.log('[AudioCache] Created object store');
      }
    };
  }

  /**
   * Get cached audio for text.
   * Checks memory cache first, then IndexedDB.
   */
  async get(text: string, language: string, type: AudioType): Promise<string | null> {
    const key = generateCacheKey(text, language, type);

    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry) {
      // Update last accessed time
      memoryEntry.lastAccessedAt = Date.now();
      console.log('[AudioCache] Memory hit:', key);
      return memoryEntry.base64;
    }

    // Check IndexedDB
    await this.dbReady;
    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as AudioCacheEntry | undefined;
        if (entry) {
          // Check if expired
          if (Date.now() - entry.createdAt > EXPIRATION_MS) {
            store.delete(key);
            console.log('[AudioCache] Expired entry removed:', key);
            resolve(null);
            return;
          }

          // Update last accessed time
          entry.lastAccessedAt = Date.now();
          store.put(entry);

          // Promote to memory cache
          this.addToMemoryCache(entry);
          console.log('[AudioCache] IndexedDB hit, promoted to memory:', key);
          resolve(entry.base64);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('[AudioCache] IndexedDB read error:', request.error);
        resolve(null);
      };
    });
  }

  /**
   * Store audio in cache.
   */
  async set(text: string, language: string, type: AudioType, base64: string): Promise<void> {
    const key = generateCacheKey(text, language, type);
    const now = Date.now();

    const entry: AudioCacheEntry = {
      key,
      base64,
      language,
      type,
      textPreview: text.substring(0, 50),
      createdAt: now,
      lastAccessedAt: now,
      size: base64.length,
    };

    // Add to memory cache
    this.addToMemoryCache(entry);

    // Add to IndexedDB
    await this.dbReady;
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      // Check count and evict if necessary
      const countRequest = store.count();
      countRequest.onsuccess = () => {
        if (countRequest.result >= INDEXED_DB_LIMIT) {
          this.evictOldestFromDB(store, LRU_EVICT_COUNT);
        }

        const putRequest = store.put(entry);
        putRequest.onsuccess = () => {
          console.log('[AudioCache] Stored in IndexedDB:', key);
          resolve();
        };
        putRequest.onerror = () => {
          console.error('[AudioCache] IndexedDB write error:', putRequest.error);
          resolve();
        };
      };
    });
  }

  /**
   * Preload multiple audio items in background.
   * Fetches from server if not in cache.
   */
  async preload(items: AudioPreloadItem[]): Promise<void> {
    if (!window.electronAPI) {
      console.warn('[AudioCache] Electron API not available for preload');
      return;
    }

    const fetchPromises = items.map(async (item) => {
      try {
        // Check if already cached
        const cached = await this.get(item.text, item.language, item.type);
        if (cached) {
          return; // Already cached
        }

        // Fetch from server
        const response = await window.electronAPI.pronunciation.getTTS(item.text, item.language);
        if (response.success && response.audio_base64) {
          await this.set(item.text, item.language, item.type, response.audio_base64);
          console.log('[AudioCache] Preloaded:', item.type, item.text.substring(0, 30));
        }
      } catch (error) {
        console.warn('[AudioCache] Preload failed for:', item.text.substring(0, 30), error);
      }
    });

    // Execute all preloads in parallel (non-blocking)
    Promise.all(fetchPromises).catch((error) => {
      console.error('[AudioCache] Preload batch error:', error);
    });
  }

  /**
   * Clear all cached audio.
   */
  async clear(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();

    // Clear IndexedDB
    await this.dbReady;
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[AudioCache] Cleared all cache');
        resolve();
      };
      request.onerror = () => {
        console.error('[AudioCache] Clear error:', request.error);
        resolve();
      };
    });
  }

  /**
   * Get cache statistics.
   */
  getStats(): AudioCacheStats {
    let totalSize = 0;
    this.memoryCache.forEach((entry) => {
      totalSize += entry.size;
    });

    return {
      memoryCount: this.memoryCache.size,
      dbCount: 0, // Would need async to get accurate count
      totalSizeBytes: totalSize,
    };
  }

  /**
   * Get async statistics including IndexedDB count.
   */
  async getStatsAsync(): Promise<AudioCacheStats> {
    const stats = this.getStats();

    await this.dbReady;
    if (!this.db) return stats;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const countRequest = store.count();

      countRequest.onsuccess = () => {
        stats.dbCount = countRequest.result;
        resolve(stats);
      };
      countRequest.onerror = () => {
        resolve(stats);
      };
    });
  }

  /**
   * Add entry to memory cache with LRU eviction.
   */
  private addToMemoryCache(entry: AudioCacheEntry): void {
    // Evict oldest if at limit
    if (this.memoryCache.size >= MEMORY_CACHE_LIMIT) {
      this.evictOldestFromMemory(LRU_EVICT_COUNT);
    }

    this.memoryCache.set(entry.key, entry);
  }

  /**
   * Evict oldest entries from memory cache.
   */
  private evictOldestFromMemory(count: number): void {
    const entries = Array.from(this.memoryCache.entries())
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    for (let i = 0; i < Math.min(count, entries.length); i++) {
      this.memoryCache.delete(entries[i][0]);
    }
    console.log('[AudioCache] Evicted', count, 'entries from memory');
  }

  /**
   * Evict oldest entries from IndexedDB.
   */
  private evictOldestFromDB(store: IDBObjectStore, count: number): void {
    const index = store.index('lastAccessedAt');
    const request = index.openCursor();
    let deleted = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor && deleted < count) {
        cursor.delete();
        deleted++;
        cursor.continue();
      }
    };
  }

  /**
   * Clean expired entries from IndexedDB.
   */
  private async cleanExpiredEntries(): Promise<void> {
    await this.dbReady;
    if (!this.db) return;

    const cutoff = Date.now() - EXPIRATION_MS;
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('createdAt');
    const range = IDBKeyRange.upperBound(cutoff);
    const request = index.openCursor(range);
    let deleted = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        deleted++;
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      if (deleted > 0) {
        console.log('[AudioCache] Cleaned', deleted, 'expired entries');
      }
    };
  }
}

// Export singleton instance
export const audioCacheService = new AudioCacheService();

// Export types and helpers for convenience
export { AudioType, generateCacheKey };
