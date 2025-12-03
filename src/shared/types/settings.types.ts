// App settings
export interface AppSettings {
  lm_studio_url: string;
  lm_studio_model: string;
  tatoeba_enabled: boolean;
  tatoeba_language: string;
  default_zoom: number;
  theme: 'light' | 'dark' | 'system';
  font_family: string;
  line_height: number;
  page_margin: number;
}

// Settings update
export type SettingsUpdate = Partial<AppSettings>;

// LM Studio connection test result
export interface LMStudioConnectionResult {
  success: boolean;
  models?: string[];
  error?: string;
}
