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
  | { type: 'driverChanged'; sessionDriverId: string };

type Subscriber = (event: LiveEvent, id: number) => void;

class RoomManager {
  private rooms = new Map<string, Set<Subscriber>>();
  private lastId = 0;

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
