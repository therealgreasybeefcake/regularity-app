import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Share, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { spacing, radius, typography } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Mono, Label, LiveDot, IconButton } from './ui';

/**
 * Appears while a live session is active. Tap to open the live-view, Share to
 * send the public link, or X to dismiss (the session keeps streaming — dismiss
 * only hides the banner until the next session).
 */
export default function LiveShareBanner() {
  const { liveShareUrl, liveSession } = useApp();
  const { theme } = useTheme();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Re-show whenever a new live session starts.
  useEffect(() => {
    setDismissed(false);
  }, [liveSession?.publicToken]);

  if (!liveShareUrl || !liveSession || dismissed) return null;

  const openLive = () => router.push(`/live/${liveSession.publicToken}` as any);

  const onShare = async () => {
    try {
      if (Platform.OS === 'web') {
        const nav: any = (globalThis as any).navigator;
        if (nav?.share) {
          await nav.share({ title: 'Live timing', url: liveShareUrl });
        } else if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(liveShareUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } else {
        await Share.share({ message: liveShareUrl, url: liveShareUrl });
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: 'rgba(239,68,68,0.14)',
          borderColor: theme.danger,
        },
      ]}
    >
      <TouchableOpacity style={styles.main} onPress={openLive} activeOpacity={0.8} accessibilityLabel="Open live view">
        <View style={styles.live}>
          <LiveDot size={8} color={theme.livePulse} active />
          <Label color={theme.danger} style={styles.liveText}>LIVE</Label>
        </View>
        <Mono size={typography.body} color={theme.text} weight="medium" numberOfLines={1} style={styles.label}>
          {copied ? 'Link copied!' : 'View live timing'}
        </Mono>
        <Ionicons name="open-outline" size={15} color={theme.textSecondary as string} />
      </TouchableOpacity>
      <IconButton icon="share-outline" size={18} color={theme.danger} onPress={onShare} accessibilityLabel="Share live link" />
      <IconButton icon="close" size={18} color={theme.textSecondary} onPress={() => setDismissed(true)} accessibilityLabel="Dismiss" />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  live: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  liveText: { letterSpacing: 1 },
  label: { flex: 1 },
});
