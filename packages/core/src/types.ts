// Pure domain types shared across the mobile app, the web live-view, and the API.
// MUST stay free of any React Native / Expo imports so the Node API can import it.

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
  lapGuardSafetyCarThreshold: number; // seconds over target to automatically allow as safety car
  timeFormat: 'seconds' | 'mmssmmm'; // display format for times
  volumeButtonsEnabled: boolean; // enable volume buttons to record laps
  showPenaltyLaps: boolean; // show/hide penalty laps field in driver screen
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

export type SyncStatus = 'synced' | 'syncing' | 'error' | 'offline';
