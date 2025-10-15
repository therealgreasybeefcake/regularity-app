import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Defs, Mask } from 'react-native-svg';
import { lightTheme, darkTheme } from '../constants/theme';
import { Team } from '../types';
import { useWalkthroughContext } from '../context/WalkthroughContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface WalkthroughStep {
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'center';
  highlightArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  measureElement?: 'startButton' | 'lapHistory' | 'driverTabs';
  icon?: keyof typeof Ionicons.glyphMap;
}

interface GuidedWalkthroughProps {
  visible: boolean;
  onComplete: () => void;
  isDarkMode: boolean;
  navigation?: any;
  teams: Team[];
  setTeams: (teams: Team[]) => void;
  activeTeam: number;
}

// Calculate positions based on typical layout
// SafeAreaView top edge varies: iOS ~47px, Android ~24px
// Title + status: ~140px
// Driver tabs: starts ~160px from top
// Timer + button area: ~320-400px from top
// Lap history: starts ~500px from top (varies by device)

const getDriverTabsY = () => Platform.OS === 'ios' ? 140 : 120;
const getStartButtonY = () => {
  // Button appears around 52-53% of screen height on most devices
  return SCREEN_HEIGHT * 0.53;
};
const getLapHistoryY = () => {
  // After button(84) + secondary controls(60) + manual input(60) + margins(48) = ~252 from button
  return getStartButtonY() + 250;
};

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    title: 'Welcome to Regularity Race Timer',
    description: 'Let\'s take a quick tour of the key features to get you started!',
    position: 'center',
    icon: 'timer',
  },
  {
    title: 'Start/Lap Button',
    description: 'Tap this large button to start the timer on your first press, then tap again to record each lap time.',
    position: 'top',
    highlightArea: { x: 16, y: getStartButtonY()-5, width: SCREEN_WIDTH - 32, height: 88 },
    icon: 'play-circle',
  },
  {
    title: 'Press and Hold Laps',
    description: 'Press and hold any lap in the history to edit its time, mark it as a changeover/safety car lap, or delete it.',
    position: 'center',
    highlightArea: { x: 16, y: getLapHistoryY()+30, width: SCREEN_WIDTH - 32, height: 50 },
    icon: 'hand-left',
  },
  {
    title: 'Swipe to Delete',
    description: 'Swipe left on any lap to quickly delete it. This is faster than the long press menu.',
    position: 'center',
    highlightArea: { x: 16, y: getLapHistoryY()+25, width: SCREEN_WIDTH - 32, height: 50 },
    icon: 'swap-horizontal',
  },
  {
    title: 'Volume Button Recording',
    description: 'Enable volume buttons in Settings to record laps by pressing volume up/down - keep your eyes on the track!',
    position: 'center',
    icon: 'volume-high',
  },
  {
    title: 'Audio Warnings',
    description: 'Set up audio beeps in Settings to get warnings before your target time. Perfect for signaling to your pit wall!',
    position: 'center',
    icon: 'notifications',
  },
  {
    title: 'Driver Management',
    description: 'Switch between drivers using the tabs at the top. Each driver has their own target time and lap history.',
    position: 'bottom',
    highlightArea: { x: 16, y: getDriverTabsY()+90, width: SCREEN_WIDTH - 32, height: 70 },
    icon: 'people',
  },
  {
    title: 'Session Setup',
    description: 'Set your team name, race name, and session info to keep your data organized. You\'ll be prompted when recording your first lap.',
    position: 'center',
    icon: 'create',
  },
  {
    title: 'View Statistics',
    description: 'Check the Stats tab to see detailed performance metrics, export PDFs, and view session history.',
    position: 'center',
    icon: 'stats-chart',
  },
  {
    title: 'Support Development',
    description: 'Enjoying the app? Consider supporting development with a coffee! Find the "Buy Me a Coffee" button in Settings.',
    position: 'center',
    icon: 'cafe',
  },
  {
    title: 'Ready to Race!',
    description: 'You\'re all set! Remember: you can restart this walkthrough anytime from Settings.',
    position: 'center',
    icon: 'checkmark-circle',
  },
];

export default function GuidedWalkthrough({ visible, onComplete, isDarkMode, navigation, teams, setTeams, activeTeam }: GuidedWalkthroughProps) {
  const theme = isDarkMode ? darkTheme : lightTheme;
  const { elementPositions } = useWalkthroughContext();
  const [currentStep, setCurrentStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const swipeAnim = useRef(new Animated.Value(0)).current;
  const exampleLapsCreatedRef = useRef(false);
  const originalLapsRef = useRef<any>(null);

  // Create example laps when walkthrough becomes visible
  useEffect(() => {
    if (visible && !exampleLapsCreatedRef.current) {
      // Navigate to Timer screen if navigation is available
      if (navigation) {
        navigation.navigate('Timer');
      }

      // Store original laps for restoration later
      const team = teams[activeTeam];
      if (team && team.drivers[0]) {
        originalLapsRef.current = {
          teamIndex: activeTeam,
          driverIndex: 0,
          originalLaps: [...team.drivers[0].laps],
        };

        // Create example laps
        const baseTimestamp = Date.now() - 600000; // 10 minutes ago
        const exampleLaps = [
          { number: 1, lapType: 'base' as const, time: 105.234, delta: 0.234, lapValue: 1, timestamp: baseTimestamp },
          { number: 2, lapType: 'base' as const, time: 104.892, delta: -0.108, lapValue: 1, timestamp: baseTimestamp + 105234 },
          { number: 3, lapType: 'bonus' as const, time: 104.567, delta: -0.433, lapValue: 2, timestamp: baseTimestamp + 210126 },
          { number: 4, lapType: 'base' as const, time: 105.123, delta: 0.123, lapValue: 1, timestamp: baseTimestamp + 314693 },
          { number: 5, lapType: 'changeover' as const, time: 106.789, delta: 1.789, lapValue: 1, timestamp: baseTimestamp + 419816 },
          { number: 6, lapType: 'base' as const, time: 104.901, delta: -0.099, lapValue: 1, timestamp: baseTimestamp + 526605 },
        ];

        const updatedTeams = [...teams];
        updatedTeams[activeTeam] = {
          ...team,
          drivers: team.drivers.map((driver, index) =>
            index === 0
              ? { ...driver, laps: exampleLaps }
              : driver
          ),
        };
        setTeams(updatedTeams);
        exampleLapsCreatedRef.current = true;
      }
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Pulse animation for highlight
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [visible]);

  // Swipe animation for "Swipe to Delete" step
  useEffect(() => {
    if (currentStep === 3) { // Swipe to Delete step
      swipeAnim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.delay(500),
          Animated.timing(swipeAnim, {
            toValue: -90,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.delay(500),
          Animated.timing(swipeAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < WALKTHROUGH_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      // Restore original laps
      if (originalLapsRef.current && exampleLapsCreatedRef.current) {
        const { teamIndex, driverIndex, originalLaps } = originalLapsRef.current;
        const updatedTeams = [...teams];
        const team = updatedTeams[teamIndex];
        if (team) {
          updatedTeams[teamIndex] = {
            ...team,
            drivers: team.drivers.map((driver, index) =>
              index === driverIndex
                ? { ...driver, laps: originalLaps }
                : driver
            ),
          };
          setTeams(updatedTeams);
        }
        exampleLapsCreatedRef.current = false;
        originalLapsRef.current = null;
      }

      setCurrentStep(0);
      onComplete();
    });
  };

  if (!visible) return null;

  const step = WALKTHROUGH_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === WALKTHROUGH_STEPS.length - 1;

  const highlightArea = step.highlightArea;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* Overlay with cutout for highlighted area */}
        <Svg height={SCREEN_HEIGHT} width={SCREEN_WIDTH} style={StyleSheet.absoluteFill}>
          <Defs>
            <Mask id="mask" x="0" y="0" height="100%" width="100%">
              <Rect height="100%" width="100%" fill="#fff" />
              {highlightArea && (
                <Rect
                  x={highlightArea.x}
                  y={highlightArea.y}
                  width={highlightArea.width}
                  height={highlightArea.height}
                  rx={12}
                  fill="#000"
                />
              )}
            </Mask>
          </Defs>
          <Rect
            height="100%"
            width="100%"
            fill="rgba(0, 0, 0, 0.85)"
            mask="url(#mask)"
          />
        </Svg>

        {/* Highlight border */}
        {highlightArea && (
          <Animated.View
            style={[
              styles.highlightBorder,
              {
                left: highlightArea.x,
                top: highlightArea.y,
                width: highlightArea.width,
                height: highlightArea.height,
                transform: [{ scale: pulseAnim }],
              },
            ]}
            pointerEvents="none"
          />
        )}

        {/* Swipe animation for "Swipe to Delete" step */}
        {currentStep === 3 && highlightArea && (
          <View
            style={{
              position: 'absolute',
              left: highlightArea.x,
              top: highlightArea.y,
              width: highlightArea.width,
              height: 42,
              overflow: 'hidden',
              backgroundColor: theme.background,
            }}
            pointerEvents="none"
          >
            {/* Animated swiping lap */}
            <Animated.View
              style={[
                styles.swipeIndicator,
                {
                  transform: [{ translateX: swipeAnim }],
                },
              ]}
            >
              <View style={[styles.swipeLapItem, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <Text style={[styles.swipeLapNumber, { color: theme.text }]}>#3</Text>
                <View style={styles.swipeLapDetails}>
                  <Text style={[styles.swipeLapTime, { color: theme.text }]}>1:44.567</Text>
                  <Text style={[styles.swipeLapDelta, { color: theme.bonus }]}> • -0.433s</Text>
                </View>
                <View style={[styles.swipeLapBadge, { backgroundColor: theme.bonus }]}>
                  <Text style={styles.swipeLapBadgeText}>BONUS</Text>
                </View>
              </View>
              <View style={styles.deleteIndicator}>
                <Ionicons name="trash" size={20} color="#fff" />
                <Text style={styles.deleteText}>DELETE</Text>
              </View>
            </Animated.View>
          </View>
        )}

        {/* Tooltip */}
        <View
          style={[
            styles.tooltip,
            { backgroundColor: theme.card },
            step.position === 'top' && styles.tooltipTop,
            step.position === 'bottom' && styles.tooltipBottom,
            step.position === 'center' && styles.tooltipCenter,
          ]}
        >
          {/* Icon */}
          {step.icon && (
            <View style={[styles.iconContainer, { backgroundColor: theme.primary + '20' }]}>
              <Ionicons name={step.icon} size={48} color={theme.primary} />
            </View>
          )}

          {/* Content */}
          <Text style={[styles.title, { color: theme.text }]}>{step.title}</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {step.description}
          </Text>

          {/* Buy Me a Coffee button for Support Development step */}
          {currentStep === 9 && (
            <TouchableOpacity
              style={[styles.coffeeButton, { backgroundColor: '#FFDD00' }]}
              onPress={() => Linking.openURL('https://buymeacoffee.com/greasybeefcake')}
            >
              <Ionicons name="cafe" size={20} color="#000" />
              <Text style={[styles.coffeeButtonText, { color: '#000' }]}>Buy Me a Coffee</Text>
            </TouchableOpacity>
          )}

          {/* Progress indicator */}
          <View style={styles.progressContainer}>
            {WALKTHROUGH_STEPS.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.progressDot,
                  {
                    backgroundColor: index === currentStep ? theme.primary : theme.border,
                    width: index === currentStep ? 24 : 8,
                  },
                ]}
              />
            ))}
          </View>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <View style={styles.leftButtons}>
              {!isFirstStep && (
                <TouchableOpacity onPress={handleBack} style={styles.secondaryButton}>
                  <Ionicons name="arrow-back" size={20} color={theme.textSecondary} />
                  <Text style={[styles.secondaryButtonText, { color: theme.textSecondary }]}>
                    Back
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.rightButtons}>
              {!isLastStep && (
                <TouchableOpacity onPress={handleSkip} style={styles.secondaryButton}>
                  <Text style={[styles.secondaryButtonText, { color: theme.textSecondary }]}>
                    Skip
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleNext}
                style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              >
                <Text style={styles.primaryButtonText}>
                  {isLastStep ? 'Get Started' : 'Next'}
                </Text>
                <Ionicons
                  name={isLastStep ? 'checkmark' : 'arrow-forward'}
                  size={20}
                  color="#fff"
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  highlightBorder: {
    position: 'absolute',
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#3b82f6',
    backgroundColor: 'transparent',
  },
  tooltip: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  tooltipTop: {
    top: 80,
  },
  tooltipCenter: {
    top: '50%',
    transform: [{ translateY: -200 }],
  },
  tooltipBottom: {
    bottom: 120,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 20,
  },
  coffeeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 20,
    gap: 8,
  },
  coffeeButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  progressDot: {
    height: 8,
    borderRadius: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  leftButtons: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  rightButtons: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  swipeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
  },
  swipeLapItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    flex: 1,
    height:42,
  },
  swipeLapNumber: {
    fontSize: 14,
    fontWeight: '600',
    width: 40,
  },
  swipeLapDetails: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  swipeLapTime: {
    fontSize: 16,
    fontWeight: '500',
  },
  swipeLapDelta: {
    fontSize: 13,
    fontWeight: '500',
  },
  swipeLapBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  swipeLapBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  deleteIndicator: {
    backgroundColor: '#ef4444',
    width: 80,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -80,
  },
  deleteText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
});
