import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/Colors';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  fullWidth?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', fullWidth, disabled }: ButtonProps) {
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isDanger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        fullWidth && styles.fullWidth,
        isPrimary && styles.primary,
        isSecondary && styles.secondary,
        variant === 'outline' && styles.outline,
        isDanger && styles.danger,
        (isPrimary || isSecondary || isDanger) && styles.elevated,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.text,
          isPrimary && styles.primaryText,
          isSecondary && styles.secondaryText,
          variant === 'outline' && styles.outlineText,
          isDanger && styles.dangerText,
        ]}
      >
        {title}
      </Text>
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
  fullWidth: {
    width: '100%',
  },
  primary: {
    backgroundColor: Colors.yellow,
  },
  secondary: {
    backgroundColor: Colors.violet,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.surfaceLight,
  },
  danger: {
    backgroundColor: Colors.danger,
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
  primaryText: {
    color: '#1a1a1a',
  },
  secondaryText: {
    color: '#fff',
  },
  outlineText: {
    color: Colors.text,
  },
  dangerText: {
    color: '#fff',
  },
});
