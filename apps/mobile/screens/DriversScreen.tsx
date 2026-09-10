import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,

  Animated,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, glowShadow } from '../constants/theme';
import { Driver } from '../types';
import { useAlert } from '../components/CustomAlert';
import { api } from '../lib/api';
import { Mono, Label, Card, Surface, Button, IconButton, StatTile, TextField, Sheet, Divider, Chip } from '../components/ui';

interface TeamMemberLite {
  id: string;
  userId: string;
  name: string;
  role: string;
}

export default function DriversScreen() {
  const { teams, setTeams, activeTeam, isDarkMode, audioSettings, activeServerTeamId } = useApp();
  const { showAlert } = useAlert();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const team = teams[activeTeam];

  // Fixed 2-column grid on web (1 column on phones / narrow windows). Width comes
  // from the measured grid container so 2-up cards fill the row exactly (no wrap).
  const isWeb = Platform.OS === 'web';
  const [gridW, setGridW] = useState(0);
  const cols = isWeb && gridW >= 700 ? 2 : 1;
  const cardWidth = cols > 1 && gridW > 0 ? (gridW - spacing.lg * (cols - 1)) / cols : undefined;

  const formatTargetTime = (seconds: number) => {
    if (audioSettings.timeFormat === 'seconds') {
      return `${seconds}s`;
    } else {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
    }
  };

  const parseTimeInput = (input: string): number => {
    // Try to parse as MM:SS.mmm format
    if (input.includes(':')) {
      const parts = input.split(':');
      if (parts.length === 2) {
        const mins = parseInt(parts[0]) || 0;
        const secs = parseFloat(parts[1]) || 0;
        return mins * 60 + secs;
      }
    }
    // Otherwise parse as plain seconds
    return parseFloat(input) || 0;
  };

  const getDisplayValue = (seconds: number): string => {
    if (audioSettings.timeFormat === 'seconds') {
      return seconds.toString();
    } else {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
    }
  };

  const [editingDriver, setEditingDriver] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editingTargetTime, setEditingTargetTime] = useState<number | null>(null);
  const [editTargetValue, setEditTargetValue] = useState('');
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverTargetTime, setNewDriverTargetTime] = useState('');
  const [newDriverLinkedUserId, setNewDriverLinkedUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberLite[]>([]);

  // Team members available to link a driver to (those with accounts in the team).
  useEffect(() => {
    if (!activeServerTeamId) {
      setMembers([]);
      return;
    }
    let active = true;
    api
      .get<{ members: TeamMemberLite[] }>(`/api/teams/${activeServerTeamId}/members`)
      .then((r) => { if (active) setMembers(r.members); })
      .catch(() => { /* offline / no access */ });
    return () => { active = false; };
  }, [activeServerTeamId]);

  const openAddDriverModal = () => {
    const letter = String.fromCharCode(65 + team.drivers.length);
    setNewDriverName(`Driver ${letter}`);
    setNewDriverTargetTime(getDisplayValue(105));
    setNewDriverLinkedUserId(null);
    setAddModalVisible(true);
  };

  const confirmAddDriver = () => {
    if (!newDriverName.trim()) {
      showAlert({ title: 'Error', message: 'Driver name cannot be empty' });
      return;
    }

    const targetTime = parseTimeInput(newDriverTargetTime);
    if (isNaN(targetTime) || targetTime <= 0) {
      showAlert({ title: 'Error', message: 'Please enter a valid target time' });
      return;
    }

    const updatedTeams = [...teams];
    const newId = Math.max(...updatedTeams[activeTeam].drivers.map(d => d.id), 0) + 1;

    updatedTeams[activeTeam].drivers.push({
      id: newId,
      name: newDriverName.trim(),
      targetTime: targetTime,
      penaltyLaps: 0,
      laps: [],
      linkedUserId: newDriverLinkedUserId,
    });

    setTeams(updatedTeams);
    setAddModalVisible(false);
    setNewDriverName('');
    setNewDriverTargetTime('');
    setNewDriverLinkedUserId(null);
  };

  const removeDriver = (index: number) => {
    const driver = team.drivers[index];
    const message = driver.laps.length > 0
      ? `Delete ${driver.name}? This will remove ${driver.laps.length} laps.`
      : `Delete ${driver.name}?`;

    showAlert({
      title: 'Confirm Delete',
      message,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updatedTeams = [...teams];
            updatedTeams[activeTeam].drivers.splice(index, 1);
            setTeams(updatedTeams);
          },
        },
      ],
    });
  };

  const updateDriverField = (index: number, field: keyof Driver, value: any) => {
    const updatedTeams = [...teams];
    (updatedTeams[activeTeam].drivers[index] as any)[field] = value;
    setTeams(updatedTeams);
  };

  const clearDriverLaps = (index: number) => {
    const driver = team.drivers[index];
    showAlert({
      title: 'Clear Laps',
      message: `Clear all ${driver.laps.length} laps for ${driver.name}?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            const updatedTeams = [...teams];
            updatedTeams[activeTeam].drivers[index].laps = [];
            setTeams(updatedTeams);
          },
        },
      ],
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Label muted>{team?.name || 'Regularity Timer'}</Label>
            <View style={styles.headerTitleRow}>
              <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                Drivers
              </Text>
              <Mono size={typography.body} weight="bold" color={theme.textSecondary}>
                {team?.drivers.length ?? 0}
              </Mono>
            </View>
          </View>

          <View style={styles.content} onLayout={(e) => setGridW(e.nativeEvent.layout.width - spacing.lg * 2)}>
            {team?.drivers.map((driver, index) => (
              <Card key={driver.id} padding="lg" style={[styles.driverCard, cardWidth ? { width: cardWidth } : styles.fullWidthCard]}>
                {/* Header row — name (editable) + delete */}
                <View style={styles.driverHeader}>
                  {editingDriver === index ? (
                    <TextInput
                      style={[
                        styles.nameInput,
                        { color: theme.text as string, borderColor: theme.accent, backgroundColor: theme.surface },
                      ]}
                      value={editValue}
                      onChangeText={setEditValue}
                      keyboardType="default"
                      onBlur={() => {
                        updateDriverField(index, 'name', editValue);
                        setEditingDriver(null);
                      }}
                      autoFocus
                      autoCapitalize="words"
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        setEditingDriver(index);
                        setEditValue(driver.name);
                      }}
                      style={styles.nameTouchable}
                    >
                      <Text style={[styles.driverName, { color: theme.text }]} numberOfLines={1}>
                        {driver.name}
                      </Text>
                      {driver.linkedUserId ? (
                        <Ionicons name="person-circle" size={15} color={theme.primary as string} />
                      ) : null}
                      <Ionicons name="pencil" size={13} color={theme.textMuted as string} style={styles.nameEditIcon} />
                    </TouchableOpacity>
                  )}

                  <IconButton
                    icon="trash-outline"
                    color={theme.danger}
                    onPress={() => removeDriver(index)}
                    accessibilityLabel={`Delete ${driver.name}`}
                  />
                </View>

                <Divider faint />

                {/* Field rows — label left, compact control right */}
                <View style={styles.fieldGroup}>
                  <View style={styles.infoRow}>
                    <Label>Target Time</Label>
                    {editingTargetTime === index ? (
                      <TextField
                        mono
                        value={editTargetValue}
                        onChangeText={setEditTargetValue}
                        onBlur={() => {
                          updateDriverField(index, 'targetTime', parseTimeInput(editTargetValue));
                          setEditingTargetTime(null);
                        }}
                        placeholder={audioSettings.timeFormat === 'seconds' ? '105' : '1:45.000'}
                        autoFocus
                        keyboardType="number-pad"
                        containerStyle={styles.fieldControl}
                        style={styles.fieldInputText}
                      />
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          setEditingTargetTime(index);
                          setEditTargetValue(getDisplayValue(driver.targetTime));
                        }}
                        style={[styles.valuePill, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      >
                        <Mono size={typography.bodyLg} weight="bold" color={theme.text}>
                          {formatTargetTime(driver.targetTime)}
                        </Mono>
                      </TouchableOpacity>
                    )}
                  </View>

                  {audioSettings.showPenaltyLaps && (
                    <View style={styles.infoRow}>
                      <Label>Penalty Laps</Label>
                      <TextField
                        mono
                        value={driver.penaltyLaps.toString()}
                        onChangeText={(text) => updateDriverField(index, 'penaltyLaps', parseInt(text) || 0)}
                        keyboardType="number-pad"
                        containerStyle={styles.fieldControlNarrow}
                        style={styles.fieldInputText}
                      />
                    </View>
                  )}
                </View>

                {/* Laps / Bonus / Broken mini-stats */}
                <View style={styles.statsRow}>
                  <Surface level="muted" padding="md" radius="md" style={styles.statTile}>
                    <StatTile label="Laps" value={driver.laps.length} size="sm" align="center" />
                  </Surface>
                  <Surface level="muted" padding="md" radius="md" style={styles.statTile}>
                    <StatTile
                      label="Bonus"
                      value={driver.laps.filter(l => l.lapType === 'bonus').length}
                      valueColor={theme.bonus}
                      size="sm"
                      align="center"
                    />
                  </Surface>
                  <Surface level="muted" padding="md" radius="md" style={styles.statTile}>
                    <StatTile
                      label="Broken"
                      value={driver.laps.filter(l => l.lapType === 'broken').length}
                      valueColor={theme.broken}
                      size="sm"
                      align="center"
                    />
                  </Surface>
                </View>

                {driver.laps.length > 0 && (
                  <Button
                    title="Clear Laps"
                    icon="trash-outline"
                    variant="outline"
                    size="sm"
                    onPress={() => clearDriverLaps(index)}
                    fullWidth
                    style={[styles.clearButton, { borderColor: theme.danger }]}
                    textStyle={{ color: theme.danger }}
                  />
                )}
              </Card>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating "Add Driver" button — labeled + lifted above the tab bar. */}
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: theme.primary }, glowShadow(String(theme.primary), 0.5, 16)]}
        onPress={openAddDriverModal}
        accessibilityLabel="Add driver"
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={styles.addButtonLabel}>Add Driver</Text>
      </TouchableOpacity>

      {/* Add Driver Sheet */}
      <Sheet
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        title="Add New Driver"
        footer={
          <View style={styles.sheetBtns}>
            <Button title="Cancel" variant="secondary" onPress={() => setAddModalVisible(false)} style={{ flex: 1 }} />
            <Button title="Add Driver" onPress={confirmAddDriver} style={{ flex: 1 }} />
          </View>
        }
      >
        <View style={styles.sheetFields}>
          {members.length > 0 && (
            <View style={styles.pickerGroup}>
              <Label>Add from</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
                <Chip
                  label="Custom"
                  icon="create-outline"
                  active={newDriverLinkedUserId === null}
                  onPress={() => setNewDriverLinkedUserId(null)}
                />
                {members.map((m) => (
                  <Chip
                    key={m.userId}
                    label={m.name}
                    icon="person"
                    color={theme.primary}
                    active={newDriverLinkedUserId === m.userId}
                    onPress={() => {
                      setNewDriverLinkedUserId(m.userId);
                      setNewDriverName(m.name);
                    }}
                  />
                ))}
              </ScrollView>
              <Label muted size={11}>
                Link this driver to a teammate's account, or choose Custom for someone without the app.
              </Label>
            </View>
          )}
          <TextField
            label="Driver Name"
            value={newDriverName}
            onChangeText={setNewDriverName}
            keyboardType="default"
            placeholder="Enter driver name"
            autoFocus
            autoCapitalize="words"
          />
          <TextField
            mono
            label={`Target Time ${audioSettings.timeFormat === 'seconds' ? '(seconds)' : '(MM:SS.mmm)'}`}
            value={newDriverTargetTime}
            onChangeText={setNewDriverTargetTime}
            placeholder={audioSettings.timeFormat === 'seconds' ? '105' : '1:45.000'}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </Sheet>
    </SafeAreaView >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 110,
    width: '100%',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  headerTitle: {
    fontSize: typography.heading,
    fontWeight: fontWeights.heavy,
    letterSpacing: 0.2,
  },
  content: {
    padding: spacing.lg,
    // Auto-responsive card grid: cards grow from a 320px basis, so phones get a
    // single column and wide web fills the container with 2–4 across (less scroll).
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  addButton: {
    position: 'absolute',
    bottom: 100, // clear the ~83px absolute tab bar
    right: spacing.xl,
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  addButtonLabel: {
    color: '#fff',
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.bold,
  },
  driverCard: {
    gap: spacing.md,
  },
  fullWidthCard: {
    width: '100%',
  },
  driverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nameTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
  },
  nameEditIcon: {
    opacity: 0.8,
  },
  driverName: {
    fontSize: typography.heading,
    fontWeight: fontWeights.bold,
    flexShrink: 1,
  },
  nameInput: {
    flex: 1,
    fontSize: typography.heading,
    fontWeight: fontWeights.bold,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 46,
    gap: spacing.md,
  },
  fieldControl: {
    width: 140,
  },
  fieldControlNarrow: {
    width: 96,
  },
  fieldInputText: {
    textAlign: 'right',
  },
  valuePill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButton: {
    marginTop: spacing.xs,
  },
  sheetBtns: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sheetFields: {
    gap: spacing.lg,
  },
  pickerGroup: {
    gap: spacing.sm,
  },
  pickerRow: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
});
