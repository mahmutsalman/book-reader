/**
 * Pronunciation Service for BookReader.
 * HTTP client for TTS and IPA API calls to the Python server.
 */
import { pythonManager } from './python-manager.service';
import type {
  TTSResponse,
  IPAResponse,
  PronunciationServerStatus,
} from '../../shared/types/pronunciation.types';

const TTS_TIMEOUT = 15000; // 15 seconds for TTS (sentences can be long)
const IPA_TIMEOUT = 5000; // 5 seconds for IPA

class PronunciationService {
  /**
   * Generate audio from text using TTS.
   */
  async getTTS(text: string, language: string = 'en'): Promise<TTSResponse> {
    if (!pythonManager.ready) {
      return {
        success: false,
        error: 'Pronunciation server is not ready',
      };
    }

    try {
      const response = await fetch(`${pythonManager.baseUrl}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, language }),
        signal: AbortSignal.timeout(TTS_TIMEOUT),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Server error: ${response.status}`,
        };
      }

      const data = (await response.json()) as TTSResponse;
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PronunciationService] TTS error:', message);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Generate IPA transcription for text.
   */
  async getIPA(text: string, language: string = 'en'): Promise<IPAResponse> {
    if (!pythonManager.ready) {
      return {
        success: false,
        error: 'Pronunciation server is not ready',
      };
    }

    try {
      const response = await fetch(`${pythonManager.baseUrl}/api/ipa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, language }),
        signal: AbortSignal.timeout(IPA_TIMEOUT),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Server error: ${response.status}`,
        };
      }

      const data = (await response.json()) as IPAResponse;
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PronunciationService] IPA error:', message);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Get the server status.
   */
  getServerStatus(): PronunciationServerStatus {
    return pythonManager.getStatus();
  }
}

// Export singleton instance
export const pronunciationService = new PronunciationService();
