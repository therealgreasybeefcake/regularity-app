import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, shadows, brandColors } from '../constants/theme';
import { calculateDriverStats, calculateTeamStats, formatTime } from '../utils/calculations';
import { Session } from '../types';
import { LapTimesChart, DeltaChart } from '../components/DriverCharts';
import { generatePDF } from '../utils/pdfExport';
import { useAlert } from '../components/CustomAlert';

const isWeb = Platform.OS === 'web';
const SIDEBAR_WIDTH = 340;

export default function StatsScreen() {
  const { teams, setTeams, activeTeam, isDarkMode, lapTypeValues, loadSessionsFromS3 } = useApp();
  const { showAlert } = useAlert();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const team = teams[activeTeam];
  const { width: windowWidth } = useWindowDimensions();

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [s3Sessions, setS3Sessions] = useState<Session[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showChartsModal, setShowChartsModal] = useState(false);
  const [selectedDriverForCharts, setSelectedDriverForCharts] = useState<number | null>(null);
  const [webSelectedDriver, setWebSelectedDriver] = useState<number | null>(null);

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
      showAlert({ title: 'Error', message: 'Failed to generate PDF. Please try again.' });
      console.error('PDF generation error:', error);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Merge local sessionHistory with S3 sessions, deduplicating by id
  const allSessions = React.useMemo(() => {
    const map = new Map<string, Session>();
    for (const s of team.sessionHistory) map.set(s.id, s);
    for (const s of s3Sessions) map.set(s.id, s);
    return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [team.sessionHistory, s3Sessions]);

  const handleOpenSessionPicker = async () => {
    setShowSessionPicker(true);
    if (s3Sessions.length === 0 && !isLoadingSessions) {
      setIsLoadingSessions(true);
      try {
        const sessions = await loadSessionsFromS3();
        setS3Sessions(sessions);
      } catch (err) {
        console.warn('Failed to load S3 sessions:', err);
      } finally {
        setIsLoadingSessions(false);
      }
    }
  };

  // --- Shared sub-components ---

  const SessionSelector = () => {
    if (team.sessionHistory.length === 0 && s3Sessions.length === 0) return null;
    return (
      <View style={[styles.section, { backgroundColor: theme.card }, shadows.card]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>View Session</Text>
        <TouchableOpacity
          style={[styles.sessionSelector, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={handleOpenSessionPicker}
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
    );
  };

  const TeamInfoSection = () => (
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
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
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
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            value={editedRaceName}
            onChangeText={setEditedRaceName}
            placeholder="Race Name"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="words"
          />
        ) : (
          <Text style={[styles.value, { color: theme.text }]}>{displayData.raceName || 'Not set'}</Text>
        )}
      </View>
      <View style={styles.infoRow}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Session</Text>
        {isEditing && !selectedSession ? (
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
            value={editedSessionNumber}
            onChangeText={setEditedSessionNumber}
            placeholder="Session Number"
            placeholderTextColor={theme.textSecondary}
            keyboardType="default"
          />
        ) : (
          <Text style={[styles.value, { color: theme.text }]}>{displayData.sessionNumber || 'Not set'}</Text>
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
          <Text style={[styles.value, { color: theme.text }]}>{displayData.sessionDuration} min</Text>
        )}
      </View>
    </View>
  );

  const TeamStatsSection = () => (
    <View style={[styles.section, { backgroundColor: theme.card }, shadows.card]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Team</Text>
        <View style={styles.buttonGroup}>
          {!isWeb && (
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
          )}
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
      <View style={isWeb ? webStyles.teamStatsRow : undefined}>
        <View style={[styles.statCard, { borderBottomColor: theme.border }, isWeb && webStyles.teamStatItem]}>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Goal Laps</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {teamStats.goalLaps.toFixed(2)}
          </Text>
        </View>
        <View style={[styles.statCard, { borderBottomColor: theme.border }, isWeb && webStyles.teamStatItem]}>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Achieved Laps</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {teamStats.achievedLaps.toFixed(2)}
          </Text>
        </View>
        <View style={[styles.statCard, { borderBottomColor: theme.border }, isWeb && webStyles.teamStatItem]}>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Percentage Factor</Text>
          <Text style={[styles.statValue, { color: theme.primary }]}>
            {teamStats.percentageFactor.toFixed(2)}%
          </Text>
        </View>
      </View>
    </View>
  );

  const DriverStatsGrid = ({ driverIndex }: { driverIndex: number }) => {
    const driver = displayData.drivers[driverIndex];
    const stats = calculateDriverStats(driver, lapTypeValues, displayData.drivers, displayData.sessionDuration);
    return (
      <View style={[styles.section, { backgroundColor: theme.card }, shadows.card]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{driver.name}</Text>
          <View style={styles.buttonGroup}>
            {!isWeb && (
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
            )}
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
            <Text style={[styles.gridValue, { color: theme.text }]}>{stats.achievedLaps.toFixed(1)}</Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Goal Laps</Text>
            <Text style={[styles.gridValue, { color: theme.text }]}>{stats.goalLaps.toFixed(1)}</Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Net Score</Text>
            <Text style={[styles.gridValue, { color: theme.text }]}>{stats.netScore > 0 ? '+' : ''}{stats.netScore}</Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Base Laps</Text>
            <Text style={[styles.gridValue, { color: theme.text }]}>{stats.baseLaps}</Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
            <Text style={[styles.gridLabel, { color: theme.bonus }]}>Bonus Laps</Text>
            <Text style={[styles.gridValue, { color: theme.bonus }]}>{stats.bonusLaps}</Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
            <Text style={[styles.gridLabel, { color: theme.broken }]}>Broken Laps</Text>
            <Text style={[styles.gridValue, { color: theme.broken }]}>{stats.brokenLaps}</Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Changeover</Text>
            <Text style={[styles.gridValue, { color: theme.changeover }]}>{stats.changeoverLaps}</Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Safety Car</Text>
            <Text style={[styles.gridValue, { color: theme.safety }]}>{stats.safetyLaps}</Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Avg Delta</Text>
            <Text style={[styles.gridValue, { color: theme.text }]}>{stats.averageDelta >= 0 ? '+' : ''}{stats.averageDelta.toFixed(3)}s</Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>3-Lap Avg</Text>
            <Text style={[styles.gridValue, { color: theme.text }]}>
              {stats.threelapAvg !== null ? `${stats.threelapAvg >= 0 ? '+' : ''}${stats.threelapAvg.toFixed(3)}s` : 'N/A'}
            </Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Avg Lap Time</Text>
            <Text style={[styles.gridValue, { color: theme.text }]}>{formatTime(stats.averageLapTime)}</Text>
          </View>
          <View style={[styles.gridItem, { backgroundColor: theme.surface }]}>
            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>Penalty Laps</Text>
            <Text style={[styles.gridValue, { color: theme.text }]}>{driver.penaltyLaps}</Text>
          </View>
        </View>
      </View>
    );
  };

  // --- WEB LAYOUT ---
  if (isWeb) {
    // Calculate chart width: main area minus sidebar, padding, and chart container padding
    // Navigator sidebar is 200px, stats sidebar is SIDEBAR_WIDTH
    const chartAreaWidth = Math.max(windowWidth - 200 - SIDEBAR_WIDTH - 80, 300);

    // Determine which drivers to show charts for
    const chartsDrivers = webSelectedDriver !== null
      ? displayData.drivers.filter(d => d.id === webSelectedDriver)
      : displayData.drivers;

    return (
      <View style={[webStyles.splitRoot, { backgroundColor: theme.background }]}>
        {/* Left panel - scrollable sidebar */}
        <ScrollView
          style={[webStyles.leftPanel, { borderRightColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)' }]}
          contentContainerStyle={webStyles.leftPanelContent}
        >
          <SessionSelector />
          <TeamInfoSection />
          <TeamStatsSection />

          {/* Driver selector list */}
          <View style={[styles.section, { backgroundColor: theme.card }, shadows.card]}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: spacing.md }]}>Drivers</Text>

            <TouchableOpacity
              style={[
                webStyles.driverTab,
                { borderColor: theme.border },
                webSelectedDriver === null && { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.12)' : 'rgba(30,64,175,0.08)', borderColor: theme.primary },
              ]}
              onPress={() => setWebSelectedDriver(null)}
            >
              <Ionicons name="people" size={18} color={webSelectedDriver === null ? (theme.primary as string) : (theme.textSecondary as string)} />
              <Text style={[webStyles.driverTabText, { color: webSelectedDriver === null ? theme.primary : theme.text }]}>
                All Drivers
              </Text>
            </TouchableOpacity>

            {displayData.drivers.map((driver) => (
              <TouchableOpacity
                key={driver.id}
                style={[
                  webStyles.driverTab,
                  { borderColor: theme.border },
                  webSelectedDriver === driver.id && { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.12)' : 'rgba(30,64,175,0.08)', borderColor: theme.primary },
                ]}
                onPress={() => setWebSelectedDriver(driver.id)}
              >
                <Ionicons name="person" size={18} color={webSelectedDriver === driver.id ? (theme.primary as string) : (theme.textSecondary as string)} />
                <Text style={[webStyles.driverTabText, { color: webSelectedDriver === driver.id ? theme.primary : theme.text }]}>
                  {driver.name}
                </Text>
                <Text style={[webStyles.driverLapCount, { color: theme.textSecondary }]}>
                  {driver.laps.length} laps
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Right panel - charts area */}
        <ScrollView
          style={webStyles.rightPanel}
          contentContainerStyle={webStyles.rightPanelContent}
        >
          {chartsDrivers.map((driver) => {
            const stats = calculateDriverStats(driver, lapTypeValues, displayData.drivers, displayData.sessionDuration);
            return (
              <View key={driver.id} style={[webStyles.chartSection, { backgroundColor: theme.card, borderColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                <View style={webStyles.chartSectionHeader}>
                  <View>
                    <Text style={[webStyles.chartDriverName, { color: theme.text }]}>{driver.name}</Text>
                    <Text style={[webStyles.chartDriverMeta, { color: theme.textSecondary }]}>
                      {stats.achievedLaps.toFixed(1)} achieved / {stats.goalLaps.toFixed(1)} goal  |  Net: {stats.netScore > 0 ? '+' : ''}{stats.netScore}  |  Avg Delta: {stats.averageDelta >= 0 ? '+' : ''}{stats.averageDelta.toFixed(3)}s
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleExportPDF(driver.id)}
                    disabled={isGeneratingPDF}
                    style={[styles.driverExportButton, { backgroundColor: theme.primary }]}
                  >
                    <Ionicons name="share-outline" size={16} color="#fff" />
                    <Text style={styles.driverExportText}>PDF</Text>
                  </TouchableOpacity>
                </View>

                <LapTimesChart driver={driver} theme={theme} chartWidth={chartAreaWidth} />
                <DeltaChart driver={driver} theme={theme} chartWidth={chartAreaWidth} />
              </View>
            );
          })}

          {chartsDrivers.length === 0 && (
            <View style={webStyles.emptyCharts}>
              <Ionicons name="bar-chart-outline" size={48} color={theme.textSecondary} />
              <Text style={[webStyles.emptyChartsText, { color: theme.textSecondary }]}>No drivers to display</Text>
            </View>
          )}
        </ScrollView>

        {/* Session Picker Modal (shared) */}
        <Modal
          visible={showSessionPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSessionPicker(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowSessionPicker(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: theme.card }, shadows.modal]} onPress={(e) => e.stopPropagation()}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Select Session</Text>
              <ScrollView style={styles.sessionList}>
                <TouchableOpacity
                  style={[styles.sessionItem, { borderBottomColor: theme.border }, !selectedSession && { backgroundColor: theme.surface }]}
                  onPress={() => { setSelectedSession(null); setShowSessionPicker(false); }}
                >
                  <View>
                    <Text style={[styles.sessionItemTitle, { color: theme.text }]}>Current Session</Text>
                    <Text style={[styles.sessionItemSubtitle, { color: theme.textSecondary }]}>
                      {team.raceName || 'Untitled'} - Session {team.sessionNumber || 'N/A'}
                    </Text>
                  </View>
                </TouchableOpacity>
                {isLoadingSessions && (
                  <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                    <ActivityIndicator size="small" />
                  </View>
                )}
                {allSessions.map((session) => (
                  <TouchableOpacity
                    key={session.id}
                    style={[styles.sessionItem, { borderBottomColor: theme.border }, selectedSession?.id === session.id && { backgroundColor: theme.surface }]}
                    onPress={() => { setSelectedSession(session); setShowSessionPicker(false); }}
                  >
                    <View>
                      <Text style={[styles.sessionItemTitle, { color: theme.text }]}>{session.raceName} - Session {session.sessionNumber}</Text>
                      <Text style={[styles.sessionItemSubtitle, { color: theme.textSecondary }]}>{formatSessionDate(session.timestamp)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // --- NATIVE LAYOUT (unchanged) ---
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <SessionSelector />
            <TeamInfoSection />
            <TeamStatsSection />

            {/* Driver Stats */}
            {displayData.drivers.map((driver, index) => (
              <DriverStatsGrid key={driver.id} driverIndex={index} />
            ))}
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
                    displayData.drivers.map((driver) => (
                      <View key={driver.id} style={styles.driverChartSection}>
                        <Text style={[styles.driverChartTitle, { color: theme.text }]}>{driver.name}</Text>
                        <LapTimesChart driver={driver} theme={theme} />
                        <DeltaChart driver={driver} theme={theme} />
                      </View>
                    ))
                  ) : (
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
            <Pressable style={styles.modalOverlay} onPress={() => setShowSessionPicker(false)}>
              <Pressable style={[styles.modalContent, { backgroundColor: theme.card }, shadows.modal]} onPress={(e) => e.stopPropagation()}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Select Session</Text>
                <ScrollView style={styles.sessionList}>
                  <TouchableOpacity
                    style={[styles.sessionItem, { borderBottomColor: theme.border }, !selectedSession && { backgroundColor: theme.surface }]}
                    onPress={() => { setSelectedSession(null); setShowSessionPicker(false); }}
                  >
                    <View>
                      <Text style={[styles.sessionItemTitle, { color: theme.text }]}>Current Session</Text>
                      <Text style={[styles.sessionItemSubtitle, { color: theme.textSecondary }]}>
                        {team.raceName || 'Untitled'} - Session {team.sessionNumber || 'N/A'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {isLoadingSessions && (
                  <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                    <ActivityIndicator size="small" />
                  </View>
                )}
                {allSessions.map((session) => (
                    <TouchableOpacity
                      key={session.id}
                      style={[styles.sessionItem, { borderBottomColor: theme.border }, selectedSession?.id === session.id && { backgroundColor: theme.surface }]}
                      onPress={() => { setSelectedSession(session); setShowSessionPicker(false); }}
                    >
                      <View>
                        <Text style={[styles.sessionItemTitle, { color: theme.text }]}>{session.raceName} - Session {session.sessionNumber}</Text>
                        <Text style={[styles.sessionItemSubtitle, { color: theme.textSecondary }]}>{formatSessionDate(session.timestamp)}</Text>
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

// --- Web-specific styles ---
const webStyles = StyleSheet.create({
  splitRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPanel: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
  },
  leftPanelContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  rightPanel: {
    flex: 1,
  },
  rightPanelContent: {
    padding: spacing.xl,
    paddingBottom: 40,
  },
  teamStatsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  teamStatItem: {
    flex: 1,
    borderBottomWidth: 0,
  },
  driverTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  driverTabText: {
    fontSize: typography.body,
    fontWeight: fontWeights.medium,
    flex: 1,
  },
  driverLapCount: {
    fontSize: typography.caption,
  },
  chartSection: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.xl,
    marginBottom: spacing.xl,
  },
  chartSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  chartDriverName: {
    fontSize: 20,
    fontWeight: fontWeights.semibold,
    marginBottom: 4,
  },
  chartDriverMeta: {
    fontSize: typography.body,
  },
  emptyCharts: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 120,
    gap: spacing.md,
  },
  emptyChartsText: {
    fontSize: typography.bodyLg,
  },
});

// --- Shared styles ---
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
    maxWidth: 500,
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
