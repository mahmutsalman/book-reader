import React from 'react';
import type { PreStudyProgress } from '../../../shared/types/pre-study-notes.types';
import './PreStudyNotesButton.css';
import { useReaderTheme } from '../../hooks/useReaderTheme';
import { addAlpha, adjustColor, getContrastColor } from '../../utils/colorUtils';

interface PreStudyNotesButtonProps {
  onClick: () => void;
  isGenerating: boolean;
  progress: PreStudyProgress | null;
  disabled?: boolean;
}

/**
 * Button component for generating pre-study notes
 * Shows progress when generating
 */
export const PreStudyNotesButton: React.FC<PreStudyNotesButtonProps> = ({
  onClick,
  isGenerating,
  progress,
  disabled = false,
}) => {
  const theme = useReaderTheme();
  const accentTextColor = getContrastColor(theme.accent);
  const baseBackground = theme.accent;
  const hoverBackground = adjustColor(theme.accent, 8);
  const activeBackground = adjustColor(theme.accent, -8);
  const disabledBackground = theme.panelBorder;
  const disabledBorder = theme.border;
  const disabledText = theme.textSecondary;
  const shadow = addAlpha(theme.accent, 0.25);
  const shadowHover = addAlpha(theme.accent, 0.35);
  const progressTrack = addAlpha(accentTextColor, 0.2);
  const progressFill = addAlpha(accentTextColor, 0.8);

  const getTooltipText = (): string => {
    if (disabled) return 'Please wait for current lookups to finish';
    if (isGenerating && progress) {
      const percent = Math.round((progress.current / progress.total) * 100);
      return `Generating: ${percent}% (${progress.currentWord || '...'})`;
    }
    return 'Generate study notes for next 10 pages';
  };

  const getProgressPercent = (): number => {
    if (!progress || progress.total === 0) return 0;
    return (progress.current / progress.total) * 100;
  };

  const buttonStyle = {
    '--prestudy-bg': baseBackground,
    '--prestudy-bg-hover': hoverBackground,
    '--prestudy-bg-active': activeBackground,
    '--prestudy-border': baseBackground,
    '--prestudy-text': accentTextColor,
    '--prestudy-shadow': `0 2px 8px ${shadow}`,
    '--prestudy-shadow-hover': `0 4px 12px ${shadowHover}`,
    '--prestudy-disabled-bg': disabledBackground,
    '--prestudy-disabled-border': disabledBorder,
    '--prestudy-disabled-text': disabledText,
    '--prestudy-progress-track': progressTrack,
    '--prestudy-progress-fill': progressFill,
  } as React.CSSProperties;

  return (
    <button
      className={`pre-study-button ${isGenerating ? 'generating' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={onClick}
      disabled={disabled || isGenerating}
      title={getTooltipText()}
      aria-label={getTooltipText()}
      style={buttonStyle}
    >
      <span className="button-icon">
        {isGenerating ? (
          <svg
            className="spinner"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
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
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="12" y1="6" x2="12" y2="12" />
            <line x1="9" y1="9" x2="15" y2="9" />
          </svg>
        )}
      </span>
      <span className="button-text">
        {isGenerating ? 'Preparing...' : 'Pre-Study'}
      </span>
      {isGenerating && progress && (
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${getProgressPercent()}%` }}
          />
        </div>
      )}
    </button>
  );
};

export default PreStudyNotesButton;
