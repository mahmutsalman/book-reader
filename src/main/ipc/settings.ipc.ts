import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { settingsRepository } from '../../database/repositories';
import type { AppSettings } from '../../shared/types';

export function registerSettingsHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    async <K extends keyof AppSettings>(_, key: K) => {
      return settingsRepository.get(key);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    async <K extends keyof AppSettings>(_, key: K, value: AppSettings[K]) => {
      return settingsRepository.set(key, value);
    }
  );

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async () => {
    return settingsRepository.getAll();
  });
}
