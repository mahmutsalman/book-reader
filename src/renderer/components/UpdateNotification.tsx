import React from 'react';
import { useReaderTheme } from '../hooks/useReaderTheme';
import { addAlpha, getContrastColor } from '../utils/colorUtils';
import type { UpdateCheckResult } from '../../shared/types/update.types';

interface UpdateNotificationProps {
  updateInfo: UpdateCheckResult;
  onDownload: () => void;
  onSkip: () => void;
  onRemindLater: () => void;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  updateInfo,
  onDownload,
  onSkip,
  onRemindLater,
}) => {
  const theme = useReaderTheme();
  const accentTextColor = getContrastColor(theme.accent);
  const hoverFill = theme.wordHover || addAlpha(theme.panel, 0.5);

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      // Check for invalid date
      if (isNaN(date.getTime())) return null;
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  };

  const formattedReleaseDate = formatDate(updateInfo.releaseDate);
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const isWindows = navigator.platform.toLowerCase().includes('win');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: theme.shadow }}
    >
      <div
        className="rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
        style={{
          backgroundColor: theme.panel,
          color: theme.text,
          border: `1px solid ${theme.panelBorder}`,
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4"
          style={{ backgroundColor: theme.accent, color: accentTextColor }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <h3 id="update-modal-title" className="text-xl font-bold">Update Available</h3>
              <p className="text-sm opacity-90">
                Smart Book v{updateInfo.latestVersion} is ready
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Version Info */}
          <div
            className="flex items-center justify-between p-3 rounded-lg mb-4"
            style={{ backgroundColor: theme.background }}
          >
            <div className="text-sm" style={{ color: theme.textSecondary }}>
              Current version
            </div>
            <div className="font-mono font-medium">v{updateInfo.currentVersion}</div>
          </div>

          <div
            className="flex items-center justify-between p-3 rounded-lg mb-4"
            style={{
              backgroundColor: addAlpha(theme.accent, 0.1),
              border: `1px solid ${addAlpha(theme.accent, 0.3)}`,
            }}
          >
            <div className="text-sm" style={{ color: theme.textSecondary }}>
              New version
            </div>
            <div className="font-mono font-medium" style={{ color: theme.accent }}>
              v{updateInfo.latestVersion}
            </div>
          </div>

          {/* Release Date */}
          {formattedReleaseDate && (
            <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
              Released on {formattedReleaseDate}
            </p>
          )}

          {/* Changelog */}
          {updateInfo.changelog && updateInfo.changelog.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                What's New
              </h4>
              <ul
                className="text-sm space-y-1 pl-4"
                style={{ color: theme.text }}
              >
                {updateInfo.changelog.slice(0, 5).map((item, index) => (
                  <li key={index} className="list-disc">
                    {item}
                  </li>
                ))}
                {updateInfo.changelog.length > 5 && (
                  <li className="list-none" style={{ color: theme.textSecondary }}>
                    ...and {updateInfo.changelog.length - 5} more changes
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Installation Instructions */}
          <div
            className="p-3 rounded-lg mb-4 text-sm"
            style={{
              backgroundColor: addAlpha(theme.accent, 0.08),
              color: theme.textSecondary,
            }}
          >
            <p className="font-medium mb-2" style={{ color: theme.text }}>
              {isMac ? '🍎 macOS Installation' : isWindows ? '🪟 Windows Installation' : 'Installation'}
            </p>
            {isMac ? (
              <ol className="list-decimal list-inside space-y-1">
                <li>Download the .zip file</li>
                <li>Extract it (double-click)</li>
                <li>Drag <span className="font-medium">Smart Book.app</span> to Applications</li>
                <li>Click "Replace" when prompted</li>
              </ol>
            ) : isWindows ? (
              <ol className="list-decimal list-inside space-y-1">
                <li>Download the .zip file</li>
                <li>Close Smart Book if running</li>
                <li>Extract and replace your current folder</li>
                <li>Run <span className="font-medium">Smart Book.exe</span></li>
              </ol>
            ) : (
              <p>Download and replace your current installation.</p>
            )}
            <p className="mt-2 text-xs opacity-80">
              ✓ Your books, vocabulary, and settings are preserved
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={onDownload}
              className="w-full py-3 rounded-lg font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: theme.accent, color: accentTextColor }}
            >
              Download Update
            </button>

            <div className="flex gap-2">
              <button
                onClick={onRemindLater}
                className="flex-1 py-2 rounded-lg font-medium transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  color: theme.textSecondary,
                  border: `1px solid ${theme.border}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = hoverFill;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Remind Later
              </button>
              <button
                onClick={onSkip}
                className="flex-1 py-2 rounded-lg font-medium transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  color: theme.textSecondary,
                  border: `1px solid ${theme.border}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = hoverFill;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Skip This Version
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;
