import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Modal,
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
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, shadows } from '../constants/theme';
import { calculateLapType, calculateLapValue, formatTime, parseTimeInput } from '../utils/calculations';
import { VolumeButtonService, LapDetails } from '../services/VolumeButtonService';
import { useAlert } from '../components/CustomAlert';

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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
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
            showAlert({ title: 'Session Ended', message: 'Session saved to history' });
          },
        },
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            {/* Title */}
            <View style={styles.titleContainer}>
              <View style={styles.titleRow}>
                <Ionicons name="timer" size={28} color={theme.primary} />
                <Text style={[styles.screenTitle, { color: theme.text }]}>Regularity Race Timer</Text>
              </View>
              <View style={[styles.titleUnderline, { backgroundColor: theme.primary }]} />
            </View>

            {/* Rejected Lap Message */}
            {rejectedMessage && (
              <View style={[styles.rejectedCard, { backgroundColor: theme.broken }]}>
                <Ionicons name="close-circle" size={20} color="#fff" />
                <Text style={styles.rejectedText}>{rejectedMessage}</Text>
              </View>
            )}

            {/* Status Card */}
            <Animated.View
              style={[
                styles.statusCard,
                { backgroundColor: getStatusColor(), transform: [{ scale: pulseAnim }] },
              ]}
            >
              <Text style={styles.statusText}>{getStatusText()}</Text>
            </Animated.View>

            {/* Driver Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.driverTabs}>
              {team?.drivers.map((d, index) => (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.driverTab,
                    {
                      backgroundColor: activeDriver === index ? theme.primary : theme.surfaceMuted,
                    },
                  ]}
                  onPress={() => setActiveDriver(index)}
                >
                  <Text
                    style={[
                      styles.driverTabText,
                      { color: activeDriver === index ? '#fff' : theme.text },
                    ]}
                  >
                    {d.name}
                  </Text>
                  <Text
                    style={[
                      styles.driverTabLaps,
                      { color: activeDriver === index ? '#fff' : theme.textSecondary },
                    ]}
                  >
                    {d.laps.length} laps
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Timer Display */}
            <View style={[styles.timerCard, { backgroundColor: theme.surfaceElevated }]}>
              <Text style={[styles.timerText, { color: theme.text }]}>
                {elapsedTime.toFixed(2)}s
              </Text>
              <Text style={[styles.timerSubtext, { color: theme.textSecondary }]}>
                Target: {driver?.targetTime}s ({formatTime(driver?.targetTime || 0)})
              </Text>
            </View>

            {/* Controls */}
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: isRunning ? theme.broken : theme.bonus }]}
              onPress={addLap}
            >
              <Ionicons name={isRunning ? 'flag' : 'play'} size={32} color="#fff" />
              <Text style={styles.primaryButtonText}>
                {isRunning ? 'Lap' : 'Start'}
              </Text>
            </TouchableOpacity>

            <View style={styles.secondaryControls}>
              <TouchableOpacity
                style={[styles.halfButton, { backgroundColor: theme.surfaceElevated }]}
                onPress={() => setIsRunning(false)}
              >
                <Ionicons name="stop" size={20} color={theme.text} />
                <Text style={[styles.halfButtonText, { color: theme.text }]}>Stop</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.halfButton, { backgroundColor: theme.surfaceElevated }]}
                onPress={resetTimer}
              >
                <Ionicons name="refresh" size={20} color={theme.text} />
                <Text style={[styles.halfButtonText, { color: theme.text }]}>Reset</Text>
              </TouchableOpacity>
            </View>

            {/* Manual Input */}
            <View style={styles.manualInput}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.surfaceElevated,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="Lap time (MM:SS.mmm)"
                placeholderTextColor={theme.textSecondary}
                value={lapInput}
                onChangeText={setLapInput}
                keyboardType="numbers-and-punctuation"
              />
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: theme.primary }]}
                onPress={addLap}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Lap History */}
            <View style={styles.lapHistory}>
              <View style={styles.historyHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Lap History</Text>
                {driver?.laps.length > 0 && (
                  <TouchableOpacity
                    style={[styles.endSessionButton, { backgroundColor: theme.warning }]}
                    onPress={endSession}
                  >
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.endSessionText}>End Session</Text>
                  </TouchableOpacity>
                )}
              </View>
              {driver?.laps.length === 0 ? (
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No laps recorded</Text>
              ) : (
                driver?.laps
                  .slice()
                  .reverse()
                  .map((lap, index) => {
                    const renderRightActions = () => (
                      <View style={styles.swipeActions}>
                        <TouchableOpacity
                          style={styles.deleteAction}
                          onPress={() => deleteLap(index)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.deleteIconContainer}>
                            <Ionicons name="trash" size={26} color="#fff" />
                          </View>
                          <Text style={styles.deleteActionText}>DELETE</Text>
                        </TouchableOpacity>
                      </View>
                    );

                    return (
                      <Swipeable
                        key={lap.number}
                        renderRightActions={renderRightActions}
                        overshootRight={false}
                      >
                        <Pressable
                          style={[styles.lapItem, { backgroundColor: theme.surfaceElevated }]}
                          onLongPress={() => showLapOptions(index)}
                          delayLongPress={500}
                        >
                          <Text style={[styles.lapNumber, { color: theme.text }]}>#{lap.number}</Text>
                          <View style={styles.lapDetails}>
                            <Text style={[styles.lapTime, { color: theme.text }]}>
                              {formatTime(lap.time)}
                            </Text>
                            <Text
                              style={[
                                styles.lapDelta,
                                { color: lap.delta < 0 ? theme.broken : lap.delta <= 0.99 ? theme.bonus : theme.base },
                              ]}
                            >
                              {' • '}
                              {lap.delta >= 0 ? '+' : ''}
                              {lap.delta.toFixed(3)}s
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.lapTypeBadge,
                              {
                                backgroundColor:
                                  lap.lapType === 'bonus'
                                    ? theme.bonus
                                    : lap.lapType === 'broken'
                                      ? theme.broken
                                      : lap.lapType === 'changeover'
                                        ? theme.changeover
                                        : lap.lapType === 'safety'
                                          ? theme.safety
                                          : theme.base,
                              },
                            ]}
                          >
                            <Text style={styles.lapTypeBadgeText}>
                              {lap.lapType.toUpperCase()}
                            </Text>
                          </View>
                        </Pressable>
                      </Swipeable>
                    );
                  })
              )}
            </View>
          </View>

          {/* Edit Lap Modal */}
          <Modal
            visible={editModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setEditModalVisible(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setEditModalVisible(false)}
            >
              <Pressable
                style={[styles.modalContent, { backgroundColor: theme.card }]}
                onPress={(e) => e.stopPropagation()}
              >
                <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Lap Time</Text>

                <TextInput
                  style={[
                    styles.modalInput,
                    { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                  ]}
                  value={editLapValue}
                  onChangeText={setEditLapValue}
                  keyboardType="decimal-pad"
                  placeholder="Enter time in seconds"
                  placeholderTextColor={theme.textSecondary}
                  autoFocus
                />

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: theme.textSecondary }]}
                    onPress={() => setEditModalVisible(false)}
                  >
                    <Text style={styles.modalButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: theme.primary }]}
                    onPress={saveEditedLap}
                  >
                    <Text style={styles.modalButtonText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>

          {/* Race Info Modal */}
          <Modal
            visible={raceInfoModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setRaceInfoModalVisible(false)}
          >

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ flex: 1 }}
            >
              <Pressable
                style={styles.sheetOverlay}
                onPress={() => setRaceInfoModalVisible(false)}
              >
                <Pressable
                  style={[styles.sheetContent, { backgroundColor: theme.card }]}
                  onPress={(e) => e.stopPropagation()}
                >
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Missing Information</Text>
                  <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                    Please enter all required fields to record laps
                  </Text>

                  <TextInput
                    style={[
                      styles.modalInput,
                      { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                    ]}
                    value={tempTeamName}
                    onChangeText={setTempTeamName}
                    placeholder="Team Name"
                    placeholderTextColor={theme.textSecondary}
                    autoFocus
                  />

                  <TextInput
                    style={[
                      styles.modalInput,
                      { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                    ]}
                    value={tempDriverName}
                    onChangeText={setTempDriverName}
                    placeholder="Driver Name"
                    placeholderTextColor={theme.textSecondary}
                  />

                  <TextInput
                    style={[
                      styles.modalInput,
                      { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                    ]}
                    value={tempRaceName}
                    onChangeText={setTempRaceName}
                    placeholder="Race Name"
                    placeholderTextColor={theme.textSecondary}
                  />

                  <TextInput
                    style={[
                      styles.modalInput,
                      { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                    ]}
                    value={tempSessionNumber}
                    onChangeText={setTempSessionNumber}
                    placeholder="Session Number"
                    placeholderTextColor={theme.textSecondary}
                  />

                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.modalButton, { backgroundColor: theme.textSecondary }]}
                      onPress={() => setRaceInfoModalVisible(false)}
                    >
                      <Text style={styles.modalButtonText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalButton, { backgroundColor: theme.primary }]}
                      onPress={saveRaceInfo}
                    >
                      <Text style={styles.modalButtonText}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </Pressable>
              </Pressable>
            </KeyboardAvoidingView>
          </Modal>

          {/* Session Setup Modal */}
          <Modal
            visible={showSessionSetup}
            transparent
            animationType="slide"
            onRequestClose={() => { }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.sessionSetupOverlay}
            >
              <View style={[styles.sessionSetupContent, { backgroundColor: theme.card }]}>
                <View style={styles.sessionSetupHeader}>
                  <Ionicons name="flag" size={40} color={theme.primary} />
                  <Text style={[styles.sessionSetupTitle, { color: theme.text }]}>
                    Start New Session
                  </Text>
                  <Text style={[styles.sessionSetupSubtitle, { color: theme.textSecondary }]}>
                    Set up your race session details
                  </Text>
                </View>

                <View style={styles.sessionSetupFields}>
                  <View style={styles.sessionField}>
                    <Text style={[styles.sessionFieldLabel, { color: theme.textSecondary }]}>
                      Team Name
                    </Text>
                    <TextInput
                      style={[styles.sessionInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                      value={setupTeamName}
                      onChangeText={setSetupTeamName}
                      placeholder="Enter team name"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  <View style={styles.sessionField}>
                    <Text style={[styles.sessionFieldLabel, { color: theme.textSecondary }]}>
                      Race Name
                    </Text>
                    <TextInput
                      style={[styles.sessionInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                      value={setupRaceName}
                      onChangeText={setSetupRaceName}
                      placeholder="Enter race name"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  <View style={styles.sessionField}>
                    <Text style={[styles.sessionFieldLabel, { color: theme.textSecondary }]}>
                      Session Number
                    </Text>
                    <TextInput
                      style={[styles.sessionInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                      value={setupSessionNumber}
                      onChangeText={setSetupSessionNumber}
                      keyboardType="number-pad"
                      placeholder="e.g., 1, 2, Practice"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  <View style={styles.sessionField}>
                    <Text style={[styles.sessionFieldLabel, { color: theme.textSecondary }]}>
                      Session Duration (minutes)
                    </Text>
                    <TextInput
                      style={[styles.sessionInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                      value={setupSessionDuration}
                      onChangeText={setSetupSessionDuration}
                      placeholder="120"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.sessionStartButton, { backgroundColor: theme.primary }]}
                  onPress={handleStartSession}
                >
                  <Ionicons name="checkmark-circle" size={24} color="#fff" />
                  <Text style={styles.sessionStartButtonText}>Start Session</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sessionSkipButton}
                  onPress={() => setShowSessionSetup(false)}
                >
                  <Text style={[styles.sessionSkipButtonText, { color: theme.textSecondary }]}>
                    Skip for now
                  </Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 90,
  },
  titleContainer: {
    marginBottom: spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  screenTitle: {
    fontSize: typography.heading,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.3,
  },
  titleUnderline: {
    height: 3,
    width: 60,
    borderRadius: radius.sm,
    marginLeft: 40,
  },
  rejectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  rejectedText: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
    color: '#fff',
  },
  statusCard: {
    padding: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  statusText: {
    fontSize: typography.heading,
    fontWeight: fontWeights.bold,
    color: '#fff',
  },
  driverTabs: {
    marginBottom: spacing.lg,
  },
  driverTab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginRight: spacing.sm,
  },
  driverTabText: {
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  driverTabLaps: {
    fontSize: typography.caption,
    marginTop: spacing.xs,
  },
  timerCard: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  timerText: {
    fontSize: typography.display,
    fontWeight: fontWeights.bold,
  },
  timerSubtext: {
    fontSize: typography.body,
    marginTop: spacing.sm,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: fontWeights.bold,
  },
  secondaryControls: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  halfButton: {
    flex: 1,
    flexDirection: 'row',
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    ...shadows.subtle,
  },
  halfButtonText: {
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  manualInput: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  input: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: typography.bodyLg,
  },
  addButton: {
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lapHistory: {
    borderRadius: radius.lg,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.title,
    fontWeight: fontWeights.semibold,
  },
  endSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    gap: spacing.xs,
  },
  endSessionText: {
    color: '#fff',
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  emptyText: {
    fontSize: typography.body,
    textAlign: 'center',
    padding: spacing.xl,
  },
  lapItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
  },
  deleteAction: {
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    width: 85,
    height: 85,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  deleteIconContainer: {
    marginBottom: 2,
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.8,
  },
  lapNumber: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
    width: 50,
  },
  lapDetails: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lapTime: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.medium,
  },
  lapDelta: {
    fontSize: typography.body,
  },
  lapTypeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  lapTypeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: fontWeights.semibold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadows.modal,
  },
  modalTitle: {
    fontSize: typography.heading,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: typography.body,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.bodyLg,
    marginBottom: spacing.xl,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
  },
  sessionSetupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionSetupContent: {
    width: '90%',
    maxWidth: 500,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    ...shadows.modal,
  },
  sessionSetupHeader: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  sessionSetupTitle: {
    fontSize: 26,
    fontWeight: fontWeights.bold,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sessionSetupSubtitle: {
    fontSize: typography.body,
    textAlign: 'center',
  },
  sessionSetupFields: {
    gap: spacing.xl,
    marginBottom: spacing.xl,
  },
  sessionField: {
    gap: spacing.sm,
  },
  sessionFieldLabel: {
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  sessionInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.bodyLg,
  },
  sessionStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sessionStartButtonText: {
    color: '#fff',
    fontSize: typography.title,
    fontWeight: fontWeights.bold,
  },
  sessionSkipButton: {
    padding: spacing.md,
    alignItems: 'center',
  },
  sessionSkipButtonText: {
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    width: '100%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    ...shadows.modal,
  },
});
