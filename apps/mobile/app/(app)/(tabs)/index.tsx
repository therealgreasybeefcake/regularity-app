import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import TimerScreen from '../../../screens/TimerScreen';

export default function Timer() {
  // The website is view-only: timing happens on the phones.
  if (Platform.OS === 'web') return <Redirect href="/(app)/(tabs)/stats" />;
  return <TimerScreen />;
}
