/**
 * Contextual Meaning Analysis Types
 * For the Meaning Perspective feature providing literary and semantic analysis
 */

export type MeaningAnalysisType =
  | 'narrative'      // Story, characters, plot relationships
  | 'literary'       // Word choice, tone, literary devices
  | 'semantic'       // Multiple meanings, nuances, cultural implications
  | 'simplified';    // Language learner breakdown

/**
 * Narrative context analysis
 */
export interface NarrativeAnalysis {
  plotContext: string;           // What's happening in the story
  characterDynamics: string;     // Character relationships and motivations
  narrativeFunction: string;     // Why this passage exists in the story
}

/**
 * Literary analysis
 */
export interface LiteraryAnalysis {
  wordChoice: string;            // Specific word choices and their effects
  tone: string;                  // Emotional tone and atmosphere
  literaryDevices: string[];     // Metaphors, similes, symbolism, etc.
}

/**
 * Semantic analysis
 */
export interface SemanticAnalysis {
  multipleMeanings: string[];    // Different interpretations
  nuances: string;               // Subtle implications
  culturalContext: string;       // Cultural/historical context
}

/**
 * Simplified explanation for language learners
 */
export interface SimplifiedAnalysis {
  mainIdea: string;              // Core message in simple terms
  breakdown: string;             // Sentence-by-sentence explanation
  keyVocabulary: string[];       // Important words to know
}

/**
 * Complete meaning analysis result from AI
 */
export interface MeaningAnalysis {
  narrative?: NarrativeAnalysis;
  literary?: LiteraryAnalysis;
  semantic?: SemanticAnalysis;
  simplified?: SimplifiedAnalysis;
}

/**
 * Cache entry for meaning analysis
 * Stored per page + analysis type combination
 */
export interface CachedMeaningData {
  cacheVersion: number;
  analysis: MeaningAnalysis;
  fetchedAt: number;
}

/**
 * Cache key generation for meaning analysis
 * Format: `${bookId}-meaning-${pageIndex}-${analysisType}`
 */
export function generateMeaningCacheKey(
  bookId: number,
  pageIndex: number,
  analysisType: MeaningAnalysisType
): string {
  return `${bookId}-meaning-${pageIndex}-${analysisType}`;
}

/**
 * Current cache version for meaning analysis
 */
export const MEANING_CACHE_VERSION = 1;
