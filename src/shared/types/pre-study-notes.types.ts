// Pre-Study Notes Types
// Types for the pre-study notes feature that generates comprehensive
// study notes for upcoming pages before reading

export type GrammarLevel = 'A1' | 'A2' | 'B1' | 'B2';

export interface GrammarTopic {
  name: string;
  explanation: string;
  level: GrammarLevel;
}

// Enhanced example sentence (for API AI mode)
export interface ExampleSentence {
  sentence: string;           // Example sentence in target language
  translation: string;        // English translation
  grammarPoint: string;       // Grammar concept demonstrated (e.g., "accusative case")
}

export interface PreStudyWordEntry {
  word: string;
  cleanWord: string;
  ipa: string;
  syllables: string;
  definition: string;
  wordType?: string;
  wordTranslation?: string;      // For non-English books
  germanArticle?: string;        // For German: der, die, das
  contextSentence: string;
  grammarTopics?: GrammarTopic[];
  // Audio (base64-encoded MP3)
  wordAudio?: string;            // Pronunciation of the word
  sentenceAudio?: string;        // Pronunciation of context sentence
  // Enhanced fields (for API AI mode - Groq)
  exampleSentences?: ExampleSentence[];   // 3-5 example sentences showing word in different contexts
  grammarExplanation?: string;             // Detailed grammar explanation for beginners
  relatedGrammarTopics?: string[];         // List of grammar topics (e.g., "Accusative Case", "Verb Conjugation")
}

export interface PreStudyNotesRequest {
  bookId: number;
  bookTitle: string;
  language: string;
  textContent: string;           // Raw text from next N views
  startViewIndex: number;
  endViewIndex: number;
}

export interface PreStudyNotesResult {
  entries: PreStudyWordEntry[];
  bookTitle: string;
  language: string;
  viewRange: string;
  generatedAt: string;
  totalWords: number;
  uniqueWords: number;
}

export type PreStudyPhase = 'extracting' | 'processing' | 'generating';

export interface PreStudyProgress {
  current: number;
  total: number;
  phase: PreStudyPhase;
  currentWord?: string;
  estimatedTimeRemaining?: number; // in seconds
}

// Grammar topics organized by language and level
export interface LanguageGrammarTopics {
  language: string;
  levels: {
    A1: string[];
    A2: string[];
    B1: string[];
    B2: string[];
  };
}
