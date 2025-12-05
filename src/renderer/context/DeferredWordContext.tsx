import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSettings } from './SettingsContext';
import type {
  QueuedWordEntry,
  QueuedWordStatus,
  CachedWordData,
} from '../../shared/types/deferred-word.types';
import { generateWordKey, generatePhraseKey } from '../../shared/types/deferred-word.types';
import { cleanWord } from '../../shared/utils/text-utils';
import type { BookLanguage } from '../../shared/types';

// Helper to check if a string is a phrase (multiple words)
const isPhrase = (text: string): boolean => text.trim().includes(' ');

// Configuration
// Using 1 concurrent fetch for better compatibility with weak/local AI models
// Sequential processing prevents overwhelming the model and improves reliability
const MAX_CONCURRENT_FETCHES = 1;
const CACHE_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes

interface DeferredWordContextType {
  // Queue a word for background fetching (sentence is now the key identifier)
  queueWord: (word: string, sentence: string, bookId: number, language?: BookLanguage) => void;
  // Check if a word has ready data (sentence-specific)
  isWordReady: (word: string, sentence: string, bookId: number) => boolean;
  // Get the status of a word (sentence-specific)
  getWordStatus: (word: string, sentence: string, bookId: number) => QueuedWordStatus | null;
  // Get cached data for a word (sentence-specific)
  getWordData: (word: string, sentence: string, bookId: number) => CachedWordData | null;
  // Clear all words for a specific book
  clearBookWords: (bookId: number) => void;
  // Get count of words currently being fetched
  fetchingCount: number;
  // Get count of words pending in queue (waiting to be fetched)
  pendingCount: number;
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
        console.log('[PHRASE DEBUG] Sending phrase to AI:', { phrase: entry.word, sentence: entry.sentence, language: entry.language });
        try {
          const phraseMeaningResult = await window.electronAPI.ai.getPhraseMeaning(
            entry.word,
            entry.sentence,
            entry.language
          );
          console.log('[PHRASE DEBUG] AI phrase response:', phraseMeaningResult);
          if (phraseMeaningResult.meaning) {
            results.definition = phraseMeaningResult.meaning;
          }
          if (phraseMeaningResult.phraseTranslation) {
            results.phraseTranslation = phraseMeaningResult.phraseTranslation;
          }
          // Store phrasal verb detection result
          results.isPhrasalVerb = phraseMeaningResult.isPhrasalVerb;
        } catch (err) {
          console.error('[DeferredWord] getPhraseMeaning error:', err);
        }

        // For phrases, skip IPA and word equivalent
        // The phrase itself is the "equivalent"
        results.wordEquivalent = entry.word;

      } else {
        // Single word handling: original behavior
        // Fetch definition and simplified sentence in parallel
        // IPA is fetched separately with Python server as primary, AI as fallback
        const [defResult, simplifyResult] = await Promise.allSettled([
          window.electronAPI.ai.getDefinition(entry.word, entry.sentence, entry.language),
          window.electronAPI.ai.simplifySentence(entry.sentence, entry.language),
        ]);

        if (defResult.status === 'fulfilled') {
          results.definition = defResult.value.definition;
          if (defResult.value.wordTranslation) {
            results.wordTranslation = defResult.value.wordTranslation;
          }
          if (defResult.value.wordType) {
            results.wordType = defResult.value.wordType;
          }
          if (defResult.value.germanArticle) {
            results.germanArticle = defResult.value.germanArticle;
          }
        }

        // Try Python server for IPA first, fall back to AI
        try {
          const pythonIpaResult = await window.electronAPI.pronunciation.getIPA(entry.word, entry.language);
          if (pythonIpaResult.success && pythonIpaResult.ipa) {
            results.ipa = pythonIpaResult.ipa;
            // Python server doesn't provide syllables, so fetch from AI
            try {
              const aiIpaResult = await window.electronAPI.ai.getIPA(entry.word, entry.language);
              if (aiIpaResult.syllables) {
                results.syllables = aiIpaResult.syllables;
              }
            } catch {
              // Syllables are non-critical, ignore
            }
          } else {
            throw new Error('Python IPA failed, using AI fallback');
          }
        } catch {
          // Fallback to AI for IPA and syllables
          console.log('[DeferredWord] Python IPA failed, using AI fallback');
          try {
            const aiIpaResult = await window.electronAPI.ai.getIPA(entry.word, entry.language);
            if (aiIpaResult.ipa) {
              results.ipa = aiIpaResult.ipa;
            }
            if (aiIpaResult.syllables) {
              results.syllables = aiIpaResult.syllables;
            }
          } catch (err) {
            console.error('[DeferredWord] AI IPA fallback also failed:', err);
          }
        }
        if (simplifyResult.status === 'fulfilled') {
          results.simplifiedSentence = simplifyResult.value.simplified;
          // Store translations if available (for non-English books)
          if (simplifyResult.value.sentenceTranslation) {
            results.sentenceTranslation = simplifyResult.value.sentenceTranslation;
          }
          if (simplifyResult.value.simplifiedTranslation) {
            results.simplifiedTranslation = simplifyResult.value.simplifiedTranslation;
          }

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
                  equivalentResult.equivalent,
                  entry.language  // Pass language to keep simplified in source language
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

  // Queue a word or phrase for background fetching (sentence-based caching)
  const queueWord = useCallback((word: string, sentence: string, bookId: number, language: BookLanguage = 'en') => {
    // For phrases, preserve spaces; for single words, clean normally (Unicode-aware)
    const cleanText = isPhrase(word)
      ? word.toLowerCase().trim()
      : cleanWord(word);

    // Use appropriate key generator (sentence hash for zoom-independent caching)
    // Both words and phrases now include sentence context for proper context-specific caching
    const key = isPhrase(word)
      ? generatePhraseKey(bookId, cleanText, sentence)
      : generateWordKey(bookId, cleanText, sentence);

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
        bookId,
        language,
        status: 'pending',
        queuedAt: Date.now(),
      });
      return newMap;
    });
  }, []);

  // Check if a word or phrase has ready data (sentence-specific for both)
  const isWordReady = useCallback((word: string, sentence: string, bookId: number): boolean => {
    const cleanText = isPhrase(word)
      ? word.toLowerCase().trim()
      : cleanWord(word);
    const key = isPhrase(word)
      ? generatePhraseKey(bookId, cleanText, sentence)
      : generateWordKey(bookId, cleanText, sentence);
    const entry = queuedWords.get(key);
    return entry?.status === 'ready';
  }, [queuedWords]);

  // Get the status of a word or phrase (sentence-specific for both)
  const getWordStatus = useCallback((word: string, sentence: string, bookId: number): QueuedWordStatus | null => {
    const cleanText = isPhrase(word)
      ? word.toLowerCase().trim()
      : cleanWord(word);
    const key = isPhrase(word)
      ? generatePhraseKey(bookId, cleanText, sentence)
      : generateWordKey(bookId, cleanText, sentence);
    const entry = queuedWords.get(key);
    return entry?.status ?? null;
  }, [queuedWords]);

  // Get cached data for a word or phrase (sentence-specific for both)
  const getWordData = useCallback((word: string, sentence: string, bookId: number): CachedWordData | null => {
    const cleanText = isPhrase(word)
      ? word.toLowerCase().trim()
      : cleanWord(word);
    const key = isPhrase(word)
      ? generatePhraseKey(bookId, cleanText, sentence)
      : generateWordKey(bookId, cleanText, sentence);
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

  // Count pending words in the queue
  const pendingCount = useMemo(() => {
    let count = 0;
    for (const entry of queuedWords.values()) {
      if (entry.status === 'pending') {
        count++;
      }
    }
    return count;
  }, [queuedWords]);

  return (
    <DeferredWordContext.Provider
      value={{
        queueWord,
        isWordReady,
        getWordStatus,
        getWordData,
        clearBookWords,
        fetchingCount,
        pendingCount,
      }}
    >
      {children}
    </DeferredWordContext.Provider>
  );
};
