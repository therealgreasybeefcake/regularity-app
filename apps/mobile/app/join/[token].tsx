import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../hooks/useTheme';
import { spacing, typography, fontWeights } from '../../constants/theme';
import { Mono, Label, Button } from '../../components/ui';

type Phase = 'working' | 'done' | 'error';

export default function JoinInvite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { isAuthenticated, isAuthLoading } = useAuth();
  const { joinTeam } = useApp();
  const router = useRouter();
  const { theme } = useTheme();

  const [phase, setPhase] = useState<Phase>('working');
  const [teamName, setTeamName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;
    let cancelled = false;

    (async () => {
      if (!token) {
        if (!cancelled) {
          setPhase('error');
          setErrorMsg('Missing invite token.');
        }
        return;
      }

      if (!isAuthenticated) {
        // Stash the token so AppContext can finish the join after sign-in.
        await AsyncStorage.setItem('pendingInviteToken', token);
        router.replace('/(auth)/login');
        return;
      }

      const res = await joinTeam({ token });
      if (cancelled) return;
      if (res.ok) {
        setTeamName(res.teamName ?? null);
        setPhase('done');
      } else {
        setErrorMsg(res.error ?? 'Could not join this team.');
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated, isAuthLoading, joinTeam, router]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.center}>
        {phase === 'working' && (
          <View style={styles.block}>
            <ActivityIndicator size="large" color={theme.primary as string} />
            <Mono size={typography.bodyLg} color={theme.textSecondary} style={styles.msg}>
              Joining team…
            </Mono>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.block}>
            <View style={[styles.iconWrap, { backgroundColor: theme.primaryMuted }]}>
              <Ionicons name="checkmark-circle" size={48} color={theme.success as string} />
            </View>
            <Label size={12} color={theme.textMuted}>You joined</Label>
            <Mono size={typography.heading} weight="bold" color={theme.text} style={styles.teamName}>
              {teamName ?? 'the team'}
            </Mono>
            <Button
              title="Continue"
              icon="arrow-forward-outline"
              iconPosition="right"
              fullWidth
              onPress={() => router.replace('/(app)/(tabs)')}
              style={styles.action}
            />
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.block}>
            <View style={[styles.iconWrap, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name="alert-circle-outline" size={48} color={theme.danger as string} />
            </View>
            <Mono size={typography.title} weight="bold" color={theme.text} style={styles.teamName}>
              Couldn’t join
            </Mono>
            <Mono size={typography.body} color={theme.textSecondary} style={styles.msg}>
              {errorMsg}
            </Mono>
            <Button
              title="Back to app"
              variant="secondary"
              fullWidth
              onPress={() => router.replace('/(app)/(tabs)')}
              style={styles.action}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  block: { alignItems: 'center', maxWidth: 360, width: '100%', gap: spacing.sm },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  teamName: { textAlign: 'center', marginTop: spacing.xs },
  msg: { textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  action: { marginTop: spacing.xl },
});
