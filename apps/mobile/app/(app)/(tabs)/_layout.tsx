import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Tabs, Slot, useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useAlert } from '../../../components/CustomAlert';
import { api } from '../../../lib/api';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights } from '../../../constants/theme';

const isWeb = Platform.OS === 'web';

type WebTab = { href: string; label: string; icon: keyof typeof Ionicons.glyphMap; iconFocused: keyof typeof Ionicons.glyphMap; matchSegment: string };

// The website is view-only: just Stats and the live view. Timer, Drivers and
// Settings are phone-only (their routes redirect to Stats on web), so nobody can
// change timing or the roster from a browser. Team switching and sign-out live
// in the sidebar.
const WEB_TABS: WebTab[] = [
  { href: '/(app)/(tabs)/stats', label: 'Stats', icon: 'stats-chart-outline', iconFocused: 'stats-chart', matchSegment: 'stats' },
];

function WebSidebarLayout() {
  const { isDarkMode, memberships, activeServerTeamId, switchTeam } = useApp();
  const { user, signOut } = useAuth();
  const { showAlert } = useAlert();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const router = useRouter();
  const pathname = usePathname();

  // Poll for this account's current live session (e.g. started on mobile) so
  // the same user can jump to it on web without sharing a link.
  const [liveToken, setLiveToken] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await api.get<{ live: { publicToken: string } | null }>('/api/teams/me/live');
        if (active) setLiveToken(res.live?.publicToken ?? null);
      } catch {
        /* ignore */
      }
    };
    check();
    const t = setInterval(check, 8000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const sidebarBg = isDarkMode ? '#0a0f1a' : '#f0f2f5';
  const sidebarBorder = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';

  const isTabActive = (tab: WebTab) => pathname.includes(tab.matchSegment);

  const confirmSignOut = () =>
    showAlert({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out?',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ],
    });

  // Phone-width browser: a 200px sidebar would take half the screen, so use a
  // slim top bar instead — brand, the live session, and an account menu.
  const { width } = useWindowDimensions();
  if (width < WEB_COMPACT_WIDTH) {
    const activeTeam = memberships.find((m) => m.id === activeServerTeamId);
    const openAccountMenu = () =>
      showAlert({
        title: activeTeam?.name ?? 'Account',
        message: user ?? undefined,
        buttons: [
          ...memberships
            .filter((m) => m.id !== activeServerTeamId)
            .map((m) => ({ text: `Switch to ${m.name}`, onPress: () => void switchTeam(m.id) })),
          { text: 'Sign Out', style: 'destructive' as const, onPress: confirmSignOut },
          { text: 'Cancel', style: 'cancel' as const },
        ],
      });
    return (
      <View style={[webStyles.compactRoot, { backgroundColor: theme.background }]}>
        <View style={[webStyles.topBar, { backgroundColor: sidebarBg, borderBottomColor: sidebarBorder }]}>
          <Ionicons name="flag" size={20} color={theme.primary} />
          <Text style={[webStyles.topBarTitle, { color: theme.text }]} numberOfLines={1}>
            {activeTeam?.name ?? 'Regularity'}
          </Text>
          <TouchableOpacity
            style={[webStyles.topBarLive, { borderColor: liveToken ? '#ef4444' : sidebarBorder }, !!liveToken && { backgroundColor: 'rgba(239,68,68,0.12)' }]}
            onPress={() => {
              if (liveToken) router.push(`/live/${liveToken}` as any);
            }}
            disabled={!liveToken}
            activeOpacity={0.7}
            accessibilityLabel={liveToken ? 'Open the live session' : 'No live session'}
          >
            {liveToken ? <View style={webStyles.liveDot} /> : <Ionicons name="radio-outline" size={16} color={theme.textSecondary as string} />}
            <Text style={[webStyles.topBarLiveText, { color: liveToken ? '#ef4444' : theme.textSecondary }]}>
              {liveToken ? 'Live' : 'No live'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openAccountMenu} style={webStyles.topBarIcon} accessibilityLabel="Account and team" activeOpacity={0.7}>
            <Ionicons name="person-circle-outline" size={26} color={theme.textSecondary as string} />
          </TouchableOpacity>
        </View>
        <View style={webStyles.compactContent}>
          <Slot />
        </View>
      </View>
    );
  }

  return (
    <View style={webStyles.root}>
      <View style={[webStyles.sidebar, { backgroundColor: sidebarBg, borderRightColor: sidebarBorder }]}>
        <View style={webStyles.sidebarHeader}>
          <Ionicons name="flag" size={22} color={theme.primary} />
          <Text style={[webStyles.sidebarTitle, { color: theme.text }]}>Regularity</Text>
        </View>

        <View style={webStyles.navItems}>
          {WEB_TABS.map((tab) => {
            const isActive = isTabActive(tab);
            return (
              <TouchableOpacity
                key={tab.href}
                style={[
                  webStyles.navItem,
                  isActive && { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.12)' : 'rgba(30,64,175,0.08)' },
                ]}
                onPress={() => router.push(tab.href as any)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isActive ? tab.iconFocused : tab.icon}
                  size={20}
                  color={isActive ? (theme.primary as string) : (theme.textSecondary as string)}
                />
                <Text
                  style={[
                    webStyles.navLabel,
                    { color: isActive ? theme.primary : theme.textSecondary },
                    isActive && { fontWeight: fontWeights.semibold },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[webStyles.navItem, !!liveToken && { backgroundColor: 'rgba(239,68,68,0.12)' }]}
            onPress={() => {
              if (liveToken) router.push(`/live/${liveToken}` as any);
            }}
            activeOpacity={liveToken ? 0.7 : 1}
            disabled={!liveToken}
          >
            <View style={webStyles.liveIcon}>
              {liveToken ? (
                <View style={webStyles.liveDot} />
              ) : (
                <Ionicons name="radio-outline" size={20} color={theme.textSecondary as string} />
              )}
            </View>
            <Text
              style={[
                webStyles.navLabel,
                { color: liveToken ? '#ef4444' : theme.textSecondary },
                !!liveToken && { fontWeight: fontWeights.semibold },
              ]}
            >
              {liveToken ? 'Live now' : 'No live session'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[webStyles.footer, { borderTopColor: sidebarBorder }]}>
          {memberships.length > 1 ? (
            <>
              <Text style={[webStyles.footerLabel, { color: theme.textMuted }]}>TEAM</Text>
              {memberships.map((m) => {
                const active = m.id === activeServerTeamId;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[webStyles.teamItem, active && { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.12)' : 'rgba(30,64,175,0.08)' }]}
                    onPress={() => {
                      if (!active) void switchTeam(m.id);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[webStyles.teamName, { color: active ? theme.primary : theme.textSecondary }, active && { fontWeight: fontWeights.semibold }]}
                      numberOfLines={1}
                    >
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </>
          ) : memberships.length === 1 ? (
            <>
              <Text style={[webStyles.footerLabel, { color: theme.textMuted }]}>TEAM</Text>
              <Text style={[webStyles.teamName, webStyles.teamSolo, { color: theme.text }]} numberOfLines={1}>
                {memberships[0].name}
              </Text>
            </>
          ) : null}
          {user ? (
            <Text style={[webStyles.userEmail, { color: theme.textMuted }]} numberOfLines={1}>
              {user}
            </Text>
          ) : null}
          <TouchableOpacity style={webStyles.navItem} onPress={confirmSignOut} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={20} color={theme.textSecondary as string} />
            <Text style={[webStyles.navLabel, { color: theme.textSecondary }]}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[webStyles.content, { backgroundColor: theme.background }]}>
        <View style={webStyles.contentInner}>
          <Slot />
        </View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { isDarkMode } = useApp();
  const theme = isDarkMode ? darkTheme : lightTheme;
  // A phone in landscape is short: the Timer drops the tab bar there and its
  // ••• menu carries Drivers / Stats / Settings instead (TimerScreen). Other
  // screens keep it, so there's always a way back to the Timer.
  const { width, height } = useWindowDimensions();
  const phoneLandscape = !isWeb && width > height && height < 600;

  if (isWeb) {
    return <WebSidebarLayout />;
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'timer-outline';

          if (route.name === 'index') {
            iconName = focused ? 'timer' : 'timer-outline';
          } else if (route.name === 'drivers') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'stats') {
            iconName = focused ? 'stats-chart' : 'stats-chart-outline';
          } else if (route.name === 'settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.primary as string,
        tabBarInactiveTintColor: theme.textSecondary as string,
        // Solid themed bar with a hairline top border. Drawn explicitly (not via
        // GlassView) because the system glass effect follows the OS appearance,
        // not the in-app dark/light override — which made it render light in dark mode.
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDarkMode ? 'rgba(9,13,21,0.96)' : 'rgba(255,255,255,0.96)',
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border as string,
              },
            ]}
          />
        ),
        tabBarStyle: phoneLandscape && route.name === 'index'
          ? { display: 'none' }
          : {
              position: 'absolute',
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              borderTopColor: 'transparent',
              elevation: 0,
            },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: fontWeights.semibold,
        },
        headerShown: false,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Timer' }} />
      <Tabs.Screen name="drivers" options={{ title: 'Drivers' }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

// Below this browser width the sidebar becomes a top bar.
const WEB_COMPACT_WIDTH = 768;

const webStyles = StyleSheet.create({
  compactRoot: {
    flex: 1,
    // @ts-ignore
    minHeight: '100vh',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  topBarTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: fontWeights.bold,
  },
  topBarLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  topBarLiveText: { fontSize: 13, fontWeight: fontWeights.semibold },
  topBarIcon: { padding: 2 },
  compactContent: { flex: 1, width: '100%' },
  root: {
    flex: 1,
    flexDirection: 'row',
    // @ts-ignore
    minHeight: '100vh',
  },
  sidebar: {
    width: 200,
    borderRightWidth: 1,
    paddingTop: 24,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  sidebarTitle: {
    fontSize: 17,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.3,
  },
  navItems: {
    gap: 2,
    paddingHorizontal: 10,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  navLabel: {
    fontSize: typography.body,
    fontWeight: fontWeights.medium,
  },
  footer: {
    marginTop: 'auto',
    borderTopWidth: 1,
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 10,
    gap: 2,
  },
  footerLabel: {
    fontSize: 11,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.2,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  teamItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  teamName: {
    fontSize: typography.body,
    fontWeight: fontWeights.medium,
  },
  teamSolo: { paddingHorizontal: 12, paddingBottom: 6 },
  userEmail: {
    fontSize: typography.caption,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
  },
  liveIcon: { width: 20, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  contentInner: {
    flex: 1,
    width: '100%',
    // Wide enough for the data-dense Stats/Drivers grids to use the full container.
    // Text-heavy screens (Timer/Settings) self-constrain to a narrower readable column.
    maxWidth: 1280,
  },
});
