import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { getAIService, getLMStudioService, getGroqService } from '../services/ai-provider.factory';

export function registerAIHandlers(): void {
  // Get word definition - uses selected AI provider
  ipcMain.handle(
    IPC_CHANNELS.AI_GET_DEFINITION,
    async (_, word: string, context: string, language = 'en') => {
      try {
        const service = await getAIService();
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
          definition: error instanceof Error ? error.message : 'Unable to get definition. Please check your AI connection.',
          context,
        };
      }
    }
  );

  // Get IPA pronunciation - uses selected AI provider
  ipcMain.handle(IPC_CHANNELS.AI_GET_IPA, async (_, word: string, language = 'en') => {
    try {
      const service = await getAIService();
      const { ipa, syllables } = await service.getIPAPronunciation(word, language);
      return { word, ipa, syllables };
    } catch (error) {
      console.error('Failed to get IPA:', error);
      return { word, ipa: '', syllables: '' };
    }
  });

  // Get batch IPA pronunciation - uses selected AI provider
  ipcMain.handle(IPC_CHANNELS.AI_GET_BATCH_IPA, async (_, words: string[], language = 'en') => {
    try {
      const service = await getAIService();
      const results = await service.getBatchIPAPronunciation(words, language);
      return { words: results };
    } catch (error) {
      console.error('Failed to get batch IPA:', error);
      return { words: words.map(word => ({ word, ipa: '', syllables: '' })) };
    }
  });

  // Simplify sentence - uses selected AI provider
  ipcMain.handle(IPC_CHANNELS.AI_SIMPLIFY_SENTENCE, async (_, sentence: string, language = 'en') => {
    try {
      const service = await getAIService();
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

  // Get word equivalent in simplified sentence - uses selected AI provider
  ipcMain.handle(
    IPC_CHANNELS.AI_GET_WORD_EQUIVALENT,
    async (_, word: string, originalSentence: string, simplifiedSentence: string) => {
      try {
        const service = await getAIService();
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

  // Re-simplify sentence with specific word - uses selected AI provider
  ipcMain.handle(
    IPC_CHANNELS.AI_RESIMPLIFY_WITH_WORD,
    async (_, originalSentence: string, originalWord: string, equivalentWord: string, language = 'en') => {
      try {
        const service = await getAIService();
        const simplified = await service.resimplifyWithWord(originalSentence, originalWord, equivalentWord, language);
        return { original: originalSentence, simplified };
      } catch (error) {
        console.error('Failed to resimplify sentence:', error);
        return { original: originalSentence, simplified: originalSentence };
      }
    }
  );

  // Get phrase meaning - uses selected AI provider
  ipcMain.handle(
    IPC_CHANNELS.AI_GET_PHRASE_MEANING,
    async (_, phrase: string, context: string, language = 'en') => {
      console.log('[PHRASE IPC] getPhraseMeaning request:', { phrase, context, language });
      try {
        const service = await getAIService();
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
          meaning: error instanceof Error ? error.message : 'Unable to get phrase meaning. Please check your AI connection.',
          context,
        };
      }
    }
  );

  // Test LM Studio connection (always tests LM Studio, regardless of selected provider)
  ipcMain.handle(IPC_CHANNELS.AI_TEST_CONNECTION, async () => {
    try {
      const service = await getLMStudioService();
      return service.testConnection();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  });

  // Test Groq connection (always tests Groq, regardless of selected provider)
  ipcMain.handle(IPC_CHANNELS.AI_TEST_GROQ_CONNECTION, async () => {
    try {
      const service = await getGroqService();
      return service.testConnection();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  });
}
