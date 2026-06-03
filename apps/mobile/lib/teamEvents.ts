import { API_URL } from '../constants/config';

interface TeamEventHandlers {
  onTeamChanged: () => void;
  onSessionStarted?: (publicToken: string, sessionId: string) => void;
}

/**
 * Subscribe to a team's authenticated SSE channel for near-real-time peer edits.
 * Web only (uses the browser EventSource with credentials); on native there is no
 * EventSource, so AppContext falls back to an AppState-foreground refresh.
 * Returns an unsubscribe function.
 */
export function subscribeTeamEvents(teamId: string, h: TeamEventHandlers): () => void {
  const ES: any = (globalThis as any).EventSource;
  if (typeof ES === 'undefined') return () => {};
  const url = `${API_URL}/api/teams/${encodeURIComponent(teamId)}/events`;
  // withCredentials so the BetterAuth session cookie is sent cross-origin in dev
  // (same-origin in production sends it automatically).
  const es = new ES(url, { withCredentials: true });
  es.addEventListener('teamChanged', () => h.onTeamChanged());
  es.addEventListener('sessionStarted', (e: any) => {
    try {
      const d = JSON.parse(e.data);
      h.onSessionStarted?.(d.publicToken, d.sessionId);
    } catch {
      /* ignore */
    }
  });
  return () => {
    try { es.close(); } catch { /* ignore */ }
  };
}
