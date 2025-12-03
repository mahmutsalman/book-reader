import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { TatoebaSentence, TatoebaStatus } from '../../shared/types';

// Placeholder implementation - Tatoeba integration will be completed in Phase 9
export function registerTatoebaHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.TATOEBA_SEARCH,
    async (_, word: string, language?: string): Promise<TatoebaSentence[]> => {
      // TODO: Implement Tatoeba search
      console.log(`Tatoeba search for "${word}" in ${language || 'en'}`);
      return [];
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TATOEBA_IMPORT_DATA,
    async (_, filePath: string): Promise<{ imported: number }> => {
      // TODO: Implement Tatoeba data import
      console.log(`Importing Tatoeba data from ${filePath}`);
      return { imported: 0 };
    }
  );

  ipcMain.handle(IPC_CHANNELS.TATOEBA_GET_STATUS, async (): Promise<TatoebaStatus> => {
    // TODO: Implement Tatoeba status
    return {
      enabled: false,
      sentenceCount: 0,
      languages: [],
    };
  });
}
