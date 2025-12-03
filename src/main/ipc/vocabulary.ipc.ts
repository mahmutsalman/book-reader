import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { vocabularyRepository } from '../../database/repositories';
import type { CreateVocabularyEntry, VocabularyEntry, VocabularyFilters } from '../../shared/types';

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
}
