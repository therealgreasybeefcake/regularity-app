import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Pressable, Animated, StyleSheet, Platform, ScrollView,
  useWindowDimensions, ViewStyle, StyleProp, Keyboard, ModalProps,
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
  const { width, height } = useWindowDimensions();
  // Phone landscape leaves ~390pt: the body gets less of it so header + footer
  // still fit, and the panel stays a readable width instead of edge to edge.
  const landscape = !isWeb && width > height;
  const anim = useRef(new Animated.Value(0)).current;
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const bodyMax = keyboardOpen ? height * 0.45 : height * (landscape ? 0.5 : 0.7);

  useEffect(() => {
    if (visible) {
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 22, stiffness: 220, mass: 0.7 }).start();
    } else {
      anim.setValue(0);
      keyboardHeightAnim.setValue(0);
      setKeyboardOpen(false);
    }
  }, [visible, anim, keyboardHeightAnim]);

  // Robust cross-platform keyboard listener: elevates the bottom sheet above the keyboard
  useEffect(() => {
    if (isWeb) return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardOpen(true);
      const targetHeight = e.endCoordinates.height;
      if (Platform.OS === 'ios') {
        Animated.timing(keyboardHeightAnim, {
          toValue: targetHeight,
          duration: e.duration || 250,
          useNativeDriver: false,
        }).start();
      } else {
        keyboardHeightAnim.setValue(targetHeight);
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      setKeyboardOpen(false);
      if (Platform.OS === 'ios') {
        Animated.timing(keyboardHeightAnim, {
          toValue: 0,
          duration: (e && e.duration) || 200,
          useNativeDriver: false,
        }).start();
      } else {
        keyboardHeightAnim.setValue(0);
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardHeightAnim]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [isWeb ? 24 : height * 0.5, 0] });
  const opacity = anim;

  const Body = scroll ? ScrollView : View;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={SUPPORTED_ORIENTATIONS}
    >
      <View style={[styles.root, isWeb && styles.rootWeb]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <Animated.View
          style={[
            styles.sheetContainer,
            isWeb ? styles.sheetContainerWeb : { paddingBottom: keyboardHeightAnim },
          ]}
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
                paddingBottom: isWeb ? spacing.lg : (keyboardOpen ? spacing.md : insets.bottom + spacing.md),
              },
              isWeb ? { width: '100%', maxWidth, borderRadius: radius.xl, borderWidth: 1 } : styles.panelNative,
              landscape && { width: '100%', maxWidth: Math.max(maxWidth, 560), alignSelf: 'center' },
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
              style={scroll ? { maxHeight: bodyMax } : undefined}
              contentContainerStyle={scroll ? { paddingBottom: spacing.sm } : undefined}
            >
              {children}
            </Body>
            {footer != null && <View style={styles.footer}>{footer}</View>}
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// Without this an iOS modal is portrait-only and rotates a landscape app back.
export const SUPPORTED_ORIENTATIONS: ModalProps['supportedOrientations'] = ['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right'];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  rootWeb: { justifyContent: 'center', padding: spacing.lg },
  sheetContainer: { width: '100%', justifyContent: 'flex-end' },
  sheetContainerWeb: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  panel: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  panelNative: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1 },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  footer: { marginTop: spacing.lg, gap: spacing.sm },
});

