import { API_URL } from '../constants/config';

/**
 * Offset between this device's clock and the API server's (server − local, ms).
 * The recorder's phone and a spectator's browser each sync to the server, so
 * timer timestamps exchanged in server time line up even when the two devices'
 * system clocks disagree. NTP-style: several round trips, keep the sample with
 * the smallest RTT and assume the server stamped it at the midpoint.
 */
let offsetMs = 0;
let inFlight: Promise<void> | null = null;
let lastSyncAt = 0;
const RESYNC_MS = 5 * 60 * 1000;
const SAMPLES = 4;

async function sample(): Promise<{ rtt: number; offset: number } | null> {
  try {
    const t0 = Date.now();
    const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
    const t1 = Date.now();
    if (!res.ok) return null;
    const { ts } = (await res.json()) as { ts?: number };
    if (typeof ts !== 'number') return null;
    return { rtt: t1 - t0, offset: ts - (t0 + t1) / 2 };
  } catch {
    return null;
  }
}

/** Measure the server clock offset (deduped; re-measures at most every 5 min). */
export function syncServerClock(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && lastSyncAt && Date.now() - lastSyncAt < RESYNC_MS) return Promise.resolve();
  inFlight = (async () => {
    let best: { rtt: number; offset: number } | null = null;
    for (let i = 0; i < SAMPLES; i++) {
      const s = await sample();
      if (s && (!best || s.rtt < best.rtt)) best = s;
    }
    if (best) {
      offsetMs = best.offset;
      lastSyncAt = Date.now();
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Convert a local epoch-ms timestamp to server time. */
export const toServerTime = (localMs: number) => localMs + offsetMs;

/** Convert a server epoch-ms timestamp to this device's clock. */
export const toLocalTime = (serverMs: number) => serverMs - offsetMs;
