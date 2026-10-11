import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LED_SIGN_CONFIG,
  LedSignOp,
  bytesToBase64,
  driverInitials,
  encodeConfigPacket,
  encodeLapPacket,
  encodeTimerPacket,
  formatSignDelta,
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
  it('lays out a 15-byte little-endian packet', () => {
    const p = encodeLapPacket({ lapType: 'broken', lapNumber: 300, deltaSec: -0.42, targetSec: 92.5, driverName: 'Driver A' });
    const v = new DataView(p.buffer);
    expect(p.length).toBe(15);
    expect(p[0]).toBe(LedSignOp.Lap);
    expect(p[1]).toBe(2); // broken
    expect(v.getUint16(2, true)).toBe(300);
    expect(v.getInt32(4, true)).toBe(-420);
    expect(v.getUint32(8, true)).toBe(92500);
    expect(String.fromCharCode(p[12], p[13], p[14])).toBe('DA ');
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
    const p = encodeConfigPacket({ ...DEFAULT_LED_SIGN_CONFIG, mode: 'countdown', decimals: 2, fillOnBroken: true, flip: true, flashSafety: false });
    expect(p.length).toBe(20);
    expect([p[0], p[1], p[2], p[3], p[4]]).toEqual([LedSignOp.Config, 192, 2, 2, 0b011]);
    expect(Array.from(p.slice(5, 8))).toEqual([0, 255, 0]); // bonus
    expect(Array.from(p.slice(17, 20))).toEqual([255, 220, 0]); // safety
  });

  it('clamps brightness into 1–255', () => {
    expect(encodeConfigPacket({ ...DEFAULT_LED_SIGN_CONFIG, brightness: 0 })[1]).toBe(1);
    expect(encodeConfigPacket({ ...DEFAULT_LED_SIGN_CONFIG, brightness: 999 })[1]).toBe(255);
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
