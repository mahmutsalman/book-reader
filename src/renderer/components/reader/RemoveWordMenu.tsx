import React, { useEffect, useRef } from 'react';
import { useReaderTheme } from '../../hooks/useReaderTheme';
import { addAlpha } from '../../utils/colorUtils';

interface RemoveWordMenuProps {
  x: number;
  y: number;
  onRemove: () => void;
  onClose: () => void;
}

export const RemoveWordMenu: React.FC<RemoveWordMenuProps> = ({
  x,
  y,
  onRemove,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const theme = useReaderTheme();

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Close on Escape key
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to prevent overflow
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 100);

  const handleRemoveClick = () => {
    onRemove();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded-lg shadow-2xl border py-2 min-w-[200px]"
      style={{
        left: `${adjustedX}px`,
        top: `${adjustedY}px`,
        animation: 'fadeIn 0.15s ease-out',
        backgroundColor: theme.panel,
        borderColor: theme.panelBorder,
        color: theme.text,
      }}
    >
      <button
        onClick={handleRemoveClick}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
        style={{ color: '#E85D4A' }}
        onMouseEnter={(event) => {
          event.currentTarget.style.backgroundColor = addAlpha('#E85D4A', 0.12);
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {/* Trash icon */}
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>

        <span className="text-sm font-medium">
          Remove This Selection
        </span>
      </button>

      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(-8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
    </div>
  );
};
