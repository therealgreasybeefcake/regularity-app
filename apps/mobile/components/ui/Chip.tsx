import React from 'react';
import { Pressable, Text, View, StyleSheet, ViewStyle, ColorValue, StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { radius, spacing } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

export interface ChipProps {
  label: string;
  /** Accent color — used for the tinted fill, border and text when active/solid. */
  color?: ColorValue;
  active?: boolean;
  /** Solid filled pill (vs. tinted/outline). */
  solid?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'sm' | 'md';
  uppercase?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Pill — lap-type tags, status flags, selectable filters. */
export function Chip({ label, color, active, solid, onPress, icon, size = 'md', uppercase, style }: ChipProps) {
  const { theme } = useTheme();
  const accent = color ?? theme.accent;
  const on = active || solid;
  const h = size === 'sm' ? 22 : 28;
  const fontSize = size === 'sm' ? 10 : 12;

  const bg = solid ? accent : on ? tint(accent) : theme.surfaceElevated;
  const fg = solid ? '#fff' : on ? accent : theme.textSecondary;
  const border = on ? accent : theme.border;

  const content = (
    <View
      style={[
        styles.chip,
        { height: h, paddingHorizontal: size === 'sm' ? spacing.sm : spacing.md, backgroundColor: bg, borderColor: border },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={fontSize + 2} color={fg as string} style={{ marginRight: 4 }} />}
      <Text
        style={{ color: fg, fontSize, fontWeight: '700', letterSpacing: uppercase ? 1 : 0.3 }}
        numberOfLines={1}
      >
        {uppercase ? label.toUpperCase() : label}
      </Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  );
}

/** Translucent version of a solid color for chip fills (works over any theme). */
function tint(color: ColorValue): string {
  const c = String(color);
  if (c.startsWith('#') && c.length === 7) {
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r},${g},${b},0.16)`;
  }
  return c;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, borderWidth: 1 },
});
