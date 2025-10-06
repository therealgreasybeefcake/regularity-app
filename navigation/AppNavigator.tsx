import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { lightTheme, darkTheme } from '../constants/theme';

import TimerScreen from '../screens/TimerScreen';
import DriversScreen from '../screens/DriversScreen';
import StatsScreen from '../screens/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import WelcomeScreen from '../screens/WelcomeScreen';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  const { isDarkMode, hasSeenWelcome, setHasSeenWelcome } = useApp();
  const theme = isDarkMode ? darkTheme : lightTheme;

  const handleWelcomeComplete = () => {
    setHasSeenWelcome(true);
  };

  if (!hasSeenWelcome) {
    return <WelcomeScreen onComplete={handleWelcomeComplete} />;
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
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textSecondary,
          tabBarStyle: {
            backgroundColor: theme.card,
            borderTopColor: theme.border,
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
