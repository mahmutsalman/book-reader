// Word type for categorization
export type WordType = 'word' | 'phrasal_verb' | 'word_group';

// Vocabulary entry (looked-up word)
export interface VocabularyEntry {
  id: number;
  word: string;
  word_type: WordType;
  book_id?: number;
  meaning?: string;
  ipa_pronunciation?: string;
  simplified_sentence?: string;
  original_sentence?: string;
  lookup_count: number;
  created_at: string;
  last_reviewed_at?: string;
  next_review_at?: string;
  familiarity_score: number;
}

// For creating new vocabulary entry
export interface CreateVocabularyEntry {
  word: string;
  word_type?: WordType;
  book_id?: number;
  meaning?: string;
  ipa_pronunciation?: string;
  simplified_sentence?: string;
  original_sentence?: string;
}

// Vocabulary filters for listing
export interface VocabularyFilters {
  bookId?: number;
  wordType?: WordType;
  search?: string;
  sortBy?: 'created_at' | 'word' | 'lookup_count' | 'next_review_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// Session vocabulary entry (in-memory only, clears on app restart)
export interface SessionVocabularyEntry {
  word: string;
  word_type: WordType;
  book_id: number;
  book_title?: string;
  meaning?: string;
  sentence: string;
  timestamp: number;
}

// Counts by word type
export interface WordTypeCounts {
  word: number;
  phrasal_verb: number;
  word_group: number;
}

// Word occurrence stored in database
export interface StoredWordOccurrence {
  id: number;
  vocabulary_id: number;
  book_id: number;
  page_number: number;
  sentence: string;
  char_offset?: number;
}
