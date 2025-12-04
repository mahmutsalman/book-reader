import React, { useState } from 'react';
import type { PreStudyProgress } from '../../../shared/types/pre-study-notes.types';
import './FloatingProgressPanel.css';

interface FloatingProgressPanelProps {
  progress: PreStudyProgress | null;
  isVisible: boolean;
  onCancel?: () => void;
}

/**
 * Floating panel that shows pre-study notes generation progress
 * Appears in the bottom-right corner during generation
 */
export const FloatingProgressPanel: React.FC<FloatingProgressPanelProps> = ({
  progress,
  isVisible,
  onCancel,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isVisible || !progress) {
    return null;
  }

  const getPhaseLabel = (): string => {
    switch (progress.phase) {
      case 'extracting':
        return 'Extracting words...';
      case 'processing':
        return 'Processing';
      case 'generating':
        return 'Finalizing...';
      default:
        return 'Working...';
    }
  };

  const getPhaseClass = (): string => {
    return `phase-badge phase-${progress.phase}`;
  };

  const getProgressPercent = (): number => {
    if (!progress.total || progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  const formatTimeRemaining = (): string | null => {
    if (!progress.estimatedTimeRemaining || progress.estimatedTimeRemaining <= 0) {
      return null;
    }

    const seconds = progress.estimatedTimeRemaining;
    if (seconds < 60) {
      return `~${seconds}s remaining`;
    }

    const minutes = Math.ceil(seconds / 60);
    return `~${minutes} min remaining`;
  };

  const percent = getProgressPercent();
  const timeRemaining = formatTimeRemaining();

  // Minimized view - just progress bar
  if (isMinimized) {
    return (
      <div className="floating-progress-panel minimized">
        <div className="minimized-content">
          <span className="minimized-text">{percent}%</span>
          <div className="progress-bar-mini">
            <div
              className="progress-fill-mini"
              style={{ width: `${percent}%` }}
            />
          </div>
          <button
            className="expand-btn"
            onClick={() => setIsMinimized(false)}
            title="Expand"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Full view
  return (
    <div className="floating-progress-panel">
      <div className="panel-header">
        <div className="panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span>Generating Notes</span>
        </div>
        <button
          className="minimize-btn"
          onClick={() => setIsMinimized(true)}
          title="Minimize"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="panel-body">
        <div className="phase-row">
          <span className={getPhaseClass()}>{getPhaseLabel()}</span>
        </div>

        {progress.phase === 'processing' && progress.currentWord && (
          <div className="current-word">
            <span className="label">Current:</span>
            <span className="word">"{progress.currentWord}"</span>
          </div>
        )}

        {progress.total > 0 && (
          <div className="progress-count">
            <span className="label">Progress:</span>
            <span className="count">{progress.current} of {progress.total} words</span>
          </div>
        )}

        <div className="progress-bar-container">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="progress-percent">{percent}%</span>
        </div>

        {timeRemaining && (
          <div className="time-remaining">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{timeRemaining}</span>
          </div>
        )}
      </div>

      {onCancel && (
        <div className="panel-footer">
          <button
            className="cancel-btn"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default FloatingProgressPanel;
