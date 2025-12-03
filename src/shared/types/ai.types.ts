// AI service response types

export interface WordDefinitionResult {
  word: string;
  definition: string;
  context: string;
}

export interface IPAPronunciationResult {
  word: string;
  ipa: string;
  syllables: string;
}

export interface SimplifiedSentenceResult {
  original: string;
  simplified: string;
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
