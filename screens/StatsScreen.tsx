import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme } from '../constants/theme';
import { calculateDriverStats, calculateTeamStats, formatTime } from '../utils/calculations';

export default function StatsScreen() {
  const { teams, activeTeam, isDarkMode, lapTypeValues } = useApp();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const team = teams[activeTeam];
  const teamStats = calculateTeamStats(team, lapTypeValues);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        {/* Team Info */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Team Information</Text>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Team Name</Text>
            <Text style={[styles.value, { color: theme.text }]}>{team.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Race Name</Text>
            <Text style={[styles.value, { color: theme.text }]}>
              {team.raceName || 'Not set'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Session</Text>
            <Text style={[styles.value, { color: theme.text }]}>
              {team.sessionNumber || 'Not set'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Duration</Text>
            <Text style={[styles.value, { color: theme.text }]}>
              {team.sessionDuration} min
            </Text>
          </View>
        </View>

        {/* Team Stats */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Team Statistics</Text>
          <View style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Goal Laps</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {teamStats.goalLaps.toFixed(2)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Achieved Laps</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {teamStats.achievedLaps.toFixed(2)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Percentage Factor</Text>
            <Text style={[styles.statValue, { color: theme.primary }]}>
              {teamStats.percentageFactor.toFixed(2)}%
            </Text>
          </View>
        </View>

        {/* Driver Stats */}
        {team.drivers.map((driver, index) => {
          const stats = calculateDriverStats(driver, lapTypeValues, team.drivers, team.sessionDuration);
          return (
            <View key={driver.id} style={[styles.section, { backgroundColor: theme.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{driver.name}</Text>

              <View style={styles.statsGrid}>
                <View style={styles.gridItem}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Achieved Laps</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {stats.achievedLaps.toFixed(1)}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Goal Laps</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {stats.goalLaps.toFixed(1)}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Net Score</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {stats.netScore > 0 ? '+' : ''}{stats.netScore}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Base Laps</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {stats.baseLaps}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.statLabel, { color: theme.bonus }]}>Bonus Laps</Text>
                  <Text style={[styles.statValue, { color: theme.bonus }]}>
                    {stats.bonusLaps}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.statLabel, { color: theme.broken }]}>Broken Laps</Text>
                  <Text style={[styles.statValue, { color: theme.broken }]}>
                    {stats.brokenLaps}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Changeover</Text>
                  <Text style={[styles.statValue, { color: theme.changeover }]}>
                    {stats.changeoverLaps}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Safety Car</Text>
                  <Text style={[styles.statValue, { color: theme.safety }]}>
                    {stats.safetyLaps}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Avg Delta</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {stats.averageDelta >= 0 ? '+' : ''}{stats.averageDelta.toFixed(3)}s
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>3-Lap Avg</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {stats.threelapAvg !== null
                      ? `${stats.threelapAvg >= 0 ? '+' : ''}${stats.threelapAvg.toFixed(3)}s`
                      : 'N/A'}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Avg Lap Time</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {formatTime(stats.averageLapTime)}
                  </Text>
                </View>

                <View style={styles.gridItem}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Penalty Laps</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {driver.penaltyLaps}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
  },
  statCard: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  statLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridItem: {
    width: '48%',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
});
