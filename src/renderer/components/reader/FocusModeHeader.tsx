import React from 'react';

interface FocusModeHeaderProps {
  isGrammarMode: boolean;
  isMeaningMode: boolean;
  onToggleGrammar: () => void;
  onToggleMeaning: () => void;
}

const FocusModeHeader: React.FC<FocusModeHeaderProps> = ({
  isGrammarMode,
  isMeaningMode,
  onToggleGrammar,
  onToggleMeaning,
}) => {
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center py-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm pointer-events-auto app-no-drag">
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Grammar Mode Button */}
        <button
          onClick={onToggleGrammar}
          className={`
            px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer
            ${
              isGrammarMode
                ? 'bg-gray-500 dark:bg-gray-500 text-white border-2 border-gray-700 dark:border-gray-300 shadow-md'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 hover:bg-gray-300 dark:hover:bg-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }
          `}
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
          className={`
            px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer
            ${
              isMeaningMode
                ? 'bg-gray-500 dark:bg-gray-500 text-white border-2 border-gray-700 dark:border-gray-300 shadow-md'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 hover:bg-gray-300 dark:hover:bg-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }
          `}
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
      </div>
    </div>
  );
};

export default FocusModeHeader;
