/**
 * In-memory pub/sub for live-session SSE streams, keyed by a session's
 * public_token. Postgres is the source of truth (laps are persisted before
 * broadcast), so on a server restart every EventSource reconnects and the room
 * is rebuilt from a fresh snapshot — no event is lost. For multi-instance
 * scaling this is the seam to swap for Postgres LISTEN/NOTIFY or Redis pub/sub.
 */

export type LiveEvent =
  | { type: 'snapshot'; session: unknown }
  | { type: 'lap'; lap: unknown }
  | { type: 'lapEdited'; lap: unknown }
  | { type: 'lapDeleted'; lapId: string }
  | { type: 'sessionEnded'; sessionId: string }
  | { type: 'driverChanged'; sessionDriverId: string }
  | { type: 'timer'; timer: TimerState }
  // Authenticated per-team channel (keyed `team:<teamId>`): peers see roster /
  // settings edits, and that a teammate started recording.
  | { type: 'teamChanged' }
  | { type: 'sessionStarted'; publicToken: string; sessionId: string };

/**
 * The recorder's stopwatch, so spectators' clocks stop/reset with the phone.
 * `lapStartedAt` is the epoch ms the current lap started (null after a reset);
 * `stoppedAt` is set while the timer is stopped. Ephemeral by design: after a
 * server restart it is unknown (null) and viewers fall back to the last lap.
 */
export interface TimerState {
  running: boolean;
  lapStartedAt: number | null;
  stoppedAt: number | null;
}

/** Room key for a team's authenticated event channel. */
export const teamRoom = (teamId: string) => `team:${teamId}`;

type Subscriber = (event: LiveEvent, id: number) => void;

class RoomManager {
  private rooms = new Map<string, Set<Subscriber>>();
  private lastId = 0;
  private timers = new Map<string, TimerState>();

  getTimer(publicToken: string): TimerState | null {
    return this.timers.get(publicToken) ?? null;
  }

  setTimer(publicToken: string, timer: TimerState): void {
    this.timers.set(publicToken, timer);
    this.broadcast(publicToken, { type: 'timer', timer });
  }

  clearTimer(publicToken: string): void {
    this.timers.delete(publicToken);
  }

  subscribe(publicToken: string, fn: Subscriber): () => void {
    let set = this.rooms.get(publicToken);
    if (!set) {
      set = new Set();
      this.rooms.set(publicToken, set);
    }
    set.add(fn);
    return () => {
      const s = this.rooms.get(publicToken);
      if (!s) return;
      s.delete(fn);
      if (s.size === 0) this.rooms.delete(publicToken);
    };
  }

  broadcast(publicToken: string, event: LiveEvent): void {
    const set = this.rooms.get(publicToken);
    if (!set || set.size === 0) return;
    const id = ++this.lastId;
    for (const fn of set) {
      try {
        fn(event, id);
      } catch {
        // A broken stream is cleaned up by its own close handler; ignore here.
      }
    }
  }

  subscriberCount(publicToken: string): number {
    return this.rooms.get(publicToken)?.size ?? 0;
  }
}

export const rooms = new RoomManager();
