import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle, ColorValue, View, StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { radius, spacing, fontWeights, glowShadow } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title?: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Neon halo (live/record actions). */
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

const SIZES: Record<ButtonSize, { h: number; px: number; font: number; icon: number; gap: number }> = {
  sm: { h: 36, px: spacing.md, font: 13, icon: 16, gap: 6 },
  md: { h: 46, px: spacing.lg, font: 15, icon: 18, gap: 8 },
  lg: { h: 54, px: spacing.xl, font: 16, icon: 20, gap: 10 },
};

export function Button({
  title, onPress, variant = 'primary', size = 'md', icon, iconPosition = 'left',
  loading, disabled, fullWidth, glow, style, textStyle, children,
}: ButtonProps) {
  const { theme } = useTheme();
  const s = SIZES[size];
  const isDisabled = disabled || loading;

  const bg: Record<ButtonVariant, ColorValue> = {
    primary: theme.primary,
    secondary: theme.surfaceElevated,
    ghost: 'transparent',
    danger: theme.danger,
    outline: 'transparent',
  };
  const fg: Record<ButtonVariant, ColorValue> = {
    primary: '#fff',
    secondary: theme.text,
    ghost: theme.primary,
    danger: '#fff',
    outline: theme.primary,
  };
  const borderColor: Record<ButtonVariant, ColorValue | undefined> = {
    primary: undefined,
    secondary: theme.border,
    ghost: undefined,
    danger: undefined,
    outline: theme.primary,
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { height: s.h, paddingHorizontal: s.px, gap: s.gap, backgroundColor: bg[variant] },
        borderColor[variant] != null && { borderWidth: 1.5, borderColor: borderColor[variant] },
        fullWidth && { alignSelf: 'stretch' },
        glow && glowShadow(variant === 'danger' ? String(theme.danger) : String(theme.primary), 0.5, 12),
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
        isDisabled && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant] as string} size="small" />
      ) : (
        <View style={styles.row}>
          {icon && iconPosition === 'left' && <Ionicons name={icon} size={s.icon} color={fg[variant] as string} />}
          {(title || children) != null && (
            <Text numberOfLines={1} style={[{ color: fg[variant], fontSize: s.font, fontWeight: fontWeights.semibold }, textStyle]}>
              {title ?? children}
            </Text>
          )}
          {icon && iconPosition === 'right' && <Ionicons name={icon} size={s.icon} color={fg[variant] as string} />}
        </View>
      )}
    </Pressable>
  );
}

export interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  color?: ColorValue;
  variant?: 'ghost' | 'surface' | 'primary';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function IconButton({ icon, onPress, size = 22, color, variant = 'ghost', disabled, style, accessibilityLabel }: IconButtonProps) {
  const { theme } = useTheme();
  const dim = size + 18;
  const bg = variant === 'surface' ? theme.surfaceElevated : variant === 'primary' ? theme.primary : 'transparent';
  const fg = color ?? (variant === 'primary' ? '#fff' : theme.text);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [
        { width: dim, height: dim, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: bg },
        variant === 'surface' && { borderWidth: 1, borderColor: theme.border },
        pressed && { opacity: 0.6 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={fg as string} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
