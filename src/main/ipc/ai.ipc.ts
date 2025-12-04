import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { settingsRepository } from '../../database/repositories';
import { LMStudioService } from '../services/lm-studio.service';

let lmService: LMStudioService | null = null;

async function getService(): Promise<LMStudioService> {
  const url = await settingsRepository.get('lm_studio_url');
  const model = await settingsRepository.get('lm_studio_model');

  if (!lmService || lmService.baseUrl !== url) {
    lmService = new LMStudioService(url, model);
  } else if (lmService.model !== model) {
    // Update model if it changed
    lmService.setModel(model);
  }
  return lmService;
}

export function registerAIHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.AI_GET_DEFINITION,
    async (_, word: string, context: string, language = 'en') => {
      try {
        const service = await getService();
        const result = await service.getWordDefinition(word, context, language);
        return {
          word,
          definition: result.definition,
          context,
          wordTranslation: result.wordTranslation,
          wordType: result.wordType,
          germanArticle: result.germanArticle,
        };
      } catch (error) {
        console.error('Failed to get definition:', error);
        return {
          word,
          definition: 'Unable to get definition. Please check your LM Studio connection.',
          context,
        };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.AI_GET_IPA, async (_, word: string, language = 'en') => {
    try {
      const service = await getService();
      const { ipa, syllables } = await service.getIPAPronunciation(word, language);
      return { word, ipa, syllables };
    } catch (error) {
      console.error('Failed to get IPA:', error);
      return { word, ipa: '', syllables: '' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AI_SIMPLIFY_SENTENCE, async (_, sentence: string, language = 'en') => {
    try {
      const service = await getService();
      const result = await service.simplifySentence(sentence, language);
      return {
        original: sentence,
        simplified: result.simplified,
        sentenceTranslation: result.sentenceTranslation,
        simplifiedTranslation: result.simplifiedTranslation,
      };
    } catch (error) {
      console.error('Failed to simplify sentence:', error);
      return { original: sentence, simplified: sentence };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.AI_GET_WORD_EQUIVALENT,
    async (_, word: string, originalSentence: string, simplifiedSentence: string) => {
      try {
        const service = await getService();
        const result = await service.getWordEquivalent(word, originalSentence, simplifiedSentence);
        return {
          word,
          equivalent: result.equivalent.trim(),
          needsRegeneration: result.needsRegeneration,
        };
      } catch (error) {
        console.error('Failed to get word equivalent:', error);
        return { word, equivalent: '', needsRegeneration: false };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_RESIMPLIFY_WITH_WORD,
    async (_, originalSentence: string, originalWord: string, equivalentWord: string, language = 'en') => {
      try {
        const service = await getService();
        const simplified = await service.resimplifyWithWord(originalSentence, originalWord, equivalentWord, language);
        return { original: originalSentence, simplified };
      } catch (error) {
        console.error('Failed to resimplify sentence:', error);
        return { original: originalSentence, simplified: originalSentence };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_GET_PHRASE_MEANING,
    async (_, phrase: string, context: string, language = 'en') => {
      console.log('[PHRASE IPC] getPhraseMeaning request:', { phrase, context, language });
      try {
        const service = await getService();
        const result = await service.getPhraseMeaning(phrase, context, language);
        console.log('[PHRASE IPC] getPhraseMeaning response:', { phrase, meaning: result.meaning });
        return {
          phrase,
          meaning: result.meaning,
          context,
          phraseTranslation: result.phraseTranslation,
        };
      } catch (error) {
        console.error('Failed to get phrase meaning:', error);
        return {
          phrase,
          meaning: 'Unable to get phrase meaning. Please check your LM Studio connection.',
          context,
        };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.AI_TEST_CONNECTION, async () => {
    try {
      const service = await getService();
      return service.testConnection();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  });
}
