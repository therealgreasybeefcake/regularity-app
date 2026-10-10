import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  AppState,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';

import * as Haptics from 'expo-haptics';

// Web-safe imports
const isWeb = Platform.OS === 'web';
// Wide-web layout thresholds (window width includes the 200px web sidebar).
const WIDE_MIN_WIDTH = 1100;
const WIDE_MAX_WIDTH = 1440;
const WEB_SIDEBAR_WIDTH = 200;
let activateKeepAwakeAsync: () => Promise<void> = async () => {};
let deactivateKeepAwake: () => void = () => {};
let useAudioPlayerImport: any = null;
let setAudioModeAsyncImport: ((mode: any) => Promise<void>) | null = null;
let VolumeManager: any = null;
if (!isWeb) {
  const keepAwake = require('expo-keep-awake');
  activateKeepAwakeAsync = keepAwake.activateKeepAwakeAsync;
  deactivateKeepAwake = keepAwake.deactivateKeepAwake;
  const expoAudio = require('expo-audio');
  useAudioPlayerImport = expoAudio.useAudioPlayer;
  setAudioModeAsyncImport = expoAudio.setAudioModeAsync;
  VolumeManager = require('react-native-volume-manager').VolumeManager;
}
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, glowShadow } from '../constants/theme';
import { calculateDriverStats, calculateLapType, calculateLapValue, formatTime, parseTimeInput } from '../utils/calculations';
import { driveTime } from '@regularity/core';
import { VolumeButtonService, LapDetails } from '../services/VolumeButtonService';
import { TimerNotificationService } from '../services/TimerNotificationService';
import { useAlert } from '../components/CustomAlert';
import LiveShareBanner from '../components/LiveShareBanner';
import { shareLiveLink } from '../lib/shareLiveLink';
import { Mono, Label, Card, Surface, Button, IconButton, Chip, TextField, Sheet, LiveDot, StatTile } from '../components/ui';

// Why the session setup sheet is open: first-run setup, editing the current
// session's details, or setting up the next session right after ending one.
type SessionSetupMode = 'new' | 'edit' | 'next';

// Drive time as M:SS, or H:MM:SS from an hour.
const formatDuration = (seconds: number): string => {
  const s = Math.floor(Math.max(0, seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

const SESSION_SETUP_COPY: Record<SessionSetupMode, { title: string; subtitle: string; primaryLabel: string; secondaryLabel: string }> = {
  new: {
    title: 'Start New Session',
    subtitle: 'Set up your race session details',
    primaryLabel: 'Start Session',
    secondaryLabel: 'Skip for now',
  },
  edit: {
    title: 'Edit Session',
    subtitle: 'Update your race session details',
    primaryLabel: 'Save Changes',
    secondaryLabel: 'Cancel',
  },
  next: {
    title: 'Start Next Session',
    subtitle: 'Session saved to history. Set up the next session.',
    primaryLabel: 'Start Session',
    secondaryLabel: 'Skip for now',
  },
};

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
    ensureLiveSession,
    discardLiveSession,
    endLiveSession,
    reportTimerState,
    liveEndedByUser,
    syncLapEdit,
    syncLapDelete,
    liveSession,
    liveShareUrl,
    teamLivePublicToken,
    refreshTeamLive,
    endActiveLiveSession,
  } = useApp();
  const router = useRouter();

  // Re-check the team's live status whenever the Timer regains focus (e.g. after
  // being redirected back here when a session ends) so the peer banner clears.
  useFocusEffect(
    useCallback(() => {
      refreshTeamLive();
    }, [refreshTeamLive]),
  );

  const { showAlert } = useAlert();
  const theme = isDarkMode ? darkTheme : lightTheme;
  // Laptop/desktop web: two columns (clock + controls | full lap history).
  const { width: windowWidth } = useWindowDimensions();
  const wide = isWeb && windowWidth >= WIDE_MIN_WIDTH;
  // Size the clock to its column so a 6-character time ("123.45") always fits.
  const wideContentW = Math.min(windowWidth - WEB_SIDEBAR_WIDTH, WIDE_MAX_WIDTH) - spacing.xl * 2;
  const wideRightW = Math.min(Math.max(wideContentW * 0.4, 360), 520);
  const wideClockSize = Math.round(Math.min(176, (wideContentW - wideRightW - spacing.xl - spacing.xl * 2) / 4));
  const team = teams[activeTeam] ?? teams[0];
  const driver = team?.drivers?.[activeDriver] ?? team?.drivers?.[0];

  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [lapInput, setLapInput] = useState('');
  const [showWarning, setShowWarning] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedLapIndex, setSelectedLapIndex] = useState<number | null>(null);
  const [editLapValue, setEditLapValue] = useState('');
  const [rejectedLap, setRejectedLap] = useState<{
    time: number;
    recordedAt: number;
    minTime: number;
    maxTime: number;
    safetyCarThreshold: number;
  } | null>(null);
  const rejectedLapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [raceInfoModalVisible, setRaceInfoModalVisible] = useState(false);
  const [tempTeamName, setTempTeamName] = useState('');
  const [tempDriverName, setTempDriverName] = useState('');
  const [tempRaceName, setTempRaceName] = useState('');
  const [tempSessionNumber, setTempSessionNumber] = useState('');
  const [showSessionSetup, setShowSessionSetup] = useState(false);
  const [driverPickerVisible, setDriverPickerVisible] = useState(false);
  // Driver change armed during the outgoing driver's in-lap: the next LAP press
  // records that lap as a changeover for `from`, switches to `next` and stops,
  // ready for START when the incoming driver crosses the line.
  const [pendingChangeover, setPendingChangeover] = useState<{ from: number; next: number } | null>(null);
  const [changeDriverPickerVisible, setChangeDriverPickerVisible] = useState(false);
  const [setupTeamName, setSetupTeamName] = useState('');
  const [setupRaceName, setSetupRaceName] = useState('');
  const [setupSessionNumber, setSetupSessionNumber] = useState('');
  const [setupSessionDuration, setSetupSessionDuration] = useState('120');
  const [sessionSetupMode, setSessionSetupMode] = useState<SessionSetupMode>('new');

  const openSessionSetup = (mode: SessionSetupMode, overrides?: { sessionNumber?: string }) => {
    setSetupTeamName(team?.name || '');
    setSetupRaceName(team?.raceName || '');
    setSetupSessionNumber(overrides?.sessionNumber ?? (team?.sessionNumber || ''));
    setSetupSessionDuration(String(team?.sessionDuration ?? 120));
    setSessionSetupMode(mode);
    setShowSessionSetup(true);
  };

  // Skipping the "next session" prompt still moves on to the next session number —
  // otherwise the next session is recorded under the one just ended.
  const dismissSessionSetup = () => {
    if (sessionSetupMode === 'next' && team && setupSessionNumber !== team.sessionNumber) {
      const updatedTeams = [...teams];
      updatedTeams[activeTeam] = { ...team, sessionNumber: setupSessionNumber };
      setTeams(updatedTeams);
    }
    setShowSessionSetup(false);
  };

  // "Different race" — blanks the race fields but keeps team name and duration.
  const clearSessionDetails = () => {
    setSetupRaceName('');
    setSetupSessionNumber('');
  };

  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLapTimeRef = useRef<number | null>(null);
  const beforeTargetBeepPlayedRef = useRef(false);
  const afterStartBeepPlayedRef = useRef(false);
  const beforeTargetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const afterStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLockScreenSecondRef = useRef<number>(-1);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const initialVolumeRef = useRef<number | null>(null);
  const addLapRef = useRef<(() => void) | undefined>(undefined);
  const volumeAlertShownRef = useRef(false);

  // Audio player for beeps (no-op on web). The beep is bundled locally so it
  // plays reliably even when the app is backgrounded. keepAudioSessionActive: true
  // ensures the audio session is not deactivated when playback completes.
  const beepPlayer = useAudioPlayerImport
    ? useAudioPlayerImport(require('../assets/audio/beep.wav'), {
        keepAudioSessionActive: true,
      })
    : { seekTo: () => {}, play: () => {} };

  // 1-hour silent track. While a timing session is running we keep this playing so
  // the audio session stays active continuously — this prevents iOS and Android from
  // suspending the JavaScript thread, so the lap-reminder beeps, haptics, and live
  // drop-down notification timer continue ticking while backgrounded/locked.
  const keepAlivePlayer = useAudioPlayerImport
    ? useAudioPlayerImport(require('../assets/audio/silence.m4a'), {
        keepAudioSessionActive: true,
        updateInterval: 1000,
      })
    : null;

  // Beeps can only fire when enabled and at least one reminder is on. We use this
  // to avoid keeping the app awake in the background when no beep could sound.
  const beepsActive =
    audioSettings.enabled &&
    (audioSettings.beforeTargetEnabled || audioSettings.afterLapStartEnabled);

  // Initialize VolumeButtonService and TimerNotificationService
  useEffect(() => {
    VolumeButtonService.initialize();
    TimerNotificationService.init();
  }, []);

  // Configure the audio session for background playback so lap-reminder beeps
  // keep sounding when the app is backgrounded, and stay audible even when the
  // ringer switch is set to silent (common during a race).
  useEffect(() => {
    if (!setAudioModeAsyncImport) return;
    setAudioModeAsyncImport({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'mixWithOthers',
    }).catch((error) => console.error('Error setting audio mode:', error));
  }, []);

  // Check if session setup is needed on mount
  useEffect(() => {
    const lapsCount = driver?.laps?.length ?? 0;
    const needsSetup = !team?.name && !team?.raceName && !team?.sessionNumber && lapsCount === 0;
    if (needsSetup) {
      openSessionSetup('new');
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

  // Keep app active in foreground sync when switching back from background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && startTimeRef.current && isRunning) {
        const now = Date.now();
        const elapsed = Math.floor((now - startTimeRef.current) / 10) / 100;
        setElapsedTime(elapsed);
      } else if ((nextAppState === 'background' || nextAppState === 'inactive') && startTimeRef.current && isRunning) {
        // Immediately push an updated notification banner when moving to background/lock screen
        const now = Date.now();
        const elapsed = Math.floor((now - startTimeRef.current) / 10) / 100;
        const liveDelta = driver ? elapsed - driver.targetTime : 0;
        const deltaSign = liveDelta >= 0 ? '+' : '';
        const targetStr = driver ? formatTime(driver.targetTime) : '—';
        const lapNum = (driver?.laps?.length || 0) + 1;
        const title = `${formatTime(elapsed)} (Target: ${targetStr})`;
        const body = driver
          ? `Gap: ${deltaSign}${liveDelta.toFixed(1)}s • Lap #${lapNum} • ${driver.name}`
          : `Lap #${lapNum}`;
        void TimerNotificationService.updateImmediate(title, body);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isRunning, driver]);

  useEffect(() => {
    if (isRunning) {
      // Keep screen awake when timer is running
      activateKeepAwakeAsync();

      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - (startTimeRef.current || now)) / 10) / 100;

        // When in active foreground, update state for smooth clock display
        if (AppState.currentState === 'active') {
          setElapsedTime(elapsed);
        }

        const afterLapSec = Number(audioSettings.afterLapStart) || 15;
        const beforeTargetSec = Number(audioSettings.beforeTargetTime) || 10;

        // After lap start beep fallback check
        if (
          audioSettings.afterLapStartEnabled &&
          elapsed >= afterLapSec &&
          !afterStartBeepPlayedRef.current
        ) {
          // Only play audio beep if within 2.5s window; if resuming long after, don't play stale beep
          if (elapsed < afterLapSec + 2.5) {
            playBeep(true);
          }
          afterStartBeepPlayedRef.current = true;
        }

        // Before target beep fallback check
        if (driver) {
          const timeUntilTarget = driver.targetTime - elapsed;
          if (
            audioSettings.beforeTargetEnabled &&
            timeUntilTarget <= beforeTargetSec &&
            timeUntilTarget > -5 &&
            !beforeTargetBeepPlayedRef.current
          ) {
            // Only play if approaching target in real-time, not if resuming long after
            if (timeUntilTarget >= beforeTargetSec - 3.0) {
              playBeep(false);
            }
            beforeTargetBeepPlayedRef.current = true;
          }

          if (timeUntilTarget <= 10 && timeUntilTarget > 0) {
            setShowWarning(true);
          } else {
            setShowWarning(false);
          }
        }

        // Update pull-down notification banner once every second
        const currentSec = Math.floor(elapsed);
        if (currentSec !== lastLockScreenSecondRef.current) {
          lastLockScreenSecondRef.current = currentSec;
          const liveDelta = driver ? elapsed - driver.targetTime : 0;
          const deltaSign = liveDelta >= 0 ? '+' : '';
          const targetStr = driver ? formatTime(driver.targetTime) : '—';
          const lapNum = (driver?.laps?.length || 0) + 1;
          const title = `${formatTime(elapsed)} (Target: ${targetStr})`;
          const body = driver
            ? `Gap: ${deltaSign}${liveDelta.toFixed(1)}s • Lap #${lapNum} • ${driver.name}`
            : `Lap #${lapNum}`;
          void TimerNotificationService.update(title, body);
        }
      }, 50);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setShowWarning(false);
      // Deactivate keep awake when timer stops
      deactivateKeepAwake();
      void TimerNotificationService.dismiss();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      deactivateKeepAwake();
      void TimerNotificationService.dismiss();
    };
  }, [isRunning, driver, audioSettings]);

  // Keep the silent track playing while a session is running so the background
  // audio session stays active. We use 'mixWithOthers' so music apps (Spotify/Apple Music)
  // are never interrupted, and we do NOT register lock screen media player controls.
  useEffect(() => {
    if (!keepAlivePlayer) return;
    if (isRunning) {
      if (setAudioModeAsyncImport) {
        setAudioModeAsyncImport({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'mixWithOthers',
        }).catch((err) => console.warn('Error setting audio mode:', err));
      }

      try {
        keepAlivePlayer.loop = true;
        keepAlivePlayer.volume = 0.05;
        if (typeof keepAlivePlayer.seekTo === 'function') {
          void keepAlivePlayer.seekTo(0).then(() => {
            keepAlivePlayer.play();
          }).catch(() => {
            keepAlivePlayer.play();
          });
        } else {
          keepAlivePlayer.play();
        }
      } catch (error) {
        console.warn('Error starting keep-alive audio:', error);
      }
    } else {
      try {
        keepAlivePlayer.pause();
      } catch {}
      void TimerNotificationService.dismiss();
    }
    return () => {
      try {
        keepAlivePlayer.pause();
      } catch {}
      void TimerNotificationService.dismiss();
    };
  }, [isRunning]);

  // Subscribe to native audio playback updates. Every second, native audio playback triggers
  // a status update event which executes even when the React Native Activity is paused/backgrounded.
  // This allows the notification timer and audio warning checks to continue firing in the background.
  useEffect(() => {
    if (!keepAlivePlayer || !isRunning) return;

    let sub: any = null;
    if (typeof keepAlivePlayer.addListener === 'function') {
      sub = keepAlivePlayer.addListener('playbackStatusUpdate', () => {
        if (!startTimeRef.current) return;
        const now = Date.now();
        const elapsed = Math.floor((now - startTimeRef.current) / 10) / 100;

        if (AppState.currentState !== 'active') {
          setElapsedTime(elapsed);
        }

        const currentSec = Math.floor(elapsed);
        if (currentSec !== lastLockScreenSecondRef.current) {
          lastLockScreenSecondRef.current = currentSec;
          const liveDelta = driver ? elapsed - driver.targetTime : 0;
          const deltaSign = liveDelta >= 0 ? '+' : '';
          const targetStr = driver ? formatTime(driver.targetTime) : '—';
          const lapNum = (driver?.laps?.length || 0) + 1;
          const title = `${formatTime(elapsed)} (Target: ${targetStr})`;
          const body = driver
            ? `Gap: ${deltaSign}${liveDelta.toFixed(1)}s • Lap #${lapNum} • ${driver.name}`
            : `Lap #${lapNum}`;
          void TimerNotificationService.update(title, body);
        }

        const afterLapSec = Number(audioSettings.afterLapStart) || 15;
        const beforeTargetSec = Number(audioSettings.beforeTargetTime) || 10;

        // After lap start beep check
        if (
          audioSettings.afterLapStartEnabled &&
          elapsed >= afterLapSec &&
          !afterStartBeepPlayedRef.current
        ) {
          if (elapsed < afterLapSec + 2.5) {
            playBeep(true);
          }
          afterStartBeepPlayedRef.current = true;
        }

        // Before target beep check
        if (driver) {
          const timeUntilTarget = driver.targetTime - elapsed;
          if (
            audioSettings.beforeTargetEnabled &&
            timeUntilTarget <= beforeTargetSec &&
            timeUntilTarget > -5 &&
            !beforeTargetBeepPlayedRef.current
          ) {
            if (timeUntilTarget >= beforeTargetSec - 3.0) {
              playBeep(false);
            }
            beforeTargetBeepPlayedRef.current = true;
          }
        }
      });
    }

    return () => {
      if (sub && typeof sub.remove === 'function') {
        sub.remove();
      }
    };
  }, [isRunning, keepAlivePlayer, driver, audioSettings]);

  // The volume listener reads the current driver through a ref, so it isn't torn
  // down and re-armed (async, racy) every time the roster data changes.
  const driverRef = useRef(driver);
  driverRef.current = driver;

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
      const driver = driverRef.current;
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
  }, [audioSettings.volumeButtonsEnabled]);

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
      // 1. Play audio beep reliably
      if (beepPlayer) {
        try {
          beepPlayer.volume = 1.0;
          if (typeof beepPlayer.seekTo === 'function') {
            void beepPlayer.seekTo(0).then(() => {
              beepPlayer.play();
            }).catch(() => {
              beepPlayer.play();
            });
          } else {
            beepPlayer.play();
          }
        } catch {
          try { beepPlayer.play(); } catch {}
        }
      }

      // 2. Physical vibration & haptics (both foreground and background)
      if (!isWeb) {
        const isBg = AppState.currentState !== 'active';

        // Full system motor vibration: works in foreground and background on iOS & Android
        if (isDouble) {
          Vibration.vibrate([0, 400, 150, 400]);
        } else {
          Vibration.vibrate([0, 450]);
        }

        // Taptic Engine (active in foreground on iOS)
        if (Platform.OS === 'ios') {
          if (isDouble) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setTimeout(() => {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }, 220);
          } else {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
        }

        // When in BACKGROUND, also immediately fire an alert notification with sound
        // so the OS lock-screen daemon chimes and triggers hardware vibration!
        if (isBg) {
          const alertTitle = isDouble ? '⚠️ 15s Lap Warning' : '⚠️ Target Warning';
          const alertBody = isDouble
            ? '15 seconds after lap start'
            : (driver ? `${driver.name} approaching target (${formatTime(driver.targetTime)})` : 'Approaching target time');
          void TimerNotificationService.sendImmediateAlert(alertTitle, alertBody);
        }
      }

      if (isDouble) {
        // Wait 220ms then play audio again for double beep
        setTimeout(() => {
          if (beepPlayer) {
            try {
              if (typeof beepPlayer.seekTo === 'function') {
                void beepPlayer.seekTo(0).then(() => {
                  beepPlayer.play();
                }).catch(() => {
                  beepPlayer.play();
                });
              } else {
                beepPlayer.play();
              }
            } catch {
              try { beepPlayer.play(); } catch {}
            }
          }
        }, 220);
      }
    } catch (error) {
      console.error('Error playing beep:', error);
    }
  };

  const WARNING_15S_ID = 'regularity-warning-15s';
  const WARNING_TARGET_ID = 'regularity-warning-target';

  const clearBeepTimeouts = () => {
    if (beforeTargetTimeoutRef.current) {
      clearTimeout(beforeTargetTimeoutRef.current);
      beforeTargetTimeoutRef.current = null;
    }
    if (afterStartTimeoutRef.current) {
      clearTimeout(afterStartTimeoutRef.current);
      afterStartTimeoutRef.current = null;
    }
    void TimerNotificationService.cancelWarnings([WARNING_15S_ID, WARNING_TARGET_ID]);
  };

  const scheduleBeeps = (startTime: number, targetTime?: number) => {
    clearBeepTimeouts();
    if (!audioSettings.enabled) return;

    const now = Date.now();
    const afterLapSec = Number(audioSettings.afterLapStart) || 15;
    const beforeTargetSec = Number(audioSettings.beforeTargetTime) || 10;

    // After lap start beep (double beep)
    if (audioSettings.afterLapStartEnabled) {
      const delay = (startTime + afterLapSec * 1000) - now;
      if (delay > 0) {
        afterStartTimeoutRef.current = setTimeout(() => {
          if (!afterStartBeepPlayedRef.current) {
            playBeep(true);
            afterStartBeepPlayedRef.current = true;
          }
        }, delay);

        // Schedule OS-level time-interval notification so warning NEVER fails when backgrounded or locked
        const delaySeconds = delay / 1000;
        void TimerNotificationService.scheduleWarning(
          WARNING_15S_ID,
          '⚠️ 15s Lap Warning',
          '15 seconds after lap start',
          delaySeconds
        );
      }
    }

    // Before target beep (single beep)
    if (audioSettings.beforeTargetEnabled && targetTime && targetTime > 0) {
      const targetBeepElapsed = targetTime - beforeTargetSec;
      if (targetBeepElapsed > 0) {
        const delay = (startTime + targetBeepElapsed * 1000) - now;
        if (delay > 0) {
          beforeTargetTimeoutRef.current = setTimeout(() => {
            if (!beforeTargetBeepPlayedRef.current) {
              playBeep(false);
              beforeTargetBeepPlayedRef.current = true;
            }
          }, delay);

          // Schedule OS-level time-interval notification for target approach
          const delaySeconds = delay / 1000;
          void TimerNotificationService.scheduleWarning(
            WARNING_TARGET_ID,
            '⚠️ Target Time Warning',
            driver ? `${driver.name} approaching target (${formatTime(targetTime)})` : 'Approaching target time',
            delaySeconds
          );
        }
      }
    }
  };

  const startStopwatch = (customStartTime?: number, verifyLive = !isRunning) => {
    const start = customStartTime ?? Date.now();
    startTimeRef.current = start;
    const initialElapsed = Math.max(0, Math.floor((Date.now() - start) / 10) / 100);
    setElapsedTime(initialElapsed);
    setIsRunning(true);
    beforeTargetBeepPlayedRef.current = false;
    afterStartBeepPlayedRef.current = false;
    lastLockScreenSecondRef.current = -1;
    scheduleBeeps(start, driver?.targetTime);
    // A fresh start (not a lap rollover) re-checks a reused live session is still live.
    void ensureLiveSession(verifyLive).then(() => reportTimerState(true, start));
  };

  // START from a stopped timer: settle the live session first (a stale one is
  // replaced) behind a brief spinner, so the stopwatch can't start and then get
  // reset by the session check. Timed from the press, so no time is lost; capped
  // so a slow connection never holds the clock back.
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const startFresh = async () => {
    if (startingRef.current) return;
    const pressedAt = Date.now();
    lastLapTimeRef.current = pressedAt;
    startingRef.current = true;
    setStarting(true);
    try {
      await Promise.race([ensureLiveSession(true), new Promise((r) => setTimeout(r, 1500))]);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
    startStopwatch(pressedAt, false);
  };

  const overrideRejectedLap = () => {
    if (!rejectedLap || !driver) return;
    if (rejectedLapTimerRef.current) {
      clearTimeout(rejectedLapTimerRef.current);
      rejectedLapTimerRef.current = null;
    }

    const lapTime = rejectedLap.time;
    const recordedAt = rejectedLap.recordedAt;
    setRejectedLap(null);

    const updatedTeams = [...teams];
    const currentDriver = updatedTeams[activeTeam].drivers[activeDriver];

    const isChangeover = !!(lastLapTimeRef.current && recordedAt - lastLapTimeRef.current > 180000);
    const delta = lapTime - currentDriver.targetTime;
    const lapType = calculateLapType(delta, isChangeover);

    currentDriver.laps.push({
      number: currentDriver.laps.length + 1,
      time: lapTime,
      delta,
      lapType,
      lapValue: calculateLapValue(lapType, lapTypeValues),
      timestamp: recordedAt,
    });

    setTeams(updatedTeams);
    lastLapTimeRef.current = recordedAt;
    if (!isWeb) Vibration.vibrate(500);

    // If timer was running, continue measuring the new lap seamlessly
    // from the moment the rejected lap was recorded!
    if (isRunning) {
      startTimeRef.current = recordedAt;
      const currentElapsed = Math.max(0, Math.floor((Date.now() - recordedAt) / 10) / 100);
      setElapsedTime(currentElapsed);
      beforeTargetBeepPlayedRef.current = false;
      afterStartBeepPlayedRef.current = false;
      lastLockScreenSecondRef.current = -1;
      scheduleBeeps(recordedAt, currentDriver.targetTime);
      reportTimerState(true, recordedAt);
    } else {
      startStopwatch();
    }
  };

  const addLap = () => {
    if (!driver) {
      // No driver selected (or none on the team yet) — prompt to pick/add one
      // instead of silently doing nothing when the user presses START.
      setDriverPickerVisible(true);
      return;
    }

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
      void startFresh();
    } else {
      const lapTime = elapsedTime;
      const changeover = pendingChangeover;
      // A changeover lap belongs to the outgoing driver even if a tab was tapped since.
      const lapDriver = changeover ? updatedTeams[activeTeam].drivers[changeover.from] ?? currentDriver : currentDriver;

      // Check lap recording guard (a changeover in-lap is meant to be slow — skip it)
      if (audioSettings.lapGuardEnabled && !changeover) {
        const minTime = currentDriver.targetTime - audioSettings.lapGuardRange;
        const maxTime = currentDriver.targetTime + audioSettings.lapGuardRange;
        const safetyCarThreshold = currentDriver.targetTime + audioSettings.lapGuardSafetyCarThreshold;

        // Allow if within normal range OR if it's a safety car lap (significantly over)
        const isInNormalRange = lapTime >= minTime && lapTime <= maxTime;
        const isSafetyCar = lapTime >= safetyCarThreshold;

        if (!isInNormalRange && !isSafetyCar) {
          // Outside allowed range and not a safety car - reject
          if (!isWeb) Vibration.vibrate([0, 100, 100, 100]);
          if (rejectedLapTimerRef.current) clearTimeout(rejectedLapTimerRef.current);
          setRejectedLap({
            time: lapTime,
            recordedAt: Date.now(),
            minTime,
            maxTime,
            safetyCarThreshold,
          });
          rejectedLapTimerRef.current = setTimeout(() => {
            setRejectedLap(null);
          }, 8000);
          return;
        }
      }

      if (rejectedLapTimerRef.current) clearTimeout(rejectedLapTimerRef.current);
      setRejectedLap(null);

      const isChangeover = !!changeover || !!(lastLapTimeRef.current && Date.now() - lastLapTimeRef.current > 180000);
      const delta = lapTime - lapDriver.targetTime;
      const lapType = calculateLapType(delta, isChangeover);

      lapDriver.laps.push({
        number: lapDriver.laps.length + 1,
        time: lapTime,
        delta,
        lapType,
        lapValue: calculateLapValue(lapType, lapTypeValues),
        timestamp: Date.now(),
      });

      setTeams(updatedTeams);
      lastLapTimeRef.current = Date.now();
      if (!isWeb) Vibration.vibrate(500);
      if (changeover) {
        // Hand over: the incoming driver starts from the line, not when the
        // outgoing driver finishes — stop and wait for START as they cross it.
        setActiveDriver(changeover.next);
        resetTimer();
      } else {
        startStopwatch();
      }
    }
  };

  // Change Driver: arm a changeover for the lap in progress. With one other
  // driver there's nothing to choose; otherwise ask who's next.
  const handleChangeDriverPress = () => {
    if (pendingChangeover) {
      setPendingChangeover(null);
      return;
    }
    const others = (team?.drivers ?? []).map((_, i) => i).filter((i) => i !== activeDriver);
    if (others.length === 1) {
      setPendingChangeover({ from: activeDriver, next: others[0] });
    } else if (others.length > 1) {
      setChangeDriverPickerVisible(true);
    }
  };

  // Keep addLap ref updated
  useEffect(() => {
    addLapRef.current = addLap;
  });

  const handleStopPress = () => {
    if (!isRunning) return;
    showAlert({
      title: 'Stop Timer',
      message: 'Are you sure you want to stop the timer?',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: () => {
            setIsRunning(false);
            clearBeepTimeouts();
            setPendingChangeover(null);
            reportTimerState(false, startTimeRef.current, Date.now());
          },
        },
      ],
    });
  };

  const handleResetPress = () => {
    if (elapsedTime === 0 && !isRunning) return;
    showAlert({
      title: 'Reset Timer',
      message: isRunning
        ? 'The timer is currently running. Are you sure you want to stop and reset it to 0.00?'
        : 'Are you sure you want to reset the elapsed time to 0.00?',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetTimer();
          },
        },
      ],
    });
  };

  const resetTimer = () => {
    setIsRunning(false);
    setElapsedTime(0);
    setPendingChangeover(null);
    reportTimerState(false, null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    clearBeepTimeouts();
    beforeTargetBeepPlayedRef.current = false;
    afterStartBeepPlayedRef.current = false;
    lastLockScreenSecondRef.current = -1;
    if (keepAlivePlayer) {
      try {
        keepAlivePlayer.pause();
      } catch (e) {}
    }
  };

  // Ending the live session on this device (from here or the live view) stops
  // and zeroes the stopwatch. Only user-initiated ends count — background
  // clean-ups at launch/refresh used to reset a run the moment it started.
  const seenLiveEndRef = useRef(liveEndedByUser);
  useEffect(() => {
    if (liveEndedByUser === seenLiveEndRef.current) return;
    seenLiveEndRef.current = liveEndedByUser;
    resetTimer();
  }, [liveEndedByUser]);

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
    const laps = driver?.laps ?? [];
    const actualIndex = laps.length - 1 - lapIndex;
    if (!laps[actualIndex]) return;
    showAlert({
      title: 'Delete Lap',
      message: `Delete lap #${laps[actualIndex].number}?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updatedTeams = [...teams];
            const targetTeam = updatedTeams[activeTeam] ?? updatedTeams[0];
            const targetDriver = targetTeam?.drivers?.[activeDriver] ?? targetTeam?.drivers?.[0];
            if (!targetDriver?.laps?.[actualIndex]) return;
            syncLapDelete(activeDriver, targetDriver.laps[actualIndex]);
            targetDriver.laps.splice(actualIndex, 1);
            // Renumber remaining laps
            targetDriver.laps.forEach((lap, idx) => {
              lap.number = idx + 1;
            });
            setTeams(updatedTeams);
          },
        },
      ],
    });
  };

  const openEditModal = (lapIndex: number) => {
    const laps = driver?.laps ?? [];
    const actualIndex = laps.length - 1 - lapIndex;
    if (!laps[actualIndex]) return;
    setSelectedLapIndex(actualIndex);
    setEditLapValue(laps[actualIndex].time.toString());
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

    const parsed = parseTimeInput(editLapValue);
    const newTime = parsed ?? parseFloat(editLapValue);
    if (isNaN(newTime) || newTime <= 0) {
      showAlert({ title: 'Invalid Time', message: 'Please enter a valid lap time (e.g. 85.5 or 1:25.5)' });
      return;
    }

    const updatedTeams = [...teams];
    const lap = updatedTeams[activeTeam].drivers[activeDriver].laps[selectedLapIndex];
    lap.time = newTime;
    lap.delta = newTime - driver.targetTime;
    lap.lapType = calculateLapType(lap.delta, lap.lapType === 'changeover', lap.lapType === 'safety');
    lap.lapValue = calculateLapValue(lap.lapType, lapTypeValues);
    syncLapEdit(activeDriver, lap);

    setTeams(updatedTeams);
    setEditModalVisible(false);
    setSelectedLapIndex(null);
    setEditLapValue('');
  };

  const toggleLapType = (lapIndex: number, newType: 'changeover' | 'safety') => {
    const laps = driver?.laps ?? [];
    const actualIndex = laps.length - 1 - lapIndex;
    const updatedTeams = [...teams];
    const targetTeam = updatedTeams[activeTeam] ?? updatedTeams[0];
    const targetDriver = targetTeam?.drivers?.[activeDriver] ?? targetTeam?.drivers?.[0];
    if (!targetDriver?.laps?.[actualIndex]) return;
    const lap = targetDriver.laps[actualIndex];

    if (lap.lapType === newType) {
      // Remove the special type, recalculate based on delta
      lap.lapType = calculateLapType(lap.delta, false, false);
    } else {
      // Set to the new type
      lap.lapType = newType;
    }

    lap.lapValue = calculateLapValue(lap.lapType, lapTypeValues);
    syncLapEdit(activeDriver, lap);
    setTeams(updatedTeams);
  };

  const showLapOptions = (lapIndex: number) => {
    const laps = driver?.laps ?? [];
    const actualIndex = laps.length - 1 - lapIndex;
    const lap = laps[actualIndex];
    if (!lap) return;

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

            // Prompt for the next session, bumping a purely numeric session number.
            const rawSessionNumber = (currentTeam.sessionNumber || '').trim();
            const parsedSessionNumber = parseInt(rawSessionNumber, 10);
            const nextSessionNumber =
              !isNaN(parsedSessionNumber) && String(parsedSessionNumber) === rawSessionNumber
                ? String(parsedSessionNumber + 1)
                : rawSessionNumber;
            openSessionSetup('next', { sessionNumber: nextSessionNumber });
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

  const pendingNextName = pendingChangeover
    ? team?.drivers?.[pendingChangeover.next]?.name?.trim() || `Driver ${pendingChangeover.next + 1}`
    : null;

  const getStatusColor = () => {
    if (pendingChangeover) return theme.changeover;
    if (!driver?.laps || driver.laps.length === 0) return theme.textSecondary;
    const lastLap = driver.laps[driver.laps.length - 1];
    if (!lastLap) return theme.textSecondary;
    if (lastLap.lapType === 'bonus') return theme.bonus;
    if (lastLap.lapType === 'base') return theme.base;
    if (lastLap.lapType === 'broken') return theme.broken;
    if (lastLap.lapType === 'changeover') return theme.changeover;
    return theme.textSecondary;
  };

  const getStatusText = () => {
    if (pendingNextName) return `CHANGEOVER LAP \u2192 ${pendingNextName.toUpperCase()}`;
    if (!driver?.laps || driver.laps.length === 0) return 'WAITING';
    const lastLap = driver.laps[driver.laps.length - 1];
    if (!lastLap) return 'WAITING';
    const deltaStr = (lastLap.delta != null ? lastLap.delta : 0).toFixed(3);
    if (lastLap.lapType === 'bonus') return `BONUS LAP! +${deltaStr}s`;
    if (lastLap.lapType === 'base') return `BASE LAP +${deltaStr}s`;
    if (lastLap.lapType === 'broken') return `BROKEN! ${deltaStr}s`;
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

  const handleEndLiveSession = () => {
    showAlert({
      title: 'End Live Session',
      message: 'This ends the live session currently running for your team and disables its public share link. Continue?',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Live Session',
          style: 'destructive',
          onPress: async () => {
            try {
              await endActiveLiveSession();
              resetTimer();
              await refreshTeamLive();
            } catch {
              showAlert({ title: 'Could not end session', message: 'Check your connection and try again.' });
            }
          },
        },
      ],
    });
  };

  const lapCount = driver?.laps.length ?? 0;
  const lastLap = lapCount > 0 ? driver!.laps[lapCount - 1] : null;
  const liveDelta = driver ? elapsedTime - driver.targetTime : 0;

  // How long this driver has been out: the current stint restarts at each
  // changeover. The lap in progress is theirs while the timer runs (switching
  // tabs mid-lap is blocked).
  const driverIndex = driver && team ? team.drivers.indexOf(driver) : -1;
  const recordedDrive = driverIndex >= 0 ? driveTime(team.drivers, driverIndex) : null;
  const runningLap = isRunning ? elapsedTime : 0;
  const drive = recordedDrive
    ? { stint: recordedDrive.stint + runningLap, total: recordedDrive.total + runningLap }
    : null;

  // The server reports a live session for the team. Offer to view it when it
  // isn't this device's own active stream, and show the "End Live Session" kill
  // switch whenever there's no working local way to end it — i.e. this device
  // isn't recording it (orphan/peer) OR has no laps, so the Lap History
  // End/Clear buttons (which need lapCount > 0) aren't available.
  const teamHasLive = !!teamLivePublicToken;
  const liveIsOwnStream = teamHasLive && teamLivePublicToken === liveSession?.publicToken;
  const showViewLive = teamHasLive && !liveIsOwnStream;
  const showKillSwitch = teamHasLive && (!liveSession || lapCount === 0);
  const statusColor = getStatusColor();

  // Manual entry read-back: seconds ("105.3") or M:SS ("1:45.3").
  const manualTime = lapInput.trim() ? parseTimeInput(lapInput) : null;
  const manualPreview = manualTime !== null && manualTime > 0
    ? { time: manualTime, delta: driver ? manualTime - driver.targetTime : null }
    : null;

  // Session actions (the header's ••• menu): edit details, live link, end / clear.
  const openSessionMenu = () => {
    const hasLaps = !!team?.drivers?.some((d) => d.laps.length > 0);
    showAlert({
      title: team?.raceName || team?.name || 'Session',
      message: team?.sessionNumber ? `Session ${team.sessionNumber}` : undefined,
      buttons: [
        { text: 'Edit Session', onPress: () => openSessionSetup('edit') },
        ...(liveSession && liveShareUrl
          ? [
              { text: 'Open Live View', onPress: () => router.push(`/live/${liveSession.publicToken}` as any) },
              {
                text: 'Share Live Link',
                onPress: async () => {
                  if (await shareLiveLink(liveShareUrl)) showAlert({ title: 'Link copied', message: liveShareUrl });
                },
              },
            ]
          : []),
        ...(hasLaps
          ? [
              { text: 'End Session', onPress: endSession },
              { text: 'Clear Session', style: 'destructive' as const, onPress: clearSession },
            ]
          : []),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    });
  };

  // Layout pieces shared by the phone (single column) and wide-web layouts.
  const notices = (
    <>
      {/* A live session is running for the team that this device isn't recording
          (a teammate, or an orphaned session this device lost track of). Offer
          to view it, and a kill switch to end it without needing the DB. */}
      {showViewLive || showKillSwitch ? (
        <View style={styles.peerLiveWrap}>
          {showViewLive ? (
            <Pressable
              onPress={() => router.push(`/live/${teamLivePublicToken}` as any)}
              style={[styles.peerLive, { borderColor: theme.livePulse, backgroundColor: theme.surfaceElevated }]}
            >
              <LiveDot size={8} color={theme.livePulse} />
              <Text style={[styles.peerLiveText, { color: theme.text }]}>A live session is running for your team</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textSecondary as string} />
            </Pressable>
          ) : null}
          {showKillSwitch ? (
            <Button
              title="End Live Session"
              icon="stop-circle-outline"
              size="sm"
              variant="secondary"
              fullWidth
              onPress={handleEndLiveSession}
              textStyle={{ color: theme.danger }}
            />
          ) : null}
        </View>
      ) : null}
    </>
  );
  const header = (
    <>
      {/* Header — opens the session actions menu */}
      <Pressable
        style={[styles.header, wide && styles.flushBottom]}
        onPress={openSessionMenu}
        accessibilityRole="button"
        accessibilityLabel="Session actions"
      >
        <View style={{ flex: 1 }}>
          <Label muted>{team?.raceName || 'Tap to set race name'}</Label>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
              {team?.name || 'New Session'}
            </Text>
            {team?.sessionNumber ? <Chip label={`S${team.sessionNumber}`} color={theme.accent} active size="sm" /> : null}
          </View>
        </View>
        <Ionicons name="ellipsis-horizontal-circle" size={26} color={theme.primary as string} />
      </Pressable>
    </>
  );
  const rejectedBanner = (
    <>
      {/* Rejected lap message with Override option */}
      {rejectedLap && (
        <Surface
          level="base"
          style={[
            styles.rejected,
            {
              borderColor: theme.danger,
              backgroundColor: theme.surfaceElevated,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
            },
          ]}
        >
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: spacing.sm }}>
            <Ionicons name="warning-outline" size={22} color={theme.danger as string} style={{ marginRight: spacing.sm }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rejectedText, { color: theme.text, fontWeight: fontWeights.bold }]}>
                Lap rejected: {rejectedLap.time.toFixed(2)}s
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>
                Expected {rejectedLap.minTime.toFixed(1)}–{rejectedLap.maxTime.toFixed(1)}s (Safety car: {rejectedLap.safetyCarThreshold.toFixed(1)}s+)
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Button
              title="Override"
              icon="flash-outline"
              size="sm"
              onPress={overrideRejectedLap}
              style={{
                backgroundColor: theme.warning,
                paddingHorizontal: spacing.md,
                height: 34,
                borderRadius: radius.full,
              }}
              textStyle={{
                color: '#000',
                fontWeight: fontWeights.bold,
                fontSize: 12,
                letterSpacing: 0.2,
              }}
            />
            <IconButton
              icon="close"
              size={18}
              variant="ghost"
              onPress={() => {
                if (rejectedLapTimerRef.current) clearTimeout(rejectedLapTimerRef.current);
                setRejectedLap(null);
              }}
              accessibilityLabel="Dismiss rejection message"
            />
          </View>
        </Surface>
      )}
    </>
  );
  const driverTabs = (
    <>
      {/* Driver tabs */}
      {team?.drivers?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.driverTabs, wide && styles.flushBottom]} contentContainerStyle={styles.driverTabsContent}>
          {(team?.drivers ?? []).map((d, index) => {
            const active = activeDriver === index;
            return (
              <Pressable
                key={d.id}
                onPress={() => {
                  // The running lap belongs to the driver being timed — switching
                  // mid-lap would record it (and judge it) against someone else.
                  if (isRunning && index !== activeDriver) {
                    showAlert({
                      title: 'Timer running',
                      message: `${driver?.name?.trim() || 'This driver'} is being timed. Use Change Driver to hand over, or stop the timer to switch drivers.`,
                    });
                    return;
                  }
                  setActiveDriver(index);
                }}
                style={[
                  styles.driverTab,
                  { backgroundColor: active ? theme.primaryMuted : theme.surfaceElevated, borderColor: active ? theme.primary : theme.border },
                  isRunning && !active && { opacity: 0.45 },
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
    </>
  );
  const clockCard = (
    <>
      {/* Hero clock */}
      <Card
        padding="xl"
        style={[styles.clockCard, isRunning && { borderColor: theme.accent }, isRunning && glowShadow(String(theme.accent), 0.4, 18)]}
      >
        <View style={styles.clockTopRow}>
          {/* Whose lap this is */}
          <View style={styles.clockDriverWrap}>
            <Label muted>{isRunning ? 'TIMING' : 'DRIVER'}</Label>
            <Text style={[styles.clockDriver, { color: theme.text }]} numberOfLines={1}>
              {driver?.name?.trim() || 'No driver selected'}
            </Text>
          </View>
          {isRunning && (
            <View style={styles.recRow}>
              <LiveDot size={8} color={theme.danger} />
              <Label color={theme.danger}>REC</Label>
            </View>
          )}
        </View>
        <Animated.Text
          style={[
            styles.clock,
            wide && { fontSize: wideClockSize, lineHeight: Math.round(wideClockSize * 1.1), letterSpacing: -wideClockSize / 28, marginVertical: spacing.xl },
            { color: theme.text, transform: [{ scale: pulseAnim }] },
          ]}
        >
          {elapsedTime.toFixed(2)}
        </Animated.Text>
        {/* Last recorded lap, so it's readable without scrolling to the history
            (wide web already shows it in the summary row beside the history) */}
        {lastLap && !wide ? (
          <View style={styles.lastLapRow}>
            <Label muted>LAST</Label>
            <Mono size={typography.title} weight="bold" color={theme.text}>{formatTime(lastLap.time)}</Mono>
            <Mono size={typography.body} weight="bold" color={deltaColor(lastLap.delta)}>
              {lastLap.delta >= 0 ? '+' : ''}{lastLap.delta.toFixed(2)}
            </Mono>
          </View>
        ) : null}
        <View style={styles.clockMeta}>
          <Label muted size={wide ? typography.body : undefined}>TARGET {driver ? formatTime(driver.targetTime) : '—'}</Label>
          {driver && (isRunning || lapCount > 0) ? (
            <Mono size={wide ? 40 : typography.title} weight="bold" color={deltaColor(liveDelta)}>
              {liveDelta >= 0 ? '+' : ''}{liveDelta.toFixed(2)}
            </Mono>
          ) : null}
        </View>
        {drive && drive.total > 0 ? (
          <View style={[styles.driveRow, { borderTopColor: theme.borderFaint }]}>
            <View style={styles.driveCell}>
              <Label muted>STINT</Label>
              <Mono size={typography.bodyLg} weight="bold" color={theme.text}>{formatDuration(drive.stint)}</Mono>
            </View>
            <View style={[styles.driveCell, styles.driveCellEnd]}>
              <Label muted>SESSION TOTAL</Label>
              <Mono size={typography.bodyLg} weight="bold" color={theme.textSecondary}>{formatDuration(drive.total)}</Mono>
            </View>
          </View>
        ) : null}
        <View style={[styles.statusStrip, { borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>{getStatusText()}</Text>
        </View>
      </Card>
    </>
  );
  const controls = (
    <>
      {/* Primary action */}
      <Button
        title={isRunning ? 'LAP' : 'START'}
        icon={isRunning ? 'flag' : 'play'}
        onPress={addLap}
        loading={starting}
        size="lg"
        style={[styles.primaryBtn, wide && styles.primaryBtnWide, { backgroundColor: isRunning ? theme.broken : theme.bonus }, glowShadow(isRunning ? String(theme.broken) : String(theme.bonus), 0.4, 16)]}
        textStyle={[styles.primaryBtnText, wide && styles.primaryBtnTextWide]}
      />

      {/* Driver change: flag this lap as the outgoing driver's changeover */}
      {isRunning && (team?.drivers?.length ?? 0) > 1 ? (
        pendingChangeover ? (
          <View style={[styles.changeoverStrip, { borderColor: theme.changeover, backgroundColor: theme.surfaceElevated }]}>
            <Ionicons name="swap-horizontal" size={20} color={theme.changeover as string} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.changeoverTitle, { color: theme.changeover }]}>Changeover lap</Text>
              <Text style={[styles.changeoverSub, { color: theme.textSecondary }]} numberOfLines={2}>
                Press LAP when {team?.drivers?.[pendingChangeover.from]?.name?.trim() || 'the driver'} finishes, then START when {pendingNextName} crosses the line.
              </Text>
            </View>
            <Button title="Cancel" size="sm" variant="secondary" onPress={() => setPendingChangeover(null)} />
          </View>
        ) : (
          <Button
            title="Change Driver"
            icon="swap-horizontal"
            variant="secondary"
            fullWidth
            onPress={handleChangeDriverPress}
            style={[styles.changeDriverBtn, { borderColor: theme.changeover }]}
            textStyle={{ color: theme.changeover }}
          />
        )
      ) : null}

      {/* Secondary controls (one row with manual entry on wide web) */}
      <View style={wide ? styles.wideControlRow : undefined}>
      <View style={[styles.secondaryRow, wide && styles.wideControlCell]}>
        <Button
          title="Stop"
          icon="stop"
          variant="secondary"
          onPress={handleStopPress}
          disabled={!isRunning}
          style={[{ flex: 1 }, !isRunning && { opacity: 0.5 }]}
        />
        <Button
          title="Reset"
          icon="refresh"
          variant="secondary"
          onPress={handleResetPress}
          disabled={elapsedTime === 0 && !isRunning}
          style={[{ flex: 1 }, elapsedTime === 0 && !isRunning && { opacity: 0.5 }]}
        />
      </View>

      {/* Manual entry */}
      <View style={[styles.manualRow, wide && styles.wideControlCell]}>
        <View style={{ flex: 1 }}>
          <TextField
            mono
            placeholder="Manual Lap, In Seconds"
            value={lapInput}
            onChangeText={setLapInput}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={addLap}
          />
          {/* Read the entry back as a lap time + gap so typos are obvious before adding */}
          {manualPreview ? (
            <Text style={[styles.manualPreview, { color: theme.textSecondary }]}>
              {'= '}{formatTime(manualPreview.time)}
              {manualPreview.delta !== null ? (
                <Text style={{ color: deltaColor(manualPreview.delta) }}>
                  {`  ${manualPreview.delta >= 0 ? '+' : '\u2212'}${Math.abs(manualPreview.delta).toFixed(2)}s vs target`}
                </Text>
              ) : null}
            </Text>
          ) : null}
        </View>
        <IconButton icon="add" variant="primary" size={24} onPress={addLap} accessibilityLabel="Add manual lap" />
      </View>
      </View>
    </>
  );
  const historyHeader = (
    <>
      {/* Lap history */}
      <View style={styles.historyHeader}>
        <Label size={13}>Lap History</Label>
      </View>
    </>
  );
  // Wide web: at-a-glance numbers for the selected driver above the lap history.
  const driverLaps = driver?.laps ?? [];
  const avgDelta = driverLaps.length ? calculateDriverStats(driver!, lapTypeValues, team.drivers, team.sessionDuration).averageDelta : null;
  const bonusCount = driverLaps.filter((l) => l.lapType === 'bonus').length;
  const driverSummary = (
    <Surface level="base" padding="md" style={styles.summaryRow}>
      <StatTile size="sm" label="Laps" value={String(lapCount)} style={styles.summaryCell} />
      <StatTile size="sm" label="Last" value={lastLap ? formatTime(lastLap.time) : '—'} style={styles.summaryCell} />
      <StatTile
        size="sm"
        label="Avg Δ"
        value={avgDelta === null ? '—' : `${avgDelta >= 0 ? '+' : '\u2212'}${Math.abs(avgDelta).toFixed(2)}`}
        valueColor={avgDelta === null ? undefined : deltaColor(avgDelta)}
        style={styles.summaryCell}
      />
      <StatTile size="sm" label="Bonus" value={String(bonusCount)} valueColor={theme.bonus} style={styles.summaryCell} />
    </Surface>
  );
  const lapList = (
    <>
      {lapCount === 0 ? (
        <Surface level="base" padding="xl" style={styles.emptyCard}>
          <Ionicons name="time-outline" size={28} color={theme.textMuted as string} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No laps recorded yet</Text>
        </Surface>
      ) : (
        <Surface level="base" padding={0} style={styles.lapList}>
          {(driver?.laps ?? []).slice().reverse().map((lap, index, arr) => {
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
                  <Mono size={13} weight="bold" color={theme.textMuted} numberOfLines={1} style={styles.lapNum}>{lap.number}</Mono>
                  <Mono size={16} weight="medium" color={theme.text} numberOfLines={1} style={styles.lapTime}>{formatTime(lap.time)}</Mono>
                  <View style={styles.lapDeltaWrap}>
                    <Mono size={14} weight="bold" color={deltaColor(lap.delta)} numberOfLines={1} style={styles.lapDelta}>
                      {`${lap.delta >= 0 ? '+' : '\u2212'}${Math.abs(lap.delta).toFixed(2)}`}
                    </Mono>
                  </View>
                  <Chip label={lap.lapType} color={lapTypeColor(lap.lapType)} active size="sm" uppercase style={styles.lapChip} />
                </Pressable>
              </Swipeable>
            );
          })}
        </Surface>
      )}
    </>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <LiveShareBanner />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {wide ? (
          <View style={styles.wideRoot}>
            {notices}
            <View style={styles.wideTopBar}>
              <View style={styles.wideTopHeader}>{header}</View>
              <View style={styles.wideTopTabs}>{driverTabs}</View>
            </View>
            {rejectedBanner}
            <View style={styles.wideColumns}>
              <ScrollView style={styles.wideLeft} contentContainerStyle={styles.wideLeftContent} keyboardShouldPersistTaps="handled">
                {clockCard}
                {controls}
              </ScrollView>
              <View style={styles.wideRight}>
                {driverSummary}
                {historyHeader}
                <ScrollView style={styles.wideLapScroll} keyboardShouldPersistTaps="handled">
                  {lapList}
                </ScrollView>
              </View>
            </View>
          </View>
        ) : (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {notices}
            {header}
            {rejectedBanner}
            {driverTabs}
            {clockCard}
            {controls}
            {historyHeader}
            {lapList}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Edit Lap Sheet */}
      <Sheet
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        title="Edit Lap Time"
        footer={
          <View style={styles.sheetBtns}>
            <Button title="Cancel" variant="secondary" onPress={() => setEditModalVisible(false)} style={{ flex: 1 }} />
            <Button title="Save" onPress={saveEditedLap} style={{ flex: 1 }} />
          </View>
        }
      >
        <TextField
          mono
          label="Lap time (seconds or M:SS.mmm)"
          value={editLapValue}
          onChangeText={setEditLapValue}
          keyboardType="decimal-pad"
          placeholder="e.g. 85.500 or 1:25.500"
          returnKeyType="done"
          onSubmitEditing={saveEditedLap}
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

      {/* Session Setup Sheet — new session, edit current, or next after ending */}
      <Sheet
        visible={showSessionSetup}
        onClose={dismissSessionSetup}
        title={SESSION_SETUP_COPY[sessionSetupMode].title}
        footer={
          <>
            <Button title={SESSION_SETUP_COPY[sessionSetupMode].primaryLabel} icon="checkmark-circle" onPress={handleStartSession} fullWidth size="lg" />
            <Button title={SESSION_SETUP_COPY[sessionSetupMode].secondaryLabel} variant="ghost" onPress={dismissSessionSetup} fullWidth />
            {sessionSetupMode !== 'new' ? (
              <Button
                title="Clear details for a different race"
                icon="trash-outline"
                variant="ghost"
                onPress={clearSessionDetails}
                fullWidth
                textStyle={{ color: theme.textSecondary }}
              />
            ) : null}
          </>
        }
      >
        <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>{SESSION_SETUP_COPY[sessionSetupMode].subtitle}</Text>
        <View style={styles.sheetFields}>
          <TextField label="Team Name" value={setupTeamName} onChangeText={setSetupTeamName} placeholder="Enter team name" />
          <TextField label="Race Name" value={setupRaceName} onChangeText={setSetupRaceName} placeholder="Enter race name" />
          <TextField label="Session Number" value={setupSessionNumber} onChangeText={setSetupSessionNumber} placeholder="e.g., 1, 2, Practice" />
          <TextField mono label="Session Duration (minutes)" value={setupSessionDuration} onChangeText={setSetupSessionDuration} keyboardType="number-pad" placeholder="120" />
        </View>
      </Sheet>

      {/* Change Driver — who takes over after this changeover lap */}
      <Sheet
        visible={changeDriverPickerVisible}
        onClose={() => setChangeDriverPickerVisible(false)}
        title="Change Driver"
      >
        <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
          This lap will be recorded as {driver?.name?.trim() || 'the current driver'}'s changeover. Who's driving next?
        </Text>
        <View style={styles.sheetFields}>
          {(team?.drivers ?? []).map((d, index) =>
            index === activeDriver ? null : (
              <Button
                key={d.id}
                title={d.name?.trim() || `Driver ${index + 1}`}
                icon="person-outline"
                variant="secondary"
                fullWidth
                onPress={() => {
                  setPendingChangeover({ from: activeDriver, next: index });
                  setChangeDriverPickerVisible(false);
                }}
              />
            ),
          )}
        </View>
      </Sheet>

      {/* Select-driver prompt — shown when START is pressed with no driver selected */}
      <Sheet
        visible={driverPickerVisible}
        onClose={() => setDriverPickerVisible(false)}
        title="Select a Driver"
      >
        {team?.drivers?.length ? (
          <>
            <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
              Choose a driver to time, then press START.
            </Text>
            <View style={styles.sheetFields}>
              {(team?.drivers ?? []).map((d, index) => (
                <Button
                  key={d.id}
                  title={d.name?.trim() || `Driver ${index + 1}`}
                  icon="person-outline"
                  variant="secondary"
                  fullWidth
                  onPress={() => {
                    setActiveDriver(index);
                    setDriverPickerVisible(false);
                  }}
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
              This team has no drivers yet. Add a driver before starting the timer.
            </Text>
            <Button
              title="Add a Driver"
              icon="person-add-outline"
              fullWidth
              size="lg"
              onPress={() => {
                setDriverPickerVisible(false);
                router.push('/(app)/(tabs)/drivers' as any);
              }}
            />
          </>
        )}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 110, maxWidth: 760, width: '100%', alignSelf: 'center' },

  peerLiveWrap: { gap: spacing.sm, marginBottom: spacing.lg },
  peerLive: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1 },
  peerLiveText: { flex: 1, fontSize: typography.body, fontWeight: fontWeights.semibold },
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
  clockDriverWrap: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexShrink: 1 },
  clockDriver: { fontSize: typography.title, fontWeight: fontWeights.heavy, flexShrink: 1 },
  clock: { fontSize: typography.hero, fontFamily: 'JetBrainsMono-ExtraBold', letterSpacing: -2, textAlign: 'center', marginVertical: spacing.sm },
  lastLapRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: spacing.sm, marginBottom: spacing.md },
  clockMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  driveRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  driveCell: { gap: 2 },
  driveCellEnd: { alignItems: 'flex-end' },
  statusStrip: { marginTop: spacing.lg, borderWidth: 1, borderRadius: radius.full, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
  statusText: { fontSize: typography.body, fontWeight: fontWeights.bold, letterSpacing: 0.5 },

  primaryBtn: { height: 64, borderRadius: radius.lg, marginBottom: spacing.md },
  primaryBtnText: { fontSize: 22, fontWeight: fontWeights.heavy, letterSpacing: 1 },

  secondaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  changeDriverBtn: { marginBottom: spacing.md, borderWidth: 1 },
  changeoverStrip: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  changeoverTitle: { fontSize: typography.body, fontWeight: fontWeights.heavy, letterSpacing: 0.3, textTransform: 'uppercase' },
  changeoverSub: { fontSize: typography.caption, marginTop: 2 },
  manualRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', marginBottom: spacing.xl },
  manualPreview: { fontSize: typography.caption, fontFamily: 'JetBrainsMono-Medium', marginTop: 4, marginLeft: 2 },

  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },

  emptyCard: { alignItems: 'center', gap: spacing.sm },
  emptyText: { fontSize: typography.body },

  lapList: { overflow: 'hidden' },
  lapRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  lapNum: { width: 28, marginRight: spacing.xs },
  lapTime: { flex: 1, marginRight: spacing.xs },
  lapDeltaWrap: { minWidth: 80, alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 },
  lapDelta: { textAlign: 'right' },
  lapChip: { marginLeft: spacing.sm, minWidth: 78, alignItems: 'center' },

  deleteAction: { backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center', width: 88, height: '100%' },
  deleteActionText: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 2, letterSpacing: 0.8 },

  sheetBtns: { flexDirection: 'row', gap: spacing.md },

  // Wide web (two columns)
  flushBottom: { marginBottom: 0 },
  wideRoot: { flex: 1, width: '100%', maxWidth: WIDE_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  wideTopBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, marginBottom: spacing.lg },
  wideTopHeader: { flexShrink: 0, maxWidth: '45%' },
  wideTopTabs: { flex: 1, minWidth: 0 },
  wideColumns: { flex: 1, flexDirection: 'row', gap: spacing.xl, minHeight: 0 },
  wideLeft: { flex: 1 },
  wideLeftContent: { paddingBottom: spacing.xl },
  wideRight: { width: '40%', minWidth: 360, maxWidth: 520, minHeight: 0, paddingBottom: spacing.lg },
  wideLapScroll: { flex: 1 },
  primaryBtnWide: { height: 96, borderRadius: radius.xl },
  primaryBtnTextWide: { fontSize: 32, letterSpacing: 2 },
  wideControlRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  wideControlCell: { flex: 1, marginBottom: 0 },
  summaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  summaryCell: { flex: 1 },
  sheetSubtitle: { fontSize: typography.body, marginBottom: spacing.lg },
  sheetFields: { gap: spacing.md },
});
