import React, { useState } from 'react';
import { useSettings } from '../context/SettingsContext';

const SettingsPage: React.FC = () => {
  const { settings, updateSetting, loading } = useSettings();
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

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

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center py-12 text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Settings</h2>

      {/* LM Studio Settings */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          🤖 LM Studio (AI)
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LM Studio URL
            </label>
            <input
              type="text"
              value={settings.lm_studio_url}
              onChange={(e) => updateSetting('lm_studio_url', e.target.value)}
              placeholder="http://localhost:1234"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AI Model
              </label>
              <select
                value={settings.lm_studio_model}
                onChange={(e) => updateSetting('lm_studio_model', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Select the model to use for word definitions and sentence simplification
              </p>
            </div>
          )}

          {settings.lm_studio_model !== 'default' && availableModels.length === 0 && (
            <div className="text-sm text-gray-500">
              Current model: <span className="font-medium">{settings.lm_studio_model}</span>
              <br />
              <span className="text-xs">Test connection to see available models</span>
            </div>
          )}
        </div>
      </div>

      {/* Tatoeba Settings */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          🌐 Tatoeba (Example Sentences)
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-700">Enable Tatoeba</div>
              <div className="text-sm text-gray-500">
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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>

          {settings.tatoeba_enabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Language
              </label>
              <select
                value={settings.tatoeba_language}
                onChange={(e) => updateSetting('tatoeba_language', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          📖 Reading Preferences
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Zoom: {settings.default_zoom.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={settings.default_zoom}
              onChange={(e) => updateSetting('default_zoom', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Font Family
            </label>
            <select
              value={settings.font_family}
              onChange={(e) => updateSetting('font_family', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="Georgia, serif">Georgia (Serif)</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="system-ui, sans-serif">System Sans-Serif</option>
              <option value="'Courier New', monospace">Courier (Monospace)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Line Height: {settings.line_height.toFixed(1)}
            </label>
            <input
              type="range"
              min="1.2"
              max="2.5"
              step="0.1"
              value={settings.line_height}
              onChange={(e) => updateSetting('line_height', parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
