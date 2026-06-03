import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  teams,
  teamMembers,
  drivers,
  raceSessions,
  sessionDrivers,
  laps,
  type LapRow,
  type SessionDriverRow,
  type RaceSessionRow,
  type TeamRow,
  type TeamMemberRole,
} from '@regularity/db';
import {
  calculateLapType,
  calculateDriverStats,
  type Driver as CoreDriver,
  type Lap as CoreLap,
  type LapType,
  type LapTypeValues,
} from '@regularity/core';

// ---------------------------------------------------------------------------
// Membership-based authorization. Access is resolved through team_members
// (a user may belong to multiple teams with different roles). teams.owner_id is
// kept only as a denormalized "primary owner" pointer.
// ---------------------------------------------------------------------------

export const ROLE_RANK: Record<TeamMemberRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

/** True if `role` is at least as privileged as `min`. */
export function roleAtLeast(role: TeamMemberRole, min: TeamMemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Idempotently ensure `userId` is an owner member of `teamId`. */
async function ensureOwnerMembership(teamId: string, userId: string): Promise<void> {
  await db.insert(teamMembers).values({ teamId, userId, role: 'owner' }).onConflictDoNothing();
}

/** Ensure the user has a (personal) team — lazily create one + owner membership. */
export async function getOrCreateTeam(userId: string): Promise<TeamRow> {
  const existing = await db.select().from(teams).where(eq(teams.ownerId, userId)).limit(1);
  if (existing[0]) {
    await ensureOwnerMembership(existing[0].id, userId);
    return existing[0];
  }

  const [created] = await db
    .insert(teams)
    .values({ ownerId: userId, name: 'My Team' })
    .returning();
  await ensureOwnerMembership(created.id, userId);
  return created;
}

/** The caller's primary owned team (used by the legacy single-team nav helpers). */
export async function getOwnedTeam(userId: string): Promise<TeamRow | null> {
  const rows = await db.select().from(teams).where(eq(teams.ownerId, userId)).limit(1);
  return rows[0] ?? null;
}

/** The team + the caller's role within it, or null if they are not a member. */
export async function getMembership(
  teamId: string,
  userId: string,
): Promise<{ team: TeamRow; role: TeamMemberRole } | null> {
  const rows = await db
    .select({ team: teams, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Load a session with the caller's membership role, or null if not a member. */
export async function getOwnedSession(
  sessionId: string,
  userId: string,
): Promise<{ session: RaceSessionRow; team: TeamRow; role: TeamMemberRole } | null> {
  const rows = await db
    .select({ session: raceSessions, team: teams, role: teamMembers.role })
    .from(raceSessions)
    .innerJoin(teams, eq(teams.id, raceSessions.teamId))
    .innerJoin(
      teamMembers,
      and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, userId)),
    )
    .where(eq(raceSessions.id, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

/** Compute a lap's derived fields from the raw time, using shared core logic. */
export function computeLap(
  timeSec: number,
  targetTimeSec: number,
  lapTypeValues: LapTypeValues,
  isChangeover = false,
  isSafety = false,
): { delta: number; lapType: LapType; lapValue: number } {
  const delta = timeSec - targetTimeSec;
  const lapType = calculateLapType(delta, isChangeover, isSafety);
  const lapValue = lapTypeValues[lapType];
  return { delta, lapType, lapValue };
}

function lapRowToCore(row: LapRow): CoreLap {
  return {
    number: row.number,
    time: row.timeSec,
    delta: row.delta,
    lapType: row.lapType,
    lapValue: row.lapValue,
    timestamp: row.recordedAt.getTime(),
  };
}

export interface SessionPayload {
  id: string;
  teamId: string;
  status: RaceSessionRow['status'];
  raceName: string;
  sessionNumber: string;
  sessionDurationMin: number;
  publicToken: string;
  startedAt: string;
  endedAt: string | null;
  lapTypeValues: LapTypeValues;
  drivers: Array<{
    id: string;
    name: string;
    targetTime: number;
    penaltyLaps: number;
    laps: CoreLap[];
    stats: ReturnType<typeof calculateDriverStats>;
  }>;
  teamStats: { goalLaps: number; achievedLaps: number; percentageFactor: number };
}

/**
 * Assemble the full live/historical view of a session — drivers, laps, and
 * computed stats — using @regularity/core so the API, live-view and PDF agree.
 */
export async function buildSessionPayload(
  session: RaceSessionRow,
  lapTypeValues: LapTypeValues,
): Promise<SessionPayload> {
  const sdRows = await db
    .select()
    .from(sessionDrivers)
    .where(eq(sessionDrivers.sessionId, session.id))
    .orderBy(asc(sessionDrivers.sortOrder));

  const lapRows = await db
    .select()
    .from(laps)
    .innerJoin(sessionDrivers, eq(sessionDrivers.id, laps.sessionDriverId))
    .where(eq(sessionDrivers.sessionId, session.id))
    .orderBy(asc(laps.number));

  const lapsByDriver = new Map<string, LapRow[]>();
  for (const r of lapRows) {
    const list = lapsByDriver.get(r.laps.sessionDriverId) ?? [];
    list.push(r.laps);
    lapsByDriver.set(r.laps.sessionDriverId, list);
  }

  // Build core Driver objects (numeric id is unused by the stats functions).
  const coreDrivers: CoreDriver[] = sdRows.map((sd: SessionDriverRow, i) => ({
    id: i,
    name: sd.name,
    targetTime: sd.targetTimeSec,
    penaltyLaps: sd.penaltyLaps,
    laps: (lapsByDriver.get(sd.id) ?? []).map(lapRowToCore),
  }));

  let goalLaps = 0;
  let achievedLaps = 0;
  const driverPayloads = sdRows.map((sd, i) => {
    const stats = calculateDriverStats(
      coreDrivers[i],
      lapTypeValues,
      coreDrivers,
      session.sessionDurationMin,
    );
    goalLaps += stats.goalLaps;
    achievedLaps += stats.achievedLaps;
    return {
      id: sd.id,
      name: sd.name,
      targetTime: sd.targetTimeSec,
      penaltyLaps: sd.penaltyLaps,
      laps: coreDrivers[i].laps,
      stats,
    };
  });

  return {
    id: session.id,
    teamId: session.teamId,
    status: session.status,
    raceName: session.raceName,
    sessionNumber: session.sessionNumber,
    sessionDurationMin: session.sessionDurationMin,
    publicToken: session.publicToken,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    lapTypeValues,
    drivers: driverPayloads,
    teamStats: {
      goalLaps,
      achievedLaps,
      percentageFactor: goalLaps > 0 ? (achievedLaps / goalLaps) * 100 : 0,
    },
  };
}

export { drivers, teams, raceSessions, sessionDrivers, laps };
