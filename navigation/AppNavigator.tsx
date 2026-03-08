import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme, glass, spacing, radius, typography, fontWeights, shadows } from '../constants/theme';

import TimerScreen from '../screens/TimerScreen';
import DriversScreen from '../screens/DriversScreen';
import StatsScreen from '../screens/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import WelcomeScreen from '../screens/WelcomeScreen';

const Tab = createBottomTabNavigator();
const isWeb = Platform.OS === 'web';

type WebTab = 'Timer' | 'Drivers' | 'Stats' | 'Settings';

const WEB_TABS: { key: WebTab; icon: keyof typeof Ionicons.glyphMap; iconFocused: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'Timer', icon: 'timer-outline', iconFocused: 'timer' },
  { key: 'Drivers', icon: 'people-outline', iconFocused: 'people' },
  { key: 'Stats', icon: 'stats-chart-outline', iconFocused: 'stats-chart' },
  { key: 'Settings', icon: 'settings-outline', iconFocused: 'settings' },
];

function WebNavigator() {
  const { isDarkMode } = useApp();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const [activeTab, setActiveTab] = useState<WebTab>('Stats');

  const renderScreen = () => {
    switch (activeTab) {
      case 'Timer': return <TimerScreen />;
      case 'Drivers': return <DriversScreen />;
      case 'Stats': return <StatsScreen />;
      case 'Settings': return <SettingsScreen />;
    }
  };

  const sidebarBg = isDarkMode ? '#0a0f1a' : '#f0f2f5';
  const sidebarBorder = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';

  return (
    <View style={webStyles.root}>
      {/* Sidebar */}
      <View style={[webStyles.sidebar, { backgroundColor: sidebarBg, borderRightColor: sidebarBorder }]}>
        <View style={webStyles.sidebarHeader}>
          <Ionicons name="flag" size={22} color={theme.primary} />
          <Text style={[webStyles.sidebarTitle, { color: theme.text }]}>Regularity</Text>
        </View>

        <View style={webStyles.navItems}>
          {WEB_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  webStyles.navItem,
                  isActive && { backgroundColor: isDarkMode ? 'rgba(59,130,246,0.12)' : 'rgba(30,64,175,0.08)' },
                ]}
                onPress={() => setActiveTab(tab.key)}
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
                  {tab.key}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Main content */}
      <View style={[webStyles.content, { backgroundColor: theme.background }]}>
        {renderScreen()}
      </View>
    </View>
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
  content: {
    flex: 1,
  },
});

export default function AppNavigator() {
  const { isDarkMode, hasSeenWelcome, setHasSeenWelcome } = useApp();
  const theme = isDarkMode ? darkTheme : lightTheme;

  const handleWelcomeComplete = () => {
    setHasSeenWelcome(true);
  };

  if (!hasSeenWelcome) {
    return <WelcomeScreen onComplete={handleWelcomeComplete} />;
  }

  if (isWeb) {
    return <WebNavigator />;
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'timer-outline';

            if (route.name === 'Timer') {
              iconName = focused ? 'timer' : 'timer-outline';
            } else if (route.name === 'Drivers') {
              iconName = focused ? 'people' : 'people-outline';
            } else if (route.name === 'Stats') {
              iconName = focused ? 'stats-chart' : 'stats-chart-outline';
            } else if (route.name === 'Settings') {
              iconName = focused ? 'settings' : 'settings-outline';
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: theme.primary as string,
          tabBarInactiveTintColor: theme.textSecondary as string,
          tabBarBackground: () =>
            Platform.OS === 'ios' ? (
              <BlurView
                tint={isDarkMode ? 'dark' : 'light'}
                intensity={glass.blurIntensity}
                style={StyleSheet.absoluteFill}
              />
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
        <Tab.Screen name="Timer" component={TimerScreen} />
        <Tab.Screen name="Drivers" component={DriversScreen} />
        <Tab.Screen name="Stats" component={StatsScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
