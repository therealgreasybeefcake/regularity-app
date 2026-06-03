import React, { useState } from 'react';
import { View, TextInput, TextInputProps, StyleSheet, ViewStyle, Platform, StyleProp } from 'react-native';
import { radius, spacing, typography, fonts } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Label } from './Text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  /** Tabular mono input — numeric/time fields. */
  mono?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  right?: React.ReactNode;
}

export function TextField({ label, mono, containerStyle, right, style, onFocus, onBlur, ...rest }: TextFieldProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={containerStyle}>
      {label ? <Label style={{ marginBottom: 6 }}>{label}</Label> : null}
      <View
        style={[
          styles.box,
          { backgroundColor: theme.surface, borderColor: focused ? theme.accent : theme.border },
          focused && { borderWidth: 1.5 },
        ]}
      >
        <TextInput
          {...rest}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          placeholderTextColor={theme.textMuted as string}
          style={[
            styles.input,
            { color: theme.text as string, fontFamily: mono ? fonts.monoMedium : undefined },
            // RN web needs outline removed; harmless on native.
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
            style,
          ]}
        />
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
  // minWidth:0 lets the flex:1 input shrink below the HTML input's intrinsic width
  // on RN-web — without it, narrow fixed-width fields (e.g. the 96px Settings number
  // boxes) overflow and the right-aligned value paints outside the box.
  input: { flex: 1, minWidth: 0, height: 46, fontSize: typography.bodyLg },
});
