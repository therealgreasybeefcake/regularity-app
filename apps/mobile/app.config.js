// Dynamic Expo config layered on top of app.json. Its only job is to add the
// native Google Sign-In config plugin, whose `iosUrlScheme` (the reversed iOS
// OAuth client id, e.g. com.googleusercontent.apps.1234-abcd) is environment-
// specific and supplied via EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME. When that var is
// absent the plugin is omitted so the project still prebuilds/exports (web,
// or before the Google OAuth clients are created). Everything else lives in
// app.json and is passed through unchanged.
module.exports = ({ config }) => {
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
  const plugins = [...(config.plugins ?? [])];
  if (iosUrlScheme) {
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  }
  return { ...config, plugins };
};
