import type { Driver, LapTypeValues, Session, TeamStats } from './types';
import { calculateTeamStats } from './calculations';

/** AROCA 10 Hour Relay: Goal Laps are scored over 36000 seconds (regs 6.1). */
export const DEFAULT_EVENT_MINUTES = 600;

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();
const lapCount = (s: Session) => s.drivers.reduce((sum, d) => sum + d.laps.length, 0);

/** Same race, same session number, ended within this window = two copies of one session. */
const SAME_SESSION_WINDOW_MS = 10 * 60 * 1000;

/**
 * Merge the server's ended sessions with this device's local history, collapsing
 * the two copies of one session. A session ended on a device is kept both in local
 * history (device id) and on the server (live-session id), so the ids differ; they
 * match on race + session number + end time. Only a local copy is ever collapsed
 * into a server one — two server sessions (or two local ones) are always separate
 * sessions, even when they share a number and end minutes apart. The copy with
 * more laps wins; ties keep the server copy.
 */
export function dedupeSessions(server: Session[], local: Session[] = []): Session[] {
  const kept = [...server];
  const claimed = new Set<number>();
  for (const s of local) {
    // The nearest-ending unclaimed server session of the same race + number.
    let i = -1;
    for (let idx = 0; idx < server.length; idx++) {
      const k = server[idx];
      const gap = Math.abs(k.timestamp - s.timestamp);
      if (
        claimed.has(idx) ||
        norm(k.raceName) !== norm(s.raceName) ||
        norm(k.sessionNumber) !== norm(s.sessionNumber) ||
        gap > SAME_SESSION_WINDOW_MS
      ) continue;
      if (i === -1 || gap < Math.abs(server[i].timestamp - s.timestamp)) i = idx;
    }
    if (i === -1) {
      kept.push(s);
      continue;
    }
    claimed.add(i);
    if (lapCount(s) > lapCount(kept[i])) kept[i] = s;
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
