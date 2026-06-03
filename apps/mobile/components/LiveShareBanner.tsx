import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp } from '../context/AppContext';
import { useAlert } from './CustomAlert';
import { spacing, radius, fontWeights, typography } from '../constants/theme';

/**
 * Appears while a live session is active. Lets the recorder share the public
 * live-view link (spectators watch laps in real time) and stop broadcasting.
 */
export default function LiveShareBanner() {
  const { liveShareUrl, endLiveSession } = useApp();
  const { showAlert } = useAlert();
  const [copied, setCopied] = useState(false);

  if (!liveShareUrl) return null;

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

  const onStop = () => {
    showAlert({
      title: 'Stop live sharing?',
      message: 'Spectators will no longer see new laps. Your session data is unaffected.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: () => { void endLiveSession(); } },
      ],
    });
  };

  return (
    <View style={styles.banner}>
      <View style={styles.live}>
        <View style={styles.dot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
      <Text style={styles.url} numberOfLines={1}>
        {copied ? 'Link copied!' : liveShareUrl.replace(/^https?:\/\//, '')}
      </Text>
      <TouchableOpacity style={styles.btn} onPress={onShare} accessibilityLabel="Share live link">
        <Ionicons name="share-outline" size={18} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.btnGhost} onPress={onStop} accessibilityLabel="Stop live sharing">
        <Ionicons name="stop-circle-outline" size={18} color="#fff" />
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
    gap: spacing.sm,
  },
  live: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', marginRight: 4 },
  liveText: { color: '#fff', fontWeight: fontWeights.bold, fontSize: typography.caption, letterSpacing: 1 },
  url: { color: '#fff', flex: 1, fontSize: typography.caption, opacity: 0.95 },
  btn: { padding: 4 },
  btnGhost: { padding: 4, opacity: 0.85 },
});
