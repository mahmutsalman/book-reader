// AI service response types

export interface WordDefinitionResult {
  word: string;
  definition: string;
  context: string;
  wordTranslation?: string; // English translation of the word (for non-English books)
  wordType?: string;        // Part of speech (noun, verb, adjective, etc.)
  germanArticle?: string;   // German definite article (der, die, das) - only for German nouns
}

export interface IPAPronunciationResult {
  word: string;
  ipa: string;
  syllables: string;
}

export interface SimplifiedSentenceResult {
  original: string;
  simplified: string;
  sentenceTranslation?: string;   // English translation of original sentence
  simplifiedTranslation?: string; // English translation of simplified sentence
}

export interface WordEquivalentResult {
  word: string;
  equivalent: string;
  needsRegeneration: boolean;
}

export interface PhraseMeaningResult {
  phrase: string;
  meaning: string;
  context: string;
  phraseTranslation?: string; // English translation of the phrase (for non-English books)
}

// Tatoeba sentence
export interface TatoebaSentence {
  id: number;
  language: string;
  sentence: string;
  translations?: TatoebaSentence[];
}

// Tatoeba search result
export interface TatoebaSearchResult {
  word: string;
  sentences: TatoebaSentence[];
}

// Tatoeba import status
export interface TatoebaStatus {
  enabled: boolean;
  sentenceCount: number;
  languages: string[];
  lastImport?: string;
}
