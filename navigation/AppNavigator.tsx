import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { useWalkthroughContext } from '../context/WalkthroughContext';
import { lightTheme, darkTheme } from '../constants/theme';
import GuidedWalkthrough from '../components/GuidedWalkthrough';

import TimerScreen from '../screens/TimerScreen';
import DriversScreen from '../screens/DriversScreen';
import StatsScreen from '../screens/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

function CustomTabBar({ state, descriptors, navigation }: any) {
  const { isDarkMode } = useApp();
  const { setElementPosition } = useWalkthroughContext();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const settingsTabRef = useRef<any>(null);

  // Measure Settings tab position
  React.useEffect(() => {
    const measureSettingsTab = () => {
      if (settingsTabRef.current) {
        settingsTabRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
          setElementPosition('settingsTab', { x, y, width, height });
        });
      }
    };

    // Delay measurement to ensure element is rendered
    const timer = setTimeout(measureSettingsTab, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flexDirection: 'row', backgroundColor: theme.card, borderTopColor: theme.border, borderTopWidth: 1 }}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const label = route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        let iconName: keyof typeof Ionicons.glyphMap = 'timer-outline';
        if (route.name === 'Timer') {
          iconName = isFocused ? 'timer' : 'timer-outline';
        } else if (route.name === 'Drivers') {
          iconName = isFocused ? 'people' : 'people-outline';
        } else if (route.name === 'Stats') {
          iconName = isFocused ? 'stats-chart' : 'stats-chart-outline';
        } else if (route.name === 'Settings') {
          iconName = isFocused ? 'settings' : 'settings-outline';
        }

        const isSettingsTab = route.name === 'Settings';

        return (
          <TouchableOpacity
            key={route.key}
            ref={isSettingsTab ? settingsTabRef : null}
            onPress={onPress}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}
          >
            <Ionicons
              name={iconName}
              size={24}
              color={isFocused ? theme.primary : theme.textSecondary}
            />
            <Text style={{ fontSize: 12, color: isFocused ? theme.primary : theme.textSecondary, marginTop: 4 }}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AppNavigator() {
  const { isDarkMode, hasSeenWalkthrough, setHasSeenWalkthrough, teams, setTeams, activeTeam } = useApp();
  const theme = isDarkMode ? darkTheme : lightTheme;
  const navigationRef = useRef<any>(null);

  return (
    <>
      <NavigationContainer ref={navigationRef}>
        <Tab.Navigator
          tabBar={(props) => <CustomTabBar {...props} />}
          screenOptions={{
            headerShown: false,
          }}
        >
          <Tab.Screen name="Timer" component={TimerScreen} />
          <Tab.Screen name="Drivers" component={DriversScreen} />
          <Tab.Screen name="Stats" component={StatsScreen} />
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
      <GuidedWalkthrough
        visible={!hasSeenWalkthrough}
        onComplete={() => setHasSeenWalkthrough(true)}
        isDarkMode={isDarkMode}
        navigation={navigationRef.current}
        teams={teams}
        setTeams={setTeams}
        activeTeam={activeTeam}
      />
    </>
  );
}
