import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { calculateDriverStats, formatTime, type Driver as CoreDriver } from '@regularity/core';
import { subscribeLive, normalizeLap, type LiveSnapshot } from '../../lib/liveClient';
import { fonts } from '../../constants/theme';
import { LiveDot } from '../../components/ui';

// Public broadcast view — intentionally always-dark "Pit Wall", independent of the
// viewer's app theme. Palette mirrors the dark theme tokens in constants/theme.ts.
const C = {
  bg: '#070a11',
  panel: '#121826',
  panelHi: '#18202f',
  border: 'rgba(255,255,255,0.08)',
  borderFaint: 'rgba(255,255,255,0.05)',
  text: '#e8eef7',
  dim: '#8a97ab',
  muted: '#5d6a7e',
  green: '#22c55e',
  red: '#ef4444',
  blue: '#3b82f6',
  amber: '#f59e0b',
  accent: '#22d3ee',
  live: '#22d36b',
};
const monoBold = fonts.monoBold;
const monoMed = fonts.monoMedium;

function deltaColor(delta: number): string {
  if (delta < 0) return C.red;
  if (delta < 1) return C.green;
  return C.blue;
}

export default function LiveView() {
  const { publicToken } = useLocalSearchParams<{ publicToken: string }>();
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const snapRef = useRef<LiveSnapshot | null>(null);
  snapRef.current = snap;

  useEffect(() => {
    if (!publicToken) return;
    let gotData = false;
    const timeout = setTimeout(() => {
      if (!gotData) setNotFound(true);
    }, 8000);

    const unsub = subscribeLive(publicToken, {
      onSnapshot: (s) => {
        gotData = true;
        clearTimeout(timeout);
        setNotFound(false);
        setSnap(s);
      },
      onLap: (lap) => {
        const n = normalizeLap(lap);
        setSnap((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            drivers: prev.drivers.map((d) => {
              if (d.id !== n.sessionDriverId) return d;
              if (d.laps.some((l) => l.number === n.number)) return d; // dedupe
              return { ...d, laps: [...d.laps, { number: n.number, time: n.time, delta: n.delta, lapType: n.lapType, lapValue: n.lapValue, timestamp: n.timestamp }] };
            }),
          };
        });
      },
      onEnded: () => setSnap((prev) => (prev ? { ...prev, status: 'ended' } : prev)),
      onStatus: setConnected,
    });
    return () => {
      clearTimeout(timeout);
      unsub();
    };
  }, [publicToken]);

  // Recompute stats live, reusing the shared core scoring.
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
      .slice(0, 12);
    return {
      drivers: withStats,
      teamStats: { percentageFactor: goal > 0 ? (achieved / goal) * 100 : 0, achievedLaps: achieved, goalLaps: goal },
      recent: recentLaps,
    };
  }, [snap]);

  if (notFound) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <Text style={styles.title}>Session not found</Text>
        <Text style={styles.dim}>This live link is invalid or has expired.</Text>
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

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{snap.sessionNumber ? `SESSION ${snap.sessionNumber}` : 'LIVE TIMING'}</Text>
          <Text style={styles.title} numberOfLines={1}>{snap.raceName || 'Regularity Session'}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: isLive ? 'rgba(34,211,107,0.14)' : 'rgba(138,151,171,0.14)', borderColor: isLive ? 'rgba(34,211,107,0.4)' : C.border }]}>
          <LiveDot size={8} color={isLive ? C.live : C.dim} active={isLive} />
          <Text style={[styles.badgeText, { color: isLive ? C.live : C.dim }]}>{isLive ? 'LIVE' : 'ENDED'}</Text>
        </View>
      </View>

      <View style={styles.factorCard}>
        <Text style={styles.factorLabel}>% FACTOR</Text>
        <Text style={styles.factorValue}>{teamStats.percentageFactor.toFixed(1)}</Text>
        <Text style={styles.dim}>{teamStats.achievedLaps.toFixed(0)} / {teamStats.goalLaps.toFixed(0)} goal laps · {connected ? 'connected' : 'reconnecting…'}</Text>
      </View>

      {drivers.map(({ d, stats, last }) => (
        <View key={d.id} style={styles.driverCard}>
          <View style={styles.driverHeader}>
            <Text style={styles.driverName} numberOfLines={1}>{d.name}</Text>
            <Text style={styles.lapCount}>{d.laps.length} LAPS</Text>
          </View>
          <View style={styles.driverBody}>
            <View style={styles.lastLap}>
              <Text style={[styles.lapTime, { color: C.text }]}>{last ? formatTime(last.time) : '—'}</Text>
              {last ? (
                <Text style={[styles.lapDelta, { color: deltaColor(last.delta) }]}>
                  {last.delta >= 0 ? '+' : ''}
                  {last.delta.toFixed(2)}s
                </Text>
              ) : (
                <Text style={styles.dim}>no laps yet</Text>
              )}
            </View>
            <View style={styles.metrics}>
              <Metric label="AVG Δ" value={`${stats.averageDelta >= 0 ? '+' : ''}${stats.averageDelta.toFixed(2)}`} />
              <Metric label="3-LAP" value={stats.threelapAvg == null ? '—' : `${stats.threelapAvg >= 0 ? '+' : ''}${stats.threelapAvg.toFixed(2)}`} />
              <Metric label="ACHIEVED" value={stats.achievedLaps.toFixed(0)} />
            </View>
          </View>
        </View>
      ))}

      <Text style={styles.sectionTitle}>RECENT LAPS</Text>
      <View style={styles.feed}>
        {recent.length === 0 ? (
          <Text style={[styles.dim, { padding: 16 }]}>Waiting for laps…</Text>
        ) : (
          recent.map((l, i) => (
            <View key={`${l.driver}-${l.number}-${i}`} style={[styles.feedRow, i === recent.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={[styles.feedDriver]} numberOfLines={1}>{l.driver}</Text>
              <Text style={styles.feedTime}>{formatTime(l.time)}</Text>
              <Text style={[styles.feedDelta, { color: deltaColor(l.delta) }]}>
                {l.delta >= 0 ? '+' : ''}{l.delta.toFixed(2)}
              </Text>
              <Text style={[styles.feedType, { color: deltaColor(l.delta) }]}>{l.lapType.toUpperCase()}</Text>
            </View>
          ))
        )}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  kicker: { color: C.accent, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 3 },
  title: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: 0.2 },
  dim: { color: C.dim, fontSize: 13 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  factorCard: { backgroundColor: C.panel, borderRadius: 18, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  factorLabel: { color: C.dim, fontSize: 11, letterSpacing: 2.5, fontWeight: '700' },
  factorValue: { color: C.text, fontSize: 60, fontFamily: fonts.monoExtraBold, marginVertical: 6, letterSpacing: -2 },
  driverCard: { backgroundColor: C.panel, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  driverHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  driverName: { color: C.text, fontSize: 18, fontWeight: '700', flex: 1 },
  lapCount: { color: C.dim, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  driverBody: { flexDirection: 'row', alignItems: 'center' },
  lastLap: { flex: 1 },
  lapTime: { fontSize: 32, fontFamily: monoBold, letterSpacing: -1 },
  lapDelta: { fontSize: 16, fontFamily: monoBold, marginTop: 2 },
  metrics: { flexDirection: 'row', gap: 16 },
  metric: { alignItems: 'flex-end', minWidth: 56 },
  metricLabel: { color: C.muted, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  metricValue: { color: C.text, fontSize: 16, fontFamily: monoBold, marginTop: 3 },
  sectionTitle: { color: C.dim, fontSize: 11, letterSpacing: 2.5, fontWeight: '700', marginTop: 10, marginBottom: 8, marginLeft: 4 },
  feed: { backgroundColor: C.panel, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  feedRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderFaint },
  feedDriver: { color: C.text, flex: 1, fontSize: 14, fontWeight: '600' },
  feedTime: { color: C.text, fontFamily: monoMed, fontSize: 14, width: 92, textAlign: 'right' },
  feedDelta: { fontFamily: monoBold, fontSize: 14, width: 64, textAlign: 'right' },
  feedType: { fontSize: 10, fontWeight: '800', width: 80, textAlign: 'right', letterSpacing: 0.5 },
});
