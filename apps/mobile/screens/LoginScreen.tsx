import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth, type OAuthProvider } from '../context/AuthContext';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, shadows } from '../constants/theme';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const { signIn, signUp, signInWithProvider } = useAuth();
  const systemColorScheme = useColorScheme();
  const isDarkMode = systemColorScheme === 'dark';
  const theme = isDarkMode ? darkTheme : lightTheme;

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState('');

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
    if (!result.success) {
      const label = provider === 'google' ? 'Google' : 'Apple';
      setError(result.error || `${label} sign-in isn't available yet.`);
    }
    setPendingProvider(null);
  };

  const busy = isLoading || pendingProvider !== null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.text }]}>Regularity Race Timer</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
          </Text>

          <View style={[styles.card, { backgroundColor: theme.card }, shadows.card]}>
            {mode === 'signup' && (
              <TextInput
                style={[styles.input, { color: theme.text as string, borderColor: theme.border as string, backgroundColor: theme.background as string }]}
                placeholder="Name"
                placeholderTextColor={theme.textSecondary as string}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="name"
              />
            )}
            <TextInput
              style={[styles.input, { color: theme.text as string, borderColor: theme.border as string, backgroundColor: theme.background as string }]}
              placeholder="Email"
              placeholderTextColor={theme.textSecondary as string}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={[styles.input, { color: theme.text as string, borderColor: theme.border as string, backgroundColor: theme.background as string }]}
              placeholder="Password"
              placeholderTextColor={theme.textSecondary as string}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.primary as string }, busy && styles.disabled]}
              onPress={handleSubmit}
              disabled={busy}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{mode === 'signin' ? 'Sign In' : 'Sign Up'}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: theme.border as string }]} />
              <Text style={[styles.dividerText, { color: theme.textSecondary as string }]}>or</Text>
              <View style={[styles.divider, { backgroundColor: theme.border as string }]} />
            </View>

            <TouchableOpacity
              style={[styles.socialButton, { borderColor: theme.border as string, backgroundColor: theme.background as string }, busy && styles.disabled]}
              onPress={() => handleSocial('google')}
              disabled={busy}
            >
              {pendingProvider === 'google' ? (
                <ActivityIndicator color={theme.text as string} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color={theme.text as string} style={styles.socialIcon} />
                  <Text style={[styles.socialText, { color: theme.text as string }]}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.socialButton, { borderColor: theme.border as string, backgroundColor: theme.background as string }, busy && styles.disabled]}
              onPress={() => handleSocial('apple')}
              disabled={busy}
            >
              {pendingProvider === 'apple' ? (
                <ActivityIndicator color={theme.text as string} />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={18} color={theme.text as string} style={styles.socialIcon} />
                  <Text style={[styles.socialText, { color: theme.text as string }]}>Continue with Apple</Text>
                </>
              )}
            </TouchableOpacity>

            {!!error && <Text style={[styles.error, { color: theme.broken as string }]}>{error}</Text>}
          </View>

          <TouchableOpacity
            onPress={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError('');
            }}
            style={styles.switchModeButton}
          >
            <Text style={[styles.switchModeText, { color: theme.textSecondary as string }]}>
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={{ color: theme.primary as string, fontWeight: fontWeights.semibold }}>
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  title: { fontSize: 28, fontWeight: fontWeights.bold, textAlign: 'center', marginBottom: spacing.sm },
  subtitle: { fontSize: typography.bodyLg, textAlign: 'center', marginBottom: spacing.xxl },
  card: { borderRadius: radius.lg, padding: spacing.xl },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: typography.bodyLg,
    marginBottom: spacing.md,
  },
  button: { borderRadius: radius.md, padding: spacing.lg, alignItems: 'center', marginTop: spacing.sm },
  buttonText: { color: '#fff', fontSize: typography.bodyLg, fontWeight: fontWeights.semibold },
  disabled: { opacity: 0.6 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  divider: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: spacing.md, fontSize: typography.body },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  socialIcon: { marginRight: spacing.sm },
  socialText: { fontSize: typography.bodyLg, fontWeight: fontWeights.medium },
  error: { fontSize: typography.body, textAlign: 'center', marginTop: spacing.md },
  switchModeButton: { marginTop: spacing.xl, alignItems: 'center' },
  switchModeText: { fontSize: typography.body },
});
