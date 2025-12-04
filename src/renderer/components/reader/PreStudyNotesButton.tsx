import React from 'react';
import type { PreStudyProgress } from '../../../shared/types/pre-study-notes.types';
import './PreStudyNotesButton.css';

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

  return (
    <button
      className={`pre-study-button ${isGenerating ? 'generating' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={onClick}
      disabled={disabled || isGenerating}
      title={getTooltipText()}
      aria-label={getTooltipText()}
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
