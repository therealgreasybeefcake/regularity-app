import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import DriversScreen from '../../../screens/DriversScreen';

export default function Drivers() {
  // The website is view-only (live view + Stats); the roster is edited on the phones.
  if (Platform.OS === 'web') return <Redirect href="/(app)/(tabs)/stats" />;
  return <DriversScreen />;
}
