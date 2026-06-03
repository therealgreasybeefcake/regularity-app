import React, { useState } from 'react';
import {
  View, Pressable, Text, StyleSheet, LayoutAnimation, Platform, UIManager, ViewStyle, StyleProp,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { spacing, radius, typography, fontWeights } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface CollapsibleProps {
  title: string;
  /** Collapsed by default. */
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** Optional adornment shown in the header before the chevron (e.g. a badge). */
  right?: React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

/** Pit Wall collapsible section card — header (title + chevron) over a hidden body. */
export function Collapsible({ title, defaultOpen = false, children, right, icon, style }: CollapsibleProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };
  return (
    <View style={[styles.wrap, { backgroundColor: theme.card, borderColor: theme.border }, style]}>
      <Pressable onPress={toggle} style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]}>
        <View style={styles.left}>
          {icon ? <Ionicons name={icon} size={18} color={theme.textSecondary as string} /> : null}
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        </View>
        <View style={styles.right}>
          {right}
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary as string} />
        </View>
      </Pressable>
      {open ? <View style={[styles.body, { borderTopColor: theme.borderFaint }]}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: typography.title, fontWeight: fontWeights.bold, letterSpacing: 0.2 },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
