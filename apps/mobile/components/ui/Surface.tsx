import React from 'react';
import { View, ViewProps, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { radius as radiusTokens, spacing, shadows } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

type Level = 'base' | 'elevated' | 'muted' | 'card';

export interface SurfaceProps extends ViewProps {
  level?: Level;
  bordered?: boolean;
  padding?: keyof typeof spacing | number;
  radius?: keyof typeof radiusTokens | number;
  /** Drop a soft card shadow (light mode) — no-op visual weight in dark. */
  elevated?: boolean;
}

function resolve<T extends Record<string, number>>(tokens: T, v: keyof T | number | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  return typeof v === 'number' ? v : tokens[v];
}

/** Themed panel. The building block for Cards, sheets, list containers. */
export function Surface({ level = 'card', bordered = true, padding, radius, elevated, style, ...rest }: SurfaceProps) {
  const { theme, isDark } = useTheme();
  const bg =
    level === 'base' ? theme.surface :
    level === 'muted' ? theme.surfaceMuted :
    level === 'elevated' ? theme.surfaceElevated : theme.card;
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: bg,
          borderRadius: resolve(radiusTokens, radius, radiusTokens.lg),
          padding: resolve(spacing as any, padding, 0),
        },
        bordered && { borderWidth: 1, borderColor: theme.border },
        elevated && !isDark && shadows.card,
        style,
      ]}
    />
  );
}

/** Elevated content card with sensible default padding. */
export function Card({ padding = 'lg', ...rest }: SurfaceProps) {
  return <Surface level="card" elevated padding={padding} {...rest} />;
}

export interface DividerProps {
  style?: StyleProp<ViewStyle>;
  faint?: boolean;
}

export function Divider({ style, faint }: DividerProps) {
  const { theme } = useTheme();
  return <View style={[hairline.line, { backgroundColor: faint ? theme.borderFaint : theme.border }, style]} />;
}

const hairline = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, width: '100%' },
});
