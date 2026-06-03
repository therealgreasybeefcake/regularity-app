# Quick Start Guide

## Running the App

### Option 1: Expo Go (Easiest)
1. Install Expo Go on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) | [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
2. Run the development server:
   ```bash
   cd regularity-app
   npm start
   ```
3. Scan the QR code with your phone camera (iOS) or Expo Go app (Android)

### Option 2: iOS Simulator (Mac only)
```bash
cd regularity-app
npm run ios
```

### Option 3: Android Emulator
```bash
cd regularity-app
npm run android
```

### Option 4: Web Browser
```bash
cd regularity-app
npm run web
```

## First Time Setup

1. **Navigate to Settings** (bottom right tab)
2. Configure your preferences:
   - Enable/disable dark mode
   - Set audio warning times
   - Customize lap type values

3. **Add Drivers** (second tab from left)
   - Edit driver names by tapping them
   - Set target lap times
   - Add penalty laps if needed

4. **Start Racing** (leftmost tab)
   - Select your driver
   - Press "Start" to begin timer
   - Press "Lap" when crossing finish line
   - View lap history and status

## Key Features

### Timer Controls
- **Start Button**: Begins the stopwatch
- **Lap Button**: Records lap and restarts timer
- **Reset Button** (↻): Stops and resets timer
- **Manual Input**: Enter lap times in MM:SS.mmm or seconds format

### Lap Types (Auto-Classified)
- 🟢 **Bonus**: +0 to +0.99s from target (worth 2 laps)
- 🔵 **Base**: Slower than +0.99s (worth 1 lap)
- 🔴 **Broken**: Faster than target (worth 0 laps)
- 🟣 **Changeover**: Driver switch (worth 1 lap)
- 🟡 **Safety**: Safety car period (worth 0 laps)

### Audio Warnings
- **Single Beep**: X seconds before target time
- **Double Beep**: X seconds after lap starts
- Configure timing in Settings

### Signal Light System
Watch the 3-lap average indicator:
- 🟢 **Green**: 0.3-0.99s average (perfect zone)
- 🔴 **Red**: <0.3s or broken lap (too risky)
- 🔵 **Blue**: ≥1.0s average (too slow)

## Data Management

### Export Your Data
1. Go to Settings tab
2. Tap "Export Data"
3. Share the JSON file via email/cloud

### Import Data
1. Go to Settings tab
2. Tap "Import Data"
3. Select your JSON backup file

### Clear Everything
Settings → "Clear All Data" (cannot be undone!)

## Tips & Tricks

1. **Keyboard Entry**: Use manual input for precise time entry
2. **Changeover Detection**: App auto-detects if >3 minutes between laps
3. **Target Display**: Timer shows both seconds and MM:SS format
4. **Penalty Laps**: Negative laps are shown in stats
5. **Dark Mode**: Auto-adjusts all colors and charts

## Troubleshooting

### Audio Not Working
- Check Settings → Enable Audio is ON
- Ensure phone is not in silent mode
- Check individual warning toggles

### Timer Not Starting
- Make sure a driver is selected
- Check that you're on the Timer tab
- Try resetting the timer

### Data Not Saving
- Data saves automatically on every change
- Check AsyncStorage permissions
- Try force-closing and reopening app

## Support

For issues or feature requests, please create an issue on GitHub.

---

**Happy Racing! 🏁**
