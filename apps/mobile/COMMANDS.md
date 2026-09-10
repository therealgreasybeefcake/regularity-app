# Regularity Race Timer - Commands Reference

## Development Commands

### Start Development Server
```bash
npm start
# or
expo start
```
Starts the Expo development server with Metro bundler.

### Run on Android
```bash
npm run android
# or
expo run:android
```
Builds and runs the app on an Android device/emulator.

### Run on iOS
```bash
npm run ios
# or
expo run:ios
```
Builds and runs the app on an iOS device/simulator.

### Run on Web
```bash
npm run web
# or
expo start --web
```
Runs the app in a web browser.

### Development Client
```bash
npx expo start --dev-client
```
Starts the development server with the dev client (for custom native code).

## EAS Build Commands

### Production Builds

#### Android Production Build
```bash
eas build --platform android --profile production
```
Creates a production Android App Bundle (.aab) for Google Play Store.

#### iOS Production Build
```bash
eas build --platform ios --profile production
```
Creates a production iOS build (.ipa) for Apple App Store.

#### All Platforms Production Build
```bash
eas build --platform all --profile production
```
Builds for both Android and iOS (requires Apple credentials for iOS).

### Preview Builds

#### Android Preview
```bash
eas build --platform android --profile preview
```
Creates an internal distribution build for Android.

#### iOS Preview
```bash
eas build --platform ios --profile preview
```
Creates an internal distribution build for iOS.

### Development Builds

#### Android Development Build
```bash
eas build --platform android --profile development
```
Creates a development client build for Android with debugging capabilities.

#### iOS Development Build
```bash
eas build --platform ios --profile development
```
Creates a development client build for iOS with debugging capabilities.

## EAS Submit Commands

### Submit to App Stores

#### Submit Android to Google Play
```bash
eas submit --platform android --profile production
```
Submits the latest Android production build to Google Play Store.

#### Submit iOS to App Store
```bash
eas submit --platform ios --profile production
```
Submits the latest iOS production build to Apple App Store.

## EAS Update Commands

### Publish Over-the-Air Update
```bash
eas update --branch production --message "Your update message"
```
Publishes an OTA update to the production branch.

### View Updates
```bash
eas update:list
```
Lists all published updates for your project.

## Project Setup Commands

### Install Dependencies
```bash
npm install
```
Installs all project dependencies from package.json.

### Prebuild (Generate Native Projects)
```bash
npx expo prebuild
```
Generates the native Android and iOS projects from your Expo configuration.

#### Prebuild for Android Only
```bash
npx expo prebuild --platform android
```

#### Prebuild for iOS Only
```bash
npx expo prebuild --platform ios
```

#### Clean Prebuild
```bash
npx expo prebuild --clean
```
Regenerates native projects from scratch (deletes existing native folders).

## EAS Configuration Commands

### Configure EAS
```bash
eas init
```
Initializes EAS in your project (creates eas.json).

### Login to EAS
```bash
eas login
```
Logs in to your Expo account.

### Logout from EAS
```bash
eas logout
```
Logs out from your Expo account.

### Check Build Status
```bash
eas build:list
```
Lists all builds for your project with their status.

### View Specific Build
```bash
eas build:view [BUILD_ID]
```
Shows details for a specific build.

## Credentials Management

### Configure Android Credentials
```bash
eas credentials --platform android
```
Manages Android keystores and credentials.

### Configure iOS Credentials
```bash
eas credentials --platform ios
```
Manages iOS certificates and provisioning profiles.

## Useful Additional Commands

### Clear Metro Bundler Cache
```bash
npx expo start --clear
```
Starts the dev server with cleared cache.

### Run TypeScript Check
```bash
npx tsc --noEmit
```
Type-checks your TypeScript code without emitting files.

### Clean Install
```bash
rm -rf node_modules package-lock.json && npm install
```
Performs a clean installation of all dependencies.

### View App Configuration
```bash
npx expo config
```
Displays the resolved app configuration.

### Doctor (Diagnose Issues)
```bash
npx expo-doctor
```
Checks for common issues in your Expo project.

## Build Profiles (from eas.json)

- **development**: Development client with internal distribution
- **preview**: Internal distribution preview builds
- **production**: Production builds for app stores (auto-increments version)

## Project Information

- **App Name**: Regularity Race Timer
- **Slug**: regularity-race-timer
- **Bundle ID (iOS)**: com.regularity.racetimer
- **Package (Android)**: com.regularity.racetimer
- **Owner**: greasybeefcake
- **EAS Project ID**: 9518c45d-1858-4d87-908f-106cd5784128

## Quick Tips

- Use `--non-interactive` flag for CI/CD builds
- Use `--auto-submit` with `eas build` to automatically submit after build
- Use `--local` flag to build locally instead of on EAS servers
- Monitor builds at: https://expo.dev/accounts/greasybeefcake/projects/regularity-race-timer/builds
