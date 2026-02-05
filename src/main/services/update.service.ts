import { app, shell } from 'electron';
import * as https from 'https';
import * as http from 'http';
import type {
  UpdateManifest,
  UpdateCheckResult,
  UpdatePreferences,
} from '../../shared/types/update.types';
import { settingsRepository } from '../../database/repositories/settings.repository';

// Update server configuration
const UPDATE_SERVER_URL = 'https://smartbook.mahmutsalman.cloud';
const MANIFEST_PATH = '/releases/latest.json';

/**
 * Compare semantic versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const clean = v.replace(/^v/, '');
    const parts = clean.split('.').map(p => parseInt(p, 10) || 0);
    return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
  };

  const vA = parseVersion(a);
  const vB = parseVersion(b);

  if (vA.major !== vB.major) return vA.major > vB.major ? 1 : -1;
  if (vA.minor !== vB.minor) return vA.minor > vB.minor ? 1 : -1;
  if (vA.patch !== vB.patch) return vA.patch > vB.patch ? 1 : -1;
  return 0;
}

/**
 * Fetch JSON from URL with redirect limit
 */
async function fetchJson<T>(url: string, maxRedirects = 5): Promise<T> {
  if (maxRedirects <= 0) {
    throw new Error('Too many redirects');
  }

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': `SmartBook/${app.getVersion()}`,
        'Accept': 'application/json',
      },
    }, (response) => {
      // Handle redirects with bounded recursion
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        fetchJson<T>(response.headers.location, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch (e) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

/**
 * Get the platform key for the current system
 */
function getPlatformKey(): keyof UpdateManifest['platforms'] | null {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32' && arch === 'x64') {
    return 'win32-x64';
  } else if (platform === 'darwin' && arch === 'arm64') {
    return 'darwin-arm64';
  } else if (platform === 'darwin' && arch === 'x64') {
    return 'darwin-x64';
  }

  return null;
}

// Allowed domains for external URL opening
const ALLOWED_DOWNLOAD_DOMAINS = ['smartbook.mahmutsalman.cloud', 'github.com'];

/**
 * Validate URL for external opening
 */
function validateExternalUrl(url: string): void {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Invalid URL protocol');
  }
  if (!ALLOWED_DOWNLOAD_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
    throw new Error('URL not from allowed domain');
  }
}

/**
 * Update Service - handles checking for updates and managing preferences
 */
class UpdateService {
  private preferences: UpdatePreferences = {
    autoCheckEnabled: true,
    skippedVersions: [],
  };

  private preferencesLoaded = false;
  private loadingPromise: Promise<void> | null = null;

  /**
   * Load update preferences from settings (with race condition prevention)
   */
  async loadPreferences(): Promise<void> {
    if (this.preferencesLoaded) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        const stored = await settingsRepository.get('update_preferences');
        if (stored) {
          this.preferences = JSON.parse(stored as string);
        }
      } catch (error) {
        console.warn('Failed to load update preferences:', error);
      }
      this.preferencesLoaded = true;
    })();

    return this.loadingPromise;
  }

  /**
   * Save update preferences to settings
   */
  private async savePreferences(): Promise<void> {
    try {
      await settingsRepository.set('update_preferences', JSON.stringify(this.preferences));
    } catch (error) {
      console.error('Failed to save update preferences:', error);
    }
  }

  /**
   * Get current update preferences
   */
  async getPreferences(): Promise<UpdatePreferences> {
    await this.loadPreferences();
    return { ...this.preferences };
  }

  /**
   * Set auto-check enabled
   */
  async setAutoCheckEnabled(enabled: boolean): Promise<void> {
    await this.loadPreferences();
    this.preferences.autoCheckEnabled = enabled;
    await this.savePreferences();
  }

  /**
   * Skip a specific version
   */
  async skipVersion(version: string): Promise<void> {
    await this.loadPreferences();
    if (!this.preferences.skippedVersions.includes(version)) {
      this.preferences.skippedVersions.push(version);
      await this.savePreferences();
    }
  }

  /**
   * Check if a version has been skipped
   */
  async isVersionSkipped(version: string): Promise<boolean> {
    await this.loadPreferences();
    return this.preferences.skippedVersions.includes(version);
  }

  /**
   * Check for updates
   */
  async checkForUpdate(ignoreSkipped = false): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion();

    try {
      // Fetch the update manifest
      const manifestUrl = `${UPDATE_SERVER_URL}${MANIFEST_PATH}`;
      console.log(`Checking for updates at: ${manifestUrl}`);

      const manifest = await fetchJson<UpdateManifest>(manifestUrl);

      if (!manifest.version) {
        throw new Error('Invalid manifest: missing version');
      }

      const latestVersion = manifest.version;

      // Check if update is available
      const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;

      // Check if this version was skipped
      if (updateAvailable && !ignoreSkipped) {
        const skipped = await this.isVersionSkipped(latestVersion);
        if (skipped) {
          console.log(`Version ${latestVersion} was skipped by user`);
          return {
            updateAvailable: false,
            currentVersion,
            latestVersion,
          };
        }
      }

      // Get platform-specific download URL
      let downloadUrl: string | undefined;
      const platformKey = getPlatformKey();
      if (platformKey) {
        const platformInfo = manifest.platforms[platformKey];
        if (platformInfo) {
          downloadUrl = platformInfo.url;
        }
      }

      // Update last check time
      await this.loadPreferences();
      this.preferences.lastCheckTime = Date.now();
      if (updateAvailable) {
        this.preferences.lastNotifiedVersion = latestVersion;
      }
      await this.savePreferences();

      return {
        updateAvailable,
        currentVersion,
        latestVersion,
        downloadUrl,
        releaseNotesUrl: manifest.releaseNotesUrl,
        changelog: manifest.changelog,
        releaseDate: manifest.releaseDate,
      };
    } catch (error) {
      console.error('Update check failed:', error);
      return {
        updateAvailable: false,
        currentVersion,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Open download URL in default browser (with validation)
   */
  async openDownloadUrl(url: string): Promise<void> {
    validateExternalUrl(url);
    await shell.openExternal(url);
  }

  /**
   * Get current app version
   */
  getCurrentVersion(): string {
    return app.getVersion();
  }
}

// Export singleton instance
export const updateService = new UpdateService();
