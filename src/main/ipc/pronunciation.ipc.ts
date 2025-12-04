/**
 * IPC handlers for pronunciation services.
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipc-channels';
import { pronunciationService } from '../services/pronunciation.service';

export function registerPronunciationHandlers(): void {
  // Get TTS audio
  ipcMain.handle(
    IPC_CHANNELS.PRONUNCIATION_GET_TTS,
    async (_, text: string, language: string = 'en') => {
      return pronunciationService.getTTS(text, language);
    }
  );

  // Get IPA transcription
  ipcMain.handle(
    IPC_CHANNELS.PRONUNCIATION_GET_IPA,
    async (_, text: string, language: string = 'en') => {
      return pronunciationService.getIPA(text, language);
    }
  );

  // Get server status
  ipcMain.handle(IPC_CHANNELS.PRONUNCIATION_SERVER_STATUS, async () => {
    return pronunciationService.getServerStatus();
  });

  // Get available IPA languages
  ipcMain.handle(IPC_CHANNELS.PRONUNCIATION_GET_IPA_LANGUAGES, async () => {
    return pronunciationService.getIPALanguages();
  });

  // Install IPA language package
  ipcMain.handle(
    IPC_CHANNELS.PRONUNCIATION_INSTALL_IPA_LANGUAGE,
    async (_, language: string) => {
      return pronunciationService.installIPALanguage(language);
    }
  );
}
