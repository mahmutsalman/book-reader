import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './shared/constants/ipc-channels';
import type { ElectronAPI } from './shared/types/ipc.types';
import type { PreStudyNotesRequest, PreStudyProgress } from './shared/types/pre-study-notes.types';

// Create the API object to expose to the renderer
const electronAPI: ElectronAPI = {
  // Book operations
  book: {
    import: (filePath: string, language?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_IMPORT, filePath, language || 'en'),
    importPdf: (pdfPath: string, language?: string, useOcr?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_IMPORT_PDF, pdfPath, language || 'en', useOcr ?? true),
    importTxt: (txtPath: string, language?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_IMPORT_TXT, txtPath, language || 'en'),
    importEpub: (epubPath: string, language?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_IMPORT_EPUB, epubPath, language || 'en'),
    getPdfStatus: () =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_PDF_STATUS),
    getAll: () =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_GET_ALL),
    getById: (id: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_GET_BY_ID, id),
    delete: (id: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_DELETE, id),
    getPage: (bookId: number, pageNum: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_GET_PAGE, bookId, pageNum),
    getData: (bookId: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_GET_DATA, bookId),
    searchWord: (bookId: number, word: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_SEARCH_WORD, bookId, word),
  },

  // Reading progress
  progress: {
    get: (bookId: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROGRESS_GET, bookId),
    update: (bookId: number, data) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROGRESS_UPDATE, bookId, data),
  },

  // Vocabulary
  vocabulary: {
    add: (entry) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOCABULARY_ADD, entry),
    getAll: (filters) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOCABULARY_GET_ALL, filters),
    getCounts: (bookId?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOCABULARY_GET_COUNTS, bookId),
    update: (id, data) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOCABULARY_UPDATE, id, data),
    delete: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOCABULARY_DELETE, id),
    getOccurrences: (wordId) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOCABULARY_GET_OCCURRENCES, wordId),
    addOccurrence: (wordId, bookId, pageNumber, sentence) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOCABULARY_ADD_OCCURRENCE, wordId, bookId, pageNumber, sentence),
    export: (exportType: 'words-only' | 'words-context', entries: { word: string; sentence?: string }[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOCABULARY_EXPORT, { exportType, entries }),
  },

  // AI Services
  ai: {
    getDefinition: (word, context, language?) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GET_DEFINITION, word, context, language || 'en'),
    getIPA: (word, language?) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GET_IPA, word, language || 'en'),
    getBatchIPA: (words, language?) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GET_BATCH_IPA, words, language || 'en'),
    simplifySentence: (sentence, language?) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SIMPLIFY_SENTENCE, sentence, language || 'en'),
    getWordEquivalent: (word, originalSentence, simplifiedSentence) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GET_WORD_EQUIVALENT, word, originalSentence, simplifiedSentence),
    resimplifyWithWord: (originalSentence, originalWord, equivalentWord) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_RESIMPLIFY_WITH_WORD, originalSentence, originalWord, equivalentWord),
    getPhraseMeaning: (phrase, context, language?) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GET_PHRASE_MEANING, phrase, context, language || 'en'),
    getGrammarAnalysis: (text: string, sentence: string, language?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GET_GRAMMAR_ANALYSIS, text, sentence, language || 'en'),
    getContextualMeaning: (
      pageContent: string,
      analysisType: string,
      language?: string,
      focusWord?: string,
      focusSentence?: string
    ) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.AI_GET_CONTEXTUAL_MEANING,
        pageContent,
        analysisType,
        language || 'en',
        focusWord,
        focusSentence
      ),
    testConnection: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_TEST_CONNECTION),
    testGroqConnection: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_TEST_GROQ_CONNECTION),
    testOpenRouterConnection: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_TEST_OPENROUTER_CONNECTION),
    testMistralConnection: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_TEST_MISTRAL_CONNECTION),
    testGoogleConnection: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_TEST_GOOGLE_CONNECTION),
    getNextModel: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GET_NEXT_MODEL),
  },

  // Tatoeba
  tatoeba: {
    search: (word, language) =>
      ipcRenderer.invoke(IPC_CHANNELS.TATOEBA_SEARCH, word, language),
    importData: (filePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.TATOEBA_IMPORT_DATA, filePath),
    getStatus: () =>
      ipcRenderer.invoke(IPC_CHANNELS.TATOEBA_GET_STATUS),
  },

  // Settings
  settings: {
    get: (key) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
    set: (key, value) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),
    getAll: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
  },

  // File dialogs
  dialog: {
    openFile: (options) =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, options),
  },

  // Pronunciation Services
  pronunciation: {
    getTTS: (text: string, language?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRONUNCIATION_GET_TTS, text, language || 'en'),
    getIPA: (text: string, language?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRONUNCIATION_GET_IPA, text, language || 'en'),
    getServerStatus: () =>
      ipcRenderer.invoke(IPC_CHANNELS.PRONUNCIATION_SERVER_STATUS),
    getIPALanguages: () =>
      ipcRenderer.invoke(IPC_CHANNELS.PRONUNCIATION_GET_IPA_LANGUAGES),
    installIPALanguage: (language: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRONUNCIATION_INSTALL_IPA_LANGUAGE, language),
    // Voice Model Management
    getVoiceModels: () =>
      ipcRenderer.invoke(IPC_CHANNELS.PRONUNCIATION_GET_VOICE_MODELS),
    downloadVoiceModel: (language: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRONUNCIATION_DOWNLOAD_VOICE_MODEL, language),
    deleteVoiceModel: (language: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRONUNCIATION_DELETE_VOICE_MODEL, language),
    restartServer: () =>
      ipcRenderer.invoke(IPC_CHANNELS.PRONUNCIATION_RESTART_SERVER),
  },

  // Pre-Study Notes
  preStudy: {
    generateNotes: (request: PreStudyNotesRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRE_STUDY_GENERATE_NOTES, request),
    onProgress: (callback: (progress: PreStudyProgress) => void) => {
      const handler = (_: unknown, progress: PreStudyProgress) => callback(progress);
      ipcRenderer.on(IPC_CHANNELS.PRE_STUDY_PROGRESS, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.PRE_STUDY_PROGRESS, handler);
      };
    },
    cancel: () =>
      ipcRenderer.invoke(IPC_CHANNELS.PRE_STUDY_CANCEL),
  },

  // Window management
  window: {
    openHtml: (htmlContent: string, title: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_OPEN_HTML, htmlContent, title),
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
