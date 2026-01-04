import React, { useState, useEffect } from 'react';
import { useReaderTheme } from '../../hooks/useReaderTheme';
import { addAlpha, getContrastColor } from '../../utils/colorUtils';

interface OCRInstallPromptProps {
  onClose: () => void;
  onInstallComplete?: () => void;
}

export const OCRInstallPrompt: React.FC<OCRInstallPromptProps> = ({ onClose, onInstallComplete }) => {
  const theme = useReaderTheme();
  const accentTextColor = getContrastColor(theme.accent);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleInstallNow = async () => {
    setInstalling(true);
    setError(null);

    try {
      const res = await fetch('http://127.0.0.1:8766/api/ocr/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: 'paddleocr' })
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.message || 'Installation failed');
        setInstalling(false);
        return;
      }

      // Poll installation progress
      const interval = setInterval(async () => {
        try {
          const progressRes = await fetch(
            'http://127.0.0.1:8766/api/ocr/install/progress/paddleocr'
          );
          const progressData = await progressRes.json();

          setProgress(progressData.progress);

          if (progressData.progress >= 100) {
            clearInterval(interval);
            setInstalling(false);
            onInstallComplete?.();
            setTimeout(() => {
              onClose();
            }, 1000);
          } else if (progressData.progress < 0) {
            // Installation failed
            clearInterval(interval);
            setInstalling(false);
            setError('Installation failed. Please try again from Settings.');
          }
        } catch (err) {
          clearInterval(interval);
          setInstalling(false);
          setError('Failed to check installation progress');
        }
      }, 1000);
    } catch (err) {
      console.error('Installation failed:', err);
      setInstalling(false);
      setError('Failed to start installation. Is the Python server running?');
    }
  };

  const handleGoToSettings = () => {
    // Navigate to settings page
    window.location.hash = '#/settings';
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: addAlpha(theme.background, 0.9) }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
        style={{
          backgroundColor: theme.panel,
          color: theme.text,
          border: `1px solid ${theme.panelBorder}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4"
          style={{ backgroundColor: theme.accent, color: accentTextColor }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">OCR Engine Required</h3>
            {!installing && (
              <button
                onClick={onClose}
                className="text-2xl leading-none hover:opacity-80"
                style={{ color: accentTextColor }}
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {!installing ? (
            <>
              <p className="mb-4" style={{ color: theme.text }}>
                OCR (text recognition) requires PaddleOCR engine to be installed.
              </p>
              <div
                className="mb-4 p-3 rounded-lg"
                style={{
                  backgroundColor: addAlpha(theme.accent, 0.1),
                  border: `1px solid ${addAlpha(theme.accent, 0.2)}`,
                }}
              >
                <p className="text-sm mb-2" style={{ color: theme.text }}>
                  <strong>Download size:</strong> ~800MB
                </p>
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  OCR packages are stored in your user data directory and persist across app updates.
                </p>
              </div>

              {error && (
                <div
                  className="mb-4 p-3 rounded-lg"
                  style={{
                    backgroundColor: addAlpha('#E85D4A', 0.2),
                    border: `1px solid ${addAlpha('#E85D4A', 0.3)}`,
                    color: '#E85D4A',
                  }}
                >
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={handleInstallNow}
                  className="w-full py-3 rounded-lg font-medium transition-opacity hover:opacity-90"
                  style={{ backgroundColor: theme.accent, color: accentTextColor }}
                >
                  Install Now (~800MB)
                </button>
                <button
                  onClick={handleGoToSettings}
                  className="w-full py-3 rounded-lg font-medium transition-colors"
                  style={{
                    backgroundColor: 'transparent',
                    color: theme.textSecondary,
                    border: `1px solid ${theme.border}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = addAlpha(theme.panel, 0.5);
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  Go to Settings
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-2 text-sm transition-opacity hover:opacity-70"
                  style={{ color: theme.textSecondary }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-center font-medium" style={{ color: theme.text }}>
                Installing PaddleOCR...
              </p>
              <div
                className="w-full h-8 rounded-lg overflow-hidden"
                style={{ backgroundColor: theme.panelBorder }}
              >
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: theme.accent,
                  }}
                />
              </div>
              <p className="text-center text-2xl font-bold" style={{ color: theme.accent }}>
                {progress}%
              </p>
              <p className="text-center text-sm" style={{ color: theme.textSecondary }}>
                This may take a few minutes. Please wait...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
