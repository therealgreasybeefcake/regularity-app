import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import VolumeManager from 'react-native-volume-manager';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

const VOLUME_BUTTON_TASK = 'VOLUME_BUTTON_LAP_RECORDING';

type LapRecordCallback = () => void;

class VolumeButtonServiceClass {
  private listeners: LapRecordCallback[] = [];
  private volumeListener: any = null;
  private isEnabled = false;
  private backgroundEnabled = false;
  private lastVolumeChange = 0;
  private debounceTime = 300; // ms to prevent double triggers

  async initialize() {
    // Configure notifications for overlay display
    await Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
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

  private notifyListeners() {
    this.listeners.forEach((callback) => callback());
  }

  async enable(backgroundEnabled: boolean = false) {
    if (this.isEnabled) return;

    this.isEnabled = true;
    this.backgroundEnabled = backgroundEnabled;

    if (Platform.OS === 'android') {
      VolumeManager.showNativeVolumeUI({ enabled: false });
    }

    // Set up volume change listener
    VolumeManager.addVolumeListener((result: any) => {
      const now = Date.now();

      // Debounce to prevent multiple triggers
      if (now - this.lastVolumeChange < this.debounceTime) {
        return;
      }

      this.lastVolumeChange = now;
      this.handleVolumeButtonPress();
    });

    if (backgroundEnabled && Platform.OS === 'android') {
      // Note: Full background task implementation would require native module
      // This is a simplified version
      console.log('Background recording enabled');
    }
  }

  async disable() {
    if (!this.isEnabled) return;

    this.isEnabled = false;

    if (Platform.OS === 'android') {
      VolumeManager.showNativeVolumeUI({ enabled: true });
    }

    VolumeManager.removeVolumeListener();

    if (this.backgroundEnabled) {
      this.backgroundEnabled = false;
    }
  }

  private async handleVolumeButtonPress() {
    // Trigger haptic feedback
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Notify listeners (which will record the lap)
    this.notifyListeners();

    // Show overlay notification
    await this.showLapRecordedNotification();
  }

  private async showLapRecordedNotification() {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✓ Lap Recorded',
        body: 'Lap time saved successfully',
        data: {},
      },
      trigger: null, // Show immediately
    });

    // Auto-dismiss after 2 seconds
    setTimeout(async () => {
      await Notifications.dismissAllNotificationsAsync();
    }, 2000);
  }

  isVolumeButtonsEnabled(): boolean {
    return this.isEnabled;
  }
}

export const VolumeButtonService = new VolumeButtonServiceClass();
