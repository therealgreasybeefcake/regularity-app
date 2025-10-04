# Regularity Race Timer - Expo Mobile App

A mobile-first Expo React Native version of the Regularity Race Timer web application. This app helps track lap times for regularity racing, where consistency is more important than speed.

## Features

### Core Functionality
- **Live Stopwatch Timer** with millisecond precision
- **Lap Recording** - Automatic lap type classification (Bonus, Base, Broken, Changeover, Safety)
- **Multi-Driver Support** - Manage multiple drivers per team
- **Audio Warnings** - Configurable beeps before target time and after lap start
- **Dark Mode** - Automatic theme switching

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

1. **Install dependencies:**
   ```bash
   cd regularity-app
   npm install
   ```

2. **Run the app:**
   ```bash
   # iOS Simulator
   npm run ios

   # Android Emulator
   npm run android

   # Expo Go (scan QR code)
   npm start
   ```

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
2. Press **Start** to begin the timer
3. Press **Lap** when the driver crosses the finish line
4. The lap is automatically classified and recorded
5. Alternatively, enter lap times manually in MM:SS.mmm format

### Drivers Tab
- Add/remove drivers
- Edit driver names
- Set target lap times (in seconds)
- Add penalty laps
- Clear driver lap history

### Stats Tab
- View team information and session details
- See team-wide statistics (goal laps, achieved laps, percentage)
- Review per-driver detailed statistics

### Settings Tab
- Toggle dark mode
- Configure audio warnings
- Customize lap type values
- Import/export data
- Clear all data

## Audio Warnings

The app supports two configurable audio warnings:

1. **Before Target Time**: Single beep X seconds before reaching target (default: 10s)
2. **After Lap Start**: Double beep X seconds after starting timer (default: 15s)

Both can be enabled/disabled independently in Settings.

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

- **Expo SDK** - React Native framework
- **React Navigation** - Tab and stack navigation
- **AsyncStorage** - Local data persistence
- **Expo AV** - Audio playback for warnings
- **Expo File System** - Import/export functionality
- **TypeScript** - Type safety

## Future Enhancements

Planned features for future versions:
- PDF export functionality
- Charts visualization (Victory Native)
- Team management (multi-team support)
- Race session templates
- Bluetooth lap counter integration

## License

MIT

## Credits

Based on the original Regularity Race Timer web application.
