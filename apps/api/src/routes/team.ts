import { Hono } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { requireAuth, type AppVariables } from '../middleware';
import { getOrCreateTeam, getOwnedTeam, getMembership, roleAtLeast } from '../lib/domain';
import { teams, drivers, raceSessions, sessionDrivers, laps } from '@regularity/db';
import {
  updateTeamInputSchema,
  createDriverInputSchema,
  importTeamSchema,
  teamStateSchema,
  sessionSnapshotSchema,
  startSessionInputSchema,
} from '@regularity/schemas';

export const teamRouter = new Hono<{ Variables: AppVariables }>();
teamRouter.use('*', requireAuth);

// POST /api/teams/import — one-time first-login migration of the legacy local
// Team (+ sessionHistory) into Postgres. Idempotent: only runs on an empty team.
teamRouter.post('/import', async (c) => {
  const user = c.get('user');
  const team = await getOrCreateTeam(user.id);

  const body = await c.req.json().catch(() => null);
  const parsed = importTeamSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);
  const data = parsed.data;

  // Guard against double-import: only proceed if the team has no data yet.
  const [existingDriver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.teamId, team.id)).limit(1);
  const [existingSession] = await db.select({ id: raceSessions.id }).from(raceSessions).where(eq(raceSessions.teamId, team.id)).limit(1);
  if (existingDriver || existingSession) {
    return c.json({ imported: false, reason: 'already_has_data' });
  }

  let importedSessions = 0;
  let importedLaps = 0;

  await db.transaction(async (tx) => {
    await tx
      .update(teams)
      .set({
        name: data.name || team.name,
        raceName: data.raceName,
        sessionNumber: data.sessionNumber,
        sessionDurationMin: data.sessionDuration,
        ...(data.lapTypeValues ? { lapTypeValues: data.lapTypeValues } : {}),
        updatedAt: new Date(),
      })
      .where(eq(teams.id, team.id));

    // Current roster
    if (data.drivers.length) {
      await tx.insert(drivers).values(
        data.drivers.map((d, i) => ({
          teamId: team.id,
          name: d.name,
          targetTimeSec: d.targetTime,
          penaltyLaps: d.penaltyLaps,
          sortOrder: i,
        })),
      );
    }

    // Historical sessions (immutable snapshots)
    for (const session of data.sessionHistory) {
      const when = new Date(session.timestamp);
      const [createdSession] = await tx
        .insert(raceSessions)
        .values({
          teamId: team.id,
          raceName: session.raceName,
          sessionNumber: session.sessionNumber,
          sessionDurationMin: session.sessionDuration,
          status: 'ended',
          startedAt: when,
          endedAt: when,
        })
        .returning();
      importedSessions += 1;

      for (let i = 0; i < session.drivers.length; i++) {
        const d = session.drivers[i];
        const [sd] = await tx
          .insert(sessionDrivers)
          .values({
            sessionId: createdSession.id,
            name: d.name,
            targetTimeSec: d.targetTime,
            penaltyLaps: d.penaltyLaps,
            sortOrder: i,
          })
          .returning();

        if (d.laps.length) {
          await tx.insert(laps).values(
            d.laps.map((lap) => ({
              sessionDriverId: sd.id,
              clientLapId: crypto.randomUUID(),
              number: lap.number,
              timeSec: lap.time,
              delta: lap.delta,
              lapType: lap.lapType,
              lapValue: lap.lapValue,
              recordedAt: new Date(lap.timestamp),
            })),
          );
          importedLaps += d.laps.length;
        }
      }
    }
  });

  return c.json({ imported: true, sessions: importedSessions, laps: importedLaps });
});

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

// GET /api/teams/me/live — the team's current live session (drives the web "Live" nav).
teamRouter.get('/me/live', async (c) => {
  const user = c.get('user');
  const team = await getOwnedTeam(user.id);
  if (!team) return c.json({ live: null });
  const [s] = await db
    .select({ id: raceSessions.id, publicToken: raceSessions.publicToken, raceName: raceSessions.raceName })
    .from(raceSessions)
    .where(and(eq(raceSessions.teamId, team.id), eq(raceSessions.status, 'live')))
    .orderBy(desc(raceSessions.startedAt))
    .limit(1);
  return c.json({ live: s ?? null });
});

// GET /api/teams/:id — a specific team + its roster (any member). Lets a member
// load a shared team's roster/settings after switching to it.
teamRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const m = await getMembership(id, user.id);
  if (!m) return c.json({ error: 'not_found' }, 404);
  const roster = await db
    .select()
    .from(drivers)
    .where(eq(drivers.teamId, id))
    .orderBy(asc(drivers.sortOrder));
  return c.json({ team: m.team, drivers: roster, role: m.role });
});

// PATCH /api/teams/:id — settings/scoring/meta (owner|admin).
teamRouter.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const m = await getMembership(id, user.id);
  if (!m) return c.json({ error: 'not_found' }, 404);
  if (!roleAtLeast(m.role, 'admin')) return c.json({ error: 'forbidden' }, 403);

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

// POST /api/teams/:id/drivers — add a roster driver (owner|admin).
teamRouter.post('/:id/drivers', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const m = await getMembership(id, user.id);
  if (!m) return c.json({ error: 'not_found' }, 404);
  if (!roleAtLeast(m.role, 'admin')) return c.json({ error: 'forbidden' }, 403);

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

// PUT /api/teams/:id — bulk meta update + roster replace (owner|admin). Legacy
// single-writer sync path; multi-member clients use granular driver endpoints.
teamRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const m = await getMembership(id, user.id);
  if (!m) return c.json({ error: 'not_found' }, 404);
  if (!roleAtLeast(m.role, 'admin')) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = teamStateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);
  const data = parsed.data;

  await db.transaction(async (tx) => {
    const meta: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) meta.name = data.name;
    if (data.raceName !== undefined) meta.raceName = data.raceName;
    if (data.sessionNumber !== undefined) meta.sessionNumber = data.sessionNumber;
    if (data.sessionDuration !== undefined) meta.sessionDurationMin = data.sessionDuration;
    if (data.lapTypeValues !== undefined) meta.lapTypeValues = data.lapTypeValues;
    await tx.update(teams).set(meta).where(eq(teams.id, id));

    if (data.drivers !== undefined) {
      // Replace roster. session_drivers keep their snapshots (driver_id -> null).
      await tx.delete(drivers).where(eq(drivers.teamId, id));
      if (data.drivers.length) {
        await tx.insert(drivers).values(
          data.drivers.map((d, i) => ({
            teamId: id,
            name: d.name,
            targetTimeSec: d.targetTime,
            penaltyLaps: d.penaltyLaps,
            sortOrder: i,
          })),
        );
      }
    }
  });

  const roster = await db.select().from(drivers).where(eq(drivers.teamId, id)).orderBy(asc(drivers.sortOrder));
  const [updated] = await db.select().from(teams).where(eq(teams.id, id));
  return c.json({ team: updated, drivers: roster });
});

// POST /api/teams/:id/sessions/complete — persist a finished session (history).
// Idempotent on clientSessionId so re-saves/offline replays don't duplicate.
teamRouter.post('/:id/sessions/complete', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const m = await getMembership(id, user.id);
  if (!m) return c.json({ error: 'not_found' }, 404);
  if (!roleAtLeast(m.role, 'member')) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = sessionSnapshotSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);
  const session = parsed.data;

  const [dup] = await db
    .select()
    .from(raceSessions)
    .where(and(eq(raceSessions.teamId, id), eq(raceSessions.clientSessionId, session.id)))
    .limit(1);
  if (dup) return c.json({ session: dup, deduped: true });

  const when = new Date(session.timestamp);
  const created = await db.transaction(async (tx) => {
    const [s] = await tx
      .insert(raceSessions)
      .values({
        teamId: id,
        clientSessionId: session.id,
        raceName: session.raceName,
        sessionNumber: session.sessionNumber,
        sessionDurationMin: session.sessionDuration,
        status: 'ended',
        startedAt: when,
        endedAt: when,
      })
      .returning();

    for (let i = 0; i < session.drivers.length; i++) {
      const d = session.drivers[i];
      const [sd] = await tx
        .insert(sessionDrivers)
        .values({
          sessionId: s.id,
          name: d.name,
          targetTimeSec: d.targetTime,
          penaltyLaps: d.penaltyLaps,
          sortOrder: i,
        })
        .returning();
      if (d.laps.length) {
        await tx.insert(laps).values(
          d.laps.map((lap) => ({
            sessionDriverId: sd.id,
            clientLapId: crypto.randomUUID(),
            number: lap.number,
            timeSec: lap.time,
            delta: lap.delta,
            lapType: lap.lapType,
            lapValue: lap.lapValue,
            recordedAt: new Date(lap.timestamp),
          })),
        );
      }
    }
    return s;
  });

  return c.json({ session: created });
});

// GET /api/teams/:id/sessions — history (newest first). Any member.
teamRouter.get('/:id/sessions', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const m = await getMembership(id, user.id);
  if (!m) return c.json({ error: 'not_found' }, 404);

  const list = await db
    .select()
    .from(raceSessions)
    .where(eq(raceSessions.teamId, id))
    .orderBy(desc(raceSessions.startedAt));
  return c.json({ sessions: list });
});

// POST /api/teams/:id/sessions — start a live session. Accepts optional
// client-generated ids (offline-safe) and is idempotent on the session id.
teamRouter.post('/:id/sessions', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const m = await getMembership(id, user.id);
  if (!m) return c.json({ error: 'not_found' }, 404);
  if (!roleAtLeast(m.role, 'member')) return c.json({ error: 'forbidden' }, 403);
  const team = m.team;

  const body = await c.req.json().catch(() => undefined);
  const parsed = startSessionInputSchema.safeParse(body ?? undefined);
  if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);
  const input = parsed.data;

  // Idempotent: a replayed start (same client id) returns the existing session.
  if (input?.id) {
    const [existing] = await db
      .select()
      .from(raceSessions)
      .where(and(eq(raceSessions.id, input.id), eq(raceSessions.teamId, id)))
      .limit(1);
    if (existing) {
      const sd = await db
        .select()
        .from(sessionDrivers)
        .where(eq(sessionDrivers.sessionId, existing.id))
        .orderBy(asc(sessionDrivers.sortOrder));
      return c.json({ session: existing, sessionDrivers: sd, existing: true });
    }
  }

  const [session] = await db
    .insert(raceSessions)
    .values({
      ...(input?.id ? { id: input.id } : {}),
      ...(input?.publicToken ? { publicToken: input.publicToken } : {}),
      teamId: id,
      raceName: input?.raceName ?? team.raceName,
      sessionNumber: input?.sessionNumber ?? team.sessionNumber,
      sessionDurationMin: input?.sessionDuration ?? team.sessionDurationMin,
      status: 'live',
    })
    .returning();

  const driverValues: (typeof sessionDrivers.$inferInsert)[] =
    input?.drivers && input.drivers.length
      ? input.drivers.map((d, i) => ({
          id: d.id,
          sessionId: session.id,
          name: d.name,
          targetTimeSec: d.targetTime,
          penaltyLaps: d.penaltyLaps,
          sortOrder: i,
        }))
      : (
          await db.select().from(drivers).where(eq(drivers.teamId, id)).orderBy(asc(drivers.sortOrder))
        ).map((d, i) => ({
          sessionId: session.id,
          driverId: d.id,
          name: d.name,
          targetTimeSec: d.targetTimeSec,
          penaltyLaps: d.penaltyLaps,
          sortOrder: i,
        }));
  if (driverValues.length) await db.insert(sessionDrivers).values(driverValues);

  const sd = await db
    .select()
    .from(sessionDrivers)
    .where(eq(sessionDrivers.sessionId, session.id))
    .orderBy(asc(sessionDrivers.sortOrder));

  return c.json({ session, sessionDrivers: sd }, 201);
});
