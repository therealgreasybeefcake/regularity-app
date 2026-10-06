import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const NOTIFICATION_ID = 'regularity-active-timer';
const CHANNEL_ID = 'active-timer';

class TimerNotificationServiceClass {
  private isConfigured = false;
  private hasPermission = false;
  private lastUpdateMs = 0;

  async init() {
    if (this.isConfigured || Platform.OS === 'web') return;
    this.isConfigured = true;

    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: false, // Don't trigger heads-up popup banner when active
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: true, // Show in pull-down shade / notification center
        }),
      });

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'Active Timer',
          importance: Notifications.AndroidImportance.LOW,
          vibrationPattern: null,
          enableVibrate: false,
          showBadge: false,
        });
      }

      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing === 'granted') {
        this.hasPermission = true;
      } else {
        const { status } = await Notifications.requestPermissionsAsync();
        this.hasPermission = status === 'granted';
      }
    } catch (err) {
      console.warn('[TimerNotificationService] init error:', err);
    }
  }

  async update(title: string, body: string) {
    if (Platform.OS === 'web') return;
    if (!this.isConfigured) await this.init();

    // Throttle to at most once per 800ms
    const now = Date.now();
    if (now - this.lastUpdateMs < 800) return;
    this.lastUpdateMs = now;

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: NOTIFICATION_ID,
        content: {
          title,
          body,
          sound: false,
          sticky: true,
          color: '#3b82f6',
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
        trigger: null,
      });
    } catch {
      // Ignore background or notification schedule errors
    }
  }

  async dismiss() {
    if (Platform.OS === 'web') return;
    try {
      await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
    } catch {
      // Ignore
    }
  }
}

export const TimerNotificationService = new TimerNotificationServiceClass();
