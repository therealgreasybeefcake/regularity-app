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
  const trendLine = calculateTrendLine(lapTimes);

  const chartData: LapData[] = driver.laps.map((lap, index) => ({
    number: lap.number,
    time: lap.time,
    lapType: lap.lapType,
  }));

  // Calculate min/max for better scaling
  const minTime = Math.min(...lapTimes);
  const maxTime = Math.max(...lapTimes);
  const padding = (maxTime - minTime) * 0.1 || 1;

  return (
    <View style={styles.chartContainer}>
      <Text style={[styles.chartTitle, { color: theme.text }]}>Lap Times</Text>
      <CartesianChart
        data={chartData}
        xKey="number"
        yKeys={["time"]}
        axisOptions={{
          tickCount: 5,
          labelOffset: { x: 2, y: 4 },
          labelColor: theme.textSecondary,
          lineColor: theme.border,
          formatYLabel: (value: unknown) => `${Number(value).toFixed(1)}s`,
        }}
        domain={{ y: [minTime - padding, maxTime + padding] }}
      >
        {({ points }) => (
          <>
            {/* Actual lap times line */}
            <Line
              points={points.time}
              color={theme.primary}
              strokeWidth={2}
            />
            {/* Scatter points with lap type colors */}
            {points.time.map((point, index) => {
              if (typeof point.y !== 'number') return null;
              const lapType = chartData[index]?.lapType;
              let color = theme.primary;
              switch (lapType) {
                case 'bonus': color = theme.bonus; break;
                case 'broken': color = theme.broken; break;
                case 'changeover': color = theme.changeover; break;
                case 'safety': color = theme.safety; break;
              }
              return (
                <Circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r={4}
                  color={color}
                />
              );
            })}
          </>
        )}
      </CartesianChart>
    </View>
  );
};

interface DeltaData {
  number: number;
  delta: number;
  lapType: string;
  [key: string]: unknown;
}

export const DeltaChart: React.FC<DriverChartsProps> = ({ driver, lapTypeValues, theme }) => {
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
    lapType: lap.lapType,
  }));

  // Calculate appropriate y-axis range
  const maxAbsDelta = Math.max(...deltas.map(Math.abs));
  const yMax = Math.max(maxAbsDelta * 1.2, 1);

  return (
    <View style={styles.chartContainer}>
      <Text style={[styles.chartTitle, { color: theme.text }]}>Delta from Target</Text>
      <CartesianChart
        data={chartData}
        xKey="number"
        yKeys={["delta"]}
        axisOptions={{
          tickCount: 5,
          labelOffset: { x: 2, y: 4 },
          labelColor: theme.textSecondary,
          lineColor: theme.border,
          formatYLabel: (value: unknown) => `${Number(value).toFixed(1)}s`,
        }}
        domain={{ y: [-yMax, yMax] }}
      >
        {({ points }) => (
          <>
            {/* Delta bars */}
            {points.delta.map((point, index) => {
              if (typeof point.y !== 'number') return null;
              const lapType = chartData[index]?.lapType;
              let barColor = point.y >= 0 ? theme.warning : theme.primary;
              if (lapType === 'bonus') barColor = theme.bonus;
              if (lapType === 'broken') barColor = theme.broken;

              return (
                <Bar
                  key={index}
                  points={[point]}
                  chartBounds={{ left: 0, right: 300, top: 0, bottom: 200 }}
                  barWidth={12}
                  color={barColor}
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
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
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
