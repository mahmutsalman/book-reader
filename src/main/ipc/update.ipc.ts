import { ipcMain, autoUpdater, app } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipc-channels';
import { updateService } from '../services/update.service';
import type {
  UpdateCheckResponse,
  UpdateSkipVersionResponse,
  UpdatePreferencesResponse,
  UpdateSetPreferenceResponse,
} from '../../shared/types/update.types';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;

export function registerUpdateHandlers(): void {
  // Check for updates
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_CHECK,
    async (_event, ignoreSkipped?: boolean): Promise<UpdateCheckResponse> => {
      try {
        const result = await updateService.checkForUpdate(ignoreSkipped ?? false);
        return { success: true, result };
      } catch (error) {
        console.error('Update check failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Trigger Squirrel download from renderer (e.g. user manually checks for updates in Settings)
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_TRIGGER_DOWNLOAD,
    async (): Promise<{ success: boolean; error?: string }> => {
      try {
        if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
          return { success: false, error: 'Auto-update not available in dev mode' };
        }
        autoUpdater.checkForUpdates();
        return { success: true };
      } catch (error) {
        console.error('Failed to trigger update download:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Skip a version
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_SKIP_VERSION,
    async (_event, version: string): Promise<UpdateSkipVersionResponse> => {
      try {
        await updateService.skipVersion(version);
        return { success: true };
      } catch (error) {
        console.error('Failed to skip version:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Get update preferences
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_GET_PREFERENCES,
    async (): Promise<UpdatePreferencesResponse> => {
      try {
        const preferences = await updateService.getPreferences();
        return { success: true, preferences };
      } catch (error) {
        console.error('Failed to get update preferences:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Set auto-check enabled
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_SET_AUTO_CHECK,
    async (_event, enabled: boolean): Promise<UpdateSetPreferenceResponse> => {
      try {
        await updateService.setAutoCheckEnabled(enabled);
        return { success: true };
      } catch (error) {
        console.error('Failed to set auto-check preference:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Get current app version
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, (): string => app.getVersion());

  // Install downloaded Squirrel update (Windows + macOS) — quits app and applies update
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_INSTALL,
    async (): Promise<{ success: boolean; error?: string }> => {
      if (process.platform !== 'win32' && process.platform !== 'darwin') {
        return { success: false, error: 'Auto-install is only supported on Windows and macOS' };
      }
      try {
        autoUpdater.quitAndInstall();
        return { success: true };
      } catch (error) {
        console.error('Failed to install update:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
}
