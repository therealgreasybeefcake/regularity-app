import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights } from '../constants/theme';
import { Mono, Label, Button } from '../components/ui';

const PAGES = [
  {
    icon: 'timer' as const,
    title: 'Welcome to Regularity Race Timer',
    description: 'Your complete timing solution for regularity racing. Track laps, drivers, and performance with precision.',
    features: [
      'Real-time lap timing',
      'Multiple driver support',
      'Automatic delta calculations',
      'Session history tracking',
    ],
  },
  {
    icon: 'volume-high' as const,
    title: 'Volume Button Recording',
    description: 'Enable volume buttons in Settings to record laps while keeping your eyes on the track.',
    features: [
      'Press volume up/down to record laps',
      'Works when Timer screen is active',
      'Keep your eyes on the track',
      'Enable in Settings → Lap Recording Controls',
    ],
  },
  {
    icon: 'notifications' as const,
    title: 'Audio Warnings',
    description: 'Get audio alerts to help maintain consistent lap times.',
    features: [
      'Warning before target time approaches',
      'Alert after lap start (for pit-wall signals)',
      'Configurable timing offsets',
      'Enable/disable in Settings',
    ],
  },
  {
    icon: 'shield-checkmark' as const,
    title: 'Lap Recording Guard',
    description: 'Prevent accidental lap recording outside your target time range.',
    features: [
      'Set acceptable range (+/- seconds)',
      'Automatic safety car detection',
      'Reduces recording errors',
      'Configure in Settings',
    ],
  },
  {
    icon: 'stats-chart' as const,
    title: 'Detailed Statistics',
    description: 'Analyze performance with comprehensive stats and export data.',
    features: [
      'Driver and team statistics',
      'Session history comparison',
      'PDF export for sharing',
      'CSV/JSON data export',
    ],
  },
];

export default function WelcomeScreen() {
  const { isDarkMode, setHasSeenWelcome } = useApp();
  const router = useRouter();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const [currentPage, setCurrentPage] = useState(0);

  const handleComplete = () => {
    setHasSeenWelcome(true);
    router.replace('/(app)/(tabs)');
  };

  const handleNext = () => {
    if (currentPage < PAGES.length - 1) {
      setCurrentPage(currentPage + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleBack = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const page = PAGES[currentPage];
  const isLast = currentPage === PAGES.length - 1;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['left', 'right', 'bottom']}>
      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          {currentPage > 0 ? (
            <Button title="Back" icon="arrow-back" variant="ghost" size="sm" onPress={handleBack} />
          ) : (
            <View style={styles.backButtonPlaceholder} />
          )}
          <View style={styles.headerCenter}>
            <Mono size={typography.body} weight="bold" color={theme.text}>{currentPage + 1}</Mono>
            <Mono size={typography.body} weight="bold" color={theme.textMuted}>{` / ${PAGES.length}`}</Mono>
          </View>
          {!isLast ? (
            <Button title="Skip" variant="ghost" size="sm" onPress={handleSkip} />
          ) : (
            <View style={styles.skipButtonPlaceholder} />
          )}
        </View>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: theme.primaryMuted, borderColor: theme.primary }]}>
              <Ionicons name={page.icon} size={72} color={theme.primary as string} />
            </View>
          </View>

          <Label size={typography.label} color={theme.accent} style={styles.kicker}>
            {`STEP ${currentPage + 1} OF ${PAGES.length}`}
          </Label>
          <Text style={[styles.title, { color: theme.text }]}>{page.title}</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {page.description}
          </Text>

          <View style={[styles.featuresContainer, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            {page.features.map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={22} color={theme.primary as string} />
                <Text style={[styles.featureText, { color: theme.text }]}>{feature}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          {/* Page Indicators */}
          <View style={styles.dotsContainer}>
            {PAGES.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      index === currentPage ? theme.primary : theme.border,
                    width: index === currentPage ? 24 : 8,
                  },
                ]}
              />
            ))}
          </View>

          {/* Next/Get Started Button */}
          <Button
            title={isLast ? 'Get Started' : 'Next'}
            icon={isLast ? 'checkmark' : 'arrow-forward'}
            iconPosition="right"
            variant="primary"
            size="lg"
            fullWidth
            glow
            onPress={handleNext}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    paddingTop: 60,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  backButtonPlaceholder: {
    width: 70,
  },
  skipButtonPlaceholder: {
    width: 50,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  contentInner: {
    paddingBottom: spacing.xl,
  },
  iconContainer: {
    alignItems: 'center',
    marginVertical: spacing.xxl,
  },
  iconCircle: {
    width: 144,
    height: 144,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.heading + 8,
    fontWeight: fontWeights.heavy,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    letterSpacing: 0.2,
  },
  description: {
    fontSize: typography.bodyLg,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.sm,
  },
  featuresContainer: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  featureText: {
    fontSize: typography.bodyLg,
    flex: 1,
  },
  footer: {
    padding: spacing.xl,
    paddingBottom: 40,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  dot: {
    height: 8,
    borderRadius: radius.full,
  },
});
