import React, { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import type { AppSettings } from '../../shared/types';
import type { IPALanguageInfo } from '../../shared/types/pronunciation.types';

type ThemeOption = AppSettings['theme'];

const GROQ_MODELS = [
  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Faster)' },
  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Recommended)' },
  { value: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B (Preview)' },
  { value: 'qwen/qwen3-32b', label: 'Qwen3 32B (Best for Russian)' },
];

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
  const [testingGroqConnection, setTestingGroqConnection] = useState(false);
  const [groqConnectionResult, setGroqConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showGroqSetupModal, setShowGroqSetupModal] = useState(false);
  const [groqSetupStep, setGroqSetupStep] = useState(1);

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

  const handleTestGroqConnection = async () => {
    if (!window.electronAPI) return;

    setTestingGroqConnection(true);
    setGroqConnectionResult(null);

    try {
      const result = await window.electronAPI.ai.testGroqConnection();
      setGroqConnectionResult({
        success: result.success,
        message: result.success
          ? `Connected! Groq API is working.`
          : `Failed: ${result.error || 'Unknown error'}`,
      });
    } catch (error) {
      setGroqConnectionResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setTestingGroqConnection(false);
    }
  };

  const handleOpenGroqSetup = () => {
    setGroqSetupStep(1);
    setShowGroqSetupModal(true);
  };

  const handleGroqSetupOpenBrowser = () => {
    window.open('https://console.groq.com/keys', '_blank');
    setGroqSetupStep(2);
  };

  const handleGroqSetupComplete = () => {
    setShowGroqSetupModal(false);
    setGroqSetupStep(1);
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

      {/* AI Provider Settings */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          🤖 AI Provider
        </h3>

        <div className="space-y-4">
          {/* Provider Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select AI Provider
            </label>
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 p-1 bg-gray-100 dark:bg-gray-700">
              <button
                onClick={() => updateSetting('ai_provider', 'local')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2 ${
                  settings.ai_provider === 'local'
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <span>💻</span>
                <span>Local AI</span>
              </button>
              <button
                onClick={() => updateSetting('ai_provider', 'groq')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2 ${
                  settings.ai_provider === 'groq'
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <span>☁️</span>
                <span>Cloud AI (Groq)</span>
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {settings.ai_provider === 'local'
                ? 'Uses LM Studio running locally on your computer'
                : 'Uses Groq\'s free cloud API for enhanced AI features with example sentences and grammar explanations'}
            </p>
          </div>

          {/* Local AI Settings */}
          {settings.ai_provider === 'local' && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                LM Studio Settings
              </h4>

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
          )}

          {/* Groq Cloud AI Settings */}
          {settings.ai_provider === 'groq' && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Groq Cloud AI Settings
              </h4>

              <div className="space-y-4">
                {/* Setup Instructions */}
                {!settings.groq_api_key && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                      To use Groq's free AI, you need an API key:
                    </p>
                    <ol className="text-xs text-blue-600 dark:text-blue-400 list-decimal list-inside space-y-1 mb-3">
                      <li>Click "Setup Groq" to create a free account</li>
                      <li>Go to API Keys and create a new key</li>
                      <li>Paste your API key below</li>
                    </ol>
                    <button
                      onClick={handleOpenGroqSetup}
                      className="btn-primary text-sm"
                    >
                      Setup Groq (Free)
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={settings.groq_api_key}
                    onChange={(e) => updateSetting('groq_api_key', e.target.value)}
                    placeholder="gsk_..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Your API key is stored locally and never shared
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Model
                  </label>
                  <select
                    value={settings.groq_model}
                    onChange={(e) => updateSetting('groq_model', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    {GROQ_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Llama 3.3 70B provides the best results for language learning
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={handleTestGroqConnection}
                    disabled={testingGroqConnection || !settings.groq_api_key}
                    className="btn-secondary"
                  >
                    {testingGroqConnection ? 'Testing...' : 'Test Connection'}
                  </button>
                  {groqConnectionResult && (
                    <span
                      className={`text-sm ${
                        groqConnectionResult.success ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {groqConnectionResult.message}
                    </span>
                  )}
                </div>

                {/* Enhanced Features Info */}
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                    Enhanced Features with Cloud AI
                  </p>
                  <ul className="text-xs text-green-600 dark:text-green-400 list-disc list-inside space-y-1">
                    <li>Example sentences for each word showing different grammar contexts</li>
                    <li>Grammar explanations to help understand sentence structures</li>
                    <li>Works for all AI features: definitions, IPA, simplification, pre-study notes</li>
                  </ul>
                </div>
              </div>
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

          {/* Slow Playback Speed */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Slow Playback Speed: {settings.slow_playback_speed.toFixed(2)}x
              </label>
              <input
                type="range"
                min="0.25"
                max="2.0"
                step="0.05"
                value={settings.slow_playback_speed}
                onChange={(e) => updateSetting('slow_playback_speed', parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-primary-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0.25x</span>
                <span>2.0x</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Speed for slow audio playback in word panel and pre-study notes
              </p>
            </div>
          </div>
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

      {/* Groq Setup Modal */}
      {showGroqSetupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">Setup Groq (Free)</h3>
                <button
                  onClick={() => setShowGroqSetupModal(false)}
                  className="text-white/80 hover:text-white text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
              <p className="text-white/80 text-sm mt-1">
                Get your free API key in 3 easy steps
              </p>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {groqSetupStep === 1 && (
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold flex-shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-200">
                        Create a free Groq account
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Sign up with Google or email - it's completely free
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 font-bold flex-shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-gray-400">
                        Create an API key
                      </p>
                      <p className="text-sm text-gray-400">
                        Click "Create API Key" on the Groq console
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 font-bold flex-shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-gray-400">
                        Paste it here
                      </p>
                      <p className="text-sm text-gray-400">
                        Copy the key and paste it in the settings
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
                    <button
                      onClick={handleGroqSetupOpenBrowser}
                      className="w-full btn-primary py-3 text-lg flex items-center justify-center gap-2"
                    >
                      <span>Open Groq Console</span>
                      <span>→</span>
                    </button>
                    <p className="text-xs text-gray-400 text-center mt-2">
                      Opens in your default browser
                    </p>
                  </div>
                </div>
              )}

              {groqSetupStep === 2 && (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="text-green-700 dark:text-green-300 font-medium">
                      Browser opened! Complete these steps:
                    </p>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-green-600 dark:text-green-400 font-bold flex-shrink-0">
                      ✓
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-200">
                        Sign in with Google or email
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold flex-shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-200">
                        Click "Create API Key"
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Give it any name (e.g., "BookReader")
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold flex-shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-200">
                        Copy the API key (starts with "gsk_")
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Click the copy button next to your new key
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-200 dark:border-gray-600 space-y-2">
                    <button
                      onClick={handleGroqSetupComplete}
                      className="w-full btn-primary py-3"
                    >
                      Done - I have my API key
                    </button>
                    <button
                      onClick={handleGroqSetupOpenBrowser}
                      className="w-full btn-secondary py-2 text-sm"
                    >
                      Reopen Groq Console
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
