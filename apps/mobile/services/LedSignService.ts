import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BleManager, Device, Subscription } from 'react-native-ble-plx';
import {
  DEFAULT_LED_SIGN_CONFIG,
  LED_SIGN_COMMAND_UUID,
  LED_SIGN_SERVICE_UUID,
  bytesToBase64,
  encodeClearPacket,
  encodeConfigPacket,
  encodeLapPacket,
  encodeLayoutPacket,
  encodePowerPacket,
  encodeTestPacket,
  encodeTimerPacket,
  type LedSignConfig,
  type LedSignLap,
} from '@regularity/core';

// Bluetooth LED pit-board sign (hardware/led-sign). Keeps one remembered sign
// connected, re-sends the latest state on every (re)connect, and turns lap /
// stopwatch updates into protocol packets. Every public method is a safe no-op
// on web and on binaries built before react-native-ble-plx was added (an OTA
// update can land there), so callers never need to guard.

export type LedSignStatus =
  | 'unsupported' // web, or a native build without the BLE module
  | 'poweredOff' // Bluetooth off / unauthorised
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected';

export interface DiscoveredSign {
  id: string;
  name: string;
  rssi: number | null;
}

export interface LedSignSettings {
  /** Keep the remembered sign connected (auto-reconnect). */
  autoConnect: boolean;
  deviceId: string | null;
  deviceName: string | null;
  config: LedSignConfig;
}

export interface LedSignState {
  status: LedSignStatus;
  settings: LedSignSettings;
  discovered: DiscoveredSign[];
  error: string | null;
}

const STORAGE_KEY = 'ledSignSettings';
const SCAN_MS = 10_000;
const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

const DEFAULT_SETTINGS: LedSignSettings = {
  autoConnect: true,
  deviceId: null,
  deviceName: null,
  config: DEFAULT_LED_SIGN_CONFIG,
};

type TimerSnapshot = { running: boolean; lapStartedAt: number | null; stoppedAt: number | null };

class LedSignServiceClass {
  private state: LedSignState = {
    status: Platform.OS === 'web' ? 'unsupported' : 'idle',
    settings: DEFAULT_SETTINGS,
    discovered: [],
    error: null,
  };
  private listeners = new Set<() => void>();
  private manager: BleManager | null = null;
  private initPromise: Promise<void> | null = null;
  private stateSub: Subscription | null = null;
  private disconnectSub: Subscription | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_MIN_MS;
  private connectedId: string | null = null;
  private poweredOn = false;
  // BLE writes must not interleave — chain them.
  private writeQueue: Promise<void> = Promise.resolve();
  // Latest state, replayed after every (re)connect so the sign always catches up.
  private lastLap: LedSignLap | null = null;
  private timer: TimerSnapshot = { running: false, lapStartedAt: null, stoppedAt: null };
  private targetSec = 0;

  // ---- Store (useSyncExternalStore) ----

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  private setState(patch: Partial<LedSignState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private setSettings(patch: Partial<LedSignSettings>) {
    const settings = { ...this.state.settings, ...patch };
    this.setState({ settings });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
  }

  // ---- Lifecycle ----

  /** Idempotent. Loads settings and, once Bluetooth is on, reconnects the remembered sign. */
  init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<LedSignSettings>;
        this.setState({
          settings: {
            ...DEFAULT_SETTINGS,
            ...saved,
            config: {
              ...DEFAULT_LED_SIGN_CONFIG,
              ...saved.config,
              layout: { ...DEFAULT_LED_SIGN_CONFIG.layout, ...saved.config?.layout },
              colors: { ...DEFAULT_LED_SIGN_CONFIG.colors, ...saved.config?.colors },
            },
          },
        });
      }
    } catch {
      // Corrupt settings — keep the defaults.
    }

    const manager = this.getManager();
    if (!manager) return;
    this.stateSub = manager.onStateChange((bleState) => {
      this.poweredOn = bleState === 'PoweredOn';
      if (!this.poweredOn) {
        this.clearReconnect();
        this.connectedId = null;
        this.setState({ status: 'poweredOff', discovered: [] });
        return;
      }
      if (this.state.status === 'poweredOff') this.setState({ status: 'idle' });
      this.maybeAutoConnect();
    }, true);
  }

  private getManager(): BleManager | null {
    if (this.manager) return this.manager;
    // NativeModules.BlePlx is absent on web and on binaries without the module.
    if (Platform.OS === 'web' || !NativeModules.BlePlx) {
      this.setState({ status: 'unsupported' });
      return null;
    }
    // Lazy require keeps the native module out of the web code path.
    const { BleManager: Manager } = require('react-native-ble-plx') as typeof import('react-native-ble-plx');
    this.manager = new Manager();
    return this.manager;
  }

  // ---- Discovery & connection ----

  private async ensurePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true; // iOS prompts on first use
    if (Number(Platform.Version) >= 31) {
      const res = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return Object.values(res).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
    }
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }

  async startScan() {
    await this.init();
    const manager = this.getManager();
    if (!manager) return;
    if (!this.poweredOn) {
      this.setState({ error: 'Turn on Bluetooth to find the sign.' });
      return;
    }
    if (!(await this.ensurePermissions())) {
      this.setState({ error: 'Bluetooth permission is needed to find the sign.' });
      return;
    }
    this.stopScan();
    this.setState({ status: 'scanning', discovered: [], error: null });
    manager.startDeviceScan([LED_SIGN_SERVICE_UUID], null, (error, device) => {
      if (error) {
        this.stopScan();
        this.setState({ error: error.message });
        return;
      }
      if (!device) return;
      const found: DiscoveredSign = {
        id: device.id,
        name: device.localName || device.name || 'LED sign',
        rssi: device.rssi ?? null,
      };
      const others = this.state.discovered.filter((d) => d.id !== found.id);
      this.setState({ discovered: [...others, found].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)) });
    });
    this.scanTimer = setTimeout(() => this.stopScan(), SCAN_MS);
  }

  stopScan() {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = null;
    this.manager?.stopDeviceScan();
    if (this.state.status === 'scanning') this.setState({ status: 'idle' });
  }

  /** Pair with (remember) a sign and connect to it. */
  async pair(sign: DiscoveredSign) {
    this.stopScan();
    this.setSettings({ deviceId: sign.id, deviceName: sign.name, autoConnect: true });
    await this.connect();
  }

  /** Disconnect and forget the remembered sign. */
  async forget() {
    this.setSettings({ deviceId: null, deviceName: null });
    await this.disconnect();
  }

  setAutoConnect(autoConnect: boolean) {
    this.setSettings({ autoConnect });
    if (autoConnect) this.maybeAutoConnect();
    else void this.disconnect();
  }

  async connect() {
    await this.init();
    const manager = this.getManager();
    const id = this.state.settings.deviceId;
    if (!manager || !id || !this.poweredOn) return;
    if (this.state.status === 'connecting' || this.connectedId === id) return;
    this.clearReconnect();
    if (!(await this.ensurePermissions())) {
      this.setState({ error: 'Bluetooth permission is needed to connect to the sign.' });
      return;
    }
    this.setState({ status: 'connecting', error: null });
    try {
      const device: Device = await manager.connectToDevice(id, { timeout: 10_000 });
      await device.discoverAllServicesAndCharacteristics();
      this.connectedId = id;
      this.reconnectDelay = RECONNECT_MIN_MS;
      this.disconnectSub?.remove();
      this.disconnectSub = manager.onDeviceDisconnected(id, () => this.handleDisconnected());
      this.setState({ status: 'connected' });
      this.replayState();
    } catch (e: any) {
      this.connectedId = null;
      this.setState({ status: 'idle', error: e?.message ?? 'Could not connect to the sign.' });
      this.scheduleReconnect();
    }
  }

  async disconnect() {
    this.clearReconnect();
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    const id = this.connectedId;
    this.connectedId = null;
    if (id) await this.manager?.cancelDeviceConnection(id).catch(() => {});
    if (this.state.status === 'connected' || this.state.status === 'connecting') this.setState({ status: 'idle' });
  }

  private handleDisconnected() {
    this.connectedId = null;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
    if (this.state.status !== 'poweredOff') this.setState({ status: 'idle' });
    this.scheduleReconnect();
  }

  private maybeAutoConnect() {
    const { autoConnect, deviceId } = this.state.settings;
    if (autoConnect && deviceId && this.poweredOn) void this.connect();
  }

  private scheduleReconnect() {
    const { autoConnect, deviceId } = this.state.settings;
    if (!autoConnect || !deviceId || !this.poweredOn || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  // ---- Commands ----

  private write(packet: Uint8Array): Promise<void> {
    const id = this.connectedId;
    const manager = this.manager;
    if (!id || !manager) return Promise.resolve();
    const value = bytesToBase64(packet);
    this.writeQueue = this.writeQueue
      .then(() => manager.writeCharacteristicWithResponseForDevice(id, LED_SIGN_SERVICE_UUID, LED_SIGN_COMMAND_UUID, value))
      .then(
        () => {},
        (e: any) => {
          // A dropped link surfaces via onDeviceDisconnected; just log the write.
          console.warn('[LedSignService] write failed:', e?.message ?? e);
        },
      );
    return this.writeQueue;
  }

  private timerPacket(): Uint8Array {
    const { running, lapStartedAt, stoppedAt } = this.timer;
    const elapsed = lapStartedAt == null ? 0 : (running ? Date.now() : (stoppedAt ?? Date.now())) - lapStartedAt;
    return encodeTimerPacket(running && lapStartedAt != null, elapsed, this.targetSec);
  }

  private replayState() {
    const { config } = this.state.settings;
    void this.write(encodePowerPacket(config.powerBudgetW, config.ecoLeadSec));
    void this.write(encodeConfigPacket(config));
    void this.write(encodeLayoutPacket(config.layout));
    void this.write(this.lastLap ? encodeLapPacket(this.lastLap) : encodeClearPacket());
    void this.write(this.timerPacket());
  }

  updateConfig(patch: Partial<LedSignConfig>) {
    const config = { ...this.state.settings.config, ...patch };
    this.setSettings({ config });
    if ('powerBudgetW' in patch || 'ecoLeadSec' in patch) void this.write(encodePowerPacket(config.powerBudgetW, config.ecoLeadSec));
    if ('layout' in patch) void this.write(encodeLayoutPacket(config.layout));
    const NOT_IN_CONFIG_PACKET = ['layout', 'preset', 'powerBudgetW', 'ecoLeadSec'];
    if (Object.keys(patch).some((k) => !NOT_IN_CONFIG_PACKET.includes(k))) void this.write(encodeConfigPacket(config));
  }

  /** Show a lap's delta on the sign (the active driver's latest lap). */
  sendLap(lap: LedSignLap) {
    this.lastLap = lap;
    this.targetSec = lap.targetSec;
    void this.write(encodeLapPacket(lap));
  }

  /** Blank the delta (no laps yet for the active driver). */
  clear() {
    this.lastLap = null;
    void this.write(encodeClearPacket());
  }

  /** Target lap time used by the sign's countdown mode. */
  setTarget(targetSec: number) {
    if (targetSec === this.targetSec) return;
    this.targetSec = targetSec;
    void this.write(this.timerPacket());
  }

  /** Mirror the Timer's stopwatch (local epoch ms, as reported to the live session). */
  sendTimer(running: boolean, lapStartedAt: number | null, stoppedAt: number | null = null) {
    this.timer = { running, lapStartedAt, stoppedAt };
    void this.write(this.timerPacket());
  }

  /** Light every segment in every lap colour, to check wiring and power. */
  test() {
    void this.write(encodeTestPacket());
  }
}

export const LedSignService = new LedSignServiceClass();
