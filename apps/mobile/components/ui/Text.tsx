import React from 'react';
import { Text, TextProps, StyleSheet, TextStyle, ColorValue } from 'react-native';
import { fonts, typography } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

type MonoWeight = 'regular' | 'medium' | 'bold' | 'extrabold';

const MONO_FAMILY: Record<MonoWeight, string> = {
  regular: fonts.mono,
  medium: fonts.monoMedium,
  bold: fonts.monoBold,
  extrabold: fonts.monoExtraBold,
};

export interface MonoProps extends TextProps {
  size?: number;
  weight?: MonoWeight;
  color?: ColorValue;
  /** Slightly negative tracking reads tighter for large clock displays. */
  tight?: boolean;
}

/** Tabular JetBrains Mono numerals — lap times, deltas, the hero clock. */
export function Mono({ size = typography.bodyLg, weight = 'medium', color, tight, style, ...rest }: MonoProps) {
  const { theme } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: MONO_FAMILY[weight], fontSize: size, color: color ?? theme.text, letterSpacing: tight ? -1 : 0 },
        style,
      ]}
    />
  );
}

export interface LabelProps extends TextProps {
  size?: number;
  color?: ColorValue;
  muted?: boolean;
}

/** Uppercase, letter-spaced section label — the "% FACTOR" / "RECENT LAPS" style. */
export function Label({ size = typography.label, color, muted, style, children, ...rest }: LabelProps) {
  const { theme } = useTheme();
  return (
    <Text
      {...rest}
      style={[styles.label, { fontSize: size, color: color ?? (muted ? theme.textMuted : theme.textSecondary) }, style]}
    >
      {typeof children === 'string' ? children.toUpperCase() : children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '700', letterSpacing: 1.5 } as TextStyle,
});
