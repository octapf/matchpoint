import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import Colors from '@/constants/Colors';

type Props = {
  title: string;
  subtitle?: string;
  onPress: () => void;
};

export function AdminNavRow({ title, subtitle, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.chevron} accessibilityElementsHidden>
        ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    minHeight: 52,
  },
  pressed: {
    opacity: 0.92,
  },
  textCol: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  sub: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
    color: Colors.textMuted,
  },
});
