import React, { useEffect, useRef } from 'react';
import { readerThemes, type ReaderTheme } from '../../config/readerThemes';
import { useSettings } from '../../context/SettingsContext';

interface ThemeContextMenuProps {
  x: number;
  y: number;
  currentTheme: string;
  onThemeSelect: (themeId: string) => void;
  onClose: () => void;
}

export const ThemeContextMenu: React.FC<ThemeContextMenuProps> = ({
  x,
  y,
  currentTheme,
  onThemeSelect,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();

  // Determine if system is in dark mode
  const isDarkMode = React.useMemo(() => {
    if (settings.theme === 'dark') return true;
    if (settings.theme === 'light') return false;
    // 'system' - check OS preference
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [settings.theme]);

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
  const adjustedX = Math.min(x, window.innerWidth - 280); // 280px is menu width + padding
  const adjustedY = Math.min(y, window.innerHeight - (Object.keys(readerThemes).length * 60 + 20));

  const handleThemeClick = (themeId: string) => {
    onThemeSelect(themeId);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 py-2 min-w-[260px]"
      style={{
        left: `${adjustedX}px`,
        top: `${adjustedY}px`,
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Reading Themes
        </h3>
      </div>

      {Object.values(readerThemes).map((theme: ReaderTheme) => (
        <button
          key={theme.id}
          onClick={() => handleThemeClick(theme.id)}
          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {/* Theme color preview swatch */}
          <div
            className="w-8 h-8 rounded-md border-2 border-gray-300 dark:border-gray-600 flex-shrink-0 shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${isDarkMode ? theme.dark.background : theme.light.background} 0%, ${isDarkMode ? theme.dark.background : theme.light.background} 50%, ${isDarkMode ? theme.dark.text : theme.light.text} 50%, ${isDarkMode ? theme.dark.text : theme.light.text} 100%)`,
            }}
          />

          {/* Theme info */}
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {theme.name}
              </span>
              {currentTheme === theme.id && (
                <svg
                  className="w-4 h-4 text-blue-600 dark:text-blue-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {theme.description}
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
