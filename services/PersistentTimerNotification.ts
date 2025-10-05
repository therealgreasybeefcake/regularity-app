import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const TIMER_NOTIFICATION_ID = 'lap-timer-running';

class PersistentTimerNotificationClass {
  private isActive = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private elapsedTime = 0;
  private targetTime = 105;
  private driverName = '';

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
    this.elapsedTime = 0;
    this.targetTime = targetTime;
    this.driverName = driverName;

    // Show initial notification
    await this.updateNotification();

    // Update notification every 100ms for smooth timer display
    this.updateInterval = setInterval(() => {
      this.elapsedTime += 0.1;
      this.updateNotification();
    }, 100);
  }

  async updateTimer(elapsedTime: number) {
    this.elapsedTime = elapsedTime;
    // Notification will be updated by the interval
  }

  async updateNotification() {
    if (!this.isActive) return;

    const minutes = Math.floor(this.elapsedTime / 60);
    const seconds = this.elapsedTime % 60;
    const formattedTime = `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;

    const delta = this.elapsedTime - this.targetTime;
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

    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Dismiss the persistent notification
    await Notifications.dismissNotificationAsync(TIMER_NOTIFICATION_ID);
  }

  isTimerActive(): boolean {
    return this.isActive;
  }
}

export const PersistentTimerNotification = new PersistentTimerNotificationClass();
