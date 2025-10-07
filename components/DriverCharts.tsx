import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CartesianChart, Line, Bar } from 'victory-native';
import { Circle } from '@shopify/react-native-skia';
import { Driver, LapTypeValues } from '../types';
import { ThemeColors } from '../types';

interface DriverChartsProps {
  driver: Driver;
  lapTypeValues: LapTypeValues;
  theme: ThemeColors;
}

// Calculate linear regression for trend line
const calculateTrendLine = (data: number[]): { slope: number; intercept: number } => {
  const n = data.length;
  if (n === 0) return { slope: 0, intercept: 0 };

  const sumX = data.reduce((sum, _, i) => sum + i, 0);
  const sumY = data.reduce((sum, val) => sum + val, 0);
  const sumXY = data.reduce((sum, val, i) => sum + i * val, 0);
  const sumXX = data.reduce((sum, _, i) => sum + i * i, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
};

interface LapData {
  number: number;
  time: number;
  trend: number;
  lapType: string;
  [key: string]: unknown;
}

export const LapTimesChart: React.FC<DriverChartsProps> = ({ driver, theme }) => {
  if (driver.laps.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No lap data available</Text>
      </View>
    );
  }

  const lapTimes = driver.laps.map(lap => lap.time);
  const { slope, intercept } = calculateTrendLine(lapTimes);

  const chartData: LapData[] = driver.laps.map((lap, index) => ({
    number: lap.number,
    time: lap.time,
    trend: slope * index + intercept,
    lapType: lap.lapType,
  }));

  // Calculate min/max for better scaling
  const minTime = Math.min(...lapTimes);
  const maxTime = Math.max(...lapTimes);
  const padding = (maxTime - minTime) * 0.15 || 1;

  // Calculate average lap time
  const avgTime = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length;

  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartHeader}>
        <Text style={[styles.chartTitle, { color: theme.text }]}>Lap Times</Text>
        <Text style={[styles.chartSubtitle, { color: theme.textSecondary }]}>
          Avg: {avgTime.toFixed(2)}s
        </Text>
      </View>
      <CartesianChart
        data={chartData}
        xKey="number"
        yKeys={["time", "trend"]}
        axisOptions={{
          tickCount: { x: 5, y: 6 },
          labelOffset: { x: 2, y: 4 },
          labelColor: theme.textSecondary,
          lineColor: theme.border,
          formatYLabel: (value: unknown) => `${Number(value).toFixed(1)}s`,
          formatXLabel: (value: unknown) => `L${Math.round(Number(value))}`,
        }}
        domain={{ y: [minTime - padding, maxTime + padding] }}
      >
        {({ points, chartBounds }) => (
          <>
            {/* Trend line */}
            <Line
              points={points.trend}
              color={theme.textSecondary}
              strokeWidth={1.5}
              opacity={0.5}
            />
            {/* Actual lap times line */}
            <Line
              points={points.time}
              color={theme.primary}
              strokeWidth={2.5}
            />
            {/* Scatter points with lap type colors */}
            {points.time.map((point, index) => {
              if (typeof point.y !== 'number') return null;
              const lapType = chartData[index]?.lapType;
              let color = theme.primary;
              let radius = 5;
              switch (lapType) {
                case 'bonus':
                  color = theme.bonus;
                  radius = 6;
                  break;
                case 'broken':
                  color = theme.broken;
                  radius = 6;
                  break;
                case 'changeover':
                  color = theme.changeover;
                  radius = 5;
                  break;
                case 'safety':
                  color = theme.safety;
                  radius = 5;
                  break;
              }
              return (
                <Circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r={radius}
                  color={color}
                />
              );
            })}
          </>
        )}
      </CartesianChart>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: theme.bonus }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Bonus</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: theme.broken }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Broken</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: theme.changeover }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Changeover</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: theme.safety }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Safety</Text>
        </View>
      </View>
    </View>
  );
};

interface DeltaData {
  number: number;
  delta: number;
  zero: number;
  lapType: string;
  [key: string]: unknown;
}

export const DeltaChart: React.FC<DriverChartsProps> = ({ driver, theme }) => {
  // Filter out changeover and safety laps for delta chart
  const nonChangeoverLaps = driver.laps.filter(
    lap => lap.lapType !== 'changeover' && lap.lapType !== 'safety'
  );

  if (nonChangeoverLaps.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No delta data available</Text>
      </View>
    );
  }

  const deltas = nonChangeoverLaps.map(lap => lap.delta);

  const chartData: DeltaData[] = nonChangeoverLaps.map((lap) => ({
    number: lap.number,
    delta: lap.delta,
    zero: 0,
    lapType: lap.lapType,
  }));

  // Calculate appropriate y-axis range
  const maxAbsDelta = Math.max(...deltas.map(Math.abs));
  const yMax = Math.max(maxAbsDelta * 1.2, 1);

  // Calculate statistics
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const bonusCount = nonChangeoverLaps.filter(l => l.lapType === 'bonus').length;
  const brokenCount = nonChangeoverLaps.filter(l => l.lapType === 'broken').length;

  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartHeader}>
        <Text style={[styles.chartTitle, { color: theme.text }]}>Delta from Target</Text>
        <Text style={[styles.chartSubtitle, { color: theme.textSecondary }]}>
          Avg: {avgDelta >= 0 ? '+' : ''}{avgDelta.toFixed(3)}s
        </Text>
      </View>
      <CartesianChart
        data={chartData}
        xKey="number"
        yKeys={["delta", "zero"]}
        axisOptions={{
          tickCount: { x: 5, y: 7 },
          labelOffset: { x: 2, y: 4 },
          labelColor: theme.textSecondary,
          lineColor: theme.border,
          formatYLabel: (value: unknown) => {
            const v = Number(value);
            return v >= 0 ? `+${v.toFixed(1)}s` : `${v.toFixed(1)}s`;
          },
          formatXLabel: (value: unknown) => `L${Math.round(Number(value))}`,
        }}
        domain={{ y: [-yMax, yMax] }}
      >
        {({ points, chartBounds }) => (
          <>
            {/* Zero reference line */}
            <Line
              points={points.zero}
              color={theme.textSecondary}
              strokeWidth={1}
              opacity={0.3}
            />
            {/* Delta bars */}
            {points.delta.map((point, index) => {
              if (typeof point.y !== 'number' || typeof point.x !== 'number') return null;
              const lapType = chartData[index]?.lapType;
              let barColor = point.y >= 0 ? theme.warning : theme.primary;
              if (lapType === 'bonus') barColor = theme.bonus;
              if (lapType === 'broken') barColor = theme.broken;

              return (
                <Bar
                  key={index}
                  points={[point]}
                  chartBounds={chartBounds}
                  barWidth={8}
                  color={barColor}
                  roundedCorners={{
                    topLeft: 2,
                    topRight: 2,
                    bottomLeft: 2,
                    bottomRight: 2,
                  }}
                />
              );
            })}
          </>
        )}
      </CartesianChart>
      <View style={styles.statsRow}>
        <Text style={[styles.statsText, { color: theme.textSecondary }]}>
          Bonus: {bonusCount} | Broken: {brokenCount}
        </Text>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: theme.bonus }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Bonus</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: theme.broken }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Broken</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: theme.warning }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Over Target</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: theme.primary }]} />
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Under Target</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  chartContainer: {
    marginVertical: 12,
    height: 250,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  chartSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 40,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 12,
  },
  emptyText: {
    fontSize: 14,
  },
  statsRow: {
    alignItems: 'center',
    marginTop: 4,
  },
  statsText: {
    fontSize: 12,
    fontWeight: '500',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
  },
});
