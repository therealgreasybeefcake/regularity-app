import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { calculateDriverStats, formatTime, type Driver as CoreDriver } from '@regularity/core';
import { subscribeLive, normalizeLap, type LiveSnapshot } from '../../lib/liveClient';
import { ensureLiveAudio, playLapTone } from '../../lib/liveSounds';
import { fonts } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { useApp, canEditTeam } from '../../context/AppContext';
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
  };
}

export default function LiveView() {
  const { publicToken } = useLocalSearchParams<{ publicToken: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 860;

  const { liveSoundDefault, memberships, liveSession, endLiveSession, discardLiveSession } = useApp();
  const { showAlert } = useAlert();
  const C = useMemo(() => palette(theme), [theme]);
  const styles = useMemo(() => makeStyles(C, isWide), [C, isWide]);
  const deltaColor = (delta: number) => (delta < 0 ? C.red : delta < 1 ? C.green : C.blue);

  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [soundOn, setSoundOn] = useState(liveSoundDefault);
  const [ending, setEnding] = useState(false);
  const [focusedDriverId, setFocusedDriverId] = useState<string | null>(null);

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

  const goToPortal = () => {
    if (redirectTimer.current) return;
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
      return { d, stats, last };
    });
    const recentLaps = snap.drivers
      .flatMap((d) => d.laps.map((l) => ({ driver: d.name, ...l })))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 16);
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

  // Standby drivers (all other team drivers)
  const standbyDrivers = useMemo(() => {
    if (!activeDriver) return [];
    return drivers.filter((x) => x.d.id !== activeDriver.d.id);
  }, [drivers, activeDriver]);

  if (notFound) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <Text style={styles.title}>Session ended</Text>
        <Text style={styles.dim}>This live session has ended or its link expired.</Text>
        <Text style={[styles.dim, { marginTop: 12 }]}>Returning to the portal…</Text>
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
      <View style={[styles.headerWrap, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.titleBadgeRow}>
              <Text style={styles.kicker}>
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
        {/* Cockpit Split: Active Driver Hero (Main) + Prominent % Factor */}
        <View style={styles.dashboardSplit}>
          {/* Active Driver Hero Card */}
          {activeDriver ? (
            <View style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <View style={styles.heroDriverIdentity}>
                  <View style={styles.onTrackBadge}>
                    <LiveDot size={8} color={C.live} active={isLive} />
                    <Text style={styles.onTrackText}>ON TRACK</Text>
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
                <Text style={styles.clockSubLabel}>{isLive && timerStopped ? 'TIMER STOPPED' : 'CURRENT LAP TIME'}</Text>
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
                    <View style={[styles.lapTypeBadge, { backgroundColor: `${deltaColor(activeDriver.last.delta)}18` }]}>
                      <Text style={[styles.lapTypeText, { color: deltaColor(activeDriver.last.delta) }]}>
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

        {/* Standby / Non-Active Drivers Section (Subdued & Compact) */}
        {standbyDrivers.length > 0 && (
          <View style={styles.standbySection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>STANDBY DRIVERS</Text>
              <Text style={styles.sectionHint}>Tap driver to switch focus</Text>
            </View>

            <View style={styles.standbyGrid}>
              {standbyDrivers.map(({ d, stats, last }) => (
                <Pressable
                  key={d.id}
                  style={styles.standbyCard}
                  onPress={() => setFocusedDriverId(d.id)}
                  accessibilityLabel={`Focus on driver ${d.name}`}
                >
                  <View style={styles.standbyCardHeader}>
                    <View style={styles.standbyIdentity}>
                      <Text style={styles.standbyName} numberOfLines={1}>{d.name}</Text>
                      <View style={styles.standbyPill}>
                        <Text style={styles.standbyPillText}>STANDBY</Text>
                      </View>
                    </View>
                    <Text style={styles.standbyLapCount}>{d.laps.length} LAPS</Text>
                  </View>

                  <View style={styles.standbyDetailsRow}>
                    <View style={styles.standbyMetric}>
                      <Text style={styles.standbyMetricLabel}>TARGET</Text>
                      <Text style={styles.standbyMetricValue}>{d.targetTime > 0 ? formatTime(d.targetTime) : '—'}</Text>
                    </View>
                    <View style={styles.standbyMetric}>
                      <Text style={styles.standbyMetricLabel}>LAST LAP</Text>
                      <Text style={styles.standbyMetricValue}>
                        {last ? formatTime(last.time) : '—'}
                      </Text>
                    </View>
                    <View style={styles.standbyMetric}>
                      <Text style={styles.standbyMetricLabel}>AVG Δ</Text>
                      <Text style={[styles.standbyMetricValue, { color: last ? deltaColor(stats.averageDelta) : C.text }]}>
                        {last ? `${stats.averageDelta >= 0 ? '+' : '\u2212'}${Math.abs(stats.averageDelta).toFixed(2)}s` : '—'}
                      </Text>
                    </View>
                    <View style={styles.standbyMetric}>
                      <Text style={styles.standbyMetricLabel}>ACHIEVED</Text>
                      <Text style={[styles.standbyMetricValue, { color: C.green }]}>
                        {stats.achievedLaps.toFixed(0)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Recent Laps Telemetry Table */}
        <View style={styles.recentSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>RECENT LAPS</Text>
            <Text style={styles.sectionHint}>Live telemetry stream</Text>
          </View>

          <View style={styles.feed}>
            {recent.length === 0 ? (
              <Text style={[styles.dim, { padding: 18, textAlign: 'center' }]}>Waiting for live lap recordings…</Text>
            ) : (
              <View>
                {/* Table Header Row */}
                <View style={styles.feedHeaderRow}>
                  <Text style={[styles.feedHeaderCell, { flex: 1.2 }]}>DRIVER</Text>
                  <Text style={[styles.feedHeaderCell, { width: 50, textAlign: 'center' }]}>LAP</Text>
                  <Text style={[styles.feedHeaderCell, { width: 90, textAlign: 'right' }]}>TIME</Text>
                  <Text style={[styles.feedHeaderCell, { width: 85, textAlign: 'right' }]}>DELTA</Text>
                  <Text style={[styles.feedHeaderCell, { width: 95, textAlign: 'right' }]}>TYPE</Text>
                </View>

                {recent.map((l, i) => (
                  <View key={`${l.driver}-${l.number}-${i}`} style={[styles.feedRow, i === recent.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={styles.feedDriver} numberOfLines={1}>{l.driver}</Text>
                    <Text style={styles.feedLapNumber}>#{l.number}</Text>
                    <Text style={styles.feedTime} numberOfLines={1}>{formatTime(l.time)}</Text>
                    <Text style={[styles.feedDelta, { color: deltaColor(l.delta) }]} numberOfLines={1}>
                      {`${l.delta >= 0 ? '+' : '\u2212'}${Math.abs(l.delta).toFixed(2)}s`}
                    </Text>
                    <View style={[styles.feedTypePill, { backgroundColor: `${deltaColor(l.delta)}18`, borderColor: `${deltaColor(l.delta)}33` }]}>
                      <Text style={[styles.feedType, { color: deltaColor(l.delta) }]} numberOfLines={1}>
                        {l.lapType.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
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

function makeStyles(C: LivePalette, isWide: boolean) {
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
      gap: 10,
      marginTop: 18,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.borderFaint,
    },
    heroMetricItem: {
      flex: 1,
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
      gap: 8,
      marginTop: 4,
    },
    factorStatBox: {
      flex: 1,
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
    standbyDetailsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: C.elevated,
      padding: 8,
      borderRadius: 8,
    },
    standbyMetric: {
      alignItems: 'flex-start',
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
      paddingHorizontal: 14,
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
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.borderFaint,
    },
    feedDriver: {
      color: C.text,
      flex: 1.2,
      fontSize: 14,
      fontWeight: '600',
    },
    feedLapNumber: {
      width: 50,
      textAlign: 'center',
      color: C.muted,
      fontFamily: monoMed,
      fontSize: 12,
    },
    feedTime: {
      color: C.text,
      fontFamily: monoBold,
      fontSize: 14,
      width: 90,
      textAlign: 'right',
    },
    feedDelta: {
      fontFamily: monoBold,
      fontSize: 13,
      width: 75,
      textAlign: 'right',
    },
    feedTypePill: {
      width: 95,
      alignItems: 'center',
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      marginLeft: 8,
    },
    feedType: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
  });
}

