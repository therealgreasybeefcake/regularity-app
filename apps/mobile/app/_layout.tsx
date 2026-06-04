import 'react-native-get-random-values';
import { useEffect, useRef } from 'react';
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
  const { isLoading, hasSeenWelcome, teamLivePublicToken, liveSession, autoJoinLive } = useApp();
  const router = useRouter();
  const segments = useSegments();
  const autoJoinedForRef = useRef<string | null>(null);

  // Auto-open a teammate's live session once when it starts (if the user opted in).
  // Redirect-once per token so they can still navigate back to the app afterwards.
  useEffect(() => {
    if (isAuthLoading || isLoading || !isAuthenticated || !hasSeenWelcome) return;
    if (!autoJoinLive || !teamLivePublicToken) {
      autoJoinedForRef.current = teamLivePublicToken ?? null;
      return;
    }
    if (teamLivePublicToken === liveSession?.publicToken) return; // this device is recording
    if (segments[0] === 'live') { autoJoinedForRef.current = teamLivePublicToken; return; }
    if (autoJoinedForRef.current === teamLivePublicToken) return; // already auto-opened
    autoJoinedForRef.current = teamLivePublicToken;
    router.push(`/live/${teamLivePublicToken}` as any);
  }, [teamLivePublicToken, liveSession, autoJoinLive, isAuthenticated, isAuthLoading, isLoading, hasSeenWelcome, segments, router]);

  useEffect(() => {
    if (isAuthLoading || isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';
    const onWelcome = segments[0] === 'welcome';
    const onLive = segments[0] === 'live';
    const onJoin = segments[0] === 'join';

    // Public, shareable live-view — no auth required, never redirect away.
    if (onLive) return;

    // Invite deep-link — the route handles auth/redirects itself.
    if (onJoin) return;

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
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    'JetBrainsMono-Regular': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    'JetBrainsMono-Medium': require('../assets/fonts/JetBrainsMono-Medium.ttf'),
    'JetBrainsMono-Bold': require('../assets/fonts/JetBrainsMono-Bold.ttf'),
    'JetBrainsMono-ExtraBold': require('../assets/fonts/JetBrainsMono-ExtraBold.ttf'),
  });

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
                    <Stack.Screen name="live/[publicToken]" />
                    <Stack.Screen name="join/[token]" />
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
