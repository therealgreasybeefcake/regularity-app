import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

import App from './App';

// Suppress known harmless warnings
LogBox.ignoreLogs([
  'The native view manager for module(ExpoLinearGradient)',
  'setLayoutAnimationEnabledExperimental is currently a no-op in the New Architecture',
]);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
