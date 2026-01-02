/**
 * Secure Credential Storage
 *
 * Encrypts API keys using OS-native credential storage:
 * - macOS: Keychain
 * - Windows: Credential Manager (DPAPI)
 * - Linux: libsecret
 *
 * Falls back to plaintext in development mode (unpackaged app).
 */

import { safeStorage } from 'electron';
import { settingsRepository } from '../../database/repositories';

class SecureCredentialStore {
  /**
   * Check if OS-level encryption is available.
   * Returns false in dev mode (unpackaged app).
   */
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Get decrypted credential from storage.
   *
   * @param key - The credential key (e.g., 'groq_api_key')
   * @returns The decrypted credential value, or empty string if not found
   */
  async get(key: string): Promise<string> {
    const encrypted = await settingsRepository.get(key);
    if (!encrypted) return '';

    if (this.isAvailable()) {
      try {
        const buffer = Buffer.from(encrypted, 'base64');
        return safeStorage.decryptString(buffer);
      } catch (error) {
        // If decryption fails, the value might be plaintext from dev mode
        // Try to use it as plaintext and re-encrypt it for future use
        console.warn(`[Security] Detected plaintext ${key}, re-encrypting...`);
        try {
          // Re-encrypt the plaintext value
          await this.set(key, encrypted);
          return encrypted;
        } catch (reencryptError) {
          console.error(`[Security] Failed to re-encrypt ${key}:`, reencryptError);
          return '';
        }
      }
    }

    // Dev mode fallback (unpackaged app)
    console.warn(`[Security] OS encryption unavailable, using plaintext for ${key}`);
    return encrypted;
  }

  /**
   * Encrypt and store credential.
   *
   * @param key - The credential key (e.g., 'groq_api_key')
   * @param value - The credential value to encrypt and store
   */
  async set(key: string, value: string): Promise<void> {
    if (this.isAvailable()) {
      try {
        const encrypted = safeStorage.encryptString(value);
        await settingsRepository.set(key, encrypted.toString('base64'));
      } catch (error) {
        console.error(`[Security] Failed to encrypt ${key}:`, error);
        throw error;
      }
    } else {
      // Dev mode fallback
      console.warn(`[Security] OS encryption unavailable, storing ${key} as plaintext`);
      await settingsRepository.set(key, value);
    }
  }

  /**
   * Remove credential from storage.
   *
   * @param key - The credential key to remove
   */
  async remove(key: string): Promise<void> {
    await settingsRepository.set(key, '');
  }
}

/**
 * Singleton instance of the secure credential store.
 * Use this for all credential operations.
 */
export const credentialStore = new SecureCredentialStore();
