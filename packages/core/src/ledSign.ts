// Bluetooth LED pit-board sign — wire protocol shared by the mobile app and
// documented for the ESP32 firmware (hardware/led-sign). Pure TS, no RN imports.
//
// Every command is a single GATT write of at most 20 bytes (fits the default
// ATT MTU on every phone, so no MTU negotiation is needed). Byte 0 is the
// opcode; multi-byte integers are little-endian. Keep this file and
// hardware/led-sign/firmware/src/protocol.h in lockstep.

import type { LapType } from './types';

export const LED_SIGN_PROTOCOL_VERSION = 1;

export const LED_SIGN_SERVICE_UUID = 'a9fa0001-8e2e-4c12-9682-7dd27dea5a5b';
/** Write (with response): one command packet per write. */
export const LED_SIGN_COMMAND_UUID = 'a9fa0002-8e2e-4c12-9682-7dd27dea5a5b';
/** Read: ASCII "proto=1;fw=1.0.0;w=96;h=48". */
export const LED_SIGN_INFO_UUID = 'a9fa0003-8e2e-4c12-9682-7dd27dea5a5b';

export const LedSignOp = {
  Lap: 0x01,
  Timer: 0x02,
  Config: 0x03,
  Clear: 0x04,
  Test: 0x05,
} as const;

/** Wire order of lap types — also the order of the colour table in Config. */
export const LED_SIGN_LAP_TYPES: readonly LapType[] = ['bonus', 'base', 'broken', 'changeover', 'safety'];

export type LedSignMode = 'delta' | 'deltaLap' | 'countdown';
const MODE_CODES: Record<LedSignMode, number> = { delta: 0, deltaLap: 1, countdown: 2 };

export type Rgb = [number, number, number];

export interface LedSignConfig {
  /** Panel brightness 1–255 (the firmware also caps it, see MAX_BRIGHTNESS). */
  brightness: number;
  /** delta: delta only, full height · deltaLap: delta + driver/lap strip · countdown: delta, then a live countdown to target. */
  mode: LedSignMode;
  /** Decimal places shown on the delta (1 or 2). */
  decimals: 1 | 2;
  colors: Record<LapType, Rgb>;
  /** Broken laps: solid red board with black digits (unmissable, but heavy on power). */
  fillOnBroken: boolean;
  /** Flash safety-car laps at 2 Hz. */
  flashSafety: boolean;
  /** Rotate the image 180° (sign mounted upside down). */
  flip: boolean;
}

export const DEFAULT_LED_SIGN_CONFIG: LedSignConfig = {
  brightness: 192,
  mode: 'delta',
  decimals: 1,
  colors: {
    bonus: [0, 255, 0],
    base: [255, 160, 0],
    broken: [255, 0, 0],
    changeover: [0, 120, 255],
    safety: [255, 220, 0],
  },
  fillOnBroken: false,
  flashSafety: true,
  flip: false,
};

const FLAG_FILL_ON_BROKEN = 1 << 0;
const FLAG_FLIP = 1 << 1;
const FLAG_FLASH_SAFETY = 1 << 2;

const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

/** Up to 3 ASCII initials for the sign's info strip: "Driver A" → "DA", "Sam" → "SAM". */
export const driverInitials = (name: string): string => {
  const words = name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
};

/**
 * The delta exactly as the sign renders it: explicit sign, truncated (not
 * rounded) to `decimals` places so a 0.96 s bonus lap never reads "+1.0".
 */
export const formatSignDelta = (deltaSec: number, decimals: 1 | 2): string => {
  const ms = Math.round(deltaSec * 1000);
  const neg = ms < 0;
  const abs = Math.abs(ms);
  const unit = decimals === 1 ? 100 : 10;
  const whole = Math.floor(abs / 1000);
  const frac = Math.floor((abs % 1000) / unit);
  return `${neg ? '-' : '+'}${whole}.${String(frac).padStart(decimals, '0')}`;
};

export interface LedSignLap {
  lapType: LapType;
  lapNumber: number;
  deltaSec: number;
  targetSec: number;
  driverName: string;
}

/** [0x01, lapType, lapNumber u16, deltaMs i32, targetMs u32, initials×3] — 15 bytes. */
export const encodeLapPacket = (lap: LedSignLap): Uint8Array => {
  const buf = new Uint8Array(15);
  const view = new DataView(buf.buffer);
  buf[0] = LedSignOp.Lap;
  buf[1] = Math.max(0, LED_SIGN_LAP_TYPES.indexOf(lap.lapType));
  view.setUint16(2, clampInt(lap.lapNumber, 0, 0xffff), true);
  view.setInt32(4, clampInt(lap.deltaSec * 1000, -0x7fffffff, 0x7fffffff), true);
  view.setUint32(8, clampInt(lap.targetSec * 1000, 0, 0xffffffff), true);
  const initials = driverInitials(lap.driverName).padEnd(3, ' ');
  for (let i = 0; i < 3; i++) buf[12 + i] = initials.charCodeAt(i);
  return buf;
};

/**
 * [0x02, running, elapsedMs u32, targetMs u32] — 10 bytes. Elapsed (not an
 * absolute time) so the sign needs no clock sync: it counts on from receipt.
 */
export const encodeTimerPacket = (running: boolean, elapsedMs: number, targetSec: number): Uint8Array => {
  const buf = new Uint8Array(10);
  const view = new DataView(buf.buffer);
  buf[0] = LedSignOp.Timer;
  buf[1] = running ? 1 : 0;
  view.setUint32(2, clampInt(elapsedMs, 0, 0xffffffff), true);
  view.setUint32(6, clampInt(targetSec * 1000, 0, 0xffffffff), true);
  return buf;
};

/** [0x03, brightness, mode, decimals, flags, rgb×5] — 20 bytes. */
export const encodeConfigPacket = (config: LedSignConfig): Uint8Array => {
  const buf = new Uint8Array(20);
  buf[0] = LedSignOp.Config;
  buf[1] = clampInt(config.brightness, 1, 255);
  buf[2] = MODE_CODES[config.mode] ?? 0;
  buf[3] = config.decimals === 2 ? 2 : 1;
  buf[4] =
    (config.fillOnBroken ? FLAG_FILL_ON_BROKEN : 0) |
    (config.flip ? FLAG_FLIP : 0) |
    (config.flashSafety ? FLAG_FLASH_SAFETY : 0);
  LED_SIGN_LAP_TYPES.forEach((type, i) => {
    const [r, g, b] = config.colors[type] ?? DEFAULT_LED_SIGN_CONFIG.colors[type];
    buf[5 + i * 3] = clampInt(r, 0, 255);
    buf[6 + i * 3] = clampInt(g, 0, 255);
    buf[7 + i * 3] = clampInt(b, 0, 255);
  });
  return buf;
};

export const encodeClearPacket = (): Uint8Array => Uint8Array.of(LedSignOp.Clear);
export const encodeTestPacket = (): Uint8Array => Uint8Array.of(LedSignOp.Test);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 for BLE writes (react-native-ble-plx takes base64 values). */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
};
