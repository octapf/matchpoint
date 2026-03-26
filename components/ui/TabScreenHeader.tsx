import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

type TabScreenHeaderProps = {
  title: string;
};

export function TabScreenHeader({ title }: TabScreenHeaderProps) {
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
});
