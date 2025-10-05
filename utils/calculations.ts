import { Driver, Lap, LapType, LapTypeValues, DriverStats, Team, TeamStats } from '../types';

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
};

export const formatTimeWithMilliseconds = (seconds: number): string => {
  return `${seconds.toFixed(3)}s`;
};

export const parseTimeInput = (timeString: string): number | null => {
  if (!timeString) return null;
  const parts = timeString.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0]) || 0;
    const secs = parseFloat(parts[1]) || 0;
    return mins * 60 + secs;
  } else if (parts.length === 1) {
    return parseFloat(timeString);
  }
  return null;
};

export const calculateLapType = (
  delta: number,
  isChangeover: boolean = false,
  isSafety: boolean = false
): LapType => {
  if (isChangeover) return 'changeover';
  if (isSafety) return 'safety';

  if (delta < 0) return 'broken';
  if (delta >= 0 && delta <= 0.99) return 'bonus';
  return 'base';
};

export const calculateLapValue = (lapType: LapType, lapTypeValues: LapTypeValues): number => {
  return lapTypeValues[lapType];
};

export const calculateDriverStats = (
  driver: Driver,
  lapTypeValues: LapTypeValues,
  teamDrivers: Driver[],
  sessionDuration: number
): DriverStats => {
  const laps = driver.laps;

  // Achieved laps
  const achievedLaps = laps.reduce((sum, lap) => sum + lap.lapValue, 0) - driver.penaltyLaps;

  // Lap counts
  const bonusLaps = laps.filter(l => l.lapType === 'bonus').length;
  const brokenLaps = laps.filter(l => l.lapType === 'broken').length;
  const baseLaps = laps.length;
  const changeoverLaps = laps.filter(l => l.lapType === 'changeover').length;
  const safetyLaps = laps.filter(l => l.lapType === 'safety').length;

  // Net score
  const netScore = bonusLaps - brokenLaps;

  // Average delta
  const averageDelta = laps.length > 0
    ? laps.reduce((sum, lap) => sum + lap.delta, 0) / laps.length
    : 0;

  // 3-lap rolling average (exclude changeover and safety)
  const regularLaps = laps.filter(l => l.lapType !== 'changeover' && l.lapType !== 'safety');
  const last3Laps = regularLaps.slice(-3);
  const threelapAvg = last3Laps.length === 3
    ? last3Laps.reduce((sum, lap) => sum + lap.delta, 0) / 3
    : null;

  // Average lap time
  const averageLapTime = laps.length > 0
    ? laps.reduce((sum, lap) => sum + lap.time, 0) / laps.length
    : 0;

  // Goal laps (Winton formula)
  const teamTotal = teamDrivers.reduce((sum, d) => {
    const driverLaps = d.laps.filter(l => l.lapType === 'base' || l.lapType === 'changeover');
    return sum + driverLaps.length;
  }, 0);

  const driverTotal = laps.filter(l => l.lapType === 'base' || l.lapType === 'changeover').length;
  const percentage = teamTotal > 0 ? driverTotal / teamTotal : 0;
  const goalLaps = driver.targetTime > 0 && sessionDuration > 0
    ? (percentage * sessionDuration * 60 / driver.targetTime) * 2
    : 0;

  return {
    achievedLaps,
    netScore,
    baseLaps,
    bonusLaps,
    changeoverLaps,
    brokenLaps,
    safetyLaps,
    averageDelta,
    threelapAvg,
    averageLapTime,
    goalLaps,
  };
};

export const calculateTeamStats = (team: Team, lapTypeValues: LapTypeValues): TeamStats => {
  let totalGoalLaps = 0;
  let totalAchievedLaps = 0;

  team.drivers.forEach(driver => {
    const stats = calculateDriverStats(driver, lapTypeValues, team.drivers, team.sessionDuration);
    totalGoalLaps += stats.goalLaps;
    totalAchievedLaps += stats.achievedLaps;
  });

  const percentageFactor = totalGoalLaps > 0 ? (totalAchievedLaps / totalGoalLaps) * 100 : 0;

  return {
    goalLaps: totalGoalLaps,
    achievedLaps: totalAchievedLaps,
    percentageFactor,
  };
};

export const getSignalColor = (
  threelapAvg: number | null,
  previousLapType: LapType | null
): 'red' | 'green' | 'blue' | 'gray' => {
  if (threelapAvg === null) return 'gray';
  if (previousLapType === 'broken') return 'red';
  if (threelapAvg >= 0.3 && threelapAvg < 1.0) return 'green';
  if (threelapAvg < 0.3) return 'red';
  return 'blue';
};

export const calculateTrendLine = (laps: Lap[]): number[] => {
  const n = laps.length;
  if (n < 2) return laps.map(l => l.time);

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  laps.forEach((lap, i) => {
    sumX += i;
    sumY += lap.time;
    sumXY += i * lap.time;
    sumX2 += i * i;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return laps.map((_, i) => slope * i + intercept);
};
