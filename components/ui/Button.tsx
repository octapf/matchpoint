import React, { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { readableTextOnBackground } from '@/lib/theme/colors';
import { useTheme } from '@/lib/theme/useTheme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'dangerOutline' | 'muted';
  fullWidth?: boolean;
  size?: 'md' | 'sm';
  iconLeft?: keyof typeof Ionicons.glyphMap;
  /** When set, rendered instead of `iconLeft` (e.g. non-Ionicons medal). */
  iconLeftSlot?: ReactNode;
  disabled?: boolean;
  /** Shows a centered spinner without resizing the button. */
  loading?: boolean;
  /** Merged after variant text styles (e.g. `{ fontStyle: 'italic' }`). */
  titleStyle?: StyleProp<TextStyle>;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  fullWidth,
  size = 'md',
  iconLeft,
  iconLeftSlot,
  disabled,
  loading,
  titleStyle,
}: ButtonProps) {
  const { tokens } = useTheme();
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isDanger = variant === 'danger';
  const isDangerOutline = variant === 'dangerOutline';
  const isMuted = variant === 'muted';
  const isSmall = size === 'sm';
  const primaryTextTone = readableTextOnBackground(tokens.accent, tokens);
  const primaryTextColor = primaryTextTone === 'light' ? tokens.lightText : tokens.darkTextSecondary;
  const secondaryTextTone = readableTextOnBackground(tokens.accentHover, tokens);
  const secondaryTextColor = secondaryTextTone === 'light' ? tokens.lightText : tokens.darkTextSecondary;
  const baseTextColor =
    isPrimary ? primaryTextColor : isSecondary ? secondaryTextColor : isDanger ? '#fff' : isMuted ? '#fff' : undefined;
  const titleStyleFlat = titleStyle ? (StyleSheet.flatten(titleStyle) as TextStyle) : null;
  const resolvedTextColor =
    (titleStyleFlat && typeof titleStyleFlat.color === 'string' ? titleStyleFlat.color : null) ??
    baseTextColor ??
    Colors.text;

  const iconColor =
    variant === 'outline'
      ? Colors.text
      : isDangerOutline
        ? Colors.danger
        : isPrimary
          ? resolvedTextColor
          : isSecondary
            ? resolvedTextColor
            : isMuted
              ? resolvedTextColor
            : '#fff';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        isSmall && styles.buttonSm,
        fullWidth && styles.fullWidth,
        isPrimary && { backgroundColor: tokens.accent },
        isSecondary && { backgroundColor: tokens.accentHover },
        isMuted && styles.muted,
        variant === 'outline' && styles.outline,
        isDanger && styles.danger,
        isDangerOutline && styles.dangerOutline,
        (isPrimary || isSecondary || isDanger || isMuted) && styles.elevated,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.content}>
        {iconLeftSlot ? (
          <View style={{ marginRight: 8 }}>{iconLeftSlot}</View>
        ) : iconLeft && !loading ? (
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
            isPrimary && { color: resolvedTextColor },
            isSecondary && { color: resolvedTextColor },
            variant === 'outline' && styles.outlineText,
            isDanger && styles.dangerText,
            isDangerOutline && styles.dangerOutlineText,
            isMuted && styles.mutedText,
            loading ? styles.loadingTextHidden : null,
            titleStyle,
          ]}
        >
          {title}
        </Text>
        {loading ? (
          <View style={styles.spinnerOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color={resolvedTextColor} />
          </View>
        ) : null}
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
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
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
  muted: {
    backgroundColor: Colors.textMuted,
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
  loadingTextHidden: {
    opacity: 0,
  },
  outlineText: {
    color: Colors.text,
  },
  dangerText: {
    color: '#fff',
  },
  mutedText: {
    color: '#fff',
  },
  dangerOutlineText: {
    color: Colors.danger,
  },
});
