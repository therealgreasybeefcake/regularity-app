import { useApp } from '../context/AppContext';
import { darkTheme, lightTheme } from '../constants/theme';
import type { ThemeColors } from '../types';

/**
 * Resolved Pit Wall palette for the active mode. Single source of truth for the
 * UI primitives and screens — replaces the inline
 * `const theme = isDarkMode ? darkTheme : lightTheme` pattern.
 */
export function useTheme(): { theme: ThemeColors; isDark: boolean } {
  const { isDarkMode } = useApp();
  return { theme: isDarkMode ? darkTheme : lightTheme, isDark: isDarkMode };
}
