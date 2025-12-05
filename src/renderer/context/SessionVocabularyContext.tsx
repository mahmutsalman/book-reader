import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { WordType, SessionVocabularyEntry, WordTypeCounts } from '../../shared/types';

interface SessionVocabularyContextType {
  // Add entry to session vocabulary
  addSessionEntry: (entry: Omit<SessionVocabularyEntry, 'timestamp'>) => void;
  // Get all session entries with optional filters
  getSessionEntries: (filters?: { bookId?: number; wordType?: WordType }) => SessionVocabularyEntry[];
  // Get counts by type for session entries
  getSessionCounts: (bookId?: number) => WordTypeCounts;
  // Clear session (optional: filter by book)
  clearSession: (bookId?: number) => void;
  // Total session count
  totalSessionCount: number;
}

const SessionVocabularyContext = createContext<SessionVocabularyContextType | null>(null);

export const useSessionVocabulary = () => {
  const context = useContext(SessionVocabularyContext);
  if (!context) {
    throw new Error('useSessionVocabulary must be used within SessionVocabularyProvider');
  }
  return context;
};

interface SessionVocabularyProviderProps {
  children: React.ReactNode;
}

export const SessionVocabularyProvider: React.FC<SessionVocabularyProviderProps> = ({ children }) => {
  const [entries, setEntries] = useState<SessionVocabularyEntry[]>([]);

  const addSessionEntry = useCallback((entry: Omit<SessionVocabularyEntry, 'timestamp'>) => {
    setEntries(prev => {
      // Check if already exists (same word, type, book)
      const exists = prev.some(
        e => e.word.toLowerCase() === entry.word.toLowerCase() &&
             e.word_type === entry.word_type &&
             e.book_id === entry.book_id
      );
      if (exists) return prev;

      return [...prev, { ...entry, timestamp: Date.now() }];
    });
  }, []);

  const getSessionEntries = useCallback((filters?: { bookId?: number; wordType?: WordType }) => {
    let result = entries;

    if (filters?.bookId) {
      result = result.filter(e => e.book_id === filters.bookId);
    }
    if (filters?.wordType) {
      result = result.filter(e => e.word_type === filters.wordType);
    }

    // Sort by timestamp descending (newest first)
    return result.sort((a, b) => b.timestamp - a.timestamp);
  }, [entries]);

  const getSessionCounts = useCallback((bookId?: number): WordTypeCounts => {
    const filtered = bookId ? entries.filter(e => e.book_id === bookId) : entries;

    return {
      word: filtered.filter(e => e.word_type === 'word').length,
      phrasal_verb: filtered.filter(e => e.word_type === 'phrasal_verb').length,
      word_group: filtered.filter(e => e.word_type === 'word_group').length,
    };
  }, [entries]);

  const clearSession = useCallback((bookId?: number) => {
    if (bookId) {
      setEntries(prev => prev.filter(e => e.book_id !== bookId));
    } else {
      setEntries([]);
    }
  }, []);

  const totalSessionCount = useMemo(() => entries.length, [entries]);

  const value = useMemo(() => ({
    addSessionEntry,
    getSessionEntries,
    getSessionCounts,
    clearSession,
    totalSessionCount,
  }), [addSessionEntry, getSessionEntries, getSessionCounts, clearSession, totalSessionCount]);

  return (
    <SessionVocabularyContext.Provider value={value}>
      {children}
    </SessionVocabularyContext.Provider>
  );
};
