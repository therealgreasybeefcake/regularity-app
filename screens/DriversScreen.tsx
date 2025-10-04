import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme } from '../constants/theme';
import { Driver } from '../types';

export default function DriversScreen() {
  const { teams, setTeams, activeTeam, isDarkMode } = useApp();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const team = teams[activeTeam];

  const [editingDriver, setEditingDriver] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const addDriver = () => {
    const updatedTeams = [...teams];
    const newId = Math.max(...updatedTeams[activeTeam].drivers.map(d => d.id), 0) + 1;
    const letter = String.fromCharCode(65 + updatedTeams[activeTeam].drivers.length);

    updatedTeams[activeTeam].drivers.push({
      id: newId,
      name: `Driver ${letter}`,
      targetTime: 105,
      penaltyLaps: 0,
      laps: [],
    });

    setTeams(updatedTeams);
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
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Drivers</Text>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.primary }]}
            onPress={addDriver}
          >
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {team?.drivers.map((driver, index) => (
          <View key={driver.id} style={[styles.driverCard, { backgroundColor: theme.card }]}>
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
                <Text style={[styles.label, { color: theme.textSecondary }]}>Target Time (s)</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                  value={driver.targetTime.toString()}
                  onChangeText={(text) => updateDriverField(index, 'targetTime', parseFloat(text) || 0)}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Penalty Laps</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                  value={driver.penaltyLaps.toString()}
                  onChangeText={(text) => updateDriverField(index, 'penaltyLaps', parseInt(text) || 0)}
                  keyboardType="number-pad"
                />
              </View>

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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
});
