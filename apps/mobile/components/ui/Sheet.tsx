import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Pressable, Animated, StyleSheet, Platform, ScrollView,
  KeyboardAvoidingView, useWindowDimensions, ViewStyle, StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Label } from './Text';
import { IconButton } from './Button';

const isWeb = Platform.OS === 'web';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  /** Max content width on web / large screens. */
  maxWidth?: number;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Bottom sheet (native) / centered dialog (web) with a hairline-bordered Pit Wall panel. */
export function Sheet({ visible, onClose, title, children, footer, scroll = true, maxWidth = 520, contentStyle }: SheetProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 22, stiffness: 220, mass: 0.7 }).start();
    } else {
      anim.setValue(0);
    }
  }, [visible, anim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [isWeb ? 24 : height * 0.5, 0] });
  const opacity = anim;

  const Body = scroll ? ScrollView : View;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, isWeb && styles.rootWeb]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.kav, isWeb && { alignItems: 'center', justifyContent: 'center', flex: 1 }]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.panel,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                opacity,
                transform: [{ translateY }],
                paddingBottom: isWeb ? spacing.lg : insets.bottom + spacing.md,
              },
              isWeb ? { width: '100%', maxWidth, borderRadius: radius.xl, borderWidth: 1 } : styles.panelNative,
              contentStyle,
            ]}
          >
            {!isWeb && <View style={[styles.grabber, { backgroundColor: theme.border }]} />}
            {title != null && (
              <View style={styles.header}>
                <Label size={13}>{title}</Label>
                <IconButton icon="close" size={20} color={theme.textSecondary} onPress={onClose} accessibilityLabel="Close" />
              </View>
            )}
            <Body
              {...(scroll ? { showsVerticalScrollIndicator: false, keyboardShouldPersistTaps: 'handled' as const } : {})}
              style={scroll ? { maxHeight: height * 0.7 } : undefined}
              contentContainerStyle={scroll ? { paddingBottom: spacing.sm } : undefined}
            >
              {children}
            </Body>
            {footer != null && <View style={styles.footer}>{footer}</View>}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  rootWeb: { justifyContent: 'center', padding: spacing.lg },
  kav: { width: '100%' },
  panel: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  panelNative: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1 },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  footer: { marginTop: spacing.lg, gap: spacing.sm },
});
