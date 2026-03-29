import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTranslation } from '@/lib/i18n';

/**
 * Thin banner when the device has no network (native + web via NetInfo).
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const sync = () => setOffline(!window.navigator.onLine);
      sync();
      window.addEventListener('online', sync);
      window.addEventListener('offline', sync);
      return () => {
        window.removeEventListener('online', sync);
        window.removeEventListener('offline', sync);
      };
    }

    const unsub = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return () => unsub();
  }, []);

  if (!offline) return null;

  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <Text style={styles.text}>{t('common.offlineBanner')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(185, 28, 28, 0.25)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248, 113, 113, 0.4)',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  text: {
    color: '#fecaca',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
});
