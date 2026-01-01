import React, { useEffect, useRef } from 'react';
import type { VocabularyExportType } from '../../../shared/types/ipc.types';
import { useReaderTheme } from '../../hooks/useReaderTheme';
import { addAlpha } from '../../utils/colorUtils';

interface ExportContextMenuProps {
  x: number;
  y: number;
  onExportSelect: (exportType: VocabularyExportType) => void;
  onClose: () => void;
  entriesCount: number;
}

interface ExportOption {
  type: VocabularyExportType;
  icon: string;
  label: string;
  description: string;
}

export const ExportContextMenu: React.FC<ExportContextMenuProps> = ({
  x,
  y,
  onExportSelect,
  onClose,
  entriesCount,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const theme = useReaderTheme();

  const exportOptions: ExportOption[] = [
    {
      type: 'words-only',
      icon: '📝',
      label: 'Export Words Only',
      description: 'One word per line',
    },
    {
      type: 'words-context',
      icon: '📄',
      label: 'Export with Context',
      description: 'Words with full sentences (TAB-separated)',
    },
    {
      type: 'short-meaning',
      icon: '💡',
      label: 'Export with Short Meaning',
      description: 'Words with brief definitions (colon-separated)',
    },
  ];

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
  const menuHeight = exportOptions.length * 70 + 60; // Approximate height
  const adjustedX = Math.min(x, window.innerWidth - 320); // 320px is menu width + padding
  const adjustedY = Math.min(y, window.innerHeight - menuHeight);

  const handleOptionClick = (exportType: VocabularyExportType) => {
    onExportSelect(exportType);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded-lg shadow-2xl border py-2 min-w-[300px]"
      style={{
        left: `${adjustedX}px`,
        top: `${adjustedY}px`,
        animation: 'fadeIn 0.15s ease-out',
        backgroundColor: theme.panel,
        borderColor: theme.panelBorder,
        color: theme.text,
      }}
    >
      <div
        className="px-3 py-2 border-b"
        style={{ borderBottomColor: theme.border }}
      >
        <h3 className="text-sm font-semibold" style={{ color: theme.text }}>
          Export Vocabulary ({entriesCount} {entriesCount === 1 ? 'entry' : 'entries'})
        </h3>
      </div>

      {exportOptions.map((option) => (
        <button
          key={option.type}
          onClick={() => handleOptionClick(option.type)}
          disabled={entriesCount === 0}
          className="w-full flex items-center gap-3 px-3 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onMouseEnter={(event) => {
            event.currentTarget.style.backgroundColor = theme.wordHover || addAlpha(theme.panel, 0.6);
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {/* Icon */}
          <div className="text-2xl flex-shrink-0">
            {option.icon}
          </div>

          {/* Option info */}
          <div className="flex-1 text-left">
            <div className="text-sm font-medium" style={{ color: theme.text }}>
              {option.label}
            </div>
            <p className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
              {option.description}
            </p>
          </div>
        </button>
      ))}

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
