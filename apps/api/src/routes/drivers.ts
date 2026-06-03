import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { requireAuth, type AppVariables } from '../middleware';
import { drivers, teams, teamMembers, type TeamMemberRole } from '@regularity/db';
import { updateDriverInputSchema } from '@regularity/schemas';
import { roleAtLeast } from '../lib/domain';
import { rooms, teamRoom } from '../rooms';

export const driverRouter = new Hono<{ Variables: AppVariables }>();
driverRouter.use('*', requireAuth);

/** Load a driver + the caller's role on its team, if they are a member. */
async function ownDriver(
  driverId: string,
  userId: string,
): Promise<{ driver: typeof drivers.$inferSelect; role: TeamMemberRole } | null> {
  const rows = await db
    .select({ driver: drivers, role: teamMembers.role })
    .from(drivers)
    .innerJoin(teams, eq(teams.id, drivers.teamId))
    .innerJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, userId)))
    .where(eq(drivers.id, driverId))
    .limit(1);
  return rows[0] ?? null;
}

// PATCH /api/drivers/:id — edit a roster driver (owner|admin).
driverRouter.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const owned = await ownDriver(id, user.id);
  if (!owned) return c.json({ error: 'not_found' }, 404);
  if (!roleAtLeast(owned.role, 'admin')) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = updateDriverInputSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);

  const { targetTime, ...rest } = parsed.data;
  const [updated] = await db
    .update(drivers)
    .set({
      ...rest,
      ...(targetTime !== undefined ? { targetTimeSec: targetTime } : {}),
      updatedAt: new Date(),
    })
    .where(eq(drivers.id, id))
    .returning();
  rooms.broadcast(teamRoom(owned.driver.teamId), { type: 'teamChanged' });
  return c.json({ driver: updated });
});

// DELETE /api/drivers/:id — remove a roster driver (owner|admin).
driverRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const owned = await ownDriver(id, user.id);
  if (!owned) return c.json({ error: 'not_found' }, 404);
  if (!roleAtLeast(owned.role, 'admin')) return c.json({ error: 'forbidden' }, 403);

  await db.delete(drivers).where(eq(drivers.id, id));
  rooms.broadcast(teamRoom(owned.driver.teamId), { type: 'teamChanged' });
  return c.json({ ok: true });
});
