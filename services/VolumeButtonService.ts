import { Platform } from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';
import * as Haptics from 'expo-haptics';
import { LapType } from '../types';

export interface LapDetails {
  time: number;
  lapType: LapType;
  delta: number;
  lapNumber: number;
}

type LapRecordCallback = () => LapDetails | null;

class VolumeButtonServiceClass {
  private listeners: LapRecordCallback[] = [];
  private isEnabled = false;
  private backgroundEnabled = false;
  private lastVolumeChange = 0;
  private debounceTime = 300; // ms to prevent double triggers
  private initialVolume: number | null = null;

  async initialize() {
    // No initialization needed
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

    // Notify listeners (which will record the lap)
    this.notifyListeners();
  }

  isVolumeButtonsEnabled(): boolean {
    return this.isEnabled;
  }
}

export const VolumeButtonService = new VolumeButtonServiceClass();
