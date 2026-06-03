import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { Team, Driver, AudioSettings, LapTypeValues, Session, Lap, SyncStatus } from '../types';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';
import { syncQueue, type SyncState } from '../lib/syncQueue';
import { randomUuid, deterministicUuid } from '../lib/uuid';
import { WEB_URL } from '../constants/config';

interface LiveSessionState {
  id: string;
  publicToken: string;
  sessionDriverIds: string[];
}

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
  // Persist a finished session to the API (durable offline queue). Kept under
  // the original name so existing callers (StatsScreen) don't change.
  saveSessionToS3: (session: Session) => Promise<void>;
  // Load completed-session history from the API (for new devices / Stats).
  loadSessionsFromS3: () => Promise<Session[]>;
  // Live session for the real-time web view (laps streamed as recorded).
  liveSession: { id: string; publicToken: string } | null;
  liveShareUrl: string | null;
  endLiveSession: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// --- Server response shapes ---
interface ServerTeam {
  id: string;
  name: string;
  raceName: string;
  sessionNumber: string;
  sessionDurationMin: number;
  lapTypeValues: LapTypeValues;
}
interface ServerDriver {
  id: string;
  name: string;
  targetTimeSec: number;
  penaltyLaps: number;
  sortOrder: number;
}
interface TeamMeResponse {
  team: ServerTeam;
  drivers: ServerDriver[];
}
interface ServerSessionRow {
  id: string;
  clientSessionId: string | null;
  status: 'live' | 'ended';
}
interface ServerSessionPayload {
  id: string;
  raceName: string;
  sessionNumber: string;
  sessionDurationMin: number;
  startedAt: string;
  endedAt: string | null;
  drivers: Array<{ name: string; targetTime: number; penaltyLaps: number; laps: Lap[] }>;
}

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

function mapStatus(state: SyncState): SyncStatus {
  switch (state) {
    case 'syncing':
    case 'pending':
      return 'syncing';
    case 'error':
      return 'error';
    case 'idle':
    default:
      return 'synced';
  }
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
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

  const [liveSession, setLiveSession] = useState<{ id: string; publicToken: string } | null>(null);

  const serverTeamIdRef = useRef<string | null>(null);
  const syncedUserRef = useRef<string | null>(null);
  const teamsRef = useRef(teams);
  const lapTypeValuesRef = useRef(lapTypeValues);
  const liveSessionRef = useRef<LiveSessionState | null>(null);
  const streamedKeysRef = useRef<Set<string>>(new Set());
  const prevLapTotalRef = useRef(0);
  teamsRef.current = teams;
  lapTypeValuesRef.current = lapTypeValues;

  const isDarkMode =
    themeMode === 'auto' ? systemColorScheme === 'dark' : themeMode === 'dark';

  // --- Local load + sync queue init ---
  useEffect(() => {
    syncQueue.init();
    const unsub = syncQueue.subscribe((state) => {
      // Only reflect queue state once we're authenticated/synced.
      if (serverTeamIdRef.current) setSyncStatus(mapStatus(state));
    });
    return unsub;
  }, []);

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
        setTeams(teams.map(team => ({
          ...team,
          drivers: team.drivers.map((driver, index) => ({
            ...driver,
            name: driver.name && driver.name.trim() !== ''
              ? driver.name
              : `Driver ${String.fromCharCode(65 + index)}`,
          })),
        })));
      }
    }
  }, [isLoading]);

  // Build the bulk team payload (meta + roster) the API expects.
  const buildTeamPayload = useCallback(() => {
    const team = teamsRef.current[0];
    return {
      name: team?.name ?? '',
      raceName: team?.raceName ?? '',
      sessionNumber: team?.sessionNumber ?? '',
      sessionDuration: team?.sessionDuration ?? 120,
      lapTypeValues: lapTypeValuesRef.current,
      drivers: (team?.drivers ?? []).map((d) => ({
        name: d.name,
        targetTime: d.targetTime,
        penaltyLaps: d.penaltyLaps,
      })),
    };
  }, []);

  // --- Initial server sync / first-login migration (runs once per user) ---
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if (syncedUserRef.current === user) return;
    syncedUserRef.current = user;

    (async () => {
      try {
        setSyncStatus('syncing');
        const me = await api.get<TeamMeResponse>('/api/teams/me');
        serverTeamIdRef.current = me.team.id;

        // One-time migration of legacy local data into Postgres.
        const migratedKey = `migratedToApi:${user}`;
        const alreadyMigrated = await AsyncStorage.getItem(migratedKey);
        const local = teamsRef.current[0];
        const localMeaningful =
          !!local &&
          ((local.sessionHistory?.length ?? 0) > 0 ||
            local.drivers.some((d) => d.laps.length > 0) ||
            !!local.name?.trim());

        if (!alreadyMigrated) {
          if (localMeaningful) {
            await api.post('/api/teams/import', {
              name: local.name,
              raceName: local.raceName,
              sessionNumber: local.sessionNumber,
              sessionDuration: local.sessionDuration,
              lapTypeValues: lapTypeValuesRef.current,
              drivers: local.drivers.map((d) => ({
                name: d.name,
                targetTime: d.targetTime,
                penaltyLaps: d.penaltyLaps,
                laps: d.laps,
              })),
              sessionHistory: local.sessionHistory ?? [],
            });
          }
          await AsyncStorage.setItem(migratedKey, '1');
        }

        const fresh = await api.get<TeamMeResponse>('/api/teams/me');
        serverTeamIdRef.current = fresh.team.id;

        if (fresh.drivers.length > 0) {
          // Server is authoritative for meta + roster; keep local sessionHistory.
          const localHistory = teamsRef.current[0]?.sessionHistory ?? [];
          const hydrated: Team = {
            id: 1,
            name: fresh.team.name,
            raceName: fresh.team.raceName,
            sessionNumber: fresh.team.sessionNumber,
            sessionDuration: fresh.team.sessionDurationMin,
            drivers: fresh.drivers.map((d, i) => ({
              id: i + 1,
              name: d.name,
              targetTime: d.targetTimeSec,
              penaltyLaps: d.penaltyLaps,
              laps: [],
            })),
            sessionHistory: localHistory,
          };
          setTeams([hydrated]);
          setLapTypeValues(fresh.team.lapTypeValues);
        } else {
          // Server has no roster yet — push our local team up.
          await syncQueue.enqueue({ kind: 'putTeam', teamId: fresh.team.id, payload: buildTeamPayload() });
        }
        setSyncStatus(syncQueue.pending > 0 ? 'syncing' : 'synced');
      } catch (e) {
        // Offline or server unreachable — stay on local data.
        console.warn('[sync] initial sync failed (working offline):', e);
        setSyncStatus('offline');
      }
    })();
  }, [isLoading, isAuthenticated, user, buildTeamPayload]);

  // Reset sync gate on sign-out so a different user re-syncs.
  useEffect(() => {
    if (!isAuthenticated) {
      syncedUserRef.current = null;
      serverTeamIdRef.current = null;
      setSyncStatus('offline');
    }
  }, [isAuthenticated]);

  // Persist teams locally (debounced) + push meta/roster to the API.
  useEffect(() => {
    if (isLoading) return;
    const timeout = setTimeout(() => {
      AsyncStorage.setItem('blindFreddyRaceTeams', JSON.stringify(teams));
      if (serverTeamIdRef.current && syncedUserRef.current) {
        syncQueue.enqueue({
          kind: 'putTeam',
          teamId: serverTeamIdRef.current,
          payload: buildTeamPayload(),
        });
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [teams, lapTypeValues, isLoading, buildTeamPayload]);

  // Persist a finished session to the API (durable, idempotent on session.id).
  const saveSessionToS3 = useCallback(async (session: Session) => {
    const teamId = serverTeamIdRef.current;
    if (!teamId) return;
    await syncQueue.enqueue({ kind: 'completeSession', teamId, payload: session });
  }, []);

  // Load completed-session history from the API.
  const loadSessionsFromS3 = useCallback(async (): Promise<Session[]> => {
    const teamId = serverTeamIdRef.current;
    if (!teamId) return [];
    try {
      const { sessions } = await api.get<{ sessions: ServerSessionRow[] }>(
        `/api/teams/${teamId}/sessions`,
      );
      const ended = sessions.filter((s) => s.status === 'ended');
      const full = await Promise.all(
        ended.map((s) => api.get<ServerSessionPayload>(`/api/sessions/${s.id}`).then((p) => ({ p, row: s }))),
      );
      return full.map(({ p, row }) => ({
        id: row.clientSessionId ?? p.id,
        raceName: p.raceName,
        sessionNumber: p.sessionNumber,
        sessionDuration: p.sessionDurationMin,
        timestamp: Date.parse(p.endedAt ?? p.startedAt) || Date.now(),
        drivers: p.drivers.map((d, i): Driver => ({
          id: i + 1,
          name: d.name,
          targetTime: d.targetTime,
          penaltyLaps: d.penaltyLaps,
          laps: d.laps,
        })),
      }));
    } catch (e) {
      console.warn('[sync] loadSessions failed:', e);
      return [];
    }
  }, []);

  // --- Live session (real-time web view) ---

  // Restore an in-progress live session across app restarts.
  useEffect(() => {
    AsyncStorage.getItem('liveSessionState').then((raw) => {
      if (!raw) return;
      try {
        const s: LiveSessionState = JSON.parse(raw);
        liveSessionRef.current = s;
        setLiveSession({ id: s.id, publicToken: s.publicToken });
      } catch {
        // ignore corrupt state
      }
    });
  }, []);

  const startLiveSessionInternal = useCallback(async (): Promise<LiveSessionState | null> => {
    const teamId = serverTeamIdRef.current;
    const team = teamsRef.current[0];
    if (!teamId || !team) return null;
    const id = randomUuid();
    const publicToken = randomUuid();
    const sessionDriverIds = team.drivers.map(() => randomUuid());
    const state: LiveSessionState = { id, publicToken, sessionDriverIds };
    liveSessionRef.current = state;
    setLiveSession({ id, publicToken });
    await AsyncStorage.setItem('liveSessionState', JSON.stringify(state));
    await syncQueue.enqueue({
      kind: 'startSession',
      teamId,
      payload: {
        id,
        publicToken,
        raceName: team.raceName,
        sessionNumber: team.sessionNumber,
        sessionDuration: team.sessionDuration,
        drivers: team.drivers.map((d, i) => ({
          id: sessionDriverIds[i],
          name: d.name,
          targetTime: d.targetTime,
          penaltyLaps: d.penaltyLaps,
        })),
      },
    });
    return state;
  }, []);

  const endLiveSession = useCallback(async () => {
    const live = liveSessionRef.current;
    if (!live) return;
    liveSessionRef.current = null;
    setLiveSession(null);
    streamedKeysRef.current.clear();
    prevLapTotalRef.current = 0;
    await AsyncStorage.removeItem('liveSessionState');
    await syncQueue.enqueue({ kind: 'endSession', sessionId: live.id });
  }, []);

  const streamLap = useCallback(
    async (driverIndex: number, lap: Lap) => {
      if (!serverTeamIdRef.current) return;
      let live = liveSessionRef.current;
      if (!live) {
        live = await startLiveSessionInternal();
        if (!live) return;
      }
      const sessionDriverId = live.sessionDriverIds[driverIndex];
      if (!sessionDriverId) return;
      await syncQueue.enqueue({
        kind: 'appendLap',
        sessionId: live.id,
        payload: {
          clientLapId: deterministicUuid(`${live.id}:${sessionDriverId}:${lap.timestamp}`),
          sessionDriverId,
          time: lap.time,
          recordedAt: lap.timestamp,
          isChangeover: lap.lapType === 'changeover',
          isSafety: lap.lapType === 'safety',
        },
      });
    },
    [startLiveSessionInternal],
  );

  // Watch local laps and stream new ones to the live session. Auto-ends when all
  // laps clear (session ended/reset). Deliberately diff-based so the timer screen
  // needs no changes.
  useEffect(() => {
    if (isLoading || !serverTeamIdRef.current) return;
    const team = teams[0];
    if (!team) return;
    const total = team.drivers.reduce((sum, d) => sum + d.laps.length, 0);

    if (prevLapTotalRef.current > 0 && total === 0) {
      if (liveSessionRef.current) void endLiveSession();
      return;
    }
    prevLapTotalRef.current = total;
    if (total === 0) return;

    (async () => {
      for (let i = 0; i < team.drivers.length; i++) {
        for (const lap of team.drivers[i].laps) {
          const key = `${i}:${lap.timestamp}`;
          if (streamedKeysRef.current.has(key)) continue;
          streamedKeysRef.current.add(key);
          await streamLap(i, lap);
        }
      }
    })();
  }, [teams, isLoading, endLiveSession, streamLap]);

  const liveShareUrl = liveSession ? `${WEB_URL}/live/${liveSession.publicToken}` : null;

  // Save active indices
  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('blindFreddyActiveTeam', JSON.stringify(activeTeam));
      AsyncStorage.setItem('blindFreddyActiveDriver', JSON.stringify(activeDriver));
    }
  }, [activeTeam, activeDriver, isLoading]);

  useEffect(() => {
    if (!isLoading) AsyncStorage.setItem('themeMode', themeMode);
  }, [themeMode, isLoading]);

  useEffect(() => {
    if (!isLoading) AsyncStorage.setItem('audioSettings', JSON.stringify(audioSettings));
  }, [audioSettings, isLoading]);

  useEffect(() => {
    if (!isLoading) AsyncStorage.setItem('lapTypeValues', JSON.stringify(lapTypeValues));
  }, [lapTypeValues, isLoading]);

  useEffect(() => {
    if (!isLoading) AsyncStorage.setItem('hasSeenWelcome', JSON.stringify(hasSeenWelcome));
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
        liveSession,
        liveShareUrl,
        endLiveSession,
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
