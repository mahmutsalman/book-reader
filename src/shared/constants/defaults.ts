import type { AppSettings } from '../types/settings.types';

// Default application settings
export const DEFAULT_SETTINGS: AppSettings = {
  lm_studio_url: 'http://localhost:1234',
  lm_studio_model: 'default',
  tatoeba_enabled: false,
  tatoeba_language: 'en',
  default_zoom: 1.0,
  theme: 'light',
  font_family: 'Georgia, serif',
  line_height: 1.8,
  page_margin: 40,
  // Pre-Study Notes settings
  pre_study_view_count: 10,      // Default: 10 views
  pre_study_sentence_limit: 0,   // Default: 0 = all sentences
  // Audio settings
  slow_playback_speed: 0.6,      // Default: 0.6x speed for slow playback
  // AI Provider settings
  ai_provider: 'local',          // Default: local LM Studio
  groq_api_key: '',              // Empty by default - user must set up
  groq_model: 'llama-3.1-8b-instant', // Default Groq model (faster, with automatic fallback)
};

// Zoom level constraints
export const ZOOM_LEVELS = {
  MIN: 0.5,
  MAX: 3.0,
  STEP: 0.1,
  DEFAULT: 1.0,
} as const;

// Text reflow settings
export const REFLOW_SETTINGS = {
  BASE_FONT_SIZE: 18, // pixels
  LINE_HEIGHT: 1.8,
  DEBOUNCE_MS: 300,
  WORDS_PER_PAGE_MIN: 50,
  WORDS_PER_PAGE_MAX: 500,
} as const;

// Database settings
export const DB_SETTINGS = {
  FILE_NAME: 'bookreader.db',
  VERSION: 1,
} as const;
