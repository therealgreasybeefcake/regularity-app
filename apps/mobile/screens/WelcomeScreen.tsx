import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, shadows, brandColors } from '../constants/theme';

const { width } = Dimensions.get('window');

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
  {
    icon: 'cafe' as const,
    title: 'Support Development',
    description: 'This app is 100% free with no ads or subscriptions. If you find it valuable, consider supporting development.',
    features: [
      'Optional - enjoy the app either way!',
      'All support helps with improvements',
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

  const handleBuyMeACoffee = () => {
    Linking.openURL('https://buymeacoffee.com/greasybeefcake');
  };

  const page = PAGES[currentPage];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        {currentPage > 0 ? (
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.primary} />
            <Text style={[styles.backButtonText, { color: theme.primary }]}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backButtonPlaceholder} />
        )}
        <Text style={[styles.pageIndicator, { color: theme.textSecondary }]}>
          {currentPage + 1} / {PAGES.length}
        </Text>
        {currentPage < PAGES.length - 1 ? (
          <TouchableOpacity onPress={handleSkip}>
            <Text style={[styles.skipButton, { color: theme.primary }]}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipButtonPlaceholder} />
        )}
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconContainer}>
          <View style={[styles.iconCircle, { backgroundColor: `${String(theme.primary)}20` }]}>
            <Ionicons name={page.icon} size={80} color={theme.primary as string} />
          </View>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>{page.title}</Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {page.description}
        </Text>

        <View style={[styles.featuresContainer, { backgroundColor: theme.surfaceElevated }]}>
          {page.features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
              <Text style={[styles.featureText, { color: theme.text }]}>{feature}</Text>
            </View>
          ))}
        </View>

        {/* Buy Me A Coffee Button - only on last page */}
        {currentPage === PAGES.length - 1 && (
          <TouchableOpacity
            style={styles.coffeeButton}
            onPress={handleBuyMeACoffee}
          >
            <Ionicons name="cafe" size={24} color="#000" />
            <Text style={styles.coffeeButtonText}>Buy Me A Coffee</Text>
          </TouchableOpacity>
        )}
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
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: theme.primary }]}
          onPress={handleNext}
        >
          <Text style={styles.nextButtonText}>
            {currentPage === PAGES.length - 1 ? 'Get Started' : 'Next'}
          </Text>
          <Ionicons
            name={currentPage === PAGES.length - 1 ? 'checkmark' : 'arrow-forward'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    paddingTop: 60,
  },
  pageIndicator: {
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  skipButton: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  backButtonText: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
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
  iconContainer: {
    alignItems: 'center',
    marginVertical: spacing.xxl,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.heading + 8,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
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
    paddingBottom: spacing.xxl,
    padding: spacing.lg,
    borderRadius: radius.md,
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
    height: 10,
    borderRadius: radius.full,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: typography.title,
    fontWeight: fontWeights.semibold,
  },
  coffeeButton: {
    backgroundColor: brandColors.coffee,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    ...shadows.card,
  },
  coffeeButtonText: {
    color: '#000',
    fontSize: typography.title,
    fontWeight: fontWeights.bold,
  },
});
