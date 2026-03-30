import React, { useState } from 'react';
import { useReaderTheme } from '../hooks/useReaderTheme';
import { addAlpha, getContrastColor } from '../utils/colorUtils';

interface UpdateReadyBannerProps {
  onInstall: () => void;
  onDismiss: () => void;
}

const UpdateReadyBanner: React.FC<UpdateReadyBannerProps> = ({ onInstall, onDismiss }) => {
  const theme = useReaderTheme();
  const accentTextColor = getContrastColor(theme.accent);
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    await onInstall();
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-3 shadow-lg"
      style={{
        backgroundColor: theme.panel,
        borderTop: `1px solid ${theme.panelBorder}`,
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-lg">🔄</span>
        <div>
          <p className="text-sm font-medium" style={{ color: theme.text }}>
            Update downloaded and ready to install
          </p>
          <p className="text-xs" style={{ color: theme.textSecondary }}>
            Restart Smart Book to apply the latest version.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onDismiss}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ color: theme.textSecondary }}
        >
          Later
        </button>
        <button
          onClick={handleInstall}
          disabled={installing}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: theme.accent, color: accentTextColor }}
        >
          {installing ? 'Restarting…' : 'Restart Now'}
        </button>
      </div>
    </div>
  );
};

export default UpdateReadyBanner;
