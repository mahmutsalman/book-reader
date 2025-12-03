import { ipcMain, dialog } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';

interface OpenFileOptions {
  filters?: { name: string; extensions: string[] }[];
}

export function registerDialogHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.DIALOG_OPEN_FILE,
    async (_, options: OpenFileOptions): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: options.filters || [
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    }
  );
}
