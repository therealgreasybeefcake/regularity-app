import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LED_SIGN_CONFIG,
  LedSignOp,
  bytesToBase64,
  driverInitials,
  encodeConfigPacket,
  encodeLapPacket,
  encodeLayoutPacket,
  encodePowerPacket,
  encodeTimerPacket,
  formatSignCountdown,
  formatSignDelta,
  formatSignTime,
  LED_ORANGE,
  LED_SIGN_PRESETS,
  isRed,
  signFieldText,
  withoutRed,
  type Rgb,
} from './ledSign';

describe('formatSignDelta', () => {
  it('always shows an explicit sign', () => {
    expect(formatSignDelta(0.42, 1)).toBe('+0.4');
    expect(formatSignDelta(-0.42, 1)).toBe('-0.4');
    expect(formatSignDelta(0, 2)).toBe('+0.00');
  });

  it('truncates rather than rounds, so a bonus lap never reads +1.0', () => {
    expect(formatSignDelta(0.96, 1)).toBe('+0.9');
    expect(formatSignDelta(0.999, 2)).toBe('+0.99');
  });

  it('handles multi-second deltas and float noise', () => {
    expect(formatSignDelta(12.345, 2)).toBe('+12.34');
    expect(formatSignDelta(-3.1, 1)).toBe('-3.1');
    expect(formatSignDelta(0.3 - 0.1, 1)).toBe('+0.2');
  });
});

describe('formatSignTime', () => {
  it('implies the minutes: 1:48.7 shows 48.7', () => {
    expect(formatSignTime(108.74, 1, true)).toBe('48.7');
    expect(formatSignTime(108.74, 2, true)).toBe('48.74');
    expect(formatSignTime(61.3, 1, true)).toBe('01.3');
  });

  it('shows minutes in full mode, and truncates', () => {
    expect(formatSignTime(108.79, 1, false)).toBe('1:48.7');
    expect(formatSignTime(48.7, 1, false)).toBe('48.7');
    expect(formatSignTime(600.05, 2, false)).toBe('10:00.05');
  });
});

describe('formatSignCountdown', () => {
  it('switches format as it counts down, then counts up past target', () => {
    expect(formatSignCountdown(65.4)).toBe('1:05');
    expect(formatSignCountdown(45.9)).toBe('45');
    expect(formatSignCountdown(9.48)).toBe('9.4');
    expect(formatSignCountdown(-0.32)).toBe('+0.3');
  });
});

describe('signFieldText', () => {
  const data = { lap: { deltaSec: 0.42, timeSec: 108.74, number: 12, driverName: 'Driver A' }, targetSec: 108.32, elapsedSec: 100 };
  it('renders every field', () => {
    expect(signFieldText('delta', data, 1)).toBe('+0.4');
    expect(signFieldText('lapTime', data, 1)).toBe('48.7');
    expect(signFieldText('lapTimeFull', data, 1)).toBe('1:48.7');
    expect(signFieldText('countdown', data, 1)).toBe('8.3');
    expect(signFieldText('elapsed', data, 1)).toBe('40.0');
    expect(signFieldText('lapNumber', data, 1)).toBe('L12');
    expect(signFieldText('driverLap', data, 1)).toBe('DA L12');
    expect(signFieldText('target', data, 2)).toBe('48.32');
    expect(signFieldText('none', data, 1)).toBe('');
  });

  it('is empty before the first lap', () => {
    expect(signFieldText('delta', { targetSec: 90 }, 1)).toBe('');
    expect(signFieldText('countdown', { targetSec: 90 }, 1)).toBe('');
  });
});

describe('driverInitials', () => {
  it('takes word initials, or the first three letters of one word', () => {
    expect(driverInitials('Driver A')).toBe('DA');
    expect(driverInitials('Sam')).toBe('SAM');
    expect(driverInitials('Anna Maria van Dijk')).toBe('AMV');
  });

  it('strips accents and symbols, and copes with empty names', () => {
    expect(driverInitials('Zoë Ölund')).toBe('ZO');
    expect(driverInitials('  ')).toBe('');
  });
});

describe('encodeLapPacket', () => {
  it('lays out a 19-byte little-endian packet', () => {
    const p = encodeLapPacket({ lapType: 'broken', lapNumber: 300, deltaSec: -0.42, timeSec: 92.08, targetSec: 92.5, driverName: 'Driver A' });
    const v = new DataView(p.buffer);
    expect(p.length).toBe(19);
    expect(p[0]).toBe(LedSignOp.Lap);
    expect(p[1]).toBe(2); // broken
    expect(v.getUint16(2, true)).toBe(300);
    expect(v.getInt32(4, true)).toBe(-420);
    expect(v.getUint32(8, true)).toBe(92500);
    expect(String.fromCharCode(p[12], p[13], p[14])).toBe('DA ');
    expect(v.getUint32(15, true)).toBe(92080);
  });
});

describe('encodeTimerPacket', () => {
  it('encodes running state, elapsed and target', () => {
    const p = encodeTimerPacket(true, 61234.4, 105);
    const v = new DataView(p.buffer);
    expect(p.length).toBe(10);
    expect([p[0], p[1]]).toEqual([LedSignOp.Timer, 1]);
    expect(v.getUint32(2, true)).toBe(61234);
    expect(v.getUint32(6, true)).toBe(105000);
  });
});

describe('encodeConfigPacket', () => {
  it('fits in one 20-byte write with flags and the colour table', () => {
    const p = encodeConfigPacket({ ...DEFAULT_LED_SIGN_CONFIG, decimals: 2, fillOnBroken: true, flip: true, flashSafety: false });
    expect(p.length).toBe(20);
    expect([p[0], p[1], p[2], p[3], p[4]]).toEqual([LedSignOp.Config, 192, 0, 2, 0b011]);
    expect(Array.from(p.slice(5, 8))).toEqual([0, 255, 0]); // bonus
    expect(Array.from(p.slice(17, 20))).toEqual([255, 255, 255]); // safety
  });

  it('clamps brightness into 1–255', () => {
    expect(encodeConfigPacket({ ...DEFAULT_LED_SIGN_CONFIG, brightness: 0 })[1]).toBe(1);
    expect(encodeConfigPacket({ ...DEFAULT_LED_SIGN_CONFIG, brightness: 999 })[1]).toBe(255);
  });
});

describe('encodeLayoutPacket', () => {
  it('encodes fields, colour modes, size and hold', () => {
    const countdown = LED_SIGN_PRESETS.find((p) => p.id === 'countdown')!.layout;
    expect(Array.from(encodeLayoutPacket(countdown))).toEqual([
      LedSignOp.Layout, 4, 0, 255, 255, 255, 0, 1, 255, 255, 255, 0, 1, 8,
    ]);
    const timeOverDelta = LED_SIGN_PRESETS.find((p) => p.id === 'timeOverDelta')!.layout;
    expect(Array.from(encodeLayoutPacket(timeOverDelta))).toEqual([
      LedSignOp.Layout, 2, 1, 255, 255, 255, 1, 0, 255, 255, 255, 2, 1, 0,
    ]);
  });
});

describe('encodePowerPacket', () => {
  it('encodes the budget as u16 watts, then the eco lead and after-lap times', () => {
    expect(Array.from(encodePowerPacket(24, 0, 15))).toEqual([LedSignOp.Power, 24, 0, 0, 15]);
    expect(Array.from(encodePowerPacket(300, 10, 0))).toEqual([LedSignOp.Power, 44, 1, 10, 0]);
  });
});

describe('withoutRed', () => {
  it('has no red in the defaults', () => {
    expect(Object.values(DEFAULT_LED_SIGN_CONFIG.colors).some(isRed)).toBe(false);
  });

  it('swaps red for orange in the colour table and fixed layout colours, leaving the rest', () => {
    const config = {
      ...DEFAULT_LED_SIGN_CONFIG,
      colors: { ...DEFAULT_LED_SIGN_CONFIG.colors, broken: [255, 0, 0] as Rgb, base: [255, 0, 255] as Rgb },
      layout: { ...DEFAULT_LED_SIGN_CONFIG.layout, main: { field: 'delta' as const, color: [220, 20, 20] as Rgb } },
    };
    const fixed = withoutRed(config);
    expect(fixed.colors.broken).toEqual(LED_ORANGE);
    expect(fixed.colors.base).toEqual([255, 0, 255]); // magenta isn't red
    expect(fixed.layout.main.color).toEqual(LED_ORANGE);
  });
});

describe('bytesToBase64', () => {
  it('matches standard base64 including padding', () => {
    expect(bytesToBase64(Uint8Array.of())).toBe('');
    expect(bytesToBase64(Uint8Array.of(0x01))).toBe('AQ==');
    expect(bytesToBase64(Uint8Array.of(0x01, 0x02))).toBe('AQI=');
    expect(bytesToBase64(Uint8Array.of(0xff, 0x00, 0x7f, 0x10))).toBe('/wB/EA==');
  });
});
