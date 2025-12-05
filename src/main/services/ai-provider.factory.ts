/**
 * AI Provider Factory
 * Single point of control for selecting the appropriate AI service.
 * When user selects Groq, ALL AI operations automatically use Groq.
 * When user selects Local, ALL AI operations use LM Studio.
 */

import type { AIServiceInterface } from './ai-service.interface';
import { LMStudioService } from './lm-studio.service';
import { GroqService } from './groq.service';
import { settingsRepository } from '../../database/repositories';

// Cached service instances
let lmService: LMStudioService | null = null;
let groqService: GroqService | null = null;

/**
 * Get the appropriate AI service based on user settings.
 * This factory routes ALL AI calls to the selected provider.
 */
export async function getAIService(): Promise<AIServiceInterface> {
  const provider = await settingsRepository.get('ai_provider');

  if (provider === 'groq') {
    const apiKey = await settingsRepository.get('groq_api_key');
    const model = await settingsRepository.get('groq_model');

    if (!groqService) {
      groqService = new GroqService(apiKey, model);
    } else {
      // Update credentials if they changed
      groqService.setApiKey(apiKey);
      if (groqService.model !== model) {
        groqService.setModel(model);
      }
    }
    return groqService;
  }

  // Default to LM Studio (local AI)
  const url = await settingsRepository.get('lm_studio_url');
  const model = await settingsRepository.get('lm_studio_model');

  if (!lmService || lmService.baseUrl !== url) {
    lmService = new LMStudioService(url, model);
  } else if (lmService.model !== model) {
    lmService.setModel(model);
  }

  return lmService;
}

/**
 * Check if enhanced mode is enabled (Groq is selected).
 * Enhanced mode generates richer content with example sentences and grammar explanations.
 */
export async function isEnhancedModeEnabled(): Promise<boolean> {
  const provider = await settingsRepository.get('ai_provider');
  return provider === 'groq';
}

/**
 * Get the LM Studio service directly (for test connection).
 * This bypasses the factory and always returns LM Studio.
 */
export async function getLMStudioService(): Promise<LMStudioService> {
  const url = await settingsRepository.get('lm_studio_url');
  const model = await settingsRepository.get('lm_studio_model');

  if (!lmService || lmService.baseUrl !== url) {
    lmService = new LMStudioService(url, model);
  } else if (lmService.model !== model) {
    lmService.setModel(model);
  }

  return lmService;
}

/**
 * Get the Groq service directly (for test connection).
 * This bypasses the factory and always returns Groq.
 */
export async function getGroqService(): Promise<GroqService> {
  const apiKey = await settingsRepository.get('groq_api_key');
  const model = await settingsRepository.get('groq_model');

  if (!groqService) {
    groqService = new GroqService(apiKey, model);
  } else {
    groqService.setApiKey(apiKey);
    if (groqService.model !== model) {
      groqService.setModel(model);
    }
  }

  return groqService;
}

/**
 * Clear cached service instances.
 * Useful when settings change and you want fresh instances.
 */
export function clearServiceCache(): void {
  lmService = null;
  groqService = null;
}
