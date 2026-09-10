import { describe, it, expect } from 'vitest';
import {
  parseTimeInput,
  calculateLapType,
  calculateDriverStats,
  calculateTeamStats,
  calculateTrendLine,
} from './calculations';
import type { Driver, Lap, LapTypeValues, Team } from './types';

const lapTypeValues: LapTypeValues = {
  bonus: 2,
  base: 1,
  changeover: 1,
  broken: 0,
  safety: 0,
};

function lap(partial: Partial<Lap> & { time: number; delta: number; lapType: Lap['lapType'] }): Lap {
  return {
    number: 1,
    lapValue: lapTypeValues[partial.lapType],
    timestamp: 0,
    ...partial,
  };
}

describe('parseTimeInput', () => {
  it('returns null for empty / whitespace input', () => {
    expect(parseTimeInput('')).toBeNull();
    expect(parseTimeInput('   ')).toBeNull();
  });

  it('returns null for non-numeric / garbage input (no NaN leak)', () => {
    expect(parseTimeInput('abc')).toBeNull();
    expect(parseTimeInput('90abc')).toBeNull(); // Number() rejects trailing garbage
    expect(parseTimeInput('1:abc')).toBeNull(); // previously silently became 60
  });

  it('returns null for negative values', () => {
    expect(parseTimeInput('-5')).toBeNull();
    expect(parseTimeInput('1:-5')).toBeNull();
  });

  it('parses plain seconds', () => {
    expect(parseTimeInput('90.5')).toBe(90.5);
    expect(parseTimeInput('105')).toBe(105);
  });

  it('parses M:SS.mmm', () => {
    expect(parseTimeInput('1:30.5')).toBe(90.5);
    expect(parseTimeInput('2:00')).toBe(120);
  });

  it('never returns a non-finite number', () => {
    for (const input of ['', ' ', 'abc', '90abc', '1:abc', '-5', '1:-5', 'Infinity']) {
      const r = parseTimeInput(input);
      expect(r === null || Number.isFinite(r)).toBe(true);
    }
  });
});

describe('calculateLapType', () => {
  it('classifies by delta', () => {
    expect(calculateLapType(-0.5)).toBe('broken');
    expect(calculateLapType(0.4)).toBe('bonus');
    expect(calculateLapType(1.5)).toBe('base');
  });
  it('honours manual overrides', () => {
    expect(calculateLapType(0.4, true)).toBe('changeover');
    expect(calculateLapType(0.4, false, true)).toBe('safety');
  });
});

describe('calculateDriverStats', () => {
  const driver: Driver = {
    id: 1,
    name: 'A',
    targetTime: 100,
    penaltyLaps: 1,
    laps: [
      lap({ number: 1, time: 100.4, delta: 0.4, lapType: 'bonus' }),
      lap({ number: 2, time: 101, delta: 1.0, lapType: 'base' }),
      lap({ number: 3, time: 99.5, delta: -0.5, lapType: 'broken' }),
    ],
  };

  it('computes achieved laps minus penalties', () => {
    const s = calculateDriverStats(driver, lapTypeValues, [driver], 120);
    // bonus(2) + base(1) + broken(0) - penalty(1) = 2
    expect(s.achievedLaps).toBe(2);
    expect(s.bonusLaps).toBe(1);
    expect(s.brokenLaps).toBe(1);
    expect(s.netScore).toBe(0);
  });

  it('never produces NaN when targetTime is 0', () => {
    const bad = { ...driver, targetTime: 0 };
    const s = calculateDriverStats(bad, lapTypeValues, [bad], 120);
    expect(Number.isFinite(s.goalLaps)).toBe(true);
    expect(s.goalLaps).toBe(0);
  });

  it('never produces NaN when sessionDuration is 0', () => {
    const s = calculateDriverStats(driver, lapTypeValues, [driver], 0);
    expect(Number.isFinite(s.goalLaps)).toBe(true);
    expect(s.goalLaps).toBe(0);
  });
});

describe('calculateTeamStats', () => {
  it('returns 0 percentageFactor (not NaN/Infinity) when goal laps are 0', () => {
    const team: Team = {
      id: 1,
      name: 'T',
      raceName: 'R',
      sessionNumber: '1',
      sessionDuration: 0, // forces goalLaps = 0
      drivers: [
        {
          id: 1,
          name: 'A',
          targetTime: 100,
          penaltyLaps: 0,
          laps: [lap({ number: 1, time: 100.4, delta: 0.4, lapType: 'bonus' })],
        },
      ],
      sessionHistory: [],
    };
    const s = calculateTeamStats(team, lapTypeValues);
    expect(Number.isFinite(s.percentageFactor)).toBe(true);
    expect(s.percentageFactor).toBe(0);
  });
});

describe('calculateTrendLine', () => {
  it('returns raw times for fewer than 2 laps', () => {
    const laps = [lap({ number: 1, time: 100, delta: 0, lapType: 'base' })];
    expect(calculateTrendLine(laps)).toEqual([100]);
  });
  it('produces a flat line for constant times', () => {
    const laps = [
      lap({ number: 1, time: 100, delta: 0, lapType: 'base' }),
      lap({ number: 2, time: 100, delta: 0, lapType: 'base' }),
      lap({ number: 3, time: 100, delta: 0, lapType: 'base' }),
    ];
    const trend = calculateTrendLine(laps);
    trend.forEach((v) => expect(v).toBeCloseTo(100, 6));
  });
});
