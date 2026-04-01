import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Colors from '@/constants/Colors';

type Gender = 'male' | 'female';

type AvatarProps = {
  firstName: string;
  lastName: string;
  gender?: Gender;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Remote profile image (e.g. Google-hosted URL from user.photoUrl). */
  photoUrl?: string;
};

const SIZES = { xs: 26, sm: 32, md: 48, lg: 64 };
const FONT_SIZES = { xs: 10, sm: 12, md: 18, lg: 24 };

export function Avatar({ firstName, lastName, gender, size = 'md', photoUrl }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  const bgColor =
    gender === 'male'
      ? Colors.avatarMale
      : gender === 'female'
        ? Colors.avatarFemale
        : Colors.avatarOther;
  const dim = SIZES[size];
  const fontSize = FONT_SIZES[size];
  const showImage = Boolean(photoUrl?.trim()) && !imageFailed;

  return (
    <View
      style={[
        styles.avatar,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: bgColor,
          overflow: 'hidden',
        },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: photoUrl!.trim() }}
          style={{ width: dim, height: dim }}
          onError={() => setImageFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
      )}
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
