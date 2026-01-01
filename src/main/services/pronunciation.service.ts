/**
 * Pronunciation Service for BookReader.
 * HTTP client for TTS and IPA API calls to the Python server.
 */
import { pythonManager } from './python-manager.service';
import type {
  TTSResponse,
  IPAResponse,
  PronunciationServerStatus,
  IPALanguagesResponse,
  InstallLanguageResponse,
  VoiceModelsResponse,
  DownloadModelResponse,
  DeleteModelResponse,
} from '../../shared/types/pronunciation.types';

const TTS_TIMEOUT = 15000; // 15 seconds for TTS (sentences can be long)
const IPA_TIMEOUT = 5000; // 5 seconds for IPA

class PronunciationService {
  /**
   * Generate audio from text using TTS.
   */
  async getTTS(text: string, language = 'en'): Promise<TTSResponse> {
    if (!pythonManager.ready) {
      console.error('[PronunciationService] Server not ready');
      return {
        success: false,
        error: 'Pronunciation server is not ready. Please wait for server to start.',
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
        const errorBody = await response.text();
        console.error('[PronunciationService] HTTP error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
          url: `${pythonManager.baseUrl}/api/tts`
        });
        return {
          success: false,
          error: `Server error ${response.status}: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as TTSResponse;
      return data;
    } catch (error: unknown) {
      console.error('[PronunciationService] getTTS error:', {
        error,
        text: text.substring(0, 50),
        language,
        url: `${pythonManager.baseUrl}/api/tts`
      });
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Generate IPA transcription for text.
   */
  async getIPA(text: string, language = 'en'): Promise<IPAResponse> {
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

  /**
   * Get list of available IPA languages and their installation status.
   */
  async getIPALanguages(): Promise<IPALanguagesResponse> {
    if (!pythonManager.ready) {
      return {
        success: false,
        languages: [],
        error: 'Pronunciation server is not ready',
      };
    }

    try {
      const response = await fetch(`${pythonManager.baseUrl}/api/ipa/languages`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          success: false,
          languages: [],
          error: `Server error: ${response.status}`,
        };
      }

      return (await response.json()) as IPALanguagesResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PronunciationService] getIPALanguages error:', message);
      return {
        success: false,
        languages: [],
        error: message,
      };
    }
  }

  /**
   * Install a gruut language package for IPA support.
   */
  async installIPALanguage(language: string): Promise<InstallLanguageResponse> {
    if (!pythonManager.ready) {
      return {
        success: false,
        message: 'Pronunciation server is not ready',
        error: 'Server not ready',
      };
    }

    try {
      const response = await fetch(`${pythonManager.baseUrl}/api/ipa/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language }),
        signal: AbortSignal.timeout(180000), // 3 minutes for installation
      });

      if (!response.ok) {
        return {
          success: false,
          message: 'Installation failed',
          error: `Server error: ${response.status}`,
        };
      }

      return (await response.json()) as InstallLanguageResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PronunciationService] installIPALanguage error:', message);
      return {
        success: false,
        message: 'Installation failed',
        error: message,
      };
    }
  }

  /**
   * Get list of available voice models and their download status.
   */
  async getVoiceModels(): Promise<VoiceModelsResponse> {
    if (!pythonManager.ready) {
      return {
        success: false,
        models: [],
        models_directory: '',
        error: 'Pronunciation server is not ready',
      };
    }

    try {
      const response = await fetch(`${pythonManager.baseUrl}/api/voice/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          success: false,
          models: [],
          models_directory: '',
          error: `Server error: ${response.status}`,
        };
      }

      return (await response.json()) as VoiceModelsResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PronunciationService] getVoiceModels error:', message);
      return {
        success: false,
        models: [],
        models_directory: '',
        error: message,
      };
    }
  }

  /**
   * Download a voice model from HuggingFace.
   */
  async downloadVoiceModel(language: string): Promise<DownloadModelResponse> {
    if (!pythonManager.ready) {
      return {
        success: false,
        message: 'Pronunciation server is not ready',
        error: 'Server not ready',
      };
    }

    try {
      console.log(`[PronunciationService] Downloading voice model: ${language}`);
      const response = await fetch(`${pythonManager.baseUrl}/api/voice/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language }),
        signal: AbortSignal.timeout(300000), // 5 minutes for download
      });

      if (!response.ok) {
        return {
          success: false,
          message: 'Download failed',
          error: `Server error: ${response.status}`,
        };
      }

      const result = (await response.json()) as DownloadModelResponse;
      console.log(`[PronunciationService] Download result:`, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PronunciationService] downloadVoiceModel error:', message);
      return {
        success: false,
        message: 'Download failed',
        error: message,
      };
    }
  }

  /**
   * Delete a downloaded voice model.
   */
  async deleteVoiceModel(language: string): Promise<DeleteModelResponse> {
    if (!pythonManager.ready) {
      return {
        success: false,
        message: 'Pronunciation server is not ready',
        error: 'Server not ready',
      };
    }

    try {
      const response = await fetch(`${pythonManager.baseUrl}/api/voice/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          success: false,
          message: 'Delete failed',
          error: `Server error: ${response.status}`,
        };
      }

      return (await response.json()) as DeleteModelResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PronunciationService] deleteVoiceModel error:', message);
      return {
        success: false,
        message: 'Delete failed',
        error: message,
      };
    }
  }
}

// Export singleton instance
export const pronunciationService = new PronunciationService();
