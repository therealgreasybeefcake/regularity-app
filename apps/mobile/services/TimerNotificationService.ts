import { Platform, AppState } from 'react-native';

const NOTIFICATION_ID = 'regularity-active-timer';
const CHANNEL_ID = 'active-timer';

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
    if (this.isConfigured || Platform.OS === 'web' || !Notifications) return;
    this.isConfigured = true;

    try {
      if (Notifications.setNotificationHandler) {
        Notifications.setNotificationHandler({
          handleNotification: async () => {
            // When in background or locked, show banner so user sees timer progress
            const isForeground = AppState.currentState === 'active';
            return {
              shouldShowAlert: !isForeground,
              shouldPlaySound: false,
              shouldSetBadge: false,
              shouldShowBanner: !isForeground,
              shouldShowList: true, // Always show in notification center / lock screen
            };
          },
        });
      }

      if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'Active Timer',
          importance: Notifications.AndroidImportance?.HIGH ?? 4,
          vibrationPattern: null,
          enableVibrate: false,
          showBadge: false,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility?.PUBLIC ?? 1,
        });
      }

      if (Notifications.getPermissionsAsync) {
        const { status: existing } = await Notifications.getPermissionsAsync();
        if (existing === 'granted') {
          this.hasPermission = true;
        } else if (Notifications.requestPermissionsAsync) {
          const { status } = await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: false,
              allowDisplayInCarPlay: true,
            },
          });
          this.hasPermission = status === 'granted';
        }
      }
    } catch (err) {
      console.warn('[TimerNotificationService] init error:', err);
    }
  }

  async update(title: string, body: string, immediate = false) {
    if (Platform.OS === 'web' || !Notifications) return;
    if (!this.isConfigured) await this.init();
    if (!this.hasPermission) return;

    // Throttle unless explicitly requested as immediate
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
            priority: Notifications.AndroidNotificationPriority?.HIGH,
            color: '#1e40af',
            ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
          },
          trigger: null,
        });
      }
    } catch {
      // Ignore background or notification schedule errors
    }
  }

  async updateImmediate(title: string, body: string) {
    return this.update(title, body, true);
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
