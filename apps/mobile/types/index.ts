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
  border: ColorValue;
  primary: ColorValue;
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
