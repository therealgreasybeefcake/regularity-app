import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { VictoryChart, VictoryLine, VictoryBar, VictoryAxis, VictoryScatter } from 'victory-native';
import { Driver, LapTypeValues } from '../types';
import { ThemeColors } from '../types';

const screenWidth = Dimensions.get('window').width;

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

  const chartData = driver.laps.map((lap, index) => ({
    x: lap.number,
    y: lap.time,
    lapType: lap.lapType,
  }));

  const trendData = driver.laps.map((lap, index) => ({
    x: lap.number,
    y: trendLine.slope * index + trendLine.intercept,
  }));

  // Calculate min/max for better scaling
  const minTime = Math.min(...lapTimes);
  const maxTime = Math.max(...lapTimes);
  const padding = (maxTime - minTime) * 0.1 || 1;

  return (
    <View style={styles.chartContainer}>
      <Text style={[styles.chartTitle, { color: theme.text }]}>Lap Times</Text>
      <VictoryChart
        width={screenWidth - 64}
        height={220}
        padding={{ top: 20, bottom: 40, left: 50, right: 20 }}
        domain={{ y: [minTime - padding, maxTime + padding] }}
      >
        <VictoryAxis
          style={{
            axis: { stroke: theme.border },
            tickLabels: { fill: theme.textSecondary, fontSize: 10 },
            grid: { stroke: theme.border, strokeDasharray: '4,4', opacity: 0.3 },
            axisLabel: { fill: theme.textSecondary, fontSize: 12, padding: 30 },
          }}
          label="Lap #"
        />
        <VictoryAxis
          dependentAxis
          style={{
            axis: { stroke: theme.border },
            tickLabels: { fill: theme.textSecondary, fontSize: 10 },
            grid: { stroke: theme.border, strokeDasharray: '4,4', opacity: 0.3 },
            axisLabel: { fill: theme.textSecondary, fontSize: 12, padding: 40 },
          }}
          label="Time (s)"
        />
        {/* Trend line */}
        <VictoryLine
          data={trendData}
          style={{
            data: {
              stroke: theme.textSecondary,
              strokeWidth: 1.5,
              strokeDasharray: '4,4',
              opacity: 0.6,
            },
          }}
        />
        {/* Actual lap times */}
        <VictoryLine
          data={chartData}
          style={{
            data: { stroke: theme.primary, strokeWidth: 2 },
          }}
        />
        <VictoryScatter
          data={chartData}
          size={4}
          style={{
            data: {
              fill: ({ datum }) => {
                switch (datum.lapType) {
                  case 'bonus': return theme.bonus;
                  case 'broken': return theme.broken;
                  case 'changeover': return theme.changeover;
                  case 'safety': return theme.safety;
                  default: return theme.primary;
                }
              },
            },
          }}
        />
      </VictoryChart>
    </View>
  );
};

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
  const trendLine = calculateTrendLine(deltas);

  const chartData = nonChangeoverLaps.map((lap, index) => ({
    x: lap.number,
    y: lap.delta,
    lapType: lap.lapType,
  }));

  const trendData = nonChangeoverLaps.map((lap, index) => ({
    x: lap.number,
    y: trendLine.slope * index + trendLine.intercept,
  }));

  // Calculate appropriate y-axis range
  const maxAbsDelta = Math.max(...deltas.map(Math.abs));
  const yMax = Math.max(maxAbsDelta * 1.2, 1);

  return (
    <View style={styles.chartContainer}>
      <Text style={[styles.chartTitle, { color: theme.text }]}>Delta from Target</Text>
      <VictoryChart
        width={screenWidth - 64}
        height={220}
        padding={{ top: 20, bottom: 40, left: 50, right: 20 }}
        domain={{ y: [-yMax, yMax] }}
      >
        <VictoryAxis
          style={{
            axis: { stroke: theme.border },
            tickLabels: { fill: theme.textSecondary, fontSize: 10 },
            grid: { stroke: theme.border, strokeDasharray: '4,4', opacity: 0.3 },
            axisLabel: { fill: theme.textSecondary, fontSize: 12, padding: 30 },
          }}
          label="Lap #"
        />
        <VictoryAxis
          dependentAxis
          style={{
            axis: { stroke: theme.border },
            tickLabels: { fill: theme.textSecondary, fontSize: 10 },
            grid: { stroke: theme.border, strokeDasharray: '4,4', opacity: 0.3 },
            axisLabel: { fill: theme.textSecondary, fontSize: 12, padding: 40 },
          }}
          label="Delta (s)"
        />
        {/* Zero line */}
        <VictoryLine
          data={[
            { x: Math.min(...chartData.map(d => d.x)), y: 0 },
            { x: Math.max(...chartData.map(d => d.x)), y: 0 },
          ]}
          style={{
            data: { stroke: theme.textSecondary, strokeWidth: 1, strokeDasharray: '2,2' },
          }}
        />
        {/* Trend line */}
        <VictoryLine
          data={trendData}
          style={{
            data: {
              stroke: theme.textSecondary,
              strokeWidth: 1.5,
              strokeDasharray: '4,4',
              opacity: 0.6,
            },
          }}
        />
        {/* Delta bars */}
        <VictoryBar
          data={chartData}
          style={{
            data: {
              fill: ({ datum }) => {
                if (datum.lapType === 'bonus') return theme.bonus;
                if (datum.lapType === 'broken') return theme.broken;
                return datum.y >= 0 ? theme.warning : theme.primary;
              },
            },
          }}
          barWidth={12}
        />
      </VictoryChart>
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
