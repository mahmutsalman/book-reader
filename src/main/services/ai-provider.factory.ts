/**
 * AI Provider Factory
 * Single point of control for selecting the appropriate AI service.
 * When user selects Groq, ALL AI operations automatically use Groq.
 * When user selects Local, ALL AI operations use LM Studio.
 */

import type { AIServiceInterface } from './ai-service.interface';
import { LMStudioService } from './lm-studio.service';
import { GroqService } from './groq.service';
import { OpenRouterService } from './openrouter.service';
import { MistralService } from './mistral.service';
import { GoogleAIService } from './google-ai.service';
import { settingsRepository } from '../../database/repositories';
import { credentialStore } from '../utils/credential-storage';

// Cached service instances
let lmService: LMStudioService | null = null;
let groqService: GroqService | null = null;
let openrouterService: OpenRouterService | null = null;
let mistralService: MistralService | null = null;
let googleAIService: GoogleAIService | null = null;

/**
 * Get the appropriate AI service based on user settings.
 * This factory routes ALL AI calls to the selected provider.
 */
export async function getAIService(): Promise<AIServiceInterface> {
  const provider = await settingsRepository.get('ai_provider');

  if (provider === 'groq') {
    const apiKey = await credentialStore.get('groq_api_key');
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

  if (provider === 'openrouter') {
    const apiKey = await credentialStore.get('openrouter_api_key');
    const model = await settingsRepository.get('openrouter_model');

    if (!openrouterService) {
      openrouterService = new OpenRouterService(apiKey, model);
    } else {
      // Update credentials if they changed
      openrouterService.setApiKey(apiKey);
      if (openrouterService.model !== model) {
        openrouterService.setModel(model);
      }
    }
    return openrouterService;
  }

  if (provider === 'mistral') {
    const apiKey = await credentialStore.get('mistral_api_key');
    const model = await settingsRepository.get('mistral_model');

    if (!mistralService) {
      mistralService = new MistralService(apiKey, model);
    } else {
      // Update credentials if they changed
      mistralService.setApiKey(apiKey);
      if (mistralService.model !== model) {
        mistralService.setModel(model);
      }
    }
    return mistralService;
  }

  if (provider === 'google-ai') {
    const apiKey = await credentialStore.get('google_api_key');
    const model = await settingsRepository.get('google_model');

    if (!googleAIService) {
      googleAIService = new GoogleAIService(apiKey, model);
    } else {
      // Update credentials if they changed
      googleAIService.setApiKey(apiKey);
      if (googleAIService.model !== model) {
        googleAIService.setModel(model);
      }
    }
    return googleAIService;
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
  const apiKey = await credentialStore.get('groq_api_key');
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
 * Get the OpenRouter service directly (for test connection).
 * This bypasses the factory and always returns OpenRouter.
 */
export async function getOpenRouterService(): Promise<OpenRouterService> {
  const apiKey = await credentialStore.get('openrouter_api_key');
  const model = await settingsRepository.get('openrouter_model');

  if (!openrouterService) {
    openrouterService = new OpenRouterService(apiKey, model);
  } else {
    openrouterService.setApiKey(apiKey);
    if (openrouterService.model !== model) {
      openrouterService.setModel(model);
    }
  }

  return openrouterService;
}

/**
 * Get the Mistral service directly (for test connection).
 * This bypasses the factory and always returns Mistral.
 */
export async function getMistralService(): Promise<MistralService> {
  const apiKey = await credentialStore.get('mistral_api_key');
  const model = await settingsRepository.get('mistral_model');

  if (!mistralService) {
    mistralService = new MistralService(apiKey, model);
  } else {
    mistralService.setApiKey(apiKey);
    if (mistralService.model !== model) {
      mistralService.setModel(model);
    }
  }

  return mistralService;
}

/**
 * Get the Google AI service directly (for test connection).
 * This bypasses the factory and always returns Google AI.
 */
export async function getGoogleAIService(): Promise<GoogleAIService> {
  const apiKey = await credentialStore.get('google_api_key');
  const model = await settingsRepository.get('google_model');

  if (!googleAIService) {
    googleAIService = new GoogleAIService(apiKey, model);
  } else {
    googleAIService.setApiKey(apiKey);
    if (googleAIService.model !== model) {
      googleAIService.setModel(model);
    }
  }

  return googleAIService;
}

/**
 * Clear cached service instances.
 * Useful when settings change and you want fresh instances.
 */
export function clearServiceCache(): void {
  lmService = null;
  groqService = null;
  openrouterService = null;
  mistralService = null;
  googleAIService = null;
}
