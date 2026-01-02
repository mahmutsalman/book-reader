/**
 * Hook for fetching and caching simpler analysis
 */

import { useState, useCallback } from 'react';
import type { SimplerAnalysis } from '../../shared/types/simpler-analysis.types';
import simplerCache from '../services/deferredSimplerContext';

export function useSimplerAnalysis() {
  const [analysis, setAnalysis] = useState<SimplerAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async (
    word: string,
    sentence: string,
    viewContent: string,
    bookId: number,
    language = 'en'
  ) => {
    // Check cache first
    const cached = simplerCache.get(bookId, word, sentence);
    if (cached) {
      setAnalysis(cached);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await window.electronAPI.ai.getSimplerAnalysis(
        word,
        sentence,
        viewContent,
        language
      );

      if (response.success && response.analysis) {
        setAnalysis(response.analysis);

        // Cache the result
        simplerCache.set(bookId, word, sentence, response.analysis);
      } else {
        setError(response.error || 'Failed to get simpler analysis');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setError(null);
  }, []);

  return {
    analysis,
    loading,
    error,
    fetchAnalysis,
    clearAnalysis,
  };
}
