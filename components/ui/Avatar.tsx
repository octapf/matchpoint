import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/Colors';

type Gender = 'male' | 'female';

type AvatarProps = {
  firstName: string;
  lastName: string;
  gender?: Gender;
  size?: 'sm' | 'md' | 'lg';
};

const SIZES = { sm: 32, md: 48, lg: 64 };
const FONT_SIZES = { sm: 12, md: 18, lg: 24 };

export function Avatar({ firstName, lastName, gender, size = 'md' }: AvatarProps) {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  const bgColor =
    gender === 'male'
      ? Colors.avatarMale
      : gender === 'female'
        ? Colors.avatarFemale
        : Colors.avatarOther;
  const dim = SIZES[size];
  const fontSize = FONT_SIZES[size];

  return (
    <View style={[styles.avatar, { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: bgColor }]}>
      <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#1a1a1a',
    fontWeight: '600',
  },
});
