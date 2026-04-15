import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { readableTextOnBackground } from '@/lib/theme/colors';
import { useTheme } from '@/lib/theme/useTheme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'dangerOutline';
  fullWidth?: boolean;
  size?: 'md' | 'sm';
  iconLeft?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', fullWidth, size = 'md', iconLeft, disabled }: ButtonProps) {
  const { tokens } = useTheme();
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isDanger = variant === 'danger';
  const isDangerOutline = variant === 'dangerOutline';
  const isSmall = size === 'sm';
  const primaryTextTone = readableTextOnBackground(tokens.accent, tokens);
  const primaryTextColor = primaryTextTone === 'light' ? tokens.lightText : tokens.darkTextSecondary;
  const secondaryTextTone = readableTextOnBackground(tokens.accentHover, tokens);
  const secondaryTextColor = secondaryTextTone === 'light' ? tokens.lightText : tokens.darkTextSecondary;
  const iconColor =
    variant === 'outline'
      ? Colors.text
      : isDangerOutline
        ? Colors.danger
        : isPrimary
          ? primaryTextColor
          : isSecondary
            ? secondaryTextColor
            : '#fff';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        isSmall && styles.buttonSm,
        fullWidth && styles.fullWidth,
        isPrimary && { backgroundColor: tokens.accent },
        isSecondary && { backgroundColor: tokens.accentHover },
        variant === 'outline' && styles.outline,
        isDanger && styles.danger,
        isDangerOutline && styles.dangerOutline,
        (isPrimary || isSecondary || isDanger) && styles.elevated,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.content}>
        {iconLeft ? (
          <Ionicons
            name={iconLeft}
            size={isSmall ? 16 : 18}
            color={disabled ? Colors.textMuted : iconColor}
            style={{ marginRight: 8 }}
          />
        ) : null}
        <Text
          style={[
            styles.text,
            isSmall && styles.textSm,
            isPrimary && { color: primaryTextColor },
            isSecondary && { color: secondaryTextColor },
            variant === 'outline' && styles.outlineText,
            isDanger && styles.dangerText,
            isDangerOutline && styles.dangerOutlineText,
          ]}
        >
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSm: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  danger: {
    backgroundColor: Colors.danger,
  },
  /** Same `Colors.danger` as profile delete account — transparent fill, border only. */
  dangerOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.danger,
  },
  elevated: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  pressed: {
    transform: [{ translateY: 1 }],
    opacity: 0.94,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
  textSm: {
    fontSize: 13,
    fontWeight: '800',
  },
  outlineText: {
    color: Colors.text,
  },
  dangerText: {
    color: '#fff',
  },
  dangerOutlineText: {
    color: Colors.danger,
  },
});
