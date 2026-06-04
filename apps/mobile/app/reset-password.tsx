import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { Label, Card, Button, TextField } from '../components/ui';
import { spacing, radius, typography, fontWeights } from '../constants/theme';

// Public route. The password-reset email links to the API, which validates the
// token and redirects here as `/reset-password?token=VALID` (or `?error=...`).
export default function ResetPasswordScreen() {
  const { resetPassword } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; error?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const linkError = typeof params.error === 'string' ? params.error : '';
  const invalidLink = !token || !!linkError;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const goToLogin = () => router.replace('/(auth)/login');

  const handleReset = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    const result = await resetPassword(token, password);
    setLoading(false);
    if (result.success) setDone(true);
    else setError(result.error || 'Could not reset your password. The link may have expired.');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <View style={styles.brand}>
            <View style={[styles.brandMark, { backgroundColor: theme.primaryMuted, borderColor: theme.primary }]}>
              <Ionicons name="lock-closed" size={28} color={theme.primary as string} />
            </View>
            <Label size={typography.label} color={theme.accent} style={styles.kicker}>
              REGULARITY
            </Label>
            <Text style={[styles.title, { color: theme.text }]}>Reset password</Text>
          </View>

          <Card padding="xl">
            {invalidLink ? (
              <>
                <View style={[styles.iconRow, { backgroundColor: `${String(theme.broken)}1a` }]}>
                  <Ionicons name="alert-circle" size={20} color={theme.broken as string} />
                </View>
                <Text style={[styles.message, { color: theme.text }]}>
                  This reset link is invalid or has expired.
                </Text>
                <Text style={[styles.subtle, { color: theme.textSecondary }]}>
                  Request a new link from the sign-in screen.
                </Text>
                <Button title="Back to sign in" variant="primary" size="lg" fullWidth onPress={goToLogin} style={styles.submitBtn} />
              </>
            ) : done ? (
              <>
                <View style={[styles.iconRow, { backgroundColor: `${String(theme.success)}1a` }]}>
                  <Ionicons name="checkmark-circle" size={20} color={theme.success as string} />
                </View>
                <Text style={[styles.message, { color: theme.text }]}>Password updated</Text>
                <Text style={[styles.subtle, { color: theme.textSecondary }]}>
                  You can now sign in with your new password.
                </Text>
                <Button title="Sign in" variant="primary" size="lg" fullWidth onPress={goToLogin} style={styles.submitBtn} />
              </>
            ) : (
              <>
                <Text style={[styles.subtle, { color: theme.textSecondary, marginBottom: spacing.md }]}>
                  Choose a new password for your account.
                </Text>
                <TextField
                  label="New password"
                  placeholder="••••••••"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  containerStyle={styles.field}
                />
                <TextField
                  label="Confirm password"
                  placeholder="••••••••"
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  autoComplete="new-password"
                  containerStyle={styles.field}
                />
                <Button
                  title="Reset password"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={loading}
                  disabled={loading}
                  onPress={handleReset}
                  style={styles.submitBtn}
                />
                {!!error && (
                  <View style={[styles.errorBox, { backgroundColor: `${String(theme.broken)}1a`, borderColor: theme.broken }]}>
                    <Ionicons name="alert-circle" size={16} color={theme.broken as string} />
                    <Text style={[styles.error, { color: theme.broken as string }]}>{error}</Text>
                  </View>
                )}
                <Button variant="ghost" onPress={goToLogin} style={styles.backBtn}>
                  <Text style={[styles.backText, { color: theme.textSecondary as string }]}>Back to sign in</Text>
                </Button>
              </>
            )}
          </Card>
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
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  kicker: { marginBottom: spacing.xs },
  title: { fontSize: typography.headingLg, fontWeight: fontWeights.heavy, textAlign: 'center' },
  iconRow: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.md },
  message: { fontSize: typography.title, fontWeight: fontWeights.bold, textAlign: 'center' },
  subtle: { fontSize: typography.body, textAlign: 'center', marginTop: spacing.xs },
  field: { marginBottom: spacing.md },
  submitBtn: { marginTop: spacing.sm },
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
  backBtn: { marginTop: spacing.lg, alignSelf: 'center', height: undefined, paddingVertical: spacing.sm },
  backText: { fontSize: typography.body },
});
