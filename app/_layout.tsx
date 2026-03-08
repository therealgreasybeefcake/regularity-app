import 'react-native-get-random-values';
import { useEffect } from 'react';
import { ActivityIndicator, View, LogBox } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { AppProvider, useApp } from '../context/AppContext';
import { AlertProvider } from '../components/CustomAlert';
import ErrorBoundary from '../components/ErrorBoundary';

LogBox.ignoreLogs([
  'The native view manager for module(ExpoLinearGradient)',
  'setLayoutAnimationEnabledExperimental is currently a no-op in the New Architecture',
]);

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAuthLoading } = useAuth();
  const { isLoading, hasSeenWelcome } = useApp();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isAuthLoading || isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';
    const onWelcome = segments[0] === 'welcome';

    if (!isAuthenticated) {
      // Not signed in — go to login (unless already there)
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (!hasSeenWelcome) {
      // Signed in but hasn't seen welcome
      if (!onWelcome) {
        router.replace('/welcome');
      }
    } else {
      // Signed in and has seen welcome — go to tabs
      if (!inAppGroup) {
        router.replace('/(app)/(tabs)');
      }
    }
  }, [isAuthenticated, isAuthLoading, isLoading, hasSeenWelcome, segments]);

  if (isAuthLoading || isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ ...Ionicons.font });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ErrorBoundary>
          <AuthProvider>
            <AppProvider>
              <AlertProvider>
                <NavigationGuard>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="welcome" />
                    <Stack.Screen name="(app)" />
                  </Stack>
                </NavigationGuard>
              </AlertProvider>
            </AppProvider>
          </AuthProvider>
        </ErrorBoundary>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
