import { ThemeColors } from '../types';

// --- Design Tokens ---

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 9999 } as const;

export const typography = {
  micro: 10, label: 11, caption: 12, body: 14, bodyLg: 16, title: 18,
  heading: 20, headingLg: 24, display: 48, hero: 64,
} as const;

export const fontWeights = {
  medium: '500' as const, semibold: '600' as const, bold: '700' as const, heavy: '800' as const,
};

// JetBrains Mono — telemetry/lap-time numerals. Registered in app/_layout.tsx.
export const fonts = {
  mono: 'JetBrainsMono-Regular',
  monoMedium: 'JetBrainsMono-Medium',
  monoBold: 'JetBrainsMono-Bold',
  monoExtraBold: 'JetBrainsMono-ExtraBold',
} as const;

export const shadows = {
  subtle: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  card: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  modal: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
  // Neon halo for live indicators / the hero clock. Override shadowColor per use.
  glow: { shadowColor: '#22d3ee', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 14, elevation: 8 },
};

/** A colored glow (override the default cyan) for live dots, focused fields, etc. */
export const glowShadow = (color: string, opacity = 0.55, blur = 14) => ({
  shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: opacity, shadowRadius: blur, elevation: 8,
});

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
// Curated "Pit Wall" palettes — applied consistently across iOS/Android/web so the
// dark-first, data-dense identity reads the same everywhere (we intentionally no
// longer defer the core surfaces to platform system colors).

// Dark — near-black instrumentation panel.
export const darkTheme: ThemeColors = {
  background: '#070a11',
  card: '#121826',
  text: '#e8eef7',
  textSecondary: '#8a97ab',
  textMuted: '#5d6a7e',
  border: 'rgba(255,255,255,0.08)',
  borderFaint: 'rgba(255,255,255,0.04)',
  primary: '#3b82f6',
  primaryMuted: 'rgba(59,130,246,0.16)',
  accent: '#22d3ee',
  accentMuted: 'rgba(34,211,238,0.14)',
  success: '#22c55e',
  danger: '#ef4444',
  info: '#3b82f6',
  livePulse: '#22d36b',
  bonus: '#22c55e',
  base: '#3b82f6',
  broken: '#ef4444',
  changeover: '#a855f7',
  safety: '#eab308',
  warning: '#f97316',
  surface: '#0d1320',
  surfaceElevated: '#18202f',
  surfaceMuted: '#0b101c',
};

// Light — bright "daylight pit wall": clean, high-contrast, same structure.
export const lightTheme: ThemeColors = {
  background: '#eef1f6',
  card: '#ffffff',
  text: '#0b1220',
  textSecondary: '#566174',
  textMuted: '#8a93a3',
  border: 'rgba(15,23,42,0.10)',
  borderFaint: 'rgba(15,23,42,0.06)',
  primary: '#2563eb',
  primaryMuted: 'rgba(37,99,235,0.10)',
  accent: '#0891b2',
  accentMuted: 'rgba(8,145,178,0.10)',
  success: '#16a34a',
  danger: '#dc2626',
  info: '#2563eb',
  livePulse: '#16a34a',
  bonus: '#16a34a',
  base: '#2563eb',
  broken: '#dc2626',
  changeover: '#9333ea',
  safety: '#ca8a04',
  warning: '#ea580c',
  surface: '#f4f6fa',
  surfaceElevated: '#ffffff',
  surfaceMuted: '#e6eaf1',
};
