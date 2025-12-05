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

// Supported book languages
export type BookLanguage = 'en' | 'de' | 'ru' | 'fr' | 'es' | 'it' | 'pt' | 'ja' | 'zh' | 'ko';

export const BOOK_LANGUAGES: { code: BookLanguage; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'German' },
  { code: 'ru', name: 'Russian' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ko', name: 'Korean' },
];

// Database entity for books
export interface Book {
  id: number;
  title: string;
  json_path: string;
  total_pages: number;
  total_words?: number;
  total_chars?: number;
  cover_image?: string;
  language: BookLanguage;
  created_at: string;
  updated_at?: string;
}

// Reading progress
export interface ReadingProgress {
  id: number;
  book_id: number;
  current_page: number;
  character_offset: number;
  progress_percentage: number;
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
