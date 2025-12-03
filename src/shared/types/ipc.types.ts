import type { Book, BookData, ReadingProgress } from './book.types';
import type { VocabularyEntry, CreateVocabularyEntry, VocabularyFilters, StoredWordOccurrence } from './vocabulary.types';
import type { AppSettings, LMStudioConnectionResult } from './settings.types';
import type { WordDefinitionResult, IPAPronunciationResult, SimplifiedSentenceResult, WordEquivalentResult, TatoebaSentence, TatoebaStatus } from './ai.types';

// IPC API exposed to renderer
export interface ElectronAPI {
  book: {
    import: (filePath: string) => Promise<Book>;
    getAll: () => Promise<Book[]>;
    getById: (id: number) => Promise<Book | null>;
    delete: (id: number) => Promise<void>;
    getPage: (bookId: number, pageNum: number) => Promise<string>;
    getData: (bookId: number) => Promise<BookData | null>;
    searchWord: (bookId: number, word: string) => Promise<{ page: number; sentence: string }[]>;
  };
  progress: {
    get: (bookId: number) => Promise<ReadingProgress | null>;
    update: (bookId: number, data: Partial<ReadingProgress>) => Promise<void>;
  };
  vocabulary: {
    add: (entry: CreateVocabularyEntry) => Promise<VocabularyEntry>;
    getAll: (filters?: VocabularyFilters) => Promise<VocabularyEntry[]>;
    update: (id: number, data: Partial<VocabularyEntry>) => Promise<void>;
    delete: (id: number) => Promise<void>;
    getOccurrences: (wordId: number) => Promise<StoredWordOccurrence[]>;
    addOccurrence: (wordId: number, bookId: number, pageNumber: number, sentence: string) => Promise<void>;
  };
  ai: {
    getDefinition: (word: string, context: string) => Promise<WordDefinitionResult>;
    getIPA: (word: string) => Promise<IPAPronunciationResult>;
    simplifySentence: (sentence: string) => Promise<SimplifiedSentenceResult>;
    getWordEquivalent: (word: string, originalSentence: string, simplifiedSentence: string) => Promise<WordEquivalentResult>;
    resimplifyWithWord: (originalSentence: string, originalWord: string, equivalentWord: string) => Promise<SimplifiedSentenceResult>;
    testConnection: () => Promise<LMStudioConnectionResult>;
  };
  tatoeba: {
    search: (word: string, language?: string) => Promise<TatoebaSentence[]>;
    importData: (filePath: string) => Promise<{ imported: number }>;
    getStatus: () => Promise<TatoebaStatus>;
  };
  settings: {
    get: <K extends keyof AppSettings>(key: K) => Promise<AppSettings[K]>;
    set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
    getAll: () => Promise<AppSettings>;
  };
  dialog: {
    openFile: (options: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  };
}

// Augment window with electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
