import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const TIMER_NOTIFICATION_ID = 'lap-timer-running';

class PersistentTimerNotificationClass {
  private isActive = false;
  private startTime = 0;
  private targetTime = 105;
  private driverName = '';
  private lastNotificationUpdate = 0;
  private updateThrottle = 200; // Update notification every 200ms max (5 times per second)
  private backgroundInterval: NodeJS.Timeout | null = null;

  async initialize() {
    // Set notification channel for Android (required for persistent notifications)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('lap-timer', {
        name: 'Lap Timer',
        importance: Notifications.AndroidImportance.HIGH,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: null,
        vibrationPattern: null,
        enableVibrate: false,
      });
    }
  }

  async showTimer(driverName: string, targetTime: number) {
    if (this.isActive) return;

    this.isActive = true;
    this.startTime = Date.now();
    this.targetTime = targetTime;
    this.driverName = driverName;
    this.lastNotificationUpdate = 0;

    // Show initial notification
    await this.updateNotification();

    // Start background interval to keep updating even when app is backgrounded
    // This updates every 500ms to keep the notification fresh
    this.backgroundInterval = setInterval(async () => {
      if (this.isActive) {
        await this.updateNotification();
      }
    }, 500);
  }

  async updateTimer(startTime: number) {
    // Update the start time (called when lap is recorded to restart timer)
    this.startTime = startTime;

    // Throttle notification updates to avoid performance issues
    const now = Date.now();
    if (now - this.lastNotificationUpdate >= this.updateThrottle) {
      this.lastNotificationUpdate = now;
      await this.updateNotification();
    }
  }

  async updateNotification() {
    if (!this.isActive) return;

    // Calculate elapsed time based on start timestamp (works even in background)
    const elapsedTime = (Date.now() - this.startTime) / 1000;

    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    const formattedTime = `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;

    const delta = elapsedTime - this.targetTime;
    const deltaText = delta >= 0 ? `+${delta.toFixed(2)}s` : `${delta.toFixed(2)}s`;

    await Notifications.scheduleNotificationAsync({
      identifier: TIMER_NOTIFICATION_ID,
      content: {
        title: `⏱️ ${this.driverName || 'Lap Timer'}`,
        body: `Time: ${formattedTime} | Target: ${this.targetTime}s (${deltaText})`,
        data: { persistent: true },
        sticky: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        sound: null,
        vibrate: [],
      },
      trigger: null,
    });
  }

  async hideTimer() {
    if (!this.isActive) return;

    this.isActive = false;

    // Clear background interval
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
    }

    // Dismiss the persistent notification
    await Notifications.dismissNotificationAsync(TIMER_NOTIFICATION_ID);
  }

  isTimerActive(): boolean {
    return this.isActive;
  }
}

export const PersistentTimerNotification = new PersistentTimerNotificationClass();
