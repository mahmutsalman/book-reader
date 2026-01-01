/**
 * Hook for fetching and caching meaning analysis
 */

import { useState, useCallback } from 'react';
import type {
  MeaningAnalysis,
  MeaningAnalysisType
} from '../../shared/types/meaning-analysis.types';
import meaningCache from '../services/deferredMeaningContext';

export interface UseMeaningAnalysisResult {
  analysis: MeaningAnalysis | null;
  loading: boolean;
  error: string | null;
  fetchAnalysis: (
    pageContent: string,
    analysisType: MeaningAnalysisType,
    bookId: number,
    pageIndex: number,
    language?: string
  ) => Promise<void>;
  clearCache: (bookId: number, pageIndex?: number) => void;
}

export function useMeaningAnalysis(): UseMeaningAnalysisResult {
  const [analysis, setAnalysis] = useState<MeaningAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async (
    pageContent: string,
    analysisType: MeaningAnalysisType,
    bookId: number,
    pageIndex: number,
    language = 'en'
  ) => {
    // Check cache first
    const cached = meaningCache.get(bookId, pageIndex, analysisType);
    if (cached) {
      setAnalysis(cached);
      setError(null);
      return;
    }

    // Fetch from AI
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.ai.getContextualMeaning(
        pageContent,
        analysisType,
        language
      );

      if (result.success) {
        // Extract analysis from result
        const analysisData: MeaningAnalysis = {
          narrative: result.narrative,
          literary: result.literary,
          semantic: result.semantic,
          simplified: result.simplified,
        };

        // Cache successful result
        meaningCache.set(bookId, pageIndex, analysisType, analysisData);
        setAnalysis(analysisData);
      } else {
        setError(result.error || 'Failed to fetch analysis');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMsg);
      console.error('[useMeaningAnalysis] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearCache = useCallback((bookId: number, pageIndex?: number) => {
    if (pageIndex !== undefined) {
      meaningCache.clearPage(bookId, pageIndex);
    } else {
      meaningCache.clearBook(bookId);
    }
  }, []);

  return {
    analysis,
    loading,
    error,
    fetchAnalysis,
    clearCache,
  };
}
