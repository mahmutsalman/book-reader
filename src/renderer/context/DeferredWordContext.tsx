import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useSettings } from './SettingsContext';
import type {
  QueuedWordEntry,
  QueuedWordStatus,
  CachedWordData,
} from '../../shared/types/deferred-word.types';
import { generateWordKey, generatePhraseKey } from '../../shared/types/deferred-word.types';

// Helper to check if a string is a phrase (multiple words)
const isPhrase = (text: string): boolean => text.trim().includes(' ');

// Configuration
const MAX_CONCURRENT_FETCHES = 3;
const CACHE_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes

interface DeferredWordContextType {
  // Queue a word for background fetching
  queueWord: (word: string, sentence: string, pageNumber: number, bookId: number) => void;
  // Check if a word has ready data
  isWordReady: (word: string, bookId: number) => boolean;
  // Get the status of a word
  getWordStatus: (word: string, bookId: number) => QueuedWordStatus | null;
  // Get cached data for a word
  getWordData: (word: string, bookId: number) => CachedWordData | null;
  // Clear all words for a specific book
  clearBookWords: (bookId: number) => void;
  // Get count of words currently being fetched
  fetchingCount: number;
}

const DeferredWordContext = createContext<DeferredWordContextType | null>(null);

export const useDeferredWords = () => {
  const context = useContext(DeferredWordContext);
  if (!context) {
    throw new Error('useDeferredWords must be used within DeferredWordProvider');
  }
  return context;
};

interface DeferredWordProviderProps {
  children: React.ReactNode;
}

export const DeferredWordProvider: React.FC<DeferredWordProviderProps> = ({ children }) => {
  const { settings } = useSettings();
  const [queuedWords, setQueuedWords] = useState<Map<string, QueuedWordEntry>>(new Map());
  const [fetchingCount, setFetchingCount] = useState(0);

  // Use ref to track active fetches without causing re-renders
  const activeFetchesRef = useRef<Set<string>>(new Set());

  // Clean up expired entries periodically
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      setQueuedWords(prev => {
        const newMap = new Map(prev);
        let hasChanges = false;

        for (const [key, entry] of newMap) {
          if (entry.status === 'ready' && entry.fetchCompletedAt) {
            if (now - entry.fetchCompletedAt > CACHE_EXPIRATION_MS) {
              newMap.delete(key);
              hasChanges = true;
            }
          }
        }

        return hasChanges ? newMap : prev;
      });
    };

    const interval = setInterval(cleanup, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  // Background fetch processor
  useEffect(() => {
    const processPendingWords = async () => {
      // Find pending words that aren't being fetched
      const pendingWords: [string, QueuedWordEntry][] = [];

      for (const [key, entry] of queuedWords) {
        if (entry.status === 'pending' && !activeFetchesRef.current.has(key)) {
          pendingWords.push([key, entry]);
        }
      }

      // Calculate available slots
      const availableSlots = MAX_CONCURRENT_FETCHES - activeFetchesRef.current.size;
      if (availableSlots <= 0 || pendingWords.length === 0) return;

      // Start fetching for words that fit in available slots
      const wordsToFetch = pendingWords.slice(0, availableSlots);

      for (const [key, entry] of wordsToFetch) {
        // Mark as fetching
        activeFetchesRef.current.add(key);
        setFetchingCount(activeFetchesRef.current.size);

        // Update status to fetching
        setQueuedWords(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(key);
          if (existing) {
            newMap.set(key, {
              ...existing,
              status: 'fetching',
              fetchStartedAt: Date.now(),
            });
          }
          return newMap;
        });

        // Execute fetch in background
        fetchWordData(key, entry);
      }
    };

    processPendingWords();
  }, [queuedWords, settings.tatoeba_enabled, settings.tatoeba_language]);

  // Fetch word or phrase data from AI
  const fetchWordData = async (key: string, entry: QueuedWordEntry) => {
    try {
      if (!window.electronAPI) {
        throw new Error('electronAPI not available');
      }

      const results: CachedWordData = {
        fetchedAt: Date.now(),
      };

      // Check if this is a phrase (contains spaces)
      const isPhraseEntry = isPhrase(entry.word);

      if (isPhraseEntry) {
        // Phrase handling: get phrase meaning instead of word definition
        console.log('[PHRASE DEBUG] Sending phrase to AI:', { phrase: entry.word, sentence: entry.sentence });
        try {
          const phraseMeaningResult = await window.electronAPI.ai.getPhraseMeaning(
            entry.word,
            entry.sentence
          );
          console.log('[PHRASE DEBUG] AI phrase response:', phraseMeaningResult);
          if (phraseMeaningResult.meaning) {
            results.definition = phraseMeaningResult.meaning;
          }
        } catch (err) {
          console.error('[DeferredWord] getPhraseMeaning error:', err);
        }

        // For phrases, skip IPA and word equivalent
        // The phrase itself is the "equivalent"
        results.wordEquivalent = entry.word;

      } else {
        // Single word handling: original behavior
        // Fetch definition, IPA, and simplified sentence in parallel
        const [defResult, ipaResult, simplifyResult] = await Promise.allSettled([
          window.electronAPI.ai.getDefinition(entry.word, entry.sentence),
          window.electronAPI.ai.getIPA(entry.word),
          window.electronAPI.ai.simplifySentence(entry.sentence),
        ]);

        if (defResult.status === 'fulfilled') {
          results.definition = defResult.value.definition;
        }
        if (ipaResult.status === 'fulfilled') {
          results.ipa = ipaResult.value.ipa;
        }
        if (simplifyResult.status === 'fulfilled') {
          results.simplifiedSentence = simplifyResult.value.simplified;

          // Get word equivalent in simplified sentence
          try {
            const equivalentResult = await window.electronAPI.ai.getWordEquivalent(
              entry.word,
              entry.sentence,
              simplifyResult.value.simplified
            );

            if (equivalentResult.equivalent) {
              // Check if we need to regenerate the simplified sentence
              if (equivalentResult.needsRegeneration) {
                const resimplifyResult = await window.electronAPI.ai.resimplifyWithWord(
                  entry.sentence,
                  entry.word,
                  equivalentResult.equivalent
                );
                results.simplifiedSentence = resimplifyResult.simplified;
              }
              results.wordEquivalent = equivalentResult.equivalent;
            }
          } catch (err) {
            console.error('[DeferredWord] getWordEquivalent error:', err);
          }
        }

        // Search for other occurrences (only for single words)
        try {
          const occurrences = await window.electronAPI.book.searchWord(entry.bookId, entry.word);
          results.occurrences = occurrences;
        } catch {
          // Non-critical, ignore
        }

        // Tatoeba examples if enabled (only for single words)
        if (settings.tatoeba_enabled) {
          try {
            const tatoeba = await window.electronAPI.tatoeba.search(
              entry.word,
              settings.tatoeba_language
            );
            results.tatoebaExamples = tatoeba.map((s: { sentence: string; translations?: { sentence: string }[] }) => ({
              sentence: s.sentence,
              translation: s.translations?.[0]?.sentence,
            }));
          } catch {
            // Non-critical, ignore
          }
        }
      }

      // Update with success
      setQueuedWords(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(key);
        if (existing) {
          newMap.set(key, {
            ...existing,
            status: 'ready',
            data: results,
            fetchCompletedAt: Date.now(),
          });
        }
        return newMap;
      });

    } catch (error) {
      console.error('[DeferredWord] Fetch error:', error);

      // Update with error
      setQueuedWords(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(key);
        if (existing) {
          newMap.set(key, {
            ...existing,
            status: 'error',
            error: error instanceof Error ? error.message : 'Failed to fetch word data',
            fetchCompletedAt: Date.now(),
          });
        }
        return newMap;
      });
    } finally {
      // Remove from active fetches
      activeFetchesRef.current.delete(key);
      setFetchingCount(activeFetchesRef.current.size);
    }
  };

  // Queue a word or phrase for background fetching
  const queueWord = useCallback((word: string, sentence: string, pageNumber: number, bookId: number) => {
    // For phrases, preserve spaces; for single words, clean normally
    const cleanText = isPhrase(word)
      ? word.toLowerCase().trim()
      : word.replace(/[^\w'-]/g, '').toLowerCase();

    // Use appropriate key generator
    const key = isPhrase(word)
      ? generatePhraseKey(bookId, cleanText)
      : generateWordKey(bookId, cleanText);

    setQueuedWords(prev => {
      // Don't re-queue if already exists
      if (prev.has(key)) {
        const existing = prev.get(key)!;
        // Allow retry if error
        if (existing.status === 'error') {
          const newMap = new Map(prev);
          newMap.set(key, {
            ...existing,
            status: 'pending',
            error: undefined,
            queuedAt: Date.now(),
          });
          return newMap;
        }
        return prev;
      }

      // Add new entry
      const newMap = new Map(prev);
      newMap.set(key, {
        word: cleanText,
        sentence,
        pageNumber,
        bookId,
        status: 'pending',
        queuedAt: Date.now(),
      });
      return newMap;
    });
  }, []);

  // Check if a word or phrase has ready data
  const isWordReady = useCallback((word: string, bookId: number): boolean => {
    const cleanText = isPhrase(word)
      ? word.toLowerCase().trim()
      : word.replace(/[^\w'-]/g, '').toLowerCase();
    const key = isPhrase(word)
      ? generatePhraseKey(bookId, cleanText)
      : generateWordKey(bookId, cleanText);
    const entry = queuedWords.get(key);
    return entry?.status === 'ready';
  }, [queuedWords]);

  // Get the status of a word or phrase
  const getWordStatus = useCallback((word: string, bookId: number): QueuedWordStatus | null => {
    const cleanText = isPhrase(word)
      ? word.toLowerCase().trim()
      : word.replace(/[^\w'-]/g, '').toLowerCase();
    const key = isPhrase(word)
      ? generatePhraseKey(bookId, cleanText)
      : generateWordKey(bookId, cleanText);
    const entry = queuedWords.get(key);
    return entry?.status ?? null;
  }, [queuedWords]);

  // Get cached data for a word or phrase
  const getWordData = useCallback((word: string, bookId: number): CachedWordData | null => {
    const cleanText = isPhrase(word)
      ? word.toLowerCase().trim()
      : word.replace(/[^\w'-]/g, '').toLowerCase();
    const key = isPhrase(word)
      ? generatePhraseKey(bookId, cleanText)
      : generateWordKey(bookId, cleanText);
    const entry = queuedWords.get(key);
    return entry?.data ?? null;
  }, [queuedWords]);

  // Clear all words for a specific book
  const clearBookWords = useCallback((bookId: number) => {
    setQueuedWords(prev => {
      const newMap = new Map(prev);
      for (const key of newMap.keys()) {
        if (key.startsWith(`${bookId}-`)) {
          newMap.delete(key);
        }
      }
      return newMap;
    });
  }, []);

  return (
    <DeferredWordContext.Provider
      value={{
        queueWord,
        isWordReady,
        getWordStatus,
        getWordData,
        clearBookWords,
        fetchingCount,
      }}
    >
      {children}
    </DeferredWordContext.Provider>
  );
};
