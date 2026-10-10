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

  it('leaves changeover and safety-car laps out of the averages', () => {
    const withAnomalies: Driver = {
      ...driver,
      laps: [
        ...driver.laps,
        lap({ number: 4, time: 160, delta: 60, lapType: 'changeover' }),
        lap({ number: 5, time: 140, delta: 40, lapType: 'safety' }),
      ],
    };
    const s = calculateDriverStats(withAnomalies, lapTypeValues, [withAnomalies], 120);
    // Only laps 1-3 count: deltas 0.4, 1.0, -0.5 and times 100.4, 101, 99.5.
    expect(s.averageDelta).toBeCloseTo(0.3, 10);
    expect(s.averageLapTime).toBeCloseTo(100.3, 10);
    // ...but they still score and still count toward the share.
    expect(s.changeoverLaps).toBe(1);
    expect(s.safetyLaps).toBe(1);
    expect(s.achievedLaps).toBe(3); // 2 + 1 + 0 + 1 + 0 - 1 penalty
  });

  it('averages to 0 when every lap is a changeover or safety lap', () => {
    const onlyAnomalies: Driver = {
      ...driver,
      laps: [lap({ number: 1, time: 160, delta: 60, lapType: 'changeover' })],
    };
    const s = calculateDriverStats(onlyAnomalies, lapTypeValues, [onlyAnomalies], 120);
    expect(s.averageDelta).toBe(0);
    expect(s.averageLapTime).toBe(0);
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

describe('AROCA 10 Hour Regularity Relay worked example (regs 6.1)', () => {
  // The regs' example team. "Base Laps" there are every completed lap; bonus and
  // broken laps are subsets of them, plus one changeover lap each. (The printed
  // table lists driver C with 2 bonus laps, but its row/column totals only add
  // up with 3.) Team penalty: 7 laps.
  const rows = [
    { name: 'A', target: 102, base: 75, bonus: 23, broken: 2 },
    { name: 'B', target: 102, base: 67, bonus: 22, broken: 5 },
    { name: 'C', target: 106, base: 47, bonus: 3, broken: 0 },
    { name: 'D', target: 110, base: 55, bonus: 23, broken: 8 },
    { name: 'E', target: 111, base: 53, bonus: 17, broken: 2 },
  ];
  const drivers: Driver[] = rows.map((r, i) => {
    const types: Lap['lapType'][] = [
      ...Array<Lap['lapType']>(r.bonus).fill('bonus'),
      ...Array<Lap['lapType']>(r.broken).fill('broken'),
      ...Array<Lap['lapType']>(r.base - r.bonus - r.broken).fill('base'),
      'changeover',
    ];
    return {
      id: i + 1,
      name: r.name,
      targetTime: r.target,
      penaltyLaps: i === 0 ? 7 : 0,
      laps: types.map((t, n) => lap({ number: n + 1, time: r.target, delta: 0, lapType: t })),
    };
  });
  const team = { id: 1, name: 'Example', drivers, sessionDuration: 600, sessionHistory: [] } as unknown as Team;

  it('shares goal laps by every completed lap (base + bonus + broken + changeover)', () => {
    const a = calculateDriverStats(drivers[0], lapTypeValues, drivers, 600);
    // A: 76 of the team's 302 laps x 36000s / 102s, doubled = 2 x 88.8196
    expect(a.goalLaps).toBeCloseTo(2 * 88.8196, 3);
  });

  it('matches the example team totals', () => {
    const s = calculateTeamStats(team, lapTypeValues);
    expect(s.achievedLaps).toBe(366);
    // Regs: theoretical maxima sum to 340.95 (printed "341"), doubled = 682.
    expect(s.goalLaps).toBeCloseTo(681.895, 2);
    // Regs print 366 / 682 = 53.6657% using the rounded goal.
    expect((s.achievedLaps / Math.round(s.goalLaps)) * 100).toBeCloseTo(53.6657, 4);
  });
});
