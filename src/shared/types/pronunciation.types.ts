/**
 * Pronunciation service types for TTS and IPA generation.
 */

// TTS (Text-to-Speech) types
export interface TTSRequest {
  text: string;
  language: string; // 'en' | 'de' | 'ru'
}

export interface TTSResponse {
  success: boolean;
  audio_base64?: string;
  format?: string; // 'mp3'
  error?: string;
}

// IPA (International Phonetic Alphabet) types
export interface IPARequest {
  text: string;
  language: string;
}

export interface IPAResponse {
  success: boolean;
  text?: string;
  ipa?: string;
  error?: string;
}

// Server status types
export interface PronunciationServerStatus {
  running: boolean;
  ready: boolean;
  port: number;
  url: string;
  error?: string;
}

// Health check response from Python server
export interface HealthResponse {
  status: string;
  version: string;
}

// IPA Language management types
export interface IPALanguageInfo {
  code: string;
  name: string;
  package: string;
  installed: boolean;
}

export interface IPALanguagesResponse {
  success: boolean;
  languages: IPALanguageInfo[];
  error?: string;
}

export interface InstallLanguageResponse {
  success: boolean;
  message: string;
  error?: string;
}

// Voice Model Management types
export interface VoiceModelInfo {
  language: string;
  name: string;
  model_file: string;
  config_file: string;
  size?: number; // Size in bytes if downloaded
  downloaded: boolean;
  download_url_model?: string;
  download_url_config?: string;
}

export interface VoiceModelsResponse {
  success: boolean;
  models: VoiceModelInfo[];
  models_directory: string;
  error?: string;
}

export interface DownloadModelResponse {
  success: boolean;
  message: string;
  progress?: number; // 0-100
  error?: string;
}

export interface DeleteModelResponse {
  success: boolean;
  message: string;
  error?: string;
}
