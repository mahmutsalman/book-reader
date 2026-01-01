/**
 * useReaderTheme Hook
 *
 * Provides dynamic access to the current reader theme colors based on:
 * - Selected reader theme (Sepia Classic, Dark Comfort, True Black, Ocean Blue, Forest Green, Purple Twilight)
 * - Current dark/light mode setting
 *
 * This hook is the single source of truth for theme colors throughout the application.
 * Use this hook in any component that needs to respect the current reader theme.
 *
 * @example
 * ```tsx
 * const theme = useReaderTheme();
 *
 * // Use in inline styles
 * <div style={{ backgroundColor: theme.panel, borderColor: theme.accent }}>
 *   <p style={{ color: theme.text }}>Content</p>
 * </div>
 * ```
 */

import { useMemo } from 'react';
import { readerThemes } from '../config/readerThemes';
import { useSettings } from '../context/SettingsContext';

export interface ReaderThemeColors {
  background: string;
  text: string;
  textSecondary: string;
  accent: string;
  border: string;
  panel: string;
  panelBorder: string;
  wordHover: string;
  wordSelected: string;
  shadow: string;
}

/**
 * Hook to get current reader theme colors based on selected theme and dark mode
 *
 * @returns Current theme colors object with all color properties
 *
 * Color Properties:
 * - background: Main background color
 * - text: Primary text color
 * - textSecondary: Secondary/muted text color
 * - accent: Accent/highlight color (golden for Dark Comfort, blue for Ocean, etc.)
 * - border: Border color
 * - panel: Panel background color (for definition boxes, content areas)
 * - panelBorder: Panel border color
 * - wordHover: Word hover state color
 * - wordSelected: Word selection color
 * - shadow: Shadow effect color
 */
export function useReaderTheme(): ReaderThemeColors {
  const { settings } = useSettings();

  // Determine if system is in dark mode
  const isDarkMode = useMemo(() => {
    if (settings.theme === 'dark') return true;
    if (settings.theme === 'light') return false;
    // 'system' - check OS preference
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }, [settings.theme]);

  // Get current theme colors based on reader_theme setting and dark mode
  return useMemo(() => {
    const currentTheme = readerThemes[settings.reader_theme] || readerThemes.darkComfort;
    return isDarkMode ? currentTheme.dark : currentTheme.light;
  }, [settings.reader_theme, isDarkMode]);
}
