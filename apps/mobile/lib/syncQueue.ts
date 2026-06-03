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
