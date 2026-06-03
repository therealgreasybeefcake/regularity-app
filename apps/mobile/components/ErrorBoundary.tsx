import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  resetCount: number;
}

// After this many consecutive "Try Again" attempts that immediately re-fail,
// stop offering a plain retry (which just loops on a deterministic error) and
// escalate to a full reload instead.
const MAX_RESETS = 2;

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, resetCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // TODO(Phase 7): report to Sentry instead of only logging.
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState((s) => ({ hasError: false, error: null, resetCount: s.resetCount + 1 }));
  };

  handleReload = () => {
    // Web: a hard reload clears the bad state. Native: no JS reload without
    // expo-updates, so reset the boundary and counter as a best effort.
    const g: any = globalThis;
    if (g?.location?.reload) {
      g.location.reload();
    } else {
      this.setState({ hasError: false, error: null, resetCount: 0 });
    }
  };

  render() {
    if (this.state.hasError) {
      const exhausted = this.state.resetCount >= MAX_RESETS;
      return (
        <View style={styles.container}>
          <View style={styles.panel}>
            <Text style={styles.title}>
              {exhausted ? 'The app keeps running into a problem' : 'Something went wrong'}
            </Text>
            <Text style={styles.message}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={exhausted ? this.handleReload : this.handleReset}
            >
              <Text style={styles.buttonText}>{exhausted ? 'Reload app' : 'Try Again'}</Text>
            </TouchableOpacity>
            {exhausted ? (
              <Text style={styles.hint}>If this keeps happening, please fully restart the app.</Text>
            ) : null}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

// Self-contained Pit Wall DARK palette — this boundary mounts ABOVE the theme
// providers, so it cannot consume useTheme. Keep these in sync with darkTheme.
const PIT_WALL = {
  background: '#070a11',
  panel: '#121826',
  border: 'rgba(255,255,255,0.08)',
  text: '#e8eef7',
  textSecondary: '#8a97ab',
  primary: '#3b82f6',
} as const;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: PIT_WALL.background,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    padding: 28,
    borderRadius: 20,
    backgroundColor: PIT_WALL.panel,
    borderWidth: 1,
    borderColor: PIT_WALL.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: PIT_WALL.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 14,
    color: PIT_WALL.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: PIT_WALL.primary,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  hint: {
    fontSize: 12,
    color: PIT_WALL.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
});

export default ErrorBoundary;
