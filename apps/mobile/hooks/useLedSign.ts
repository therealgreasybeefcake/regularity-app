import { useSyncExternalStore } from 'react';
import { LedSignService, type LedSignState } from '../services/LedSignService';

/** Live LED-sign connection state + settings (re-renders on every change). */
export function useLedSign(): LedSignState {
  return useSyncExternalStore(LedSignService.subscribe, LedSignService.getState, LedSignService.getState);
}
