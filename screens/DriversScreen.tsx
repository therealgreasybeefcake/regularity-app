import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme } from '../constants/theme';
import { Driver } from '../types';

export default function DriversScreen() {
  const { teams, setTeams, activeTeam, isDarkMode, audioSettings } = useApp();
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
      Alert.alert('Error', 'Driver name cannot be empty');
      return;
    }

    const targetTime = parseTimeInput(newDriverTargetTime);
    if (isNaN(targetTime) || targetTime <= 0) {
      Alert.alert('Error', 'Please enter a valid target time');
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

    Alert.alert(
      'Confirm Delete',
      message,
      [
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
      ]
    );
  };

  const updateDriverField = (index: number, field: keyof Driver, value: any) => {
    const updatedTeams = [...teams];
    (updatedTeams[activeTeam].drivers[index] as any)[field] = value;
    setTeams(updatedTeams);
  };

  const clearDriverLaps = (index: number) => {
    const driver = team.drivers[index];
    Alert.alert(
      'Clear Laps',
      `Clear all ${driver.laps.length} laps for ${driver.name}?`,
      [
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
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {team?.drivers.map((driver, index) => (
          <View
            key={driver.id}
            style={[styles.driverCard, { backgroundColor: theme.card }]}
          >
            <View style={styles.driverHeader}>
              {editingDriver === index ? (
                <TextInput
                  style={[styles.nameInput, { color: theme.text, borderColor: theme.border }]}
                  value={editValue}
                  onChangeText={setEditValue}
                  onBlur={() => {
                    updateDriverField(index, 'name', editValue);
                    setEditingDriver(null);
                  }}
                  autoFocus
                />
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    setEditingDriver(index);
                    setEditValue(driver.name);
                  }}
                >
                  <Text style={[styles.driverName, { color: theme.text }]}>{driver.name}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={() => removeDriver(index)}>
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
                  />
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      setEditingTargetTime(index);
                      setEditTargetValue(getDisplayValue(driver.targetTime));
                    }}
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
                <View style={styles.stat}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Laps</Text>
                  <Text style={[styles.statValue, { color: theme.text }]}>{driver.laps.length}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Bonus</Text>
                  <Text style={[styles.statValue, { color: theme.bonus }]}>
                    {driver.laps.filter(l => l.lapType === 'bonus').length}
                  </Text>
                </View>
                <View style={styles.stat}>
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

      {/* Floating Add Button */}
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: theme.primary }]}
        onPress={openAddDriverModal}
      >
        <Ionicons name="add" size={24} color="#fff" />
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
              style={[styles.modalContent, { backgroundColor: theme.card }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[styles.modalTitle, { color: theme.text }]}>Add New Driver</Text>

              <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>Driver Name</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={newDriverName}
                onChangeText={setNewDriverName}
                placeholder="Enter driver name"
                placeholderTextColor={theme.textSecondary}
                autoFocus
              />

              <Text style={[styles.modalLabel, { color: theme.textSecondary, marginTop: 16 }]}>
                Target Time {audioSettings.timeFormat === 'seconds' ? '(seconds)' : '(MM:SS.mmm)'}
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                value={newDriverTargetTime}
                onChangeText={setNewDriverTargetTime}
                placeholder={audioSettings.timeFormat === 'seconds' ? '105' : '1:45.000'}
                placeholderTextColor={theme.textSecondary}
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
    </View>
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
    paddingBottom: 80,
  },
  content: {
    padding: 16,
  },
  addButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  driverCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  driverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  driverName: {
    fontSize: 20,
    fontWeight: '600',
  },
  nameInput: {
    fontSize: 20,
    fontWeight: '600',
    borderBottomWidth: 1,
    paddingBottom: 4,
  },
  driverInfo: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    minWidth: 80,
    textAlign: 'right',
  },
  formatHint: {
    fontSize: 12,
    marginTop: 4,
  },
  targetTimeText: {
    fontSize: 16,
    fontWeight: '600',
    padding: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    gap: 6,
    marginTop: 8,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  modalContent: {
    marginHorizontal: 0,
    borderRadius: 0,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
