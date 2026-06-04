import { Driver, Lap } from './types';
import { calculateTrendLine } from './calculations';

/**
 * Pure reporting metrics shared by the app, live-view and PDF/CSV export.
 * "Regular" laps exclude changeover + safety-car laps (expected anomalies that
 * would otherwise pollute consistency / outlier / pace stats).
 */

const isRegular = (l: Lap): boolean => l.lapType !== 'changeover' && l.lapType !== 'safety';

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
/** Population standard deviation. */
function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

// --- Consistency / variance ---

export interface Consistency {
  count: number;
  deltaMean: number;
  /** Std dev of deltas — the headline consistency number (lower = steadier). */
  deltaStdDev: number;
  timeMean: number;
  timeStdDev: number;
  /** Coefficient of variation of lap times (timeStdDev / timeMean). */
  coefficientOfVariation: number;
}

export function calculateConsistency(laps: Lap[]): Consistency {
  const reg = laps.filter(isRegular);
  const deltas = reg.map((l) => l.delta);
  const times = reg.map((l) => l.time);
  const timeMean = mean(times);
  const timeStdDev = stdDev(times);
  return {
    count: reg.length,
    deltaMean: mean(deltas),
    deltaStdDev: stdDev(deltas),
    timeMean,
    timeStdDev,
    coefficientOfVariation: timeMean > 0 ? timeStdDev / timeMean : 0,
  };
}

// --- Stint analysis (segment by changeover boundaries) ---

export interface Stint {
  index: number;
  startLapNumber: number;
  laps: Lap[];
  count: number;
  avgDelta: number;
  /** Std dev of deltas within the stint (lower = steadier). */
  consistency: number;
  /** Most accurate regular lap (delta closest to 0). */
  best: Lap | null;
  /** Least accurate regular lap (delta furthest from 0). */
  worst: Lap | null;
}

/** Split a driver's laps into stints. A changeover lap begins a new stint. */
export function segmentStints(driver: Driver): Stint[] {
  const stints: Stint[] = [];
  let current: Lap[] = [];

  const flush = () => {
    if (!current.length) return;
    const reg = current.filter(isRegular);
    const deltas = reg.map((l) => l.delta);
    let best: Lap | null = null;
    let worst: Lap | null = null;
    for (const l of reg) {
      if (!best || Math.abs(l.delta) < Math.abs(best.delta)) best = l;
      if (!worst || Math.abs(l.delta) > Math.abs(worst.delta)) worst = l;
    }
    stints.push({
      index: stints.length,
      startLapNumber: current[0].number,
      laps: current,
      count: current.length,
      avgDelta: mean(deltas),
      consistency: stdDev(deltas),
      best,
      worst,
    });
    current = [];
  };

  for (const lap of driver.laps) {
    if (lap.lapType === 'changeover' && current.length) flush();
    current.push(lap);
  }
  flush();
  return stints;
}

// --- Outlier detection (flag mistakes beyond N·σ; safety/changeover excluded) ---

/** Lap numbers of regular laps whose delta is beyond `sigma` std devs of the mean. */
export function detectOutliers(laps: Lap[], sigma = 2): number[] {
  const reg = laps.filter(isRegular);
  if (reg.length < 3) return [];
  const deltas = reg.map((l) => l.delta);
  const m = mean(deltas);
  const sd = stdDev(deltas);
  if (sd === 0) return [];
  return reg.filter((l) => Math.abs(l.delta - m) > sigma * sd).map((l) => l.number);
}

// --- Pace trend (lap-time trend + projection) ---

export interface PaceTrend {
  /** Seconds per lap (lap-time slope). Negative = getting faster. */
  slope: number;
  direction: 'improving' | 'fading' | 'steady';
  startTime: number;
  endTime: number;
  /** Projected next lap time from the trend, or null with <2 laps. */
  projectedNext: number | null;
  count: number;
}

export function analyzePaceTrend(laps: Lap[], threshold = 0.05): PaceTrend {
  const reg = laps.filter(isRegular);
  const n = reg.length;
  if (n < 2) {
    const t = reg[0]?.time ?? 0;
    return { slope: 0, direction: 'steady', startTime: t, endTime: t, projectedNext: null, count: n };
  }
  const trend = calculateTrendLine(reg);
  const slope = (trend[n - 1] - trend[0]) / (n - 1);
  const direction = slope < -threshold ? 'improving' : slope > threshold ? 'fading' : 'steady';
  return { slope, direction, startTime: trend[0], endTime: trend[n - 1], projectedNext: trend[n - 1] + slope, count: n };
}

// --- Rolling delta average (for the chart overlay) ---

export interface RollingPoint {
  number: number;
  avgDelta: number;
}

/** Trailing-window rolling average of regular-lap deltas, aligned to lap number. */
export function rollingDeltaAverage(laps: Lap[], window = 3): RollingPoint[] {
  const reg = laps.filter(isRegular);
  const out: RollingPoint[] = [];
  for (let i = 0; i < reg.length; i++) {
    const slice = reg.slice(Math.max(0, i - window + 1), i + 1);
    out.push({ number: reg[i].number, avgDelta: mean(slice.map((l) => l.delta)) });
  }
  return out;
}
