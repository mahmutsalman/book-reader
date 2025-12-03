import { useEffect, useCallback } from 'react';
import { useSettings } from '../context/SettingsContext';

/**
 * Hook that manages theme application based on settings.
 * Handles light, dark, and system preference modes.
 * Applies 'dark' class to <html> element for Tailwind dark mode.
 */
export const useTheme = () => {
  const { settings, loading } = useSettings();

  const applyTheme = useCallback((isDark: boolean) => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const getSystemPreference = useCallback(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, []);

  useEffect(() => {
    if (loading) return;

    const theme = settings.theme;

    if (theme === 'dark') {
      applyTheme(true);
    } else if (theme === 'light') {
      applyTheme(false);
    } else {
      // System preference
      applyTheme(getSystemPreference());
    }
  }, [settings.theme, loading, applyTheme, getSystemPreference]);

  // Listen for system preference changes when in 'system' mode
  useEffect(() => {
    if (loading || settings.theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      applyTheme(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [settings.theme, loading, applyTheme]);

  return {
    isDark: document.documentElement.classList.contains('dark'),
    theme: settings.theme,
  };
};

export default useTheme;
