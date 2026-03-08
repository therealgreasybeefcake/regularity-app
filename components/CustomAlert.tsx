import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Animated,
  ColorValue,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, shadows } from '../constants/theme';

// --- Types ---

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface AlertConfig {
  title: string;
  message?: string;
  buttons?: AlertButton[];
}

interface AlertContextType {
  showAlert: (config: AlertConfig) => void;
  hideAlert: () => void;
}

// --- Context ---

const AlertContext = createContext<AlertContextType | null>(null);

export function useAlert(): AlertContextType {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert must be used within an AlertProvider');
  return ctx;
}

// --- Provider ---

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [queue, setQueue] = useState<AlertConfig[]>([]);
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    scaleAnim.setValue(0.9);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 300 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [scaleAnim, opacityAnim]);

  const showAlert = useCallback((newConfig: AlertConfig) => {
    if (visible) {
      setQueue(q => [...q, newConfig]);
      return;
    }
    setConfig(newConfig);
    setVisible(true);
    setTimeout(animateIn, 10);
  }, [visible, animateIn]);

  const hideAlert = useCallback(() => {
    Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setVisible(false);
      setConfig(null);
      // Show next in queue
      setQueue(q => {
        if (q.length > 0) {
          const [next, ...rest] = q;
          setTimeout(() => {
            setConfig(next);
            setVisible(true);
            setTimeout(animateIn, 10);
          }, 100);
          return rest;
        }
        return q;
      });
    });
  }, [opacityAnim, animateIn]);

  const handlePress = useCallback((button: AlertButton) => {
    hideAlert();
    if (button.onPress) {
      setTimeout(button.onPress, 200);
    }
  }, [hideAlert]);

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}
      {visible && config && (
        <AlertDialog
          config={config}
          scaleAnim={scaleAnim}
          opacityAnim={opacityAnim}
          onPress={handlePress}
          onDismiss={hideAlert}
        />
      )}
    </AlertContext.Provider>
  );
}

// --- Dialog Component ---

function AlertDialog({
  config,
  scaleAnim,
  opacityAnim,
  onPress,
  onDismiss,
}: {
  config: AlertConfig;
  scaleAnim: Animated.Value;
  opacityAnim: Animated.Value;
  onPress: (button: AlertButton) => void;
  onDismiss: () => void;
}) {
  const { isDarkMode } = useApp();
  const theme = isDarkMode ? darkTheme : lightTheme;

  const buttons = config.buttons || [{ text: 'OK', style: 'default' as const }];
  const cancelButton = buttons.find(b => b.style === 'cancel');
  const actionButtons = buttons.filter(b => b.style !== 'cancel');
  const isActionSheet = buttons.length > 3;

  return (
    <Modal transparent animationType="none" statusBarTranslucent>
      <Pressable style={alertStyles.overlay} onPress={onDismiss}>
        <Animated.View
          style={[
            alertStyles.container,
            { backgroundColor: theme.card as string, ...shadows.modal },
            { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
            isActionSheet && alertStyles.actionSheetContainer,
          ]}
        >
          <Pressable onPress={e => e.stopPropagation()}>
            <Text style={[alertStyles.title, { color: theme.text as string }]}>
              {config.title}
            </Text>
            {config.message ? (
              <Text style={[alertStyles.message, { color: theme.textSecondary as string }]}>
                {config.message}
              </Text>
            ) : null}

            <View style={isActionSheet ? alertStyles.actionSheetButtons : alertStyles.buttonRow}>
              {actionButtons.map((button, i) => {
                const isDestructive = button.style === 'destructive';
                const bgColor = isDestructive
                  ? (theme.broken as string)
                  : isActionSheet
                    ? (theme.surface as string)
                    : (theme.primary as string);
                const textColor = isDestructive
                  ? '#fff'
                  : isActionSheet
                    ? (theme.text as string)
                    : '#fff';

                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      isActionSheet ? alertStyles.actionSheetButton : alertStyles.button,
                      { backgroundColor: bgColor },
                      isActionSheet && i < actionButtons.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border as string },
                    ]}
                    onPress={() => onPress(button)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        alertStyles.buttonText,
                        { color: textColor },
                        isDestructive && alertStyles.destructiveText,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {cancelButton && (
                <TouchableOpacity
                  style={[
                    isActionSheet ? alertStyles.cancelButton : alertStyles.button,
                    { backgroundColor: theme.surfaceMuted as string, borderWidth: 1, borderColor: theme.border as string },
                    isActionSheet && { marginTop: spacing.sm },
                  ]}
                  onPress={() => onPress(cancelButton)}
                  activeOpacity={0.7}
                >
                  <Text style={[alertStyles.buttonText, { color: theme.textSecondary as string }]}>
                    {cancelButton.text}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const alertStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '85%',
    maxWidth: 400,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  actionSheetContainer: {
    maxWidth: 340,
  },
  title: {
    fontSize: typography.title,
    fontWeight: fontWeights.semibold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
  },
  destructiveText: {
    fontWeight: fontWeights.bold,
  },
  actionSheetButtons: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  actionSheetButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
