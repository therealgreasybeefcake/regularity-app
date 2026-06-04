import { Platform } from 'react-native';
import type { Lap } from '@regularity/core';

interface CsvDriver {
  name: string;
  laps: Lap[];
}

interface CsvDisplayData {
  raceName?: string;
  sessionNumber?: string | number;
  drivers: CsvDriver[];
}

/** Escape a CSV field — wrap in quotes when it contains a comma, quote or newline. */
function csvField(value: string | number): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build the CSV text for all laps across every driver in `displayData`. */
function buildCsv(displayData: CsvDisplayData): string {
  const header = 'driver,lap,time_sec,delta,lap_type,lap_value,timestamp';
  const rows: string[] = [header];
  for (const driver of displayData.drivers || []) {
    for (const lap of driver.laps || []) {
      rows.push(
        [
          csvField(driver.name),
          csvField(lap.number),
          csvField(lap.time?.toFixed(3) ?? ''),
          csvField(lap.delta?.toFixed(3) ?? ''),
          csvField(lap.lapType),
          csvField(lap.lapValue),
          csvField(lap.timestamp),
        ].join(','),
      );
    }
  }
  return rows.join('\n');
}

/**
 * Export every lap across all drivers of `displayData` as a CSV file.
 * Web triggers a browser download; native writes to the cache dir + shares it.
 */
export async function exportLapsCsv(
  displayData: CsvDisplayData,
  filenameBase: string,
): Promise<void> {
  const csv = buildCsv(displayData);
  const safeBase = (filenameBase || 'laps').replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-');
  const filename = `${safeBase}.csv`;

  if (Platform.OS === 'web') {
    const doc = (globalThis as any).document;
    const URLImpl = (globalThis as any).URL;
    // Guard for SSR / non-browser environments.
    if (!doc || !URLImpl || typeof (globalThis as any).Blob === 'undefined') {
      console.warn('CSV export unavailable: no DOM (SSR?)');
      return;
    }
    const blob = new (globalThis as any).Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URLImpl.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    URLImpl.revokeObjectURL(url);
    return;
  }

  // Native: write to cache then share. Both modules are optional — gracefully
  // degrade to a no-op + warning if either isn't installed.
  let FileSystem: any;
  let Sharing: any;
  try {
    FileSystem = require('expo-file-system/legacy');
  } catch {
    try {
      FileSystem = require('expo-file-system');
    } catch {
      FileSystem = null;
    }
  }
  try {
    Sharing = require('expo-sharing');
  } catch {
    Sharing = null;
  }

  if (!FileSystem || !Sharing) {
    console.warn('CSV export unavailable: expo-file-system / expo-sharing not installed');
    return;
  }

  try {
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, csv, {
      encoding: FileSystem.EncodingType?.UTF8 ?? 'utf8',
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        UTI: 'public.comma-separated-values-text',
        mimeType: 'text/csv',
        dialogTitle: filename,
      });
    }
  } catch (err) {
    console.warn('CSV export failed:', err);
  }
}
