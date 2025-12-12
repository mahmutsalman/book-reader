// AI Provider type
export type AIProvider = 'local' | 'groq';

// App settings
export interface AppSettings {
  lm_studio_url: string;
  lm_studio_model: string;
  tatoeba_enabled: boolean;
  tatoeba_language: string;
  default_zoom: number;
  theme: 'light' | 'dark' | 'system';
  reader_theme: string;  // Reader-specific theme (sepiaClassic, darkComfort, trueBlack, oceanBlue, forestGreen, purpleTwilight)
  font_family: string;
  line_height: number;
  page_margin: number;
  // Pre-Study Notes settings
  pre_study_view_count: number;      // Number of views to process (1-20, default: 10)
  pre_study_sentence_limit: number;  // Max sentences per view (0 = all, 1-2 for testing)
  // Audio settings
  slow_playback_speed: number;       // Slow audio playback speed (0.25 to 2.0, default: 0.6)
  // AI Provider settings
  ai_provider: AIProvider;           // 'local' (LM Studio) or 'groq' (Cloud AI)
  groq_api_key: string;              // Groq API key
  groq_model: string;                // Groq model (default: 'llama-3.3-70b-versatile')
}

// Settings update
export type SettingsUpdate = Partial<AppSettings>;

// LM Studio connection test result
export interface LMStudioConnectionResult {
  success: boolean;
  models?: string[];
  error?: string;
}

// Groq connection test result
export interface GroqConnectionResult {
  success: boolean;
  models?: string[];
  error?: string;
}
