import React from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useTheme } from '@/lib/theme/useTheme';

type IconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  color?: string;
  size?: number;
  /** Smaller touch target — use in dense rows (still meets ~34pt minimum). */
  compact?: boolean;
  style?: ViewStyle;
};

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  disabled,
  color,
  size = 22,
  compact,
  style,
}: IconButtonProps) {
  const { tokens } = useTheme();
  const effectiveColor = color ?? tokens.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={compact ? { top: 6, bottom: 6, left: 6, right: 6 } : { top: 10, bottom: 10, left: 10, right: 10 }}
      style={({ pressed }) => [
        styles.hit,
        compact && styles.hitCompact,
        { opacity: disabled ? 0.45 : pressed ? 0.72 : 1 },
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={effectiveColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hitCompact: {
    minWidth: 34,
    minHeight: 34,
  },
});
