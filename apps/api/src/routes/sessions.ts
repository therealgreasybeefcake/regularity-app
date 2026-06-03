import { Hono } from 'hono';
import { and, count, eq } from 'drizzle-orm';
import { db } from '../db';
import { requireAuth, type AppVariables } from '../middleware';
import {
  buildSessionPayload,
  computeLap,
  getOwnedSession,
} from '../lib/domain';
import { laps, raceSessions, sessionDrivers, teams } from '@regularity/db';
import { appendLapInputSchema } from '@regularity/schemas';
import { rooms } from '../rooms';

export const sessionRouter = new Hono<{ Variables: AppVariables }>();
sessionRouter.use('*', requireAuth);

// GET /api/sessions/:id — full session with drivers, laps, and computed stats.
sessionRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const owned = await getOwnedSession(c.req.param('id'), user.id);
  if (!owned) return c.json({ error: 'not_found' }, 404);
  const payload = await buildSessionPayload(owned.session, owned.team.lapTypeValues);
  return c.json(payload);
});

// POST /api/sessions/:id/end
sessionRouter.post('/:id/end', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const owned = await getOwnedSession(sessionId, user.id);
  if (!owned) return c.json({ error: 'not_found' }, 404);

  const [ended] = await db
    .update(raceSessions)
    .set({ status: 'ended', endedAt: new Date() })
    .where(eq(raceSessions.id, sessionId))
    .returning();

  rooms.broadcast(owned.session.publicToken, { type: 'sessionEnded', sessionId });
  return c.json({ session: ended });
});

// DELETE /api/sessions/:id — discard a session entirely (cascade-deletes laps).
// Used by "Clear Session" so a discarded session leaves nothing in the DB.
sessionRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const owned = await getOwnedSession(sessionId, user.id);
  if (!owned) return c.json({ error: 'not_found' }, 404);
  rooms.broadcast(owned.session.publicToken, { type: 'sessionEnded', sessionId });
  await db.delete(raceSessions).where(eq(raceSessions.id, sessionId));
  return c.json({ ok: true });
});

// POST /api/sessions/:id/laps — the offline-sync hot path. Idempotent on clientLapId.
sessionRouter.post('/:id/laps', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const owned = await getOwnedSession(sessionId, user.id);
  if (!owned) return c.json({ error: 'not_found' }, 404);
  if (owned.session.status !== 'live') return c.json({ error: 'session_not_live' }, 409);

  const body = await c.req.json().catch(() => null);
  const parsed = appendLapInputSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);
  const input = parsed.data;

  const [sd] = await db
    .select()
    .from(sessionDrivers)
    .where(and(eq(sessionDrivers.id, input.sessionDriverId), eq(sessionDrivers.sessionId, sessionId)))
    .limit(1);
  if (!sd) return c.json({ error: 'driver_not_found' }, 404);

  // Idempotency: a replayed offline lap returns the already-stored canonical lap.
  const [dup] = await db
    .select()
    .from(laps)
    .where(and(eq(laps.sessionDriverId, sd.id), eq(laps.clientLapId, input.clientLapId)))
    .limit(1);
  if (dup) return c.json({ lap: dup, deduped: true });

  const { delta, lapType, lapValue } = computeLap(
    input.time,
    sd.targetTimeSec,
    owned.team.lapTypeValues,
    input.isChangeover,
    input.isSafety,
  );
  const [{ value: existingCount }] = await db
    .select({ value: count() })
    .from(laps)
    .where(eq(laps.sessionDriverId, sd.id));
  const number = Number(existingCount) + 1;

  const [inserted] = await db
    .insert(laps)
    .values({
      sessionDriverId: sd.id,
      clientLapId: input.clientLapId,
      number,
      timeSec: input.time,
      delta,
      lapType,
      lapValue,
      recordedAt: new Date(input.recordedAt),
    })
    .onConflictDoNothing()
    .returning();

  // onConflictDoNothing can race with a concurrent replay — fall back to select.
  const lap =
    inserted ??
    (
      await db
        .select()
        .from(laps)
        .where(and(eq(laps.sessionDriverId, sd.id), eq(laps.clientLapId, input.clientLapId)))
        .limit(1)
    )[0];

  rooms.broadcast(owned.session.publicToken, {
    type: 'lap',
    lap: { ...lap, sessionDriverId: sd.id },
  });
  return c.json({ lap });
});

// ---------------------------------------------------------------------------
// Lap edit / delete (mounted at /api/laps)
// ---------------------------------------------------------------------------

export const lapRouter = new Hono<{ Variables: AppVariables }>();
lapRouter.use('*', requireAuth);

/** Resolve a lap with its owning session + team, scoped to the caller. */
async function ownLap(lapId: string, userId: string) {
  const rows = await db
    .select({ lap: laps, sd: sessionDrivers, session: raceSessions, team: teams })
    .from(laps)
    .innerJoin(sessionDrivers, eq(sessionDrivers.id, laps.sessionDriverId))
    .innerJoin(raceSessions, eq(raceSessions.id, sessionDrivers.sessionId))
    .innerJoin(teams, eq(teams.id, raceSessions.teamId))
    .where(and(eq(laps.id, lapId), eq(teams.ownerId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

// PATCH /api/laps/:id — correct a lap's time; recompute derived fields server-side.
lapRouter.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const owned = await ownLap(id, user.id);
  if (!owned) return c.json({ error: 'not_found' }, 404);

  const body = await c.req.json().catch(() => null);
  const time = Number(body?.time);
  if (!Number.isFinite(time) || time <= 0) return c.json({ error: 'invalid_time' }, 400);

  const { delta, lapType, lapValue } = computeLap(
    time,
    owned.sd.targetTimeSec,
    owned.team.lapTypeValues,
    owned.lap.lapType === 'changeover',
    owned.lap.lapType === 'safety',
  );
  const [updated] = await db
    .update(laps)
    .set({ timeSec: time, delta, lapType, lapValue })
    .where(eq(laps.id, id))
    .returning();

  rooms.broadcast(owned.session.publicToken, {
    type: 'lapEdited',
    lap: { ...updated, sessionDriverId: owned.sd.id },
  });
  return c.json({ lap: updated });
});

// DELETE /api/laps/:id
lapRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const owned = await ownLap(id, user.id);
  if (!owned) return c.json({ error: 'not_found' }, 404);

  await db.delete(laps).where(eq(laps.id, id));
  rooms.broadcast(owned.session.publicToken, { type: 'lapDeleted', lapId: id });
  return c.json({ ok: true });
});
