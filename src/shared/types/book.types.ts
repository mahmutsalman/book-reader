// Book JSON structure (from extracted PDF)
export interface BookPage {
  page: number;
  chapter: string;
  text: string;
  char_count: number;
  word_count: number;
}

export interface BookData {
  title: string;
  source_file: string;
  total_pages: number;
  pages: BookPage[];
  chapters?: string[];
  total_words?: number;
  total_chars?: number;
}

// Database entity for books
export interface Book {
  id: number;
  title: string;
  json_path: string;
  total_pages: number;
  total_words?: number;
  total_chars?: number;
  cover_image?: string;
  created_at: string;
  updated_at?: string;
}

// Reading progress
export interface ReadingProgress {
  id: number;
  book_id: number;
  current_page: number;
  character_offset: number;
  zoom_level: number;
  last_read_at: string;
}

// Reflowed page for dynamic text wrapping
export interface ReflowedPage {
  content: string;
  words: WordInfo[];
  startCharIndex: number;
  endCharIndex: number;
  originalPageNumbers: number[];
}

// Word information for clickable words
export interface WordInfo {
  word: string;
  cleanWord: string; // lowercase, no punctuation
  startIndex: number;
  endIndex: number;
  sentenceStartIndex: number;
  sentenceEndIndex: number;
}

// Word occurrence in book
export interface WordOccurrence {
  pageNumber: number;
  sentence: string;
  charOffset: number;
}
