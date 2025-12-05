/**
 * Grammar Analysis Types
 * Types for the Grammar Perspective feature that provides deep grammatical analysis
 */

/**
 * Parts of Speech for word classification and color coding
 */
export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'preposition'
  | 'conjunction'
  | 'pronoun'
  | 'article'
  | 'interjection'
  | 'particle'
  | 'other';

/**
 * Word with its part of speech tag
 */
export interface WordPOS {
  word: string;
  pos: PartOfSpeech;
}

/**
 * Grammar structure identification
 */
export interface GrammarStructure {
  type: string; // e.g., "passive voice", "conditional", "relative clause"
  description: string; // Human-readable description of the structure
}

/**
 * Example sentence with grammar context
 */
export interface GrammarExample {
  sentence: string;
  translation?: string; // For non-English books
  complexity: 'simple' | 'medium' | 'complex';
}

/**
 * Practice task for learning reinforcement
 */
export interface PracticeTask {
  instruction: string; // e.g., "Complete this sentence using the same pattern"
  template: string; // e.g., "The book ___ (read) by many students."
}

/**
 * Complete grammar analysis result from AI
 */
export interface GrammarAnalysis {
  /** Parts of speech for each word in the sentence */
  partsOfSpeech: WordPOS[];

  /** Identified grammar structure */
  structure: GrammarStructure;

  /** Detailed rule explanation */
  ruleExplanation: string;

  /** Why the author chose this structure in context */
  contextAnalysis: string;

  /** Reusable pattern/template */
  pattern: string;

  /** Example sentences from simple to complex */
  examples: GrammarExample[];

  /** Common mistakes learners make with this structure */
  commonMistakes: string[];

  /** Practice task for the learner */
  practiceTask: PracticeTask;
}

/**
 * AI response wrapper for grammar analysis
 */
export interface GrammarAnalysisResult {
  success: boolean;
  error?: string;
  analysis?: GrammarAnalysis;
}
