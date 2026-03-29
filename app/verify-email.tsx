import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/Colors';
import { useTranslation } from '@/lib/i18n';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.miralab.matchpoint';

type ErrorKind = 'none' | 'invalid' | 'connection' | 'failed';

export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errorKind, setErrorKind] = useState<ErrorKind>('none');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorKind('invalid');
      return;
    }
    fetch('/api/auth/email?action=verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.message) {
          setStatus('ok');
        } else {
          setStatus('error');
          setErrorKind('failed');
        }
      })
      .catch(() => {
        setStatus('error');
        setErrorKind('connection');
      });
  }, [token]);

  const message = useMemo(() => {
    if (status === 'loading') return '';
    if (status === 'ok') return t('emailVerify.success');
    if (errorKind === 'invalid') return t('emailVerify.invalidLink');
    if (errorKind === 'connection') return t('emailVerify.connectionError');
    if (errorKind === 'failed') return t('emailVerify.verifyFailed');
    return '';
  }, [status, errorKind, t]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {status === 'loading' && t('emailVerify.verifying')}
        {status === 'ok' && '✅'}
        {status === 'error' && '❌'}
      </Text>
      <Text style={styles.message}>{message}</Text>
      {status === 'ok' && Platform.OS === 'web' && (
        <Pressable style={styles.button} onPress={() => Linking.openURL(PLAY_STORE_URL)}>
          <Text style={styles.buttonText}>{t('emailVerify.openMatchpoint')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 48, marginBottom: 16 },
  message: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: Colors.yellow, borderRadius: 50, paddingVertical: 14, paddingHorizontal: 28 },
  buttonText: { color: Colors.background, fontWeight: '700', fontSize: 16 },
});
