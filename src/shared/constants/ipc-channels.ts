// IPC channel names for communication between main and renderer processes
export const IPC_CHANNELS = {
  // Book operations
  BOOK_IMPORT: 'book:import',
  BOOK_IMPORT_PDF: 'book:import-pdf',
  BOOK_PDF_STATUS: 'book:pdf-status',
  BOOK_GET_ALL: 'book:get-all',
  BOOK_GET_BY_ID: 'book:get-by-id',
  BOOK_DELETE: 'book:delete',
  BOOK_GET_PAGE: 'book:get-page',
  BOOK_GET_DATA: 'book:get-data',
  BOOK_SEARCH_WORD: 'book:search-word',

  // Reading progress
  PROGRESS_GET: 'progress:get',
  PROGRESS_UPDATE: 'progress:update',

  // Vocabulary
  VOCABULARY_ADD: 'vocabulary:add',
  VOCABULARY_GET_ALL: 'vocabulary:get-all',
  VOCABULARY_UPDATE: 'vocabulary:update',
  VOCABULARY_DELETE: 'vocabulary:delete',
  VOCABULARY_GET_OCCURRENCES: 'vocabulary:get-occurrences',
  VOCABULARY_ADD_OCCURRENCE: 'vocabulary:add-occurrence',

  // AI Services
  AI_GET_DEFINITION: 'ai:get-definition',
  AI_GET_IPA: 'ai:get-ipa',
  AI_GET_BATCH_IPA: 'ai:get-batch-ipa',
  AI_SIMPLIFY_SENTENCE: 'ai:simplify-sentence',
  AI_GET_WORD_EQUIVALENT: 'ai:get-word-equivalent',
  AI_RESIMPLIFY_WITH_WORD: 'ai:resimplify-with-word',
  AI_GET_PHRASE_MEANING: 'ai:get-phrase-meaning',
  AI_TEST_CONNECTION: 'ai:test-connection',

  // Tatoeba
  TATOEBA_SEARCH: 'tatoeba:search',
  TATOEBA_IMPORT_DATA: 'tatoeba:import-data',
  TATOEBA_GET_STATUS: 'tatoeba:get-status',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',

  // File dialogs
  DIALOG_OPEN_FILE: 'dialog:open-file',

  // Pronunciation Services
  PRONUNCIATION_GET_TTS: 'pronunciation:get-tts',
  PRONUNCIATION_GET_IPA: 'pronunciation:get-ipa',
  PRONUNCIATION_SERVER_STATUS: 'pronunciation:server-status',
  PRONUNCIATION_GET_IPA_LANGUAGES: 'pronunciation:get-ipa-languages',
  PRONUNCIATION_INSTALL_IPA_LANGUAGE: 'pronunciation:install-ipa-language',

  // Pre-Study Notes
  PRE_STUDY_GENERATE_NOTES: 'pre-study:generate-notes',
  PRE_STUDY_PROGRESS: 'pre-study:progress',
  PRE_STUDY_CANCEL: 'pre-study:cancel',
  WINDOW_OPEN_HTML: 'window:open-html',
} as const;

export type IPCChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
