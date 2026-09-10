import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import { spacing, radius, typography, shadows } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Mono, Button } from './ui';

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
  const { theme } = useTheme();

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
            {
              backgroundColor: theme.card as string,
              borderWidth: 1,
              borderColor: theme.border as string,
              ...shadows.modal,
            },
            { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
            isActionSheet && alertStyles.actionSheetContainer,
          ]}
        >
          <Pressable onPress={e => e.stopPropagation()}>
            <Mono size={typography.title} weight="bold" color={theme.text} style={alertStyles.title}>
              {config.title}
            </Mono>
            {config.message ? (
              <Mono size={typography.body} color={theme.textSecondary} style={alertStyles.message}>
                {config.message}
              </Mono>
            ) : null}

            <View style={isActionSheet ? alertStyles.actionSheetButtons : alertStyles.buttonRow}>
              {cancelButton && !isActionSheet && (
                <Button
                  title={cancelButton.text}
                  variant="secondary"
                  onPress={() => onPress(cancelButton)}
                  style={alertStyles.flexButton}
                />
              )}

              {actionButtons.map((button, i) => {
                const isDestructive = button.style === 'destructive';
                const variant = isDestructive ? 'danger' : isActionSheet ? 'secondary' : 'primary';

                return (
                  <Button
                    key={i}
                    title={button.text}
                    variant={variant}
                    onPress={() => onPress(button)}
                    style={[
                      isActionSheet ? alertStyles.fullButton : alertStyles.flexButton,
                      isActionSheet && i < actionButtons.length - 1 && { marginBottom: spacing.sm },
                    ]}
                  />
                );
              })}

              {cancelButton && isActionSheet && (
                <Button
                  title={cancelButton.text}
                  variant="ghost"
                  onPress={() => onPress(cancelButton)}
                  style={[alertStyles.fullButton, { marginTop: spacing.sm }]}
                />
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
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  flexButton: {
    flex: 1,
  },
  actionSheetButtons: {
    marginTop: spacing.sm,
  },
  fullButton: {
    alignSelf: 'stretch',
  },
});
