import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { raceSessions, teams } from '@regularity/db';
import { buildSessionPayload } from '../lib/domain';
import { rooms } from '../rooms';

// Public, unauthenticated, read-only spectator stream keyed by public_token.
export const liveRouter = new Hono();

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
