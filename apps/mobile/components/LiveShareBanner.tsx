import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { spacing, radius, fontWeights, typography } from '../constants/theme';

/**
 * Appears while a live session is active. Tap to open the live-view, Share to
 * send the public link, or X to dismiss (the session keeps streaming — dismiss
 * only hides the banner until the next session).
 */
export default function LiveShareBanner() {
  const { liveShareUrl, liveSession } = useApp();
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
    <View style={styles.banner}>
      <TouchableOpacity style={styles.main} onPress={openLive} activeOpacity={0.8} accessibilityLabel="Open live view">
        <View style={styles.live}>
          <View style={styles.dot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {copied ? 'Link copied!' : 'View live timing'}
        </Text>
        <Ionicons name="open-outline" size={15} color="rgba(255,255,255,0.85)" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={onShare} accessibilityLabel="Share live link">
        <Ionicons name="share-outline" size={18} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={() => setDismissed(true)} accessibilityLabel="Dismiss">
        <Ionicons name="close" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#b91c1c',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  live: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', marginRight: 4 },
  liveText: { color: '#fff', fontWeight: fontWeights.bold, fontSize: typography.caption, letterSpacing: 1 },
  label: { color: '#fff', flex: 1, fontSize: typography.body, fontWeight: fontWeights.medium },
  btn: { padding: 6 },
});
