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
    language?: string,
    focusWord?: string,
    focusSentence?: string
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
    language = 'en',
    focusWord?: string,
    focusSentence?: string
  ) => {
    console.log('[useMeaningAnalysis] fetchAnalysis called:', {
      analysisType,
      bookId,
      pageIndex,
      focusWord,
      hasFocusSentence: !!focusSentence,
      pageContentLength: pageContent?.length
    });

    // Check cache first (but skip cache when focusWord is provided - always fetch fresh word-specific analysis)
    if (!focusWord) {
      const cached = meaningCache.get(bookId, pageIndex, analysisType);
      if (cached) {
        console.log('[useMeaningAnalysis] Using cached result (page-level)');
        setAnalysis(cached);
        setError(null);
        return;
      }
    } else {
      console.log('[useMeaningAnalysis] Skipping cache - fetching word-specific analysis for:', focusWord);
    }

    // Fetch from AI
    setLoading(true);
    setError(null);

    try {
      console.log('[useMeaningAnalysis] Calling AI service...');
      const result = await window.electronAPI.ai.getContextualMeaning(
        pageContent,
        analysisType,
        language,
        focusWord,
        focusSentence
      );
      console.log('[useMeaningAnalysis] AI response received:', {
        success: result.success,
        hasNarrative: !!result.narrative,
        hasWordSpecific: !!(result.narrative as any)?.wordSpecific
      });

      if (result.success) {
        // Extract analysis from result
        const analysisData: MeaningAnalysis = {
          narrative: result.narrative,
          literary: result.literary,
          semantic: result.semantic,
          simplified: result.simplified,
        };

        // Cache successful result (but only for page-level analysis, not word-specific)
        // Word-specific analysis is always fetched fresh to ensure accuracy
        if (!focusWord) {
          meaningCache.set(bookId, pageIndex, analysisType, analysisData);
        }
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
