import React from 'react';
import { View, Text, StyleSheet, Switch, Pressable, ActivityIndicator } from 'react-native';
import { formatSignDelta, LED_SIGN_LAP_TYPES, type LapType, type LedSignMode, type Rgb } from '@regularity/core';
import { LedSignService, type LedSignStatus } from '../services/LedSignService';
import { useLedSign } from '../hooks/useLedSign';
import { useTheme } from '../hooks/useTheme';
import { spacing, radius, typography, fontWeights } from '../constants/theme';
import { Button, Divider, LiveDot, Mono, SegmentedControl } from './ui';

// Settings → LED Sign: pair the Bluetooth pit board and control what it shows.

const STATUS_LABEL: Record<LedSignStatus, string> = {
  unsupported: 'Not available in this build',
  poweredOff: 'Bluetooth is off',
  idle: 'Not connected',
  scanning: 'Searching…',
  connecting: 'Connecting…',
  connected: 'Connected',
};

const LAP_TYPE_LABEL: Record<LapType, string> = {
  bonus: 'Bonus',
  base: 'Base',
  broken: 'Broken',
  changeover: 'Changeover',
  safety: 'Safety car',
};

/** Saturated, high-contrast LED colours (pastels wash out on a sign in sunlight). */
const SWATCHES: Rgb[] = [
  [0, 255, 0],
  [255, 160, 0],
  [255, 0, 0],
  [0, 120, 255],
  [255, 220, 0],
  [0, 255, 255],
  [255, 0, 255],
  [255, 255, 255],
];

const BRIGHTNESS = [
  { label: '25%', value: '64' },
  { label: '50%', value: '128' },
  { label: '75%', value: '192' },
  { label: '100%', value: '255' },
];

const PREVIEW_DELTA: Record<LapType, number> = { bonus: 0.42, base: 1.73, broken: -0.38, changeover: 4.12, safety: 21.5 };

const rgb = ([r, g, b]: Rgb) => `rgb(${r},${g},${b})`;
const sameRgb = (a: Rgb, b: Rgb) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export function LedSignSettings() {
  const { theme } = useTheme();
  const { status, settings, discovered, error } = useLedSign();
  const { config } = settings;

  if (status === 'unsupported') {
    return (
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        The LED sign needs the Regularity app on iOS or Android, updated to a version with Bluetooth support.
      </Text>
    );
  }

  const nearestBrightness = BRIGHTNESS.reduce((best, b) =>
    Math.abs(Number(b.value) - config.brightness) < Math.abs(Number(best.value) - config.brightness) ? b : best,
  ).value;

  const toggle = (title: string, subtitle: string, value: boolean, onValueChange: (v: boolean) => void) => (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.border as string, true: theme.primary as string }}
      />
    </View>
  );

  return (
    <View>
      {/* Connection */}
      <View style={styles.statusRow}>
        <LiveDot
          active={status === 'connected' || status === 'scanning' || status === 'connecting'}
          color={status === 'connected' ? theme.success : status === 'idle' || status === 'poweredOff' ? theme.textMuted : theme.warning}
        />
        <View style={styles.rowText}>
          <Text style={[styles.title, { color: theme.text }]}>{settings.deviceName ?? 'No sign paired'}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{STATUS_LABEL[status]}</Text>
        </View>
      </View>
      {error ? <Text style={[styles.subtitle, { color: theme.danger, marginBottom: spacing.sm }]}>{error}</Text> : null}

      <View style={styles.buttons}>
        {settings.deviceId ? (
          <>
            {status === 'connected' ? (
              <Button title="Test sign" icon="flash-outline" size="sm" variant="secondary" onPress={() => LedSignService.test()} />
            ) : (
              <Button
                title="Connect"
                icon="bluetooth-outline"
                size="sm"
                loading={status === 'connecting'}
                onPress={() => void LedSignService.connect()}
              />
            )}
            <Button title="Forget" icon="trash-outline" size="sm" variant="ghost" onPress={() => void LedSignService.forget()} />
          </>
        ) : (
          <Button
            title={status === 'scanning' ? 'Searching…' : 'Find sign'}
            icon="search-outline"
            size="sm"
            disabled={status === 'scanning' || status === 'poweredOff'}
            onPress={() => void LedSignService.startScan()}
          />
        )}
      </View>

      {!settings.deviceId && (status === 'scanning' || discovered.length > 0) && (
        <View style={styles.found}>
          {discovered.map((sign) => (
            <Pressable
              key={sign.id}
              onPress={() => void LedSignService.pair(sign)}
              style={[styles.foundRow, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
            >
              <Text style={[styles.title, { color: theme.text, flex: 1 }]}>{sign.name}</Text>
              {sign.rssi != null && <Mono size={typography.caption} color={theme.textMuted}>{sign.rssi} dBm</Mono>}
              <Text style={[styles.link, { color: theme.primary }]}>Pair</Text>
            </Pressable>
          ))}
          {status === 'scanning' && discovered.length === 0 && <ActivityIndicator color={theme.primary as string} />}
        </View>
      )}

      {settings.deviceId &&
        toggle('Stay connected', 'Reconnect to this sign automatically', settings.autoConnect, (v) => LedSignService.setAutoConnect(v))}

      <Divider faint />

      {/* What the sign shows */}
      <Text style={[styles.section, { color: theme.textSecondary }]}>Display</Text>
      <SegmentedControl<LedSignMode>
        options={[
          { label: 'Delta', value: 'delta' },
          { label: 'Delta + lap', value: 'deltaLap' },
          { label: 'Countdown', value: 'countdown' },
        ]}
        value={config.mode}
        onChange={(mode) => LedSignService.updateConfig({ mode })}
      />
      <Text style={[styles.subtitle, { color: theme.textSecondary, marginTop: spacing.xs }]}>
        {config.mode === 'delta'
          ? 'Last lap delta only, at full sign height.'
          : config.mode === 'deltaLap'
            ? 'Delta with a driver and lap number strip underneath.'
            : 'Delta for 8 seconds after each lap, then a live countdown to the target.'}
      </Text>

      <Text style={[styles.section, { color: theme.textSecondary }]}>Decimals</Text>
      <SegmentedControl
        options={[
          { label: '+0.4', value: '1' },
          { label: '+0.42', value: '2' },
        ]}
        value={String(config.decimals)}
        onChange={(v) => LedSignService.updateConfig({ decimals: v === '2' ? 2 : 1 })}
      />

      <Text style={[styles.section, { color: theme.textSecondary }]}>Brightness</Text>
      <SegmentedControl
        options={BRIGHTNESS}
        value={nearestBrightness}
        onChange={(v) => LedSignService.updateConfig({ brightness: Number(v) })}
      />

      {/* Colours per lap type, each with a mini preview of the sign */}
      <Text style={[styles.section, { color: theme.textSecondary }]}>Colours</Text>
      {LED_SIGN_LAP_TYPES.map((type) => {
        const color = config.colors[type];
        const filled = type === 'broken' && config.fillOnBroken;
        return (
          <View key={type} style={styles.colorRow}>
            <View style={[styles.preview, { backgroundColor: filled ? rgb(color) : '#000' }]}>
              <Mono size={typography.bodyLg} weight="extrabold" color={filled ? '#000' : rgb(color)}>
                {formatSignDelta(PREVIEW_DELTA[type], config.decimals)}
              </Mono>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.title, { color: theme.text }]}>{LAP_TYPE_LABEL[type]}</Text>
              <View style={styles.swatches}>
                {SWATCHES.map((s) => (
                  <Pressable
                    key={s.join(',')}
                    accessibilityLabel={`${LAP_TYPE_LABEL[type]} colour ${s.join(',')}`}
                    onPress={() => LedSignService.updateConfig({ colors: { ...config.colors, [type]: s } })}
                    style={[
                      styles.swatch,
                      { backgroundColor: rgb(s), borderColor: sameRgb(s, color) ? theme.text : 'transparent' },
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>
        );
      })}

      <Divider faint />
      {toggle('Solid board on broken laps', 'Fill the whole sign with the broken colour, digits in black. Uses much more power.', config.fillOnBroken, (v) =>
        LedSignService.updateConfig({ fillOnBroken: v }),
      )}
      <Divider faint />
      {toggle('Flash safety car laps', 'Blink the delta on safety car laps', config.flashSafety, (v) =>
        LedSignService.updateConfig({ flashSafety: v }),
      )}
      <Divider faint />
      {toggle('Flip display', 'Rotate 180° if the sign is mounted upside down', config.flip, (v) =>
        LedSignService.updateConfig({ flip: v }),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
  },
  title: {
    fontSize: typography.bodyLg,
    fontWeight: fontWeights.medium,
  },
  subtitle: {
    fontSize: typography.caption,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  section: {
    fontSize: typography.caption,
    fontWeight: fontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  found: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  foundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  link: {
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  preview: {
    width: 84,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 2,
  },
});
