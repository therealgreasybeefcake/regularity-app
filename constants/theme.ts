import { Platform } from 'react-native';
import { ThemeColors } from '../types';

let Color: any = null;
try {
  Color = require('expo-router').Color;
} catch {
  // Color not available (web or older expo-router)
}

// --- Design Tokens ---

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 9999 } as const;

export const typography = {
  caption: 12, body: 14, bodyLg: 16, title: 18, heading: 20, display: 48,
} as const;

export const fontWeights = {
  medium: '500' as const, semibold: '600' as const, bold: '700' as const,
};

export const shadows = {
  subtle: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  card: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  modal: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
};

export const glass = {
  blurIntensity: 80,
  glassOpacity: 0.7,
  glassBorder: 'rgba(255,255,255,0.18)',
} as const;

export const brandColors = {
  coffee: '#FFDD00',
  chartPurple: '#9333ea',
} as const;

// --- Themes ---

// Native colors: use platform system colors where available, with manual fallbacks
const useNativeColors = Color != null && Platform.OS !== 'web';

export const lightTheme: ThemeColors = {
  background: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemGroupedBackground : '#f8fafc',
  card: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.secondarySystemGroupedBackground : '#ffffff',
  text: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.label : '#0f172a',
  textSecondary: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.secondaryLabel : '#64748b',
  border: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.separator : '#e2e8f0',
  primary: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemBlue : '#1e40af',
  bonus: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemGreen : '#22c55e',
  base: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemBlue : '#3b82f6',
  broken: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemRed : '#ef4444',
  changeover: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemPurple : '#9333ea',
  safety: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemYellow : '#eab308',
  warning: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemOrange : '#f97316',
  surface: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemBackground : '#f1f5f9',
  surfaceElevated: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.secondarySystemBackground : '#ffffff',
  surfaceMuted: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.tertiarySystemBackground : '#e2e8f0',
};

export const darkTheme: ThemeColors = {
  background: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemGroupedBackground : useNativeColors
    ? Color.android.dynamic.surfaceContainerLowest ?? '#0c1220' : '#0c1220',
  card: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.secondarySystemGroupedBackground : useNativeColors
    ? Color.android.dynamic.surfaceContainer ?? '#1a2436' : '#1a2436',
  text: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.label : useNativeColors
    ? Color.android.dynamic.onSurface ?? '#f1f5f9' : '#f1f5f9',
  textSecondary: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.secondaryLabel : useNativeColors
    ? Color.android.dynamic.onSurfaceVariant ?? '#94a3b8' : '#94a3b8',
  border: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.separator : useNativeColors
    ? Color.android.dynamic.outlineVariant ?? '#334155' : '#334155',
  primary: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemBlue : useNativeColors
    ? Color.android.dynamic.primary ?? '#3b82f6' : '#3b82f6',
  bonus: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemGreen : '#22c55e',
  base: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemBlue : useNativeColors
    ? Color.android.dynamic.primary ?? '#3b82f6' : '#3b82f6',
  broken: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemRed : useNativeColors
    ? Color.android.dynamic.error ?? '#ef4444' : '#ef4444',
  changeover: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemPurple : '#9333ea',
  safety: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemYellow : '#eab308',
  warning: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemOrange : '#f97316',
  surface: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.systemBackground : useNativeColors
    ? Color.android.dynamic.surface ?? '#162032' : '#162032',
  surfaceElevated: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.secondarySystemBackground : useNativeColors
    ? Color.android.dynamic.surfaceContainerHigh ?? '#1e2d42' : '#1e2d42',
  surfaceMuted: useNativeColors && Platform.OS === 'ios'
    ? Color.ios.tertiarySystemBackground : useNativeColors
    ? Color.android.dynamic.surfaceContainerLow ?? '#0f1a2a' : '#0f1a2a',
};
