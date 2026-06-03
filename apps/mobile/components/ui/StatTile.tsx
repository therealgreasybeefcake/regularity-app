import React from 'react';
import { View, StyleSheet, ViewStyle, ColorValue, StyleProp } from 'react-native';
import { spacing, typography } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Mono, Label } from './Text';

export interface StatTileProps {
  label: string;
  value: string | number;
  unit?: string;
  valueColor?: ColorValue;
  /** Mono numerals (default) vs. plain text value. */
  mono?: boolean;
  size?: 'sm' | 'md' | 'lg';
  align?: 'flex-start' | 'center' | 'flex-end';
  style?: StyleProp<ViewStyle>;
}

const VALUE_SIZE = { sm: typography.title, md: typography.headingLg, lg: typography.display } as const;

/** Label-over-value stat cell — the data-dense unit of Stats / live-view grids. */
export function StatTile({ label, value, unit, valueColor, mono = true, size = 'md', align = 'flex-start', style }: StatTileProps) {
  const { theme } = useTheme();
  const valueSize = VALUE_SIZE[size];
  return (
    <View style={[{ alignItems: align }, style]}>
      <Label muted style={{ marginBottom: 4 }}>{label}</Label>
      <View style={styles.valueRow}>
        {mono ? (
          <Mono size={valueSize} weight="bold" color={valueColor ?? theme.text} tight={size === 'lg'}>
            {String(value)}
          </Mono>
        ) : (
          <Mono size={valueSize} weight="bold" color={valueColor ?? theme.text}>{String(value)}</Mono>
        )}
        {unit ? <Label muted style={{ marginLeft: 4, marginBottom: 3 }}>{unit}</Label> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, paddingTop: spacing.xs / 2 },
});
