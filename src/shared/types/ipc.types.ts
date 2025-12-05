import type { Book, BookData, ReadingProgress, BookLanguage } from './book.types';
import type { VocabularyEntry, CreateVocabularyEntry, VocabularyFilters, StoredWordOccurrence } from './vocabulary.types';
import type { AppSettings, LMStudioConnectionResult, GroqConnectionResult } from './settings.types';
import type { WordDefinitionResult, IPAPronunciationResult, BatchIPAResult, SimplifiedSentenceResult, WordEquivalentResult, PhraseMeaningResult, TatoebaSentence, TatoebaStatus } from './ai.types';
import type { TTSResponse, IPAResponse, PronunciationServerStatus, IPALanguagesResponse, InstallLanguageResponse } from './pronunciation.types';
import type { PreStudyNotesRequest, PreStudyNotesResult, PreStudyProgress } from './pre-study-notes.types';

// PDF Status response type
export interface PdfStatusResponse {
  available: boolean;
  pdf_available: boolean;
  ocr_available: boolean;
  tesseract_path: string | null;
  error: string | null;
}

// IPC API exposed to renderer
export interface ElectronAPI {
  book: {
    import: (filePath: string, language?: BookLanguage) => Promise<Book>;
    importPdf: (pdfPath: string, language?: BookLanguage, useOcr?: boolean) => Promise<Book>;
    getPdfStatus: () => Promise<PdfStatusResponse>;
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
    getDefinition: (word: string, context: string, language?: string) => Promise<WordDefinitionResult>;
    getIPA: (word: string, language?: string) => Promise<IPAPronunciationResult>;
    getBatchIPA: (words: string[], language?: string) => Promise<BatchIPAResult>;
    simplifySentence: (sentence: string, language?: string) => Promise<SimplifiedSentenceResult>;
    getWordEquivalent: (word: string, originalSentence: string, simplifiedSentence: string) => Promise<WordEquivalentResult>;
    resimplifyWithWord: (originalSentence: string, originalWord: string, equivalentWord: string) => Promise<SimplifiedSentenceResult>;
    getPhraseMeaning: (phrase: string, context: string, language?: string) => Promise<PhraseMeaningResult>;
    testConnection: () => Promise<LMStudioConnectionResult>;
    testGroqConnection: () => Promise<GroqConnectionResult>;
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
  pronunciation: {
    getTTS: (text: string, language?: string) => Promise<TTSResponse>;
    getIPA: (text: string, language?: string) => Promise<IPAResponse>;
    getServerStatus: () => Promise<PronunciationServerStatus>;
    getIPALanguages: () => Promise<IPALanguagesResponse>;
    installIPALanguage: (language: string) => Promise<InstallLanguageResponse>;
  };
  preStudy: {
    generateNotes: (request: PreStudyNotesRequest) => Promise<PreStudyNotesResult>;
    onProgress: (callback: (progress: PreStudyProgress) => void) => () => void;
    cancel: () => Promise<void>;
  };
  window: {
    openHtml: (htmlContent: string, title: string) => Promise<void>;
  };
}

// Augment window with electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
