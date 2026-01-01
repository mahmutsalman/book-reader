import React from 'react';
import './FocusModeButton.css';
import { useReaderTheme } from '../../hooks/useReaderTheme';
import { addAlpha, adjustColor, getContrastColor } from '../../utils/colorUtils';

interface FocusModeButtonProps {
  onClick: () => void;
  isFocusMode: boolean;
}

/**
 * Button component for toggling Focus Mode
 * Hides all UI elements for distraction-free reading
 */
export const FocusModeButton: React.FC<FocusModeButtonProps> = ({
  onClick,
  isFocusMode,
}) => {
  const theme = useReaderTheme();
  const accentTextColor = getContrastColor(theme.accent);
  const baseBackground = theme.panelBorder;
  const hoverBackground = adjustColor(theme.panelBorder, 6);
  const activeBackground = adjustColor(theme.panelBorder, -6);
  const activeModeBackground = theme.accent;
  const activeModeHover = adjustColor(theme.accent, 8);
  const baseShadow = `0 2px 4px ${addAlpha(theme.text, 0.2)}`;
  const hoverShadow = `0 4px 8px ${addAlpha(theme.text, 0.25)}`;
  const activeShadow = `0 2px 4px ${addAlpha(theme.accent, 0.25)}`;
  const activeHoverShadow = `0 4px 8px ${addAlpha(theme.accent, 0.35)}`;

  const getTooltipText = (): string => {
    return isFocusMode ? 'Exit Focus Mode (ESC)' : 'Enter Focus Mode';
  };

  const buttonStyle = {
    '--focus-bg': baseBackground,
    '--focus-bg-hover': hoverBackground,
    '--focus-bg-active': activeBackground,
    '--focus-text': theme.textSecondary,
    '--focus-border': theme.border,
    '--focus-shadow': baseShadow,
    '--focus-shadow-hover': hoverShadow,
    '--focus-active-bg': activeModeBackground,
    '--focus-active-bg-hover': activeModeHover,
    '--focus-active-text': accentTextColor,
    '--focus-active-border': activeModeBackground,
    '--focus-active-shadow': activeShadow,
    '--focus-active-shadow-hover': activeHoverShadow,
  } as React.CSSProperties;

  return (
    <button
      className={`focus-mode-button ${isFocusMode ? 'active' : ''}`}
      onClick={onClick}
      title={getTooltipText()}
      aria-label={getTooltipText()}
      style={buttonStyle}
    >
      <span className="button-icon">
        {isFocusMode ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Exit icon (X in a minimize box) */}
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Focus icon (target/crosshair) */}
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        )}
      </span>
      <span className="button-text">
        {isFocusMode ? 'Exit Focus' : 'Focus Mode'}
      </span>
    </button>
  );
};
