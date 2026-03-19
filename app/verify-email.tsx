import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/Colors';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.miralab.matchpoint';

export default function VerifyEmailScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Link inválido');
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
          setMessage('Email verificado correctamente.');
        } else {
          setStatus('error');
          setMessage(data.error || 'Error');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Error de conexión');
      });
  }, [token]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {status === 'loading' && 'Verificando...'}
        {status === 'ok' && '✅'}
        {status === 'error' && '❌'}
      </Text>
      <Text style={styles.message}>{message}</Text>
      {status === 'ok' && Platform.OS === 'web' && (
        <Pressable style={styles.button} onPress={() => Linking.openURL(PLAY_STORE_URL)}>
          <Text style={styles.buttonText}>Abrir Matchpoint</Text>
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
