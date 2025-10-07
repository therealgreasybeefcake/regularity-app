import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { Driver } from '../types';
import { ThemeColors } from '../types';

interface DriverChartsProps {
  driver: Driver;
  theme: ThemeColors;
}

export const LapTimesChart: React.FC<DriverChartsProps> = ({ driver, theme }) => {
  const [selectedLap, setSelectedLap] = useState<number | null>(null);

  if (driver.laps.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.background }]}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No lap data available</Text>
      </View>
    );
  }

  const lapTimes = driver.laps.map(lap => lap.time);
  const avgTime = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length;
  const minTime = Math.min(...lapTimes);
  const maxTime = Math.max(...lapTimes);

  // Prepare data for line chart
  const lineData = driver.laps.map((lap, index) => {
    let dataPointColor = theme.primary;
    let dataPointRadius = 5;

    switch (lap.lapType) {
      case 'bonus':
        dataPointColor = theme.bonus;
        dataPointRadius = 7;
        break;
      case 'broken':
        dataPointColor = theme.broken;
        dataPointRadius = 7;
        break;
      case 'changeover':
        dataPointColor = theme.changeover;
        dataPointRadius = 6;
        break;
      case 'safety':
        dataPointColor = theme.safety;
        dataPointRadius = 6;
        break;
    }

    const isSelected = selectedLap === index;

    return {
      value: lap.time,
      label: `${lap.number}`,
      dataPointColor,
      dataPointRadius: isSelected ? dataPointRadius + 2 : dataPointRadius,
      customDataPoint: () => (
        <View
          style={{
            width: (isSelected ? dataPointRadius + 2 : dataPointRadius) * 2,
            height: (isSelected ? dataPointRadius + 2 : dataPointRadius) * 2,
            backgroundColor: dataPointColor,
            borderRadius: isSelected ? dataPointRadius + 2 : dataPointRadius,
            borderWidth: isSelected ? 2 : 0,
            borderColor: '#fff',
          }}
        />
      ),
      onPress: () => setSelectedLap(index),
    };
  });

  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartHeader}>
        <Text style={[styles.chartTitle, { color: theme.text }]}>Lap Times</Text>
        <Text style={[styles.chartSubtitle, { color: theme.textSecondary }]}>
          Avg: {avgTime.toFixed(2)}s
        </Text>
      </View>

      {selectedLap !== null && driver.laps[selectedLap] && (
        <View style={[styles.selectedLapInfo, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <Text style={[styles.selectedLapText, { color: theme.text }]}>
            Lap {driver.laps[selectedLap].number}: {driver.laps[selectedLap].time?.toFixed(2) || 'N/A'}s
            {' '}({driver.laps[selectedLap].lapType})
          </Text>
          <TouchableOpacity onPress={() => setSelectedLap(null)}>
            <Text style={[styles.closeButton, { color: theme.primary }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <LineChart
        data={lineData}
        height={180}
        width={300}
        initialSpacing={10}
        spacing={lineData.length > 10 ? 20 : 30}
        thickness={2.5}
        color={theme.primary}
        hideDataPoints={false}
        dataPointsColor={theme.primary}
        dataPointsRadius={5}
        textColor={theme.textSecondary}
        textFontSize={10}
        yAxisTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: theme.textSecondary, fontSize: 9 }}
        yAxisColor={theme.border}
        xAxisColor={theme.border}
        rulesColor={theme.border}
        rulesType="solid"
        yAxisThickness={1}
        xAxisThickness={1}
        noOfSections={5}
        maxValue={maxTime + (maxTime - minTime) * 0.1}
        minValue={minTime - (maxTime - minTime) * 0.1}
        formatYLabel={(value) => `${parseFloat(value).toFixed(1)}s`}
        showVerticalLines
        verticalLinesColor={theme.border}
        verticalLinesThickness={0.5}
        verticalLinesOpacity={0.3}
        curved={false}
        animateOnDataChange
        animationDuration={800}
        focusEnabled
        showDataPointOnFocus
        showStripOnFocus
        showTextOnFocus
        stripColor={theme.primary}
        stripOpacity={0.3}
        stripWidth={2}
        unFocusOnPressOut={false}
        delayBeforeUnFocus={3000}
        onFocus={(item: any, index: number) => setSelectedLap(index)}
      />

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

export const DeltaChart: React.FC<DriverChartsProps> = ({ driver, theme }) => {
  const [selectedLap, setSelectedLap] = useState<number | null>(null);

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
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const bonusCount = nonChangeoverLaps.filter(l => l.lapType === 'bonus').length;
  const brokenCount = nonChangeoverLaps.filter(l => l.lapType === 'broken').length;
  const maxAbsDelta = Math.max(...deltas.map(Math.abs));
  const yMax = Math.max(maxAbsDelta * 1.2, 1);

  // Prepare data for bar chart
  const barData = nonChangeoverLaps.map((lap, index) => {
    let frontColor = lap.delta >= 0 ? theme.warning : theme.primary;

    if (lap.lapType === 'bonus') {
      frontColor = theme.bonus;
    } else if (lap.lapType === 'broken') {
      frontColor = theme.broken;
    }

    return {
      value: lap.delta,
      label: `${lap.number}`,
      frontColor,
      topLabelComponent: () => null,
      onPress: () => setSelectedLap(index),
    };
  });

  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartHeader}>
        <Text style={[styles.chartTitle, { color: theme.text }]}>Delta from Target</Text>
        <Text style={[styles.chartSubtitle, { color: theme.textSecondary }]}>
          Avg: {avgDelta >= 0 ? '+' : ''}{avgDelta.toFixed(3)}s
        </Text>
      </View>

      {selectedLap !== null && (
        <View style={[styles.selectedLapInfo, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <Text style={[styles.selectedLapText, { color: theme.text }]}>
            Lap {nonChangeoverLaps[selectedLap].number}:
            {nonChangeoverLaps[selectedLap].delta >= 0 ? '+' : ''}
            {nonChangeoverLaps[selectedLap].delta.toFixed(3)}s
            {' '}({nonChangeoverLaps[selectedLap].lapType})
          </Text>
          <TouchableOpacity onPress={() => setSelectedLap(null)}>
            <Text style={[styles.closeButton, { color: theme.primary }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <BarChart
        data={barData}
        height={180}
        width={300}
        barWidth={barData.length > 15 ? 12 : 18}
        initialSpacing={10}
        spacing={barData.length > 10 ? 12 : 18}
        noOfSections={6}
        maxValue={yMax}
        minValue={-yMax}
        yAxisTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: theme.textSecondary, fontSize: 9 }}
        yAxisColor={theme.border}
        xAxisColor={theme.border}
        rulesColor={theme.border}
        rulesType="solid"
        yAxisThickness={1}
        xAxisThickness={1}
        formatYLabel={(value) => {
          const v = parseFloat(value);
          return v >= 0 ? `+${v.toFixed(1)}` : `${v.toFixed(1)}`;
        }}
        showVerticalLines
        verticalLinesColor={theme.border}
        verticalLinesThickness={0.5}
        verticalLinesOpacity={0.3}
        roundedTop
        roundedBottom
        animateOnDataChange
        animationDuration={800}
        // Add zero reference line
        referenceLine1Position={0}
        referenceLine1Config={{
          color: theme.textSecondary,
          thickness: 1.5,
          opacity: 0.4,
          dashWidth: 4,
          dashGap: 4,
        }}
      />

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
    paddingVertical: 8,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  chartSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  selectedLapInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  selectedLapText: {
    fontSize: 13,
    fontWeight: '500',
  },
  closeButton: {
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 8,
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
    marginTop: 8,
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
    marginTop: 12,
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
