import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme, Alert } from 'react-native';
import { Team, AudioSettings, LapTypeValues, Session, SyncStatus } from '../types';
import { useAuth } from './AuthContext';
import { S3SyncService } from '../services/S3SyncService';

export type ThemeMode = 'light' | 'dark' | 'auto';

interface AppContextType {
  teams: Team[];
  setTeams: (teams: Team[]) => void;
  activeTeam: number;
  setActiveTeam: (index: number) => void;
  activeDriver: number;
  setActiveDriver: (index: number) => void;
  isDarkMode: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  audioSettings: AudioSettings;
  setAudioSettings: (settings: AudioSettings) => void;
  lapTypeValues: LapTypeValues;
  setLapTypeValues: (values: LapTypeValues) => void;
  isLoading: boolean;
  hasSeenWelcome: boolean;
  setHasSeenWelcome: (value: boolean) => void;
  syncStatus: SyncStatus;
  saveSessionToS3: (session: Session) => Promise<void>;
  loadSessionsFromS3: () => Promise<Session[]>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_TEAMS: Team[] = [
  {
    id: 1,
    name: '',
    raceName: '',
    sessionNumber: '',
    sessionDuration: 120,
    drivers: [
      { id: 1, name: 'Driver A', targetTime: 105, laps: [], penaltyLaps: 0 },
      { id: 2, name: 'Driver B', targetTime: 105, laps: [], penaltyLaps: 0 },
      { id: 3, name: 'Driver C', targetTime: 105, laps: [], penaltyLaps: 0 },
      { id: 4, name: 'Driver D', targetTime: 105, laps: [], penaltyLaps: 0 },
    ],
    sessionHistory: [],
  },
];

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: true,
  beforeTargetEnabled: true,
  afterLapStartEnabled: true,
  beforeTargetTime: 10,
  afterLapStart: 15,
  lapGuardEnabled: false,
  lapGuardRange: 15,
  lapGuardSafetyCarThreshold: 30,
  timeFormat: 'seconds',
  volumeButtonsEnabled: false,
  showPenaltyLaps: true,
};

const DEFAULT_LAP_TYPE_VALUES: LapTypeValues = {
  bonus: 2,
  base: 1,
  changeover: 1,
  broken: 0,
  safety: 0,
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, getCredentials } = useAuth();
  const systemColorScheme = useColorScheme();
  const [teams, setTeams] = useState<Team[]>(DEFAULT_TEAMS);
  const [activeTeam, setActiveTeam] = useState(0);
  const [activeDriver, setActiveDriver] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS);
  const [lapTypeValues, setLapTypeValues] = useState<LapTypeValues>(DEFAULT_LAP_TYPE_VALUES);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const s3SyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDoneRef = useRef(false);

  // Calculate isDarkMode based on theme mode and system preference
  const isDarkMode = themeMode === 'auto'
    ? systemColorScheme === 'dark'
    : themeMode === 'dark';

  // Load data from AsyncStorage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedTeams, savedActiveTeam, savedActiveDriver, savedThemeMode, savedAudio, savedLapValues, savedWelcome] =
          await Promise.all([
            AsyncStorage.getItem('blindFreddyRaceTeams'),
            AsyncStorage.getItem('blindFreddyActiveTeam'),
            AsyncStorage.getItem('blindFreddyActiveDriver'),
            AsyncStorage.getItem('themeMode'),
            AsyncStorage.getItem('audioSettings'),
            AsyncStorage.getItem('lapTypeValues'),
            AsyncStorage.getItem('hasSeenWelcome'),
          ]);

        if (savedTeams) {
          const parsedTeams = JSON.parse(savedTeams);
          // Migration: add sessionHistory if it doesn't exist and fix empty driver names
          const migratedTeams = parsedTeams.map((team: Team) => ({
            ...team,
            sessionHistory: team.sessionHistory || [],
            drivers: team.drivers.map((driver, index) => ({
              ...driver,
              name: driver.name || `Driver ${String.fromCharCode(65 + index)}`,
            })),
          }));
          setTeams(migratedTeams);
        }
        if (savedActiveTeam !== null) setActiveTeam(JSON.parse(savedActiveTeam));
        if (savedActiveDriver !== null) setActiveDriver(JSON.parse(savedActiveDriver));
        if (savedThemeMode) setThemeMode(savedThemeMode as ThemeMode);
        if (savedAudio) {
          const parsed = JSON.parse(savedAudio);
          if (parsed.enabled === undefined) parsed.enabled = true;
          if (parsed.beforeTargetEnabled === undefined) parsed.beforeTargetEnabled = true;
          if (parsed.afterLapStartEnabled === undefined) parsed.afterLapStartEnabled = true;
          if (parsed.lapGuardEnabled === undefined) parsed.lapGuardEnabled = false;
          if (parsed.lapGuardRange === undefined) parsed.lapGuardRange = 15;
          if (parsed.lapGuardSafetyCarThreshold === undefined) parsed.lapGuardSafetyCarThreshold = 30;
          if (parsed.timeFormat === undefined) parsed.timeFormat = 'seconds';
          if (parsed.volumeButtonsEnabled === undefined) parsed.volumeButtonsEnabled = false;
          if (parsed.showPenaltyLaps === undefined) parsed.showPenaltyLaps = true;
          // Remove old backgroundRecordingEnabled if it exists
          delete parsed.backgroundRecordingEnabled;
          setAudioSettings(parsed);
        }
        if (savedLapValues) setLapTypeValues(JSON.parse(savedLapValues));
        if (savedWelcome !== null) setHasSeenWelcome(JSON.parse(savedWelcome));
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Fix empty driver names on every render (defensive)
  useEffect(() => {
    if (!isLoading) {
      const needsFix = teams.some(team =>
        team.drivers.some(driver => !driver.name || driver.name.trim() === '')
      );

      if (needsFix) {
        const fixedTeams = teams.map(team => ({
          ...team,
          drivers: team.drivers.map((driver, index) => ({
            ...driver,
            name: driver.name && driver.name.trim() !== ''
              ? driver.name
              : `Driver ${String.fromCharCode(65 + index)}`,
          })),
        }));
        setTeams(fixedTeams);
      }
    }
  }, [isLoading]);

  // S3 sync: load from S3 after local data is ready
  useEffect(() => {
    if (!isLoading && isAuthenticated && !initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      (async () => {
        try {
          setSyncStatus('syncing');
          const creds = await getCredentials();
          if (!creds) {
            console.warn('[S3Sync] No credentials on initial load');
            setSyncStatus('offline');
            return;
          }

          // Try new format first
          console.log('[S3Sync] Loading team from S3...');
          let s3Team = await S3SyncService.loadTeam(creds);

          if (!s3Team) {
            // Fall back to legacy migration
            console.log('[S3Sync] No team.json found, trying legacy migration...');
            const migratedTeam = await S3SyncService.migrateFromLegacy(creds);
            if (migratedTeam) {
              setTeams([migratedTeam]);
              setSyncStatus('synced');
              return;
            }
          }

          if (s3Team) {
            // Merge with local sessionHistory — sessions are loaded lazily from S3 via loadSessionsFromS3
            const localTeam = teams[0];
            const fullTeam: Team = {
              ...s3Team,
              sessionHistory: localTeam?.sessionHistory || [],
            };
            setTeams([fullTeam]);
          }
          setSyncStatus('synced');
        } catch (error: any) {
          console.error('[S3Sync] Load error:', error);
          setSyncStatus('error');
        }
      })();
    }
  }, [isLoading, isAuthenticated]);

  // Save teams to AsyncStorage + debounced S3 sync
  useEffect(() => {
    if (!isLoading) {
      const timeout = setTimeout(() => {
        AsyncStorage.setItem('blindFreddyRaceTeams', JSON.stringify(teams));
      }, 300);

      // Debounced S3 sync (2 seconds) — saves team data only (no sessionHistory)
      if (isAuthenticated) {
        if (s3SyncTimeoutRef.current) clearTimeout(s3SyncTimeoutRef.current);
        s3SyncTimeoutRef.current = setTimeout(async () => {
          try {
            setSyncStatus('syncing');
            const creds = await getCredentials();
            if (!creds) {
              console.warn('[S3Sync] No credentials available');
              setSyncStatus('offline');
              return;
            }
            const team = teams[0]; // Single-team app
            if (team) {
              console.log('[S3Sync] Saving team to S3...');
              await S3SyncService.saveTeam(creds, team);
              console.log('[S3Sync] Save successful');
            }
            setSyncStatus('synced');
          } catch (error: any) {
            console.error('[S3Sync] Error:', error);
            Alert.alert('S3 Sync Error', error?.message || String(error));
            setSyncStatus('error');
          }
        }, 2000);
      } else {
        console.log('[S3Sync] Not authenticated, skipping sync');
      }

      return () => {
        clearTimeout(timeout);
      };
    }
  }, [teams, isLoading, isAuthenticated]);

  // Save a single session to S3
  const saveSessionToS3 = useCallback(async (session: Session) => {
    if (!isAuthenticated) return;
    try {
      const creds = await getCredentials();
      if (!creds) return;
      await S3SyncService.saveSession(creds, session);
      console.log('[S3Sync] Session saved:', session.id);
    } catch (error: any) {
      console.error('[S3Sync] Error saving session:', error);
      Alert.alert('S3 Sync Error', `Failed to save session: ${error?.message || String(error)}`);
    }
  }, [isAuthenticated, getCredentials]);

  // Load all sessions from S3
  const loadSessionsFromS3 = useCallback(async (): Promise<Session[]> => {
    if (!isAuthenticated) return [];
    try {
      const creds = await getCredentials();
      if (!creds) return [];
      return await S3SyncService.loadSessions(creds);
    } catch (error: any) {
      console.error('[S3Sync] Error loading sessions:', error);
      return [];
    }
  }, [isAuthenticated, getCredentials]);

  // Save active indices
  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('blindFreddyActiveTeam', JSON.stringify(activeTeam));
      AsyncStorage.setItem('blindFreddyActiveDriver', JSON.stringify(activeDriver));
    }
  }, [activeTeam, activeDriver, isLoading]);

  // Save theme mode
  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('themeMode', themeMode);
    }
  }, [themeMode, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('audioSettings', JSON.stringify(audioSettings));
    }
  }, [audioSettings, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('lapTypeValues', JSON.stringify(lapTypeValues));
    }
  }, [lapTypeValues, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('hasSeenWelcome', JSON.stringify(hasSeenWelcome));
    }
  }, [hasSeenWelcome, isLoading]);

  return (
    <AppContext.Provider
      value={{
        teams,
        setTeams,
        activeTeam,
        setActiveTeam,
        activeDriver,
        setActiveDriver,
        isDarkMode,
        themeMode,
        setThemeMode,
        audioSettings,
        setAudioSettings,
        lapTypeValues,
        setLapTypeValues,
        isLoading,
        hasSeenWelcome,
        setHasSeenWelcome,
        syncStatus,
        saveSessionToS3,
        loadSessionsFromS3,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
