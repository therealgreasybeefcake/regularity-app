import { API_URL } from '../constants/config';

export interface LiveLap {
  number: number;
  time: number;
  delta: number;
  lapType: 'bonus' | 'base' | 'broken' | 'changeover' | 'safety';
  lapValue: number;
  timestamp: number;
}

export interface LiveDriver {
  id: string;
  name: string;
  targetTime: number;
  penaltyLaps: number;
  laps: LiveLap[];
}

export interface LiveSnapshot {
  id: string;
  status: 'live' | 'ended';
  raceName: string;
  sessionNumber: string;
  sessionDurationMin: number;
  publicToken: string;
  startedAt: string;
  endedAt: string | null;
  lapTypeValues: { bonus: number; base: number; changeover: number; broken: number; safety: number };
  drivers: LiveDriver[];
  teamStats: { goalLaps: number; achievedLaps: number; percentageFactor: number };
}

interface Handlers {
  onSnapshot: (s: LiveSnapshot) => void;
  onLap: (lap: any) => void;
  onEnded: () => void;
  onStatus?: (connected: boolean) => void;
}

/** Convert a server lap row (timeSec/recordedAt) to the app Lap shape. */
export function normalizeLap(lap: any): LiveLap & { sessionDriverId: string } {
  return {
    sessionDriverId: lap.sessionDriverId,
    number: lap.number,
    time: lap.timeSec ?? lap.time,
    delta: lap.delta,
    lapType: lap.lapType,
    lapValue: lap.lapValue,
    timestamp: typeof lap.recordedAt === 'string' ? Date.parse(lap.recordedAt) : lap.timestamp ?? Date.now(),
  };
}

/**
 * Subscribe to a live session. Uses SSE where EventSource exists (web), else
 * polls the snapshot endpoint (native). Returns an unsubscribe function.
 */
export function subscribeLive(publicToken: string, h: Handlers): () => void {
  const base = `${API_URL}/api/live/${encodeURIComponent(publicToken)}`;
  const ES: any = (globalThis as any).EventSource;

  if (typeof ES !== 'undefined') {
    const es = new ES(base);
    es.addEventListener('open', () => h.onStatus?.(true));
    es.addEventListener('error', () => h.onStatus?.(false));
    es.addEventListener('snapshot', (e: any) => {
      try {
        h.onSnapshot(JSON.parse(e.data));
        h.onStatus?.(true);
      } catch {
        /* ignore */
      }
    });
    const onLapEvt = (e: any) => {
      try {
        h.onLap(JSON.parse(e.data).lap);
      } catch {
        /* ignore */
      }
    };
    es.addEventListener('lap', onLapEvt);
    es.addEventListener('lapEdited', onLapEvt);
    es.addEventListener('sessionEnded', () => h.onEnded());
    return () => es.close();
  }

  // Native fallback: poll the snapshot.
  let active = true;
  (async () => {
    while (active) {
      try {
        const res = await fetch(`${base}/snapshot`);
        if (res.ok) {
          h.onSnapshot(await res.json());
          h.onStatus?.(true);
        } else {
          h.onStatus?.(false);
        }
      } catch {
        h.onStatus?.(false);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  })();
  return () => {
    active = false;
  };
}
