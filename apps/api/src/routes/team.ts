import { Hono } from 'hono';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { requireAuth, type AppVariables } from '../middleware';
import { getOrCreateTeam, getOwnedTeam } from '../lib/domain';
import { teams, drivers, raceSessions, sessionDrivers } from '@regularity/db';
import { updateTeamInputSchema, createDriverInputSchema } from '@regularity/schemas';

export const teamRouter = new Hono<{ Variables: AppVariables }>();
teamRouter.use('*', requireAuth);

// GET /api/teams/me — the caller's team + current driver roster.
teamRouter.get('/me', async (c) => {
  const user = c.get('user');
  const team = await getOrCreateTeam(user.id);
  const roster = await db
    .select()
    .from(drivers)
    .where(eq(drivers.teamId, team.id))
    .orderBy(asc(drivers.sortOrder));
  return c.json({ team, drivers: roster });
});

// PATCH /api/teams/:id
teamRouter.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const team = await getOwnedTeam(user.id);
  if (!team || team.id !== id) return c.json({ error: 'not_found' }, 404);

  const body = await c.req.json().catch(() => null);
  const parsed = updateTeamInputSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);

  const [updated] = await db
    .update(teams)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(teams.id, id))
    .returning();
  return c.json({ team: updated });
});

// POST /api/teams/:id/drivers
teamRouter.post('/:id/drivers', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const team = await getOwnedTeam(user.id);
  if (!team || team.id !== id) return c.json({ error: 'not_found' }, 404);

  const body = await c.req.json().catch(() => null);
  const parsed = createDriverInputSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);

  const existing = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.teamId, id));
  const [created] = await db
    .insert(drivers)
    .values({
      teamId: id,
      name: parsed.data.name,
      targetTimeSec: parsed.data.targetTime,
      sortOrder: existing.length,
    })
    .returning();
  return c.json({ driver: created }, 201);
});

// GET /api/teams/:id/sessions — history (newest first).
teamRouter.get('/:id/sessions', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const team = await getOwnedTeam(user.id);
  if (!team || team.id !== id) return c.json({ error: 'not_found' }, 404);

  const list = await db
    .select()
    .from(raceSessions)
    .where(eq(raceSessions.teamId, id))
    .orderBy(desc(raceSessions.startedAt));
  return c.json({ sessions: list });
});

// POST /api/teams/:id/sessions — start a live session, snapshotting current drivers.
teamRouter.post('/:id/sessions', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const team = await getOwnedTeam(user.id);
  if (!team || team.id !== id) return c.json({ error: 'not_found' }, 404);

  const roster = await db
    .select()
    .from(drivers)
    .where(eq(drivers.teamId, id))
    .orderBy(asc(drivers.sortOrder));

  const [session] = await db
    .insert(raceSessions)
    .values({
      teamId: id,
      raceName: team.raceName,
      sessionNumber: team.sessionNumber,
      sessionDurationMin: team.sessionDurationMin,
      status: 'live',
    })
    .returning();

  if (roster.length) {
    await db.insert(sessionDrivers).values(
      roster.map((d, i) => ({
        sessionId: session.id,
        driverId: d.id,
        name: d.name,
        targetTimeSec: d.targetTimeSec,
        penaltyLaps: d.penaltyLaps,
        sortOrder: i,
      })),
    );
  }

  const sd = await db
    .select()
    .from(sessionDrivers)
    .where(eq(sessionDrivers.sessionId, session.id))
    .orderBy(asc(sessionDrivers.sortOrder));

  return c.json({ session, sessionDrivers: sd }, 201);
});
