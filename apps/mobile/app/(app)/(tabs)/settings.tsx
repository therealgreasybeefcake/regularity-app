import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import SettingsScreen from '../../../screens/SettingsScreen';

export default function Settings() {
  // The website is view-only; team switching and sign-out are in its sidebar.
  if (Platform.OS === 'web') return <Redirect href="/(app)/(tabs)/stats" />;
  return <SettingsScreen />;
}
