import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth, type OAuthProvider } from '../context/AuthContext';
import { spacing, radius, typography, fontWeights } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Label, Card, Button, TextField, Divider } from '../components/ui';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const { signIn, signUp, signInWithProvider, requestPasswordReset } = useAuth();
  const { theme, isDark: isDarkMode } = useTheme();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim() || (mode === 'signup' && !name.trim())) {
      setError(mode === 'signup' ? 'Please enter your name, email and password' : 'Please enter email and password');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    setError('');
    setInfo('');
    const result =
      mode === 'signin'
        ? await signIn(email.trim(), password)
        : await signUp(name.trim(), email.trim(), password);
    if (!result.success) {
      setError(result.error || (mode === 'signin' ? 'Sign in failed' : 'Sign up failed'));
    }
    setIsLoading(false);
  };

  const handleSocial = async (provider: OAuthProvider) => {
    setPendingProvider(provider);
    setError('');
    const result = await signInWithProvider(provider);
    // A silent cancel returns success:false with no error — don't surface a message.
    if (!result.success && result.error) {
      setError(result.error);
    }
    setPendingProvider(null);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setInfo('');
      setError('Enter your email above, then tap Forgot password.');
      return;
    }
    setIsLoading(true);
    setError('');
    setInfo('');
    const result = await requestPasswordReset(email.trim());
    setIsLoading(false);
    if (result.success) {
      setInfo("If that email is registered, a reset link is on its way. Check your inbox (and spam).");
    } else {
      setError(result.error || 'Could not send the reset email. Please try again.');
    }
  };

  const busy = isLoading || pendingProvider !== null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          {/* Brand lockup */}
          <View style={styles.brand}>
            <View style={[styles.brandMark, { backgroundColor: theme.primaryMuted, borderColor: theme.primary }]}>
              <Ionicons name="flag" size={30} color={theme.primary as string} />
            </View>
            <Label size={typography.label} color={theme.accent} style={styles.kicker}>
              REGULARITY
            </Label>
            <Text style={[styles.title, { color: theme.text }]}>Race Timer</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {mode === 'signin' ? 'Sign in to the pit wall' : 'Create your account'}
            </Text>
          </View>

          <Card padding="xl" style={styles.card}>
            {mode === 'signup' && (
              <TextField
                label="Name"
                placeholder="Your name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="name"
                containerStyle={styles.field}
              />
            )}
            <TextField
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              containerStyle={styles.field}
            />
            <TextField
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              containerStyle={styles.field}
            />

            {mode === 'signin' && (
              <Button
                variant="ghost"
                onPress={handleForgotPassword}
                disabled={busy}
                style={styles.forgotBtn}
              >
                <Text style={[styles.forgotText, { color: theme.primary as string }]}>
                  Forgot password?
                </Text>
              </Button>
            )}

            <Button
              title={mode === 'signin' ? 'Sign In' : 'Sign Up'}
              variant="primary"
              size="lg"
              fullWidth
              loading={isLoading}
              disabled={busy}
              onPress={handleSubmit}
              style={styles.submitBtn}
            />

            <View style={styles.dividerRow}>
              <Divider style={styles.dividerLine} />
              <Label size={typography.micro} muted style={styles.dividerText}>
                OR
              </Label>
              <Divider style={styles.dividerLine} />
            </View>

            <Button
              title="Continue with Google"
              icon="logo-google"
              variant="secondary"
              size="lg"
              fullWidth
              loading={pendingProvider === 'google'}
              disabled={busy}
              onPress={() => handleSocial('google')}
              style={styles.oauthBtn}
            />
            <Button
              title="Continue with Apple"
              icon="logo-apple"
              variant="secondary"
              size="lg"
              fullWidth
              loading={pendingProvider === 'apple'}
              disabled={busy}
              onPress={() => handleSocial('apple')}
            />

            {!!error && (
              <View style={[styles.errorBox, { backgroundColor: `${String(theme.broken)}1a`, borderColor: theme.broken }]}>
                <Ionicons name="alert-circle" size={16} color={theme.broken as string} />
                <Text style={[styles.error, { color: theme.broken as string }]}>{error}</Text>
              </View>
            )}

            {!!info && (
              <View style={[styles.infoBox, { backgroundColor: `${String(theme.success)}1a`, borderColor: theme.success }]}>
                <Ionicons name="checkmark-circle" size={16} color={theme.success as string} />
                <Text style={[styles.info, { color: theme.success as string }]}>{info}</Text>
              </View>
            )}
          </Card>

          <Button
            variant="ghost"
            onPress={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError('');
              setInfo('');
            }}
            style={styles.switchModeButton}
          >
            <Text style={[styles.switchModeText, { color: theme.textSecondary as string }]}>
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={{ color: theme.primary as string, fontWeight: fontWeights.semibold }}>
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: spacing.xl, width: '100%', maxWidth: 420, alignSelf: 'center' },

  brand: { alignItems: 'center', marginBottom: spacing.xxl },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  kicker: { marginBottom: spacing.xs },
  title: { fontSize: typography.headingLg + 4, fontWeight: fontWeights.heavy, textAlign: 'center', letterSpacing: 0.2 },
  subtitle: { fontSize: typography.body, textAlign: 'center', marginTop: spacing.xs },

  card: {},
  field: { marginBottom: spacing.md },
  submitBtn: { marginTop: spacing.sm },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  dividerLine: { flex: 1 },
  dividerText: { marginHorizontal: spacing.md },

  oauthBtn: { marginBottom: spacing.md },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  error: { flex: 1, fontSize: typography.caption, fontWeight: fontWeights.medium },

  forgotBtn: { alignSelf: 'flex-end', height: undefined, paddingVertical: spacing.xs, marginTop: -spacing.xs, marginBottom: spacing.xs },
  forgotText: { fontSize: typography.caption, fontWeight: fontWeights.semibold },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  info: { flex: 1, fontSize: typography.caption, fontWeight: fontWeights.medium },

  switchModeButton: { marginTop: spacing.xl, alignSelf: 'center', height: undefined, paddingVertical: spacing.md },
  switchModeText: { fontSize: typography.body },
});
