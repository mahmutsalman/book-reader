import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { settingsRepository } from '../../database/repositories';
import { credentialStore } from '../utils/credential-storage';
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
      // Route API keys to secure credential store
      const apiKeyFields: (keyof AppSettings)[] = [
        'groq_api_key',
        'openrouter_api_key',
        'mistral_api_key',
        'google_api_key',
      ];

      if (apiKeyFields.includes(key)) {
        await credentialStore.set(key as string, value as string);
        return;
      }

      // Normal settings go to database
      return settingsRepository.set(key, value);
    }
  );

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async () => {
    const settings = await settingsRepository.getAll();

    // Merge API keys from secure credential store
    settings.groq_api_key = await credentialStore.get('groq_api_key');
    settings.openrouter_api_key = await credentialStore.get('openrouter_api_key');
    settings.mistral_api_key = await credentialStore.get('mistral_api_key');
    settings.google_api_key = await credentialStore.get('google_api_key');

    return settings;
  });
}
