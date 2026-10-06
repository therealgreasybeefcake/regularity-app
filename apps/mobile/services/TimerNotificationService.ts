import { Platform } from 'react-native';

const NOTIFICATION_ID = 'regularity-active-timer';
const CHANNEL_ID = 'active-race-timer-v7';
const ALERT_CHANNEL_ID = 'race-warning-alerts-v7';

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
        // Channel for the ticking stopwatch notification (visible on lockscreen & status bar without buzzing)
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'Active Race Timer',
          importance: Notifications.AndroidImportance?.DEFAULT ?? 3,
          vibrationPattern: null,
          enableVibrate: false,
          showBadge: false,
          sound: null,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility?.PUBLIC ?? 1,
        });

        // Channel for audio warnings and lap alerts (high-priority heads-up with sound, motor vibration, bypass DND)
        await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
          name: 'Timer Warnings & Alerts',
          importance: Notifications.AndroidImportance?.MAX ?? 5,
          vibrationPattern: [0, 500, 200, 500],
          enableVibrate: true,
          showBadge: true,
          sound: 'default',
          bypassDnd: true,
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
          android: {},
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
            priority: Notifications.AndroidNotificationPriority?.DEFAULT ?? 1,
            color: '#1e40af',
            channelId: CHANNEL_ID,
          },
          trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
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
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority?.MAX ?? 2,
            interruptionLevel: 'timeSensitive',
            color: '#dc2626',
            channelId: ALERT_CHANNEL_ID,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? 'timeInterval',
            seconds,
            repeats: false,
            channelId: ALERT_CHANNEL_ID,
          },
        });
        console.log(`[TimerNotificationService] Scheduled warning "${id}" in ${seconds}s on channel ${ALERT_CHANNEL_ID}`);
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
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority?.MAX ?? 2,
            color: '#dc2626',
            channelId: ALERT_CHANNEL_ID,
          },
          trigger: Platform.OS === 'android' ? { channelId: ALERT_CHANNEL_ID } : null,
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
