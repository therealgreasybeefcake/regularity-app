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

export interface Team {
  id: number;
  name: string;
  raceName: string;
  sessionNumber: string;
  sessionDuration: number; // in minutes
  drivers: Driver[];
}

export interface AudioSettings {
  enabled: boolean;
  beforeTargetEnabled: boolean;
  afterLapStartEnabled: boolean;
  beforeTargetTime: number; // seconds before target
  afterLapStart: number; // seconds after lap start
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
