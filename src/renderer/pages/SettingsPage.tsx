import React, { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import type { AppSettings } from '../../shared/types';
import type { IPALanguageInfo } from '../../shared/types/pronunciation.types';

type ThemeOption = AppSettings['theme'];

const SettingsPage: React.FC = () => {
  const { settings, updateSetting, loading } = useSettings();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [pythonStatus, setPythonStatus] = useState<{ running: boolean; ready: boolean; url: string } | null>(null);
  const [testingPython, setTestingPython] = useState(false);
  const [ipaLanguages, setIpaLanguages] = useState<IPALanguageInfo[]>([]);
  const [loadingIpaLanguages, setLoadingIpaLanguages] = useState(false);
  const [installingLanguage, setInstallingLanguage] = useState<string | null>(null);
  const [installResult, setInstallResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestConnection = async () => {
    if (!window.electronAPI) return;

    setTestingConnection(true);
    setConnectionResult(null);

    try {
      const result = await window.electronAPI.ai.testConnection();
      if (result.success && result.models && result.models.length > 0) {
        setAvailableModels(result.models);
        // Auto-select first model if current model is 'default' or not in list
        if (settings.lm_studio_model === 'default' || !result.models.includes(settings.lm_studio_model)) {
          updateSetting('lm_studio_model', result.models[0]);
        }
      }
      setConnectionResult({
        success: result.success,
        message: result.success
          ? `Connected! Found ${result.models?.length || 0} model(s)`
          : `Failed: ${result.error || 'Unknown error'}`,
      });
    } catch (error) {
      setConnectionResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleTestPythonServer = async () => {
    if (!window.electronAPI) return;

    setTestingPython(true);
    try {
      const status = await window.electronAPI.pronunciation.getServerStatus();
      setPythonStatus(status);
    } catch {
      setPythonStatus({ running: false, ready: false, url: 'N/A' });
    } finally {
      setTestingPython(false);
    }
  };

  const loadIpaLanguages = async () => {
    if (!window.electronAPI) return;

    setLoadingIpaLanguages(true);
    try {
      const result = await window.electronAPI.pronunciation.getIPALanguages();
      if (result.success) {
        setIpaLanguages(result.languages);
      }
    } catch (error) {
      console.error('Failed to load IPA languages:', error);
    } finally {
      setLoadingIpaLanguages(false);
    }
  };

  const handleInstallLanguage = async (langCode: string) => {
    if (!window.electronAPI || installingLanguage) return;

    setInstallingLanguage(langCode);
    setInstallResult(null);

    try {
      const result = await window.electronAPI.pronunciation.installIPALanguage(langCode);
      setInstallResult({
        success: result.success,
        message: result.success ? result.message : (result.error || 'Installation failed'),
      });
      if (result.success) {
        // Refresh the language list
        loadIpaLanguages();
      }
    } catch (error) {
      setInstallResult({
        success: false,
        message: error instanceof Error ? error.message : 'Installation failed',
      });
    } finally {
      setInstallingLanguage(null);
    }
  };

  // Load IPA languages when Python server is ready
  useEffect(() => {
    if (pythonStatus?.ready) {
      loadIpaLanguages();
    }
  }, [pythonStatus?.ready]);

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading settings...</div>
      </div>
    );
  }

  const themeOptions: { value: ThemeOption; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'dark', label: 'Dark', icon: '🌙' },
    { value: 'system', label: 'System', icon: '💻' },
  ];

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Settings</h2>

      {/* Appearance Settings */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          🎨 Appearance
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Theme
            </label>
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 p-1 bg-gray-100 dark:bg-gray-700">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateSetting('theme', option.value)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2 ${
                    settings.theme === option.value
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <span>{option.icon}</span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Choose your preferred color scheme
            </p>
          </div>
        </div>
      </div>

      {/* LM Studio Settings */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          🤖 LM Studio (AI)
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              LM Studio URL
            </label>
            <input
              type="text"
              value={settings.lm_studio_url}
              onChange={(e) => updateSetting('lm_studio_url', e.target.value)}
              placeholder="http://localhost:1234"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Default: http://localhost:1234
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="btn-secondary"
            >
              {testingConnection ? 'Testing...' : 'Test Connection'}
            </button>
            {connectionResult && (
              <span
                className={`text-sm ${
                  connectionResult.success ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {connectionResult.message}
              </span>
            )}
          </div>

          {/* Model Selection */}
          {availableModels.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                AI Model
              </label>
              <select
                value={settings.lm_studio_model}
                onChange={(e) => updateSetting('lm_studio_model', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Select the model to use for word definitions and sentence simplification
              </p>
            </div>
          )}

          {settings.lm_studio_model !== 'default' && availableModels.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Current model: <span className="font-medium">{settings.lm_studio_model}</span>
              <br />
              <span className="text-xs">Test connection to see available models</span>
            </div>
          )}
        </div>
      </div>

      {/* Python Server Settings */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          🔊 Pronunciation Server
        </h3>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Python server for text-to-speech and IPA transcription
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleTestPythonServer}
              disabled={testingPython}
              className="btn-secondary"
            >
              {testingPython ? 'Checking...' : 'Check Status'}
            </button>
            {pythonStatus && (
              <span
                className={`text-sm ${
                  pythonStatus.ready ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {pythonStatus.ready ? '✓ Server Ready' : '✗ Server Not Ready'}
              </span>
            )}
          </div>

          {pythonStatus && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <div>Status: {pythonStatus.running ? 'Running' : 'Stopped'}</div>
              <div>URL: {pythonStatus.url}</div>
            </div>
          )}

          {/* IPA Language Packages */}
          {pythonStatus?.ready && (
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                IPA Pronunciation Packages
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Install language packages for accurate IPA transcription. Without a package, AI will be used as fallback.
              </p>

              {loadingIpaLanguages ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading languages...</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {ipaLanguages.map((lang) => (
                    <div
                      key={lang.code}
                      className={`flex items-center justify-between p-2 rounded-lg border ${
                        lang.installed
                          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {lang.name}
                        </span>
                        <span className="text-xs text-gray-400">({lang.code})</span>
                      </div>
                      {lang.installed ? (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                          ✓ Installed
                        </span>
                      ) : (
                        <button
                          onClick={() => handleInstallLanguage(lang.code)}
                          disabled={installingLanguage !== null}
                          className={`text-xs px-2 py-1 rounded ${
                            installingLanguage === lang.code
                              ? 'bg-gray-200 dark:bg-gray-600 text-gray-500'
                              : 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900/50'
                          }`}
                        >
                          {installingLanguage === lang.code ? 'Installing...' : 'Install'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {installResult && (
                <div
                  className={`mt-3 p-2 rounded text-sm ${
                    installResult.success
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  }`}
                >
                  {installResult.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tatoeba Settings */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          🌐 Tatoeba (Example Sentences)
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-700 dark:text-gray-300">Enable Tatoeba</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Show example sentences from Tatoeba database
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.tatoeba_enabled}
                onChange={(e) => updateSetting('tatoeba_enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          {settings.tatoeba_enabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Language
              </label>
              <select
                value={settings.tatoeba_language}
                onChange={(e) => updateSetting('tatoeba_language', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="ja">Japanese</option>
                <option value="zh">Chinese</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Reading Settings */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          📖 Reading Preferences
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Default Zoom: {settings.default_zoom.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={settings.default_zoom}
              onChange={(e) => updateSetting('default_zoom', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Font Family
            </label>
            <select
              value={settings.font_family}
              onChange={(e) => updateSetting('font_family', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="Georgia, serif">Georgia (Serif)</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="system-ui, sans-serif">System Sans-Serif</option>
              <option value="'Courier New', monospace">Courier (Monospace)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Line Height: {settings.line_height.toFixed(1)}
            </label>
            <input
              type="range"
              min="1.2"
              max="2.5"
              step="0.1"
              value={settings.line_height}
              onChange={(e) => updateSetting('line_height', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
          </div>
        </div>
      </div>

      {/* Pre-Study Notes Settings */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          📚 Pre-Study Notes
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Views to Process: {settings.pre_study_view_count}
            </label>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={settings.pre_study_view_count}
              onChange={(e) => updateSetting('pre_study_view_count', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              How many views ahead to include in pre-study notes
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sentences per View
            </label>
            <select
              value={settings.pre_study_sentence_limit}
              onChange={(e) => updateSetting('pre_study_sentence_limit', parseInt(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="0">All sentences</option>
              <option value="1">First sentence only (fastest)</option>
              <option value="2">First 2 sentences</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Limit sentences for faster testing or quick previews
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
