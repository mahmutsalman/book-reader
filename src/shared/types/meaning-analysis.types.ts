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
  // Page-level context (macro view)
  plotContext: string;           // What's happening in the story
  characterDynamics: string;     // Character relationships and motivations
  narrativeFunction: string;     // Why this passage exists in the story

  // Word-level focus (micro view) - optional
  wordSpecific?: {
    wordInPlot: string;          // How this word/phrase matters to the plot (2-3 sentences)
    characterInsight: string;    // What it reveals about characters (2-3 sentences)
    thematicRole: string;        // Connection to broader themes (1-2 sentences)
  };
}

/**
 * Literary analysis
 */
export interface LiteraryAnalysis {
  // Page-level context (macro view)
  wordChoice: string;            // Specific word choices and their effects
  tone: string;                  // Emotional tone and atmosphere
  literaryDevices: string[];     // Metaphors, similes, symbolism, etc.

  // Word-level focus (micro view) - optional
  wordSpecific?: {
    rhetoricalEffect: string;    // Why THIS word was chosen vs. alternatives (2-3 sentences)
    emotionalImpact: string;     // Emotional weight and connotations (1-2 sentences)
    stylisticPurpose: string;    // How it contributes to author's style (1-2 sentences)
  };
}

/**
 * Semantic analysis
 */
export interface SemanticAnalysis {
  // Page-level context (macro view)
  multipleMeanings: string[];    // Different interpretations
  nuances: string;               // Subtle implications
  culturalContext: string;       // Cultural/historical context

  // Word-level focus (micro view) - optional
  wordSpecific?: {
    contextualMeaning: string;   // Specific meaning in THIS context (2-3 sentences)
    ambiguityAnalysis: string;   // Multiple interpretations of THIS word (2-3 sentences)
    culturalSignificance: string; // Cultural/idiomatic implications (1-2 sentences)
  };
}

/**
 * Simplified explanation for language learners
 */
export interface SimplifiedAnalysis {
  // Page-level context (macro view)
  mainIdea: string;              // Core message in simple terms
  breakdown: string;             // Sentence-by-sentence explanation
  keyVocabulary: string[];       // Important words to know

  // Word-level focus (micro view) - optional
  wordSpecific?: {
    simpleDefinition: string;    // Simple explanation of THIS word (1-2 sentences)
    usageExample: string;        // How it's used here vs. general usage (1-2 sentences)
    learnerTip: string;          // Helpful tip for remembering/using it (1 sentence)
  };
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
