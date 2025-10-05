import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { LapType } from '../types';

const VOLUME_BUTTON_TASK = 'VOLUME_BUTTON_LAP_RECORDING';

export interface LapDetails {
  time: number;
  lapType: LapType;
  delta: number;
  lapNumber: number;
}

type LapRecordCallback = () => LapDetails | null;

class VolumeButtonServiceClass {
  private listeners: LapRecordCallback[] = [];
  private volumeListener: any = null;
  private isEnabled = false;
  private backgroundEnabled = false;
  private lastVolumeChange = 0;
  private debounceTime = 300; // ms to prevent double triggers
  private initialVolume: number | null = null;

  async initialize() {
    // Configure notifications for overlay display
    await Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    // Request notification permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('Notification permissions not granted');
    }
  }

  addListener(callback: LapRecordCallback) {
    this.listeners.push(callback);
  }

  removeListener(callback: LapRecordCallback) {
    this.listeners = this.listeners.filter((listener) => listener !== callback);
  }

  private notifyListeners(): LapDetails | null {
    // Call the first listener and get lap details
    if (this.listeners.length > 0) {
      return this.listeners[0]();
    }
    return null;
  }

  async enable(backgroundEnabled: boolean = false) {
    if (this.isEnabled) return;

    this.isEnabled = true;
    this.backgroundEnabled = backgroundEnabled;

    try {
      // Disable native volume UI FIRST (before any volume changes)
      if (Platform.OS === 'android') {
        await VolumeManager.showNativeVolumeUI({ enabled: false });
      }

      // Get and store initial volume to restore later
      const volumeResult = await VolumeManager.getVolume();
      this.initialVolume = volumeResult.volume;

      // Set volume to middle (0.5) so both up and down buttons work
      await VolumeManager.setVolume(0.5, { showUI: false });

      // Set up volume change listener
      VolumeManager.addVolumeListener((result: any) => {
        const now = Date.now();

        // Debounce to prevent multiple triggers
        if (now - this.lastVolumeChange < this.debounceTime) {
          return;
        }

        this.lastVolumeChange = now;

        // Immediately restore to middle volume to prevent UI from showing
        VolumeManager.setVolume(0.5, { showUI: false });

        // Then handle the button press
        this.handleVolumeButtonPress();
      });

      if (backgroundEnabled && Platform.OS === 'android') {
        // Note: Full background task implementation would require native module
        // This is a simplified version
        console.log('Background recording enabled');
      }
    } catch (error) {
      console.error('Error enabling volume button service:', error);
    }
  }

  async disable() {
    if (!this.isEnabled) return;

    this.isEnabled = false;

    try {
      // Restore original volume
      if (this.initialVolume !== null) {
        await VolumeManager.setVolume(this.initialVolume, { showUI: false });
        this.initialVolume = null;
      }

      // Re-enable native volume UI
      if (Platform.OS === 'android') {
        await VolumeManager.showNativeVolumeUI({ enabled: true });
      }
    } catch (error) {
      console.error('Error disabling volume button service:', error);
    }

    if (this.backgroundEnabled) {
      this.backgroundEnabled = false;
    }
  }

  private async handleVolumeButtonPress() {
    // Trigger haptic feedback
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Notify listeners (which will record the lap) and get lap details
    const lapDetails = this.notifyListeners();

    // Show overlay notification with lap details
    await this.showLapRecordedNotification(lapDetails);
  }

  private async showLapRecordedNotification(lapDetails: LapDetails | null) {
    if (!lapDetails) {
      // Fallback if no lap details available
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✓ Lap Recorded',
          body: 'Lap time saved successfully',
          data: {},
        },
        trigger: null,
      });
    } else {
      // Format lap time (MM:SS.mmm)
      const minutes = Math.floor(lapDetails.time / 60);
      const seconds = lapDetails.time % 60;
      const formattedTime = `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;

      // Create lap type emoji and description
      let lapTypeEmoji = '';
      let lapTypeText = '';

      switch (lapDetails.lapType) {
        case 'bonus':
          lapTypeEmoji = '⭐';
          lapTypeText = 'BONUS LAP';
          break;
        case 'base':
          lapTypeEmoji = '✓';
          lapTypeText = 'BASE LAP';
          break;
        case 'broken':
          lapTypeEmoji = '❌';
          lapTypeText = 'BROKEN';
          break;
        case 'changeover':
          lapTypeEmoji = '🔄';
          lapTypeText = 'CHANGEOVER';
          break;
        case 'safety':
          lapTypeEmoji = '🚧';
          lapTypeText = 'SAFETY CAR';
          break;
      }

      // Format delta
      const deltaText = lapDetails.delta >= 0 ? `+${lapDetails.delta.toFixed(3)}s` : `${lapDetails.delta.toFixed(3)}s`;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${lapTypeEmoji} Lap #${lapDetails.lapNumber} - ${lapTypeText}`,
          body: `Time: ${formattedTime} (${deltaText})`,
          data: {
            time: lapDetails.time,
            lapType: lapDetails.lapType,
            delta: lapDetails.delta,
            lapNumber: lapDetails.lapNumber,
          },
        },
        trigger: null,
      });
    }

    // Auto-dismiss after 3 seconds (increased from 2 to allow reading)
    setTimeout(async () => {
      await Notifications.dismissAllNotificationsAsync();
    }, 3000);
  }

  isVolumeButtonsEnabled(): boolean {
    return this.isEnabled;
  }
}

export const VolumeButtonService = new VolumeButtonServiceClass();
