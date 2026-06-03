import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
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
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Refs (not state) so rapid showAlert/hideAlert calls read the current value
  // synchronously and never act on a stale closure.
  const visibleRef = useRef(false);
  const queueRef = useRef<AlertConfig[]>([]);
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Track every timeout so none can fire (and setState) after unmount.
  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timeoutsRef.current.delete(id);
      fn();
    }, ms);
    timeoutsRef.current.add(id);
    return id;
  }, []);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach(clearTimeout);
      timeouts.clear();
    };
  }, []);

  const animateIn = useCallback(() => {
    scaleAnim.setValue(0.9);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 300 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [scaleAnim, opacityAnim]);

  const present = useCallback((cfg: AlertConfig) => {
    visibleRef.current = true;
    setConfig(cfg);
    setVisible(true);
    schedule(animateIn, 10);
  }, [animateIn, schedule]);

  const showAlert = useCallback((newConfig: AlertConfig) => {
    if (visibleRef.current) {
      queueRef.current.push(newConfig);
      return;
    }
    present(newConfig);
  }, [present]);

  const hideAlert = useCallback(() => {
    if (!visibleRef.current) return;
    Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      visibleRef.current = false;
      setVisible(false);
      setConfig(null);
      // Present the next queued alert only after this one finished closing.
      const next = queueRef.current.shift();
      if (next) {
        schedule(() => present(next), 100);
      }
    });
  }, [opacityAnim, present, schedule]);

  const handlePress = useCallback((button: AlertButton) => {
    // Dismiss first, then run the action once the dialog is gone (so an
    // onPress that opens another alert isn't dropped by the visibility guard).
    hideAlert();
    if (button.onPress) {
      schedule(button.onPress, 200);
    }
  }, [hideAlert, schedule]);

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
  const isActionSheet = buttons.length >= 3;

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
              {cancelButton && !isActionSheet && (
                <TouchableOpacity
                  style={[
                    alertStyles.button,
                    { backgroundColor: theme.surfaceMuted as string, borderWidth: 1, borderColor: theme.border as string },
                  ]}
                  onPress={() => onPress(cancelButton)}
                  activeOpacity={0.7}
                >
                  <Text style={[alertStyles.buttonText, { color: theme.textSecondary as string }]}>
                    {cancelButton.text}
                  </Text>
                </TouchableOpacity>
              )}

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
                      isActionSheet && !isDestructive && { borderWidth: 1, borderColor: theme.border as string },
                      isActionSheet && i < actionButtons.length - 1 && { marginBottom: spacing.sm },
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

              {cancelButton && isActionSheet && (
                <TouchableOpacity
                  style={[
                    alertStyles.cancelButton,
                    { backgroundColor: theme.surfaceMuted as string, borderWidth: 1, borderColor: theme.border as string },
                    { marginTop: spacing.sm },
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
  },
  actionSheetButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: radius.md,
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
