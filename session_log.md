# Session Log

## 2026-03-08 — Expo SDK 55 Upgrade, Design Overhaul, Bug Fixes

### Expo SDK 55 Upgrade
- Upgraded all Expo packages from SDK 54 to SDK 55 (React Native 0.83, React 19.2)
- Removed `newArchEnabled: true` from app.json (default in SDK 55)
- Removed `expo-dev-client` from plugins, removed `expo-av` (replaced by `expo-audio`)
- Added plugins: expo-audio, expo-sharing, expo-font, expo-asset, expo-router
- Fixed `useFonts` import (moved from `@expo/vector-icons` to `expo-font` in SDK 55)
- Fixed `expo-audio` AudioPlayer constructor (4 args in SDK 55 vs 3 in SDK 54)
- Resolved ENOENT for expo-asset with clean `node_modules` reinstall

### Design System Overhaul
- Added design tokens: `spacing`, `radius`, `typography`, `fontWeights`, `shadows`, `glass`, `brandColors`
- Integrated Expo Color API (`expo-router` Color) for platform-native iOS system colors and Android Material 3 dynamic colors with hex fallbacks
- Updated `ThemeColors` interface to use `ColorValue` instead of `string` for PlatformColor compatibility
- Added `surface`, `surfaceElevated`, `surfaceMuted` theme fields
- Glass effect tab bar: `BlurView` on iOS, semi-transparent View on Android
- Redesigned all screens (Timer, Drivers, Stats, Settings, Welcome) with consistent tokens
- Added `cs()` helper in DriverCharts to cast `ColorValue` to `string` for gifted-charts

### Bug Fixes
- **baseLaps**: Fixed counting all laps → now `laps.filter(l => l.lapType === 'base').length`
- **Bonus threshold**: Changed `delta <= 0.99` to `delta < 1.0`
- **Trend line divide-by-zero**: Guard denominator before division, return flat line if zero
- **Icons not showing**: Added Ionicons font preloading via `useFonts` from `expo-font`
- **Volume button UX**: Added one-time hint alert when volume buttons pressed with setting disabled
- **ErrorBoundary**: New component wrapping app content for crash resilience
- **JSON import validation**: Validates team/driver structure before applying
- **AsyncStorage debouncing**: 300ms debounce on teams write to reduce I/O during rapid lap recording

### Android Build — JitPack Workaround
- JitPack service outage prevented resolving `com.github.Dimezis:BlurView:version-3.1.0` (expo-blur dependency)
- Downloaded BlurView source from GitHub, built AAR locally
- Created local Maven repo at `android/local-maven/` with built AAR + POM
- Added `maven { url "${rootProject.projectDir}/local-maven" }` to `android/build.gradle`
- Android build succeeded after workaround

### Files Modified
- `App.tsx`, `app.json`, `package.json`, `package-lock.json`
- `types/index.ts`, `constants/theme.ts`, `context/AppContext.tsx`
- `navigation/AppNavigator.tsx`, `components/DriverCharts.tsx`
- `screens/TimerScreen.tsx`, `screens/DriversScreen.tsx`, `screens/StatsScreen.tsx`, `screens/SettingsScreen.tsx`, `screens/WelcomeScreen.tsx`
- `services/VolumeButtonService.ts`, `utils/calculations.ts`

### New Files
- `components/ErrorBoundary.tsx`
- `android/local-maven/com/github/Dimezis/BlurView/version-3.1.0/` (AAR + POM)

### Commit
- `0768598` on `upgrade/expo-55-08032026` (combined with AWS changes by pre-commit hook)

---

## 2026-03-08 — AWS Auth, S3 Sync, Expo Web

### AWS Infrastructure Created
- Cognito App Client: `31beb214d33gtjhgt29dlvu5a8` (no secret, SRP + password auth)
- Identity Pool: `ap-southeast-2:5e5064ce-2ec6-4f2e-a8ac-11a7617cf1fb`
- IAM Role: `CognitoRegularityAuthRole` with S3 GetObject/PutObject on `regularity-race-timer/*`
- S3 CORS configured for web access (GET/PUT, all origins)
- No Cognito users created yet — to be done manually later

### Dependencies Added
- `amazon-cognito-identity-js` — lightweight Cognito auth (no Amplify)
- `@aws-sdk/client-cognito-identity` — token-to-credential exchange
- `@aws-sdk/client-s3` — direct S3 read/write
- Installed with `--legacy-peer-deps` due to react-dom peer conflict

### New Files
- `constants/aws-config.ts` — AWS resource IDs
- `services/AuthService.ts` — Cognito SRP auth, token storage in AsyncStorage, AWS credential exchange via Identity Pool
- `services/S3SyncService.ts` — load/save `teams.json` from/to S3
- `context/AuthContext.tsx` — auth state, credential caching with 5-min expiry buffer
- `screens/LoginScreen.tsx` — email/password login, NEW_PASSWORD_REQUIRED challenge handling

### Modified Files
- `types/index.ts` — added `SyncStatus` type
- `App.tsx` — wrapped with `AuthProvider`, auth gate (LoginScreen vs AppNavigator)
- `context/AppContext.tsx` — S3 sync on load (background fetch after local), debounced S3 save (2s), `syncStatus` state
- `screens/SettingsScreen.tsx` — account section with sync indicator + sign out button, web export via Blob download, volume button setting hidden on web
- `screens/TimerScreen.tsx` — conditional requires for expo-keep-awake, expo-audio, VolumeManager; web guards on Vibration calls
- `services/VolumeButtonService.ts` — web no-op guards on enable/disable/handleVolumeButtonPress

### Decisions
- No Amplify — using raw Cognito + AWS SDK for smaller bundle
- Only `teams` data syncs to S3; settings (theme, audio, lap values) stay device-local
- S3 sync is eventual consistency: local-first with 2s debounced upload
- On app load: AsyncStorage loads instantly, then S3 fetched in background and overwrites if present
- Web support via conditional `require()` for native-only modules rather than separate entry points
- Used `--legacy-peer-deps` for npm install due to react-dom@19.2.4 wanting react@^19.2.4 but app pins react@19.2.0

### Commit
- `0768598` on `upgrade/expo-55-08032026`
