import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/Colors';
import { useTheme } from '@/lib/theme/useTheme';
import { MPMark } from '@/components/ui/MPMark';

type TabScreenHeaderProps = {
  title: string;
  /** e.g. notifications bell — aligned top-right */
  rightAccessory?: React.ReactNode;
};

export function TabScreenHeader({ title, rightAccessory }: TabScreenHeaderProps) {
  const { tokens } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.logo} pointerEvents="none">
        <MPMark size={50} accessibilityLabel={title} />
      </View>
      <Text style={[styles.title, { color: tokens.lightText }]} accessible={false}>
        {title}
      </Text>
      {rightAccessory ? <View style={styles.rightAccessory}>{rightAccessory}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    minHeight: 50,
    marginBottom: 14,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  logo: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 50,
    width: 50,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    fontStyle: 'italic',
    color: Colors.text,
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  rightAccessory: {
    position: 'absolute',
    right: 0,
    top: 0,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
