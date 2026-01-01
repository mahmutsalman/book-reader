import React, { useEffect, useRef } from 'react';
import { useReaderTheme } from '../../hooks/useReaderTheme';
import { addAlpha } from '../../utils/colorUtils';

interface ClearSelectionsMenuProps {
  x: number;
  y: number;
  onClearSelections: () => void;
  onClose: () => void;
  hasSelections: boolean;
}

export const ClearSelectionsMenu: React.FC<ClearSelectionsMenuProps> = ({
  x,
  y,
  onClearSelections,
  onClose,
  hasSelections,
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

  const handleClearClick = () => {
    if (hasSelections) {
      onClearSelections();
    }
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
        onClick={handleClearClick}
        disabled={!hasSelections}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
        style={{
          color: hasSelections ? '#E85D4A' : theme.textSecondary,
          cursor: hasSelections ? 'pointer' : 'not-allowed',
        }}
        onMouseEnter={(event) => {
          if (hasSelections) {
            event.currentTarget.style.backgroundColor = addAlpha('#E85D4A', 0.12);
          }
        }}
        onMouseLeave={(event) => {
          if (hasSelections) {
            event.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        {/* X icon for clear */}
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
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>

        <div className="flex-1">
          <span className="text-sm font-medium">
            Remove Selections
          </span>
          {!hasSelections && (
            <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
              No selections on this page
            </p>
          )}
        </div>
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
