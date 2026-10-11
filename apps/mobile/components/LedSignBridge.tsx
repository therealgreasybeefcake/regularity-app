import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useApp } from '../context/AppContext';
import { LedSignService } from '../services/LedSignService';

/**
 * Headless: feeds the active driver's latest lap to the Bluetooth LED sign.
 * Watching team state (rather than hooking each record path in the Timer)
 * also covers lap edits, deletes, changeover/safety toggles and driver
 * switches. The stopwatch is relayed separately from AppContext.reportTimerState.
 */
export function LedSignBridge() {
  const { teams, activeTeam, activeDriver, isLoading } = useApp();

  useEffect(() => {
    if (Platform.OS !== 'web') void LedSignService.init();
  }, []);

  const driver = (teams[activeTeam] ?? teams[0])?.drivers?.[activeDriver];
  const laps = driver?.laps ?? [];
  const last = laps[laps.length - 1];
  // Primitive key so the effect fires on a real change, not on every teams re-render.
  const key = driver
    ? `${activeTeam}:${activeDriver}:${driver.name}:${driver.targetTime}:${last ? `${last.timestamp}:${last.time}:${last.lapType}` : '-'}`
    : null;

  useEffect(() => {
    if (Platform.OS === 'web' || isLoading || !driver) return;
    LedSignService.setTarget(driver.targetTime);
    if (last) {
      LedSignService.sendLap({
        lapType: last.lapType,
        lapNumber: last.number,
        deltaSec: last.delta,
        targetSec: driver.targetTime,
        driverName: driver.name,
      });
    } else {
      LedSignService.clear();
    }
    // `key` captures everything read from driver/last.
  }, [key, isLoading]);

  return null;
}
