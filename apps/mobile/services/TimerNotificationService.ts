import { Platform } from 'react-native';

const NOTIFICATION_ID = 'regularity-active-timer';
const CHANNEL_ID = 'active-timer';
const ALERT_CHANNEL_ID = 'timer-alerts';

let Notifications: any = null;
try {
  if (Platform.OS !== 'web') {
    Notifications = require('expo-notifications');
  }
} catch {
  Notifications = null;
}

class TimerNotificationServiceClass {
  private isConfigured = false;
  private hasPermission = false;
  private lastUpdateMs = 0;

  async init() {
    if (Platform.OS === 'web' || !Notifications) return;

    try {
      if (Notifications.setNotificationHandler) {
        Notifications.setNotificationHandler({
          handleNotification: async (notification: any) => {
            const isAlert = notification?.request?.identifier?.startsWith('regularity-warning');
            return {
              shouldShowAlert: true,
              shouldPlaySound: isAlert,
              shouldSetBadge: false,
              shouldShowBanner: true,
              shouldShowList: true,
            };
          },
        });
      }

      if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
        // Channel for the silent, persistent ticking stopwatch notification
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'Active Timer',
          importance: Notifications.AndroidImportance?.LOW ?? 2,
          vibrationPattern: null,
          enableVibrate: false,
          showBadge: false,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility?.PUBLIC ?? 1,
        });

        // Channel for audio warnings and lap alerts (with sound and motor vibration)
        await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
          name: 'Timer Warnings & Alerts',
          importance: Notifications.AndroidImportance?.HIGH ?? 4,
          vibrationPattern: [0, 400, 150, 400],
          enableVibrate: true,
          showBadge: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility?.PUBLIC ?? 1,
        });
      }

      await this.ensurePermission();
      this.isConfigured = true;
    } catch (err) {
      console.warn('[TimerNotificationService] init error:', err);
    }
  }

  async ensurePermission(): Promise<boolean> {
    if (Platform.OS === 'web' || !Notifications) return false;

    // Android 12 and below do not require runtime POST_NOTIFICATIONS permission
    if (Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version < 33) {
      this.hasPermission = true;
      return true;
    }

    try {
      if (Notifications.getPermissionsAsync) {
        const res = await Notifications.getPermissionsAsync();
        if (res.granted || res.status === 'granted') {
          this.hasPermission = true;
          return true;
        }
      }

      if (Notifications.requestPermissionsAsync) {
        const res = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowDisplayInCarPlay: true,
          },
        });
        if (res.granted || res.status === 'granted') {
          this.hasPermission = true;
          return true;
        }
      }
    } catch (err) {
      console.warn('[TimerNotificationService] ensurePermission error:', err);
    }

    return this.hasPermission;
  }

  async update(title: string, body: string, immediate = false) {
    if (Platform.OS === 'web' || !Notifications) return;
    if (!this.isConfigured) await this.init();

    const permitted = await this.ensurePermission();
    if (!permitted) {
      return;
    }

    const now = Date.now();
    if (!immediate && now - this.lastUpdateMs < 800) return;
    this.lastUpdateMs = now;

    try {
      if (Notifications.scheduleNotificationAsync) {
        await Notifications.scheduleNotificationAsync({
          identifier: NOTIFICATION_ID,
          content: {
            title,
            body,
            sound: false,
            sticky: true,
            priority: Notifications.AndroidNotificationPriority?.LOW ?? 0,
            color: '#1e40af',
            ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
          },
          trigger: null,
        });
      }
    } catch (err) {
      console.warn('[TimerNotificationService] schedule error:', err);
    }
  }

  async updateImmediate(title: string, body: string) {
    return this.update(title, body, true);
  }

  async scheduleWarning(id: string, title: string, body: string, delaySeconds: number) {
    if (Platform.OS === 'web' || !Notifications) return;
    if (!this.isConfigured) await this.init();

    const permitted = await this.ensurePermission();
    if (!permitted) return;

    const seconds = Math.max(1, Math.round(delaySeconds));

    try {
      if (Notifications.scheduleNotificationAsync) {
        await Notifications.scheduleNotificationAsync({
          identifier: id,
          content: {
            title,
            body,
            sound: true,
            priority: Notifications.AndroidNotificationPriority?.MAX ?? 2,
            interruptionLevel: 'timeSensitive',
            color: '#dc2626',
            ...(Platform.OS === 'android' ? { channelId: ALERT_CHANNEL_ID } : {}),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? 'timeInterval',
            seconds,
            repeats: false,
          },
        });
        console.log(`[TimerNotificationService] Scheduled warning "${id}" in ${seconds}s`);
      }
    } catch (err) {
      console.warn('[TimerNotificationService] scheduleWarning error:', err);
    }
  }

  async sendImmediateAlert(title: string, body: string) {
    if (Platform.OS === 'web' || !Notifications) return;
    if (!this.isConfigured) await this.init();

    const permitted = await this.ensurePermission();
    if (!permitted) return;

    try {
      if (Notifications.scheduleNotificationAsync) {
        await Notifications.scheduleNotificationAsync({
          identifier: `regularity-warning-alert-${Date.now()}`,
          content: {
            title,
            body,
            sound: true,
            priority: Notifications.AndroidNotificationPriority?.MAX ?? 2,
            color: '#dc2626',
            ...(Platform.OS === 'android' ? { channelId: ALERT_CHANNEL_ID } : {}),
          },
          trigger: null,
        });
      }
    } catch (err) {
      console.warn('[TimerNotificationService] sendImmediateAlert error:', err);
    }
  }

  async cancelWarnings(ids: string[]) {
    if (Platform.OS === 'web' || !Notifications) return;
    try {
      for (const id of ids) {
        if (Notifications.cancelScheduledNotificationAsync) {
          await Notifications.cancelScheduledNotificationAsync(id);
        }
      }
    } catch {
      // Ignore
    }
  }

  async dismiss() {
    if (Platform.OS === 'web' || !Notifications) return;
    try {
      if (Notifications.dismissNotificationAsync) {
        await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
      }
    } catch {
      // Ignore
    }
  }
}

export const TimerNotificationService = new TimerNotificationServiceClass();
