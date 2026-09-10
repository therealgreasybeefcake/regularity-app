import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet, ColorValue } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

export interface LiveDotProps {
  size?: number;
  color?: ColorValue;
  /** Animate the halo pulse (set false for a static/ended state). */
  active?: boolean;
}

/** Pulsing dot for live/recording indicators. */
export function LiveDot({ size = 8, color, active = true }: LiveDotProps) {
  const { theme } = useTheme();
  const c = (color ?? theme.livePulse) as string;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) { pulse.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {active && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: size / 2, backgroundColor: c, transform: [{ scale: haloScale }], opacity: haloOpacity },
          ]}
        />
      )}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c }} />
    </View>
  );
}
