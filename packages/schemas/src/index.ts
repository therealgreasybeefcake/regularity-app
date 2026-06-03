import { z } from 'zod';
import type {
  AudioSettings,
  LapType,
  LapTypeValues,
} from '@regularity/core';

/**
 * Shared validation, consumed by both the mobile app (form + parse validation)
 * and the Hono API (request validation). Single source of truth so corrupt
 * data (NaN times, negative durations, etc.) can never enter the system.
 */

// --- Primitives ---

/** A real, finite number (rejects NaN / Infinity that `parseFloat` can produce). */
export const finiteNumber = z
  .number()
  .refine((n) => Number.isFinite(n), { message: 'Must be a finite number' });

/** A finite number that is also >= 0. */
export const nonNegativeFinite = z
  .number()
  .min(0)
  .refine((n) => Number.isFinite(n), { message: 'Must be a finite number' });

/** A lap time in seconds: finite and strictly positive. */
export const lapTimeSchema = finiteNumber.refine((n) => n > 0, {
  message: 'Lap time must be greater than 0',
});

/** Target lap time in seconds: finite and strictly positive. */
export const targetTimeSchema = finiteNumber.refine((n) => n > 0, {
  message: 'Target time must be greater than 0',
});

/** Session duration in whole minutes: positive integer. */
export const sessionDurationSchema = z
  .number()
  .int()
  .refine((n) => n > 0, { message: 'Session duration must be greater than 0' });

/** Penalty laps: non-negative integer. */
export const penaltyLapsSchema = z
  .number()
  .int()
  .min(0, { message: 'Penalty laps cannot be negative' });

export const lapTypeSchema = z.enum([
  'bonus',
  'base',
  'broken',
  'changeover',
  'safety',
]) satisfies z.ZodType<LapType>;

// --- Composite domain schemas ---

export const lapTypeValuesSchema = z.object({
  bonus: finiteNumber,
  base: finiteNumber,
  changeover: finiteNumber,
  broken: finiteNumber,
  safety: finiteNumber,
}) satisfies z.ZodType<LapTypeValues>;

export const audioSettingsSchema = z.object({
  enabled: z.boolean(),
  beforeTargetEnabled: z.boolean(),
  afterLapStartEnabled: z.boolean(),
  beforeTargetTime: nonNegativeFinite,
  afterLapStart: nonNegativeFinite,
  lapGuardEnabled: z.boolean(),
  lapGuardRange: nonNegativeFinite,
  lapGuardSafetyCarThreshold: nonNegativeFinite,
  timeFormat: z.enum(['seconds', 'mmssmmm']),
  volumeButtonsEnabled: z.boolean(),
  showPenaltyLaps: z.boolean(),
}) satisfies z.ZodType<AudioSettings>;

// --- API request schemas (used by the Hono API in Phase 1+) ---

/**
 * Body for appending a lap to a live session. The device sends only the raw
 * time + when it happened + an idempotency key; the server derives
 * delta / lapType / lapValue from the team's lapTypeValues using @regularity/core.
 */
export const appendLapInputSchema = z.object({
  /** Idempotency key generated on-device so offline replays dedupe server-side. */
  clientLapId: z.string().uuid(),
  /** Which session_driver this lap belongs to. */
  sessionDriverId: z.string().uuid(),
  time: lapTimeSchema,
  /** Epoch ms when the lap was recorded on-device. */
  recordedAt: z.number().int().positive(),
  /** Optional manual overrides from long-press actions. */
  isChangeover: z.boolean().optional(),
  isSafety: z.boolean().optional(),
});
export type AppendLapInput = z.infer<typeof appendLapInputSchema>;

export const updateDriverInputSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  targetTime: targetTimeSchema.optional(),
  penaltyLaps: penaltyLapsSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateDriverInput = z.infer<typeof updateDriverInputSchema>;

export const createDriverInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  targetTime: targetTimeSchema,
});
export type CreateDriverInput = z.infer<typeof createDriverInputSchema>;

// --- First-login migration (import legacy local Team -> Postgres) ---

const importLapSchema = z.object({
  number: z.number().int(),
  time: lapTimeSchema,
  delta: finiteNumber,
  lapType: lapTypeSchema,
  lapValue: finiteNumber,
  timestamp: z.number().int(),
});

const importDriverSchema = z.object({
  name: z.string().trim().min(1).max(80),
  targetTime: targetTimeSchema,
  penaltyLaps: z.number().int().min(0).default(0),
  laps: z.array(importLapSchema).default([]),
});

/** A single completed session snapshot (one entry of legacy sessionHistory). */
export const sessionSnapshotSchema = z.object({
  id: z.string(),
  raceName: z.string().default(''),
  sessionNumber: z.string().default(''),
  sessionDuration: sessionDurationSchema.default(120),
  timestamp: z.number().int(),
  drivers: z.array(importDriverSchema).default([]),
});
export type SessionSnapshotInput = z.infer<typeof sessionSnapshotSchema>;

export const importTeamSchema = z.object({
  name: z.string().trim().max(120).default(''),
  raceName: z.string().trim().max(120).default(''),
  sessionNumber: z.string().trim().max(40).default(''),
  sessionDuration: sessionDurationSchema.default(120),
  lapTypeValues: lapTypeValuesSchema.optional(),
  drivers: z.array(importDriverSchema).default([]),
  sessionHistory: z.array(sessionSnapshotSchema).default([]),
});
export type ImportTeamInput = z.infer<typeof importTeamSchema>;

/** Bulk team meta + roster replace (the client's debounced "save team" call). */
export const teamStateSchema = z.object({
  name: z.string().trim().max(120).optional(),
  raceName: z.string().trim().max(120).optional(),
  sessionNumber: z.string().trim().max(40).optional(),
  sessionDuration: sessionDurationSchema.optional(),
  lapTypeValues: lapTypeValuesSchema.optional(),
  drivers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        targetTime: targetTimeSchema,
        penaltyLaps: z.number().int().min(0).default(0),
      }),
    )
    .optional(),
});
export type TeamStateInput = z.infer<typeof teamStateSchema>;

export const updateTeamInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  raceName: z.string().trim().max(120).optional(),
  sessionNumber: z.string().trim().max(40).optional(),
  sessionDuration: sessionDurationSchema.optional(),
  lapTypeValues: lapTypeValuesSchema.optional(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamInputSchema>;
