import { describe, it, expect } from 'vitest';
import {
  calculateConsistency,
  segmentStints,
  detectOutliers,
  analyzePaceTrend,
  rollingDeltaAverage,
  driveTime,
} from './reporting';
import type { Driver, Lap } from './types';

function lap(partial: Partial<Lap> & { number: number; time: number; delta: number; lapType: Lap['lapType'] }): Lap {
  return { lapValue: 0, timestamp: 0, ...partial };
}
function driver(laps: Lap[]): Driver {
  return { id: 1, name: 'A', targetTime: 100, penaltyLaps: 0, laps };
}

describe('calculateConsistency', () => {
  it('excludes changeover/safety and computes stdev of deltas', () => {
    const c = calculateConsistency([
      lap({ number: 1, time: 100.5, delta: 0.5, lapType: 'bonus' }),
      lap({ number: 2, time: 100.5, delta: 0.5, lapType: 'bonus' }),
      lap({ number: 3, time: 110, delta: 10, lapType: 'safety' }), // excluded
      lap({ number: 4, time: 100.5, delta: 0.5, lapType: 'bonus' }),
    ]);
    expect(c.count).toBe(3);
    expect(c.deltaMean).toBeCloseTo(0.5);
    expect(c.deltaStdDev).toBeCloseTo(0); // identical deltas → perfectly consistent
    expect(c.coefficientOfVariation).toBeCloseTo(0);
  });

  it('returns 0 stdev with <2 regular laps', () => {
    expect(calculateConsistency([lap({ number: 1, time: 100, delta: 0, lapType: 'bonus' })]).deltaStdDev).toBe(0);
  });
});

describe('segmentStints', () => {
  it('splits at changeover boundaries (a changeover begins a new stint)', () => {
    const stints = segmentStints(driver([
      lap({ number: 1, time: 100.5, delta: 0.5, lapType: 'bonus' }),
      lap({ number: 2, time: 100.5, delta: 0.5, lapType: 'base' }),
      lap({ number: 3, time: 105, delta: 5, lapType: 'changeover' }),
      lap({ number: 4, time: 100.5, delta: 0.5, lapType: 'bonus' }),
    ]));
    expect(stints.length).toBe(2);
    expect(stints[0].count).toBe(2);
    expect(stints[0].startLapNumber).toBe(1);
    expect(stints[1].count).toBe(2);
    expect(stints[1].startLapNumber).toBe(3);
  });

  it('picks best/worst regular lap by |delta|', () => {
    const [s] = segmentStints(driver([
      lap({ number: 1, time: 100.2, delta: 0.2, lapType: 'bonus' }),
      lap({ number: 2, time: 102, delta: 2, lapType: 'base' }),
    ]));
    expect(s.best?.number).toBe(1);
    expect(s.worst?.number).toBe(2);
  });
});

describe('detectOutliers', () => {
  it('flags a lap beyond N·σ of the mean delta', () => {
    const laps = [
      lap({ number: 1, time: 100.5, delta: 0.5, lapType: 'bonus' }),
      lap({ number: 2, time: 100.5, delta: 0.5, lapType: 'bonus' }),
      lap({ number: 3, time: 100.5, delta: 0.5, lapType: 'bonus' }),
      lap({ number: 4, time: 100.5, delta: 0.5, lapType: 'bonus' }),
      lap({ number: 5, time: 100.5, delta: 0.5, lapType: 'bonus' }),
      lap({ number: 6, time: 105, delta: 5, lapType: 'base' }), // outlier (z = √5 ≈ 2.24)
    ];
    expect(detectOutliers(laps, 2)).toEqual([6]);
  });

  it('returns [] with <3 laps or zero variance', () => {
    expect(detectOutliers([lap({ number: 1, time: 100, delta: 0, lapType: 'bonus' })])).toEqual([]);
    expect(detectOutliers([
      lap({ number: 1, time: 100, delta: 1, lapType: 'base' }),
      lap({ number: 2, time: 100, delta: 1, lapType: 'base' }),
      lap({ number: 3, time: 100, delta: 1, lapType: 'base' }),
    ])).toEqual([]);
  });
});

describe('analyzePaceTrend', () => {
  it('detects improving (faster) when lap times trend down', () => {
    const t = analyzePaceTrend([
      lap({ number: 1, time: 103, delta: 3, lapType: 'base' }),
      lap({ number: 2, time: 102, delta: 2, lapType: 'base' }),
      lap({ number: 3, time: 101, delta: 1, lapType: 'bonus' }),
    ]);
    expect(t.slope).toBeLessThan(0);
    expect(t.direction).toBe('improving');
    expect(t.projectedNext).toBeCloseTo(100, 1);
  });

  it('is steady within the threshold', () => {
    expect(analyzePaceTrend([
      lap({ number: 1, time: 100.5, delta: 0.5, lapType: 'bonus' }),
      lap({ number: 2, time: 100.5, delta: 0.5, lapType: 'bonus' }),
    ]).direction).toBe('steady');
  });
});

describe('rollingDeltaAverage', () => {
  it('computes a trailing-window average', () => {
    const r = rollingDeltaAverage([
      lap({ number: 1, time: 100, delta: 0, lapType: 'bonus' }),
      lap({ number: 2, time: 102, delta: 2, lapType: 'base' }),
      lap({ number: 3, time: 104, delta: 4, lapType: 'base' }),
    ], 2);
    expect(r.map((p) => p.avgDelta)).toEqual([0, 1, 3]);
  });
});

describe('driveTime', () => {
  const at = (timestamp: number, time = 100, lapType: Lap['lapType'] = 'base'): Lap => ({
    number: 1, time, delta: 0, lapType, lapValue: 1, timestamp,
  });
  const drv = (id: number, laps: Lap[]): Driver => ({ id, name: `D${id}`, targetTime: 100, penaltyLaps: 0, laps });

  it('counts every lap when only one driver has driven', () => {
    const drivers = [drv(1, [at(1), at(2), at(3)]), drv(2, [])];
    expect(driveTime(drivers, 0)).toEqual({ stint: 300, total: 300 });
    expect(driveTime(drivers, 1)).toEqual({ stint: 0, total: 0 });
  });

  it('restarts the stint after another driver has driven', () => {
    // A drives 2 laps (the 2nd is A's changeover in-lap), B 3, then A again for 1.
    const drivers = [
      drv(1, [at(1), at(2, 150, 'changeover'), at(6, 90)]),
      drv(2, [at(3), at(4), at(5)]),
    ];
    expect(driveTime(drivers, 0)).toEqual({ stint: 90, total: 340 });
    // B's stint ended when A took back over.
    expect(driveTime(drivers, 1)).toEqual({ stint: 0, total: 300 });
  });

  it('starts a new driver on zero right after the changeover', () => {
    const drivers = [drv(1, [at(1), at(2, 150, 'changeover')]), drv(2, [])];
    expect(driveTime(drivers, 1)).toEqual({ stint: 0, total: 0 });
  });

  it('handles an out-of-range index', () => {
    expect(driveTime([], 3)).toEqual({ stint: 0, total: 0 });
  });
});
