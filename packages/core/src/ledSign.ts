// Bluetooth LED pit-board sign — wire protocol shared by the mobile app and
// documented for the ESP32 firmware (hardware/led-sign). Pure TS, no RN imports.
//
// Every command is a single GATT write of at most 20 bytes (fits the default
// ATT MTU on every phone, so no MTU negotiation is needed). Byte 0 is the
// opcode; multi-byte integers are little-endian. Keep this file and
// hardware/led-sign/firmware/src/protocol.h (and renderer.cpp's field text)
// in lockstep.

import type { LapType } from './types';

export const LED_SIGN_PROTOCOL_VERSION = 1;

export const LED_SIGN_SERVICE_UUID = 'a9fa0001-8e2e-4c12-9682-7dd27dea5a5b';
/** Write (with response): one command packet per write. */
export const LED_SIGN_COMMAND_UUID = 'a9fa0002-8e2e-4c12-9682-7dd27dea5a5b';
/** Read: ASCII "proto=1;fw=1.1.0;w=96;h=48". */
export const LED_SIGN_INFO_UUID = 'a9fa0003-8e2e-4c12-9682-7dd27dea5a5b';

export const LedSignOp = {
  Lap: 0x01,
  Timer: 0x02,
  Config: 0x03,
  Clear: 0x04,
  Test: 0x05,
  Layout: 0x06,
  Power: 0x07,
} as const;

/** Wire order of lap types — also the order of the colour table in Config. */
export const LED_SIGN_LAP_TYPES: readonly LapType[] = ['bonus', 'base', 'broken', 'changeover', 'safety'];

export type Rgb = [number, number, number];

// ---- What the sign shows ----

/**
 * One piece of data the sign can show. Wire codes are the index in
 * LED_SIGN_FIELDS. "Live" fields (countdown, elapsed) tick on the sign itself.
 */
export type LedSignField =
  | 'none'
  | 'delta' // +0.4
  | 'lapTime' // 48.7 — minutes implied (1:48.7 → 48.7)
  | 'lapTimeFull' // 1:48.7
  | 'countdown' // live: time left to target, then counts up past it
  | 'elapsed' // live: running lap clock, minutes implied
  | 'lapNumber' // L12
  | 'driver' // DA
  | 'driverLap' // DA L12
  | 'target'; // 45.0 — target, minutes implied

export const LED_SIGN_FIELDS: readonly LedSignField[] = [
  'none',
  'delta',
  'lapTime',
  'lapTimeFull',
  'countdown',
  'elapsed',
  'lapNumber',
  'driver',
  'driverLap',
  'target',
];

export const LED_SIGN_LIVE_FIELDS: readonly LedSignField[] = ['countdown', 'elapsed'];

/** 'lapType' = the last lap's colour (live fields: the type the lap would get if it ended now). */
export type LedSignColor = 'lapType' | Rgb;

export type LedSignSecondarySize = 'strip' | 'third' | 'half';
const SECONDARY_SIZES: readonly LedSignSecondarySize[] = ['strip', 'third', 'half'];

export interface LedSignLayout {
  main: { field: LedSignField; color: LedSignColor };
  /** Second line under the main one ('none' = main fills the sign). */
  secondary: { field: LedSignField; color: LedSignColor; size: LedSignSecondarySize };
  /** Live fields are replaced by this field for `holdSec` after each lap (0 = never). */
  holdField: LedSignField;
  holdSec: number;
}

export type LedSignPresetId =
  | 'delta'
  | 'lapTime'
  | 'deltaOverTime'
  | 'timeOverDelta'
  | 'deltaDriver'
  | 'countdown';

const WHITE: Rgb = [255, 255, 255];
const NO_SECONDARY: LedSignLayout['secondary'] = { field: 'none', color: WHITE, size: 'strip' };
const NO_HOLD = { holdField: 'delta' as LedSignField, holdSec: 0 };

export const LED_SIGN_PRESETS: readonly { id: LedSignPresetId; label: string; description: string; layout: LedSignLayout }[] = [
  {
    id: 'delta',
    label: 'Delta',
    description: 'Last lap delta at full height.',
    layout: { main: { field: 'delta', color: 'lapType' }, secondary: NO_SECONDARY, ...NO_HOLD },
  },
  {
    id: 'lapTime',
    label: 'Lap time',
    description: 'Last lap time at full height, minutes implied (1:48.7 shows 48.7).',
    layout: { main: { field: 'lapTime', color: 'lapType' }, secondary: NO_SECONDARY, ...NO_HOLD },
  },
  {
    id: 'deltaOverTime',
    label: 'Delta + time',
    description: 'Delta on top, lap time underneath. Two lines need the 3×3 sign to read at 50 m.',
    layout: {
      main: { field: 'delta', color: 'lapType' },
      secondary: { field: 'lapTime', color: WHITE, size: 'half' },
      ...NO_HOLD,
    },
  },
  {
    id: 'timeOverDelta',
    label: 'Time + delta',
    description: 'Lap time on top, delta underneath. Two lines need the 3×3 sign to read at 50 m.',
    layout: {
      main: { field: 'lapTime', color: WHITE },
      secondary: { field: 'delta', color: 'lapType', size: 'half' },
      ...NO_HOLD,
    },
  },
  {
    id: 'deltaDriver',
    label: 'Delta + driver',
    description: 'Delta with a driver and lap number strip underneath.',
    layout: {
      main: { field: 'delta', color: 'lapType' },
      secondary: { field: 'driverLap', color: [160, 160, 160], size: 'strip' },
      ...NO_HOLD,
    },
  },
  {
    id: 'countdown',
    label: 'Countdown',
    description: 'Delta for 8 s after each lap, then a live countdown to the target.',
    layout: {
      main: { field: 'countdown', color: 'lapType' },
      secondary: NO_SECONDARY,
      holdField: 'delta',
      holdSec: 8,
    },
  },
];

export interface LedSignConfig {
  /** Panel brightness 1–255 (the firmware also caps it, see MAX_BRIGHTNESS). */
  brightness: number;
  /** Which preset the layout came from, or 'custom' once edited. */
  preset: LedSignPresetId | 'custom';
  layout: LedSignLayout;
  /** Decimal places on deltas and lap times (1 or 2). */
  decimals: 1 | 2;
  colors: Record<LapType, Rgb>;
  /** Broken laps: solid board in the broken colour, black digits (heavy on power). */
  fillOnBroken: boolean;
  /** Flash safety-car laps at 2 Hz. */
  flashSafety: boolean;
  /** Rotate the image 180° (sign mounted upside down). */
  flip: boolean;
  /** Max estimated draw in watts — the sign dims itself to stay under it (0 = no limit). */
  powerBudgetW: number;
  /**
   * Eco, while the stopwatch runs: show the digits for this long after each lap,
   * dark otherwise (0 = always lit).
   */
  ecoAfterSec: number;
  /** Eco: also light up this long before the car is due (0 = off). */
  ecoLeadSec: number;
  /** Some regularity formats ban red on pit boards; when false red is replaced by orange. */
  allowRed: boolean;
}

export const LED_ORANGE: Rgb = [255, 80, 0];

/** Pure-ish red (as opposed to orange, amber or magenta). */
export const isRed = ([r, g, b]: Rgb): boolean => r >= 160 && g < 64 && b < 96;

/** Swap any red in the colour table and layout for orange. */
export const withoutRed = (config: LedSignConfig): LedSignConfig => {
  const fix = (c: Rgb): Rgb => (isRed(c) ? LED_ORANGE : c);
  const fixColor = (c: LedSignColor): LedSignColor => (c === 'lapType' ? c : fix(c));
  const colors = Object.fromEntries(Object.entries(config.colors).map(([k, c]) => [k, fix(c)])) as Record<LapType, Rgb>;
  const { layout } = config;
  return {
    ...config,
    colors,
    layout: {
      ...layout,
      main: { ...layout.main, color: fixColor(layout.main.color) },
      secondary: { ...layout.secondary, color: fixColor(layout.secondary.color) },
    },
  };
};

export const DEFAULT_LED_SIGN_CONFIG: LedSignConfig = {
  brightness: 192,
  preset: 'delta',
  layout: LED_SIGN_PRESETS[0].layout,
  decimals: 1,
  colors: {
    bonus: [0, 255, 0],
    // No red by default (banned in some formats); broken laps also show a minus sign.
    base: [255, 220, 0],
    broken: LED_ORANGE,
    changeover: [0, 120, 255],
    safety: [255, 255, 255],
  },
  fillOnBroken: false,
  flashSafety: true,
  flip: false,
  powerBudgetW: 22,
  ecoAfterSec: 15,
  ecoLeadSec: 0,
  allowRed: false,
};

const FLAG_FILL_ON_BROKEN = 1 << 0;
const FLAG_FLIP = 1 << 1;
const FLAG_FLASH_SAFETY = 1 << 2;

const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

// ---- Field text (the firmware renders exactly the same strings) ----

/** Up to 3 ASCII initials for the sign: "Driver A" → "DA", "Sam" → "SAM". */
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

/** "+0.4": explicit sign, truncated (not rounded) so a 0.96 s bonus lap never reads "+1.0". */
export const formatSignDelta = (deltaSec: number, decimals: 1 | 2): string => {
  const ms = Math.round(deltaSec * 1000);
  const abs = Math.abs(ms);
  const unit = decimals === 1 ? 100 : 10;
  const frac = Math.floor((abs % 1000) / unit);
  return `${ms < 0 ? '-' : '+'}${Math.floor(abs / 1000)}.${String(frac).padStart(decimals, '0')}`;
};

/**
 * Lap time, truncated. Minutes implied: 108.74 → "48.7" (seconds always two
 * digits, so 1:01.3 → "01.3"). Full: "1:48.7", or "48.7" under a minute.
 */
export const formatSignTime = (sec: number, decimals: 1 | 2, impliedMinutes: boolean): string => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const unit = decimals === 1 ? 100 : 10;
  const frac = String(Math.floor((ms % 1000) / unit)).padStart(decimals, '0');
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor(ms / 1000) % 60;
  if (impliedMinutes) return `${String(secs).padStart(2, '0')}.${frac}`;
  return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}.${frac}` : `${secs}.${frac}`;
};

/** Live countdown: "1:05", "45", "9.4" while counting down; "+0.3" once past target. */
export const formatSignCountdown = (remainingSec: number): string => {
  const ms = Math.round(remainingSec * 1000);
  if (ms <= 0) return formatSignDelta(-ms / 1000, 1);
  if (ms >= 60000) return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  if (ms >= 10000) return String(Math.floor(ms / 1000));
  return `${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`;
};

export interface LedSignFieldData {
  lap?: { deltaSec: number; timeSec: number; number: number; driverName: string };
  targetSec: number;
  /** Running lap clock, for the live fields. */
  elapsedSec?: number;
}

/** The text a field shows; '' when there's nothing to show yet. */
export const signFieldText = (field: LedSignField, data: LedSignFieldData, decimals: 1 | 2): string => {
  const { lap } = data;
  switch (field) {
    case 'delta':
      return lap ? formatSignDelta(lap.deltaSec, decimals) : '';
    case 'lapTime':
      return lap ? formatSignTime(lap.timeSec, decimals, true) : '';
    case 'lapTimeFull':
      return lap ? formatSignTime(lap.timeSec, decimals, false) : '';
    case 'countdown':
      return data.elapsedSec == null ? '' : formatSignCountdown(data.targetSec - data.elapsedSec);
    case 'elapsed':
      return data.elapsedSec == null ? '' : formatSignTime(data.elapsedSec, 1, true);
    case 'lapNumber':
      return lap ? `L${lap.number}` : '';
    case 'driver':
      return lap ? driverInitials(lap.driverName) : '';
    case 'driverLap':
      return lap ? `${driverInitials(lap.driverName)} L${lap.number}`.trim() : '';
    case 'target':
      return data.targetSec > 0 ? formatSignTime(data.targetSec, decimals, true) : '';
    default:
      return '';
  }
};

// ---- Packets ----

export interface LedSignLap {
  lapType: LapType;
  lapNumber: number;
  deltaSec: number;
  timeSec: number;
  targetSec: number;
  driverName: string;
}

/** [0x01, lapType, lapNumber u16, deltaMs i32, targetMs u32, initials×3, timeMs u32] — 19 bytes. */
export const encodeLapPacket = (lap: LedSignLap): Uint8Array => {
  const buf = new Uint8Array(19);
  const view = new DataView(buf.buffer);
  buf[0] = LedSignOp.Lap;
  buf[1] = Math.max(0, LED_SIGN_LAP_TYPES.indexOf(lap.lapType));
  view.setUint16(2, clampInt(lap.lapNumber, 0, 0xffff), true);
  view.setInt32(4, clampInt(lap.deltaSec * 1000, -0x7fffffff, 0x7fffffff), true);
  view.setUint32(8, clampInt(lap.targetSec * 1000, 0, 0xffffffff), true);
  const initials = driverInitials(lap.driverName).padEnd(3, ' ');
  for (let i = 0; i < 3; i++) buf[12 + i] = initials.charCodeAt(i);
  view.setUint32(15, clampInt(lap.timeSec * 1000, 0, 0xffffffff), true);
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

/** [0x03, brightness, reserved, decimals, flags, rgb×5] — 20 bytes. */
export const encodeConfigPacket = (config: LedSignConfig): Uint8Array => {
  const buf = new Uint8Array(20);
  buf[0] = LedSignOp.Config;
  buf[1] = clampInt(config.brightness, 1, 255);
  buf[2] = 0;
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

const fieldCode = (f: LedSignField) => Math.max(0, LED_SIGN_FIELDS.indexOf(f));
const writeColor = (buf: Uint8Array, at: number, color: LedSignColor) => {
  buf[at] = color === 'lapType' ? 0 : 1;
  const rgb = color === 'lapType' ? WHITE : color;
  for (let i = 0; i < 3; i++) buf[at + 1 + i] = clampInt(rgb[i], 0, 255);
};

/**
 * [0x06, mainField, mainColorMode, rgb, secField, secColorMode, rgb, secSize,
 * holdField, holdSec] — 14 bytes. Colour mode 0 = by lap type, 1 = fixed rgb.
 */
export const encodeLayoutPacket = (layout: LedSignLayout): Uint8Array => {
  const buf = new Uint8Array(14);
  buf[0] = LedSignOp.Layout;
  buf[1] = fieldCode(layout.main.field);
  writeColor(buf, 2, layout.main.color);
  buf[6] = fieldCode(layout.secondary.field);
  writeColor(buf, 7, layout.secondary.color);
  buf[11] = Math.max(0, SECONDARY_SIZES.indexOf(layout.secondary.size));
  buf[12] = fieldCode(layout.holdField);
  buf[13] = clampInt(layout.holdSec, 0, 255);
  return buf;
};

/** [0x07, budgetW u16, ecoLeadSec u8, ecoAfterSec u8] — 5 bytes. 0 = no limit / off. */
export const encodePowerPacket = (budgetW: number, ecoLeadSec: number, ecoAfterSec: number): Uint8Array => {
  const buf = new Uint8Array(5);
  buf[0] = LedSignOp.Power;
  new DataView(buf.buffer).setUint16(1, clampInt(budgetW, 0, 0xffff), true);
  buf[3] = clampInt(ecoLeadSec, 0, 255);
  buf[4] = clampInt(ecoAfterSec, 0, 255);
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
