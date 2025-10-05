import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Animated,
  Modal,
  Pressable,
  Vibration,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, AudioSource } from 'expo-audio';
import { Swipeable } from 'react-native-gesture-handler';
import { VolumeManager } from 'react-native-volume-manager';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme } from '../constants/theme';
import { calculateLapType, calculateLapValue, formatTime } from '../utils/calculations';
import { VolumeButtonService, LapDetails } from '../services/VolumeButtonService';
import { PersistentTimerNotification } from '../services/PersistentTimerNotification';

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
  const [tempRaceName, setTempRaceName] = useState('');
  const [tempSessionNumber, setTempSessionNumber] = useState('');

  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastLapTimeRef = useRef<number | null>(null);
  const beforeTargetBeepPlayedRef = useRef(false);
  const afterStartBeepPlayedRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const initialVolumeRef = useRef<number | null>(null);
  const addLapRef = useRef<() => void>();

  // Audio player for beeps
  const beepPlayer = useAudioPlayer('https://www.soundjay.com/buttons/sounds/beep-07a.mp3');

  // Initialize VolumeButtonService and PersistentTimerNotification
  useEffect(() => {
    VolumeButtonService.initialize();
    PersistentTimerNotification.initialize();
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
      // Show persistent notification when timer is running (for background mode)
      if (audioSettings.backgroundRecordingEnabled && driver) {
        PersistentTimerNotification.showTimer(driver.name, driver.targetTime);
      }

      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - (startTimeRef.current || now)) / 10) / 100;
        setElapsedTime(elapsed);

        // Update persistent notification with current time
        if (audioSettings.backgroundRecordingEnabled) {
          PersistentTimerNotification.updateTimer(elapsed);
        }

        // After lap start beep
        if (
          audioSettings.afterLapStartEnabled &&
          elapsed >= audioSettings.afterLapStart &&
          !afterStartBeepPlayedRef.current
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
      // Hide persistent notification when timer stops
      PersistentTimerNotification.hideTimer();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      PersistentTimerNotification.hideTimer();
    };
  }, [isRunning, driver, audioSettings]);

  // Volume button listener for lap recording
  useEffect(() => {
    if (!audioSettings.volumeButtonsEnabled) {
      VolumeButtonService.disable();
      return;
    }

    // Enable volume button service
    VolumeButtonService.enable(audioSettings.backgroundRecordingEnabled);

    // Add lap recording listener that returns lap details
    const handleLapRecording = (): LapDetails | null => {
      // Store the current lap count before attempting to add a lap
      const previousLapCount = driver?.laps.length || 0;

      if (addLapRef.current) {
        addLapRef.current();
      }

      // Check if a new lap was actually recorded (lap count increased)
      if (!driver || driver.laps.length === 0 || driver.laps.length === previousLapCount) {
        return null; // No new lap was recorded (validation failed or other issue)
      }

      // Get the latest lap details after recording
      const lastLap = driver.laps[driver.laps.length - 1];
      return {
        time: lastLap.time,
        lapType: lastLap.lapType,
        delta: lastLap.delta,
        lapNumber: lastLap.number,
      };
    };

    VolumeButtonService.addListener(handleLapRecording);

    return () => {
      VolumeButtonService.removeListener(handleLapRecording);
      VolumeButtonService.disable();
    };
  }, [audioSettings.volumeButtonsEnabled, audioSettings.backgroundRecordingEnabled, driver]);

  const playBeep = (isDouble: boolean) => {
    if (!audioSettings.enabled) return;

    try {
      // Play the beep sound and vibrate
      beepPlayer.seekTo(0);
      beepPlayer.play();
      Vibration.vibrate(100);

      if (isDouble) {
        // Wait 200ms then play again for double beep
        setTimeout(() => {
          beepPlayer.seekTo(0);
          beepPlayer.play();
          Vibration.vibrate(100);
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

    // Check team name
    if (!currentTeam.name?.trim()) {
      Alert.alert('Missing Information', 'Please set the Team Name in the Team tab before recording laps.');
      return;
    }

    // Check driver name
    if (!driver.name?.trim()) {
      Alert.alert('Missing Information', 'Please set the Driver Name in the Team tab before recording laps.');
      return;
    }

    // Check race name and session number
    if (!currentTeam.raceName?.trim() || !currentTeam.sessionNumber?.trim()) {
      setTempRaceName(currentTeam.raceName || '');
      setTempSessionNumber(currentTeam.sessionNumber || '');
      setRaceInfoModalVisible(true);
      return;
    }

    const updatedTeams = [...teams];
    const currentDriver = updatedTeams[activeTeam].drivers[activeDriver];

    if (lapInput) {
      const lapTime = parseFloat(lapInput);
      if (isNaN(lapTime) || lapTime <= 0) return;

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
      Vibration.vibrate(500); // Vibrate for half a second
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
          Vibration.vibrate([0, 100, 100, 100]);
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
      Vibration.vibrate(500); // Vibrate for half a second
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

  const deleteLap = (lapIndex: number) => {
    const actualIndex = driver!.laps.length - 1 - lapIndex;
    Alert.alert(
      'Delete Lap',
      `Delete lap #${driver!.laps[actualIndex].number}?`,
      [
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
      ]
    );
  };

  const openEditModal = (lapIndex: number) => {
    const actualIndex = driver!.laps.length - 1 - lapIndex;
    setSelectedLapIndex(actualIndex);
    setEditLapValue(driver!.laps[actualIndex].time.toString());
    setEditModalVisible(true);
  };

  const saveRaceInfo = () => {
    if (!tempRaceName.trim() || !tempSessionNumber.trim()) {
      Alert.alert('Missing Information', 'Please enter both Race Name and Session Number');
      return;
    }

    const updatedTeams = [...teams];
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
      Alert.alert('Invalid Time', 'Please enter a valid lap time');
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

    Alert.alert(
      `Lap #${lap.number} Options`,
      `Time: ${formatTime(lap.time)}`,
      [
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
      ]
    );
  };

  const endSession = () => {
    if (!team || team.drivers.every(d => d.laps.length === 0)) {
      Alert.alert('No Data', 'Cannot end session with no laps recorded');
      return;
    }

    Alert.alert(
      'End Session',
      'This will save the current session to history and clear all laps. Continue?',
      [
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
            Alert.alert('Session Ended', 'Session saved to history');
          },
        },
      ]
    );
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
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
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
                  backgroundColor: activeDriver === index ? theme.primary : theme.card,
                  borderColor: theme.border,
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
        <View style={[styles.timerCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.timerText, { color: theme.text }]}>
            {elapsedTime.toFixed(2)}s
          </Text>
          <Text style={[styles.timerSubtext, { color: theme.textSecondary }]}>
            Target: {driver?.targetTime}s ({formatTime(driver?.targetTime || 0)})
          </Text>
        </View>

        {/* Controls */}
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          onPress={addLap}
        >
          <Ionicons name={isRunning ? 'flag' : 'play'} size={32} color="#fff" />
          <Text style={styles.primaryButtonText}>
            {isRunning ? 'Lap' : 'Start'}
          </Text>
        </TouchableOpacity>

        <View style={styles.secondaryControls}>
          <TouchableOpacity
            style={[styles.halfButton, { borderColor: theme.border, backgroundColor: theme.card }]}
            onPress={() => setIsRunning(false)}
          >
            <Ionicons name="stop" size={20} color={theme.text} />
            <Text style={[styles.halfButtonText, { color: theme.text }]}>Stop</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.halfButton, { borderColor: theme.border, backgroundColor: theme.card }]}
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
              { backgroundColor: theme.card, color: theme.text, borderColor: theme.border },
            ]}
            placeholder="Enter lap time (MM:SS.mmm)"
            placeholderTextColor={theme.textSecondary}
            value={lapInput}
            onChangeText={setLapInput}
            keyboardType="decimal-pad"
          />
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.primary }]}
            onPress={addLap}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Lap History */}
        <View style={[styles.lapHistory, { backgroundColor: theme.card }]}>
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
                    >
                      <Ionicons name="trash-outline" size={24} color="#fff" />
                      <Text style={styles.deleteActionText}>Delete</Text>
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
                      style={[styles.lapItem, { borderBottomColor: theme.border, backgroundColor: theme.card }]}
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
        animationType="fade"
        onRequestClose={() => setRaceInfoModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setRaceInfoModalVisible(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: theme.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>Race Information Required</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Please enter race name and session number to record laps
            </Text>

            <TextInput
              style={[
                styles.modalInput,
                { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
              ]}
              value={tempRaceName}
              onChangeText={setTempRaceName}
              placeholder="Race Name"
              placeholderTextColor={theme.textSecondary}
              autoFocus
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
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  rejectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  rejectedText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  statusCard: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  statusText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  driverTabs: {
    marginBottom: 16,
  },
  driverTab: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
  },
  driverTabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  driverTabLaps: {
    fontSize: 12,
    marginTop: 4,
  },
  timerCard: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  timerText: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  timerSubtext: {
    fontSize: 14,
    marginTop: 8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    borderRadius: 16,
    marginBottom: 12,
    gap: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  secondaryControls: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  halfButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  halfButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  manualInput: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  addButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lapHistory: {
    borderRadius: 12,
    padding: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  endSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  endSessionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
  lapItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  swipeActions: {
    flexDirection: 'row',
  },
  deleteAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    height: '100%',
    borderRadius: 8,
    marginLeft: 8,
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  lapNumber: {
    fontSize: 16,
    fontWeight: '600',
    width: 50,
  },
  lapDetails: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lapTime: {
    fontSize: 16,
    fontWeight: '500',
  },
  lapDelta: {
    fontSize: 14,
  },
  lapTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  lapTypeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
