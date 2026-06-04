import { describe, it, expect } from 'vitest';
import {
  calculateConsistency,
  segmentStints,
  detectOutliers,
  analyzePaceTrend,
  rollingDeltaAverage,
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
