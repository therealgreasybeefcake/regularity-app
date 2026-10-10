import type { Driver, LapTypeValues, Session } from './types';
import { calculateLapType, calculateLapValue } from './calculations';

/** A correction to one recorded lap. */
export type LapEdit =
  | { kind: 'time'; time: number }
  /** Mark the lap as this type, or clear it back to its timed type if it already is. */
  | { kind: 'toggle'; lapType: 'changeover' | 'safety' }
  | { kind: 'delete' };

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Apply `edit` to the driver's lap recorded at `timestamp`, recomputing delta,
 * type and value the same way the Timer does. Deleting renumbers the later laps.
 * Returns a new driver, or null if the driver has no such lap.
 */
export function editDriverLap(
  driver: Driver,
  timestamp: number,
  edit: LapEdit,
  lapTypeValues: LapTypeValues,
): Driver | null {
  const index = driver.laps.findIndex((l) => l.timestamp === timestamp);
  if (index === -1) return null;
  if (edit.kind === 'delete') {
    const laps = driver.laps.filter((_, i) => i !== index).map((l, i) => ({ ...l, number: i + 1 }));
    return { ...driver, laps };
  }
  const lap = driver.laps[index];
  let next = { ...lap };
  if (edit.kind === 'time') {
    const delta = edit.time - driver.targetTime;
    const lapType = calculateLapType(delta, lap.lapType === 'changeover', lap.lapType === 'safety');
    next = { ...next, time: edit.time, delta, lapType };
  } else {
    const lapType = lap.lapType === edit.lapType ? calculateLapType(lap.delta) : edit.lapType;
    next = { ...next, lapType };
  }
  next.lapValue = calculateLapValue(next.lapType, lapTypeValues);
  const laps = [...driver.laps];
  laps[index] = next;
  return { ...driver, laps };
}

/**
 * Apply `edit` to a session's lap, found by driver name and recorded time — the
 * identity a lap keeps across the device's copy of a session and the server's.
 * Returns the edited session, or null if this session doesn't have that lap.
 */
export function editSessionLap(
  session: Session,
  driverName: string,
  timestamp: number,
  edit: LapEdit,
  lapTypeValues: LapTypeValues,
): Session | null {
  let changed = false;
  const drivers = session.drivers.map((d) => {
    if (changed || norm(d.name) !== norm(driverName)) return d;
    const edited = editDriverLap(d, timestamp, edit, lapTypeValues);
    if (!edited) return d;
    changed = true;
    return edited;
  });
  return changed ? { ...session, drivers } : null;
}
