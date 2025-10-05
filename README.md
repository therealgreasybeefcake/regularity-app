# Regularity Race Timer - Expo Mobile App

A mobile-first Expo React Native version of the Regularity Race Timer web application. This app helps track lap times for regularity racing, where consistency is more important than speed.

## Features

### Core Functionality
- **Live Stopwatch Timer** with millisecond precision
- **Volume Button Lap Recording** - Use hardware volume buttons to record laps (requires Expo Dev Client)
- **Lap Recording Guard** - Prevent accidental button presses outside target time range with safety car support
- **Automatic Lap Classification** - Bonus, Base, Broken, Changeover, Safety
- **Multi-Driver Support** - Manage multiple drivers per team with full-screen add driver modal
- **Flexible Time Input** - Enter times in seconds (105) or MM:SS.mmm (1:45.000) format
- **Audio & Haptic Feedback** - Configurable beeps and vibration patterns
- **Dark Mode** - Automatic, light, or dark theme

### Lap Type System
- **Bonus Lap** (Green): Within +0-0.99s of target → Worth 2 laps
- **Base Lap** (Blue): Slower than +0.99s → Worth 1 lap
- **Broken Lap** (Red): Faster than target → Worth 0 laps
- **Changeover Lap** (Purple): Driver switch → Worth 1 lap
- **Safety Car** (Yellow): Safety period → Worth 0 laps

### Statistics & Analytics
- **3-Lap Rolling Average** - Signal coaching (Green/Red/Blue)
- **Goal Laps Calculation** - Winton formula implementation
- **Team Scoring** - Percentage factor and achievement tracking
- **Per-Driver Stats** - Achieved laps, net score, averages

### Data Management
- **Auto-save** - All data persisted to AsyncStorage
- **Import/Export** - JSON backup and restore
- **Clear Data** - Reset to defaults

## Installation

### Standard Setup (Expo Go - Limited Features)

1. **Install dependencies:**
   ```bash
   cd regularity-app
   npm install
   ```

2. **Run with Expo Go:**
   ```bash
   npm start
   ```
   Scan the QR code with Expo Go app on your device.

   **Note:** Volume button functionality is NOT available in Expo Go.

### Development Build (Full Features - Volume Buttons)

For volume button lap recording, you need to build a custom development client:

1. **Install dependencies:**
   ```bash
   cd regularity-app
   npm install
   ```

2. **Build development client:**
   ```bash
   # For iOS (requires Mac with Xcode)
   npx expo run:ios

   # For Android (requires Android SDK and Java)
   npx expo run:android

   # Or use EAS Build (cloud-based, no local setup needed)
   npm install -g eas-cli
   eas build --profile development --platform android
   ```

3. **Run the dev server:**
   ```bash
   npx expo start --dev-client
   ```

The development build will connect to your dev server with full native module support.

## Project Structure

```
regularity-app/
├── context/
│   └── AppContext.tsx          # Global state management
├── screens/
│   ├── TimerScreen.tsx         # Main timer and lap recording
│   ├── DriversScreen.tsx       # Driver management
│   ├── StatsScreen.tsx         # Statistics display
│   └── SettingsScreen.tsx      # App settings
├── navigation/
│   └── AppNavigator.tsx        # Tab navigation
├── utils/
│   └── calculations.ts         # Lap calculations and formulas
├── constants/
│   └── theme.ts               # Light/dark theme colors
├── types/
│   └── index.ts               # TypeScript interfaces
└── App.tsx                    # Entry point
```

## Usage

### Timer Tab
1. Select a driver from the tabs
2. Press **Start** to begin the timer (or use volume buttons with dev client)
3. Press **Lap** button or **Volume Up/Down** when crossing the finish line
4. The lap is automatically classified and recorded
5. Alternatively, enter lap times manually in seconds or MM:SS.mmm format
6. **Lap Guard** (if enabled) prevents accidental presses outside target range
7. **Safety Car Support** - Laps significantly over target are automatically allowed

### Drivers Tab
- **Add drivers** via full-screen modal popup
- Edit driver names by tapping
- **Set target times** in seconds (105) or MM:SS.mmm (1:45.000) format
- Tap target time to edit in your preferred format
- Add penalty laps
- Clear driver lap history
- View live stats (laps, bonus, broken)

### Stats Tab
- View team information and session details
- See team-wide statistics (goal laps, achieved laps, percentage)
- Review per-driver detailed statistics

### Settings Tab
- **Theme**: Light, Dark, or Auto (system)
- **Time Format**: Seconds (105s) or MM:SS.mmm (1:45.000)
- **Audio Warnings**: Configure timing and enable/disable
- **Lap Recording Guard**: Prevent accidental button presses
  - Set allowed range (±seconds from target)
  - Configure safety car threshold (seconds over target)
- **Lap Type Values**: Customize point values
- **Data Management**: Import/export, clear all

## Advanced Features

### Volume Button Controls (Dev Client Only)
- Press **Volume Up** or **Volume Down** to record laps
- Works even when phone is locked or screen is off
- Volume stays constant (buttons don't change actual volume)
- Haptic feedback confirms lap recording

### Lap Recording Guard
Prevents accidental lap recording with smart filtering:

**Normal Laps**: Accepted within ±range of target time
- Example: 105s target, ±10s range → accepts 95-115s

**Safety Car Laps**: Automatically allowed when significantly over target
- Example: 105s target, +30s threshold → accepts 135s+

**Rejected Laps**: Shows message with allowed ranges
- Double vibration pattern indicates rejection
- Visual feedback displays exact time and valid ranges

### Audio & Haptic Feedback

**Audio Warnings** (configurable):
1. **Before Target Time**: Single beep X seconds before target (default: 10s)
2. **After Lap Start**: Double beep X seconds after lap start (default: 15s)

**Haptic Feedback**:
- Single 500ms vibration: Lap successfully recorded
- Double short vibration: Lap rejected by guard

## 3-Lap Signal System

The app provides visual coaching based on the last 3 regular laps:

- 🟢 **Green** (0.3-0.99s avg): Optimal bonus territory
- 🔴 **Red** (<0.3s avg or previous lap broken): Too fast/risky
- 🔵 **Blue** (≥1.0s avg): Too slow

## Lap Type Values

Customize how much each lap type is worth in Settings:

- Bonus: 2 laps (default)
- Base: 1 lap (default)
- Changeover: 1 lap (default)
- Broken: 0 laps (default)
- Safety: 0 laps (default)

## Winton Goal Laps Formula

Goal laps are calculated using the Winton formula:

```
For each driver:
  teamTotal = sum of all drivers' (base + changeover laps)
  driverTotal = driver's (base + changeover laps)
  percentage = driverTotal / teamTotal
  goalLaps = (percentage × sessionDuration × 60 / targetTime) × 2
```

## Data Persistence

All data is automatically saved to AsyncStorage:
- Teams, drivers, and laps
- Active team and driver selection
- Audio settings
- Lap type values
- Theme preference

## Technologies Used

- **Expo SDK 52** - React Native framework with new architecture
- **Expo Dev Client** - Custom development builds for native modules
- **React Navigation** - Tab navigation
- **AsyncStorage** - Local data persistence
- **Expo Audio** - Audio playback for warnings
- **Expo File System** - Import/export functionality
- **React Native Volume Manager** - Hardware volume button controls
- **React Native Gesture Handler** - Swipe-to-delete interactions
- **TypeScript** - Full type safety

## Key Dependencies

```json
{
  "expo": "~52.0.29",
  "expo-dev-client": "~5.0.13",
  "react-native-volume-manager": "^1.12.1",
  "react-native-gesture-handler": "~2.20.2",
  "expo-audio": "~15.0.3",
  "@react-navigation/native": "^7.0.17",
  "@react-native-async-storage/async-storage": "2.1.0"
}
```

## Recent Updates

### Version 1.1 (Current)
- ✅ Volume button lap recording (both up and down)
- ✅ Lap recording guard with safety car support
- ✅ Flexible time input (seconds or MM:SS.mmm)
- ✅ Haptic feedback (vibration patterns)
- ✅ Full-screen add driver modal
- ✅ Improved swipe-to-delete styling
- ✅ Time display format setting
- ✅ Visual rejection feedback

## Future Enhancements

Planned features for future versions:
- PDF export functionality
- Charts visualization (Victory Native)
- Session history and replay
- Bluetooth lap counter integration
- Team comparison analytics

## License

MIT

## Credits

Based on the original Regularity Race Timer web application.
