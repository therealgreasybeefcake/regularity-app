import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { api, ApiError } from './api';

/**
 * Durable, offline-first mutation queue. Mutations are persisted to AsyncStorage
 * so they survive app kills, and drained FIFO whenever connectivity is likely
 * (on enqueue, on app foreground, and on a slow retry timer). Connectivity is
 * detected implicitly: a network failure pauses the drain; a 4xx drops the op as
 * permanently bad. Avoids a native NetInfo dependency (no extra native rebuild).
 */

export type SyncOp =
  | { kind: 'putTeam'; teamId: string; payload: unknown }
  // Granular, id-keyed roster ops (concurrent-editor safe — no full-roster replace).
  | { kind: 'patchTeamSettings'; teamId: string; payload: unknown }
  | { kind: 'createDriver'; teamId: string; driverId: string; payload: unknown }
  | { kind: 'patchDriver'; driverId: string; payload: unknown }
  | { kind: 'deleteDriver'; driverId: string }
  | { kind: 'completeSession'; teamId: string; payload: unknown }
  | { kind: 'startSession'; teamId: string; payload: unknown }
  | { kind: 'appendLap'; sessionId: string; payload: unknown }
  | { kind: 'endSession'; sessionId: string }
  | { kind: 'deleteSession'; sessionId: string };

interface QueueItem {
  id: string;
  op: SyncOp;
  attempts: number;
}

export type SyncState = 'idle' | 'syncing' | 'pending' | 'error';

const STORAGE_KEY = 'regularitySyncQueue';
const RETRY_MS = 20000;

class SyncQueue {
  private items: QueueItem[] = [];
  private loaded = false;
  private draining = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(state: SyncState, pending: number) => void>();
  private droppedListeners = new Set<(op: SyncOp, status: number) => void>();
  private lastState: SyncState = 'idle';

  async init() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) this.items = JSON.parse(raw);
    } catch {
      this.items = [];
    }
    AppState.addEventListener('change', (s) => {
      if (s === 'active') this.drain();
    });
    this.ensureTimer();
    this.drain();
  }

  subscribe(fn: (state: SyncState, pending: number) => void): () => void {
    this.listeners.add(fn);
    fn(this.lastState, this.items.length);
    return () => this.listeners.delete(fn);
  }

  /** Notify when a 4xx permanently drops an op (lets callers react to poison ops). */
  onDropped(fn: (op: SyncOp, status: number) => void): () => void {
    this.droppedListeners.add(fn);
    return () => this.droppedListeners.delete(fn);
  }

  /** True while a startSession op for this session is still queued (offline start). */
  hasPendingStart(sessionId: string): boolean {
    return this.items.some(
      (i) => i.op.kind === 'startSession' && (i.op.payload as { id?: string })?.id === sessionId,
    );
  }

  get pending() {
    return this.items.length;
  }

  private emit(state: SyncState) {
    this.lastState = state;
    for (const fn of this.listeners) fn(state, this.items.length);
  }

  private ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.items.length) this.drain();
    }, RETRY_MS);
  }

  private async persist() {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch {
      // best effort
    }
  }

  async enqueue(op: SyncOp) {
    // Collapse repeated full-team pushes — only the latest matters.
    if (op.kind === 'putTeam') {
      this.items = this.items.filter(
        (i) => !(i.op.kind === 'putTeam' && i.op.teamId === op.teamId),
      );
    }
    // Collapse repeated settings patches / per-driver patches — latest wins.
    if (op.kind === 'patchTeamSettings') {
      this.items = this.items.filter(
        (i) => !(i.op.kind === 'patchTeamSettings' && i.op.teamId === op.teamId),
      );
    }
    if (op.kind === 'patchDriver') {
      this.items = this.items.filter(
        (i) => !(i.op.kind === 'patchDriver' && i.op.driverId === op.driverId),
      );
    }
    this.items.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      op,
      attempts: 0,
    });
    await this.persist();
    this.emit('pending');
    this.drain();
  }

  async drain() {
    if (this.draining || this.items.length === 0) return;
    this.draining = true;
    this.emit('syncing');
    try {
      while (this.items.length) {
        const item = this.items[0];
        try {
          await this.run(item.op);
          this.items.shift();
          await this.persist();
        } catch (e) {
          if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
            // Permanently bad request — drop it so the queue can progress.
            console.warn('[sync] dropping permanently-failed op', item.op.kind, e.status);
            this.items.shift();
            await this.persist();
            for (const fn of this.droppedListeners) {
              try {
                fn(item.op, e.status);
              } catch {
                /* listener errors must not break the drain */
              }
            }
          } else {
            // Transient (offline / 5xx) — stop and retry later.
            item.attempts += 1;
            this.emit(this.items.length ? 'pending' : 'idle');
            return;
          }
        }
      }
      this.emit('idle');
    } finally {
      this.draining = false;
    }
  }

  private async run(op: SyncOp) {
    switch (op.kind) {
      case 'putTeam':
        await api.put(`/api/teams/${op.teamId}`, op.payload);
        break;
      case 'patchTeamSettings':
        await api.patch(`/api/teams/${op.teamId}`, op.payload);
        break;
      case 'createDriver':
        await api.post(`/api/teams/${op.teamId}/drivers`, op.payload);
        break;
      case 'patchDriver':
        await api.patch(`/api/drivers/${op.driverId}`, op.payload);
        break;
      case 'deleteDriver':
        await api.del(`/api/drivers/${op.driverId}`);
        break;
      case 'completeSession':
        await api.post(`/api/teams/${op.teamId}/sessions/complete`, op.payload);
        break;
      case 'startSession':
        await api.post(`/api/teams/${op.teamId}/sessions`, op.payload);
        break;
      case 'appendLap':
        await api.post(`/api/sessions/${op.sessionId}/laps`, op.payload);
        break;
      case 'endSession':
        await api.post(`/api/sessions/${op.sessionId}/end`);
        break;
      case 'deleteSession':
        await api.del(`/api/sessions/${op.sessionId}`);
        break;
    }
  }
}

export const syncQueue = new SyncQueue();
