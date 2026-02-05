import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipc-channels';
import { updateService } from '../services/update.service';
import type {
  UpdateCheckResponse,
  UpdateOpenUrlResponse,
  UpdateSkipVersionResponse,
  UpdatePreferencesResponse,
  UpdateSetPreferenceResponse,
} from '../../shared/types/update.types';

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

  // Open download URL in browser (with URL validation)
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_OPEN_URL,
    async (_event, url: string): Promise<UpdateOpenUrlResponse> => {
      try {
        // Validate URL before passing to service
        const parsed = new URL(url);
        if (!['https:', 'http:'].includes(parsed.protocol)) {
          return { success: false, error: 'Invalid URL protocol' };
        }
        const allowedDomains = ['smartbook.mahmutsalman.cloud', 'github.com'];
        if (!allowedDomains.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
          return { success: false, error: 'URL not from allowed domain' };
        }

        await updateService.openDownloadUrl(url);
        return { success: true };
      } catch (error) {
        console.error('Failed to open download URL:', error);
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
}
