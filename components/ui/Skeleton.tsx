import React from 'react';
import { View, StyleSheet } from 'react-native';
import Colors from '@/constants/Colors';

import type { StyleProp, ViewStyle } from 'react-native';

type SkeletonProps = {
  width?: ViewStyle['width'];
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = '100%', height = 20, borderRadius = 8, style }: SkeletonProps) {
  return (
    <View
      style={[
        styles.skeleton,
        { width, height, borderRadius },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: Colors.surfaceLight,
    opacity: 0.6,
  },
});
