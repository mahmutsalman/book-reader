import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './shared/constants/ipc-channels';
import type { ElectronAPI } from './shared/types/ipc.types';

// Create the API object to expose to the renderer
const electronAPI: ElectronAPI = {
  // Book operations
  book: {
    import: (filePath: string, language?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOK_IMPORT, filePath, language || 'en'),
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
    update: (id, data) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOCABULARY_UPDATE, id, data),
    delete: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOCABULARY_DELETE, id),
    getOccurrences: (wordId) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOCABULARY_GET_OCCURRENCES, wordId),
    addOccurrence: (wordId, bookId, pageNumber, sentence) =>
      ipcRenderer.invoke(IPC_CHANNELS.VOCABULARY_ADD_OCCURRENCE, wordId, bookId, pageNumber, sentence),
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
    testConnection: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_TEST_CONNECTION),
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
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
