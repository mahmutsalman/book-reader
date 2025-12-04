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
