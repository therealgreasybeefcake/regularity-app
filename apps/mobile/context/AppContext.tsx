import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme, AppState } from 'react-native';
import { Team, Driver, AudioSettings, LapTypeValues, Session, Lap, SyncStatus } from '../types';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';
import { subscribeTeamEvents } from '../lib/teamEvents';
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
  // --- Shared teams ---
  /** Every team the signed-in user belongs to (id + name + their role). */
  memberships: TeamMembership[];
  /** The caller's role on the active team (null until synced). */
  userRole: TeamRole | null;
  /** Server UUID of the active team (null until synced). */
  activeServerTeamId: string | null;
  /** Switch the active team — reloads its roster/settings/history. */
  switchTeam: (serverTeamId: string) => Promise<void>;
  /** Re-fetch the membership list (after joining/leaving/role changes). */
  refreshMemberships: () => Promise<void>;
  /** Accept an invite (token or code), then switch to the joined team. */
  joinTeam: (opts: { token?: string; code?: string }) => Promise<{ ok: boolean; error?: string; teamName?: string }>;
  /** Public token of the active team's current live session (any member's), or null. */
  teamLivePublicToken: string | null;
  /** Re-check whether the active team currently has a live session. */
  refreshTeamLive: () => Promise<void>;
  /** Auto-open a teammate's live session when one starts (user preference). */
  autoJoinLive: boolean;
  setAutoJoinLive: (v: boolean) => void;
  /** Default sound state for the live spectator view (user preference). */
  liveSoundDefault: boolean;
  setLiveSoundDefault: (v: boolean) => void;
  // Persist a finished session to the API (durable offline queue). Kept under
  // the original name so existing callers (StatsScreen) don't change.
  saveSessionToS3: (session: Session) => Promise<void>;
  // Load completed-session history from the API (for new devices / Stats).
  loadSessionsFromS3: () => Promise<Session[]>;
  // Live session for the real-time web view (laps streamed as recorded).
  liveSession: { id: string; publicToken: string } | null;
  liveShareUrl: string | null;
  endLiveSession: () => Promise<void>;
  discardLiveSession: () => Promise<void>;
  /** Kill switch: end any live session(s) the server still has for the team. */
  endActiveLiveSession: () => Promise<void>;
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
  linkedUserId: string | null;
}
interface TeamMeResponse {
  team: ServerTeam;
  drivers: ServerDriver[];
}
export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';
export interface TeamMembership {
  id: string;
  name: string;
  role: TeamRole;
}
interface TeamByIdResponse extends TeamMeResponse {
  role: TeamRole;
}
const ROLE_RANK: Record<TeamRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
/** True if `role` can edit roster/settings (owner|admin). */
export function canEditTeam(role: TeamRole | null): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK.admin;
}
/** True if `role` can record laps / run sessions (owner|admin|member). */
export function canRecord(role: TeamRole | null): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK.member;
}

// --- Granular roster sync helpers (diff the local roster vs the last server
// state and emit per-driver create/patch/delete ops keyed by server driver id,
// so two editors never clobber each other via a full-roster replace). ---
type DriverFields = { name: string; targetTime: number; penaltyLaps: number; linkedUserId: string | null };
type TeamSettings = { name: string; raceName: string; sessionNumber: string; sessionDuration: number; lapTypeValues: LapTypeValues };
interface SyncedSnapshot {
  settings: TeamSettings | null;
  drivers: Map<string, DriverFields>; // keyed by server driver id
}
function driverFields(d: Driver): DriverFields {
  return { name: d.name, targetTime: d.targetTime, penaltyLaps: d.penaltyLaps, linkedUserId: d.linkedUserId ?? null };
}
function driverFieldsEqual(a: DriverFields, b: DriverFields): boolean {
  return a.name === b.name && a.targetTime === b.targetTime && a.penaltyLaps === b.penaltyLaps && a.linkedUserId === b.linkedUserId;
}
function teamSettings(team: Team, ltv: LapTypeValues): TeamSettings {
  return {
    name: team.name ?? '',
    raceName: team.raceName ?? '',
    sessionNumber: team.sessionNumber ?? '',
    sessionDuration: team.sessionDuration ?? 120,
    lapTypeValues: ltv,
  };
}
function settingsEqual(a: TeamSettings, b: TeamSettings): boolean {
  return (
    a.name === b.name &&
    a.raceName === b.raceName &&
    a.sessionNumber === b.sessionNumber &&
    a.sessionDuration === b.sessionDuration &&
    JSON.stringify(a.lapTypeValues) === JSON.stringify(b.lapTypeValues)
  );
}
/** Capture a synced snapshot from a hydrated team whose drivers carry serverId. */
function snapshotFrom(drivers: Driver[], settings: TeamSettings): SyncedSnapshot {
  const map = new Map<string, DriverFields>();
  for (const d of drivers) if (d.serverId) map.set(d.serverId, driverFields(d));
  return { settings, drivers: map };
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
  const [autoJoinLive, setAutoJoinLive] = useState(false);
  const [liveSoundDefault, setLiveSoundDefault] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [userRole, setUserRole] = useState<TeamRole | null>(null);
  const [activeServerTeamId, setActiveServerTeamId] = useState<string | null>(null);
  const [teamLivePublicToken, setTeamLivePublicToken] = useState<string | null>(null);

  const [liveSession, setLiveSession] = useState<{ id: string; publicToken: string } | null>(null);

  const userRoleRef = useRef<TeamRole | null>(null);
  userRoleRef.current = userRole;
  // Suppresses the next debounced roster push when a teams change came from a
  // remote sync (reloadActiveTeam) — prevents an A↔B push/broadcast ping-pong.
  const suppressPushRef = useRef(false);
  // Last roster/settings state we've synced to the server, for diffing.
  const lastSyncedRef = useRef<SyncedSnapshot>({ settings: null, drivers: new Map() });
  const serverTeamIdRef = useRef<string | null>(null);
  const syncedUserRef = useRef<string | null>(null);
  const teamsRef = useRef(teams);
  const lapTypeValuesRef = useRef(lapTypeValues);
  const liveSessionRef = useRef<LiveSessionState | null>(null);
  const streamedKeysRef = useRef<Set<string>>(new Set());
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

  // Hydrate the active team's roster + settings from the server (login + switch).
  // Session history is loaded lazily by StatsScreen via loadSessionsFromS3.
  const loadTeam = useCallback(async (serverTeamId: string) => {
    const res = await api.get<TeamByIdResponse>(`/api/teams/${serverTeamId}`);
    serverTeamIdRef.current = res.team.id;
    setActiveServerTeamId(res.team.id);
    setUserRole(res.role);
    const hydrated: Team = {
      id: 1,
      name: res.team.name,
      raceName: res.team.raceName,
      sessionNumber: res.team.sessionNumber,
      sessionDuration: res.team.sessionDurationMin,
      drivers: res.drivers.map((d, i) => ({
        id: i + 1,
        name: d.name,
        targetTime: d.targetTimeSec,
        penaltyLaps: d.penaltyLaps,
        laps: [],
        linkedUserId: d.linkedUserId,
        serverId: d.id,
      })),
      sessionHistory: [],
    };
    // Snapshot the synced state so the diff sync treats this hydrate as a no-op.
    lastSyncedRef.current = snapshotFrom(hydrated.drivers, teamSettings(hydrated, res.team.lapTypeValues));
    setTeams([hydrated]);
    setLapTypeValues(res.team.lapTypeValues);
  }, []);

  const refreshMemberships = useCallback(async () => {
    try {
      const { teams: list } = await api.get<{ teams: TeamMembership[] }>('/api/teams');
      setMemberships(list);
    } catch (e) {
      console.warn('[teams] refreshMemberships failed:', e);
    }
  }, []);

  const switchTeam = useCallback(async (serverTeamId: string) => {
    if (serverTeamId === serverTeamIdRef.current) return;
    // Tear down any live session bound to the previous team before switching.
    liveSessionRef.current = null;
    setLiveSession(null);
    streamedKeysRef.current.clear();
    await AsyncStorage.removeItem('liveSessionState');
    setActiveDriver(0);
    await AsyncStorage.setItem('activeServerTeamId', serverTeamId);
    await loadTeam(serverTeamId);
  }, [loadTeam]);

  // Accept an invite (token or code), refresh memberships, switch to the team.
  const joinTeam = useCallback(
    async (opts: { token?: string; code?: string }): Promise<{ ok: boolean; error?: string; teamName?: string }> => {
      try {
        const res = await api.post<{ team: { id: string; name: string; role: TeamRole }; joined: boolean }>(
          '/api/invites/accept',
          opts,
        );
        await refreshMemberships();
        await switchTeam(res.team.id);
        return { ok: true, teamName: res.team.name };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'failed' };
      }
    },
    [refreshMemberships, switchTeam],
  );

  // Merge the active team's server roster/settings into local state WITHOUT
  // wiping in-progress laps (matched by position). Skipped while recording a live
  // session so a peer edit can't disturb the recorder. Drives peer-edit sync.
  const reloadActiveTeam = useCallback(async () => {
    const id = serverTeamIdRef.current;
    if (!id || liveSessionRef.current) return;
    try {
      const res = await api.get<TeamByIdResponse>(`/api/teams/${id}`);
      setUserRole(res.role);
      setLapTypeValues(res.team.lapTypeValues);
      const cur = teamsRef.current[0];
      const mergedDrivers: Driver[] = res.drivers.map((d, i) => ({
        id: i + 1,
        name: d.name,
        targetTime: d.targetTimeSec,
        penaltyLaps: d.penaltyLaps,
        linkedUserId: d.linkedUserId,
        serverId: d.id,
        laps: cur?.drivers[i]?.laps ?? [], // preserve in-progress laps by position
      }));
      const merged: Team = {
        id: 1,
        name: res.team.name,
        raceName: res.team.raceName,
        sessionNumber: res.team.sessionNumber,
        sessionDuration: res.team.sessionDurationMin,
        drivers: res.drivers.length ? mergedDrivers : (cur?.drivers ?? []),
        sessionHistory: cur?.sessionHistory ?? [],
      };
      lastSyncedRef.current = snapshotFrom(merged.drivers, teamSettings(merged, res.team.lapTypeValues));
      suppressPushRef.current = true; // this change is a remote sync, not a local edit
      setTeams([merged]);
    } catch (e) {
      console.warn('[teams] reloadActiveTeam failed:', e);
    }
  }, []);

  // Whether the active team currently has a live session (any member's).
  const refreshTeamLive = useCallback(async () => {
    const id = serverTeamIdRef.current;
    if (!id) {
      setTeamLivePublicToken(null);
      return;
    }
    try {
      const { live } = await api.get<{ live: { publicToken: string } | null }>(`/api/teams/${id}/live`);
      setTeamLivePublicToken(live?.publicToken ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  // Web: instant peer roster/settings sync + live-session awareness via SSE.
  useEffect(() => {
    if (!activeServerTeamId) return;
    void refreshTeamLive();
    const unsub = subscribeTeamEvents(activeServerTeamId, {
      onTeamChanged: () => { void reloadActiveTeam(); void refreshTeamLive(); },
      onSessionStarted: (publicToken) => setTeamLivePublicToken(publicToken),
    });
    return unsub;
  }, [activeServerTeamId, reloadActiveTeam, refreshTeamLive]);

  // Both platforms (covers native, where there is no EventSource): refresh the
  // active team + its live status when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { void reloadActiveTeam(); void refreshTeamLive(); }
    });
    return () => sub.remove();
  }, [reloadActiveTeam, refreshTeamLive]);

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

        // Load all memberships, then pick the active team (restore last choice).
        let list: TeamMembership[] = [];
        try {
          list = (await api.get<{ teams: TeamMembership[] }>('/api/teams')).teams;
        } catch {
          /* offline — fall through with empty list */
        }
        setMemberships(list);
        const savedActive = await AsyncStorage.getItem('activeServerTeamId');
        const activeId = savedActive && list.some((t) => t.id === savedActive) ? savedActive : fresh.team.id;
        const activeRole = list.find((t) => t.id === activeId)?.role ?? 'owner';

        if (activeId === fresh.team.id) {
          // The caller's own team — server is authoritative if it has a roster,
          // otherwise push the local roster up to seed it.
          setActiveServerTeamId(fresh.team.id);
          setUserRole(activeRole);
          if (fresh.drivers.length > 0) {
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
                linkedUserId: d.linkedUserId,
                serverId: d.id,
              })),
              sessionHistory: teamsRef.current[0]?.sessionHistory ?? [],
            };
            lastSyncedRef.current = snapshotFrom(hydrated.drivers, teamSettings(hydrated, fresh.team.lapTypeValues));
            setTeams([hydrated]);
            setLapTypeValues(fresh.team.lapTypeValues);
          } else {
            // Fresh owned team with no server roster — seed it with granular ops
            // so local drivers get server ids and future edits diff cleanly.
            const local = teamsRef.current[0];
            const settings = teamSettings(local ?? ({} as Team), lapTypeValuesRef.current);
            await syncQueue.enqueue({ kind: 'patchTeamSettings', teamId: fresh.team.id, payload: settings });
            const withIds: Driver[] = (local?.drivers ?? []).map((d) => ({ ...d, serverId: randomUuid() }));
            for (const d of withIds) {
              await syncQueue.enqueue({
                kind: 'createDriver',
                teamId: fresh.team.id,
                driverId: d.serverId!,
                payload: { id: d.serverId, name: d.name, targetTime: d.targetTime, penaltyLaps: d.penaltyLaps, linkedUserId: d.linkedUserId ?? null },
              });
            }
            lastSyncedRef.current = snapshotFrom(withIds, settings);
            suppressPushRef.current = true;
            if (local) setTeams([{ ...local, drivers: withIds }]);
          }
        } else {
          // A shared team the user joined — load its roster/settings.
          await loadTeam(activeId);
        }
        setSyncStatus(syncQueue.pending > 0 ? 'syncing' : 'synced');

        // Consume a deep-link invite captured before sign-in (regularity://join/<token>).
        const pending = await AsyncStorage.getItem('pendingInviteToken');
        if (pending) {
          await AsyncStorage.removeItem('pendingInviteToken');
          await joinTeam({ token: pending });
        }
      } catch (e) {
        // Offline or server unreachable — stay on local data.
        console.warn('[sync] initial sync failed (working offline):', e);
        setSyncStatus('offline');
      }
    })();
  }, [isLoading, isAuthenticated, user, loadTeam, joinTeam]);

  // Reset sync gate on sign-out so a different user re-syncs.
  useEffect(() => {
    if (!isAuthenticated) {
      syncedUserRef.current = null;
      serverTeamIdRef.current = null;
      lastSyncedRef.current = { settings: null, drivers: new Map() };
      setMemberships([]);
      setUserRole(null);
      setActiveServerTeamId(null);
      setSyncStatus('offline');
    }
  }, [isAuthenticated]);

  // Persist teams locally (debounced) + sync roster/settings via granular,
  // id-keyed ops. Diffing the local roster against the last synced state and
  // emitting per-driver create/patch/delete means two editors never clobber each
  // other (the old full-roster `putTeam` replace did).
  useEffect(() => {
    if (isLoading) return;
    const timeout = setTimeout(() => {
      AsyncStorage.setItem('blindFreddyRaceTeams', JSON.stringify(teams));
      // Skip if this change was a remote sync (avoids a push/broadcast loop).
      if (suppressPushRef.current) {
        suppressPushRef.current = false;
        return;
      }
      const teamId = serverTeamIdRef.current;
      const team = teamsRef.current[0];
      // Only owner/admin write roster/settings; members/viewers never do.
      if (!teamId || !syncedUserRef.current || !canEditTeam(userRoleRef.current) || !team) return;
      const last = lastSyncedRef.current;

      // Settings diff.
      const settings = teamSettings(team, lapTypeValuesRef.current);
      if (!last.settings || !settingsEqual(last.settings, settings)) {
        syncQueue.enqueue({ kind: 'patchTeamSettings', teamId, payload: settings });
        last.settings = settings;
      }

      // Roster diff — create / patch / delete keyed by server driver id.
      let assignedIds = false;
      const seen = new Set<string>();
      const nextDrivers = team.drivers.map((d) => {
        let sid = d.serverId;
        const fields = driverFields(d);
        if (!sid) {
          sid = randomUuid();
          assignedIds = true;
          syncQueue.enqueue({ kind: 'createDriver', teamId, driverId: sid, payload: { id: sid, ...fields } });
          last.drivers.set(sid, fields);
        } else {
          const prev = last.drivers.get(sid);
          if (!prev || !driverFieldsEqual(prev, fields)) {
            syncQueue.enqueue({ kind: 'patchDriver', driverId: sid, payload: fields });
            last.drivers.set(sid, fields);
          }
        }
        seen.add(sid);
        return d.serverId ? d : { ...d, serverId: sid };
      });
      for (const sid of Array.from(last.drivers.keys())) {
        if (!seen.has(sid)) {
          syncQueue.enqueue({ kind: 'deleteDriver', driverId: sid });
          last.drivers.delete(sid);
        }
      }
      if (assignedIds) {
        suppressPushRef.current = true;
        setTeams([{ ...team, drivers: nextDrivers }]);
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [teams, lapTypeValues, isLoading]);

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
    setTeamLivePublicToken(publicToken);
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
    setTeamLivePublicToken(null);
    streamedKeysRef.current.clear();
    await AsyncStorage.removeItem('liveSessionState');
    await syncQueue.enqueue({ kind: 'endSession', sessionId: live.id });
  }, []);

  // Discard (not save) the current session — deletes it server-side too, so a
  // cleared session leaves nothing in the DB. Nulls the ref BEFORE the lap-diff
  // effect runs so it doesn't also auto-end the (now deleted) session.
  const discardLiveSession = useCallback(async () => {
    const live = liveSessionRef.current;
    liveSessionRef.current = null;
    setLiveSession(null);
    setTeamLivePublicToken(null);
    streamedKeysRef.current.clear();
    await AsyncStorage.removeItem('liveSessionState');
    if (live) await syncQueue.enqueue({ kind: 'deleteSession', sessionId: live.id });
  }, []);

  // Kill switch for orphaned live sessions: ends EVERY session the server still
  // has marked live for the active team — even when this device lost its local
  // reference (after a reinstall, sign-out, or team switch) and so can't use
  // endLiveSession/discardLiveSession. Clears any local live state too.
  const endActiveLiveSession = useCallback(async () => {
    const teamId = serverTeamIdRef.current;
    if (!teamId) return;
    await api.post(`/api/teams/${teamId}/live/end`);
    liveSessionRef.current = null;
    setLiveSession(null);
    setTeamLivePublicToken(null);
    streamedKeysRef.current.clear();
    await AsyncStorage.removeItem('liveSessionState');
  }, []);

  const streamLap = useCallback(
    async (driverIndex: number, lap: Lap) => {
      if (!serverTeamIdRef.current) return;
      // Only owner/admin/member may record; viewers never stream laps.
      if (!canRecord(userRoleRef.current)) return;
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

  // Stream newly-recorded laps to the live session (started lazily on the first
  // lap). The session is ONLY ended/discarded by explicit user action
  // (End Session / Clear Session) — never auto-ended — so a transient local lap
  // clear (re-sync flicker, reset, etc.) can't kill a running live session.
  useEffect(() => {
    if (isLoading || !serverTeamIdRef.current) return;
    const team = teams[0];
    if (!team) return;
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
  }, [teams, isLoading, streamLap]);

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

  useEffect(() => {
    AsyncStorage.getItem('autoJoinLive').then((v) => {
      if (v !== null) setAutoJoinLive(JSON.parse(v));
    });
    AsyncStorage.getItem('liveSoundDefault').then((v) => {
      if (v !== null) setLiveSoundDefault(JSON.parse(v));
    });
  }, []);
  useEffect(() => {
    if (!isLoading) AsyncStorage.setItem('autoJoinLive', JSON.stringify(autoJoinLive));
  }, [autoJoinLive, isLoading]);
  useEffect(() => {
    if (!isLoading) AsyncStorage.setItem('liveSoundDefault', JSON.stringify(liveSoundDefault));
  }, [liveSoundDefault, isLoading]);

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
        memberships,
        userRole,
        activeServerTeamId,
        switchTeam,
        refreshMemberships,
        joinTeam,
        teamLivePublicToken,
        refreshTeamLive,
        autoJoinLive,
        setAutoJoinLive,
        liveSoundDefault,
        setLiveSoundDefault,
        saveSessionToS3,
        loadSessionsFromS3,
        liveSession,
        liveShareUrl,
        endLiveSession,
        discardLiveSession,
        endActiveLiveSession,
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
