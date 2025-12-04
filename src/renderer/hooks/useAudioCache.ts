/**
 * React hook for audio caching.
 * Provides access to the AudioCacheService singleton.
 */

import { useCallback } from 'react';
import { audioCacheService, AudioType } from '../services/audio-cache.service';
import type { AudioPreloadItem, AudioCacheStats } from '../../shared/types/audio-cache.types';

export { AudioType };

interface UseAudioCacheReturn {
  /**
   * Get cached audio for text. Returns base64 string or null if not cached.
   */
  getAudio: (text: string, language: string, type: AudioType) => Promise<string | null>;

  /**
   * Store audio in cache.
   */
  setAudio: (text: string, language: string, type: AudioType, base64: string) => Promise<void>;

  /**
   * Preload multiple audio items in background.
   * Fetches from server if not already cached.
   */
  preloadAudio: (items: AudioPreloadItem[]) => Promise<void>;

  /**
   * Clear all cached audio.
   */
  clearCache: () => Promise<void>;

  /**
   * Get cache statistics (sync, memory only).
   */
  getStats: () => AudioCacheStats;

  /**
   * Get cache statistics including IndexedDB count (async).
   */
  getStatsAsync: () => Promise<AudioCacheStats>;
}

/**
 * Hook for accessing the audio cache service.
 */
export function useAudioCache(): UseAudioCacheReturn {
  const getAudio = useCallback(
    (text: string, language: string, type: AudioType) => {
      return audioCacheService.get(text, language, type);
    },
    []
  );

  const setAudio = useCallback(
    (text: string, language: string, type: AudioType, base64: string) => {
      return audioCacheService.set(text, language, type, base64);
    },
    []
  );

  const preloadAudio = useCallback((items: AudioPreloadItem[]) => {
    return audioCacheService.preload(items);
  }, []);

  const clearCache = useCallback(() => {
    return audioCacheService.clear();
  }, []);

  const getStats = useCallback(() => {
    return audioCacheService.getStats();
  }, []);

  const getStatsAsync = useCallback(() => {
    return audioCacheService.getStatsAsync();
  }, []);

  return {
    getAudio,
    setAudio,
    preloadAudio,
    clearCache,
    getStats,
    getStatsAsync,
  };
}
