import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line, Path, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { Driver, ThemeColors } from '../types';
import { fonts, spacing, typography, fontWeights, radius } from '../constants/theme';

/**
 * Categorical driver colors, assigned by roster position so a driver keeps their
 * color everywhere (chart, legend, tabs, table). Validated for adjacent-series
 * CVD separation on the app's light (#ffffff) and dark (#121826) card surfaces;
 * the lighter light-mode hues are relieved by direct labels + the comparison table.
 */
const DRIVER_COLORS_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const DRIVER_COLORS_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export const driverColor = (index: number, isDark: boolean) =>
  (isDark ? DRIVER_COLORS_DARK : DRIVER_COLORS_LIGHT)[index % DRIVER_COLORS_LIGHT.length];

/** Laps that measure regularity — changeover and safety-car laps would swamp the scale. */
const isRegular = (lapType: string) => lapType !== 'changeover' && lapType !== 'safety';

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}s`;

interface Props {
  drivers: Driver[];
  theme: ThemeColors;
  isDark: boolean;
  width: number;
  height?: number;
}

const PAD = { top: 12, right: 96, bottom: 28, left: 52 };

/**
 * Gap to target per lap, one line per driver, on a shared axis — the regularity
 * comparison. The 0 to +1s band is where bonus laps land. Web-first: hover shows
 * a crosshair with every driver's gap at that lap.
 */
export function DriverComparisonChart({ drivers, theme, isDark, width, height = 300 }: Props) {
  const containerRef = useRef<View>(null);
  const [hoverLap, setHoverLap] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  const series = useMemo(
    () =>
      drivers.slice(0, DRIVER_COLORS_LIGHT.length).map((d, i) => ({
        name: d.name?.trim() || `Driver ${i + 1}`,
        color: driverColor(i, isDark),
        points: d.laps.filter((l) => isRegular(l.lapType)).map((l) => ({ lap: l.number, delta: l.delta })),
      })),
    [drivers, isDark],
  );

  const all = series.flatMap((s) => s.points);
  const plotW = Math.max(width - PAD.left - PAD.right, 120);
  const plotH = height - PAD.top - PAD.bottom;

  if (all.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: theme.border, height: 120 }]}>
        <Text style={{ color: theme.textMuted, fontSize: typography.body }}>No regular laps recorded yet</Text>
      </View>
    );
  }

  // Y domain: always show the bonus band (0 to +1s); clamp to a sane window so a
  // single wild lap can't flatten everyone else. Clamped points sit on the edge.
  const rawMin = Math.min(...all.map((p) => p.delta));
  const rawMax = Math.max(...all.map((p) => p.delta));
  const yMin = Math.max(Math.min(rawMin, -0.5), -10);
  const yMax = Math.min(Math.max(rawMax, 1.5), 15);
  const span = yMax - yMin;
  const step = span <= 3 ? 0.5 : span <= 8 ? 1 : span <= 16 ? 2 : 5;
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-9; v += step) yTicks.push(Number(v.toFixed(2)));

  const maxLap = Math.max(...all.map((p) => p.lap), 2);
  const x = (lap: number) => PAD.left + ((lap - 1) / (maxLap - 1)) * plotW;
  const y = (delta: number) => PAD.top + ((yMax - Math.min(Math.max(delta, yMin), yMax)) / span) * plotH;
  const xStep = Math.max(1, Math.ceil(maxLap / Math.max(2, Math.floor(plotW / 48))));
  const xTicks: number[] = [];
  for (let l = 1; l <= maxLap; l += xStep) xTicks.push(l);

  // Direct labels at each line's end, nudged apart so names never overlap.
  const ends = series
    .filter((s) => s.points.length)
    .map((s) => {
      const last = s.points[s.points.length - 1];
      return { name: s.name, color: s.color, x: x(last.lap), y: y(last.delta) };
    })
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  }

  const onPointerMove = (e: any) => {
    const node = containerRef.current as unknown as HTMLElement | null;
    const rect = node?.getBoundingClientRect?.();
    if (!rect) return;
    const px = e.nativeEvent.clientX - rect.left;
    if (px < PAD.left - 8 || px > PAD.left + plotW + 8) {
      setHoverLap(null);
      return;
    }
    const lap = Math.round(((px - PAD.left) / plotW) * (maxLap - 1)) + 1;
    setHoverLap(Math.min(Math.max(lap, 1), maxLap));
    setHoverX(px);
  };

  const hoverRows =
    hoverLap === null
      ? []
      : series.map((s) => ({ ...s, point: s.points.find((p) => p.lap === hoverLap) ?? null }));
  const tooltipLeft = hoverX + 220 > width ? hoverX - 216 : hoverX + 16;

  const grid = String(theme.borderFaint);
  const axisText = String(theme.textMuted);

  return (
    <View>
      {/* Legend — identity never relies on color alone (names also label the lines). */}
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.name} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
            <Text style={[styles.legendText, { color: theme.textSecondary }]}>{s.name}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendBand, { backgroundColor: String(theme.bonus), opacity: 0.18 }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Bonus band (0 to +1s)</Text>
        </View>
      </View>

      <View
        ref={containerRef}
        style={{ width, height }}
        // react-native-web forwards pointer events to the DOM node.
        {...({ onPointerMove, onPointerLeave: () => setHoverLap(null) } as any)}
      >
        <Svg width={width} height={height}>
          {/* Bonus band */}
          <Rect
            x={PAD.left}
            y={y(1)}
            width={plotW}
            height={Math.max(y(0) - y(1), 0)}
            fill={String(theme.bonus)}
            opacity={0.12}
          />
          {/* Grid + y labels */}
          {yTicks.map((t) => (
            <React.Fragment key={`y${t}`}>
              <Line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? String(theme.textMuted) : grid} strokeWidth={t === 0 ? 1.25 : 1} />
              <SvgText x={PAD.left - 8} y={y(t) + 4} fontSize={11} fill={axisText} textAnchor="end" fontFamily={fonts.mono}>
                {t === 0 ? '0' : `${t > 0 ? '+' : '−'}${Math.abs(t)}`}
              </SvgText>
            </React.Fragment>
          ))}
          {/* X labels */}
          {xTicks.map((l) => (
            <SvgText key={`x${l}`} x={x(l)} y={height - 8} fontSize={11} fill={axisText} textAnchor="middle" fontFamily={fonts.mono}>
              {String(l)}
            </SvgText>
          ))}

          {/* Crosshair */}
          {hoverLap !== null && (
            <Line x1={x(hoverLap)} x2={x(hoverLap)} y1={PAD.top} y2={PAD.top + plotH} stroke={String(theme.textMuted)} strokeWidth={1} strokeDasharray="3 3" />
          )}

          {/* Lines */}
          {series.map((s) =>
            s.points.length > 1 ? (
              <Path
                key={`l${s.name}`}
                d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.lap).toFixed(1)},${y(p.delta).toFixed(1)}`).join(' ')}
                stroke={s.color}
                strokeWidth={2}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}
          {/* Markers: hovered lap, plus lone points that have no line */}
          {series.map((s) =>
            s.points
              .filter((p) => p.lap === hoverLap || s.points.length === 1)
              .map((p) => (
                <Circle
                  key={`m${s.name}${p.lap}`}
                  cx={x(p.lap)}
                  cy={y(p.delta)}
                  r={4.5}
                  fill={s.color}
                  stroke={String(theme.card)}
                  strokeWidth={2}
                />
              )),
          )}

          {/* Direct labels */}
          {ends.map((e) => (
            <SvgText key={`n${e.name}`} x={e.x + 8} y={e.y + 4} fontSize={12} fontWeight="600" fill={String(theme.text)}>
              {e.name.length > 12 ? `${e.name.slice(0, 11)}…` : e.name}
            </SvgText>
          ))}
        </Svg>

        {/* Tooltip */}
        {hoverLap !== null && (
          <View
            pointerEvents="none"
            style={[styles.tooltip, { left: Math.max(tooltipLeft, 0), backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
          >
            <Text style={[styles.tooltipTitle, { color: theme.text }]}>Lap {hoverLap}</Text>
            {hoverRows.map((r) => (
              <View key={r.name} style={styles.tooltipRow}>
                <View style={[styles.legendSwatch, { backgroundColor: r.color }]} />
                <Text style={[styles.tooltipName, { color: theme.textSecondary }]} numberOfLines={1}>{r.name}</Text>
                <Text style={[styles.tooltipValue, { color: r.point ? theme.text : theme.textMuted }]}>
                  {r.point ? signed(r.point.delta) : '—'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Text style={[styles.axisCaption, { color: theme.textMuted }]}>
        Gap to target (s) by driver lap number · changeover and safety-car laps excluded
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginBottom: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendBand: { width: 16, height: 10, borderRadius: 2 },
  legendText: { fontSize: typography.caption, fontWeight: fontWeights.semibold },
  tooltip: { position: 'absolute', top: PAD.top, width: 200, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, gap: 4 },
  tooltipTitle: { fontSize: typography.caption, fontWeight: fontWeights.bold, marginBottom: 2 },
  tooltipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tooltipName: { flex: 1, fontSize: typography.caption },
  tooltipValue: { fontSize: typography.caption, fontFamily: fonts.mono },
  axisCaption: { fontSize: typography.micro, marginTop: spacing.xs },
});
