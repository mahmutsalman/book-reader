import { ipcMain, dialog } from 'electron';
import * as fs from 'fs';
import { IPC_CHANNELS } from '../../shared/constants';
import { vocabularyRepository } from '../../database/repositories';
import type { CreateVocabularyEntry, VocabularyEntry, VocabularyFilters } from '../../shared/types';

// Export types
type ExportType = 'words-only' | 'words-context' | 'short-meaning';

interface ExportEntry {
  word: string;
  sentence?: string;
  shortDefinition?: string;
}

interface ExportRequest {
  exportType: ExportType;
  entries: ExportEntry[];
}

// Format entries for export
function formatExport(exportType: ExportType, entries: ExportEntry[]): string {
  if (exportType === 'words-only') {
    return entries.map(e => e.word).join('\n');
  } else if (exportType === 'short-meaning') {
    // short-meaning: colon-separated
    return entries.map(e => {
      const shortDef = e.shortDefinition || '';
      return `${e.word}: ${shortDef}`;
    }).join('\n');
  } else {
    // words-context: TAB-separated, sanitize newlines in sentences
    return entries.map(e => {
      const sanitizedSentence = (e.sentence || '')
        .replace(/[\r\n]+/g, ' ')  // Replace newlines with space
        .replace(/\s+/g, ' ')       // Collapse multiple spaces
        .trim();
      return `${e.word}\t${sanitizedSentence}`;
    }).join('\n');
  }
}

export function registerVocabularyHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.VOCABULARY_ADD,
    async (_, entry: CreateVocabularyEntry) => {
      return vocabularyRepository.add(entry);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.VOCABULARY_GET_ALL,
    async (_, filters?: VocabularyFilters) => {
      return vocabularyRepository.getAll(filters);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.VOCABULARY_GET_COUNTS,
    async (_, bookId?: number) => {
      return vocabularyRepository.getCountsByType(bookId);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.VOCABULARY_UPDATE,
    async (_, id: number, data: Partial<VocabularyEntry>) => {
      return vocabularyRepository.update(id, data);
    }
  );

  ipcMain.handle(IPC_CHANNELS.VOCABULARY_DELETE, async (_, id: number) => {
    return vocabularyRepository.delete(id);
  });

  ipcMain.handle(
    IPC_CHANNELS.VOCABULARY_GET_OCCURRENCES,
    async (_, vocabularyId: number) => {
      return vocabularyRepository.getOccurrences(vocabularyId);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.VOCABULARY_ADD_OCCURRENCE,
    async (_, vocabularyId: number, bookId: number, pageNumber: number, sentence: string) => {
      return vocabularyRepository.addOccurrence(vocabularyId, bookId, pageNumber, sentence);
    }
  );

  // Export vocabulary to file
  ipcMain.handle(
    IPC_CHANNELS.VOCABULARY_EXPORT,
    async (_, request: ExportRequest) => {
      const { exportType, entries } = request;

      const result = await dialog.showSaveDialog({
        title: 'Export Vocabulary',
        defaultPath: `vocabulary-${Date.now()}.txt`,
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, cancelled: true };
      }

      try {
        const content = formatExport(exportType, entries);
        fs.writeFileSync(result.filePath, content, 'utf-8');
        return { success: true, filePath: result.filePath };
      } catch (error) {
        console.error('Failed to export vocabulary:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Export failed' };
      }
    }
  );
}
