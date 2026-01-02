import React from 'react';
import { useReaderTheme } from '../../hooks/useReaderTheme';
import { addAlpha, getContrastColor } from '../../utils/colorUtils';

interface FocusModeHeaderProps {
  isGrammarMode: boolean;
  isMeaningMode: boolean;
  isSimplerMode: boolean;
  onToggleGrammar: () => void;
  onToggleMeaning: () => void;
  onToggleSimpler: () => void;
}

const FocusModeHeader: React.FC<FocusModeHeaderProps> = ({
  isGrammarMode,
  isMeaningMode,
  isSimplerMode,
  onToggleGrammar,
  onToggleMeaning,
  onToggleSimpler,
}) => {
  const theme = useReaderTheme();
  const accentTextColor = getContrastColor(theme.accent);
  const hoverFill = theme.wordHover || addAlpha(theme.panel, 0.5);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center py-2 backdrop-blur-sm pointer-events-auto app-no-drag"
      style={{ backgroundColor: addAlpha(theme.panel, 0.85), color: theme.text }}
    >
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Grammar Mode Button */}
        <button
          onClick={onToggleGrammar}
          className="px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer"
          style={{
            backgroundColor: isGrammarMode ? theme.accent : theme.panelBorder,
            color: isGrammarMode ? accentTextColor : theme.textSecondary,
            border: `1px solid ${isGrammarMode ? theme.accent : theme.border}`,
            boxShadow: isGrammarMode ? `0 6px 14px ${addAlpha(theme.accent, 0.25)}` : 'none',
          }}
          onMouseEnter={(event) => {
            if (!isGrammarMode) {
              event.currentTarget.style.backgroundColor = hoverFill;
            }
          }}
          onMouseLeave={(event) => {
            if (!isGrammarMode) {
              event.currentTarget.style.backgroundColor = theme.panelBorder;
            }
          }}
          title={isGrammarMode ? 'Grammar Mode ON - Click to disable' : 'Grammar Mode OFF - Click to enable'}
        >
          <div className="flex items-center gap-1.5">
            {/* Grammar icon */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span>Grammar</span>
            {isGrammarMode && <span className="ml-1 text-xs">●</span>}
          </div>
        </button>

        {/* Meaning Mode Button */}
        <button
          onClick={onToggleMeaning}
          className="px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer"
          style={{
            backgroundColor: isMeaningMode ? theme.accent : theme.panelBorder,
            color: isMeaningMode ? accentTextColor : theme.textSecondary,
            border: `1px solid ${isMeaningMode ? theme.accent : theme.border}`,
            boxShadow: isMeaningMode ? `0 6px 14px ${addAlpha(theme.accent, 0.25)}` : 'none',
          }}
          onMouseEnter={(event) => {
            if (!isMeaningMode) {
              event.currentTarget.style.backgroundColor = hoverFill;
            }
          }}
          onMouseLeave={(event) => {
            if (!isMeaningMode) {
              event.currentTarget.style.backgroundColor = theme.panelBorder;
            }
          }}
          title={isMeaningMode ? 'Meaning Mode ON - Click to disable' : 'Meaning Mode OFF - Click to enable'}
        >
          <div className="flex items-center gap-1.5">
            {/* Meaning icon */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Meaning</span>
            {isMeaningMode && <span className="ml-1 text-xs">●</span>}
          </div>
        </button>

        {/* Simpler Mode Button */}
        <button
          onClick={onToggleSimpler}
          className="px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer"
          style={{
            backgroundColor: isSimplerMode ? theme.accent : theme.panelBorder,
            color: isSimplerMode ? accentTextColor : theme.textSecondary,
            border: `1px solid ${isSimplerMode ? theme.accent : theme.border}`,
            boxShadow: isSimplerMode ? `0 6px 14px ${addAlpha(theme.accent, 0.25)}` : 'none',
          }}
          onMouseEnter={(event) => {
            if (!isSimplerMode) {
              event.currentTarget.style.backgroundColor = hoverFill;
            }
          }}
          onMouseLeave={(event) => {
            if (!isSimplerMode) {
              event.currentTarget.style.backgroundColor = theme.panelBorder;
            }
          }}
          title={isSimplerMode ? 'Simpler Mode ON - Click to disable' : 'Simpler Mode OFF - Click to enable'}
        >
          <div className="flex items-center gap-1.5">
            {/* Lightbulb icon */}
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
            </svg>
            <span>Simpler</span>
            {isSimplerMode && <span className="ml-1 text-xs">●</span>}
          </div>
        </button>
      </div>
    </div>
  );
};

export default FocusModeHeader;
