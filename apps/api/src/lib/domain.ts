import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  teams,
  drivers,
  raceSessions,
  sessionDrivers,
  laps,
  type LapRow,
  type SessionDriverRow,
  type RaceSessionRow,
  type TeamRow,
} from '@regularity/db';
import {
  calculateLapType,
  calculateDriverStats,
  type Driver as CoreDriver,
  type Lap as CoreLap,
  type LapType,
  type LapTypeValues,
} from '@regularity/core';

/** Ensure the user has a team (lazily create a default one on first access). */
export async function getOrCreateTeam(userId: string): Promise<TeamRow> {
  const existing = await db.select().from(teams).where(eq(teams.ownerId, userId)).limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(teams)
    .values({ ownerId: userId, name: 'My Team' })
    .returning();
  return created;
}

/** The team owned by `userId`, or null. */
export async function getOwnedTeam(userId: string): Promise<TeamRow | null> {
  const rows = await db.select().from(teams).where(eq(teams.ownerId, userId)).limit(1);
  return rows[0] ?? null;
}

/** Load a session and confirm it belongs to a team owned by `userId`. */
export async function getOwnedSession(
  sessionId: string,
  userId: string,
): Promise<{ session: RaceSessionRow; team: TeamRow } | null> {
  const rows = await db
    .select({ session: raceSessions, team: teams })
    .from(raceSessions)
    .innerJoin(teams, eq(teams.id, raceSessions.teamId))
    .where(and(eq(raceSessions.id, sessionId), eq(teams.ownerId, userId)))
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
