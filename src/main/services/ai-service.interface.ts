/**
 * AI Service Interface
 * Unified interface for all AI providers (LM Studio, Groq, etc.)
 * This interface ensures all AI providers can be used interchangeably.
 */

import type { PreStudyWordEntry } from '../../shared/types/pre-study-notes.types';
import type { GrammarAnalysis } from '../../shared/types/grammar.types';
import type { MeaningAnalysis, MeaningAnalysisType } from '../../shared/types/meaning-analysis.types';

export interface AIServiceInterface {
  /**
   * Test the connection to the AI service
   */
  testConnection(): Promise<{
    success: boolean;
    models?: string[];
    error?: string;
  }>;

  /**
   * Get word definition with context
   */
  getWordDefinition(
    word: string,
    context: string,
    language: string
  ): Promise<{
    definition: string;
    wordTranslation?: string;
    wordType?: string;
    germanArticle?: string;
  }>;

  /**
   * Get IPA pronunciation and syllable breakdown
   */
  getIPAPronunciation(
    word: string,
    language: string
  ): Promise<{
    ipa: string;
    syllables: string;
  }>;

  /**
   * Get IPA pronunciation for multiple words at once (batch processing)
   */
  getBatchIPAPronunciation(
    words: string[],
    language: string
  ): Promise<{
    word: string;
    ipa: string;
    syllables: string;
  }[]>;

  /**
   * Simplify a sentence for language learners
   */
  simplifySentence(
    sentence: string,
    language: string
  ): Promise<{
    simplified: string;
    simplifiedTranslation?: string;
    sentenceTranslation?: string;
  }>;

  /**
   * Find the equivalent word in a simplified sentence
   */
  getWordEquivalent(
    originalWord: string,
    originalSentence: string,
    simplifiedSentence: string
  ): Promise<{
    equivalent: string;
    needsRegeneration: boolean;
  }>;

  /**
   * Re-simplify a sentence ensuring a specific word replacement is used
   */
  resimplifyWithWord(
    originalSentence: string,
    originalWord: string,
    equivalentWord: string,
    language: string
  ): Promise<string>;

  /**
   * Get the meaning of a phrase (phrasal verb, idiom, collocation)
   */
  getPhraseMeaning(
    phrase: string,
    context: string,
    language: string
  ): Promise<{
    meaning: string;
    phraseTranslation?: string;
  }>;

  /**
   * Generate a pre-study entry for a word
   * @param enhanced - When true, generates richer content with examples and grammar explanations
   */
  generatePreStudyEntry(
    word: string,
    sentence: string,
    language: string,
    grammarTopicsByLevel: { a1: string; a2: string; b1: string; b2: string },
    enhanced?: boolean
  ): Promise<PreStudyWordEntry>;

  /**
   * Get comprehensive grammar analysis for a word or phrase in context
   * Provides deep grammatical explanation including structure, rules, examples, and practice
   */
  getGrammarAnalysis(
    text: string,
    sentence: string,
    language: string
  ): Promise<GrammarAnalysis>;

  /**
   * Get contextual meaning analysis for a page of text
   * Provides literary, semantic, and narrative analysis for language learners
   */
  getContextualMeaning(
    pageContent: string,
    analysisType: MeaningAnalysisType,
    language: string,
    timeout?: number
  ): Promise<MeaningAnalysis>;
}
