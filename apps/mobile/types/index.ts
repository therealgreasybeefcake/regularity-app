// Domain types now live in @regularity/core (pure TypeScript, shared with the
// API and web live-view). They are re-exported here so existing relative
// imports (`../types`, `../../types`) keep working unchanged.
//
// ThemeColors stays in the app because it depends on React Native's ColorValue,
// which @regularity/core must not import.
export * from '@regularity/core';

import type { ColorValue } from 'react-native';

export interface ThemeColors {
  background: ColorValue;
  card: ColorValue;
  text: ColorValue;
  textSecondary: ColorValue;
  /** Lowest-emphasis text — captions, units, disabled. */
  textMuted: ColorValue;
  border: ColorValue;
  /** Even fainter hairline for dense tables/dividers. */
  borderFaint: ColorValue;
  primary: ColorValue;
  /** Translucent primary tint for chip/section backgrounds. */
  primaryMuted: ColorValue;
  /** Electric highlight (focus rings, live accents, mono emphasis). */
  accent: ColorValue;
  accentMuted: ColorValue;
  // Semantic status colors — distinct from lap-type colors below.
  success: ColorValue;
  danger: ColorValue;
  info: ColorValue;
  /** Pulsing indicator for an active/live session. */
  livePulse: ColorValue;
  // Lap-type colors (scoring semantics).
  bonus: ColorValue;
  base: ColorValue;
  broken: ColorValue;
  changeover: ColorValue;
  safety: ColorValue;
  warning: ColorValue;
  surface: ColorValue;
  surfaceElevated: ColorValue;
  surfaceMuted: ColorValue;
}
