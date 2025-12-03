import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { progressRepository } from '../../database/repositories';
import type { ReadingProgress } from '../../shared/types';

export function registerProgressHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PROGRESS_GET, async (_, bookId: number) => {
    return progressRepository.get(bookId);
  });

  ipcMain.handle(
    IPC_CHANNELS.PROGRESS_UPDATE,
    async (_, bookId: number, data: Partial<ReadingProgress>) => {
      return progressRepository.update(bookId, data);
    }
  );
}
