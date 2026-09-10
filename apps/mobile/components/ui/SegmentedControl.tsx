import React from 'react';
import { View, Pressable, Text, StyleSheet, ViewStyle, ScrollView, StyleProp } from 'react-native';
import { radius, spacing, fontWeights } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

export interface SegmentOption<T extends string> {
  label: string;
  value: T;
  color?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: Array<SegmentOption<T> | T>;
  value: T;
  onChange: (value: T) => void;
  /** Horizontally scroll when there are many segments (e.g. driver tabs). */
  scrollable?: boolean;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({ options, value, onChange, scrollable, size = 'md', style }: SegmentedControlProps<T>) {
  const { theme } = useTheme();
  const opts = options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o)) as SegmentOption<T>[];
  const h = size === 'sm' ? 32 : 40;

  const inner = (
    <View style={[styles.track, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, height: h + 8 }, !scrollable && { flex: 1 }]}>
      {opts.map((o) => {
        const active = o.value === value;
        const activeColor = o.color ?? theme.primary;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              styles.segment,
              { height: h },
              !scrollable && { flex: 1 },
              active && { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 },
            ]}
          >
            <Text
              numberOfLines={1}
              style={{
                color: active ? activeColor : theme.textSecondary,
                fontSize: size === 'sm' ? 13 : 14,
                fontWeight: active ? fontWeights.bold : fontWeights.medium,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ flexGrow: 0 }}>
        {inner}
      </ScrollView>
    );
  }
  return <View style={[{ flexDirection: 'row' }, style]}>{inner}</View>;
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, padding: 4, gap: 4 },
  segment: { paddingHorizontal: spacing.md, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
