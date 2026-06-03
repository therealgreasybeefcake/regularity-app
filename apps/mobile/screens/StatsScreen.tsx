import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights } from '../constants/theme';
import { calculateDriverStats, calculateTeamStats, formatTime } from '../utils/calculations';
import { Session } from '../types';
import { LapTimesChart, DeltaChart } from '../components/DriverCharts';
import { generatePDF } from '../utils/pdfExport';
import { useAlert } from '../components/CustomAlert';
import { Mono, Label, Card, Surface, Divider, Button, IconButton, StatTile, TextField, Sheet } from '../components/ui';

const isWeb = Platform.OS === 'web';

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
  // Measured width of the driver-grid container (exact — avoids scrollbar/rounding
  // estimation errors that caused 2-up cards to wrap to a single column).
  const [gridW, setGridW] = useState(0);

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

  // --- Pit Wall presentation helpers ---
  const deltaColor = (delta: number) =>
    (delta < 0 ? theme.broken : delta <= 0.99 ? theme.bonus : theme.base);

  const lapTypeColor = (t: string) =>
    t === 'bonus' ? theme.bonus
      : t === 'broken' ? theme.broken
        : t === 'changeover' ? theme.changeover
          : t === 'safety' ? theme.safety
            : theme.base;

  // Responsive web layout: use the full content container and tile the driver
  // detail cards into columns to cut vertical scroll. Native stays single-column.
  // twoColTop is a coarse boolean (window estimate is fine); the exact card width
  // comes from the measured grid container (gridW) so 2-up never wraps.
  const usableWidth = (isWeb ? Math.min(windowWidth - 200, 1280) : windowWidth) - spacing.lg * 2;
  // Top row = Team Info · Team Stats · Driver Selector, 3-up on wide web.
  const threeColTop = isWeb && usableWidth >= 900;
  const detailGap = spacing.lg;
  const detailCols = isWeb && gridW >= 900 ? 2 : 1;
  const detailColWidth = detailCols > 1 ? (gridW - detailGap * (detailCols - 1)) / detailCols : gridW;
  // gifted-charts needs an explicit width; fit it inside a detail card (lg padding).
  const chartAreaWidth = Math.max(detailColWidth - spacing.lg * 2 - spacing.xs, 260);

  // --- Shared sub-components ---

  const SessionSelector = () => {
    if (team.sessionHistory.length === 0 && s3Sessions.length === 0) return null;
    return (
      <Card padding="lg" style={styles.panel}>
        <Label size={13} style={styles.panelTitle}>View Session</Label>
        <TouchableOpacity
          style={[styles.sessionSelector, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={handleOpenSessionPicker}
        >
          <View style={styles.sessionSelectorContent}>
            <Ionicons name="calendar-outline" size={20} color={theme.primary as string} />
            <Text style={[styles.sessionSelectorText, { color: theme.text }]}>
              {selectedSession
                ? `${selectedSession.raceName} - Session ${selectedSession.sessionNumber}`
                : 'Current Session'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={20} color={theme.textSecondary as string} />
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
      </Card>
    );
  };

  const TeamInfoSection = (cardStyle?: any) => {
    const editable = isEditing && !selectedSession;
    return (
      <Card padding="lg" style={[styles.panel, cardStyle]}>
        <View style={styles.panelHeader}>
          <Label size={13}>Team Information</Label>
          {!selectedSession && !isEditing ? (
            <Button title="Edit" icon="create-outline" size="sm" variant="ghost" onPress={() => setIsEditing(true)} />
          ) : !selectedSession && isEditing ? (
            <View style={styles.editActions}>
              <Button title="Cancel" size="sm" variant="secondary" onPress={handleCancel} />
              <Button title="Save" icon="checkmark" size="sm" variant="primary" onPress={handleSave} />
            </View>
          ) : null}
        </View>

        {editable ? (
          <View style={styles.editFields}>
            <TextField label="Team Name" value={editedTeamName} onChangeText={setEditedTeamName} placeholder="Team Name" autoCapitalize="words" />
            <TextField label="Race Name" value={editedRaceName} onChangeText={setEditedRaceName} placeholder="Race Name" autoCapitalize="words" />
            <TextField label="Session" value={editedSessionNumber} onChangeText={setEditedSessionNumber} placeholder="Session Number" />
            <TextField mono label="Duration (minutes)" value={editedSessionDuration} onChangeText={setEditedSessionDuration} placeholder="120" keyboardType="number-pad" />
          </View>
        ) : (
          <View>
            <View style={styles.infoRow}>
              <Label>Team Name</Label>
              <Text style={[styles.infoValue, { color: theme.text }]}>{team.name}</Text>
            </View>
            <Divider faint />
            <View style={styles.infoRow}>
              <Label>Race Name</Label>
              <Text style={[styles.infoValue, { color: theme.text }]}>{displayData.raceName || 'Not set'}</Text>
            </View>
            <Divider faint />
            <View style={styles.infoRow}>
              <Label>Session</Label>
              {displayData.sessionNumber
                ? <Mono size={typography.bodyLg} weight="bold" color={theme.text}>{String(displayData.sessionNumber)}</Mono>
                : <Text style={[styles.infoValue, { color: theme.textMuted }]}>Not set</Text>}
            </View>
            <Divider faint />
            <View style={styles.infoRow}>
              <Label>Duration</Label>
              <View style={styles.infoValueRow}>
                <Mono size={typography.bodyLg} weight="bold" color={theme.text}>{String(displayData.sessionDuration)}</Mono>
                <Label muted style={{ marginLeft: 4 }}>min</Label>
              </View>
            </View>
          </View>
        )}
      </Card>
    );
  };

  const TeamStatsSection = (stacked: boolean, cardStyle?: any) => (
    <Card padding="lg" style={[styles.panel, cardStyle]}>
      <View style={styles.panelHeader}>
        <Label size={13}>Team</Label>
        <View style={styles.buttonGroup}>
          {!isWeb && (
            <Button
              title="Charts"
              icon="bar-chart-outline"
              size="sm"
              variant="secondary"
              onPress={() => {
                setSelectedDriverForCharts(null);
                setShowChartsModal(true);
              }}
            />
          )}
          <Button
            title="Team PDF"
            icon="stats-chart"
            size="sm"
            variant="primary"
            loading={isGeneratingPDF}
            disabled={isGeneratingPDF}
            onPress={() => handleExportPDF()}
          />
        </View>
      </View>
      <View style={[styles.teamStatsRow, stacked && styles.teamStatsCol]}>
        <StatTile size="lg" label="Goal Laps" value={teamStats.goalLaps.toFixed(2)} style={stacked ? undefined : styles.teamStatItem} />
        <StatTile size="lg" label="Achieved Laps" value={teamStats.achievedLaps.toFixed(2)} style={stacked ? undefined : styles.teamStatItem} />
        <StatTile size="lg" label="Percentage Factor" value={`${teamStats.percentageFactor.toFixed(2)}%`} valueColor={theme.accent} style={stacked ? undefined : styles.teamStatItem} />
      </View>
    </Card>
  );

  const DriverSelector = (cardStyle?: any) => {
    if (displayData.drivers.length === 0) return null;
    const rows: Array<{ id: number | null; name: string; laps: number }> = [
      { id: null, name: 'All Drivers', laps: displayData.drivers.reduce((sum, d) => sum + d.laps.length, 0) },
      ...displayData.drivers.map(d => ({ id: d.id, name: d.name, laps: d.laps.length })),
    ];
    return (
      <Card padding="lg" style={[styles.panel, cardStyle]}>
        <Label size={13} style={styles.panelTitle}>Drivers</Label>
        <Surface level="base" padding={0} style={styles.driverList}>
          {rows.map((row, index) => {
            const selected = webSelectedDriver === row.id;
            return (
              <Pressable
                key={row.id === null ? 'all' : row.id}
                onPress={() => setWebSelectedDriver(row.id)}
                style={[
                  styles.driverRow,
                  { borderBottomColor: theme.borderFaint },
                  index === rows.length - 1 && { borderBottomWidth: 0 },
                  selected && { backgroundColor: theme.primaryMuted },
                ]}
              >
                <Ionicons
                  name={row.id === null ? 'people' : 'person'}
                  size={18}
                  color={selected ? (theme.primary as string) : (theme.textSecondary as string)}
                />
                <Text style={[styles.driverRowName, { color: selected ? theme.primary : theme.text }]} numberOfLines={1}>
                  {row.name}
                </Text>
                <Mono size={12} weight="medium" color={selected ? theme.primary : theme.textSecondary}>
                  {row.laps} laps
                </Mono>
              </Pressable>
            );
          })}
        </Surface>
      </Card>
    );
  };

  const DriverDetail = ({ driverIndex }: { driverIndex: number }) => {
    const driver = displayData.drivers[driverIndex];
    const stats = calculateDriverStats(driver, lapTypeValues, displayData.drivers, displayData.sessionDuration);
    const grid: Array<{ label: string; value: string; color?: typeof theme.text }> = [
      { label: 'Achieved Laps', value: stats.achievedLaps.toFixed(1) },
      { label: 'Goal Laps', value: stats.goalLaps.toFixed(1) },
      { label: 'Net Score', value: `${stats.netScore > 0 ? '+' : ''}${stats.netScore}` },
      { label: 'Base Laps', value: String(stats.baseLaps), color: theme.base },
      { label: 'Bonus Laps', value: String(stats.bonusLaps), color: theme.bonus },
      { label: 'Broken Laps', value: String(stats.brokenLaps), color: theme.broken },
      { label: 'Changeover', value: String(stats.changeoverLaps), color: theme.changeover },
      { label: 'Safety Car', value: String(stats.safetyLaps), color: theme.safety },
      { label: 'Avg Delta', value: `${stats.averageDelta >= 0 ? '+' : ''}${stats.averageDelta.toFixed(3)}s`, color: deltaColor(stats.averageDelta) },
      { label: '3-Lap Avg', value: stats.threelapAvg !== null ? `${stats.threelapAvg >= 0 ? '+' : ''}${stats.threelapAvg.toFixed(3)}s` : 'N/A', color: stats.threelapAvg !== null ? deltaColor(stats.threelapAvg) : undefined },
      { label: 'Avg Lap Time', value: formatTime(stats.averageLapTime) },
      { label: 'Penalty Laps', value: String(driver.penaltyLaps) },
    ];
    return (
      <Card padding="lg" style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={[styles.driverName, { color: theme.text }]} numberOfLines={1}>{driver.name}</Text>
          <View style={styles.buttonGroup}>
            {!isWeb && (
              <Button
                title="Charts"
                icon="bar-chart-outline"
                size="sm"
                variant="secondary"
                onPress={() => {
                  setSelectedDriverForCharts(driver.id);
                  setShowChartsModal(true);
                }}
              />
            )}
            <Button
              title="PDF"
              icon="document-text-outline"
              size="sm"
              variant="primary"
              disabled={isGeneratingPDF}
              onPress={() => handleExportPDF(driver.id)}
            />
          </View>
        </View>

        <View style={styles.statsGrid}>
          {grid.map((item) => (
            <View key={item.label} style={styles.gridItem}>
              <StatTile size="md" label={item.label} value={item.value} valueColor={item.color} />
            </View>
          ))}
        </View>

        {/* Charts inline (web shows them in-panel; native uses the Charts sheet) */}
        {isWeb && (
          <View style={styles.chartsWrap}>
            <LapTimesChart driver={driver} theme={theme} chartWidth={chartAreaWidth} />
            <DeltaChart driver={driver} theme={theme} chartWidth={chartAreaWidth} />
          </View>
        )}
      </Card>
    );
  };

  // Which drivers to show in the detail/charts area.
  const detailDriverIndexes = webSelectedDriver !== null
    ? displayData.drivers
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => d.id === webSelectedDriver)
        .map(({ i }) => i)
    : displayData.drivers.map((_, i) => i);

  // --- Single responsive column layout (web + native) ---
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {SessionSelector()}
          <View style={threeColTop ? styles.topRow : undefined}>
            <View style={threeColTop ? styles.flex1 : undefined}>{TeamInfoSection(threeColTop ? styles.fillCard : undefined)}</View>
            <View style={threeColTop ? styles.flex1 : undefined}>{TeamStatsSection(threeColTop, threeColTop ? styles.fillCard : undefined)}</View>
            <View style={threeColTop ? styles.flex1 : undefined}>{DriverSelector(threeColTop ? styles.fillCard : undefined)}</View>
          </View>

          {detailDriverIndexes.length > 0 ? (
            <View
              style={[styles.driverGrid, { columnGap: detailGap }]}
              onLayout={(e) => setGridW(e.nativeEvent.layout.width)}
            >
              {detailDriverIndexes.map((index) => (
                <View
                  key={displayData.drivers[index].id}
                  style={isWeb && detailColWidth > 0 ? { width: detailColWidth } : styles.fullWidth}
                >
                  {DriverDetail({ driverIndex: index })}
                </View>
              ))}
            </View>
          ) : (
            <Surface level="base" padding="xl" style={styles.emptyCard}>
              <Ionicons name="bar-chart-outline" size={28} color={theme.textMuted as string} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No drivers to display</Text>
            </Surface>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Charts Sheet (native) */}
      <Sheet
        visible={showChartsModal}
        onClose={() => setShowChartsModal(false)}
        title={selectedDriverForCharts === null
          ? 'Team Performance Charts'
          : displayData.drivers.find(d => d.id === selectedDriverForCharts)?.name || 'Driver Charts'}
        maxWidth={760}
      >
        {selectedDriverForCharts === null ? (
          displayData.drivers.map((driver, idx) => (
            <View key={driver.id} style={[styles.driverChartSection, idx > 0 && { borderTopColor: theme.borderFaint, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg }]}>
              <Label size={13} style={styles.panelTitle}>{driver.name}</Label>
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
      </Sheet>

      {/* Session Picker Sheet */}
      <Sheet
        visible={showSessionPicker}
        onClose={() => setShowSessionPicker(false)}
        title="Select Session"
      >
        <TouchableOpacity
          style={[styles.sessionItem, { borderBottomColor: theme.borderFaint }, !selectedSession && { backgroundColor: theme.surface }]}
          onPress={() => { setSelectedSession(null); setShowSessionPicker(false); }}
        >
          <Text style={[styles.sessionItemTitle, { color: theme.text }]}>Current Session</Text>
          <Text style={[styles.sessionItemSubtitle, { color: theme.textSecondary }]}>
            {team.raceName || 'Untitled'} - Session {team.sessionNumber || 'N/A'}
          </Text>
        </TouchableOpacity>
        {isLoadingSessions && (
          <View style={{ padding: spacing.lg, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={theme.primary as string} />
          </View>
        )}
        {allSessions.map((session) => (
          <TouchableOpacity
            key={session.id}
            style={[styles.sessionItem, { borderBottomColor: theme.borderFaint }, selectedSession?.id === session.id && { backgroundColor: theme.surface }]}
            onPress={() => { setSelectedSession(session); setShowSessionPicker(false); }}
          >
            <Text style={[styles.sessionItemTitle, { color: theme.text }]}>{session.raceName} - Session {session.sessionNumber}</Text>
            <Text style={[styles.sessionItemSubtitle, { color: theme.textSecondary }]}>{formatSessionDate(session.timestamp)}</Text>
          </TouchableOpacity>
        ))}
      </Sheet>
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
    paddingBottom: 110,
    width: '100%',
  },

  // Web: Team Info · Team Stats · Driver Selector across the top. `stretch` makes
  // the columns equal height; `fillCard` makes each card fill its column.
  topRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'stretch',
    marginBottom: spacing.lg,
  },
  flex1: { flex: 1 },
  fillCard: { flex: 1, marginBottom: 0 },
  // Driver detail cards tile into columns (width set inline from detailColWidth).
  driverGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  fullWidth: { width: '100%' },

  panel: {
    marginBottom: spacing.lg,
  },
  panelTitle: {
    marginBottom: spacing.md,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editFields: {
    gap: spacing.md,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  infoValue: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
    flexShrink: 1,
    textAlign: 'right',
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },

  teamStatsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    flexWrap: 'wrap',
  },
  teamStatsCol: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    gap: spacing.md,
  },
  teamStatItem: {
    flexGrow: 1,
    flexBasis: 120,
  },

  driverName: {
    fontSize: typography.heading,
    fontWeight: fontWeights.heavy,
    letterSpacing: 0.2,
    flexShrink: 1,
  },

  driverList: {
    overflow: 'hidden',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  driverRowName: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gridItem: {
    flexGrow: 1,
    flexBasis: '44%',
    minWidth: 130,
  },

  chartsWrap: {
    marginTop: spacing.lg,
  },

  sessionSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
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

  driverChartSection: {
    marginBottom: spacing.lg,
  },

  sessionItem: {
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
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

  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  emptyText: {
    fontSize: typography.body,
  },
});
