import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
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
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, brandColors } from '../constants/theme';
import { Mono, Label, Card, Surface, Button, TextField, SegmentedControl, Sheet, Divider } from '../components/ui';

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
  const syncColor = syncStatus === 'synced' ? theme.success
    : syncStatus === 'syncing' ? theme.info
    : syncStatus === 'error' ? theme.danger
    : theme.textMuted;
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

  // --- Pit Wall presentation helpers ---
  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <Label size={13} style={styles.sectionTitle}>{children}</Label>
  );

  // Toggle row: title (+ optional subtitle) on the left, Switch on the right.
  const ToggleRow = ({
    title,
    subtitle,
    value,
    onValueChange,
  }: {
    title: string;
    subtitle?: string;
    value: boolean;
    onValueChange: (v: boolean) => void;
  }) => (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.border as string, true: theme.primary as string }}
      />
    </View>
  );

  // Numeric input row using a mono TextField pinned to the right.
  const NumberRow = ({
    label,
    value,
    onChangeText,
    keyboardType = 'number-pad',
  }: {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    keyboardType?: 'number-pad' | 'decimal-pad';
  }) => (
    <View style={styles.row}>
      <Text style={[styles.rowTitle, { color: theme.text, flex: 1, marginRight: spacing.md }]}>{label}</Text>
      <TextField
        mono
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        containerStyle={styles.numberField}
        style={styles.numberInput}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Appearance */}
        <SectionTitle>Appearance</SectionTitle>
        <Card padding="lg" style={styles.card}>
          <Text style={[styles.rowSubtitle, { color: theme.textSecondary, marginBottom: spacing.md }]}>
            Choose how the app looks
          </Text>
          <SegmentedControl<ThemeMode>
            options={[
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' },
              { label: 'Auto', value: 'auto' },
            ]}
            value={themeMode}
            onChange={setThemeMode}
          />
        </Card>

        {/* Lap Recording Controls */}
        {Platform.OS !== 'web' && (
          <>
            <SectionTitle>Lap Recording Controls</SectionTitle>
            <Card padding="lg" style={styles.card}>
              <ToggleRow
                title="Volume Button Recording"
                subtitle="Use volume buttons to record laps while the Timer screen is visible. Works best when app stays in foreground."
                value={audioSettings.volumeButtonsEnabled}
                onValueChange={(value) =>
                  setAudioSettings({ ...audioSettings, volumeButtonsEnabled: value })
                }
              />
            </Card>
          </>
        )}

        {/* Audio Warnings */}
        <SectionTitle>Audio Warnings</SectionTitle>
        <Card padding="lg" style={styles.card}>
          <ToggleRow
            title="Enable Audio"
            value={audioSettings.enabled}
            onValueChange={(value) => setAudioSettings({ ...audioSettings, enabled: value })}
          />
          <Divider faint />
          <ToggleRow
            title="Before Target (Single Beep)"
            value={audioSettings.beforeTargetEnabled}
            onValueChange={(value) =>
              setAudioSettings({ ...audioSettings, beforeTargetEnabled: value })
            }
          />
          <Divider faint />
          <NumberRow
            label="Seconds before target"
            value={audioSettings.beforeTargetTime.toString()}
            onChangeText={(text) =>
              setAudioSettings({
                ...audioSettings,
                beforeTargetTime: parseInt(text) || 10,
              })
            }
          />
          <Divider faint />
          <ToggleRow
            title="After Lap-Start (Double Beep)"
            value={audioSettings.afterLapStartEnabled}
            onValueChange={(value) =>
              setAudioSettings({ ...audioSettings, afterLapStartEnabled: value })
            }
          />
          <Divider faint />
          <NumberRow
            label="Seconds after lap start"
            value={audioSettings.afterLapStart.toString()}
            onChangeText={(text) =>
              setAudioSettings({
                ...audioSettings,
                afterLapStart: parseInt(text) || 15,
              })
            }
          />
        </Card>

        {/* Driver Display Settings */}
        <SectionTitle>Driver Display</SectionTitle>
        <Card padding="lg" style={styles.card}>
          <ToggleRow
            title="Show Penalty Laps"
            subtitle="Display penalty laps field in driver screen"
            value={audioSettings.showPenaltyLaps}
            onValueChange={(value) =>
              setAudioSettings({ ...audioSettings, showPenaltyLaps: value })
            }
          />
        </Card>

        {/* Time Display Format */}
        <SectionTitle>Time Display Format</SectionTitle>
        <Card padding="lg" style={styles.card}>
          <Text style={[styles.rowSubtitle, { color: theme.textSecondary, marginBottom: spacing.md }]}>
            {audioSettings.timeFormat === 'seconds' ? 'Display as: 105s' : 'Display as: 1:45.000'}
          </Text>
          <SegmentedControl
            options={[
              { label: 'Seconds', value: 'seconds' },
              { label: 'MM:SS.mmm', value: 'mmssmmm' },
            ]}
            value={audioSettings.timeFormat}
            onChange={(value) =>
              setAudioSettings({ ...audioSettings, timeFormat: value as 'seconds' | 'mmssmmm' })
            }
          />
        </Card>

        {/* Lap Recording Guard */}
        <SectionTitle>Lap Recording Guard</SectionTitle>
        <Card padding="lg" style={styles.card}>
          <Text style={[styles.rowSubtitle, { color: theme.textSecondary, marginBottom: spacing.sm }]}>
            Prevent accidental lap recording outside target time range
          </Text>
          <ToggleRow
            title="Enable Guard"
            value={audioSettings.lapGuardEnabled}
            onValueChange={(value) =>
              setAudioSettings({ ...audioSettings, lapGuardEnabled: value })
            }
          />
          <Divider faint />
          <NumberRow
            label="+/- seconds from target"
            value={audioSettings.lapGuardRange.toString()}
            onChangeText={(text) =>
              setAudioSettings({
                ...audioSettings,
                lapGuardRange: parseInt(text) || 10,
              })
            }
          />
          <Divider faint />
          <NumberRow
            label={`Safety car threshold\n(seconds over target)`}
            value={audioSettings.lapGuardSafetyCarThreshold.toString()}
            onChangeText={(text) =>
              setAudioSettings({
                ...audioSettings,
                lapGuardSafetyCarThreshold: parseInt(text) || 30,
              })
            }
          />
          {audioSettings.lapGuardEnabled && (
            <>
              <Divider faint />
              <Text style={[styles.rowSubtitle, { color: theme.textSecondary, marginTop: spacing.sm }]}>
                Normal laps: within ±{audioSettings.lapGuardRange}s of target{'\n'}
                Safety car: automatically allowed if {audioSettings.lapGuardSafetyCarThreshold}s+ over target
              </Text>
            </>
          )}
        </Card>

        {/* Lap Type Values */}
        <SectionTitle>Lap Type Values</SectionTitle>
        <Card padding="lg" style={styles.card}>
          {Object.entries(lapTypeValues).map(([key, value], idx, arr) => (
            <React.Fragment key={key}>
              <NumberRow
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                value={value.toString()}
                keyboardType="decimal-pad"
                onChangeText={(text) =>
                  setLapTypeValues({
                    ...lapTypeValues,
                    [key]: parseFloat(text) || 0,
                  })
                }
              />
              {idx < arr.length - 1 && <Divider faint />}
            </React.Fragment>
          ))}
        </Card>

        {/* Data Management */}
        <SectionTitle>Data</SectionTitle>
        <Card padding="lg" style={styles.card}>
          <Button
            title="Export Data"
            icon="download-outline"
            onPress={() => setShowExportModal(true)}
            fullWidth
            style={styles.cardBtn}
          />
          <Button
            title="Import Data"
            icon="cloud-upload-outline"
            variant="secondary"
            onPress={() => setShowImportModal(true)}
            fullWidth
            style={styles.cardBtn}
          />
          <Button
            title="Clear All Data"
            icon="trash-outline"
            variant="danger"
            onPress={clearAllData}
            fullWidth
          />
        </Card>

        {/* Support Development */}
        <SectionTitle>Support Development</SectionTitle>
        <Card padding="lg" style={styles.card}>
          <Text style={[styles.rowSubtitle, { color: theme.textSecondary, marginBottom: spacing.md }]}>
            This app is free to use. If you find it helpful, consider supporting its development!
          </Text>
          <Button
            title="Buy Me a Coffee"
            icon="cafe"
            onPress={() => Linking.openURL('https://buymeacoffee.com/greasybeefcake')}
            fullWidth
            style={[styles.coffeeBtn, { backgroundColor: brandColors.coffee }]}
            textStyle={{ color: '#000' }}
          />
        </Card>

        {/* Account */}
        <SectionTitle>Account</SectionTitle>
        <Card padding="lg" style={styles.card}>
          <View style={styles.accountRow}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{user}</Text>
              <View style={styles.syncRow}>
                <View style={[styles.syncDot, { backgroundColor: syncColor as string }]} />
                <Ionicons name={syncIcon} size={13} color={syncColor as string} />
                <Label size={11} color={syncColor}>{syncLabel}</Label>
              </View>
            </View>
          </View>
          <Divider faint />
          <Button
            title="Sign Out"
            icon="log-out-outline"
            variant="danger"
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
            fullWidth
            style={styles.accountBtn}
          />
        </Card>

        {/* About */}
        <SectionTitle>About</SectionTitle>
        <Card padding="lg" style={styles.card}>
          <Button
            title="Show Welcome Guide"
            icon="help-circle-outline"
            variant="secondary"
            onPress={() => setHasSeenWelcome(false)}
            fullWidth
            style={styles.cardBtn}
          />
          <View style={styles.aboutMeta}>
            <Text style={[styles.aboutText, { color: theme.textSecondary }]}>Regularity Race Timer</Text>
            <Mono size={12} color={theme.textMuted}>Version 1.0.0</Mono>
          </View>
        </Card>
      </ScrollView>

      {/* Export Format Sheet */}
      <Sheet
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Format"
        scroll={false}
      >
        <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
          Choose the format for your data export
        </Text>
        <View style={styles.formatList}>
          <Surface
            level="base"
            padding="lg"
            radius="md"
            onTouchEnd={() => exportData('json')}
            style={styles.formatRow}
          >
            <Ionicons name="code-outline" size={28} color={theme.primary as string} />
            <View style={styles.formatText}>
              <Text style={[styles.formatTitle, { color: theme.text }]}>JSON</Text>
              <Text style={[styles.formatDesc, { color: theme.textSecondary }]}>
                Complete data structure for backup and import
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted as string} />
          </Surface>
          <Surface
            level="base"
            padding="lg"
            radius="md"
            onTouchEnd={() => exportData('csv')}
            style={styles.formatRow}
          >
            <Ionicons name="grid-outline" size={28} color={theme.primary as string} />
            <View style={styles.formatText}>
              <Text style={[styles.formatTitle, { color: theme.text }]}>CSV</Text>
              <Text style={[styles.formatDesc, { color: theme.textSecondary }]}>
                Spreadsheet format for analysis
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted as string} />
          </Surface>
        </View>
      </Sheet>

      {/* Import Format Sheet */}
      <Sheet
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Format"
        scroll={false}
      >
        <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
          Choose the format of your data file
        </Text>
        <View style={styles.formatList}>
          <Surface
            level="base"
            padding="lg"
            radius="md"
            onTouchEnd={() => importData('json')}
            style={styles.formatRow}
          >
            <Ionicons name="code-outline" size={28} color={theme.primary as string} />
            <View style={styles.formatText}>
              <Text style={[styles.formatTitle, { color: theme.text }]}>JSON</Text>
              <Text style={[styles.formatDesc, { color: theme.textSecondary }]}>
                Import from JSON backup file
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted as string} />
          </Surface>
          <Surface
            level="base"
            padding="lg"
            radius="md"
            onTouchEnd={() => importData('csv')}
            style={styles.formatRow}
          >
            <Ionicons name="grid-outline" size={28} color={theme.primary as string} />
            <View style={styles.formatText}>
              <Text style={[styles.formatTitle, { color: theme.text }]}>CSV</Text>
              <Text style={[styles.formatDesc, { color: theme.textSecondary }]}>
                Import from CSV spreadsheet
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted as string} />
          </Surface>
        </View>
      </Sheet>

      {/* Theme Selection Sheet (kept for compatibility; primary control is the segmented control above) */}
      <Sheet
        visible={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        title="Select Appearance"
        scroll={false}
        footer={
          <Button title="Cancel" variant="secondary" onPress={() => setShowThemeModal(false)} fullWidth />
        }
      >
        <View style={styles.formatList}>
          {([
            { mode: 'light' as ThemeMode, label: 'Light Mode', icon: 'sunny-outline' as const },
            { mode: 'dark' as ThemeMode, label: 'Dark Mode', icon: 'moon-outline' as const },
            { mode: 'auto' as ThemeMode, label: 'System Default', icon: 'phone-portrait-outline' as const },
          ]).map(({ mode, label, icon }) => {
            const active = themeMode === mode;
            return (
              <Surface
                key={mode}
                level="base"
                padding="lg"
                radius="md"
                bordered
                onTouchEnd={() => {
                  setThemeMode(mode);
                  setShowThemeModal(false);
                }}
                style={[styles.formatRow, active && { borderColor: theme.primary as string, borderWidth: 1.5 }]}
              >
                <Ionicons name={icon} size={22} color={(active ? theme.primary : theme.text) as string} />
                <Text style={[styles.formatTitle, { color: theme.text, flex: 1 }]}>{label}</Text>
                {active && <Ionicons name="checkmark" size={22} color={theme.primary as string} />}
              </Surface>
            );
          })}
        </View>
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
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  sectionTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.medium,
  },
  rowSubtitle: {
    fontSize: typography.caption,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  numberField: {
    width: 96,
  },
  numberInput: {
    textAlign: 'right',
  },
  cardBtn: {
    marginBottom: spacing.md,
  },
  coffeeBtn: {
    borderWidth: 0,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  accountBtn: {
    marginTop: spacing.md,
  },
  aboutMeta: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  aboutText: {
    fontSize: typography.body,
  },
  sheetSubtitle: {
    fontSize: typography.body,
    marginBottom: spacing.lg,
  },
  formatList: {
    gap: spacing.md,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  formatText: {
    flex: 1,
  },
  formatTitle: {
    fontSize: typography.title,
    fontWeight: fontWeights.semibold,
  },
  formatDesc: {
    fontSize: typography.caption,
    marginTop: 2,
  },
});
