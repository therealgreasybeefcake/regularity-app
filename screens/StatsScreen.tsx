import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, Pressable, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, shadows, brandColors } from '../constants/theme';
import { calculateDriverStats, calculateTeamStats, formatTime } from '../utils/calculations';
import { Session } from '../types';
import { LapTimesChart, DeltaChart } from '../components/DriverCharts';
import { generatePDF } from '../utils/pdfExport';

export default function StatsScreen() {
  const { teams, setTeams, activeTeam, isDarkMode, lapTypeValues } = useApp();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const team = teams[activeTeam];

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showChartsModal, setShowChartsModal] = useState(false);
  const [selectedDriverForCharts, setSelectedDriverForCharts] = useState<number | null>(null);

  // Use selected session if available, otherwise use current team data
  const displayData = selectedSession || {
    raceName: team.raceName,
    sessionNumber: team.sessionNumber,
    sessionDuration: team.sessionDuration,
    drivers: team.drivers,
  };

  const teamStats = calculateTeamStats(
    { ...team, ...displayData } as any,
    lapTypeValues
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editedTeamName, setEditedTeamName] = useState(team.name);
  const [editedRaceName, setEditedRaceName] = useState(team.raceName || '');
  const [editedSessionNumber, setEditedSessionNumber] = useState(team.sessionNumber || '');
  const [editedSessionDuration, setEditedSessionDuration] = useState(team.sessionDuration.toString());

  const handleSave = () => {
    const duration = parseInt(editedSessionDuration) || 120;
    const updatedTeams = [...teams];
    updatedTeams[activeTeam] = {
      ...team,
      name: editedTeamName,
      raceName: editedRaceName,
      sessionNumber: editedSessionNumber,
      sessionDuration: duration,
    };
    setTeams(updatedTeams);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedTeamName(team.name);
    setEditedRaceName(team.raceName || '');
    setEditedSessionNumber(team.sessionNumber || '');
    setEditedSessionDuration(team.sessionDuration.toString());
    setIsEditing(false);
  };

  const formatSessionDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleExportPDF = async (driverId?: number) => {
    try {
      setIsGeneratingPDF(true);
      const drivers = displayData.drivers || [];
      const driver = driverId !== undefined
        ? drivers.find(d => d.id === driverId)
        : undefined;

      await generatePDF({
        team,
        displayData: {
          ...displayData,
          drivers: drivers,
        },
        lapTypeValues,
        driver,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to generate PDF. Please try again.');
      console.error('PDF generation error:', error);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            {/* Session Selector */}
            {team.sessionHistory.length > 0 && (
              <View style={[styles.section, { backgroundColor: theme.card }, shadows.card]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>View Session</Text>
                <TouchableOpacity
                  style={[styles.sessionSelector, { borderColor: theme.border, backgroundColor: theme.surface }]}
                  onPress={() => setShowSessionPicker(true)}
                >
                  <View style={styles.sessionSelectorContent}>
                    <Ionicons name="calendar-outline" size={20} color={theme.primary} />
                    <Text style={[styles.sessionSelectorText, { color: theme.text }]}>
                      {selectedSession
                        ? `${selectedSession.raceName} - Session ${selectedSession.sessionNumber}`
                        : 'Current Session'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
                {selectedSession && (
                  <TouchableOpacity
                    style={styles.clearSelectionButton}
                    onPress={() => setSelectedSession(null)}
                  >
                    <Text style={[styles.clearSelectionText, { color: theme.primary }]}>
                      View Current Session
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Team Info */}
            <View style={[styles.section, { backgroundColor: theme.card }, shadows.card]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Team Information</Text>
                {!selectedSession && !isEditing ? (
                  <TouchableOpacity onPress={() => setIsEditing(true)}>
                    <Text style={[styles.editButton, { color: theme.primary }]}>Edit</Text>
                  </TouchableOpacity>
                ) : !selectedSession && isEditing ? (
                  <View style={styles.editActions}>
                    <TouchableOpacity onPress={handleCancel} style={styles.actionButton}>
                      <Text style={[styles.cancelButton, { color: theme.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSave} style={styles.actionButton}>
                      <Text style={[styles.saveButton, { color: theme.primary }]}>Save</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Team Name</Text>
                {isEditing && !selectedSession ? (
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: theme.text,
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                      }
                    ]}
                    value={editedTeamName}
                    onChangeText={setEditedTeamName}
                    placeholder="Team Name"
                    placeholderTextColor={theme.textSecondary}
                    autoCapitalize="words"
                  />
                ) : (
                  <Text style={[styles.value, { color: theme.text }]}>{team.name}</Text>
                )}
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Race Name</Text>
                {isEditing && !selectedSession ? (
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: theme.text,
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                      }
                    ]}
                    value={editedRaceName}
                    onChangeText={setEditedRaceName}
                    placeholder="Race Name"
                    placeholderTextColor={theme.textSecondary}
                    autoCapitalize="words"
                  />
                ) : (
                  <Text style={[styles.value, { color: theme.text }]}>
                    {displayData.raceName || 'Not set'}
                  </Text>
                )}
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Session</Text>
                {isEditing && !selectedSession ? (
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: theme.text,
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                      }
                    ]}
                    value={editedSessionNumber}
                    onChangeText={setEditedSessionNumber}
                    placeholder="Session Number"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="default"
                  />
                ) : (
                  <Text style={[styles.value, { color: theme.text }]}>
                    {displayData.sessionNumber || 'Not set'}
                  </Text>
                )}
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Duration</Text>
                {isEditing && !selectedSession ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TextInput
                      style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface, minWidth: 80 }]}
                      value={editedSessionDuration}
                      onChangeText={setEditedSessionDuration}
                      placeholder="120"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="number-pad"
                    />
                    <Text style={[styles.value, { color: theme.textSecondary, marginLeft: spacing.sm }]}>min</Text>
                  </View>
                ) : (
                  <Text style={[styles.value, { color: theme.text }]}>
                    {displayData.sessionDuration} min
                  </Text>
                )}
              </View>
            </View>

            {/* Team Stats */}
            <View style={[styles.section, { backgroundColor: theme.card }, shadows.card]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Team</Text>
                <View style={styles.buttonGroup}>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedDriverForCharts(null);
                      setShowChartsModal(true);
                    }}
                    style={[styles.chartButton, { backgroundColor: brandColors.chartPurple }]}
                  >
                    <Ionicons name="bar-chart-outline" size={18} color="#fff" />
                    <Text style={styles.buttonText}>Charts</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleExportPDF()}
                    disabled={isGeneratingPDF}
                    style={[styles.teamExportButton, { backgroundColor: theme.primary }]}
                  >
                    {isGeneratingPDF ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="stats-chart" size={18} color="#fff" />
                        <Text style={styles.teamExportText}>Team PDF</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.statCard, { borderBottomColor: theme.border }]}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Goal Laps</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>
                  {teamStats.goalLaps.toFixed(2)}
                </Text>
              </View>
              <View style={[styles.statCard, { borderBottomColor: theme.border }]}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Achieved Laps</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>
                  {teamStats.achievedLaps.toFixed(2)}
                </Text>
              </View>
              <View style={[styles.statCard, { borderBottomColor: theme.border }]}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Percentage Factor</Text>
                <Text style={[styles.statValue, { color: theme.primary }]}>
                  {teamStats.percentageFactor.toFixed(2)}%
                </Text>
              </View>
            </View>

            {/* Driver Stats */}
            {displayData.drivers.map((driver, index) => {
              const stats = calculateDriverStats(driver, lapTypeValues, displayData.drivers, displayData.sessionDuration);
              return (
                <View key={driver.id} style={[styles.section, { backgroundColor: theme.card }, shadows.card]}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>{driver.name}</Text>
                    <View style={styles.buttonGroup}>
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedDriverForCharts(driver.id);
                          setShowChartsModal(true);
                        }}
                        style={[styles.chartButton, { backgroundColor: brandColors.chartPurple }]}
                      >
                        <Ionicons name="bar-chart-outline" size={18} color="#fff" />
                        <Text style={styles.buttonText}>Charts</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleExportPDF(driver.id)}
                        disabled={isGeneratingPDF}
                        style={[styles.driverExportButton, { backgroundColor: theme.primary }]}
                      >
                        <Ionicons name="share-outline" size={18} color="#fff" />
                        <Text style={styles.driverExportText}>PDF</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.statsGrid}>
                    <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Achieved Laps</Text>
                      <Text style={[styles.gridValue, { color: theme.text }]}>
                        {stats.achievedLaps.toFixed(1)}
                      </Text>
                    </View>

                    <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Goal Laps</Text>
                      <Text style={[styles.gridValue, { color: theme.text }]}>
                        {stats.goalLaps.toFixed(1)}
                      </Text>
                    </View>

                    <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Net Score</Text>
                      <Text style={[styles.gridValue, { color: theme.text }]}>
                        {stats.netScore > 0 ? '+' : ''}{stats.netScore}
                      </Text>
                    </View>

                    <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Base Laps</Text>
                      <Text style={[styles.gridValue, { color: theme.text }]}>
                        {stats.baseLaps}
                      </Text>
                    </View>

                    <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gridLabel, { color: theme.bonus }]}>Bonus Laps</Text>
                      <Text style={[styles.gridValue, { color: theme.bonus }]}>
                        {stats.bonusLaps}
                      </Text>
                    </View>

                    <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gridLabel, { color: theme.broken }]}>Broken Laps</Text>
                      <Text style={[styles.gridValue, { color: theme.broken }]}>
                        {stats.brokenLaps}
                      </Text>
                    </View>

                    <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Changeover</Text>
                      <Text style={[styles.gridValue, { color: theme.changeover }]}>
                        {stats.changeoverLaps}
                      </Text>
                    </View>

                    <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Safety Car</Text>
                      <Text style={[styles.gridValue, { color: theme.safety }]}>
                        {stats.safetyLaps}
                      </Text>
                    </View>

                    <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Avg Delta</Text>
                      <Text style={[styles.gridValue, { color: theme.text }]}>
                        {stats.averageDelta >= 0 ? '+' : ''}{stats.averageDelta.toFixed(3)}s
                      </Text>
                    </View>

                    <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>3-Lap Avg</Text>
                      <Text style={[styles.gridValue, { color: theme.text }]}>
                        {stats.threelapAvg !== null
                          ? `${stats.threelapAvg >= 0 ? '+' : ''}${stats.threelapAvg.toFixed(3)}s`
                          : 'N/A'}
                      </Text>
                    </View>

                    <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Avg Lap Time</Text>
                      <Text style={[styles.gridValue, { color: theme.text }]}>
                        {formatTime(stats.averageLapTime)}
                      </Text>
                    </View>

                    <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Penalty Laps</Text>
                      <Text style={[styles.gridValue, { color: theme.text }]}>
                        {driver.penaltyLaps}
                      </Text>
                    </View>
                  </View>

                  {/* Charts - Temporarily disabled due to Victory Native compatibility */}
                  {/* <LapTimesChart driver={driver} lapTypeValues={lapTypeValues} theme={theme} />
              <DeltaChart driver={driver} lapTypeValues={lapTypeValues} theme={theme} /> */}
                </View>
              );
            })}
          </View>

          {/* Charts Modal */}
          <Modal
            visible={showChartsModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowChartsModal(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setShowChartsModal(false)}
            >
              <Pressable
                style={[styles.chartsModalContent, { backgroundColor: theme.card }, shadows.modal]}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.chartsModalHeader}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    {selectedDriverForCharts === null
                      ? 'Team Performance Charts'
                      : displayData.drivers.find(d => d.id === selectedDriverForCharts)?.name || 'Driver Charts'}
                  </Text>
                  <TouchableOpacity onPress={() => setShowChartsModal(false)}>
                    <Ionicons name="close" size={24} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.chartsScrollView}>
                  {selectedDriverForCharts === null ? (
                    // Show charts for all drivers
                    displayData.drivers.map((driver) => (
                      <View key={driver.id} style={styles.driverChartSection}>
                        <Text style={[styles.driverChartTitle, { color: theme.text }]}>{driver.name}</Text>
                        <LapTimesChart driver={driver} theme={theme} />
                        <DeltaChart driver={driver} theme={theme} />
                      </View>
                    ))
                  ) : (
                    // Show charts for selected driver
                    (() => {
                      const driver = displayData.drivers.find(d => d.id === selectedDriverForCharts);
                      return driver ? (
                        <View>
                          <LapTimesChart driver={driver} theme={theme} />
                          <DeltaChart driver={driver} theme={theme} />
                        </View>
                      ) : null;
                    })()
                  )}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          {/* Session Picker Modal */}
          <Modal
            visible={showSessionPicker}
            transparent
            animationType="fade"
            onRequestClose={() => setShowSessionPicker(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setShowSessionPicker(false)}
            >
              <Pressable
                style={[styles.modalContent, { backgroundColor: theme.card }, shadows.modal]}
                onPress={(e) => e.stopPropagation()}
              >
                <Text style={[styles.modalTitle, { color: theme.text }]}>Select Session</Text>
                <ScrollView style={styles.sessionList}>
                  <TouchableOpacity
                    style={[
                      styles.sessionItem,
                      { borderBottomColor: theme.border },
                      !selectedSession && { backgroundColor: theme.surface },
                    ]}
                    onPress={() => {
                      setSelectedSession(null);
                      setShowSessionPicker(false);
                    }}
                  >
                    <View>
                      <Text style={[styles.sessionItemTitle, { color: theme.text }]}>Current Session</Text>
                      <Text style={[styles.sessionItemSubtitle, { color: theme.textSecondary }]}>
                        {team.raceName || 'Untitled'} - Session {team.sessionNumber || 'N/A'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {team.sessionHistory
                    .slice()
                    .reverse()
                    .map((session) => (
                      <TouchableOpacity
                        key={session.id}
                        style={[
                          styles.sessionItem,
                          { borderBottomColor: theme.border },
                          selectedSession?.id === session.id && { backgroundColor: theme.surface },
                        ]}
                        onPress={() => {
                          setSelectedSession(session);
                          setShowSessionPicker(false);
                        }}
                      >
                        <View>
                          <Text style={[styles.sessionItemTitle, { color: theme.text }]}>
                            {session.raceName} - Session {session.sessionNumber}
                          </Text>
                          <Text style={[styles.sessionItemSubtitle, { color: theme.textSecondary }]}>
                            {formatSessionDate(session.timestamp)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 90,
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    gap: spacing.xs + 2,
  },
  buttonText: {
    color: '#fff',
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  teamExportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    gap: spacing.xs + 2,
  },
  teamExportText: {
    color: '#fff',
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  driverExportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  driverExportText: {
    color: '#fff',
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  section: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.heading,
    fontWeight: fontWeights.semibold,
  },
  editButton: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  actionButton: {
    paddingHorizontal: spacing.xs,
  },
  cancelButton: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
  },
  saveButton: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  label: {
    fontSize: typography.body,
  },
  value: {
    fontSize: typography.body,
    fontWeight: fontWeights.medium,
  },
  input: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.medium,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minWidth: 160,
  },
  statCard: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  statLabel: {
    fontSize: typography.body,
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: 28,
    fontWeight: fontWeights.semibold,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gridItem: {
    width: '47%',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  gridLabel: {
    fontSize: typography.caption,
    marginBottom: spacing.xs,
  },
  gridValue: {
    fontSize: 28,
    fontWeight: fontWeights.semibold,
  },
  sessionSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  sessionSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sessionSelectorText: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.medium,
  },
  clearSelectionButton: {
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  clearSelectionText: {
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    maxHeight: '70%',
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  chartsModalContent: {
    width: '95%',
    maxHeight: '85%',
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  chartsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  chartsScrollView: {
    maxHeight: '100%',
  },
  driverChartSection: {
    marginBottom: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.1)',
  },
  driverChartTitle: {
    fontSize: typography.title,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: typography.heading,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  sessionList: {
    maxHeight: 400,
  },
  sessionItem: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderRadius: radius.sm,
  },
  sessionItemTitle: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.xs,
  },
  sessionItemSubtitle: {
    fontSize: typography.body,
  },
});
