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
  private volumeListener: any = null;
  private isInitializing = false; // Flag to prevent triggers during initialization

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
    this.isInitializing = true; // Set flag to prevent initial volume changes from triggering

    try {
      // Note: expo-audio's setAudioModeAsync should be called BEFORE this
      // to properly configure the audio session

      // Set up audio session for iOS - this is REQUIRED for volume events to work
      if (Platform.OS === 'ios') {
        console.log('[VolumeButtonService] Setting up iOS audio session...');

        // Enable audio in silent mode - this must be set for audio to work
        await VolumeManager.enableInSilenceMode(true);
        console.log('[VolumeButtonService] Enabled audio in silent mode');

        // Set audio session category to Playback (not Ambient) with mixing
        // Playback category is required for proper volume button detection
        await VolumeManager.setCategory('Playback', true);
        console.log('[VolumeButtonService] Set category to Playback with mixing');

        // Activate the audio session
        await VolumeManager.setActive(true, true);
        console.log('[VolumeButtonService] Activated audio session');
      }

      // Disable native volume UI FIRST (before any volume changes)
      // This is required on both iOS and Android to intercept volume button presses
      await VolumeManager.showNativeVolumeUI({ enabled: false });

      // Get and store initial volume to restore later
      const volumeResult = await VolumeManager.getVolume();
      this.initialVolume = volumeResult.volume;
      console.log('[VolumeButtonService] Current volume:', volumeResult.volume);

      // Set volume to middle (0.5) so both up and down buttons work
      await VolumeManager.setVolume(0.5, { showUI: false });

      console.log('[VolumeButtonService] Volume set to 0.5, setting up listener...');

      // Set up volume change listener
      this.volumeListener = VolumeManager.addVolumeListener((result: any) => {
        console.log('[VolumeButtonService] Volume changed detected:', result);

        // Ignore volume changes during initialization
        if (this.isInitializing) {
          console.log('[VolumeButtonService] Initializing - ignoring volume change');
          return;
        }

        const now = Date.now();

        // Debounce to prevent multiple triggers
        if (now - this.lastVolumeChange < this.debounceTime) {
          console.log('[VolumeButtonService] Debounced - ignoring');
          return;
        }

        this.lastVolumeChange = now;
        console.log('[VolumeButtonService] Processing volume button press');

        // Handle the button press FIRST (to capture accurate timestamp)
        this.handleVolumeButtonPress();

        // Then restore to middle volume (slight delay to ensure the event is processed)
        setTimeout(() => {
          VolumeManager.setVolume(0.5, { showUI: false }).catch(err =>
            console.error('[VolumeButtonService] Error resetting volume:', err)
          );
        }, 50);
      });

      // Wait before clearing the initialization flag to ensure setup events are ignored
      // Increased to 800ms to account for all async operations
      setTimeout(() => {
        this.isInitializing = false;
        console.log('[VolumeButtonService] Initialization complete, volume buttons ready');
      }, 800);

      console.log('[VolumeButtonService] Volume button service enabled successfully');

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

    console.log('[VolumeButtonService] Disabling volume button service...');
    this.isEnabled = false;
    this.isInitializing = false; // Reset initialization flag

    try {
      // Remove volume listener
      if (this.volumeListener) {
        this.volumeListener.remove();
        this.volumeListener = null;
        console.log('[VolumeButtonService] Volume listener removed');
      }

      // Restore original volume
      if (this.initialVolume !== null) {
        await VolumeManager.setVolume(this.initialVolume, { showUI: false });
        this.initialVolume = null;
        console.log('[VolumeButtonService] Original volume restored');
      }

      // Re-enable native volume UI on both platforms
      await VolumeManager.showNativeVolumeUI({ enabled: true });
      console.log('[VolumeButtonService] Native volume UI re-enabled');

      // Deactivate audio session on iOS
      if (Platform.OS === 'ios') {
        await VolumeManager.setActive(false, true);
        console.log('[VolumeButtonService] iOS audio session deactivated');
      }
    } catch (error) {
      console.error('[VolumeButtonService] Error disabling volume button service:', error);
    }

    if (this.backgroundEnabled) {
      this.backgroundEnabled = false;
    }
  }

  private async handleVolumeButtonPress() {
    console.log('[VolumeButtonService] Handling volume button press, listeners:', this.listeners.length);

    if (this.listeners.length === 0) {
      console.warn('[VolumeButtonService] No listeners registered!');
      return;
    }

    // Trigger haptic feedback FIRST for immediate user feedback
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error('[VolumeButtonService] Haptic feedback error:', error);
    }

    // Notify listeners (which will record the lap)
    try {
      const result = this.notifyListeners();
      console.log('[VolumeButtonService] Lap recording result:', result);
    } catch (error) {
      console.error('[VolumeButtonService] Error in listener callback:', error);
    }
  }

  isVolumeButtonsEnabled(): boolean {
    return this.isEnabled;
  }
}

export const VolumeButtonService = new VolumeButtonServiceClass();
