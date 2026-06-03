import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Pressable,
  Vibration,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';

// Web-safe imports
const isWeb = Platform.OS === 'web';
let activateKeepAwakeAsync: () => Promise<void> = async () => {};
let deactivateKeepAwake: () => void = () => {};
let useAudioPlayerImport: any = null;
let VolumeManager: any = null;
if (!isWeb) {
  const keepAwake = require('expo-keep-awake');
  activateKeepAwakeAsync = keepAwake.activateKeepAwakeAsync;
  deactivateKeepAwake = keepAwake.deactivateKeepAwake;
  useAudioPlayerImport = require('expo-audio').useAudioPlayer;
  VolumeManager = require('react-native-volume-manager').VolumeManager;
}
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, glowShadow } from '../constants/theme';
import { calculateLapType, calculateLapValue, formatTime, parseTimeInput } from '../utils/calculations';
import { VolumeButtonService, LapDetails } from '../services/VolumeButtonService';
import { useAlert } from '../components/CustomAlert';
import LiveShareBanner from '../components/LiveShareBanner';
import { Mono, Label, Card, Surface, Button, IconButton, Chip, TextField, Sheet, LiveDot } from '../components/ui';

export default function TimerScreen() {
  const {
    teams,
    setTeams,
    activeTeam,
    activeDriver,
    setActiveDriver,
    isDarkMode,
    audioSettings,
    lapTypeValues,
    discardLiveSession,
    endLiveSession,
  } = useApp();

  const { showAlert } = useAlert();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const team = teams[activeTeam];
  const driver = team?.drivers[activeDriver];

  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [lapInput, setLapInput] = useState('');
  const [showWarning, setShowWarning] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedLapIndex, setSelectedLapIndex] = useState<number | null>(null);
  const [editLapValue, setEditLapValue] = useState('');
  const [rejectedMessage, setRejectedMessage] = useState<string | null>(null);
  const [raceInfoModalVisible, setRaceInfoModalVisible] = useState(false);
  const [tempTeamName, setTempTeamName] = useState('');
  const [tempDriverName, setTempDriverName] = useState('');
  const [tempRaceName, setTempRaceName] = useState('');
  const [tempSessionNumber, setTempSessionNumber] = useState('');
  const [showSessionSetup, setShowSessionSetup] = useState(false);
  const [setupTeamName, setSetupTeamName] = useState('');
  const [setupRaceName, setSetupRaceName] = useState('');
  const [setupSessionNumber, setSetupSessionNumber] = useState('');
  const [setupSessionDuration, setSetupSessionDuration] = useState('120');

  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLapTimeRef = useRef<number | null>(null);
  const beforeTargetBeepPlayedRef = useRef(false);
  const afterStartBeepPlayedRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const initialVolumeRef = useRef<number | null>(null);
  const addLapRef = useRef<(() => void) | undefined>(undefined);
  const volumeAlertShownRef = useRef(false);

  // Audio player for beeps (no-op on web)
  const beepPlayer = useAudioPlayerImport
    ? useAudioPlayerImport('https://www.soundjay.com/buttons/sounds/beep-07a.mp3')
    : { seekTo: () => {}, play: () => {} };

  // Initialize VolumeButtonService
  useEffect(() => {
    VolumeButtonService.initialize();
  }, []);

  // Check if session setup is needed on mount
  useEffect(() => {
    const needsSetup = !team.name && !team.raceName && !team.sessionNumber && driver.laps.length === 0;
    if (needsSetup) {
      setShowSessionSetup(true);
      setSetupTeamName(team.name || '');
      setSetupRaceName(team.raceName || '');
      setSetupSessionNumber(team.sessionNumber || '');
      setSetupSessionDuration(team.sessionDuration.toString());
    }
  }, []);

  useEffect(() => {
    if (showWarning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [showWarning]);

  useEffect(() => {
    if (isRunning) {
      // Keep screen awake when timer is running
      activateKeepAwakeAsync();

      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - (startTimeRef.current || now)) / 10) / 100;
        setElapsedTime(elapsed);

        // After lap start beep
        if (
          audioSettings.afterLapStartEnabled &&
          elapsed >= audioSettings.afterLapStart &&
          !afterStartBeepPlayedRef.current &&
          driver?.laps.length > 0
        ) {
          playBeep(true);
          afterStartBeepPlayedRef.current = true;
        }

        // Before target beep
        if (driver) {
          const timeUntilTarget = driver.targetTime - elapsed;
          if (
            audioSettings.beforeTargetEnabled &&
            timeUntilTarget <= audioSettings.beforeTargetTime &&
            timeUntilTarget > 0 &&
            !beforeTargetBeepPlayedRef.current
          ) {
            playBeep(false);
            beforeTargetBeepPlayedRef.current = true;
          }

          if (timeUntilTarget <= 10 && timeUntilTarget > 0) {
            setShowWarning(true);
          } else {
            setShowWarning(false);
          }
        }
      }, 10);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setShowWarning(false);
      // Deactivate keep awake when timer stops
      deactivateKeepAwake();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      deactivateKeepAwake();
    };
  }, [isRunning, driver, audioSettings]);

  // Volume button listener for lap recording
  useEffect(() => {
    console.log('[TimerScreen] Volume button enabled setting:', audioSettings.volumeButtonsEnabled);

    if (!audioSettings.volumeButtonsEnabled) {
      VolumeButtonService.disable();
      return;
    }

    // Enable volume button service
    console.log('[TimerScreen] Enabling volume button service...');
    VolumeButtonService.enable();

    // Add lap recording listener that returns lap details
    const handleLapRecording = (): LapDetails | null => {
      console.log('[TimerScreen] handleLapRecording called, driver:', driver?.name);

      // Store the current lap count before attempting to add a lap
      const previousLapCount = driver?.laps.length || 0;

      if (addLapRef.current) {
        console.log('[TimerScreen] Calling addLap function');
        addLapRef.current();
      } else {
        console.log('[TimerScreen] ERROR: addLapRef.current is null!');
      }

      // Check if a new lap was actually recorded (lap count increased)
      if (!driver || driver.laps.length === 0 || driver.laps.length === previousLapCount) {
        console.log('[TimerScreen] No lap recorded - validation failed or no change');
        return null; // No new lap was recorded (validation failed or other issue)
      }

      // Get the latest lap details after recording
      const lastLap = driver.laps[driver.laps.length - 1];
      console.log('[TimerScreen] Lap recorded successfully:', lastLap);
      return {
        time: lastLap.time,
        lapType: lastLap.lapType,
        delta: lastLap.delta,
        lapNumber: lastLap.number,
      };
    };

    console.log('[TimerScreen] Adding lap recording listener');
    VolumeButtonService.addListener(handleLapRecording);

    return () => {
      console.log('[TimerScreen] Cleaning up volume button listener');
      VolumeButtonService.removeListener(handleLapRecording);
      VolumeButtonService.disable();
    };
  }, [audioSettings.volumeButtonsEnabled, driver]);

  // Volume button UX - show hint when disabled (native only)
  useEffect(() => {
    if (isWeb || audioSettings.volumeButtonsEnabled || !VolumeManager) return;

    const listener = VolumeManager.addVolumeListener((result: any) => {
      if (!volumeAlertShownRef.current) {
        volumeAlertShownRef.current = true;
        showAlert({ title: 'Volume Buttons', message: 'Volume button recording is disabled. Enable it in Settings > Lap Recording Controls.' });
      }
    });

    return () => {
      listener.remove();
    };
  }, [audioSettings.volumeButtonsEnabled]);

  const playBeep = (isDouble: boolean) => {
    if (!audioSettings.enabled) return;

    try {
      // Play the beep sound and vibrate
      beepPlayer.seekTo(0);
      beepPlayer.play();
      if (!isWeb) Vibration.vibrate(100);

      if (isDouble) {
        // Wait 200ms then play again for double beep
        setTimeout(() => {
          beepPlayer.seekTo(0);
          beepPlayer.play();
          if (!isWeb) Vibration.vibrate(100);
        }, 200);
      }
    } catch (error) {
      console.error('Error playing beep:', error);
    }
  };

  const startStopwatch = () => {
    startTimeRef.current = Date.now();
    setElapsedTime(0);
    setIsRunning(true);
    beforeTargetBeepPlayedRef.current = false;
    afterStartBeepPlayedRef.current = false;
  };

  const addLap = () => {
    if (!driver) return;

    // Validate all required fields are set
    const currentTeam = teams[activeTeam];

    // Check if any required fields are missing
    const missingTeamName = !currentTeam.name?.trim();
    const missingDriverName = !driver.name?.trim();
    const missingRaceName = !currentTeam.raceName?.trim();
    const missingSessionNumber = !currentTeam.sessionNumber?.trim();

    if (missingTeamName || missingDriverName || missingRaceName || missingSessionNumber) {
      // Pre-fill modal with current values
      setTempTeamName(currentTeam.name || '');
      setTempDriverName(driver.name || '');
      setTempRaceName(currentTeam.raceName || '');
      setTempSessionNumber(currentTeam.sessionNumber || '');
      setRaceInfoModalVisible(true);
      return;
    }

    const updatedTeams = [...teams];
    const currentDriver = updatedTeams[activeTeam].drivers[activeDriver];

    if (lapInput) {
      const lapTime = parseTimeInput(lapInput);
      if (lapTime === null || lapTime <= 0) return;

      const isChangeover = !!(lastLapTimeRef.current && Date.now() - lastLapTimeRef.current > 180000);
      const delta = lapTime - currentDriver.targetTime;
      const lapType = calculateLapType(delta, isChangeover);

      currentDriver.laps.push({
        number: currentDriver.laps.length + 1,
        time: lapTime,
        delta,
        lapType,
        lapValue: calculateLapValue(lapType, lapTypeValues),
        timestamp: Date.now(),
      });

      setTeams(updatedTeams);
      setLapInput('');
      lastLapTimeRef.current = Date.now();
      if (!isWeb) Vibration.vibrate(500);
      return;
    }

    if (!isRunning) {
      startStopwatch();
      lastLapTimeRef.current = Date.now();
    } else {
      const lapTime = elapsedTime;

      // Check lap recording guard
      if (audioSettings.lapGuardEnabled) {
        const minTime = currentDriver.targetTime - audioSettings.lapGuardRange;
        const maxTime = currentDriver.targetTime + audioSettings.lapGuardRange;
        const safetyCarThreshold = currentDriver.targetTime + audioSettings.lapGuardSafetyCarThreshold;

        // Allow if within normal range OR if it's a safety car lap (significantly over)
        const isInNormalRange = lapTime >= minTime && lapTime <= maxTime;
        const isSafetyCar = lapTime >= safetyCarThreshold;

        if (!isInNormalRange && !isSafetyCar) {
          // Outside allowed range and not a safety car - reject
          if (!isWeb) Vibration.vibrate([0, 100, 100, 100]);
          setRejectedMessage(`Lap rejected: ${lapTime.toFixed(2)}s outside range (${minTime.toFixed(1)}-${maxTime.toFixed(1)}s, or ${safetyCarThreshold.toFixed(1)}s+ for safety car)`);
          setTimeout(() => setRejectedMessage(null), 3000);
          return;
        }
      }

      const isChangeover = !!(lastLapTimeRef.current && Date.now() - lastLapTimeRef.current > 180000);
      const delta = lapTime - currentDriver.targetTime;
      const lapType = calculateLapType(delta, isChangeover);

      currentDriver.laps.push({
        number: currentDriver.laps.length + 1,
        time: lapTime,
        delta,
        lapType,
        lapValue: calculateLapValue(lapType, lapTypeValues),
        timestamp: Date.now(),
      });

      setTeams(updatedTeams);
      lastLapTimeRef.current = Date.now();
      if (!isWeb) Vibration.vibrate(500);
      startStopwatch();
    }
  };

  // Keep addLap ref updated
  useEffect(() => {
    addLapRef.current = addLap;
  });

  const resetTimer = () => {
    setIsRunning(false);
    setElapsedTime(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const handleStartSession = () => {
    const duration = parseInt(setupSessionDuration) || 120;
    const updatedTeams = [...teams];
    updatedTeams[activeTeam] = {
      ...team,
      name: setupTeamName,
      raceName: setupRaceName,
      sessionNumber: setupSessionNumber,
      sessionDuration: duration,
    };
    setTeams(updatedTeams);
    setShowSessionSetup(false);
  };

  const deleteLap = (lapIndex: number) => {
    const actualIndex = driver!.laps.length - 1 - lapIndex;
    showAlert({
      title: 'Delete Lap',
      message: `Delete lap #${driver!.laps[actualIndex].number}?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updatedTeams = [...teams];
            updatedTeams[activeTeam].drivers[activeDriver].laps.splice(actualIndex, 1);
            // Renumber remaining laps
            updatedTeams[activeTeam].drivers[activeDriver].laps.forEach((lap, idx) => {
              lap.number = idx + 1;
            });
            setTeams(updatedTeams);
          },
        },
      ],
    });
  };

  const openEditModal = (lapIndex: number) => {
    const actualIndex = driver!.laps.length - 1 - lapIndex;
    setSelectedLapIndex(actualIndex);
    setEditLapValue(driver!.laps[actualIndex].time.toString());
    setEditModalVisible(true);
  };

  const saveRaceInfo = () => {
    // Validate all required fields
    if (!tempTeamName.trim()) {
      showAlert({ title: 'Missing Information', message: 'Please enter Team Name' });
      return;
    }
    if (!tempDriverName.trim()) {
      showAlert({ title: 'Missing Information', message: 'Please enter Driver Name' });
      return;
    }
    if (!tempRaceName.trim()) {
      showAlert({ title: 'Missing Information', message: 'Please enter Race Name' });
      return;
    }
    if (!tempSessionNumber.trim()) {
      showAlert({ title: 'Missing Information', message: 'Please enter Session Number' });
      return;
    }

    const updatedTeams = [...teams];
    updatedTeams[activeTeam].name = tempTeamName.trim();
    updatedTeams[activeTeam].drivers[activeDriver].name = tempDriverName.trim();
    updatedTeams[activeTeam].raceName = tempRaceName.trim();
    updatedTeams[activeTeam].sessionNumber = tempSessionNumber.trim();
    setTeams(updatedTeams);
    setRaceInfoModalVisible(false);

    // After saving race info, retry lap recording
    setTimeout(() => {
      addLap();
    }, 100);
  };

  const saveEditedLap = () => {
    if (selectedLapIndex === null || !driver) return;

    const newTime = parseFloat(editLapValue);
    if (isNaN(newTime) || newTime <= 0) {
      showAlert({ title: 'Invalid Time', message: 'Please enter a valid lap time' });
      return;
    }

    const updatedTeams = [...teams];
    const lap = updatedTeams[activeTeam].drivers[activeDriver].laps[selectedLapIndex];
    lap.time = newTime;
    lap.delta = newTime - driver.targetTime;
    lap.lapType = calculateLapType(lap.delta, lap.lapType === 'changeover', lap.lapType === 'safety');
    lap.lapValue = calculateLapValue(lap.lapType, lapTypeValues);

    setTeams(updatedTeams);
    setEditModalVisible(false);
    setSelectedLapIndex(null);
    setEditLapValue('');
  };

  const toggleLapType = (lapIndex: number, newType: 'changeover' | 'safety') => {
    const actualIndex = driver!.laps.length - 1 - lapIndex;
    const updatedTeams = [...teams];
    const lap = updatedTeams[activeTeam].drivers[activeDriver].laps[actualIndex];

    if (lap.lapType === newType) {
      // Remove the special type, recalculate based on delta
      lap.lapType = calculateLapType(lap.delta, false, false);
    } else {
      // Set to the new type
      lap.lapType = newType;
    }

    lap.lapValue = calculateLapValue(lap.lapType, lapTypeValues);
    setTeams(updatedTeams);
  };

  const showLapOptions = (lapIndex: number) => {
    const actualIndex = driver!.laps.length - 1 - lapIndex;
    const lap = driver!.laps[actualIndex];

    showAlert({
      title: `Lap #${lap.number} Options`,
      message: `Time: ${formatTime(lap.time)}`,
      buttons: [
        {
          text: 'Edit Time',
          onPress: () => openEditModal(lapIndex),
        },
        {
          text: lap.lapType === 'changeover' ? 'Remove Changeover' : 'Mark as Changeover',
          onPress: () => toggleLapType(lapIndex, 'changeover'),
        },
        {
          text: lap.lapType === 'safety' ? 'Remove Safety Car' : 'Mark as Safety Car',
          onPress: () => toggleLapType(lapIndex, 'safety'),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteLap(lapIndex),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
    });
  };

  const endSession = () => {
    if (!team || team.drivers.every(d => d.laps.length === 0)) {
      showAlert({ title: 'No Data', message: 'Cannot end session with no laps recorded' });
      return;
    }

    showAlert({
      title: 'End Session',
      message: 'This will save the current session to history and clear all laps. Continue?',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: () => {
            const updatedTeams = [...teams];
            const currentTeam = updatedTeams[activeTeam];

            // Create session snapshot with deep copy of drivers
            const session = {
              id: Date.now().toString(),
              raceName: currentTeam.raceName || 'Untitled Race',
              sessionNumber: currentTeam.sessionNumber || 'N/A',
              sessionDuration: currentTeam.sessionDuration,
              timestamp: Date.now(),
              drivers: currentTeam.drivers.map(d => ({
                ...d,
                laps: [...d.laps],
              })),
            };

            // Add to history
            currentTeam.sessionHistory.push(session);

            // Clear current session laps
            currentTeam.drivers.forEach(d => {
              d.laps = [];
              d.penaltyLaps = 0;
            });

            setTeams(updatedTeams);
            resetTimer();
            // Mark the live session ended server-side (kept as history).
            void endLiveSession();
            showAlert({ title: 'Session Ended', message: 'Session saved to history' });
          },
        },
      ],
    });
  };

  const clearSession = () => {
    showAlert({
      title: 'Clear Session',
      message: 'This will clear all laps for every driver without saving. This cannot be undone.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            // Discard the live session server-side too (delete, not just end),
            // before clearing locally so the lap-diff effect doesn't re-end it.
            void discardLiveSession();
            const updatedTeams = [...teams];
            const currentTeam = { ...updatedTeams[activeTeam] };
            updatedTeams[activeTeam] = currentTeam;
            currentTeam.drivers = currentTeam.drivers.map(d => ({
              ...d,
              laps: [],
              penaltyLaps: 0,
            }));
            setTeams(updatedTeams);
            resetTimer();
          },
        },
      ],
    });
  };

  const showSessionActions = () => {
    showAlert({
      title: 'Session Actions',
      buttons: [
        {
          text: 'End Session',
          style: 'default',
          onPress: endSession,
        },
        {
          text: 'Clear Session',
          style: 'destructive',
          onPress: clearSession,
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  };

  const getStatusColor = () => {
    if (!driver || driver.laps.length === 0) return theme.textSecondary;
    const lastLap = driver.laps[driver.laps.length - 1];
    if (lastLap.lapType === 'bonus') return theme.bonus;
    if (lastLap.lapType === 'base') return theme.base;
    if (lastLap.lapType === 'broken') return theme.broken;
    if (lastLap.lapType === 'changeover') return theme.changeover;
    return theme.textSecondary;
  };

  const getStatusText = () => {
    if (!driver || driver.laps.length === 0) return 'WAITING';
    const lastLap = driver.laps[driver.laps.length - 1];
    if (lastLap.lapType === 'bonus') return `BONUS LAP! +${lastLap.delta.toFixed(3)}s`;
    if (lastLap.lapType === 'base') return `BASE LAP +${lastLap.delta.toFixed(3)}s`;
    if (lastLap.lapType === 'broken') return `BROKEN! ${lastLap.delta.toFixed(3)}s`;
    if (lastLap.lapType === 'changeover') return 'CHANGEOVER';
    return 'WAITING';
  };

  // --- Pit Wall presentation helpers ---
  const deltaColor = (delta: number) =>
    (delta < 0 ? theme.broken : delta <= 0.99 ? theme.bonus : theme.base);

  const lapTypeColor = (t: string) =>
    t === 'bonus' ? theme.bonus
      : t === 'broken' ? theme.broken
        : t === 'changeover' ? theme.changeover
          : t === 'safety' ? theme.safety
            : theme.base;

  const lapCount = driver?.laps.length ?? 0;
  const liveDelta = driver ? elapsedTime - driver.targetTime : 0;
  const statusColor = getStatusColor();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <LiveShareBanner />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Label muted>{team?.raceName || 'Regularity Timer'}</Label>
              <View style={styles.headerTitleRow}>
                <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                  {team?.name || 'New Session'}
                </Text>
                {team?.sessionNumber ? <Chip label={`S${team.sessionNumber}`} color={theme.accent} active size="sm" /> : null}
              </View>
            </View>
          </View>

          {/* Rejected lap message */}
          {rejectedMessage && (
            <Surface level="base" style={[styles.rejected, { borderColor: theme.danger }]}>
              <Ionicons name="close-circle" size={18} color={theme.danger as string} />
              <Text style={[styles.rejectedText, { color: theme.text }]}>{rejectedMessage}</Text>
            </Surface>
          )}

          {/* Driver tabs */}
          {team?.drivers?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.driverTabs} contentContainerStyle={styles.driverTabsContent}>
              {team.drivers.map((d, index) => {
                const active = activeDriver === index;
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => setActiveDriver(index)}
                    style={[
                      styles.driverTab,
                      { backgroundColor: active ? theme.primaryMuted : theme.surfaceElevated, borderColor: active ? theme.primary : theme.border },
                    ]}
                  >
                    <Text style={[styles.driverTabName, { color: active ? theme.primary : theme.text }]} numberOfLines={1}>
                      {d.name || 'Driver'}
                    </Text>
                    <Mono size={11} color={active ? theme.primary : theme.textSecondary}>{d.laps.length} laps</Mono>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {/* Hero clock */}
          <Card
            padding="xl"
            style={[styles.clockCard, isRunning && { borderColor: theme.accent }, isRunning && glowShadow(String(theme.accent), 0.4, 18)]}
          >
            <View style={styles.clockTopRow}>
              <Label muted>{isRunning ? 'RECORDING' : 'ELAPSED'}</Label>
              {isRunning && (
                <View style={styles.recRow}>
                  <LiveDot size={8} color={theme.danger} />
                  <Label color={theme.danger}>REC</Label>
                </View>
              )}
            </View>
            <Animated.Text style={[styles.clock, { color: theme.text, transform: [{ scale: pulseAnim }] }]}>
              {elapsedTime.toFixed(2)}
            </Animated.Text>
            <View style={styles.clockMeta}>
              <Label muted>TARGET {driver ? formatTime(driver.targetTime) : '—'}</Label>
              {driver && (isRunning || lapCount > 0) ? (
                <Mono size={typography.title} weight="bold" color={deltaColor(liveDelta)}>
                  {liveDelta >= 0 ? '+' : ''}{liveDelta.toFixed(2)}
                </Mono>
              ) : null}
            </View>
            <View style={[styles.statusStrip, { borderColor: statusColor }]}>
              <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>{getStatusText()}</Text>
            </View>
          </Card>

          {/* Primary action */}
          <Button
            title={isRunning ? 'LAP' : 'START'}
            icon={isRunning ? 'flag' : 'play'}
            onPress={addLap}
            size="lg"
            style={[styles.primaryBtn, { backgroundColor: isRunning ? theme.broken : theme.bonus }, glowShadow(isRunning ? String(theme.broken) : String(theme.bonus), 0.4, 16)]}
            textStyle={styles.primaryBtnText}
          />

          {/* Secondary controls */}
          <View style={styles.secondaryRow}>
            <Button title="Stop" icon="stop" variant="secondary" onPress={() => setIsRunning(false)} style={{ flex: 1 }} />
            <Button title="Reset" icon="refresh" variant="secondary" onPress={resetTimer} style={{ flex: 1 }} />
          </View>

          {/* Manual entry */}
          <View style={styles.manualRow}>
            <TextField
              mono
              placeholder="MM:SS.mmm"
              value={lapInput}
              onChangeText={setLapInput}
              keyboardType="numbers-and-punctuation"
              containerStyle={{ flex: 1 }}
            />
            <IconButton icon="add" variant="primary" size={24} onPress={addLap} accessibilityLabel="Add manual lap" />
          </View>

          {/* Lap history */}
          <View style={styles.historyHeader}>
            <Label size={13}>Lap History</Label>
            {lapCount > 0 && (
              <View style={styles.historyActions}>
                <Button title="End Session" icon="checkmark-circle-outline" size="sm" variant="secondary" onPress={endSession} />
                <Button
                  title="Clear"
                  icon="trash-outline"
                  size="sm"
                  variant="secondary"
                  onPress={clearSession}
                  textStyle={{ color: theme.danger }}
                />
              </View>
            )}
          </View>

          {lapCount === 0 ? (
            <Surface level="base" padding="xl" style={styles.emptyCard}>
              <Ionicons name="time-outline" size={28} color={theme.textMuted as string} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No laps recorded yet</Text>
            </Surface>
          ) : (
            <Surface level="base" padding={0} style={styles.lapList}>
              {driver!.laps.slice().reverse().map((lap, index, arr) => {
                const renderRightActions = () => (
                  <Pressable style={styles.deleteAction} onPress={() => deleteLap(index)}>
                    <Ionicons name="trash" size={24} color="#fff" />
                    <Text style={styles.deleteActionText}>DELETE</Text>
                  </Pressable>
                );
                return (
                  <Swipeable key={lap.number} renderRightActions={renderRightActions} overshootRight={false}>
                    <Pressable
                      onLongPress={() => showLapOptions(index)}
                      delayLongPress={500}
                      style={[
                        styles.lapRow,
                        { backgroundColor: theme.surface, borderBottomColor: theme.borderFaint },
                        index === arr.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <Mono size={13} weight="bold" color={theme.textMuted} style={styles.lapNum}>{lap.number}</Mono>
                      <Mono size={17} weight="medium" color={theme.text} style={{ flex: 1 }}>{formatTime(lap.time)}</Mono>
                      <Mono size={14} weight="bold" color={deltaColor(lap.delta)} style={styles.lapDelta}>
                        {lap.delta >= 0 ? '+' : ''}{lap.delta.toFixed(2)}
                      </Mono>
                      <Chip label={lap.lapType} color={lapTypeColor(lap.lapType)} active size="sm" uppercase style={styles.lapChip} />
                    </Pressable>
                  </Swipeable>
                );
              })}
            </Surface>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Edit Lap Sheet */}
      <Sheet
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        title="Edit Lap Time"
        scroll={false}
        footer={
          <View style={styles.sheetBtns}>
            <Button title="Cancel" variant="secondary" onPress={() => setEditModalVisible(false)} style={{ flex: 1 }} />
            <Button title="Save" onPress={saveEditedLap} style={{ flex: 1 }} />
          </View>
        }
      >
        <TextField
          mono
          label="Lap time (seconds)"
          value={editLapValue}
          onChangeText={setEditLapValue}
          keyboardType="decimal-pad"
          placeholder="Enter time in seconds"
          autoFocus
        />
      </Sheet>

      {/* Race Info Sheet */}
      <Sheet
        visible={raceInfoModalVisible}
        onClose={() => setRaceInfoModalVisible(false)}
        title="Missing Information"
        footer={
          <View style={styles.sheetBtns}>
            <Button title="Cancel" variant="secondary" onPress={() => setRaceInfoModalVisible(false)} style={{ flex: 1 }} />
            <Button title="Save" onPress={saveRaceInfo} style={{ flex: 1 }} />
          </View>
        }
      >
        <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>Please enter all required fields to record laps</Text>
        <View style={styles.sheetFields}>
          <TextField label="Team Name" value={tempTeamName} onChangeText={setTempTeamName} placeholder="Team Name" autoFocus />
          <TextField label="Driver Name" value={tempDriverName} onChangeText={setTempDriverName} placeholder="Driver Name" />
          <TextField label="Race Name" value={tempRaceName} onChangeText={setTempRaceName} placeholder="Race Name" />
          <TextField label="Session Number" value={tempSessionNumber} onChangeText={setTempSessionNumber} placeholder="Session Number" />
        </View>
      </Sheet>

      {/* Session Setup Sheet */}
      <Sheet
        visible={showSessionSetup}
        onClose={() => setShowSessionSetup(false)}
        title="Start New Session"
        footer={
          <>
            <Button title="Start Session" icon="checkmark-circle" onPress={handleStartSession} fullWidth size="lg" />
            <Button title="Skip for now" variant="ghost" onPress={() => setShowSessionSetup(false)} fullWidth />
          </>
        }
      >
        <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>Set up your race session details</Text>
        <View style={styles.sheetFields}>
          <TextField label="Team Name" value={setupTeamName} onChangeText={setSetupTeamName} placeholder="Enter team name" />
          <TextField label="Race Name" value={setupRaceName} onChangeText={setSetupRaceName} placeholder="Enter race name" />
          <TextField label="Session Number" value={setupSessionNumber} onChangeText={setSetupSessionNumber} keyboardType="number-pad" placeholder="e.g., 1, 2, Practice" />
          <TextField mono label="Session Duration (minutes)" value={setupSessionDuration} onChangeText={setSetupSessionDuration} keyboardType="number-pad" placeholder="120" />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  headerTitle: { fontSize: typography.heading, fontWeight: fontWeights.heavy, letterSpacing: 0.2, flexShrink: 1 },

  rejected: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1 },
  rejectedText: { flex: 1, fontSize: typography.caption, fontWeight: fontWeights.medium },

  driverTabs: { marginBottom: spacing.lg, flexGrow: 0 },
  driverTabsContent: { gap: spacing.sm, paddingRight: spacing.lg },
  driverTab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, minWidth: 96 },
  driverTabName: { fontSize: typography.body, fontWeight: fontWeights.semibold },

  clockCard: { alignItems: 'stretch', marginBottom: spacing.lg },
  clockTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clock: { fontSize: typography.hero, fontFamily: 'JetBrainsMono-ExtraBold', letterSpacing: -2, textAlign: 'center', marginVertical: spacing.sm },
  clockMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  statusStrip: { marginTop: spacing.lg, borderWidth: 1, borderRadius: radius.full, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
  statusText: { fontSize: typography.body, fontWeight: fontWeights.bold, letterSpacing: 0.5 },

  primaryBtn: { height: 64, borderRadius: radius.lg, marginBottom: spacing.md },
  primaryBtnText: { fontSize: 22, fontWeight: fontWeights.heavy, letterSpacing: 1 },

  secondaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  manualRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginBottom: spacing.xl },

  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  historyActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },

  emptyCard: { alignItems: 'center', gap: spacing.sm },
  emptyText: { fontSize: typography.body },

  lapList: { overflow: 'hidden' },
  lapRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  lapNum: { width: 34 },
  lapDelta: { width: 72, textAlign: 'right' },
  lapChip: { marginLeft: spacing.md, minWidth: 84 },

  deleteAction: { backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center', width: 88, height: '100%' },
  deleteActionText: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 2, letterSpacing: 0.8 },

  sheetBtns: { flexDirection: 'row', gap: spacing.md },
  sheetSubtitle: { fontSize: typography.body, marginBottom: spacing.lg },
  sheetFields: { gap: spacing.md },
});
