import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { useTheme } from '@/lib/theme/useTheme';

function rgba(hex: string, a: number) {
  const raw = hex.trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(0,0,0,${a})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const aa = Math.max(0, Math.min(1, a));
  return `rgba(${r}, ${g}, ${b}, ${aa})`;
}

/**
 * Single subtle app background:
 * - vertical gradient bottom→top
 * - uses preset accents + black
 * - no animation, no shapes (very cheap)
 */
export function AppBackgroundGradient() {
  const { tokens } = useTheme();

  const stops = useMemo(() => {
    const a = rgba(tokens.accent, 0.16);
    const b = rgba(tokens.accentSecondary, 0.12);
    return { a, b };
  }, [tokens.accent, tokens.accentSecondary]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { opacity: 0.5 }]}>
      <Svg style={StyleSheet.absoluteFillObject} viewBox="0 0 1 1" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id="appBg" x1="0" y1="1" x2="0" y2="0">
            {/* Bottom: subtle accents */}
            <Stop offset="0" stopColor={stops.a} stopOpacity={1} />
            <Stop offset="0.32" stopColor={stops.b} stopOpacity={1} />
            {/* Mid: fade into black */}
            <Stop offset="0.62" stopColor="rgba(0,0,0,0.55)" stopOpacity={1} />
            {/* Top: black */}
            <Stop offset="1" stopColor="#000" stopOpacity={1} />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width={1} height={1} fill="url(#appBg)" />
      </Svg>
      {/* Tiny scrim to keep text readability consistent */}
      <View style={[StyleSheet.absoluteFillObject, styles.scrim]} />
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.10)' },
});

