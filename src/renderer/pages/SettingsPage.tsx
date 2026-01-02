import React, { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import type { AppSettings } from '../../shared/types';
import type { IPALanguageInfo, VoiceModelInfo } from '../../shared/types/pronunciation.types';
import { useReaderTheme } from '../hooks/useReaderTheme';
import { addAlpha, getContrastColor } from '../utils/colorUtils';

type ThemeOption = AppSettings['theme'];

const GROQ_MODELS = [
  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Faster)' },
  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Recommended)' },
  { value: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B (Preview)' },
  { value: 'qwen/qwen3-32b', label: 'Qwen3 32B (Best for Russian)' },
];

const OPENROUTER_MODELS = [
  // ONLY WORKING MODELS - Gemma 3 family (100% CONFIRMED ✓✓✓)
  { value: 'google/gemma-3-27b-it:free', label: '⚡ Gemma 3 27B (RECOMMENDED - Fast, 140+ languages)' },
  { value: 'google/gemma-3-12b-it:free', label: '⚡ Gemma 3 12B (Super fast, multimodal)' },
  { value: 'google/gemma-3-4b-it:free', label: '⚡ Gemma 3 4B (Ultra fast, lightweight)' },
];

const MISTRAL_MODELS = [
  { value: 'mistral-small-latest', label: 'Mistral Small (Recommended)' },
  { value: 'ministral-8b-latest', label: 'Ministral 8B (Faster)' },
  { value: 'mistral-medium-latest', label: 'Mistral Medium (Complex Explanations)' },
  { value: 'mistral-large-latest', label: 'Mistral Large (Best Quality)' },
];

const GOOGLE_MODELS = [
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Recommended - 15 RPM, 1000/day)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (10 RPM, 250/day)' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Good Balance)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Best Quality - 5 RPM, 25/day)' },
];

const FONT_FAMILY_OPTIONS = [
  { value: 'Georgia, serif', label: 'Georgia (Serif)' },
  { value: "'Literata', Georgia, serif", label: 'Literata (Serif)' },
  { value: "'Libre Baskerville', Georgia, serif", label: 'Libre Baskerville (Serif)' },
  { value: "'Times New Roman', serif", label: 'Times New Roman (Serif)' },
  { value: 'system-ui, sans-serif', label: 'System Sans-Serif' },
  { value: "'Roboto', system-ui, sans-serif", label: 'Roboto (Sans-Serif)' },
  { value: "'Inter', system-ui, sans-serif", label: 'Inter (Sans-Serif)' },
  { value: "'Courier New', monospace", label: 'Courier (Monospace)' },
];

const SettingsPage: React.FC = () => {
  const { settings, updateSetting, loading } = useSettings();
  const theme = useReaderTheme();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [pythonStatus, setPythonStatus] = useState<{ running: boolean; ready: boolean; url: string } | null>(null);
  const [testingPython, setTestingPython] = useState(false);
  const [restartingPython, setRestartingPython] = useState(false);
  const [ipaLanguages, setIpaLanguages] = useState<IPALanguageInfo[]>([]);
  const [loadingIpaLanguages, setLoadingIpaLanguages] = useState(false);
  const [installingLanguage, setInstallingLanguage] = useState<string | null>(null);
  const [installResult, setInstallResult] = useState<{ success: boolean; message: string } | null>(null);

  // Voice Model state
  const [voiceModels, setVoiceModels] = useState<VoiceModelInfo[]>([]);
  const [loadingVoiceModels, setLoadingVoiceModels] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadResult, setDownloadResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingGroqConnection, setTestingGroqConnection] = useState(false);
  const [groqConnectionResult, setGroqConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showGroqSetupModal, setShowGroqSetupModal] = useState(false);
  const [groqSetupStep, setGroqSetupStep] = useState(1);
  const [testingOpenRouterConnection, setTestingOpenRouterConnection] = useState(false);
  const [openRouterConnectionResult, setOpenRouterConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingMistralConnection, setTestingMistralConnection] = useState(false);
  const [mistralConnectionResult, setMistralConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingGoogleConnection, setTestingGoogleConnection] = useState(false);
  const [googleConnectionResult, setGoogleConnectionResult] = useState<{ success: boolean; message: string } | null>(null);

  const accentTextColor = getContrastColor(theme.accent);
  const hoverFill = theme.wordHover || addAlpha(theme.panel, 0.5);
  const inputStyle = {
    backgroundColor: theme.panel,
    color: theme.text,
    borderColor: theme.border,
  };
  const cardStyle = {
    backgroundColor: theme.panel,
    borderColor: theme.panelBorder,
    color: theme.text,
  };
  const focusRing = `0 0 0 2px ${theme.accent}40`;
  const handleInputFocus = (event: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    event.currentTarget.style.boxShadow = focusRing;
  };
  const handleInputBlur = (event: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    event.currentTarget.style.boxShadow = 'none';
  };

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

  const handleTestOpenRouterConnection = async () => {
    if (!window.electronAPI) return;

    setTestingOpenRouterConnection(true);
    setOpenRouterConnectionResult(null);

    try {
      const result = await window.electronAPI.ai.testOpenRouterConnection();
      setOpenRouterConnectionResult({
        success: result.success,
        message: result.success
          ? `Connected! OpenRouter API is working.`
          : `Failed: ${result.error || 'Unknown error'}`,
      });
    } catch (error) {
      setOpenRouterConnectionResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setTestingOpenRouterConnection(false);
    }
  };

  const handleTestMistralConnection = async () => {
    if (!window.electronAPI) return;

    setTestingMistralConnection(true);
    setMistralConnectionResult(null);

    try {
      const result = await window.electronAPI.ai.testMistralConnection();
      setMistralConnectionResult({
        success: result.success,
        message: result.success
          ? `Connected! Mistral API is working.`
          : `Failed: ${result.error || 'Unknown error'}`,
      });
    } catch (error) {
      setMistralConnectionResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setTestingMistralConnection(false);
    }
  };

  const handleTestGoogleConnection = async () => {
    if (!window.electronAPI) return;

    setTestingGoogleConnection(true);
    setGoogleConnectionResult(null);

    try {
      const result = await window.electronAPI.ai.testGoogleConnection();
      setGoogleConnectionResult({
        success: result.success,
        message: result.success
          ? `Connected! Google AI API is working.`
          : `Failed: ${result.error || 'Unknown error'}`,
      });
    } catch (error) {
      setGoogleConnectionResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setTestingGoogleConnection(false);
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

  const handleRestartPythonServer = async () => {
    if (!window.electronAPI) return;

    setRestartingPython(true);
    try {
      const result = await window.electronAPI.pronunciation.restartServer();

      if (result.success) {
        // Wait then check status
        await new Promise(resolve => setTimeout(resolve, 1500));
        const status = await window.electronAPI.pronunciation.getServerStatus();
        setPythonStatus(status);
      } else {
        console.error('Failed to restart server:', result.error);
        alert(`Failed to restart server: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error restarting Python server:', error);
      alert('Error restarting server. Check console for details.');
    } finally {
      setRestartingPython(false);
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

  const loadVoiceModels = async () => {
    if (!window.electronAPI) return;

    setLoadingVoiceModels(true);
    try {
      const result = await window.electronAPI.pronunciation.getVoiceModels();
      if (result.success) {
        setVoiceModels(result.models);
      }
    } catch (error) {
      console.error('Failed to load voice models:', error);
    } finally {
      setLoadingVoiceModels(false);
    }
  };

  const handleDownloadModel = async (language: string) => {
    if (!window.electronAPI || downloadingModel) return;

    setDownloadingModel(language);
    setDownloadResult(null);

    try {
      const result = await window.electronAPI.pronunciation.downloadVoiceModel(language);
      setDownloadResult({
        success: result.success,
        message: result.success ? result.message : (result.error || 'Download failed'),
      });
      if (result.success) {
        // Refresh the models list
        loadVoiceModels();
      }
    } catch (error) {
      setDownloadResult({
        success: false,
        message: error instanceof Error ? error.message : 'Download failed',
      });
    } finally {
      setDownloadingModel(null);
    }
  };

  const handleDeleteModel = async (language: string) => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.pronunciation.deleteVoiceModel(language);
      setDownloadResult({
        success: result.success,
        message: result.success ? result.message : (result.error || 'Delete failed'),
      });
      if (result.success) {
        // Refresh the models list
        loadVoiceModels();
      }
    } catch (error) {
      setDownloadResult({
        success: false,
        message: error instanceof Error ? error.message : 'Delete failed',
      });
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

  // Load IPA languages and voice models when Python server is ready
  useEffect(() => {
    if (pythonStatus?.ready) {
      loadIpaLanguages();
      loadVoiceModels();
    }
  }, [pythonStatus?.ready]);

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center py-12" style={{ color: theme.textSecondary }}>
          Loading settings...
        </div>
      </div>
    );
  }

  const themeOptions: { value: ThemeOption; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'dark', label: 'Dark', icon: '🌙' },
    { value: 'system', label: 'System', icon: '💻' },
  ];

  return (
    <div className="p-6 max-w-2xl mx-auto" style={{ color: theme.text }}>
      <h2 className="text-2xl font-bold mb-6" style={{ color: theme.accent }}>
        Settings
      </h2>

      {/* Appearance Settings */}
      <div className="card mb-6" style={cardStyle}>
        <h3 className="text-lg font-semibold mb-4">
          🎨 Appearance
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              Theme
            </label>
            <div
              className="inline-flex rounded-lg border p-1"
              style={{ borderColor: theme.border, backgroundColor: theme.background }}
            >
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateSetting('theme', option.value)}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                  style={{
                    backgroundColor: settings.theme === option.value ? theme.accent : 'transparent',
                    color: settings.theme === option.value ? accentTextColor : theme.textSecondary,
                  }}
                  onMouseEnter={(event) => {
                    if (settings.theme !== option.value) {
                      event.currentTarget.style.backgroundColor = hoverFill;
                    }
                  }}
                  onMouseLeave={(event) => {
                    if (settings.theme !== option.value) {
                      event.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <span>{option.icon}</span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: theme.textSecondary }}>
              Choose your preferred color scheme
            </p>
          </div>
        </div>
      </div>

      {/* AI Provider Settings */}
      <div className="card mb-6" style={cardStyle}>
        <h3 className="text-lg font-semibold mb-4">
          🤖 AI Provider
        </h3>

        <div className="space-y-4">
          {/* Provider Toggle */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
              Select AI Provider
            </label>
            <div
              className="inline-flex rounded-lg border p-1 flex-wrap"
              style={{ borderColor: theme.border, backgroundColor: theme.background }}
            >
              <button
                onClick={() => updateSetting('ai_provider', 'local')}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                style={{
                  backgroundColor: settings.ai_provider === 'local' ? theme.accent : 'transparent',
                  color: settings.ai_provider === 'local' ? accentTextColor : theme.textSecondary,
                }}
                onMouseEnter={(event) => {
                  if (settings.ai_provider !== 'local') {
                    event.currentTarget.style.backgroundColor = hoverFill;
                  }
                }}
                onMouseLeave={(event) => {
                  if (settings.ai_provider !== 'local') {
                    event.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>💻</span>
                <span>Local AI</span>
              </button>
              <button
                onClick={() => updateSetting('ai_provider', 'groq')}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                style={{
                  backgroundColor: settings.ai_provider === 'groq' ? theme.accent : 'transparent',
                  color: settings.ai_provider === 'groq' ? accentTextColor : theme.textSecondary,
                }}
                onMouseEnter={(event) => {
                  if (settings.ai_provider !== 'groq') {
                    event.currentTarget.style.backgroundColor = hoverFill;
                  }
                }}
                onMouseLeave={(event) => {
                  if (settings.ai_provider !== 'groq') {
                    event.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>☁️</span>
                <span>Groq</span>
              </button>
              <button
                onClick={() => updateSetting('ai_provider', 'openrouter')}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                style={{
                  backgroundColor: settings.ai_provider === 'openrouter' ? theme.accent : 'transparent',
                  color: settings.ai_provider === 'openrouter' ? accentTextColor : theme.textSecondary,
                }}
                onMouseEnter={(event) => {
                  if (settings.ai_provider !== 'openrouter') {
                    event.currentTarget.style.backgroundColor = hoverFill;
                  }
                }}
                onMouseLeave={(event) => {
                  if (settings.ai_provider !== 'openrouter') {
                    event.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>🌐</span>
                <span>OpenRouter</span>
              </button>
              <button
                onClick={() => updateSetting('ai_provider', 'mistral')}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                style={{
                  backgroundColor: settings.ai_provider === 'mistral' ? theme.accent : 'transparent',
                  color: settings.ai_provider === 'mistral' ? accentTextColor : theme.textSecondary,
                }}
                onMouseEnter={(event) => {
                  if (settings.ai_provider !== 'mistral') {
                    event.currentTarget.style.backgroundColor = hoverFill;
                  }
                }}
                onMouseLeave={(event) => {
                  if (settings.ai_provider !== 'mistral') {
                    event.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>🔮</span>
                <span>Mistral AI</span>
              </button>
              <button
                onClick={() => updateSetting('ai_provider', 'google-ai')}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                style={{
                  backgroundColor: settings.ai_provider === 'google-ai' ? theme.accent : 'transparent',
                  color: settings.ai_provider === 'google-ai' ? accentTextColor : theme.textSecondary,
                }}
                onMouseEnter={(event) => {
                  if (settings.ai_provider !== 'google-ai') {
                    event.currentTarget.style.backgroundColor = hoverFill;
                  }
                }}
                onMouseLeave={(event) => {
                  if (settings.ai_provider !== 'google-ai') {
                    event.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>✨</span>
                <span>Google AI</span>
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: theme.textSecondary }}>
              {settings.ai_provider === 'local'
                ? 'Uses LM Studio running locally on your computer'
                : settings.ai_provider === 'groq'
                ? 'Uses Groq\'s free cloud API for enhanced AI features'
                : settings.ai_provider === 'openrouter'
                ? 'Uses OpenRouter with 30+ free AI models'
                : settings.ai_provider === 'mistral'
                ? 'Uses Mistral AI with 1 billion tokens/month free'
                : 'Uses Google AI Studio with 1M tokens/minute free'}
            </p>
          </div>

          {/* Local AI Settings */}
          {settings.ai_provider === 'local' && (
            <div className="mt-4 pt-4 border-t" style={{ borderTopColor: theme.border }}>
              <h4 className="text-sm font-medium mb-3" style={{ color: theme.textSecondary }}>
                LM Studio Settings
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                    LM Studio URL
                  </label>
                  <input
                    type="text"
                    value={settings.lm_studio_url}
                    onChange={(e) => updateSetting('lm_studio_url', e.target.value)}
                    placeholder="http://localhost:1234"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    Default: http://localhost:1234
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: 'transparent',
                      color: theme.textSecondary,
                      border: `1px solid ${theme.border}`,
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = hoverFill;
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = 'transparent';
                    }}
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
                    <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                      AI Model
                    </label>
                    <select
                      value={settings.lm_studio_model}
                      onChange={(e) => updateSetting('lm_studio_model', e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none"
                      style={inputStyle}
                      onFocus={handleInputFocus}
                      onBlur={handleInputBlur}
                    >
                      {availableModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                      Select the model to use for word definitions and sentence simplification
                    </p>
                  </div>
                )}

                {settings.lm_studio_model !== 'default' && availableModels.length === 0 && (
                  <div className="text-sm" style={{ color: theme.textSecondary }}>
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
            <div className="mt-4 pt-4 border-t" style={{ borderTopColor: theme.border }}>
              <h4 className="text-sm font-medium mb-3" style={{ color: theme.textSecondary }}>
                Groq Cloud AI Settings
              </h4>

              <div className="space-y-4">
                {/* Setup Instructions */}
                {!settings.groq_api_key && (
                  <div className="p-3 rounded-lg border" style={{ borderColor: theme.panelBorder, backgroundColor: theme.background }}>
                    <p className="text-sm mb-2" style={{ color: theme.textSecondary }}>
                      To use Groq's free AI, you need an API key:
                    </p>
                    <ol className="text-xs list-decimal list-inside space-y-1 mb-3" style={{ color: theme.textSecondary }}>
                      <li>Click "Setup Groq" to create a free account</li>
                      <li>Go to API Keys and create a new key</li>
                      <li>Paste your API key below</li>
                    </ol>
                    <button
                      onClick={handleOpenGroqSetup}
                      className="px-4 py-2 rounded-lg font-medium transition-opacity text-sm"
                      style={{ backgroundColor: theme.accent, color: accentTextColor }}
                    >
                      Setup Groq (Free)
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                    API Key
                  </label>
                  <input
                    type="password"
                    value={settings.groq_api_key}
                    onChange={(e) => updateSetting('groq_api_key', e.target.value)}
                    placeholder="gsk_..."
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    Your API key is stored securely using OS encryption
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                    Model
                  </label>
                  <select
                    value={settings.groq_model}
                    onChange={(e) => updateSetting('groq_model', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  >
                    {GROQ_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    Llama 3.3 70B provides the best results for language learning
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={handleTestGroqConnection}
                    disabled={testingGroqConnection || !settings.groq_api_key}
                    className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: 'transparent',
                      color: theme.textSecondary,
                      border: `1px solid ${theme.border}`,
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = hoverFill;
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = 'transparent';
                    }}
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
                <div className="p-3 rounded-lg border" style={{ borderColor: theme.panelBorder, backgroundColor: addAlpha(theme.accent, 0.1) }}>
                  <p className="text-sm font-medium mb-1" style={{ color: theme.accent }}>
                    Enhanced Features with Cloud AI
                  </p>
                  <ul className="text-xs list-disc list-inside space-y-1" style={{ color: theme.textSecondary }}>
                    <li>Example sentences for each word showing different grammar contexts</li>
                    <li>Grammar explanations to help understand sentence structures</li>
                    <li>Works for all AI features: definitions, IPA, simplification, pre-study notes</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* OpenRouter Settings */}
          {settings.ai_provider === 'openrouter' && (
            <div className="mt-4 pt-4 border-t" style={{ borderTopColor: theme.border }}>
              <h4 className="text-sm font-medium mb-3" style={{ color: theme.textSecondary }}>
                OpenRouter Settings
              </h4>

              <div className="space-y-4">
                {/* Setup Instructions */}
                {!settings.openrouter_api_key && (
                  <div className="p-3 rounded-lg border" style={{ borderColor: theme.panelBorder, backgroundColor: theme.background }}>
                    <p className="text-sm mb-2" style={{ color: theme.textSecondary }}>
                      Get free access to 30+ AI models with OpenRouter:
                    </p>
                    <ol className="text-xs list-decimal list-inside space-y-1 mb-3" style={{ color: theme.textSecondary }}>
                      <li>Visit <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">openrouter.ai/keys</a></li>
                      <li>Sign up with Google or email (free)</li>
                      <li>Create a new API key</li>
                      <li>Paste your API key below</li>
                    </ol>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                    API Key
                  </label>
                  <input
                    type="password"
                    value={settings.openrouter_api_key}
                    onChange={(e) => updateSetting('openrouter_api_key', e.target.value)}
                    placeholder="sk-or-..."
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    Your API key is stored securely using OS encryption
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                    Model
                  </label>
                  <select
                    value={settings.openrouter_model}
                    onChange={(e) => updateSetting('openrouter_model', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  >
                    {OPENROUTER_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    Gemma 3 27B recommended - fast responses, 140+ languages, automatic fallback
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={handleTestOpenRouterConnection}
                    disabled={testingOpenRouterConnection || !settings.openrouter_api_key}
                    className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: 'transparent',
                      color: theme.textSecondary,
                      border: `1px solid ${theme.border}`,
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = hoverFill;
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {testingOpenRouterConnection ? 'Testing...' : 'Test Connection'}
                  </button>
                  {openRouterConnectionResult && (
                    <span
                      className={`text-sm ${
                        openRouterConnectionResult.success ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {openRouterConnectionResult.message}
                    </span>
                  )}
                </div>

                {/* Features Info */}
                <div className="p-3 rounded-lg border" style={{ borderColor: theme.panelBorder, backgroundColor: addAlpha(theme.accent, 0.1) }}>
                  <p className="text-sm font-medium mb-1" style={{ color: theme.accent }}>
                    OpenRouter - ONLY Gemma 3 Models Work
                  </p>
                  <ul className="text-xs list-disc list-inside space-y-1" style={{ color: theme.textSecondary }}>
                    <li>✓✓✓ Gemma 3 family (27B, 12B, 4B) - 100% verified working</li>
                    <li>⚡ Ultra-fast responses perfect for language learning</li>
                    <li>🌍 Supports 140+ languages including Russian, German, Spanish, Arabic</li>
                    <li>🔄 Automatic fallback between 3 confirmed working models</li>
                    <li>❌ Other :free models cause 404 errors - DO NOT USE</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Mistral AI Settings */}
          {settings.ai_provider === 'mistral' && (
            <div className="mt-4 pt-4 border-t" style={{ borderTopColor: theme.border }}>
              <h4 className="text-sm font-medium mb-3" style={{ color: theme.textSecondary }}>
                Mistral AI Settings
              </h4>

              <div className="space-y-4">
                {/* Setup Instructions */}
                {!settings.mistral_api_key && (
                  <div className="p-3 rounded-lg border" style={{ borderColor: theme.panelBorder, backgroundColor: theme.background }}>
                    <p className="text-sm mb-2" style={{ color: theme.textSecondary }}>
                      Get 1 billion free tokens per month with Mistral AI:
                    </p>
                    <ol className="text-xs list-decimal list-inside space-y-1 mb-3" style={{ color: theme.textSecondary }}>
                      <li>Visit <a href="https://console.mistral.ai/api-keys/" target="_blank" rel="noopener noreferrer" className="underline">console.mistral.ai</a></li>
                      <li>Sign up with Google or email (free)</li>
                      <li>Create a new API key</li>
                      <li>Paste your API key below</li>
                    </ol>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                    API Key
                  </label>
                  <input
                    type="password"
                    value={settings.mistral_api_key}
                    onChange={(e) => updateSetting('mistral_api_key', e.target.value)}
                    placeholder="..."
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    Your API key is stored securely using OS encryption
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                    Model
                  </label>
                  <select
                    value={settings.mistral_model}
                    onChange={(e) => updateSetting('mistral_model', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  >
                    {MISTRAL_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    Mistral Small provides the best balance of quality and speed
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={handleTestMistralConnection}
                    disabled={testingMistralConnection || !settings.mistral_api_key}
                    className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: 'transparent',
                      color: theme.textSecondary,
                      border: `1px solid ${theme.border}`,
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = hoverFill;
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {testingMistralConnection ? 'Testing...' : 'Test Connection'}
                  </button>
                  {mistralConnectionResult && (
                    <span
                      className={`text-sm ${
                        mistralConnectionResult.success ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {mistralConnectionResult.message}
                    </span>
                  )}
                </div>

                {/* Features Info */}
                <div className="p-3 rounded-lg border" style={{ borderColor: theme.panelBorder, backgroundColor: addAlpha(theme.accent, 0.1) }}>
                  <p className="text-sm font-medium mb-1" style={{ color: theme.accent }}>
                    Mistral AI Features
                  </p>
                  <ul className="text-xs list-disc list-inside space-y-1" style={{ color: theme.textSecondary }}>
                    <li>1 billion tokens per month free tier (enough for extensive language learning)</li>
                    <li>High-quality models with automatic fallback</li>
                    <li>Works for all AI features: definitions, IPA, simplification, pre-study notes</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Google AI Settings */}
          {settings.ai_provider === 'google-ai' && (
            <div className="mt-4 pt-4 border-t" style={{ borderTopColor: theme.border }}>
              <h4 className="text-sm font-medium mb-3" style={{ color: theme.textSecondary }}>
                Google AI Settings
              </h4>

              <div className="space-y-4">
                {/* Setup Instructions */}
                {!settings.google_api_key && (
                  <div className="p-3 rounded-lg border" style={{ borderColor: theme.panelBorder, backgroundColor: theme.background }}>
                    <p className="text-sm mb-2" style={{ color: theme.textSecondary }}>
                      Get 1 million tokens per minute free with Google AI Studio:
                    </p>
                    <ol className="text-xs list-decimal list-inside space-y-1 mb-3" style={{ color: theme.textSecondary }}>
                      <li>
                        Visit{' '}
                        <a
                          href="https://aistudio.google.com/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                          style={{ color: theme.accent }}
                        >
                          aistudio.google.com/apikey
                        </a>
                      </li>
                      <li>Sign in with your Google account</li>
                      <li>Create a new API key</li>
                      <li>Paste your API key below</li>
                    </ol>
                  </div>
                )}

                {/* API Key Input */}
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                    API Key
                  </label>
                  <input
                    type="password"
                    value={settings.google_api_key || ''}
                    onChange={(e) => updateSetting('google_api_key', e.target.value)}
                    placeholder="AIza..."
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    Your API key is stored securely using OS encryption
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                    Model
                  </label>
                  <select
                    value={settings.google_model}
                    onChange={(e) => updateSetting('google_model', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none"
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  >
                    {GOOGLE_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                    Gemini 2.5 Flash Lite has the highest free tier limits (15 RPM, 1000/day)
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={handleTestGoogleConnection}
                    disabled={testingGoogleConnection || !settings.google_api_key}
                    className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: 'transparent',
                      color: theme.textSecondary,
                      border: `1px solid ${theme.border}`,
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = hoverFill;
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {testingGoogleConnection ? 'Testing...' : 'Test Connection'}
                  </button>
                  {googleConnectionResult && (
                    <span
                      className={`text-sm ${
                        googleConnectionResult.success ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {googleConnectionResult.message}
                    </span>
                  )}
                </div>

                {/* Features Info */}
                <div className="p-3 rounded-lg border" style={{ borderColor: theme.panelBorder, backgroundColor: addAlpha(theme.accent, 0.1) }}>
                  <p className="text-sm font-medium mb-1" style={{ color: theme.accent }}>
                    Google AI Features
                  </p>
                  <ul className="text-xs list-disc list-inside space-y-1" style={{ color: theme.textSecondary }}>
                    <li>Gemini 2.5 Flash Lite: 15 RPM, 1000 requests/day (best free tier)</li>
                    <li>Automatic fallback to other models if rate-limited</li>
                    <li>Works for all AI features: definitions, IPA, simplification, pre-study notes</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Python Server Settings */}
      <div className="card mb-6" style={cardStyle}>
        <h3 className="text-lg font-semibold mb-4">
          🔊 Pronunciation Server
        </h3>

        <div className="space-y-4">
          <div>
            <p className="text-sm mb-3" style={{ color: theme.textSecondary }}>
              Python server for text-to-speech and IPA transcription
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleTestPythonServer}
              disabled={testingPython || restartingPython}
              className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'transparent',
                color: theme.textSecondary,
                border: `1px solid ${theme.border}`,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = hoverFill;
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {testingPython ? 'Checking...' : 'Check Status'}
            </button>

            <button
              onClick={handleRestartPythonServer}
              disabled={testingPython || restartingPython}
              className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'transparent',
                color: theme.textSecondary,
                border: `1px solid ${theme.border}`,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = hoverFill;
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'transparent';
              }}
              title="Force restart the pronunciation server (kills all related processes)"
            >
              {restartingPython ? 'Restarting...' : '🔄 Restart Server'}
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
            <div className="text-sm" style={{ color: theme.textSecondary }}>
              <div>Status: {pythonStatus.running ? 'Running' : 'Stopped'}</div>
              <div>URL: {pythonStatus.url}</div>
            </div>
          )}

          {/* IPA Language Packages */}
          {pythonStatus?.ready && (
            <div className="mt-6 pt-4 border-t" style={{ borderTopColor: theme.border }}>
              <h4 className="text-sm font-medium mb-3" style={{ color: theme.textSecondary }}>
                IPA Pronunciation Packages
              </h4>
              <p className="text-xs mb-3" style={{ color: theme.textSecondary }}>
                Install language packages for accurate IPA transcription. Without a package, AI will be used as fallback.
              </p>

              {loadingIpaLanguages ? (
                <div className="text-sm" style={{ color: theme.textSecondary }}>
                  Loading languages...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {ipaLanguages.map((lang) => (
                    <div
                      key={lang.code}
                      className="flex items-center justify-between p-2 rounded-lg border"
                      style={{
                        borderColor: lang.installed ? theme.accent : theme.border,
                        backgroundColor: lang.installed ? addAlpha(theme.accent, 0.12) : theme.panel,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: theme.text }}>
                          {lang.name}
                        </span>
                        <span className="text-xs" style={{ color: theme.textSecondary }}>
                          ({lang.code})
                        </span>
                      </div>
                      {lang.installed ? (
                        <span className="text-xs font-medium" style={{ color: theme.accent }}>
                          ✓ Installed
                        </span>
                      ) : (
                        <button
                          onClick={() => handleInstallLanguage(lang.code)}
                          disabled={installingLanguage !== null}
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            backgroundColor: installingLanguage === lang.code
                              ? theme.panelBorder
                              : addAlpha(theme.accent, 0.2),
                            color: installingLanguage === lang.code ? theme.textSecondary : theme.accent,
                          }}
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
                  className="mt-3 p-2 rounded text-sm"
                  style={{
                    backgroundColor: installResult.success
                      ? addAlpha(theme.accent, 0.12)
                      : addAlpha('#E85D4A', 0.2),
                    color: installResult.success ? theme.accent : '#E85D4A',
                  }}
                >
                  {installResult.message}
                </div>
              )}
            </div>
          )}

          {/* Voice Models */}
          {pythonStatus?.ready && (
            <div className="mt-6 pt-4 border-t" style={{ borderTopColor: theme.border }}>
              <h4 className="text-sm font-medium mb-3" style={{ color: theme.textSecondary }}>
                Voice Models for Text-to-Speech
              </h4>
              <p className="text-xs mb-3" style={{ color: theme.textSecondary }}>
                Download neural voice models for offline pronunciation (~63 MB each). Models are stored on your device and work without internet.
              </p>

              {loadingVoiceModels ? (
                <div className="text-sm" style={{ color: theme.textSecondary }}>
                  Loading models...
                </div>
              ) : (
                <div className="space-y-2">
                  {voiceModels.map((model) => (
                    <div
                      key={model.language}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      style={{
                        borderColor: model.downloaded ? theme.accent : theme.border,
                        backgroundColor: model.downloaded ? addAlpha(theme.accent, 0.12) : theme.panel,
                      }}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium" style={{ color: theme.text }}>
                            {model.name}
                          </span>
                          <span className="text-xs" style={{ color: theme.textSecondary }}>
                            ({model.language.toUpperCase()})
                          </span>
                        </div>
                        {model.downloaded && model.size && (
                          <div className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                            Size: {(model.size / (1024 * 1024)).toFixed(1)} MB
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {model.downloaded ? (
                          <>
                            <span className="text-xs font-medium" style={{ color: theme.accent }}>
                              ✓ Downloaded
                            </span>
                            <button
                              onClick={() => handleDeleteModel(model.language)}
                              className="text-xs px-2 py-1 rounded"
                              style={{
                                backgroundColor: addAlpha('#E85D4A', 0.2),
                                color: '#E85D4A',
                              }}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleDownloadModel(model.language)}
                            disabled={downloadingModel !== null}
                            className="text-xs px-3 py-1 rounded"
                            style={{
                              backgroundColor: downloadingModel === model.language
                                ? theme.panelBorder
                                : addAlpha(theme.accent, 0.2),
                              color: downloadingModel === model.language ? theme.textSecondary : theme.accent,
                            }}
                          >
                            {downloadingModel === model.language ? 'Downloading...' : 'Download'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {downloadResult && (
                <div
                  className="mt-3 p-2 rounded text-sm"
                  style={{
                    backgroundColor: downloadResult.success
                      ? addAlpha(theme.accent, 0.12)
                      : addAlpha('#E85D4A', 0.2),
                    color: downloadResult.success ? theme.accent : '#E85D4A',
                  }}
                >
                  {downloadResult.message}
                </div>
              )}

              <div className="mt-3 text-xs" style={{ color: theme.textSecondary }}>
                💡 Tip: Without voice models, pronunciation features will show placeholders. Download models to enable offline text-to-speech.
              </div>
            </div>
          )}

          {/* Slow Playback Speed */}
          <div className="mt-6 pt-4 border-t" style={{ borderTopColor: theme.border }}>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                Slow Playback Speed: {settings.slow_playback_speed.toFixed(2)}x
              </label>
              <input
                type="range"
                min="0.25"
                max="2.0"
                step="0.05"
                value={settings.slow_playback_speed}
                onChange={(e) => updateSetting('slow_playback_speed', parseFloat(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{ backgroundColor: theme.panelBorder, accentColor: theme.accent }}
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: theme.textSecondary }}>
                <span>0.25x</span>
                <span>2.0x</span>
              </div>
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                Speed for slow audio playback in word panel and pre-study notes
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tatoeba Settings */}
      <div className="card mb-6" style={cardStyle}>
        <h3 className="text-lg font-semibold mb-4">
          🌐 Tatoeba (Example Sentences)
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium" style={{ color: theme.textSecondary }}>
                Enable Tatoeba
              </div>
              <div className="text-sm" style={{ color: theme.textSecondary }}>
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
              <div
                className="w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all"
                style={{
                  backgroundColor: settings.tatoeba_enabled ? theme.accent : theme.panelBorder,
                  borderColor: theme.border,
                }}
              ></div>
            </label>
          </div>

          {settings.tatoeba_enabled && (
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
                Language
              </label>
              <select
                value={settings.tatoeba_language}
                onChange={(e) => updateSetting('tatoeba_language', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none"
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
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
      <div className="card mb-6" style={cardStyle}>
        <h3 className="text-lg font-semibold mb-4">
          📖 Reading Preferences
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
              Default Zoom: {settings.default_zoom.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={settings.default_zoom}
              onChange={(e) => updateSetting('default_zoom', parseFloat(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ backgroundColor: theme.panelBorder, accentColor: theme.accent }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
              Font Family (Reading Area)
            </label>
            <select
              value={settings.font_family}
              onChange={(e) => updateSetting('font_family', e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none"
              style={inputStyle}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            >
              {FONT_FAMILY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
              Font Family (Side Panel)
            </label>
            <select
              value={settings.side_panel_font_family}
              onChange={(e) => updateSetting('side_panel_font_family', e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none"
              style={inputStyle}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            >
              {FONT_FAMILY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
              Line Height: {settings.line_height.toFixed(1)}
            </label>
            <input
              type="range"
              min="1.2"
              max="2.5"
              step="0.1"
              value={settings.line_height}
              onChange={(e) => updateSetting('line_height', parseFloat(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ backgroundColor: theme.panelBorder, accentColor: theme.accent }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
              Side Panel Font Size (Non-Focus): {settings.side_panel_font_size}px
            </label>
            <input
              type="range"
              min="12"
              max="24"
              step="1"
              value={settings.side_panel_font_size}
              onChange={(e) => updateSetting('side_panel_font_size', parseInt(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ backgroundColor: theme.panelBorder, accentColor: theme.accent }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
              Side Panel Font Size (Focus): {settings.side_panel_font_size_focus}px
            </label>
            <input
              type="range"
              min="12"
              max="24"
              step="1"
              value={settings.side_panel_font_size_focus}
              onChange={(e) => updateSetting('side_panel_font_size_focus', parseInt(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ backgroundColor: theme.panelBorder, accentColor: theme.accent }}
            />
          </div>
        </div>
      </div>

      {/* Pre-Study Notes Settings */}
      <div className="card" style={cardStyle}>
        <h3 className="text-lg font-semibold mb-4">
          📚 Pre-Study Notes
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
              Views to Process: {settings.pre_study_view_count}
            </label>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={settings.pre_study_view_count}
              onChange={(e) => updateSetting('pre_study_view_count', parseInt(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{ backgroundColor: theme.panelBorder, accentColor: theme.accent }}
            />
            <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
              How many views ahead to include in pre-study notes
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
              Sentences per View
            </label>
            <select
              value={settings.pre_study_sentence_limit}
              onChange={(e) => updateSetting('pre_study_sentence_limit', parseInt(e.target.value))}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none"
              style={inputStyle}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            >
              <option value="0">All sentences</option>
              <option value="1">First sentence only (fastest)</option>
              <option value="2">First 2 sentences</option>
            </select>
            <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
              Limit sentences for faster testing or quick previews
            </p>
          </div>
        </div>
      </div>

      {/* Groq Setup Modal */}
      {showGroqSetupModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: theme.shadow }}
        >
          <div
            className="rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
            style={{ backgroundColor: theme.panel, color: theme.text, border: `1px solid ${theme.panelBorder}` }}
          >
            {/* Modal Header */}
            <div className="px-6 py-4" style={{ backgroundColor: theme.accent, color: accentTextColor }}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">Setup Groq (Free)</h3>
                <button
                  onClick={() => setShowGroqSetupModal(false)}
                  className="text-2xl leading-none"
                  style={{ color: accentTextColor }}
                >
                  &times;
                </button>
              </div>
              <p className="text-sm mt-1" style={{ color: accentTextColor }}>
                Get your free API key in 3 easy steps
              </p>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {groqSetupStep === 1 && (
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                      style={{ backgroundColor: addAlpha(theme.accent, 0.2), color: theme.accent }}
                    >
                      1
                    </div>
                    <div>
                      <p className="font-medium" style={{ color: theme.text }}>
                        Create a free Groq account
                      </p>
                      <p className="text-sm" style={{ color: theme.textSecondary }}>
                        Sign up with Google or email - it's completely free
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                      style={{ backgroundColor: theme.panelBorder, color: theme.textSecondary }}
                    >
                      2
                    </div>
                    <div>
                      <p className="font-medium" style={{ color: theme.textSecondary }}>
                        Create an API key
                      </p>
                      <p className="text-sm" style={{ color: theme.textSecondary }}>
                        Click "Create API Key" on the Groq console
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                      style={{ backgroundColor: theme.panelBorder, color: theme.textSecondary }}
                    >
                      3
                    </div>
                    <div>
                      <p className="font-medium" style={{ color: theme.textSecondary }}>
                        Paste it here
                      </p>
                      <p className="text-sm" style={{ color: theme.textSecondary }}>
                        Copy the key and paste it in the settings
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t" style={{ borderTopColor: theme.border }}>
                    <button
                      onClick={handleGroqSetupOpenBrowser}
                      className="w-full py-3 text-lg flex items-center justify-center gap-2 rounded-lg font-medium"
                      style={{ backgroundColor: theme.accent, color: accentTextColor }}
                    >
                      <span>Open Groq Console</span>
                      <span>→</span>
                    </button>
                    <p className="text-xs text-center mt-2" style={{ color: theme.textSecondary }}>
                      Opens in your default browser
                    </p>
                  </div>
                </div>
              )}

              {groqSetupStep === 2 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border" style={{ borderColor: theme.panelBorder, backgroundColor: addAlpha(theme.accent, 0.1) }}>
                    <p className="font-medium" style={{ color: theme.accent }}>
                      Browser opened! Complete these steps:
                    </p>
                  </div>

                  <div className="flex items-start gap-4">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                      style={{ backgroundColor: addAlpha(theme.accent, 0.2), color: theme.accent }}
                    >
                      ✓
                    </div>
                    <div>
                      <p className="font-medium" style={{ color: theme.text }}>
                        Sign in with Google or email
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                      style={{ backgroundColor: addAlpha(theme.accent, 0.2), color: theme.accent }}
                    >
                      2
                    </div>
                    <div>
                      <p className="font-medium" style={{ color: theme.text }}>
                        Click "Create API Key"
                      </p>
                      <p className="text-sm" style={{ color: theme.textSecondary }}>
                        Give it any name (e.g., "BookReader")
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                      style={{ backgroundColor: addAlpha(theme.accent, 0.2), color: theme.accent }}
                    >
                      3
                    </div>
                    <div>
                      <p className="font-medium" style={{ color: theme.text }}>
                        Copy the API key (starts with "gsk_")
                      </p>
                      <p className="text-sm" style={{ color: theme.textSecondary }}>
                        Click the copy button next to your new key
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t space-y-2" style={{ borderTopColor: theme.border }}>
                    <button
                      onClick={handleGroqSetupComplete}
                      className="w-full py-3 rounded-lg font-medium"
                      style={{ backgroundColor: theme.accent, color: accentTextColor }}
                    >
                      Done - I have my API key
                    </button>
                    <button
                      onClick={handleGroqSetupOpenBrowser}
                      className="w-full py-2 text-sm rounded-lg font-medium"
                      style={{
                        backgroundColor: 'transparent',
                        color: theme.textSecondary,
                        border: `1px solid ${theme.border}`,
                      }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.backgroundColor = hoverFill;
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.backgroundColor = 'transparent';
                      }}
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
