import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme/useTheme';

type MPMarkProps = {
  size?: number;
  accessibilityLabel?: string;
};

export function MPMark({ size = 50, accessibilityLabel }: MPMarkProps) {
  const { tokens } = useTheme();

  // Render as text so colors can follow the active preset at runtime.
  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? 'Matchpoint'}
    >
      <Text style={[styles.text, { fontSize: Math.round(size * 0.64) }]} numberOfLines={1} adjustsFontSizeToFit>
        <Text
          style={[
            styles.letter,
            {
              color: tokens.accent,
              textShadowColor: tokens.accent,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 0.6,
            },
          ]}
        >
          M
        </Text>
        <Text
          style={[
            styles.letter,
            {
              color: tokens.accentSecondary,
              textShadowColor: tokens.accentSecondary,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 0.6,
            },
          ]}
        >
          P
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '900',
    fontStyle: 'italic',
    // Keep letters tight like the legacy mark.
    letterSpacing: -4,
    includeFontPadding: false,
    transform: [{ scaleY: 0.85 }],
  },
  letter: {
    fontWeight: '900',
    fontStyle: 'italic',
  },
});

