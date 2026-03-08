import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Modal,
  Pressable,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useApp, ThemeMode } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../components/CustomAlert';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, shadows, brandColors } from '../constants/theme';
import { Picker } from '@react-native-picker/picker';

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
    syncStatus,
  } = useApp();
  const { user, signOut } = useAuth();
  const { showAlert } = useAlert();

  const theme = isDarkMode ? darkTheme : lightTheme;

  const syncIcon = syncStatus === 'synced' ? 'cloud-done-outline' as const
    : syncStatus === 'syncing' ? 'cloud-upload-outline' as const
    : syncStatus === 'error' ? 'cloud-offline-outline' as const
    : 'cloud-offline-outline' as const;
  const syncLabel = syncStatus === 'synced' ? 'Synced'
    : syncStatus === 'syncing' ? 'Syncing...'
    : syncStatus === 'error' ? 'Sync error'
    : 'Offline';
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);

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

      let content: string;
      let mimeType: string;

      if (format === 'json') {
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
      } else {
        content = convertToCSV(teams);
        mimeType = 'text/csv';
      }

      if (Platform.OS === 'web') {
        // Web: use Blob + anchor download
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, fileName);

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
          showAlert({ title: 'Success', message: `Data exported to: ${fileName}` });
        }
      }

      setShowExportModal(false);
    } catch (error) {
      console.error('Export error:', error);
      showAlert({ title: 'Error', message: 'Failed to export data: ' + (error instanceof Error ? error.message : 'Unknown error') });
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
          showAlert({ title: 'Error', message: 'Invalid JSON format - missing teams array' });
          return;
        }

        // Validate structure of each team and its drivers
        for (const team of data.teams) {
          if (!team.id || !team.name || !Array.isArray(team.drivers) || team.sessionDuration === undefined) {
            showAlert({ title: 'Error', message: 'Invalid team data: each team must have id, name, drivers (array), and sessionDuration' });
            return;
          }
          for (const driver of team.drivers) {
            if (!driver.id || !driver.name || driver.targetTime === undefined || !Array.isArray(driver.laps)) {
              showAlert({ title: 'Error', message: `Invalid driver data in team "${team.name}": each driver must have id, name, targetTime, and laps (array)` });
              return;
            }
          }
        }

        importedTeams = data.teams;
      } else {
        // CSV format
        importedTeams = parseCSV(fileContent);
      }

      showAlert({
        title: 'Import Data',
        message: 'This will replace all current data. Continue?',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: () => {
              setTeams(importedTeams);
              setShowImportModal(false);
              showAlert({ title: 'Success', message: 'Data imported successfully' });
            },
          },
        ],
      });
    } catch (error) {
      console.error('Import error:', error);
      showAlert({ title: 'Error', message: 'Failed to import data: ' + (error instanceof Error ? error.message : 'Unknown error') });
    }
  };

  const clearAllData = () => {
    showAlert({
      title: 'Clear All Data',
      message: 'This will delete all teams, drivers, and laps. This cannot be undone.',
      buttons: [
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
            showAlert({ title: 'Success', message: 'All data cleared' });
          },
        },
      ],
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          {/* Theme */}
          {/* Theme */}
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 4 }]}>Appearance</Text>
                <Text style={[styles.settingDescription, { color: theme.textSecondary }]}>
                  {themeMode === 'light' ? 'Light Mode' : themeMode === 'dark' ? 'Dark Mode' : 'System Default'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.valueButton, { backgroundColor: theme.background, borderColor: theme.border }]}
                onPress={() => setShowThemeModal(true)}
              >
                <Text style={[styles.valueButtonText, { color: theme.text }]}>
                  {themeMode === 'light' ? 'Light' : themeMode === 'dark' ? 'Dark' : 'Auto'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Lap Recording Controls */}
          {Platform.OS !== 'web' && (
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
          )}

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
              style={[styles.button, { backgroundColor: brandColors.coffee }]}
              onPress={() => Linking.openURL('https://buymeacoffee.com/greasybeefcake')}
            >
              <Ionicons name="cafe" size={20} color="#000" />
              <Text style={[styles.buttonText, { color: '#000' }]}>Buy Me a Coffee</Text>
            </TouchableOpacity>
          </View>

          {/* Account */}
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Account</Text>

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: theme.text }]}>{user}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, gap: spacing.xs }}>
                  <Ionicons name={syncIcon} size={14} color={theme.textSecondary} />
                  <Text style={[styles.settingDescription, { color: theme.textSecondary, marginTop: 0 }]}>{syncLabel}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.broken }]}
              onPress={() => {
                showAlert({
                  title: 'Sign Out',
                  message: 'Are you sure you want to sign out?',
                  buttons: [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign Out', style: 'destructive', onPress: signOut },
                  ],
                });
              }}
            >
              <Ionicons name="log-out-outline" size={20} color="#fff" />
              <Text style={styles.buttonText}>Sign Out</Text>
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

        {/* Theme Selection Modal */}
        <Modal
          visible={showThemeModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowThemeModal(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowThemeModal(false)}
          >
            <Pressable
              style={[styles.modalContent, { backgroundColor: theme.card }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[styles.modalTitle, { color: theme.text }]}>Select Appearance</Text>

              <TouchableOpacity
                style={[
                  styles.formatButton,
                  { backgroundColor: theme.background, borderColor: themeMode === 'light' ? theme.primary : theme.border },
                  themeMode === 'light' && { borderWidth: 2 }
                ]}
                onPress={() => {
                  setThemeMode('light');
                  setShowThemeModal(false);
                }}
              >
                {themeMode === 'light' && <Ionicons name="checkmark" size={24} color={theme.primary} />}
                <View style={styles.formatButtonContent}>
                  <Ionicons name="sunny-outline" size={24} color={themeMode === 'light' ? theme.primary : theme.text} />
                  <Text style={[styles.formatButtonTitle, { color: theme.text, fontSize: 16 }]}>Light Mode</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.formatButton,
                  { backgroundColor: theme.background, borderColor: themeMode === 'dark' ? theme.primary : theme.border },
                  themeMode === 'dark' && { borderWidth: 2 }
                ]}
                onPress={() => {
                  setThemeMode('dark');
                  setShowThemeModal(false);
                }}
              >
                {themeMode === 'dark' && <Ionicons name="checkmark" size={24} color={theme.primary} />}
                <View style={styles.formatButtonContent}>
                  <Ionicons name="moon-outline" size={24} color={themeMode === 'dark' ? theme.primary : theme.text} />
                  <Text style={[styles.formatButtonTitle, { color: theme.text, fontSize: 16 }]}>Dark Mode</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.formatButton,
                  { backgroundColor: theme.background, borderColor: themeMode === 'auto' ? theme.primary : theme.border },
                  themeMode === 'auto' && { borderWidth: 2 }
                ]}
                onPress={() => {
                  setThemeMode('auto');
                  setShowThemeModal(false);
                }}
              >
                {themeMode === 'auto' && <Ionicons name="checkmark" size={24} color={theme.primary} />}
                <View style={styles.formatButtonContent}>
                  <Ionicons name="phone-portrait-outline" size={24} color={themeMode === 'auto' ? theme.primary : theme.text} />
                  <Text style={[styles.formatButtonTitle, { color: theme.text, fontSize: 16 }]}>System Default</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalCancelButton, { backgroundColor: theme.textSecondary, marginTop: 12 }]}
                onPress={() => setShowThemeModal(false)}
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
    padding: spacing.lg,
    paddingBottom: 90,
  },
  section: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  sectionTitle: {
    fontSize: typography.heading,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.lg,
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  settingLabel: {
    fontSize: typography.bodyLg,
  },
  settingDescription: {
    fontSize: typography.caption,
    marginTop: spacing.xs,
  },
  valueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  valueButtonText: {
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  inputLabel: {
    fontSize: typography.body,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    width: 80,
    textAlign: 'right',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  buttonText: {
    color: '#fff',
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
  },
  infoText: {
    fontSize: typography.body,
    marginBottom: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadows.modal,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: typography.body,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  formatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    gap: spacing.md,
  },
  formatButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  formatButtonText: {
    flex: 1,
  },
  formatButtonTitle: {
    fontSize: typography.title,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.xs,
  },
  formatButtonDescription: {
    fontSize: 13,
  },
  modalCancelButton: {
    borderRadius: radius.md,
    padding: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  modalCancelText: {
    color: '#fff',
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.semibold,
  },
});
