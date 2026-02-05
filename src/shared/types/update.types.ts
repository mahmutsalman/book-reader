/**
 * Update system types for Smart Book auto-update functionality
 */

// Platform-specific download information
export interface UpdatePlatformInfo {
  url: string;
  sha512: string;
  size?: number;
}

// Update manifest structure (latest.json)
export interface UpdateManifest {
  version: string;
  releaseDate: string;
  releaseNotesUrl?: string;
  platforms: {
    'win32-x64'?: UpdatePlatformInfo;
    'darwin-arm64'?: UpdatePlatformInfo;
    'darwin-x64'?: UpdatePlatformInfo;
  };
  changelog?: string[];
  minimumVersion?: string; // Minimum version required to update
}

// Update check result returned to renderer
export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  downloadUrl?: string;
  releaseNotesUrl?: string;
  changelog?: string[];
  releaseDate?: string;
  error?: string;
}

// User preferences for updates
export interface UpdatePreferences {
  autoCheckEnabled: boolean;
  lastCheckTime?: number;
  skippedVersions: string[];
  lastNotifiedVersion?: string;
}

// IPC response types
export interface UpdateCheckResponse {
  success: boolean;
  result?: UpdateCheckResult;
  error?: string;
}

export interface UpdateOpenUrlResponse {
  success: boolean;
  error?: string;
}

export interface UpdateSkipVersionResponse {
  success: boolean;
  error?: string;
}

export interface UpdatePreferencesResponse {
  success: boolean;
  preferences?: UpdatePreferences;
  error?: string;
}

export interface UpdateSetPreferenceResponse {
  success: boolean;
  error?: string;
}
