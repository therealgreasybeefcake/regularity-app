import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { calculateDriverStats, calculateConsistency, driveTime, formatTime, type Driver as CoreDriver } from '@regularity/core';
import { subscribeLive, normalizeLap, type LiveSnapshot } from '../../lib/liveClient';
import { ensureLiveAudio, playLapTone } from '../../lib/liveSounds';
import { fonts } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { useApp, canEditTeam } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../components/CustomAlert';
import { api } from '../../lib/api';
import { syncServerClock, toServerTime } from '../../lib/serverClock';
import { LiveDot } from '../../components/ui';

const monoBold = fonts.monoBold;
const monoMed = fonts.monoMedium;
const monoExtra = fonts.monoExtraBold;

// Palette derived from the active app theme so the live view follows light/dark.
type LivePalette = ReturnType<typeof palette>;
function palette(theme: ReturnType<typeof useTheme>['theme']) {
  return {
    bg: String(theme.background),
    panel: String(theme.card),
    elevated: String(theme.surfaceElevated),
    border: String(theme.border),
    borderFaint: String(theme.borderFaint),
    text: String(theme.text),
    dim: String(theme.textSecondary),
    muted: String(theme.textMuted),
    green: String(theme.bonus),
    red: String(theme.broken),
    blue: String(theme.base),
    accent: String(theme.accent),
    live: String(theme.livePulse),
    warning: String(theme.warning),
    changeover: String(theme.changeover),
    safety: String(theme.safety),
  };
}

// Width of the lap-type pill column (the other lap columns share the rest).
const feedCols = (narrow: boolean) => ({ type: narrow ? 58 : 110 });

// Drive time as M:SS, or H:MM:SS from an hour.
function fmtDuration(seconds: number): string {
  const t = Math.floor(Math.max(0, seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

const signed = (n: number, digits = 2) => `${n >= 0 ? '+' : '\u2212'}${Math.abs(n).toFixed(digits)}`;

// Laps listed under "All drivers"; one driver's history lists every lap.
const ALL_DRIVERS_LAP_LIMIT = 20;

// Short lap-type labels for the phone feed ("CHANGEOVER" doesn't fit).
const SHORT_TYPE: Record<string, string> = { bonus: 'BONUS', base: 'BASE', broken: 'BROKEN', changeover: 'C/O', safety: 'SC' };

export default function LiveView() {
  const { publicToken } = useLocalSearchParams<{ publicToken: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 860;
  // Phone portrait: stat rows go 2x2 and the lap feed tightens.
  const isNarrow = windowWidth < 600;
  const cols = feedCols(isNarrow);

  const { liveSoundDefault, memberships, liveSession, endLiveSession, discardLiveSession } = useApp();
  const { showAlert } = useAlert();
  const C = useMemo(() => palette(theme), [theme]);
  const styles = useMemo(() => makeStyles(C, isWide, isNarrow), [C, isWide, isNarrow]);
  const deltaColor = (delta: number) => (delta < 0 ? C.red : delta < 1 ? C.green : C.blue);
  // A changeover / safety-car lap is off target by design — colour it by type, not delta.
  const lapTypeColor = (lapType: string, delta: number) =>
    lapType === 'changeover' ? C.changeover : lapType === 'safety' ? C.safety : deltaColor(delta);

  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [soundOn, setSoundOn] = useState(liveSoundDefault);
  const [ending, setEnding] = useState(false);
  const [focusedDriverId, setFocusedDriverId] = useState<string | null>(null);
  // Lap history filter: null = all drivers.
  const [historyDriverId, setHistoryDriverId] = useState<string | null>(null);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);

  const snapRef = useRef<LiveSnapshot | null>(null);
  snapRef.current = snap;
  const soundOnRef = useRef(false);
  soundOnRef.current = soundOn;
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myRole = useMemo(() => memberships.find((m) => m.id === snap?.teamId)?.role ?? null, [memberships, snap?.teamId]);
  const canManage = snap?.status === 'live' && canEditTeam(myRole);
  const isRecorder = !!liveSession && liveSession.publicToken === publicToken;

  // Align with the server clock so the recorder's lap-start timestamps (sent in
  // server time) don't drift by the phone/browser system-clock difference.
  useEffect(() => {
    void syncServerClock(true);
  }, []);

  const timerRunning = snap?.timer ? snap.timer.running : true;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (snap?.status !== 'live' || !timerRunning) return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [snap?.status, timerRunning]);

  // When the session ends, a signed-in teammate is taken back into the app. Anyone
  // else (a public link, no account) stays here on the final results — sending
  // them to the app would only land them on the login page.
  const { isAuthenticated } = useAuth();
  const signedInRef = useRef(isAuthenticated);
  signedInRef.current = isAuthenticated;
  const goToPortal = () => {
    if (!signedInRef.current || redirectTimer.current) return;
    redirectTimer.current = setTimeout(() => router.replace('/(app)/(tabs)' as any), 2200);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    if (next) ensureLiveAudio();
  };

  const markEnded = () => {
    setSnap((prev) => (prev ? { ...prev, status: 'ended' as const } : prev));
    goToPortal();
  };

  const doEnd = async () => {
    if (!snap || ending) return;
    setEnding(true);
    try {
      if (isRecorder) await endLiveSession();
      else await api.post(`/api/sessions/${snap.id}/end`);
      markEnded();
    } catch {
      showAlert({ title: 'Could not end session', message: 'Check your connection and try again.' });
    } finally {
      setEnding(false);
    }
  };

  const doDelete = async () => {
    if (!snap || ending) return;
    setEnding(true);
    try {
      if (isRecorder) await discardLiveSession();
      else await api.del(`/api/sessions/${snap.id}`);
      markEnded();
    } catch {
      showAlert({ title: 'Could not delete session', message: 'Check your connection and try again.' });
    } finally {
      setEnding(false);
    }
  };

  const confirmDelete = () => {
    showAlert({
      title: 'Delete Live Session',
      message: 'This permanently deletes the session and all its laps for the whole team. This cannot be undone.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { void doDelete(); } },
      ],
    });
  };

  const confirmEnd = () => {
    showAlert({
      title: 'End Live Session',
      message: 'This ends the live session for everyone on the team and disables its public share link.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End Session', style: 'destructive', onPress: () => { void doEnd(); } },
        { text: 'Delete Session…', style: 'destructive', onPress: confirmDelete },
      ],
    });
  };

  useEffect(() => {
    ensureLiveAudio();
    const doc = (globalThis as any).document;
    if (!doc) return;
    const unlock = () => ensureLiveAudio();
    doc.addEventListener('pointerdown', unlock, { once: true });
    doc.addEventListener('keydown', unlock, { once: true });
    return () => {
      doc.removeEventListener('pointerdown', unlock);
      doc.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!publicToken) return;
    let gotData = false;
    const timeout = setTimeout(() => {
      if (!gotData) {
        setNotFound(true);
        goToPortal();
      }
    }, 8000);

    const unsub = subscribeLive(publicToken, {
      onSnapshot: (s) => {
        gotData = true;
        clearTimeout(timeout);
        setNotFound(false);
        setSnap(s);
        if (s.status === 'ended') goToPortal();
      },
      onLap: (lap) => {
        const n = normalizeLap(lap);
        const already = snapRef.current?.drivers
          .find((d) => d.id === n.sessionDriverId)
          ?.laps.some((l) => l.number === n.number);
        if (!already && soundOnRef.current) playLapTone(n.lapType);
        setSnap((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            drivers: prev.drivers.map((d) => {
              if (d.id !== n.sessionDriverId) return d;
              if (d.laps.some((l) => l.number === n.number)) return d;
              return { ...d, laps: [...d.laps, { number: n.number, time: n.time, delta: n.delta, lapType: n.lapType, lapValue: n.lapValue, timestamp: n.timestamp }] };
            }),
          };
        });
      },
      onTimer: (timer) => {
        setSnap((prev) => (prev ? { ...prev, timer } : prev));
      },
      onEnded: () => {
        setSnap((prev) => (prev ? { ...prev, status: 'ended' } : prev));
        goToPortal();
      },
      onStatus: setConnected,
    });
    return () => {
      clearTimeout(timeout);
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
      unsub();
    };
  }, [publicToken]);

  const { drivers, teamStats, recent } = useMemo(() => {
    if (!snap) return { drivers: [], teamStats: { percentageFactor: 0, achievedLaps: 0, goalLaps: 0 }, recent: [] as any[] };
    const coreDrivers: CoreDriver[] = snap.drivers.map((d, i) => ({
      id: i,
      name: d.name,
      targetTime: d.targetTime,
      penaltyLaps: d.penaltyLaps,
      laps: d.laps,
    }));
    let goal = 0;
    let achieved = 0;
    const withStats = snap.drivers.map((d, i) => {
      const stats = calculateDriverStats(coreDrivers[i], snap.lapTypeValues, coreDrivers, snap.sessionDurationMin);
      goal += stats.goalLaps;
      achieved += stats.achievedLaps;
      const last = d.laps[d.laps.length - 1] ?? null;
      const consistency = calculateConsistency(d.laps).deltaStdDev;
      const drive = driveTime(coreDrivers, i).total;
      return { d, stats, last, consistency, drive };
    });
    const recentLaps = snap.drivers
      .flatMap((d) => d.laps.map((l) => ({ driver: d.name, driverId: d.id, ...l })))
      .sort((a, b) => b.timestamp - a.timestamp);
    return {
      drivers: withStats,
      teamStats: { percentageFactor: goal > 0 ? (achieved / goal) * 100 : 0, achievedLaps: achieved, goalLaps: goal },
      recent: recentLaps,
    };
  }, [snap]);

  // Identify active driver on track (most recent lap, or explicitly focused driver)
  const activeDriver = useMemo(() => {
    if (drivers.length === 0) return null;
    if (focusedDriverId) {
      const found = drivers.find((x) => x.d.id === focusedDriverId);
      if (found) return found;
    }
    let latest = drivers[0];
    let latestTime = -1;
    for (const item of drivers) {
      if (item.last && item.last.timestamp > latestTime) {
        latestTime = item.last.timestamp;
        latest = item;
      }
    }
    return latest;
  }, [drivers, focusedDriverId]);

  const historyDriver = historyDriverId ? drivers.find((x) => x.d.id === historyDriverId) ?? null : null;
  const historyLaps = historyDriver
    ? recent.filter((l) => l.driverId === historyDriver.d.id)
    : recent.slice(0, ALL_DRIVERS_LAP_LIMIT);

  if (notFound) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <Text style={styles.title}>Session ended</Text>
        <Text style={styles.dim}>This live session has ended or its link expired.</Text>
        {isAuthenticated ? <Text style={[styles.dim, { marginTop: 12 }]}>Returning to the portal…</Text> : null}
      </View>
    );
  }

  if (!snap) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator color={C.live} />
        <Text style={[styles.dim, { marginTop: 12 }]}>Connecting to live session…</Text>
      </View>
    );
  }

  const isLive = snap.status === 'live';
  const timerStopped = !!snap.timer && !snap.timer.running;
  // The recorder's stopwatch (server-time ms): counts while running, frozen when
  // stopped, zero after a reset. Without it (older app) we infer from the last lap.
  const timerClock = (t: NonNullable<LiveSnapshot['timer']>) => {
    if (t.lapStartedAt === null) return '0:00.00';
    const end = t.running ? toServerTime(now) : t.stoppedAt ?? toServerTime(now);
    return fmtElapsed(end - t.lapStartedAt);
  };
  const progressRatio = teamStats.goalLaps > 0 ? Math.min(100, Math.max(0, (teamStats.achievedLaps / teamStats.goalLaps) * 100)) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Sticky top pit header */}
      <View style={[styles.headerWrap, { paddingTop: insets.top + 8, paddingLeft: insets.left, paddingRight: insets.right }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.titleBadgeRow}>
              <Text style={styles.kicker} numberOfLines={1}>
                {snap.sessionNumber ? `SESSION ${snap.sessionNumber}` : 'LIVE TIMING'} · PIT TELEMETRY
              </Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>{snap.raceName || 'Regularity Session'}</Text>
          </View>

          <View style={styles.headerActions}>
            {canManage && (
              <Pressable
                onPress={confirmEnd}
                disabled={ending}
                style={[styles.headerBtn, { borderColor: C.red }, ending && { opacity: 0.5 }]}
                accessibilityLabel="End live session"
              >
                {ending ? <ActivityIndicator size="small" color={C.red} /> : <Ionicons name="stop" size={16} color={C.red} />}
              </Pressable>
            )}
            <Pressable
              onPress={toggleSound}
              style={styles.headerBtn}
              accessibilityLabel={soundOn ? 'Mute lap sounds' : 'Enable lap sounds'}
            >
              <Ionicons name={soundOn ? 'volume-high' : 'volume-mute'} size={16} color={soundOn ? C.accent : C.dim} />
            </Pressable>
            <View style={[styles.badge, isLive && { borderColor: C.live, backgroundColor: `${C.live}14` }]}>
              <LiveDot size={8} color={isLive ? C.live : C.dim} active={isLive} />
              <Text style={[styles.badgeText, { color: isLive ? C.live : C.dim }]}>{isLive ? 'LIVE' : 'ENDED'}</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24, paddingLeft: Math.max(insets.left, isWide ? 24 : 16), paddingRight: Math.max(insets.right, isWide ? 24 : 16) }]}
      >
        {!isLive ? (
          <View style={styles.endedBanner}>
            <Ionicons name="flag-outline" size={16} color={C.dim} />
            <Text style={styles.endedText}>This session has ended. These are its final results.</Text>
          </View>
        ) : null}

        {/* Cockpit Split: Active Driver Hero (Main) + Prominent % Factor */}
        <View style={styles.dashboardSplit}>
          {/* Active Driver Hero Card */}
          {activeDriver ? (
            <View style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <View style={styles.heroDriverIdentity}>
                  <View style={styles.onTrackBadge}>
                    <LiveDot size={8} color={C.live} active={isLive} />
                    <Text style={styles.onTrackText}>{isLive ? 'ON TRACK' : 'LAST ON TRACK'}</Text>
                  </View>
                  <Text style={styles.heroDriverName} numberOfLines={1}>{activeDriver.d.name}</Text>
                  {activeDriver.d.targetTime > 0 && (
                    <View style={styles.targetBadge}>
                      <Text style={styles.targetBadgeText}>🎯 TARGET {formatTime(activeDriver.d.targetTime)}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.heroLapPill}>
                  <Text style={styles.heroLapPillText}>
                    {activeDriver.d.laps.length > 0 ? `LAP ${activeDriver.d.laps.length + 1}` : 'OUT LAP'}
                  </Text>
                </View>
              </View>

              {/* Huge Live Clock Display */}
              <View style={styles.clockSection}>
                <Text style={styles.clockSubLabel}>{!isLive ? 'LAST LAP TIME' : timerStopped ? 'TIMER STOPPED' : 'CURRENT LAP TIME'}</Text>
                <Text style={styles.giantClock} numberOfLines={1} adjustsFontSizeToFit>
                  {isLive && snap.timer
                    ? timerClock(snap.timer)
                    : isLive && activeDriver.last
                    ? fmtElapsed(now - activeDriver.last.timestamp)
                    : activeDriver.last
                    ? formatTime(activeDriver.last.time)
                    : '0:00.00'}
                </Text>

                {/* Previous lap bar */}
                {activeDriver.last ? (
                  <View style={styles.lastLapBanner}>
                    <Text style={styles.lastLapTitle}>LAST LAP:</Text>
                    <Text style={styles.lastLapTime}>{formatTime(activeDriver.last.time)}</Text>
                    <View style={[styles.lastLapDeltaPill, { backgroundColor: `${deltaColor(activeDriver.last.delta)}22`, borderColor: deltaColor(activeDriver.last.delta) }]}>
                      <Text style={[styles.lastLapDeltaText, { color: deltaColor(activeDriver.last.delta) }]}>
                        {`${activeDriver.last.delta >= 0 ? '+' : '\u2212'}${Math.abs(activeDriver.last.delta).toFixed(2)}s`}
                      </Text>
                    </View>
                    <View style={[styles.lapTypeBadge, { backgroundColor: `${lapTypeColor(activeDriver.last.lapType, activeDriver.last.delta)}18` }]}>
                      <Text style={[styles.lapTypeText, { color: lapTypeColor(activeDriver.last.lapType, activeDriver.last.delta) }]}>
                        {activeDriver.last.lapType.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.lastLapBanner}>
                    <Text style={styles.dim}>Out lap in progress · Telemetry waiting for lap 1</Text>
                  </View>
                )}
              </View>

              {/* Hero telemetry metrics row */}
              <View style={styles.heroMetricsRow}>
                <View style={styles.heroMetricItem}>
                  <Text style={styles.metricLabel}>AVG Δ</Text>
                  <Text style={[styles.heroMetricValue, { color: deltaColor(activeDriver.stats.averageDelta) }]}>
                    {activeDriver.stats.averageDelta >= 0 ? '+' : ''}{activeDriver.stats.averageDelta.toFixed(2)}s
                  </Text>
                </View>
                <View style={styles.heroMetricItem}>
                  <Text style={styles.metricLabel}>3-LAP AVG</Text>
                  <Text style={styles.heroMetricValue}>
                    {activeDriver.stats.threelapAvg == null ? '—' : `${activeDriver.stats.threelapAvg >= 0 ? '+' : ''}${activeDriver.stats.threelapAvg.toFixed(2)}s`}
                  </Text>
                </View>
                <View style={styles.heroMetricItem}>
                  <Text style={styles.metricLabel}>ACHIEVED</Text>
                  <Text style={[styles.heroMetricValue, { color: C.green }]}>
                    {activeDriver.stats.achievedLaps.toFixed(0)} <Text style={styles.heroMetricUnit}>/ {activeDriver.stats.goalLaps.toFixed(0)}</Text>
                  </Text>
                </View>
                <View style={styles.heroMetricItem}>
                  <Text style={styles.metricLabel}>COMPLETED</Text>
                  <Text style={styles.heroMetricValue}>
                    {activeDriver.d.laps.length} <Text style={styles.heroMetricUnit}>laps</Text>
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Prominent % Factor Card */}
          <View style={styles.factorCard}>
            <View style={styles.factorHeader}>
              <View>
                <Text style={styles.factorLabel}>% FACTOR</Text>
                <Text style={styles.factorSub}>OVERALL EFFICIENCY</Text>
              </View>
              <View style={[styles.connBadge, { borderColor: connected ? C.live : C.warning }]}>
                <View style={[styles.connDot, { backgroundColor: connected ? C.live : C.warning }]} />
                <Text style={[styles.connText, { color: connected ? C.live : C.warning }]}>
                  {connected ? 'CONNECTED' : 'OFFLINE'}
                </Text>
              </View>
            </View>

            <View style={styles.factorValueContainer}>
              <Text style={styles.giantFactor} numberOfLines={1} adjustsFontSizeToFit>
                {teamStats.percentageFactor.toFixed(1)}
                <Text style={styles.factorPercentSign}>%</Text>
              </Text>
            </View>

            {/* Custom progress bar */}
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progressRatio}%` }]} />
            </View>

            <View style={styles.factorStatsGrid}>
              <View style={styles.factorStatBox}>
                <Text style={styles.factorStatLabel}>ACHIEVED</Text>
                <Text style={styles.factorStatNumber}>{teamStats.achievedLaps.toFixed(0)}</Text>
              </View>
              <View style={styles.factorStatBox}>
                <Text style={styles.factorStatLabel}>GOAL LAPS</Text>
                <Text style={styles.factorStatNumber}>{teamStats.goalLaps.toFixed(0)}</Text>
              </View>
              <View style={styles.factorStatBox}>
                <Text style={styles.factorStatLabel}>REMAINING</Text>
                <Text style={styles.factorStatNumber}>
                  {Math.max(0, teamStats.goalLaps - teamStats.achievedLaps).toFixed(0)}
                </Text>
              </View>
              <View style={styles.factorStatBox}>
                <Text style={styles.factorStatLabel}>SESSION</Text>
                <Text style={styles.factorStatNumber}>{snap.sessionDurationMin || 120}m</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Every driver's numbers. Tap one to put them in the big card above. */}
        {drivers.length > 0 && (
          <View style={styles.standbySection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>ALL DRIVERS</Text>
              <Text style={styles.sectionHint}>Tap a driver to focus</Text>
            </View>

            {isWide ? (
              <View style={styles.feed}>
                <View style={styles.feedHeaderRow}>
                  <Text style={[styles.feedHeaderCell, styles.statName]}>DRIVER</Text>
                  {['TARGET', 'LAPS', 'ACH / GOAL', 'NET', 'BONUS', 'BASE', 'BROKEN', 'C/O', 'SC', 'AVG Δ', '3-LAP', '±σ', 'DRIVE'].map((h) => (
                    <Text key={h} style={[styles.feedHeaderCell, styles.statCell]}>{h}</Text>
                  ))}
                </View>
                {drivers.map(({ d, stats, consistency, drive }, i) => {
                  const focused = activeDriver?.d.id === d.id;
                  return (
                    <Pressable
                      key={d.id}
                      onPress={() => setFocusedDriverId(d.id)}
                      style={[styles.feedRow, focused && { backgroundColor: `${C.live}10` }, i === drivers.length - 1 && { borderBottomWidth: 0 }]}
                      accessibilityLabel={`Focus on driver ${d.name}`}
                    >
                      <View style={[styles.statName, styles.statNameInner]}>
                        {focused ? <LiveDot size={7} color={C.live} active={isLive} /> : null}
                        <Text style={styles.feedDriver} numberOfLines={1}>{d.name}</Text>
                      </View>
                      <Text style={[styles.statValue, styles.statCell]}>{d.targetTime > 0 ? formatTime(d.targetTime) : '—'}</Text>
                      <Text style={[styles.statValue, styles.statCell]}>{d.laps.length}</Text>
                      <Text style={[styles.statValue, styles.statCell]}>
                        <Text style={{ color: C.green }}>{stats.achievedLaps.toFixed(0)}</Text> / {stats.goalLaps.toFixed(0)}
                      </Text>
                      <Text style={[styles.statValue, styles.statCell]}>{`${stats.netScore > 0 ? '+' : ''}${stats.netScore}`}</Text>
                      <Text style={[styles.statValue, styles.statCell, { color: C.green }]}>{stats.bonusLaps}</Text>
                      <Text style={[styles.statValue, styles.statCell, { color: C.blue }]}>{stats.baseLaps}</Text>
                      <Text style={[styles.statValue, styles.statCell, { color: C.red }]}>{stats.brokenLaps}</Text>
                      <Text style={[styles.statValue, styles.statCell, { color: C.changeover }]}>{stats.changeoverLaps}</Text>
                      <Text style={[styles.statValue, styles.statCell, { color: C.safety }]}>{stats.safetyLaps}</Text>
                      <Text style={[styles.statValue, styles.statCell, { color: d.laps.length ? deltaColor(stats.averageDelta) : C.text }]}>
                        {d.laps.length ? signed(stats.averageDelta) : '—'}
                      </Text>
                      <Text style={[styles.statValue, styles.statCell]}>{stats.threelapAvg == null ? '—' : signed(stats.threelapAvg)}</Text>
                      <Text style={[styles.statValue, styles.statCell]}>{d.laps.length ? consistency.toFixed(2) : '—'}</Text>
                      <Text style={[styles.statValue, styles.statCell]}>{drive > 0 ? fmtDuration(drive) : '—'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.standbyGrid}>
                {drivers.map(({ d, stats, consistency, drive }) => {
                  const focused = activeDriver?.d.id === d.id;
                  const metrics: Array<[string, string, string?]> = [
                    ['LAPS', String(d.laps.length)],
                    ['ACH / GOAL', `${stats.achievedLaps.toFixed(0)} / ${stats.goalLaps.toFixed(0)}`, C.green],
                    ['NET', `${stats.netScore > 0 ? '+' : ''}${stats.netScore}`],
                    ['DRIVE', drive > 0 ? fmtDuration(drive) : '—'],
                    ['AVG Δ', d.laps.length ? signed(stats.averageDelta) : '—', d.laps.length ? deltaColor(stats.averageDelta) : undefined],
                    ['3-LAP', stats.threelapAvg == null ? '—' : signed(stats.threelapAvg)],
                    ['±σ', d.laps.length ? consistency.toFixed(2) : '—'],
                    ['BONUS', String(stats.bonusLaps), C.green],
                    ['BASE', String(stats.baseLaps), C.blue],
                    ['BROKEN', String(stats.brokenLaps), C.red],
                    ['C/O', String(stats.changeoverLaps), C.changeover],
                    ['SC', String(stats.safetyLaps), C.safety],
                  ];
                  return (
                    <Pressable
                      key={d.id}
                      style={[styles.standbyCard, focused && { borderColor: `${C.live}66` }]}
                      onPress={() => setFocusedDriverId(d.id)}
                      accessibilityLabel={`Focus on driver ${d.name}`}
                    >
                      <View style={styles.standbyCardHeader}>
                        <View style={styles.standbyIdentity}>
                          <Text style={styles.standbyName} numberOfLines={1}>{d.name}</Text>
                          <View style={[styles.standbyPill, focused && { borderColor: `${C.live}55` }]}>
                            <Text style={[styles.standbyPillText, focused && { color: C.live }]}>
                              {focused ? (isLive ? 'ON TRACK' : 'LAST OUT') : 'STANDBY'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.standbyLapCount}>{d.targetTime > 0 ? `TARGET ${formatTime(d.targetTime)}` : ''}</Text>
                      </View>
                      <View style={styles.metricGrid}>
                        {metrics.map(([label, value, color]) => (
                          <View key={label} style={styles.metricCell}>
                            <Text style={styles.standbyMetricLabel}>{label}</Text>
                            <Text style={[styles.standbyMetricValue, color ? { color } : null]} numberOfLines={1}>{value}</Text>
                          </View>
                        ))}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Lap history — everyone's latest laps, or one driver's whole session */}
        <View style={[styles.recentSection, historyMenuOpen && styles.raised]}>
          <View style={[styles.sectionHeaderRow, styles.raised]}>
            <Text style={styles.sectionTitle}>LAP HISTORY</Text>
            <View style={styles.raised}>
              <Pressable
                onPress={() => setHistoryMenuOpen((o) => !o)}
                style={styles.dropdownBtn}
                accessibilityRole="button"
                accessibilityLabel="Choose which driver's laps to show"
              >
                <Text style={styles.dropdownText} numberOfLines={1}>{historyDriver ? historyDriver.d.name : 'All drivers'}</Text>
                <Ionicons name={historyMenuOpen ? 'chevron-up' : 'chevron-down'} size={14} color={C.dim} />
              </Pressable>
              {historyMenuOpen ? (
                <View style={styles.dropdownMenu}>
                  {[{ id: null as string | null, name: 'All drivers', laps: recent.length }, ...drivers.map(({ d }) => ({ id: d.id as string | null, name: d.name, laps: d.laps.length }))].map((opt) => {
                    const selected = opt.id === historyDriverId;
                    return (
                      <Pressable
                        key={opt.id ?? 'all'}
                        onPress={() => {
                          setHistoryDriverId(opt.id);
                          setHistoryMenuOpen(false);
                        }}
                        style={[styles.dropdownItem, selected && { backgroundColor: `${C.accent}14` }]}
                      >
                        <Text style={[styles.dropdownItemText, selected && { color: C.accent }]} numberOfLines={1}>{opt.name}</Text>
                        <Text style={styles.dropdownCount}>{opt.laps}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.feed}>
            {historyLaps.length === 0 ? (
              <Text style={[styles.dim, { padding: 18, textAlign: 'center' }]}>
                {historyDriver ? `No laps for ${historyDriver.d.name} yet.` : 'Waiting for live lap recordings…'}
              </Text>
            ) : (
              <View>
                <View style={styles.feedHeaderRow}>
                  {historyDriver ? null : <Text style={[styles.feedHeaderCell, styles.feedDriverCol]}>DRIVER</Text>}
                  <Text style={[styles.feedHeaderCell, styles.feedLapCol, { textAlign: 'center' }]}>LAP</Text>
                  <Text style={[styles.feedHeaderCell, styles.feedNumCol, { textAlign: 'right' }]}>TIME</Text>
                  <Text style={[styles.feedHeaderCell, styles.feedNumCol, { textAlign: 'right' }]}>DELTA</Text>
                  <View style={[styles.feedTypeCol, { width: cols.type }]}>
                    <Text style={[styles.feedHeaderCell, { textAlign: 'center' }]}>TYPE</Text>
                  </View>
                </View>

                {historyLaps.map((l, i) => {
                  const typeColor = lapTypeColor(l.lapType, l.delta);
                  return (
                    <View key={`${l.driverId}-${l.number}-${l.timestamp}`} style={[styles.feedRow, i === historyLaps.length - 1 && { borderBottomWidth: 0 }]}>
                      {historyDriver ? null : <Text style={[styles.feedDriver, styles.feedDriverCol]} numberOfLines={1}>{l.driver}</Text>}
                      <Text style={[styles.feedLapNumber, styles.feedLapCol]}>#{l.number}</Text>
                      <Text style={[styles.feedTime, styles.feedNumCol]} numberOfLines={1}>{formatTime(l.time)}</Text>
                      <Text style={[styles.feedDelta, styles.feedNumCol, { color: deltaColor(l.delta) }]} numberOfLines={1}>
                        {`${signed(l.delta)}${isNarrow ? '' : 's'}`}
                      </Text>
                      <View style={[styles.feedTypePill, styles.feedTypeCol, { width: cols.type, backgroundColor: `${typeColor}18`, borderColor: `${typeColor}33` }]}>
                        <Text style={[styles.feedType, { color: typeColor }]} numberOfLines={1}>
                          {isNarrow ? SHORT_TYPE[l.lapType] ?? l.lapType.toUpperCase() : l.lapType.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
          {!historyDriver && recent.length > ALL_DRIVERS_LAP_LIMIT ? (
            <Text style={styles.feedFootnote}>Latest {ALL_DRIVERS_LAP_LIMIT} of {recent.length} laps. Pick a driver for their full history.</Text>
          ) : null}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// Elapsed current-lap time ticking (60fps)
function fmtElapsed(ms: number): string {
  // Truncate to hundredths like the phone's stopwatch (rounding can show 60.00).
  const s = Math.floor(Math.max(0, ms) / 10) / 100;
  if (s < 60) return `${s.toFixed(2)}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
  }
  if (s >= 86400) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function makeStyles(C: LivePalette, isWide: boolean, isNarrow: boolean) {
  return StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    container: {
      paddingHorizontal: isWide ? 24 : 16,
      paddingTop: 16,
      maxWidth: isWide ? 1320 : 720,
      width: '100%',
      alignSelf: 'center',
    },
    dim: { color: C.dim, fontSize: 13 },
    endedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: C.elevated,
      borderWidth: 1,
      borderColor: C.borderFaint,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 16,
    },
    endedText: { color: C.dim, fontSize: 13, fontWeight: '600', flexShrink: 1 },
    headerWrap: {
      backgroundColor: C.bg,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.borderFaint,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      maxWidth: isWide ? 1320 : 720,
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: isWide ? 24 : 16,
    },
    titleBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    kicker: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
    title: { color: C.text, fontSize: isWide ? 26 : 22, fontWeight: '800', letterSpacing: -0.3 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerBtn: {
      width: 38,
      height: 38,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.elevated,
    },
    badgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },

    // Cockpit Split Layout
    dashboardSplit: {
      flexDirection: isWide ? 'row' : 'column',
      gap: 16,
      marginBottom: 16,
    },

    // Active Driver Hero Card
    heroCard: {
      flex: isWide ? 1.55 : undefined,
      backgroundColor: C.panel,
      borderRadius: 20,
      padding: isWide ? 24 : 18,
      borderWidth: 1.5,
      borderColor: `${C.live}44`,
      shadowColor: C.live,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
    },
    heroHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    heroDriverIdentity: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
      flex: 1,
    },
    onTrackBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: `${C.live}18`,
      borderWidth: 1,
      borderColor: `${C.live}55`,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
    },
    onTrackText: {
      color: C.live,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.5,
    },
    heroDriverName: {
      color: C.text,
      fontSize: isWide ? 30 : 22,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    targetBadge: {
      backgroundColor: C.elevated,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: C.borderFaint,
    },
    targetBadgeText: {
      color: C.dim,
      fontFamily: monoBold,
      fontSize: 11,
    },
    heroLapPill: {
      backgroundColor: C.elevated,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
    },
    heroLapPillText: {
      color: C.accent,
      fontFamily: monoBold,
      fontSize: 12,
      letterSpacing: 1,
    },

    // Clock section inside hero
    clockSection: {
      alignItems: 'flex-start',
      marginVertical: 4,
    },
    clockSubLabel: {
      color: C.muted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      marginBottom: 2,
    },
    giantClock: {
      fontSize: isWide ? 80 : 54,
      fontFamily: monoExtra,
      color: C.live,
      letterSpacing: -2,
      lineHeight: isWide ? 88 : 60,
    },
    lastLapBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      backgroundColor: C.elevated,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      marginTop: 10,
      borderWidth: 1,
      borderColor: C.borderFaint,
      width: '100%',
    },
    lastLapTitle: {
      color: C.muted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
    },
    lastLapTime: {
      color: C.text,
      fontFamily: monoBold,
      fontSize: 15,
    },
    lastLapDeltaPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
    },
    lastLapDeltaText: {
      fontFamily: monoBold,
      fontSize: 13,
    },
    lapTypeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    lapTypeText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },

    // Bottom telemetry boxes inside hero
    heroMetricsRow: {
      flexDirection: 'row',
      flexWrap: isNarrow ? 'wrap' : 'nowrap',
      gap: 10,
      marginTop: 18,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.borderFaint,
    },
    heroMetricItem: {
      flex: 1,
      // 2x2 on a phone: four across leaves ~50px per value.
      minWidth: isNarrow ? '40%' : undefined,
      backgroundColor: C.elevated,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.borderFaint,
    },
    metricLabel: {
      color: C.muted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      marginBottom: 3,
    },
    heroMetricValue: {
      color: C.text,
      fontFamily: monoBold,
      fontSize: isWide ? 17 : 14,
    },
    heroMetricUnit: {
      fontSize: 11,
      fontFamily: monoMed,
      color: C.dim,
    },

    // Prominent % Factor Card
    factorCard: {
      flex: isWide ? 1 : undefined,
      backgroundColor: C.panel,
      borderRadius: 20,
      padding: isWide ? 24 : 18,
      borderWidth: 1,
      borderColor: C.border,
      justifyContent: 'space-between',
    },
    factorHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    factorLabel: {
      color: C.dim,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 2.5,
    },
    factorSub: {
      color: C.muted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      marginTop: 2,
    },
    connBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      backgroundColor: C.elevated,
    },
    connDot: { width: 6, height: 6, borderRadius: 3 },
    connText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    factorValueContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: isWide ? 12 : 6,
    },
    giantFactor: {
      fontSize: isWide ? 66 : 50,
      fontFamily: monoExtra,
      color: C.accent,
      letterSpacing: -2,
    },
    factorPercentSign: {
      fontSize: isWide ? 38 : 28,
      fontFamily: monoBold,
      color: C.dim,
    },
    progressBarTrack: {
      height: 8,
      backgroundColor: C.elevated,
      borderRadius: 999,
      overflow: 'hidden',
      marginVertical: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.borderFaint,
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: C.accent,
      borderRadius: 999,
    },
    factorStatsGrid: {
      flexDirection: 'row',
      flexWrap: isNarrow ? 'wrap' : 'nowrap',
      gap: 8,
      marginTop: 4,
    },
    factorStatBox: {
      flex: 1,
      minWidth: isNarrow ? '40%' : undefined,
      backgroundColor: C.elevated,
      padding: 8,
      borderRadius: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.borderFaint,
    },
    factorStatLabel: {
      color: C.muted,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1,
      marginBottom: 2,
    },
    factorStatNumber: {
      color: C.text,
      fontFamily: monoBold,
      fontSize: 13,
    },

    // Standby Drivers Section
    standbySection: {
      marginBottom: 16,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    sectionTitle: {
      color: C.dim,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
    },
    sectionHint: {
      color: C.muted,
      fontSize: 11,
      fontStyle: 'italic',
    },
    standbyGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    standbyCard: {
      flex: 1,
      minWidth: isWide ? 260 : '100%',
      backgroundColor: C.panel,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: C.borderFaint,
    },
    standbyCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    standbyIdentity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    standbyName: {
      color: C.text,
      fontSize: 15,
      fontWeight: '700',
    },
    standbyPill: {
      backgroundColor: C.elevated,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: C.borderFaint,
    },
    standbyPillText: {
      color: C.muted,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1,
    },
    standbyLapCount: {
      color: C.dim,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
    },
    standbyMetricLabel: {
      color: C.muted,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    standbyMetricValue: {
      color: C.text,
      fontFamily: monoBold,
      fontSize: 12,
      marginTop: 2,
    },

    // Recent Laps Feed Section
    recentSection: {
      marginBottom: 16,
      // Five columns across a 1300px screen spread far apart — keep it readable.
      maxWidth: isWide ? 900 : undefined,
      width: '100%',
    },
    feed: {
      backgroundColor: C.panel,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    feedHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: isNarrow ? 10 : 14,
      paddingVertical: 10,
      backgroundColor: C.elevated,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    feedHeaderCell: {
      color: C.muted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    feedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: isNarrow ? 10 : 14,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.borderFaint,
    },
    feedDriver: {
      color: C.text,
      minWidth: 0,
      fontSize: isNarrow ? 13 : 14,
      fontWeight: '600',
    },
    feedLapNumber: {
      textAlign: 'center',
      color: C.muted,
      fontFamily: monoMed,
      fontSize: isNarrow ? 11 : 12,
    },
    feedTime: {
      color: C.text,
      fontFamily: monoBold,
      fontSize: isNarrow ? 13 : 14,
      textAlign: 'right',
    },
    feedDelta: {
      fontFamily: monoBold,
      fontSize: isNarrow ? 12 : 13,
      textAlign: 'right',
    },
    feedTypeCol: { marginLeft: isNarrow ? 6 : 8, alignItems: 'center' },
    // Columns share the width so the driver name can't take it all.
    feedDriverCol: { flex: isNarrow ? 1.3 : 1.6, minWidth: 0, paddingRight: 8 },
    feedLapCol: { flex: isNarrow ? 0.55 : 0.6 },
    feedNumCol: { flex: 1 },
    feedFootnote: { color: C.muted, fontSize: 11, marginTop: 8, paddingHorizontal: 4 },
    statName: { flex: 1.6, minWidth: 0, paddingRight: 8 },
    statNameInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statCell: { flex: 1, textAlign: 'right' },
    statValue: { color: C.text, fontFamily: monoBold, fontSize: 13 },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: C.elevated, borderRadius: 8, paddingVertical: 4 },
    metricCell: { width: '25%', paddingHorizontal: 8, paddingVertical: 5 },
    raised: { zIndex: 10 },
    dropdownBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.panel,
      maxWidth: 200,
    },
    dropdownText: { color: C.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
    dropdownMenu: {
      position: 'absolute',
      top: 36,
      right: 0,
      minWidth: 200,
      backgroundColor: C.panel,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
      paddingVertical: 4,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
    dropdownItemText: { color: C.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
    dropdownCount: { color: C.muted, fontFamily: monoMed, fontSize: 12 },
    feedTypePill: {
      alignItems: 'center',
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
    },
    feedType: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
  });
}

