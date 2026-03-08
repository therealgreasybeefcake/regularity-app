import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

interface WebContainerProps {
  children: React.ReactNode;
  isDarkMode?: boolean;
}

/**
 * On web, provides full-width layout with proper background.
 * No-op on native.
 */
export default function WebContainer({ children, isDarkMode = false }: WebContainerProps) {
  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  const bgColor = isDarkMode ? '#0c1220' : '#f8fafc';

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // @ts-ignore – web-only
    minHeight: '100vh',
  },
});
