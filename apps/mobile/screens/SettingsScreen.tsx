import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Linking,
  Platform,
  Pressable,
  Share,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useApp, ThemeMode, TeamRole } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../components/CustomAlert';
import { api, ApiError } from '../lib/api';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights, brandColors } from '../constants/theme';
import {
  Mono,
  Label,
  Card,
  Surface,
  Button,
  IconButton,
  Chip,
  TextField,
  SegmentedControl,
  Sheet,
  Divider,
  Collapsible,
} from '../components/ui';

// ---- Shared role helpers ----

type AssignableRole = 'admin' | 'member' | 'viewer';

const roleColor = (role: TeamRole, theme: typeof lightTheme): string => {
  switch (role) {
    case 'owner':
      return theme.warning as string;
    case 'admin':
      return theme.primary as string;
    case 'member':
      return theme.success as string;
    case 'viewer':
    default:
      return theme.textMuted as string;
  }
};

// ---- Team section types ----

interface TeamMember {
  id: string;
  userId: string;
  role: TeamRole;
  name: string;
  email: string;
  createdAt: string;
}
interface MembersResponse {
  members: TeamMember[];
  you: { userId: string; role: TeamRole };
}

/**
 * Shared-teams management. Lives inside the "Team" Collapsible; fetches its
 * own member list on first mount so the network call only fires when the
 * section is actually opened.
 */
function TeamSection({ theme }: { theme: typeof lightTheme }) {
  const {
    teams,
    memberships,
    userRole,
    activeServerTeamId,
    switchTeam,
    refreshMemberships,
    joinTeam,
  } = useApp();
  const { showAlert } = useAlert();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [you, setYou] = useState<{ userId: string; role: TeamRole } | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [inviteRole, setInviteRole] = useState<AssignableRole>('member');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [invite, setInvite] = useState<{ code: string; link: string } | null>(null);

  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const isOwner = userRole === 'owner';

  const activeMembership =
    memberships.find((m) => m.id === activeServerTeamId) ?? null;
  const teamName = activeMembership?.name ?? teams[0]?.name ?? 'My Team';

  const loadMembers = useCallback(async () => {
    if (!activeServerTeamId) return;
    setLoadingMembers(true);
    try {
      const res = await api.get<MembersResponse>(`/api/teams/${activeServerTeamId}/members`);
      setMembers(res.members);
      setYou(res.you);
    } catch (e) {
      console.warn('[team] loadMembers failed:', e);
    } finally {
      setLoadingMembers(false);
    }
  }, [activeServerTeamId]);

  // Fetch the roster once the section is mounted (i.e. opened) and we know the team.
  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // --- Role change (owner only) ---
  const cycleRole = async (member: TeamMember, next: AssignableRole) => {
    if (next === member.role) return;
    try {
      await api.patch(`/api/teams/${activeServerTeamId}/members/${member.id}`, { role: next });
      await loadMembers();
      await refreshMemberships();
    } catch (e) {
      showAlert({ title: 'Error', message: e instanceof Error ? e.message : 'Could not change role.' });
    }
  };

  // --- Remove member (owner only) ---
  const removeMember = (member: TeamMember) => {
    showAlert({
      title: 'Remove member',
      message: `Remove ${member.name || member.email} from ${teamName}?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.del(`/api/teams/${activeServerTeamId}/members/${member.id}`);
              await loadMembers();
              await refreshMemberships();
            } catch (e) {
              if (e instanceof ApiError && e.status === 409) {
                showAlert({ title: 'Cannot remove', message: 'This is the last owner of the team.' });
              } else {
                showAlert({ title: 'Error', message: e instanceof Error ? e.message : 'Could not remove member.' });
              }
            }
          },
        },
      ],
    });
  };

  // --- Create invite (owner only) ---
  const createInvite = async () => {
    if (!activeServerTeamId) return;
    setCreatingInvite(true);
    try {
      const res = await api.post<{ invite: { code: string }; token: string; link: string }>(
        `/api/teams/${activeServerTeamId}/invites`,
        { role: inviteRole },
      );
      setInvite({ code: res.invite.code, link: res.link });
    } catch (e) {
      showAlert({ title: 'Error', message: e instanceof Error ? e.message : 'Could not create invite.' });
    } finally {
      setCreatingInvite(false);
    }
  };

  const shareInvite = async () => {
    if (!invite) return;
    try {
      await Share.share({ message: invite.link });
    } catch {
      // user dismissed the share sheet — no-op
    }
  };

  // --- Join via code ---
  const submitJoin = async () => {
    const code = joinCode.trim();
    if (!code) return;
    setJoining(true);
    try {
      const res = await joinTeam({ code });
      if (res.ok) {
        setJoinCode('');
        showAlert({ title: 'Joined', message: `You joined ${res.teamName ?? 'the team'}.` });
      } else {
        showAlert({ title: 'Could not join', message: res.error ?? 'Invalid or expired code.' });
      }
    } finally {
      setJoining(false);
    }
  };

  // --- Leave team ---
  const leaveTeam = () => {
    const me = members.find((m) => m.userId === (you?.userId ?? ''));
    if (!me) {
      showAlert({ title: 'Not synced', message: 'Member list is still loading. Try again in a moment.' });
      return;
    }
    showAlert({
      title: 'Leave team',
      message: `Leave ${teamName}? You'll need a new invite to rejoin.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.del(`/api/teams/${activeServerTeamId}/members/${me.id}`);
              await refreshMemberships();
            } catch (e) {
              if (e instanceof ApiError && e.status === 409) {
                showAlert({
                  title: 'Transfer ownership first',
                  message: 'You are the last owner. Transfer ownership to another member before leaving.',
                });
              } else {
                showAlert({ title: 'Error', message: e instanceof Error ? e.message : 'Could not leave team.' });
              }
            }
          },
        },
      ],
    });
  };

  // --- Transfer ownership (owner only, nice-to-have) ---
  const transferOwnership = (member: TeamMember) => {
    showAlert({
      title: 'Transfer ownership',
      message: `Make ${member.name || member.email} the owner of ${teamName}? You will become an admin.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/api/teams/${activeServerTeamId}/transfer-ownership`, { memberId: member.id });
              await loadMembers();
              await refreshMemberships();
            } catch (e) {
              showAlert({ title: 'Error', message: e instanceof Error ? e.message : 'Could not transfer ownership.' });
            }
          },
        },
      ],
    });
  };

  if (!activeServerTeamId) {
    return (
      <Text style={[styles.rowSubtitle, { color: theme.textMuted }]}>
        Sign in / syncing… team sharing will appear once your account is synced.
      </Text>
    );
  }

  return (
    <View style={styles.teamWrap}>
      {/* Header — active team + your role */}
      <View style={styles.teamHeader}>
        <View style={styles.teamHeaderText}>
          <Label size={11} color={theme.textMuted}>Active team</Label>
          <Text style={[styles.teamName, { color: theme.text }]} numberOfLines={1}>{teamName}</Text>
        </View>
        {userRole ? <Chip label={userRole} color={roleColor(userRole, theme)} active uppercase size="sm" /> : null}
      </View>

      {/* Switch team */}
      {memberships.length > 1 && (
        <>
          <Divider faint />
          <Label size={11} color={theme.textMuted} style={styles.subLabel}>Switch team</Label>
          <View style={styles.list}>
            {memberships.map((m) => {
              const active = m.id === activeServerTeamId;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => switchTeam(m.id)}
                  style={({ pressed }) => [
                    styles.switchRow,
                    {
                      backgroundColor: active ? (theme.primaryMuted as string) : (theme.surface as string),
                      borderColor: active ? (theme.primary as string) : (theme.border as string),
                    },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text
                    style={[styles.switchName, { color: theme.text, fontWeight: active ? fontWeights.bold : fontWeights.medium }]}
                    numberOfLines={1}
                  >
                    {m.name}
                  </Text>
                  <Chip label={m.role} color={roleColor(m.role, theme)} active={active} uppercase size="sm" />
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Members */}
      <Divider faint />
      <Label size={11} color={theme.textMuted} style={styles.subLabel}>Members</Label>
      {loadingMembers && members.length === 0 ? (
        <ActivityIndicator color={theme.primary as string} style={{ marginVertical: spacing.md }} />
      ) : (
        <View style={styles.list}>
          {members.map((m) => {
            const isYou = you?.userId === m.userId;
            const canManage = isOwner && !isYou;
            return (
              <View key={m.id} style={[styles.memberRow, { borderColor: theme.border as string }]}>
                <View style={styles.memberTop}>
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>
                      {m.name || m.email}{isYou ? ' (you)' : ''}
                    </Text>
                    {m.email ? (
                      <Text style={[styles.memberEmail, { color: theme.textMuted }]} numberOfLines={1}>{m.email}</Text>
                    ) : null}
                  </View>
                  <View style={styles.memberActions}>
                    <Chip label={m.role} color={roleColor(m.role, theme)} active uppercase size="sm" />
                    {canManage && (
                      <IconButton
                        icon="person-remove-outline"
                        size={18}
                        color={theme.danger}
                        onPress={() => removeMember(m)}
                        accessibilityLabel={`Remove ${m.name || m.email}`}
                      />
                    )}
                  </View>
                </View>
                {canManage && m.role !== 'owner' && (
                  <View style={styles.memberControls}>
                    <SegmentedControl<AssignableRole>
                      size="sm"
                      options={[
                        { label: 'Admin', value: 'admin' },
                        { label: 'Member', value: 'member' },
                        { label: 'Viewer', value: 'viewer' },
                      ]}
                      value={m.role as AssignableRole}
                      onChange={(next) => cycleRole(m, next)}
                    />
                    {isOwner && (
                      <Button
                        title="Make owner"
                        variant="ghost"
                        size="sm"
                        icon="ribbon-outline"
                        onPress={() => transferOwnership(m)}
                        style={styles.transferBtn}
                      />
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Invite (owner only) */}
      {isOwner && (
        <>
          <Divider faint />
          <Label size={11} color={theme.textMuted} style={styles.subLabel}>Invite a teammate</Label>
          <SegmentedControl<AssignableRole>
            size="sm"
            options={[
              { label: 'Member', value: 'member' },
              { label: 'Admin', value: 'admin' },
              { label: 'Viewer', value: 'viewer' },
            ]}
            value={inviteRole}
            onChange={setInviteRole}
            style={styles.spacedTop}
          />
          <Button
            title="Create invite link"
            icon="link-outline"
            variant="secondary"
            loading={creatingInvite}
            onPress={createInvite}
            fullWidth
            style={styles.spacedTop}
          />
          {invite && (
            <Surface level="base" padding="md" radius="md" bordered style={styles.inviteBox}>
              <Label size={10} color={theme.textMuted}>Invite code</Label>
              <Mono size={typography.title} weight="bold" color={theme.text} style={{ marginTop: 2 }}>
                {invite.code}
              </Mono>
              <View style={styles.inviteActions}>
                <Button
                  title="Share link"
                  icon="share-outline"
                  size="sm"
                  onPress={shareInvite}
                  style={{ flex: 1 }}
                />
              </View>
            </Surface>
          )}
        </>
      )}

      {/* Join a team */}
      <Divider faint />
      <Label size={11} color={theme.textMuted} style={styles.subLabel}>Join a team</Label>
      <View style={styles.joinRow}>
        <TextField
          value={joinCode}
          onChangeText={setJoinCode}
          placeholder="Enter invite code"
          autoCapitalize="characters"
          autoCorrect={false}
          containerStyle={{ flex: 1 }}
        />
        <Button title="Join" loading={joining} onPress={submitJoin} />
      </View>

      {/* Leave team */}
      <Divider faint />
      <Button
        title="Leave team"
        icon="exit-outline"
        variant="secondary"
        onPress={leaveTeam}
        fullWidth
        textStyle={{ color: theme.danger as string }}
        style={styles.spacedTop}
      />
    </View>
  );
}

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
        {/* Team — shared teams management */}
        <Collapsible title="Team" defaultOpen={false} icon="people-outline">
          <TeamSection theme={theme} />
        </Collapsible>

        {/* Appearance */}
        <Collapsible title="Appearance" defaultOpen={false} icon="color-palette-outline">
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
        </Collapsible>

        {/* Lap Recording Controls */}
        {Platform.OS !== 'web' && (
          <Collapsible title="Lap Recording Controls" defaultOpen={false} icon="radio-button-on-outline">
            <ToggleRow
              title="Volume Button Recording"
              subtitle="Use volume buttons to record laps while the Timer screen is visible. Works best when app stays in foreground."
              value={audioSettings.volumeButtonsEnabled}
              onValueChange={(value) =>
                setAudioSettings({ ...audioSettings, volumeButtonsEnabled: value })
              }
            />
          </Collapsible>
        )}

        {/* Audio Warnings */}
        <Collapsible title="Audio Warnings" defaultOpen={false} icon="volume-high-outline">
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
        </Collapsible>

        {/* Driver Display Settings */}
        <Collapsible title="Driver Display" defaultOpen={false} icon="person-outline">
          <ToggleRow
            title="Show Penalty Laps"
            subtitle="Display penalty laps field in driver screen"
            value={audioSettings.showPenaltyLaps}
            onValueChange={(value) =>
              setAudioSettings({ ...audioSettings, showPenaltyLaps: value })
            }
          />
        </Collapsible>

        {/* Time Display Format */}
        <Collapsible title="Time Display Format" defaultOpen={false} icon="time-outline">
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
        </Collapsible>

        {/* Lap Recording Guard */}
        <Collapsible title="Lap Recording Guard" defaultOpen={false} icon="shield-checkmark-outline">
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
        </Collapsible>

        {/* Lap Type Values */}
        <Collapsible title="Lap Type Values" defaultOpen={false} icon="layers-outline">
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
        </Collapsible>

        {/* Data Management */}
        <Collapsible title="Data" defaultOpen={false} icon="server-outline">
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
        </Collapsible>

        {/* Support Development */}
        <Collapsible title="Support Development" defaultOpen={false} icon="heart-outline">
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
        </Collapsible>

        {/* Account */}
        <Collapsible title="Account" defaultOpen={false} icon="person-circle-outline">
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
        </Collapsible>

        {/* About */}
        <Collapsible title="About" defaultOpen={false} icon="information-circle-outline">
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
        </Collapsible>
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

  // --- Team section ---
  teamWrap: {
    gap: spacing.sm,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  teamHeaderText: {
    flex: 1,
  },
  teamName: {
    fontSize: typography.title,
    fontWeight: fontWeights.bold,
    marginTop: 2,
  },
  subLabel: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  list: {
    gap: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  switchName: {
    flex: 1,
    fontSize: typography.body,
  },
  memberRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  memberTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  memberEmail: {
    fontSize: typography.caption,
    marginTop: 1,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  memberControls: {
    gap: spacing.sm,
  },
  transferBtn: {
    alignSelf: 'flex-start',
  },
  spacedTop: {
    marginTop: spacing.sm,
  },
  inviteBox: {
    marginTop: spacing.sm,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
