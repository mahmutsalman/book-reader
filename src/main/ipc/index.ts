import { registerBookHandlers } from './book.ipc';
import { registerProgressHandlers } from './progress.ipc';
import { registerVocabularyHandlers } from './vocabulary.ipc';
import { registerSettingsHandlers } from './settings.ipc';
import { registerAIHandlers } from './ai.ipc';
import { registerTatoebaHandlers } from './tatoeba.ipc';
import { registerDialogHandlers } from './dialog.ipc';
import { registerPronunciationHandlers } from './pronunciation.ipc';
import { registerPreStudyHandlers } from './pre-study.ipc';

export function registerAllIpcHandlers(): void {
  registerBookHandlers();
  registerProgressHandlers();
  registerVocabularyHandlers();
  registerSettingsHandlers();
  registerAIHandlers();
  registerTatoebaHandlers();
  registerDialogHandlers();
  registerPronunciationHandlers();
  registerPreStudyHandlers();
}
