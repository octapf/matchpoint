import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';

const GRAD_ID = 'matchpointWeatherPanelBg';

type Props = { colors: string[] };

/**
 * Full-bleed diagonal gradient using react-native-svg (already linked).
 * Avoids expo-linear-gradient, which requires a native rebuild of the dev client.
 */
export function WeatherPanelGradientLayer({ colors }: Props) {
  const stops = useMemo(() => {
    const n = colors.length;
    if (n < 2) {
      const c = colors[0] ?? '#2d2d2d';
      return [
        <Stop key="a" offset={0} stopColor={c} />,
        <Stop key="b" offset={1} stopColor={c} />,
      ];
    }
    return colors.map((c, i) => (
      <Stop key={i} offset={i / (n - 1)} stopColor={c} />
    ));
  }, [colors]);

  return (
    <Svg style={StyleSheet.absoluteFillObject} viewBox="0 0 1 1" preserveAspectRatio="none">
      <Defs>
        <SvgLinearGradient id={GRAD_ID} x1="0" y1="0" x2="1" y2="1">
          {stops}
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={1} height={1} fill={`url(#${GRAD_ID})`} />
    </Svg>
  );
}
