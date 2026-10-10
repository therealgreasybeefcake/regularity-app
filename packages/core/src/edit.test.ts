import { describe, it, expect } from 'vitest';
import { editDriverLap, editSessionLap } from './edit';
import type { Driver, Lap, LapTypeValues, Session } from './types';

const ltv: LapTypeValues = { bonus: 2, base: 1, changeover: 1, broken: 0, safety: 1 };

const lap = (number: number, time: number, lapType: Lap['lapType'], timestamp: number): Lap => ({
  number, time, delta: time - 100, lapType, lapValue: ltv[lapType], timestamp,
});

const driver: Driver = {
  id: 1,
  name: 'Alex',
  targetTime: 100,
  penaltyLaps: 0,
  laps: [lap(1, 100.5, 'bonus', 1000), lap(2, 101.5, 'base', 2000), lap(3, 99.5, 'broken', 3000)],
};

describe('editDriverLap', () => {
  it('re-times a lap and recomputes delta, type and value', () => {
    const d = editDriverLap(driver, 2000, { kind: 'time', time: 100.2 }, ltv)!;
    expect(d.laps[1]).toMatchObject({ number: 2, time: 100.2, lapType: 'bonus', lapValue: 2 });
    expect(d.laps[1].delta).toBeCloseTo(0.2, 10);
    expect(driver.laps[1].time).toBe(101.5); // input untouched
  });

  it('keeps a changeover a changeover when re-timed', () => {
    const co = { ...driver, laps: [lap(1, 160, 'changeover', 1000)] };
    const d = editDriverLap(co, 1000, { kind: 'time', time: 150 }, ltv)!;
    expect(d.laps[0]).toMatchObject({ time: 150, lapType: 'changeover', lapValue: 1 });
  });

  it('marks and unmarks a changeover', () => {
    const marked = editDriverLap(driver, 3000, { kind: 'toggle', lapType: 'changeover' }, ltv)!;
    expect(marked.laps[2]).toMatchObject({ lapType: 'changeover', lapValue: 1 });
    const cleared = editDriverLap(marked, 3000, { kind: 'toggle', lapType: 'changeover' }, ltv)!;
    expect(cleared.laps[2]).toMatchObject({ lapType: 'broken', lapValue: 0 });
  });

  it('deletes a lap and renumbers the rest', () => {
    const d = editDriverLap(driver, 1000, { kind: 'delete' }, ltv)!;
    expect(d.laps.map((l) => [l.number, l.timestamp])).toEqual([[1, 2000], [2, 3000]]);
  });

  it('returns null for a lap the driver does not have', () => {
    expect(editDriverLap(driver, 999, { kind: 'delete' }, ltv)).toBeNull();
  });
});

describe('editSessionLap', () => {
  const session: Session = {
    id: 's1', raceName: 'Relay', sessionNumber: '1', sessionDuration: 120, timestamp: 0,
    drivers: [driver, { ...driver, id: 2, name: 'Sam', laps: [lap(1, 100.5, 'bonus', 1000)] }],
  };

  it('edits the named driver only, matching the name loosely', () => {
    const s = editSessionLap(session, ' sam ', 1000, { kind: 'delete' }, ltv)!;
    expect(s.drivers[1].laps).toHaveLength(0);
    expect(s.drivers[0].laps).toHaveLength(3);
  });

  it('returns null when the session has no such lap', () => {
    expect(editSessionLap(session, 'Sam', 2000, { kind: 'delete' }, ltv)).toBeNull();
    expect(editSessionLap(session, 'Nobody', 1000, { kind: 'delete' }, ltv)).toBeNull();
  });
});
