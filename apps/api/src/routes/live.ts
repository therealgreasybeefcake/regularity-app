import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { raceSessions, teams } from '@regularity/db';
import { buildSessionPayload } from '../lib/domain';
import { rooms } from '../rooms';

// Public, unauthenticated, read-only spectator stream keyed by public_token.
export const liveRouter = new Hono();

async function loadByToken(token: string) {
  const rows = await db
    .select({ session: raceSessions, team: teams })
    .from(raceSessions)
    .innerJoin(teams, eq(teams.id, raceSessions.teamId))
    .where(eq(raceSessions.publicToken, token))
    .limit(1);
  return rows[0];
}

// One-shot snapshot (used by the native polling fallback where SSE is absent).
liveRouter.get('/:publicToken/snapshot', async (c) => {
  const found = await loadByToken(c.req.param('publicToken'));
  if (!found) return c.json({ error: 'not_found' }, 404);
  const payload = await buildSessionPayload(found.session, found.team.lapTypeValues);
  return c.json(payload);
});

liveRouter.get('/:publicToken', async (c) => {
  const token = c.req.param('publicToken');
  const rows = await db
    .select({ session: raceSessions, team: teams })
    .from(raceSessions)
    .innerJoin(teams, eq(teams.id, raceSessions.teamId))
    .where(eq(raceSessions.publicToken, token))
    .limit(1);
  const found = rows[0];
  if (!found) return c.json({ error: 'not_found' }, 404);

  return streamSSE(c, async (stream) => {
    let closed = false;
    const unsubscribe = rooms.subscribe(token, (event, id) => {
      stream
        .writeSSE({ event: event.type, data: JSON.stringify(event), id: String(id) })
        .catch(() => {});
    });
    stream.onAbort(() => {
      closed = true;
      unsubscribe();
    });

    // Always send a fresh snapshot first so a (re)connecting client self-heals.
    const snapshot = await buildSessionPayload(found.session, found.team.lapTypeValues);
    await stream.writeSSE({ event: 'snapshot', data: JSON.stringify(snapshot), id: '0' });

    // Heartbeat keeps proxies from closing an idle connection.
    while (!closed) {
      await stream.sleep(15000);
      if (closed) break;
      await stream.writeSSE({ event: 'ping', data: 'keepalive' }).catch(() => {});
    }
  });
});
