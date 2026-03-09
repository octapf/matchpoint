import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/Colors';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  fullWidth?: boolean;
};

export function Button({ title, onPress, variant = 'primary', fullWidth }: ButtonProps) {
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        fullWidth && styles.fullWidth,
        isPrimary && styles.primary,
        isSecondary && styles.secondary,
        variant === 'outline' && styles.outline,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.text,
          isPrimary && styles.primaryText,
          isSecondary && styles.secondaryText,
          variant === 'outline' && styles.outlineText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
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
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
  },
  pressed: {
    opacity: 0.9,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
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
});
