import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Tabs, Slot, useRouter, usePathname } from 'expo-router';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../../context/AppContext';
import { api } from '../../../lib/api';
import { lightTheme, darkTheme, spacing, radius, typography, fontWeights } from '../../../constants/theme';

const hasGlass = isGlassEffectAPIAvailable();

const isWeb = Platform.OS === 'web';

type WebTab = { href: string; label: string; icon: keyof typeof Ionicons.glyphMap; iconFocused: keyof typeof Ionicons.glyphMap; matchSegment: string };

const WEB_TABS: WebTab[] = [
  { href: '/(app)/(tabs)', label: 'Timer', icon: 'timer-outline', iconFocused: 'timer', matchSegment: '(tabs)' },
  { href: '/(app)/(tabs)/drivers', label: 'Drivers', icon: 'people-outline', iconFocused: 'people', matchSegment: 'drivers' },
  { href: '/(app)/(tabs)/stats', label: 'Stats', icon: 'stats-chart-outline', iconFocused: 'stats-chart', matchSegment: 'stats' },
  { href: '/(app)/(tabs)/settings', label: 'Settings', icon: 'settings-outline', iconFocused: 'settings', matchSegment: 'settings' },
];

function WebSidebarLayout() {
  const { isDarkMode } = useApp();
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

  const isTabActive = (tab: WebTab) => {
    if (tab.matchSegment === '(tabs)') {
      // Timer is the index route — active when path is exactly / or /(tabs)
      return pathname === '/' || pathname === '/(app)/(tabs)' || pathname === '/(app)/(tabs)/index';
    }
    return pathname.includes(tab.matchSegment);
  };

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
        tabBarBackground: () =>
          hasGlass ? (
            <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="regular" />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDarkMode
                    ? 'rgba(12,18,32,0.92)'
                    : 'rgba(248,250,252,0.92)',
                },
              ]}
            />
          ),
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopColor: 'transparent',
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
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

const webStyles = StyleSheet.create({
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
  liveIcon: { width: 20, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  contentInner: {
    flex: 1,
    width: '100%',
    maxWidth: 860,
  },
});
