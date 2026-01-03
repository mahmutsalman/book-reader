/**
 * Loop toggle button component for controlling repeat mode.
 * When enabled, pronunciation and slow motion buttons will loop indefinitely.
 * When disabled, they play once and stop.
 */
import React from 'react';
import { useReaderTheme } from '../../hooks/useReaderTheme';

interface LoopPlayButtonProps {
  isRepeatMode: boolean;
  onToggle: () => void;
  className?: string;
  size?: 'sm' | 'md';
  title?: string;
}

const LoopPlayButton: React.FC<LoopPlayButtonProps> = ({
  isRepeatMode,
  onToggle,
  className = '',
  size = 'md',
  title = 'Toggle repeat mode',
}) => {
  const theme = useReaderTheme();

  // Size classes
  const sizeClasses = size === 'sm'
    ? 'w-6 h-6 text-sm'
    : 'w-8 h-8 text-base';

  // Repeat/loop icon
  const getIcon = () => {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 1l4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <path d="M7 23l-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
    );
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${sizeClasses} flex items-center justify-center rounded-full transition-all ${className}`}
      style={
        isRepeatMode
          ? {
              color: theme.accent,
              backgroundColor: theme.panel
            }
          : {
              color: theme.textSecondary
            }
      }
      onMouseEnter={(e) => {
        if (!isRepeatMode) {
          e.currentTarget.style.color = theme.accent;
          e.currentTarget.style.backgroundColor = 'rgba(128, 128, 128, 0.1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isRepeatMode) {
          e.currentTarget.style.color = theme.textSecondary;
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
      title={isRepeatMode ? 'Disable repeat mode' : title}
    >
      <span className="w-4 h-4">
        {getIcon()}
      </span>
    </button>
  );
};

export default LoopPlayButton;
