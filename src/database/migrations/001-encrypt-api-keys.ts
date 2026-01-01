/**
 * Migration: Encrypt API Keys
 *
 * Migrates existing API keys from plaintext database storage to encrypted
 * OS-native credential storage (Keychain/Credential Manager/libsecret).
 *
 * This migration runs once on app startup and is idempotent (safe to run multiple times).
 */

import { credentialStore } from '../../main/utils/credential-storage';
import { settingsRepository } from '../repositories';

/**
 * Migrate existing API keys from plaintext DB to encrypted credential store.
 *
 * Process:
 * 1. Check if migration already completed
 * 2. Read existing API keys from database
 * 3. Move them to encrypted credential store
 * 4. Clear from database (security)
 * 5. Mark migration as complete
 */
export async function migrateAPIKeysToSecureStorage(): Promise<void> {
  const migrated = await settingsRepository.get('api_keys_migrated');
  if (migrated === 'true') {
    console.log('[Migration] API keys already migrated to secure storage');
    return;
  }

  console.log('[Migration] Starting API key encryption migration...');

  try {
    // Migrate Groq API key (existing provider)
    const groqKey = await settingsRepository.get('groq_api_key');
    if (groqKey && groqKey.length > 0) {
      console.log('[Migration] Migrating Groq API key...');
      await credentialStore.set('groq_api_key', groqKey);
      await settingsRepository.set('groq_api_key', ''); // Clear from DB
      console.log('[Migration] ✓ Groq API key encrypted and removed from database');
    }

    // Note: OpenRouter, Mistral, and Google AI keys will be added directly
    // to credential store when users configure them, so no migration needed.

    // Mark migration as complete
    await settingsRepository.set('api_keys_migrated', 'true');
    console.log('[Migration] ✓ API key encryption migration complete');
  } catch (error) {
    console.error('[Migration] ✗ Failed to migrate API keys:', error);
    // Don't throw - allow app to start even if migration fails
    // User can re-enter their API key in settings
  }
}
