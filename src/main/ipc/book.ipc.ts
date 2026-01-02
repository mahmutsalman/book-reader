import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { bookRepository } from '../../database/repositories';
import { pdfImportService } from '../services/pdf-import.service';
import { txtImportService } from '../services/txt-import.service';
import { epubImportService } from '../services/epub-import.service';
import { mangaImportService } from '../services/manga-import.service';
import type { BookLanguage } from '../../shared/types';

export function registerBookHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.BOOK_IMPORT, async (_, filePath: string, language: BookLanguage = 'en') => {
    return bookRepository.import(filePath, language);
  });

  // PDF Import handlers
  ipcMain.handle(IPC_CHANNELS.BOOK_IMPORT_PDF, async (_, pdfPath: string, language: BookLanguage = 'en', useOcr = true) => {
    return pdfImportService.importPdf(pdfPath, language, useOcr);
  });

  ipcMain.handle(IPC_CHANNELS.BOOK_PDF_STATUS, async () => {
    return pdfImportService.checkStatus();
  });

  // TXT Import handler
  ipcMain.handle(IPC_CHANNELS.BOOK_IMPORT_TXT, async (_, txtPath: string, language: BookLanguage = 'en') => {
    return txtImportService.importTxt(txtPath, language);
  });

  // EPUB Import handler
  ipcMain.handle(IPC_CHANNELS.BOOK_IMPORT_EPUB, async (_, epubPath: string, language: BookLanguage = 'en') => {
    return epubImportService.importEpub(epubPath, language);
  });

  // Manga/Comic Import handler
  ipcMain.handle(IPC_CHANNELS.BOOK_IMPORT_MANGA, async (_, mangaPath: string, language: BookLanguage = 'en') => {
    return mangaImportService.importManga(mangaPath, language);
  });

  // PNG Test Import handler
  ipcMain.handle(IPC_CHANNELS.BOOK_IMPORT_PNG, async (_, pngPath: string, language: BookLanguage = 'en') => {
    return mangaImportService.importPng(pngPath, language);
  });

  // Get manga image as data URL
  ipcMain.handle(IPC_CHANNELS.BOOK_GET_MANGA_IMAGE_PATH, async (_, relativePath: string) => {
    const { app } = require('electron');
    const path = require('path');
    const fs = require('fs');

    const absolutePath = path.join(app.getPath('userData'), relativePath);

    try {
      // Read the image file
      const imageBuffer = fs.readFileSync(absolutePath);

      // Determine MIME type based on extension
      const ext = path.extname(absolutePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png'
                     : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                     : ext === '.webp' ? 'image/webp'
                     : 'image/png';

      // Convert to base64 data URL
      const base64 = imageBuffer.toString('base64');
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error('Failed to load manga image:', error);
      throw error;
    }
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
