# Hardware Button Support

## Current Implementation

The app currently supports **keyboard shortcuts** for lap recording:
- **Enter** key - Records a lap
- **Space** key - Records a lap

This works with:
- ✅ Physical keyboards (via USB or Bluetooth)
- ✅ Bluetooth keyboards
- ✅ Bluetooth remotes (that send keyboard events)

## Recommended Hardware for Racing

For hands-free lap recording while racing, consider:

### Option 1: Bluetooth Keyboard Remote
- **Recommended**: Small Bluetooth media remotes
- Examples:
  - AB Shutter 3 ($10-15)
  - Satechi Bluetooth Button ($20)
  - Any Bluetooth keyboard/numpad

### Option 2: Bluetooth Presenter Remote
- PowerPoint clicker remotes
- Most send keyboard events (arrow keys, space, enter)
- Inexpensive ($10-30)

### Option 3: Smartphone Mount + Tap
- Use a phone mount within reach
- Tap the large "Lap" button on screen
- No additional hardware needed

## Volume Button Support (Future)

Native volume button support would require:

1. **Expo Development Build** instead of Expo Go
2. **Native module**: `react-native-volume-manager` or similar
3. **Custom build** process

### To Add Volume Button Support:

If you want to build a custom version with volume buttons:

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS
eas build:configure

# Add volume manager
npm install react-native-volume-manager

# Build custom development client
eas build --profile development --platform android
# or
eas build --profile development --platform ios
```

Then uncomment the volume button code in `screens/TimerScreen.tsx` (lines 114-157 from git history).

## Current Workaround

The easiest solution for hands-free operation:
1. Pair a small Bluetooth remote (like AB Shutter 3)
2. Mount your phone where you can see it
3. Press the remote button to record laps
4. The remote's button will trigger Enter/Space keyboard event

This is actually more reliable than volume buttons because:
- ✅ Works in Expo Go (no custom build needed)
- ✅ Won't accidentally change volume
- ✅ Can be mounted separately from phone
- ✅ Cheaper than custom hardware

## Testing Keyboard Support

To test keyboard support:
1. **iOS Simulator**: Your Mac keyboard works directly
2. **Android Emulator**: Your PC keyboard works directly
3. **Physical Device**: Pair Bluetooth keyboard and press Enter/Space
