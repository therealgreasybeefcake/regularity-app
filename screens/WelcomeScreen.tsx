import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme } from '../constants/theme';

const { width } = Dimensions.get('window');

interface WelcomeScreenProps {
  onComplete: () => void;
}

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
    description: 'Enable volume buttons in Settings to record laps hands-free while keeping the Timer screen visible.',
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
      'Alert after lap start',
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

export default function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const { isDarkMode } = useApp();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const [currentPage, setCurrentPage] = useState(0);

  const handleNext = () => {
    if (currentPage < PAGES.length - 1) {
      setCurrentPage(currentPage + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const page = PAGES[currentPage];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.pageIndicator, { color: theme.textSecondary }]}>
          {currentPage + 1} / {PAGES.length}
        </Text>
        {currentPage < PAGES.length - 1 && (
          <TouchableOpacity onPress={handleSkip}>
            <Text style={[styles.skipButton, { color: theme.primary }]}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconContainer}>
          <View style={[styles.iconCircle, { backgroundColor: theme.primary + '20' }]}>
            <Ionicons name={page.icon} size={80} color={theme.primary} />
          </View>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>{page.title}</Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {page.description}
        </Text>

        <View style={styles.featuresContainer}>
          {page.features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
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
    </View>
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
    padding: 20,
    paddingTop: 60,
  },
  pageIndicator: {
    fontSize: 14,
    fontWeight: '600',
  },
  skipButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginVertical: 40,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 10,
  },
  featuresContainer: {
    gap: 16,
    paddingBottom: 40,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 16,
    flex: 1,
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
