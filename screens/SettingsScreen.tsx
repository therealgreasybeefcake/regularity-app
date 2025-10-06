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
  Modal,
  Pressable,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Paths, File } from 'expo-file-system';
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
    setHasSeenWelcome,
  } = useApp();

  const theme = isDarkMode ? darkTheme : lightTheme;
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const convertToCSV = (teams: any[]) => {
    const rows: string[] = [];

    // Header
    rows.push('Team,Race Name,Session,Driver,Lap #,Lap Type,Time,Delta,Target Time');

    // Data rows
    teams.forEach(team => {
      team.drivers.forEach((driver: any) => {
        driver.laps.forEach((lap: any) => {
          rows.push([
            team.name || 'Unnamed',
            team.raceName || '',
            team.sessionNumber || '',
            driver.name || '',
            lap.number,
            lap.lapType,
            lap.time,
            lap.delta,
            driver.targetTime,
          ].join(','));
        });
      });
    });

    return rows.join('\n');
  };

  const parseCSV = (csvContent: string) => {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file is empty or invalid');
    }

    // Skip header
    const dataLines = lines.slice(1);
    const teamsMap: { [key: string]: any } = {};
    let teamId = 1;
    let driverId = 1;

    dataLines.forEach(line => {
      const parts = line.split(',');
      if (parts.length < 9) return;

      const [teamName, raceName, sessionNumber, driverName, lapNumber, lapType, time, delta, targetTime] = parts;
      const teamKey = `${teamName}-${raceName}-${sessionNumber}`;

      if (!teamsMap[teamKey]) {
        teamsMap[teamKey] = {
          id: teamId++,
          name: teamName,
          raceName: raceName,
          sessionNumber: sessionNumber,
          sessionDuration: 120,
          drivers: [],
          sessionHistory: [],
        };
      }

      const team = teamsMap[teamKey];
      let driver = team.drivers.find((d: any) => d.name === driverName);

      if (!driver) {
        driver = {
          id: driverId++,
          name: driverName,
          targetTime: parseFloat(targetTime),
          laps: [],
          penaltyLaps: 0,
        };
        team.drivers.push(driver);
      }

      driver.laps.push({
        number: parseInt(lapNumber),
        lapType: lapType,
        time: parseFloat(time),
        delta: parseFloat(delta),
      });
    });

    return Object.values(teamsMap);
  };

  const exportData = async (format: 'json' | 'csv') => {
    try {
      const data = {
        teams,
        exportDate: new Date().toISOString(),
      };

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const fileName = `regularity-race-data-${timestamp}.${format}`;
      const file = new File(Paths.cache, fileName);

      let content: string;
      let mimeType: string;

      if (format === 'json') {
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
      } else {
        content = convertToCSV(teams);
        mimeType = 'text/csv';
      }

      // Write content to file using writable stream
      const writer = file.writableStream().getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(content));
      await writer.close();

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType,
          dialogTitle: 'Export Race Data',
          UTI: format === 'json' ? 'public.json' : 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Success', `Data exported to: ${fileName}`);
      }

      setShowExportModal(false);
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Error', 'Failed to export data: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const importData = async (format: 'json' | 'csv') => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: format === 'json' ? 'application/json' : 'text/csv',
      });

      if (result.canceled) return;

      const fileContent = await (await fetch(result.assets[0].uri)).text();
      let importedTeams: any[];

      if (format === 'json') {
        const data = JSON.parse(fileContent);
        if (!data.teams || !Array.isArray(data.teams)) {
          Alert.alert('Error', 'Invalid JSON format - missing teams array');
          return;
        }
        importedTeams = data.teams;
      } else {
        // CSV format
        importedTeams = parseCSV(fileContent);
      }

      Alert.alert(
        'Import Data',
        'This will replace all current data. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: () => {
              setTeams(importedTeams);
              setShowImportModal(false);
              Alert.alert('Success', 'Data imported successfully');
            },
          },
        ]
      );
    } catch (error) {
      console.error('Import error:', error);
      Alert.alert('Error', 'Failed to import data: ' + (error instanceof Error ? error.message : 'Unknown error'));
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
                  { id: 1, name: 'Driver A', targetTime: 105, laps: [], penaltyLaps: 0 },
                  { id: 2, name: 'Driver B', targetTime: 105, laps: [], penaltyLaps: 0 },
                  { id: 3, name: 'Driver C', targetTime: 105, laps: [], penaltyLaps: 0 },
                  { id: 4, name: 'Driver D', targetTime: 105, laps: [], penaltyLaps: 0 },
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView style={styles.scrollView}>
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
                Use volume buttons to record laps while the Timer screen is visible. Works best when app stays in foreground.
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
            <Text style={[styles.settingLabel, { color: theme.text }]}>Before Target (Single Beep)</Text>
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
            <Text style={[styles.settingLabel, { color: theme.text }]}>After Lap-Start (Double Beep)</Text>
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

        {/* Driver Display Settings */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Driver Display Settings</Text>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Show Penalty Laps</Text>
              <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                Display penalty laps field in driver screen
              </Text>
            </View>
            <Switch
              value={audioSettings.showPenaltyLaps}
              onValueChange={(value) =>
                setAudioSettings({ ...audioSettings, showPenaltyLaps: value })
              }
              trackColor={{ false: theme.border, true: theme.primary }}
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
            onPress={() => setShowExportModal(true)}
          >
            <Ionicons name="download-outline" size={20} color="#fff" />
            <Text style={styles.buttonText}>Export Data</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={() => setShowImportModal(true)}
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

        {/* Support Development */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Support Development</Text>
          <Text style={[styles.settingDescription, { color: theme.textSecondary, marginBottom: 12 }]}>
            This app is free to use. If you find it helpful, consider supporting its development!
          </Text>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#FFDD00' }]}
            onPress={() => Linking.openURL('https://buymeacoffee.com/greasybeefcake')}
          >
            <Ionicons name="cafe" size={20} color="#000" />
            <Text style={[styles.buttonText, { color: '#000' }]}>Buy Me a Coffee</Text>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>About</Text>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={() => setHasSeenWelcome(false)}
          >
            <Ionicons name="help-circle-outline" size={20} color="#fff" />
            <Text style={styles.buttonText}>Show Welcome Guide</Text>
          </TouchableOpacity>

          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            Regularity Race Timer
          </Text>
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>Version 1.0.0</Text>
        </View>
      </View>

      {/* Export Format Modal */}
      <Modal
        visible={showExportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowExportModal(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: theme.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>Export Format</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Choose the format for your data export
            </Text>

            <TouchableOpacity
              style={[styles.formatButton, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={() => exportData('json')}
            >
              <View style={styles.formatButtonContent}>
                <Ionicons name="code-outline" size={32} color={theme.primary} />
                <View style={styles.formatButtonText}>
                  <Text style={[styles.formatButtonTitle, { color: theme.text }]}>JSON</Text>
                  <Text style={[styles.formatButtonDescription, { color: theme.textSecondary }]}>
                    Complete data structure for backup and import
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.formatButton, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={() => exportData('csv')}
            >
              <View style={styles.formatButtonContent}>
                <Ionicons name="grid-outline" size={32} color={theme.primary} />
                <View style={styles.formatButtonText}>
                  <Text style={[styles.formatButtonTitle, { color: theme.text }]}>CSV</Text>
                  <Text style={[styles.formatButtonDescription, { color: theme.textSecondary }]}>
                    Spreadsheet format for analysis
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalCancelButton, { backgroundColor: theme.textSecondary }]}
              onPress={() => setShowExportModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Import Format Modal */}
      <Modal
        visible={showImportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImportModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowImportModal(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: theme.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>Import Format</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Choose the format of your data file
            </Text>

            <TouchableOpacity
              style={[styles.formatButton, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={() => importData('json')}
            >
              <View style={styles.formatButtonContent}>
                <Ionicons name="code-outline" size={32} color={theme.primary} />
                <View style={styles.formatButtonText}>
                  <Text style={[styles.formatButtonTitle, { color: theme.text }]}>JSON</Text>
                  <Text style={[styles.formatButtonDescription, { color: theme.textSecondary }]}>
                    Import from JSON backup file
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.formatButton, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={() => importData('csv')}
            >
              <View style={styles.formatButtonContent}>
                <Ionicons name="grid-outline" size={32} color={theme.primary} />
                <View style={styles.formatButtonText}>
                  <Text style={[styles.formatButtonTitle, { color: theme.text }]}>CSV</Text>
                  <Text style={[styles.formatButtonDescription, { color: theme.textSecondary }]}>
                    Import from CSV spreadsheet
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalCancelButton, { backgroundColor: theme.textSecondary }]}
              onPress={() => setShowImportModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      </ScrollView>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    borderRadius: 16,
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
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
  },
  formatButton: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
  },
  formatButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  formatButtonText: {
    flex: 1,
  },
  formatButtonTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  formatButtonDescription: {
    fontSize: 13,
  },
  modalCancelButton: {
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
