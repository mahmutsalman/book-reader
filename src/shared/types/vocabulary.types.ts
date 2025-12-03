// Vocabulary entry (looked-up word)
export interface VocabularyEntry {
  id: number;
  word: string;
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
  book_id?: number;
  meaning?: string;
  ipa_pronunciation?: string;
  simplified_sentence?: string;
  original_sentence?: string;
}

// Vocabulary filters for listing
export interface VocabularyFilters {
  bookId?: number;
  search?: string;
  sortBy?: 'created_at' | 'word' | 'lookup_count' | 'next_review_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
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
