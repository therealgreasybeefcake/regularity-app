export type LapType = 'bonus' | 'base' | 'broken' | 'changeover' | 'safety';

export interface Lap {
  number: number;
  time: number; // in seconds
  delta: number; // difference from target
  lapType: LapType;
  lapValue: number;
  timestamp: number;
}

export interface Driver {
  id: number;
  name: string;
  targetTime: number; // in seconds
  penaltyLaps: number;
  laps: Lap[];
}

export interface Session {
  id: string;
  raceName: string;
  sessionNumber: string;
  sessionDuration: number; // in minutes
  timestamp: number;
  drivers: Driver[];
}

export interface Team {
  id: number;
  name: string;
  raceName: string;
  sessionNumber: string;
  sessionDuration: number; // in minutes
  drivers: Driver[];
  sessionHistory: Session[];
}

export interface AudioSettings {
  enabled: boolean;
  beforeTargetEnabled: boolean;
  afterLapStartEnabled: boolean;
  beforeTargetTime: number; // seconds before target
  afterLapStart: number; // seconds after lap start
  lapGuardEnabled: boolean; // enable lap recording guard
  lapGuardRange: number; // +/- seconds from target time to allow recording
}

export interface LapTypeValues {
  bonus: number;
  base: number;
  changeover: number;
  broken: number;
  safety: number;
}

export interface DriverStats {
  achievedLaps: number;
  netScore: number;
  baseLaps: number;
  bonusLaps: number;
  changeoverLaps: number;
  brokenLaps: number;
  safetyLaps: number;
  averageDelta: number;
  threelapAvg: number | null;
  averageLapTime: number;
  goalLaps: number;
}

export interface TeamStats {
  goalLaps: number;
  achievedLaps: number;
  percentageFactor: number;
}

export interface ThemeColors {
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  bonus: string;
  base: string;
  broken: string;
  changeover: string;
  safety: string;
  warning: string;
}
