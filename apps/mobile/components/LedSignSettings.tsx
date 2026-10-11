import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, ActivityIndicator } from 'react-native';
import {
  LED_SIGN_LAP_TYPES,
  LED_SIGN_LIVE_FIELDS,
  LED_SIGN_PRESETS,
  signFieldText,
  type LapType,
  type LedSignColor,
  type LedSignConfig,
  type LedSignField,
  type LedSignLayout,
  type LedSignSecondarySize,
  type Rgb,
} from '@regularity/core';
import { LedSignService, type LedSignStatus } from '../services/LedSignService';
import { useLedSign } from '../hooks/useLedSign';
import { useTheme } from '../hooks/useTheme';
import { spacing, radius, typography, fontWeights, fonts } from '../constants/theme';
import { Button, Chip, Collapsible, Divider, LiveDot, Mono, SegmentedControl } from './ui';

// Settings → LED Sign: pair the Bluetooth pit board and choose what it shows.

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

const FIELD_LABEL: Record<LedSignField, string> = {
  none: 'None',
  delta: 'Delta',
  lapTime: 'Lap time (48.7)',
  lapTimeFull: 'Lap time (1:48.7)',
  countdown: 'Countdown',
  elapsed: 'Lap clock',
  lapNumber: 'Lap no.',
  driver: 'Driver',
  driverLap: 'Driver + lap',
  target: 'Target',
};

const MAIN_FIELDS: LedSignField[] = ['delta', 'lapTime', 'lapTimeFull', 'countdown', 'elapsed', 'lapNumber', 'driver', 'target'];
const SECONDARY_FIELDS: LedSignField[] = ['none', 'delta', 'lapTime', 'lapTimeFull', 'elapsed', 'lapNumber', 'driver', 'driverLap', 'target'];
const HOLD_FIELDS: LedSignField[] = ['delta', 'lapTime'];

/** Saturated, high-contrast LED colours (pastels wash out on a sign in sunlight). */
const SWATCHES: Rgb[] = [
  [255, 255, 255],
  [0, 255, 0],
  [255, 160, 0],
  [255, 0, 0],
  [0, 120, 255],
  [255, 220, 0],
  [0, 255, 255],
  [255, 0, 255],
];

const BRIGHTNESS = [
  { label: '25%', value: '64' },
  { label: '50%', value: '128' },
  { label: '75%', value: '192' },
  { label: '100%', value: '255' },
];

// Watts at the sign's 5 V, leaving headroom for the step-down converter's
// losses so the bank never sees more than it can supply.
const POWER_SOURCES = [
  { label: 'Battery', value: '0' },
  { label: 'USB 5 V', value: '13' },
  { label: '30 W PD', value: '22' },
  { label: '60 W PD', value: '45' },
  { label: '100 W PD', value: '75' },
];

const ECO_LEAD = [
  { label: 'Off', value: '0' },
  { label: '10 s', value: '10' },
  { label: '15 s', value: '15' },
  { label: '20 s', value: '20' },
];

const HOW_IT_WORKS: [string, string][] = [
  ['The sign', 'A large LED pit board on the wall, run by a small ESP32 computer. It gets everything from this phone over Bluetooth — no Wi-Fi or mobile data needed.'],
  ['Pair once', 'Power the sign, tap Find sign and pick the name it shows on its panels. After that the app reconnects by itself.'],
  ['Time as normal', 'Every lap you record for the active driver appears on the sign within a second. Edits, deletes, changeovers and driver switches update it too.'],
  ['Choose the display', 'Pick a preset (delta, lap time, both, countdown…) or build your own. Colours follow the lap type — bonus, base, broken — or stay fixed.'],
  ['Power', 'Tell it what powers it. The sign dims itself to stay within a power bank\'s limit, and Eco keeps it dark until the car is due.'],
];

const PREVIEW_DELTA: Record<LapType, number> = { bonus: 0.42, base: 1.73, broken: -0.38, changeover: 4.12, safety: 21.5 };
const PREVIEW_TARGET = 108.3;

const rgb = ([r, g, b]: Rgb) => `rgb(${r},${g},${b})`;
const sameRgb = (a: Rgb, b: Rgb) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Colour a field renders in, for the preview (mirrors the firmware). */
const fieldColor = (config: LedSignConfig, field: LedSignField, color: LedSignColor, lapType: LapType): Rgb => {
  if (color !== 'lapType') return color;
  // Live fields colour by the type the lap would get now — mid-lap that's "not yet": white.
  if (LED_SIGN_LIVE_FIELDS.includes(field)) return [255, 255, 255];
  return config.colors[lapType];
};

/** Mini sign: same split, fields and colours as the real one, for a sample lap. */
function SignPreview({ config, lapType }: { config: LedSignConfig; lapType: LapType }) {
  const { layout, decimals } = config;
  const delta = PREVIEW_DELTA[lapType];
  const data = {
    lap: { deltaSec: delta, timeSec: PREVIEW_TARGET + delta, number: 12, driverName: 'Driver A' },
    targetSec: PREVIEW_TARGET,
    elapsedSec: 100,
  };
  const filled = lapType === 'broken' && config.fillOnBroken;
  const hasSecondary = layout.secondary.field !== 'none';
  const split = !hasSecondary ? 1 : layout.secondary.size === 'half' ? 0.5 : layout.secondary.size === 'third' ? 0.67 : 0.79;
  const line = (field: LedSignField, color: LedSignColor, flex: number, small: boolean) => {
    const text = signFieldText(field, data, decimals);
    const c = filled ? '#000' : rgb(fieldColor(config, field, color, lapType));
    return (
      <View style={[styles.previewLine, { flex }]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            color: c,
            fontFamily: small ? fonts.monoBold : fonts.monoExtraBold,
            fontSize: small ? 12 : 120 * flex,
            textAlign: small ? 'left' : 'center',
          }}
        >
          {text}
        </Text>
      </View>
    );
  };
  return (
    <View style={[styles.preview, { backgroundColor: filled ? rgb(config.colors.broken) : '#000' }]}>
      {line(layout.main.field, layout.main.color, split, false)}
      {hasSecondary && line(layout.secondary.field, layout.secondary.color, 1 - split, layout.secondary.size === 'strip')}
    </View>
  );
}

function ColorPicker({ value, onChange }: { value: LedSignColor; onChange: (c: LedSignColor) => void }) {
  const { theme } = useTheme();
  return (
    <View style={styles.swatches}>
      <Chip label="Lap type" size="sm" active={value === 'lapType'} onPress={() => onChange('lapType')} />
      {SWATCHES.map((s) => (
        <Pressable
          key={s.join(',')}
          accessibilityLabel={`Colour ${s.join(',')}`}
          onPress={() => onChange(s)}
          style={[
            styles.swatch,
            { backgroundColor: rgb(s), borderColor: value !== 'lapType' && sameRgb(s, value) ? theme.text : 'transparent' },
          ]}
        />
      ))}
    </View>
  );
}

function FieldPicker({ fields, value, onChange }: { fields: LedSignField[]; value: LedSignField; onChange: (f: LedSignField) => void }) {
  return (
    <View style={styles.chips}>
      {fields.map((f) => (
        <Chip key={f} label={FIELD_LABEL[f]} size="sm" active={value === f} onPress={() => onChange(f)} />
      ))}
    </View>
  );
}

export function LedSignSettings() {
  const { theme } = useTheme();
  const { status, settings, discovered, error } = useLedSign();
  const { config } = settings;
  const [previewType, setPreviewType] = useState<LapType>('bonus');

  if (status === 'unsupported') {
    return (
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        The LED sign needs the Regularity app on iOS or Android, updated to a version with Bluetooth support.
      </Text>
    );
  }

  const { layout } = config;
  const editLayout = (patch: Partial<LedSignLayout>) =>
    LedSignService.updateConfig({ preset: 'custom', layout: { ...layout, ...patch } });
  const hasLiveField = LED_SIGN_LIVE_FIELDS.includes(layout.main.field) || LED_SIGN_LIVE_FIELDS.includes(layout.secondary.field);
  const preset = LED_SIGN_PRESETS.find((p) => p.id === config.preset);

  const nearest = (options: { value: string }[], v: number) =>
    options.reduce((best, o) => (Math.abs(Number(o.value) - v) < Math.abs(Number(best.value) - v) ? o : best)).value;

  const sectionTitle = (title: string) => <Text style={[styles.section, { color: theme.textSecondary }]}>{title}</Text>;
  const caption = (text: string) => <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{text}</Text>;
  const toggle = (title: string, subtitle: string, value: boolean, onValueChange: (v: boolean) => void) => (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {caption(subtitle)}
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
      <Collapsible
        title="How it works"
        icon="information-circle-outline"
        defaultOpen={!settings.deviceId}
        style={{ backgroundColor: theme.surfaceElevated }}
      >
        {HOW_IT_WORKS.map(([title, body], i) => (
          <View key={title} style={styles.step}>
            <View style={[styles.stepNumber, { backgroundColor: theme.primaryMuted }]}>
              <Text style={[styles.stepNumberText, { color: theme.primary }]}>{i + 1}</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.stepTitle, { color: theme.text }]}>{title}</Text>
              {caption(body)}
            </View>
          </View>
        ))}
        {caption('Keep this phone within about 10–30 m of the sign. Drivers can read it from about 50 m.')}
      </Collapsible>

      {/* Connection */}
      <View style={styles.statusRow}>
        <LiveDot
          active={status === 'connected' || status === 'scanning' || status === 'connecting'}
          color={status === 'connected' ? theme.success : status === 'idle' || status === 'poweredOff' ? theme.textMuted : theme.warning}
        />
        <View style={styles.rowText}>
          <Text style={[styles.title, { color: theme.text }]}>{settings.deviceName ?? 'No sign paired'}</Text>
          {caption(STATUS_LABEL[status])}
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
      {sectionTitle('Display')}
      <View style={styles.chips}>
        {LED_SIGN_PRESETS.map((p) => (
          <Chip
            key={p.id}
            label={p.label}
            active={config.preset === p.id}
            onPress={() => LedSignService.updateConfig({ preset: p.id, layout: p.layout })}
          />
        ))}
        <Chip label="Custom" icon="options-outline" active={config.preset === 'custom'} onPress={() => LedSignService.updateConfig({ preset: 'custom' })} />
      </View>
      {caption(preset ? preset.description : 'Your own layout — choose the fields and colours below.')}

      <View style={{ marginTop: spacing.md }}>
        <SignPreview config={config} lapType={previewType} />
        <View style={[styles.chips, { marginTop: spacing.sm }]}>
          {LED_SIGN_LAP_TYPES.map((t) => (
            <Chip key={t} label={LAP_TYPE_LABEL[t]} size="sm" color={rgb(config.colors[t])} active={previewType === t} onPress={() => setPreviewType(t)} />
          ))}
        </View>
      </View>

      {config.preset === 'custom' && (
        <View>
          {sectionTitle('Main line')}
          <FieldPicker fields={MAIN_FIELDS} value={layout.main.field} onChange={(field) => editLayout({ main: { ...layout.main, field } })} />
          <ColorPicker value={layout.main.color} onChange={(color) => editLayout({ main: { ...layout.main, color } })} />

          {sectionTitle('Second line')}
          <FieldPicker
            fields={SECONDARY_FIELDS}
            value={layout.secondary.field}
            onChange={(field) => editLayout({ secondary: { ...layout.secondary, field } })}
          />
          {layout.secondary.field !== 'none' && (
            <>
              <View style={{ marginTop: spacing.sm }}>
                <SegmentedControl<LedSignSecondarySize>
                  size="sm"
                  options={[
                    { label: 'Small strip', value: 'strip' },
                    { label: 'Third', value: 'third' },
                    { label: 'Half', value: 'half' },
                  ]}
                  value={layout.secondary.size}
                  onChange={(size) => editLayout({ secondary: { ...layout.secondary, size } })}
                />
              </View>
              <ColorPicker value={layout.secondary.color} onChange={(color) => editLayout({ secondary: { ...layout.secondary, color } })} />
            </>
          )}

          {hasLiveField && (
            <>
              {sectionTitle('After each lap, show')}
              <FieldPicker fields={HOLD_FIELDS} value={layout.holdField} onChange={(holdField) => editLayout({ holdField })} />
              <View style={{ marginTop: spacing.sm }}>
                <SegmentedControl
                  size="sm"
                  options={['0', '5', '8', '15'].map((v) => ({ label: v === '0' ? 'Off' : `${v} s`, value: v }))}
                  value={nearest([{ value: '0' }, { value: '5' }, { value: '8' }, { value: '15' }], layout.holdSec)}
                  onChange={(v) => editLayout({ holdSec: Number(v) })}
                />
              </View>
            </>
          )}
        </View>
      )}

      {sectionTitle('Decimals')}
      <SegmentedControl
        options={[
          { label: '+0.4 · 48.7', value: '1' },
          { label: '+0.42 · 48.74', value: '2' },
        ]}
        value={String(config.decimals)}
        onChange={(v) => LedSignService.updateConfig({ decimals: v === '2' ? 2 : 1 })}
      />

      {sectionTitle('Brightness')}
      <SegmentedControl
        options={BRIGHTNESS}
        value={nearest(BRIGHTNESS, config.brightness)}
        onChange={(v) => LedSignService.updateConfig({ brightness: Number(v) })}
      />

      {sectionTitle('Power source')}
      <SegmentedControl
        size="sm"
        scrollable
        options={POWER_SOURCES}
        value={nearest(POWER_SOURCES, config.powerBudgetW)}
        onChange={(v) => LedSignService.updateConfig({ powerBudgetW: Number(v) })}
      />
      {caption(
        config.powerBudgetW > 0
          ? `The sign dims itself to stay under about ${config.powerBudgetW} W, so the power bank never cuts out.`
          : 'No power limit — for the 12 V battery and 40 A converter.',
      )}
      {sectionTitle('Eco — light up only when the car is due')}
      <SegmentedControl
        size="sm"
        options={ECO_LEAD}
        value={nearest(ECO_LEAD, config.ecoLeadSec)}
        onChange={(v) => LedSignService.updateConfig({ ecoLeadSec: Number(v) })}
      />
      {caption(
        config.ecoLeadSec > 0
          ? `While the Timer runs, the sign stays dark until ${config.ecoLeadSec} s before the target and for 10 s after each lap. On a 1:45 lap that's about a quarter of the time, so a power bank lasts 2–3× longer.`
          : 'Always lit.',
      )}

      {/* Colours per lap type */}
      {sectionTitle('Lap type colours')}
      {LED_SIGN_LAP_TYPES.map((type) => {
        const color = config.colors[type];
        return (
          <View key={type} style={styles.colorRow}>
            <View style={[styles.swatchLabel, { borderColor: rgb(color) }]}>
              <Text style={[styles.title, { color: theme.text }]}>{LAP_TYPE_LABEL[type]}</Text>
            </View>
            <View style={[styles.swatches, { flex: 1, marginTop: 0 }]}>
              {SWATCHES.map((s) => (
                <Pressable
                  key={s.join(',')}
                  accessibilityLabel={`${LAP_TYPE_LABEL[type]} colour ${s.join(',')}`}
                  onPress={() => {
                    LedSignService.updateConfig({ colors: { ...config.colors, [type]: s } });
                    setPreviewType(type);
                  }}
                  style={[styles.swatch, { backgroundColor: rgb(s), borderColor: sameRgb(s, color) ? theme.text : 'transparent' }]}
                />
              ))}
            </View>
          </View>
        );
      })}

      <Divider faint />
      {toggle('Solid board on broken laps', 'Fill the whole sign with the broken colour, digits in black. Uses much more power.', config.fillOnBroken, (v) =>
        LedSignService.updateConfig({ fillOnBroken: v }),
      )}
      <Divider faint />
      {toggle('Flash safety car laps', 'Blink the sign on safety car laps', config.flashSafety, (v) =>
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
  step: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: typography.caption,
    fontWeight: fontWeights.bold,
  },
  stepTitle: {
    fontSize: typography.body,
    fontWeight: fontWeights.semibold,
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  preview: {
    width: '100%',
    aspectRatio: 2,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  previewLine: {
    justifyContent: 'center',
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  swatchLabel: {
    width: 104,
    borderLeftWidth: 4,
    paddingLeft: spacing.sm,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 2,
  },
});
