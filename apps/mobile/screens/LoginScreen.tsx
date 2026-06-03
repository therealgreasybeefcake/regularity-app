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
import { useAuth } from '../context/AuthContext';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, shadows } from '../constants/theme';

export default function LoginScreen() {
  const { signIn, completeNewPasswordChallenge } = useAuth();
  const systemColorScheme = useColorScheme();
  const isDarkMode = systemColorScheme === 'dark';
  const theme = isDarkMode ? darkTheme : lightTheme;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsNewPassword, setNeedsNewPassword] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      return;
    }

    setIsLoading(true);
    setError('');

    const result = await signIn(email.trim(), password);

    if (result.challenge === 'NEW_PASSWORD_REQUIRED') {
      setNeedsNewPassword(true);
      setPassword('');
    } else if (!result.success) {
      setError(result.error || 'Sign in failed');
    }

    setIsLoading(false);
  };

  const handleNewPassword = async () => {
    if (!newPassword.trim() || newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    setError('');

    const result = await completeNewPasswordChallenge(newPassword);

    if (!result.success) {
      setError(result.error || 'Failed to set new password');
    }

    setIsLoading(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.text }]}>Regularity Race Timer</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {needsNewPassword ? 'Set a new password' : 'Sign in to continue'}
          </Text>

          <View style={[styles.card, { backgroundColor: theme.card }, shadows.card]}>
            {!needsNewPassword ? (
              <>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                  placeholder="Email"
                  placeholderTextColor={theme.textSecondary as string}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                  placeholder="Password"
                  placeholderTextColor={theme.textSecondary as string}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="password"
                />
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: theme.primary }]}
                  onPress={handleSignIn}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Sign In</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.newPasswordInfo, { color: theme.textSecondary }]}>
                  Your temporary password has expired. Please set a new password.
                </Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                  placeholder="New Password"
                  placeholderTextColor={theme.textSecondary as string}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                />
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: theme.primary }]}
                  onPress={handleNewPassword}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Set Password</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {!!error && <Text style={[styles.error, { color: theme.broken }]}>{error}</Text>}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.bodyLg,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: typography.bodyLg,
    marginBottom: spacing.md,
  },
  button: {
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonText: {
    color: '#fff',
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
  },
  error: {
    fontSize: typography.body,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  newPasswordInfo: {
    fontSize: typography.body,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
