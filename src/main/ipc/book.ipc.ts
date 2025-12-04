import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { bookRepository } from '../../database/repositories';
import type { BookLanguage } from '../../shared/types';

export function registerBookHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.BOOK_IMPORT, async (_, filePath: string, language: BookLanguage = 'en') => {
    return bookRepository.import(filePath, language);
  });

  ipcMain.handle(IPC_CHANNELS.BOOK_GET_ALL, async () => {
    return bookRepository.getAll();
  });

  ipcMain.handle(IPC_CHANNELS.BOOK_GET_BY_ID, async (_, id: number) => {
    return bookRepository.getById(id);
  });

  ipcMain.handle(IPC_CHANNELS.BOOK_DELETE, async (_, id: number) => {
    return bookRepository.delete(id);
  });

  ipcMain.handle(IPC_CHANNELS.BOOK_GET_PAGE, async (_, bookId: number, pageNum: number) => {
    return bookRepository.getPage(bookId, pageNum);
  });

  ipcMain.handle(IPC_CHANNELS.BOOK_GET_DATA, async (_, bookId: number) => {
    return bookRepository.getData(bookId);
  });

  ipcMain.handle(IPC_CHANNELS.BOOK_SEARCH_WORD, async (_, bookId: number, word: string) => {
    return bookRepository.searchWord(bookId, word);
  });
}
