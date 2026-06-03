import React, { useState, useRef } from 'react';
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
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, shadows } from '../constants/theme';
import { Driver } from '../types';
import { useAlert } from '../components/CustomAlert';

export default function DriversScreen() {
  const { teams, setTeams, activeTeam, isDarkMode, audioSettings } = useApp();
  const { showAlert } = useAlert();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const team = teams[activeTeam];

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

  const openAddDriverModal = () => {
    const letter = String.fromCharCode(65 + team.drivers.length);
    setNewDriverName(`Driver ${letter}`);
    setNewDriverTargetTime(getDisplayValue(105));
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
    });

    setTeams(updatedTeams);
    setAddModalVisible(false);
    setNewDriverName('');
    setNewDriverTargetTime('');
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
          <View style={styles.content}>
            {team?.drivers.map((driver, index) => (
              <View
                key={driver.id}
                style={[styles.driverCard, { backgroundColor: theme.card }, shadows.card]}
              >
                <View style={styles.driverHeader}>
                  {editingDriver === index ? (
                    <TextInput
                      style={[styles.nameInput, { color: theme.text, borderColor: theme.border }]}
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
                      style={[styles.nameInput, { borderColor: theme.border, justifyContent: 'center' }]}
                    >
                      <Text style={[styles.driverName, { color: theme.text }]}>{driver.name}</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => removeDriver(index)}
                  >
                    <Ionicons name="trash-outline" size={24} color={theme.broken} />
                  </TouchableOpacity>
                </View>

                <View style={styles.driverInfo}>
                  <View style={styles.infoRow}>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>Target Time</Text>
                    {editingTargetTime === index ? (
                      <TextInput
                        style={[styles.input, { color: theme.text, borderColor: theme.border, minWidth: 120 }]}
                        value={editTargetValue}
                        onChangeText={setEditTargetValue}
                        onBlur={() => {
                          updateDriverField(index, 'targetTime', parseTimeInput(editTargetValue));
                          setEditingTargetTime(null);
                        }}
                        placeholder={audioSettings.timeFormat === 'seconds' ? '105' : '1:45.000'}
                        placeholderTextColor={theme.textSecondary}
                        autoFocus
                        keyboardType="number-pad"
                      />
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          setEditingTargetTime(index);
                          setEditTargetValue(getDisplayValue(driver.targetTime));
                        }}
                        style={styles.targetTimeTouchable}
                      >
                        <Text style={[styles.targetTimeText, { color: theme.text }]}>
                          {formatTargetTime(driver.targetTime)}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {audioSettings.showPenaltyLaps && (
                    <View style={styles.infoRow}>
                      <Text style={[styles.label, { color: theme.textSecondary }]}>Penalty Laps</Text>
                      <TextInput
                        style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                        value={driver.penaltyLaps.toString()}
                        onChangeText={(text) => updateDriverField(index, 'penaltyLaps', parseInt(text) || 0)}
                        keyboardType="number-pad"
                      />
                    </View>
                  )}

                  <View style={styles.statsRow}>
                    <View style={[styles.stat, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Laps</Text>
                      <Text style={[styles.statValue, { color: theme.text }]}>{driver.laps.length}</Text>
                    </View>
                    <View style={[styles.stat, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Bonus</Text>
                      <Text style={[styles.statValue, { color: theme.bonus }]}>
                        {driver.laps.filter(l => l.lapType === 'bonus').length}
                      </Text>
                    </View>
                    <View style={[styles.stat, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Broken</Text>
                      <Text style={[styles.statValue, { color: theme.broken }]}>
                        {driver.laps.filter(l => l.lapType === 'broken').length}
                      </Text>
                    </View>
                  </View>

                  {driver.laps.length > 0 && (
                    <TouchableOpacity
                      style={[styles.clearButton, { borderColor: theme.broken }]}
                      onPress={() => clearDriverLaps(index)}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.broken} />
                      <Text style={[styles.clearButtonText, { color: theme.broken }]}>Clear Laps</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Floating Add Button */}
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: theme.primary }, shadows.card]}
        onPress={openAddDriverModal}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add Driver Modal */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setAddModalVisible(false)}
          >
            <Pressable
              style={[styles.modalContent, { backgroundColor: theme.card }, shadows.modal]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add New Driver</Text>

              <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>Driver Name</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={newDriverName}
                onChangeText={setNewDriverName}
                keyboardType="default"
                placeholder="Enter driver name"
                placeholderTextColor={theme.textSecondary}
                autoFocus
                autoCapitalize="words"
              />

              <Text style={[styles.modalLabel, { color: theme.textSecondary, marginTop: spacing.lg }]}>
                Target Time {audioSettings.timeFormat === 'seconds' ? '(seconds)' : '(MM:SS.mmm)'}
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={newDriverTargetTime}
                onChangeText={setNewDriverTargetTime}
                placeholder={audioSettings.timeFormat === 'seconds' ? '105' : '1:45.000'}
                placeholderTextColor={theme.textSecondary}
                keyboardType="numbers-and-punctuation"
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: theme.textSecondary }]}
                  onPress={() => setAddModalVisible(false)}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: theme.primary }]}
                  onPress={confirmAddDriver}
                >
                  <Text style={styles.modalButtonText}>Add Driver</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
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
    paddingBottom: 90,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  addButton: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  driverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  driverName: {
    fontSize: typography.heading,
    fontWeight: fontWeights.semibold,
  },
  nameInput: {
    fontSize: typography.heading,
    fontWeight: fontWeights.semibold,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 48,
    minWidth: 150,
  },
  deleteButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInfo: {
    gap: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
  },
  label: {
    fontSize: typography.body,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    minWidth: 80,
    minHeight: 48,
    textAlign: 'right',
  },
  formatHint: {
    fontSize: typography.caption,
    marginTop: spacing.xs,
  },
  targetTimeTouchable: {
    minHeight: 48,
    justifyContent: 'center',
  },
  targetTimeText: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
    padding: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  statLabel: {
    fontSize: typography.caption,
  },
  statValue: {
    fontSize: typography.title,
    fontWeight: fontWeights.semibold,
    marginTop: spacing.xs,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 48,
  },
  clearButtonText: {
    fontSize: typography.body,
    fontWeight: fontWeights.medium,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  modalContent: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  modalTitle: {
    fontSize: typography.heading,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.sm,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: typography.bodyLg,
    minHeight: 48,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  modalButton: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
  },
});
