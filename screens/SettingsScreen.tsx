import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useApp, ThemeMode } from '../context/AppContext';
import { lightTheme, darkTheme } from '../constants/theme';

export default function SettingsScreen() {
  const {
    teams,
    setTeams,
    isDarkMode,
    themeMode,
    setThemeMode,
    audioSettings,
    setAudioSettings,
    lapTypeValues,
    setLapTypeValues,
  } = useApp();

  const theme = isDarkMode ? darkTheme : lightTheme;

  const exportData = async () => {
    try {
      const data = {
        teams,
        exportDate: new Date().toISOString(),
      };

      const file = Paths.document.createFile('regularity-race-data.json', 'application/json');
      file.write(JSON.stringify(data, null, 2), {});

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
      } else {
        Alert.alert('Success', 'Data exported to: ' + file.uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to export data');
    }
  };

  const importData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
      });

      if (result.canceled) return;

      const fileContent = await (await fetch(result.assets[0].uri)).text();
      const data = JSON.parse(fileContent);

      if (data.teams && Array.isArray(data.teams)) {
        Alert.alert(
          'Import Data',
          'This will replace all current data. Continue?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Import',
              onPress: () => {
                setTeams(data.teams);
                Alert.alert('Success', 'Data imported successfully');
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Invalid file format');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to import data');
    }
  };

  const clearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all teams, drivers, and laps. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            setTeams([
              {
                id: 1,
                name: '',
                raceName: '',
                sessionNumber: '',
                sessionDuration: 120,
                drivers: [
                  { id: 1, name: '', targetTime: 105, laps: [], penaltyLaps: 0 },
                  { id: 2, name: '', targetTime: 105, laps: [], penaltyLaps: 0 },
                  { id: 3, name: '', targetTime: 105, laps: [], penaltyLaps: 0 },
                  { id: 4, name: '', targetTime: 105, laps: [], penaltyLaps: 0 },
                ],
                sessionHistory: [],
              },
            ]);
            Alert.alert('Success', 'All data cleared');
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        {/* Theme */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Appearance</Text>

          <View style={styles.themeOptions}>
            <TouchableOpacity
              style={[
                styles.themeButton,
                themeMode === 'light' && { backgroundColor: theme.primary },
                { borderColor: theme.border }
              ]}
              onPress={() => setThemeMode('light')}
            >
              <Ionicons
                name="sunny"
                size={24}
                color={themeMode === 'light' ? '#fff' : theme.text}
              />
              <Text style={[
                styles.themeButtonText,
                { color: themeMode === 'light' ? '#fff' : theme.text }
              ]}>
                Light
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.themeButton,
                themeMode === 'dark' && { backgroundColor: theme.primary },
                { borderColor: theme.border }
              ]}
              onPress={() => setThemeMode('dark')}
            >
              <Ionicons
                name="moon"
                size={24}
                color={themeMode === 'dark' ? '#fff' : theme.text}
              />
              <Text style={[
                styles.themeButtonText,
                { color: themeMode === 'dark' ? '#fff' : theme.text }
              ]}>
                Dark
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.themeButton,
                themeMode === 'auto' && { backgroundColor: theme.primary },
                { borderColor: theme.border }
              ]}
              onPress={() => setThemeMode('auto')}
            >
              <Ionicons
                name="phone-portrait"
                size={24}
                color={themeMode === 'auto' ? '#fff' : theme.text}
              />
              <Text style={[
                styles.themeButtonText,
                { color: themeMode === 'auto' ? '#fff' : theme.text }
              ]}>
                Auto
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Lap Recording Controls */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Lap Recording Controls</Text>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Volume Button Recording</Text>
              <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                Use volume buttons to record laps
              </Text>
            </View>
            <Switch
              value={audioSettings.volumeButtonsEnabled}
              onValueChange={(value) =>
                setAudioSettings({ ...audioSettings, volumeButtonsEnabled: value })
              }
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Background Recording</Text>
              <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                Record laps with volume buttons while using other apps
              </Text>
            </View>
            <Switch
              value={audioSettings.backgroundRecordingEnabled}
              onValueChange={(value) =>
                setAudioSettings({ ...audioSettings, backgroundRecordingEnabled: value })
              }
              trackColor={{ false: theme.border, true: theme.primary }}
              disabled={!audioSettings.volumeButtonsEnabled}
            />
          </View>
        </View>

        {/* Audio Settings */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Audio Warnings</Text>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.text }]}>Enable Audio</Text>
            <Switch
              value={audioSettings.enabled}
              onValueChange={(value) => setAudioSettings({ ...audioSettings, enabled: value })}
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.text }]}>Before Target Warning</Text>
            <Switch
              value={audioSettings.beforeTargetEnabled}
              onValueChange={(value) =>
                setAudioSettings({ ...audioSettings, beforeTargetEnabled: value })
              }
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
              Seconds before target
            </Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              value={audioSettings.beforeTargetTime.toString()}
              onChangeText={(text) =>
                setAudioSettings({
                  ...audioSettings,
                  beforeTargetTime: parseInt(text) || 10,
                })
              }
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.text }]}>After Lap-Start Warning</Text>
            <Switch
              value={audioSettings.afterLapStartEnabled}
              onValueChange={(value) =>
                setAudioSettings({ ...audioSettings, afterLapStartEnabled: value })
              }
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
              Seconds after lap start
            </Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              value={audioSettings.afterLapStart.toString()}
              onChangeText={(text) =>
                setAudioSettings({
                  ...audioSettings,
                  afterLapStart: parseInt(text) || 15,
                })
              }
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* Time Display Format */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Time Display Format</Text>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Seconds</Text>
              <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                Display as: 105s
              </Text>
            </View>
            <Switch
              value={audioSettings.timeFormat === 'seconds'}
              onValueChange={(value) =>
                setAudioSettings({ ...audioSettings, timeFormat: value ? 'seconds' : 'mmssmmm' })
              }
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>MM:SS.mmm</Text>
              <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                Display as: 1:45.000
              </Text>
            </View>
            <Switch
              value={audioSettings.timeFormat === 'mmssmmm'}
              onValueChange={(value) =>
                setAudioSettings({ ...audioSettings, timeFormat: value ? 'mmssmmm' : 'seconds' })
              }
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          </View>
        </View>

        {/* Lap Recording Guard */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Lap Recording Guard</Text>
          <Text style={[styles.settingDescription, { color: theme.textSecondary, marginBottom: 12 }]}>
            Prevent accidental lap recording outside target time range
          </Text>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.text }]}>Enable Guard</Text>
            <Switch
              value={audioSettings.lapGuardEnabled}
              onValueChange={(value) =>
                setAudioSettings({ ...audioSettings, lapGuardEnabled: value })
              }
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
              +/- seconds from target
            </Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              value={audioSettings.lapGuardRange.toString()}
              onChangeText={(text) =>
                setAudioSettings({
                  ...audioSettings,
                  lapGuardRange: parseInt(text) || 10,
                })
              }
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.inputRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                Safety car threshold{'\n'}(seconds over target)
              </Text>
            </View>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              value={audioSettings.lapGuardSafetyCarThreshold.toString()}
              onChangeText={(text) =>
                setAudioSettings({
                  ...audioSettings,
                  lapGuardSafetyCarThreshold: parseInt(text) || 30,
                })
              }
              keyboardType="number-pad"
            />
          </View>

          {audioSettings.lapGuardEnabled && (
            <Text style={[styles.settingDescription, { color: theme.textSecondary, marginTop: 8 }]}>
              Normal laps: within ±{audioSettings.lapGuardRange}s of target{'\n'}
              Safety car: automatically allowed if {audioSettings.lapGuardSafetyCarThreshold}s+ over target
            </Text>
          )}
        </View>

        {/* Lap Type Values */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Lap Type Values</Text>

          {Object.entries(lapTypeValues).map(([key, value]) => (
            <View key={key} style={styles.inputRow}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </Text>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                value={value.toString()}
                onChangeText={(text) =>
                  setLapTypeValues({
                    ...lapTypeValues,
                    [key]: parseFloat(text) || 0,
                  })
                }
                keyboardType="decimal-pad"
              />
            </View>
          ))}
        </View>

        {/* Data Management */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Data Management</Text>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={exportData}
          >
            <Ionicons name="download-outline" size={20} color="#fff" />
            <Text style={styles.buttonText}>Export Data</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={importData}
          >
            <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
            <Text style={styles.buttonText}>Import Data</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.broken }]}
            onPress={clearAllData}
          >
            <Ionicons name="trash-outline" size={20} color="#fff" />
            <Text style={styles.buttonText}>Clear All Data</Text>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>About</Text>
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            Regularity Race Timer
          </Text>
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>Version 1.0.0</Text>
        </View>
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
  themeOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  themeButton: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 8,
  },
  themeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingLabel: {
    fontSize: 16,
  },
  settingDescription: {
    fontSize: 12,
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  inputLabel: {
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    width: 80,
    textAlign: 'right',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 14,
    marginBottom: 8,
  },
});
