import type { Driver, LapTypeValues, Session, TeamStats } from './types';
import { calculateTeamStats } from './calculations';

/** AROCA 10 Hour Relay: Goal Laps are scored over 36000 seconds (regs 6.1). */
export const DEFAULT_EVENT_MINUTES = 600;

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();
const lapCount = (s: Session) => s.drivers.reduce((sum, d) => sum + d.laps.length, 0);

/** Same race, same session number, ended within this window = two copies of one session. */
const SAME_SESSION_WINDOW_MS = 10 * 60 * 1000;

/**
 * Collapse copies of the same ended session. A session ended on a device is kept
 * both in local history (device id) and on the server (live-session id), so the
 * ids differ; they match on race + session number + end time. The copy with more
 * laps wins (ties keep the earlier entry, so pass the preferred source first).
 */
export function dedupeSessions(sessions: Session[]): Session[] {
  const kept: Session[] = [];
  for (const s of sessions) {
    const i = kept.findIndex(
      (k) =>
        norm(k.raceName) === norm(s.raceName) &&
        norm(k.sessionNumber) === norm(s.sessionNumber) &&
        Math.abs(k.timestamp - s.timestamp) <= SAME_SESSION_WINDOW_MS,
    );
    if (i === -1) kept.push(s);
    else if (lapCount(s) > lapCount(kept[i])) kept[i] = s;
  }
  return kept;
}

/**
 * Pool every session's drivers into one roster for the whole event: drivers are
 * matched by name, laps concatenated (each keeps the type/value it was scored
 * with), penalty laps summed, and the most recent session's nominated time used.
 */
export function poolEventDrivers(sessions: Session[]): Driver[] {
  const ordered = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
  const byName = new Map<string, Driver>();
  for (const s of ordered) {
    for (const d of s.drivers) {
      const key = norm(d.name);
      const cur = byName.get(key);
      if (!cur) {
        byName.set(key, { ...d, id: byName.size + 1, laps: [...d.laps] });
      } else {
        cur.laps = [...cur.laps, ...d.laps];
        cur.penaltyLaps += d.penaltyLaps;
        if (d.targetTime > 0) cur.targetTime = d.targetTime;
      }
    }
  }
  return Array.from(byName.values());
}

export interface EventTotals extends TeamStats {
  drivers: Driver[];
  sessionCount: number;
  lapCount: number;
}

/**
 * Score a whole event the official way: one Goal Laps calculation over all of the
 * team's laps and the full event length, not a sum of per-session results.
 */
export function calculateEventStats(
  sessions: Session[],
  lapTypeValues: LapTypeValues,
  eventMinutes = DEFAULT_EVENT_MINUTES,
): EventTotals {
  const drivers = poolEventDrivers(sessions);
  const stats = calculateTeamStats(
    { id: 0, name: '', raceName: '', sessionNumber: '', sessionDuration: eventMinutes, drivers, sessionHistory: [] },
    lapTypeValues,
  );
  return {
    ...stats,
    drivers,
    sessionCount: sessions.length,
    lapCount: drivers.reduce((sum, d) => sum + d.laps.length, 0),
  };
}
