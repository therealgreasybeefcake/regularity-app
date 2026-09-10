import { Hono } from 'hono';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { randomBytes, randomInt } from 'node:crypto';
import { db } from '../db';
import { env } from '../env';
import { requireAuth, type AppVariables } from '../middleware';
import { getMembership } from '../lib/domain';
import { teams, teamMembers, teamInvitations, user } from '@regularity/db';
import { createInviteSchema, acceptInviteSchema, updateMemberRoleSchema } from '@regularity/schemas';

// Opaque invite token (deep link) + a short, human-typable code (no ambiguous chars).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genToken(): string {
  return randomBytes(24).toString('base64url');
}
function genCode(len = 8): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

async function ownerCount(teamId: string): Promise<number> {
  const [{ value }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'owner')));
  return Number(value);
}

// ---------------------------------------------------------------------------
// memberRouter — mounted at /api/teams (alongside teamRouter).
// ---------------------------------------------------------------------------
export const memberRouter = new Hono<{ Variables: AppVariables }>();
memberRouter.use('*', requireAuth);

// GET /api/teams — every team the caller belongs to, with their role.
memberRouter.get('/', async (c) => {
  const u = c.get('user');
  const rows = await db
    .select({ id: teams.id, name: teams.name, role: teamMembers.role, ownerId: teams.ownerId })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, u.id))
    .orderBy(asc(teams.createdAt));
  return c.json({ teams: rows });
});

// GET /api/teams/:id/members — any member can view the roster of members.
memberRouter.get('/:id/members', async (c) => {
  const u = c.get('user');
  const id = c.req.param('id');
  const m = await getMembership(id, u.id);
  if (!m) return c.json({ error: 'not_found' }, 404);

  const members = await db
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      role: teamMembers.role,
      name: user.name,
      email: user.email,
      createdAt: teamMembers.createdAt,
    })
    .from(teamMembers)
    .innerJoin(user, eq(user.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, id))
    .orderBy(asc(teamMembers.createdAt));
  return c.json({ members, you: { userId: u.id, role: m.role } });
});

// POST /api/teams/:id/invites — owner creates a shareable invite.
memberRouter.post('/:id/invites', async (c) => {
  const u = c.get('user');
  const id = c.req.param('id');
  const m = await getMembership(id, u.id);
  if (!m) return c.json({ error: 'not_found' }, 404);
  if (m.role !== 'owner') return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json().catch(() => ({}));
  const parsed = createInviteSchema.safeParse(body ?? {});
  if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);
  const { role, expiresInDays, maxUses, email } = parsed.data;

  const token = genToken();
  const code = genCode();
  const expiresAt = new Date(Date.now() + (expiresInDays ?? 7) * 24 * 60 * 60 * 1000);

  const [inv] = await db
    .insert(teamInvitations)
    .values({ teamId: id, token, code, role, invitedBy: u.id, email, maxUses: maxUses ?? 1, expiresAt })
    .returning();

  return c.json(
    {
      invite: { id: inv.id, role: inv.role, code: inv.code, expiresAt: inv.expiresAt, maxUses: inv.maxUses, uses: inv.uses },
      token: inv.token,
      link: `${env.BETTER_AUTH_URL}/join/${inv.token}`,
    },
    201,
  );
});

// GET /api/teams/:id/invites — owner lists active (un-revoked) invites.
memberRouter.get('/:id/invites', async (c) => {
  const u = c.get('user');
  const id = c.req.param('id');
  const m = await getMembership(id, u.id);
  if (!m) return c.json({ error: 'not_found' }, 404);
  if (m.role !== 'owner') return c.json({ error: 'forbidden' }, 403);

  const invites = await db
    .select({ id: teamInvitations.id, role: teamInvitations.role, code: teamInvitations.code, email: teamInvitations.email, maxUses: teamInvitations.maxUses, uses: teamInvitations.uses, expiresAt: teamInvitations.expiresAt, createdAt: teamInvitations.createdAt })
    .from(teamInvitations)
    .where(and(eq(teamInvitations.teamId, id), isNull(teamInvitations.revokedAt)))
    .orderBy(desc(teamInvitations.createdAt));
  return c.json({ invites });
});

// DELETE /api/teams/:id/invites/:inviteId — owner revokes an invite.
memberRouter.delete('/:id/invites/:inviteId', async (c) => {
  const u = c.get('user');
  const id = c.req.param('id');
  const inviteId = c.req.param('inviteId');
  const m = await getMembership(id, u.id);
  if (!m) return c.json({ error: 'not_found' }, 404);
  if (m.role !== 'owner') return c.json({ error: 'forbidden' }, 403);

  await db
    .update(teamInvitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(teamInvitations.id, inviteId), eq(teamInvitations.teamId, id)));
  return c.json({ ok: true });
});

// PATCH /api/teams/:id/members/:memberId — owner changes a member's role.
memberRouter.patch('/:id/members/:memberId', async (c) => {
  const u = c.get('user');
  const id = c.req.param('id');
  const memberId = c.req.param('memberId');
  const m = await getMembership(id, u.id);
  if (!m) return c.json({ error: 'not_found' }, 404);
  if (m.role !== 'owner') return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = updateMemberRoleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);

  const [target] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, id)))
    .limit(1);
  if (!target) return c.json({ error: 'not_found' }, 404);
  // Demoting the last owner would orphan the team.
  if (target.role === 'owner' && (await ownerCount(id)) <= 1) {
    return c.json({ error: 'last_owner' }, 409);
  }

  const [updated] = await db
    .update(teamMembers)
    .set({ role: parsed.data.role, updatedAt: new Date() })
    .where(eq(teamMembers.id, memberId))
    .returning();
  return c.json({ member: updated });
});

// DELETE /api/teams/:id/members/:memberId — owner removes a member, or self-leave.
memberRouter.delete('/:id/members/:memberId', async (c) => {
  const u = c.get('user');
  const id = c.req.param('id');
  const memberId = c.req.param('memberId');
  const m = await getMembership(id, u.id);
  if (!m) return c.json({ error: 'not_found' }, 404);

  const [target] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, id)))
    .limit(1);
  if (!target) return c.json({ error: 'not_found' }, 404);

  const isSelf = target.userId === u.id;
  if (!isSelf && m.role !== 'owner') return c.json({ error: 'forbidden' }, 403);
  if (target.role === 'owner' && (await ownerCount(id)) <= 1) {
    return c.json({ error: 'last_owner' }, 409);
  }

  await db.delete(teamMembers).where(eq(teamMembers.id, memberId));
  return c.json({ ok: true, left: isSelf });
});

// POST /api/teams/:id/transfer-ownership — owner hands ownership to another member.
memberRouter.post('/:id/transfer-ownership', async (c) => {
  const u = c.get('user');
  const id = c.req.param('id');
  const m = await getMembership(id, u.id);
  if (!m) return c.json({ error: 'not_found' }, 404);
  if (m.role !== 'owner') return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json().catch(() => null);
  const memberId = typeof body?.memberId === 'string' ? body.memberId : null;
  if (!memberId) return c.json({ error: 'invalid', message: 'memberId required' }, 400);

  const [target] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, id)))
    .limit(1);
  if (!target) return c.json({ error: 'not_found' }, 404);
  if (target.userId === u.id) return c.json({ ok: true }); // already owner

  await db.transaction(async (tx) => {
    await tx.update(teamMembers).set({ role: 'owner', updatedAt: new Date() }).where(eq(teamMembers.id, memberId));
    // Former owner becomes an admin.
    await tx
      .update(teamMembers)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, u.id)));
    // Keep the denormalized primary-owner pointer in sync.
    await tx.update(teams).set({ ownerId: target.userId, updatedAt: new Date() }).where(eq(teams.id, id));
  });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// inviteRouter — mounted at /api/invites.
// ---------------------------------------------------------------------------
export const inviteRouter = new Hono<{ Variables: AppVariables }>();
inviteRouter.use('*', requireAuth);

// POST /api/invites/accept — join a team via token or code.
inviteRouter.post('/accept', async (c) => {
  const u = c.get('user');
  const body = await c.req.json().catch(() => null);
  const parsed = acceptInviteSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid', details: parsed.error.flatten() }, 400);
  const { token, code } = parsed.data;

  const [inv] = await db
    .select()
    .from(teamInvitations)
    .where(token ? eq(teamInvitations.token, token) : eq(teamInvitations.code, code!))
    .limit(1);
  if (!inv) return c.json({ error: 'invalid_invite' }, 404);
  if (inv.revokedAt) return c.json({ error: 'revoked' }, 410);
  if (inv.expiresAt.getTime() < Date.now()) return c.json({ error: 'expired' }, 410);

  const [team] = await db.select().from(teams).where(eq(teams.id, inv.teamId)).limit(1);
  if (!team) return c.json({ error: 'invalid_invite' }, 404);

  // Already a member → idempotent (don't consume a use).
  const existing = await getMembership(inv.teamId, u.id);
  if (existing) {
    return c.json({ team: { id: team.id, name: team.name, role: existing.role }, joined: false });
  }

  if (inv.uses >= inv.maxUses) return c.json({ error: 'exhausted' }, 410);

  await db.transaction(async (tx) => {
    await tx.insert(teamMembers).values({ teamId: inv.teamId, userId: u.id, role: inv.role }).onConflictDoNothing();
    await tx.update(teamInvitations).set({ uses: sql`${teamInvitations.uses} + 1` }).where(eq(teamInvitations.id, inv.id));
  });

  return c.json({ team: { id: team.id, name: team.name, role: inv.role }, joined: true });
});
