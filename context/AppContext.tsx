import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { Team, AudioSettings, LapTypeValues } from '../types';

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
      { id: 1, name: '', targetTime: 105, laps: [], penaltyLaps: 0 },
      { id: 2, name: '', targetTime: 105, laps: [], penaltyLaps: 0 },
      { id: 3, name: '', targetTime: 105, laps: [], penaltyLaps: 0 },
      { id: 4, name: '', targetTime: 105, laps: [], penaltyLaps: 0 },
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
  backgroundRecordingEnabled: false,
};

const DEFAULT_LAP_TYPE_VALUES: LapTypeValues = {
  bonus: 2,
  base: 1,
  changeover: 1,
  broken: 0,
  safety: 0,
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [teams, setTeams] = useState<Team[]>(DEFAULT_TEAMS);
  const [activeTeam, setActiveTeam] = useState(0);
  const [activeDriver, setActiveDriver] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS);
  const [lapTypeValues, setLapTypeValues] = useState<LapTypeValues>(DEFAULT_LAP_TYPE_VALUES);
  const [isLoading, setIsLoading] = useState(true);

  // Calculate isDarkMode based on theme mode and system preference
  const isDarkMode = themeMode === 'auto'
    ? systemColorScheme === 'dark'
    : themeMode === 'dark';

  // Load data from AsyncStorage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedTeams, savedActiveTeam, savedActiveDriver, savedThemeMode, savedAudio, savedLapValues] =
          await Promise.all([
            AsyncStorage.getItem('blindFreddyRaceTeams'),
            AsyncStorage.getItem('blindFreddyActiveTeam'),
            AsyncStorage.getItem('blindFreddyActiveDriver'),
            AsyncStorage.getItem('themeMode'),
            AsyncStorage.getItem('audioSettings'),
            AsyncStorage.getItem('lapTypeValues'),
          ]);

        if (savedTeams) {
          const parsedTeams = JSON.parse(savedTeams);
          // Migration: add sessionHistory if it doesn't exist
          const migratedTeams = parsedTeams.map((team: Team) => ({
            ...team,
            sessionHistory: team.sessionHistory || [],
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
          if (parsed.backgroundRecordingEnabled === undefined) parsed.backgroundRecordingEnabled = false;
          setAudioSettings(parsed);
        }
        if (savedLapValues) setLapTypeValues(JSON.parse(savedLapValues));
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Save teams to AsyncStorage
  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('blindFreddyRaceTeams', JSON.stringify(teams));
    }
  }, [teams, isLoading]);

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
