import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { getPreStudyNotesService } from '../services/pre-study-notes.service';
import { preStudyHtmlService } from '../services/pre-study-html.service';
import { windowManagerService } from '../services/window-manager.service';
import type { PreStudyNotesRequest } from '../../shared/types/pre-study-notes.types';

export function registerPreStudyHandlers(): void {
  // Generate pre-study notes
  ipcMain.handle(
    IPC_CHANNELS.PRE_STUDY_GENERATE_NOTES,
    async (event, request: PreStudyNotesRequest) => {
      console.log('[PreStudy IPC] Generate notes request:', {
        bookTitle: request.bookTitle,
        language: request.language,
        viewRange: `${request.startViewIndex}-${request.endViewIndex}`,
        textLength: request.textContent.length,
      });

      try {
        const service = getPreStudyNotesService();

        // Generate notes with progress reporting
        const result = await service.generateNotes(request, (progress) => {
          // Send progress updates to the renderer
          const window = BrowserWindow.fromWebContents(event.sender);
          if (window && !window.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.PRE_STUDY_PROGRESS, progress);
          }
        });

        console.log('[PreStudy IPC] Notes generated:', {
          entries: result.entries.length,
          uniqueWords: result.uniqueWords,
        });

        // Generate HTML
        const html = preStudyHtmlService.generateHtml(result);

        // Open in new window
        windowManagerService.openHtmlWindow(html, `Pre-Study Notes - ${result.bookTitle}`);

        return result;
      } catch (error) {
        console.error('[PreStudy IPC] Error generating notes:', error);
        throw error;
      }
    }
  );

  // Cancel generation
  ipcMain.handle(IPC_CHANNELS.PRE_STUDY_CANCEL, async () => {
    const service = getPreStudyNotesService();
    service.cancel();
    return { cancelled: true };
  });

  // Open HTML window (generic)
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_OPEN_HTML,
    async (_, htmlContent: string, title: string) => {
      windowManagerService.openHtmlWindow(htmlContent, title);
      return { success: true };
    }
  );
}
