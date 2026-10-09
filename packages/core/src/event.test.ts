import { describe, it, expect } from 'vitest';
import { calculateEventStats, dedupeSessions, poolEventDrivers } from './event';
import type { Driver, Lap, LapTypeValues, Session } from './types';

const values: LapTypeValues = { bonus: 2, base: 1, changeover: 1, broken: 0, safety: 0 };
const laps = (types: Lap['lapType'][]): Lap[] =>
  types.map((t, i) => ({ number: i + 1, time: 100, delta: 0, lapType: t, lapValue: values[t], timestamp: i }));
const driver = (name: string, target: number, types: Lap['lapType'][], penaltyLaps = 0): Driver => ({
  id: 1, name, targetTime: target, penaltyLaps, laps: laps(types),
});
const session = (id: string, sessionNumber: string, timestamp: number, drivers: Driver[], raceName = 'Winton 10hr'): Session => ({
  id, raceName, sessionNumber, sessionDuration: 120, timestamp, drivers,
});
const MIN = 60 * 1000;

describe('dedupeSessions', () => {
  it('collapses the device and server copies of one ended session', () => {
    const server = session('server-uuid', '1', 1_000_000, [driver('A', 102, ['base', 'bonus'])]);
    const local = session('1700000000000', '1', 1_000_000 + 2 * MIN, [driver('A', 102, ['base', 'bonus'])]);
    expect(dedupeSessions([server, local])).toEqual([server]);
  });

  it('keeps the copy with more laps', () => {
    const server = session('s', '1', 0, [driver('A', 102, ['base'])]);
    const local = session('l', '1', MIN, [driver('A', 102, ['base', 'bonus'])]);
    expect(dedupeSessions([server, local])).toEqual([local]);
  });

  it('keeps different sessions that reuse a session number hours apart', () => {
    const a = session('a', '1', 0, [driver('A', 102, ['base'])]);
    const b = session('b', '1', 3 * 60 * MIN, [driver('A', 102, ['base'])]);
    expect(dedupeSessions([a, b])).toHaveLength(2);
  });
});

describe('poolEventDrivers', () => {
  it('merges drivers by name across sessions and sums penalties', () => {
    const pooled = poolEventDrivers([
      session('1', '1', 0, [driver('Alice', 102, ['base', 'bonus'], 1), driver('Bob', 110, ['base'])]),
      session('2', '2', 1, [driver('alice ', 102, ['broken']), driver('Bob', 110, ['bonus'], 2)]),
    ]);
    expect(pooled.map((d) => [d.name, d.laps.length, d.penaltyLaps])).toEqual([
      ['Alice', 3, 1],
      ['Bob', 2, 2],
    ]);
  });
});

describe('calculateEventStats', () => {
  it('scores the pooled event over the full event length, not per session', () => {
    // Regs example split across two sessions: driver A 76 laps, others elsewhere.
    const s1 = session('1', '1', 0, [driver('A', 102, Array(38).fill('base')), driver('B', 110, Array(20).fill('base'))]);
    const s2 = session('2', '2', 1, [driver('A', 102, Array(38).fill('base')), driver('B', 110, Array(20).fill('base'))]);
    const ev = calculateEventStats([s1, s2], values, 600);
    // A: 76/116 of the laps, B: 40/116 -> theoretical max over 36000s, doubled.
    const expectedGoal = 2 * ((76 / 116) * 36000 / 102 + (40 / 116) * 36000 / 110);
    expect(ev.goalLaps).toBeCloseTo(expectedGoal, 6);
    expect(ev.achievedLaps).toBe(116);
    expect(ev.sessionCount).toBe(2);
    expect(ev.lapCount).toBe(116);
  });
});
