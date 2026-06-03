import { ActivityIndicator, View } from 'react-native';

// This is the initial route — the root layout effect handles all navigation
export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
