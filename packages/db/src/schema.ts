import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
  uuid,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import type { LapTypeValues } from '@regularity/core';

// ---------------------------------------------------------------------------
// BetterAuth-managed tables. Property keys MUST match BetterAuth's field names
// (emailVerified, userId, accountId, ...) so the drizzle adapter maps correctly.
// SQL column names are snake_case.
// ---------------------------------------------------------------------------

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ---------------------------------------------------------------------------
// Domain enums
// ---------------------------------------------------------------------------

export const lapTypeEnum = pgEnum('lap_type', [
  'bonus',
  'base',
  'broken',
  'changeover',
  'safety',
]);

export const sessionStatusEnum = pgEnum('session_status', ['live', 'ended']);

// Shared-team membership roles (highest → lowest privilege).
export const teamMemberRoleEnum = pgEnum('team_member_role', [
  'owner',
  'admin',
  'member',
  'viewer',
]);

const DEFAULT_LAP_TYPE_VALUES: LapTypeValues = {
  bonus: 2,
  base: 1,
  changeover: 1,
  broken: 0,
  safety: 0,
};

// ---------------------------------------------------------------------------
// Domain tables
// ---------------------------------------------------------------------------

/** A team belongs to a user. Currently one team per user, but modelled 1:N. */
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  raceName: text('race_name').notNull().default(''),
  sessionNumber: text('session_number').notNull().default(''),
  sessionDurationMin: integer('session_duration_min').notNull().default(120),
  // Scoring values live server-side so the live-view computes identical scores.
  lapTypeValues: jsonb('lap_type_values')
    .$type<LapTypeValues>()
    .notNull()
    .default(DEFAULT_LAP_TYPE_VALUES),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/** The team's current roster of drivers (mutable between sessions). */
export const drivers = pgTable('drivers', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  targetTimeSec: doublePrecision('target_time_sec').notNull(),
  penaltyLaps: integer('penalty_laps').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  // Optional tag linking a roster driver to a member account (decoupled — a
  // driver need not be an account, and a member need not be a driver).
  linkedUserId: text('linked_user_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * A race session. status='live' is the in-progress session; 'ended' is history.
 * public_token backs the shareable, unauthenticated live-view link.
 */
export const raceSessions = pgTable(
  'race_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    raceName: text('race_name').notNull().default(''),
    sessionNumber: text('session_number').notNull().default(''),
    sessionDurationMin: integer('session_duration_min').notNull().default(120),
    status: sessionStatusEnum('status').notNull().default('live'),
    publicToken: uuid('public_token').notNull().defaultRandom().unique(),
    // Client-generated id (e.g. legacy Date.now() session id) so pushing a
    // completed session from a device is idempotent across retries/devices.
    clientSessionId: text('client_session_id'),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    endedAt: timestamp('ended_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    clientSessionUnique: uniqueIndex('race_sessions_team_client_session_uq').on(
      t.teamId,
      t.clientSessionId,
    ),
  }),
);

/** Snapshot of a driver within a session (immutable history once ended). */
export const sessionDrivers = pgTable('session_drivers', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => raceSessions.id, { onDelete: 'cascade' }),
  driverId: uuid('driver_id').references(() => drivers.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  targetTimeSec: doublePrecision('target_time_sec').notNull(),
  penaltyLaps: integer('penalty_laps').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
});

/**
 * Individual laps. client_lap_id is generated on-device so offline replays
 * dedupe via the unique(session_driver_id, client_lap_id) index. Derived
 * fields (delta/lapType/lapValue) are computed server-side from @regularity/core.
 */
export const laps = pgTable(
  'laps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionDriverId: uuid('session_driver_id')
      .notNull()
      .references(() => sessionDrivers.id, { onDelete: 'cascade' }),
    clientLapId: uuid('client_lap_id').notNull(),
    number: integer('number').notNull(),
    timeSec: doublePrecision('time_sec').notNull(),
    delta: doublePrecision('delta').notNull(),
    lapType: lapTypeEnum('lap_type').notNull(),
    lapValue: doublePrecision('lap_value').notNull(),
    recordedAt: timestamp('recorded_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    clientLapUnique: uniqueIndex('laps_session_driver_client_lap_uq').on(
      t.sessionDriverId,
      t.clientLapId,
    ),
  }),
);

/**
 * Team membership — links user accounts to teams with a role. Shared-team
 * access control resolves through this table. `teams.owner_id` remains a
 * denormalized pointer to the primary owner (kept in sync on ownership transfer);
 * the row here with role='owner' is the source of truth for authorization.
 */
export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: teamMemberRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    teamUserUnique: uniqueIndex('team_members_team_user_uq').on(t.teamId, t.userId),
    byUser: index('team_members_user_idx').on(t.userId),
  }),
);

/**
 * Shareable join invitations. The opaque `token` backs the deep link
 * (regularity://join/<token> + web /join/<token>); the short `code` is for
 * manual entry. Accepting creates a team_members row with the invite's role.
 */
export const teamInvitations = pgTable('team_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  code: text('code').unique(),
  role: teamMemberRoleEnum('role').notNull().default('member'),
  invitedBy: text('invited_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  email: text('email'),
  maxUses: integer('max_uses').notNull().default(1),
  uses: integer('uses').notNull().default(0),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Convenience inferred types for the API layer.
export type UserRow = typeof user.$inferSelect;
export type TeamRow = typeof teams.$inferSelect;
export type DriverRow = typeof drivers.$inferSelect;
export type RaceSessionRow = typeof raceSessions.$inferSelect;
export type SessionDriverRow = typeof sessionDrivers.$inferSelect;
export type LapRow = typeof laps.$inferSelect;
export type TeamMemberRow = typeof teamMembers.$inferSelect;
export type TeamInvitationRow = typeof teamInvitations.$inferSelect;
export type TeamMemberRole = TeamMemberRow['role'];
