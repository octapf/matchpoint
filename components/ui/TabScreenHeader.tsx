import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

type TabScreenHeaderProps = {
  title: string;
  /** e.g. notifications bell — aligned top-right */
  rightAccessory?: React.ReactNode;
};

export function TabScreenHeader({ title, rightAccessory }: TabScreenHeaderProps) {
  return (
    <View style={styles.row}>
      <Image
        source={require('@/assets/images/android-icon-foreground.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel={title}
      />
      <Text style={styles.title} accessible={false}>
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
    color: '#ffffff',
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
