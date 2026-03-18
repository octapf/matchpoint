import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Pressable, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.miralab.matchpoint';

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setError('');
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Mínimo 8 caracteres, una mayúscula, una minúscula y un número.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (!token) {
      setError('Token inválido o expirado.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/email?action=reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setDone(true);
    } catch {
      setError('El link expiró o es inválido. Pedí uno nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>✅</Text>
        <Text style={styles.heading}>Contraseña actualizada</Text>
        <Text style={styles.subtitle}>
          {Platform.OS === 'web'
            ? 'Tu contraseña fue actualizada. Abrí la app para iniciar sesión.'
            : 'Ya podés iniciar sesión con tu nueva contraseña.'}
        </Text>
        {Platform.OS === 'web' ? (
          <Pressable
            style={styles.button}
            onPress={() => {
              // Try deep link first; if app not installed, fall back to Play Store
              Linking.openURL('com.miralab.matchpoint://sign-in').catch(() =>
                Linking.openURL(PLAY_STORE_URL)
              );
            }}
          >
            <Text style={styles.buttonText}>Abrir Matchpoint</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.button} onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.buttonText}>Ir al inicio de sesión</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.heading}>Nueva contraseña</Text>
        <Text style={styles.subtitle}>Ingresá tu nueva contraseña para Matchpoint.</Text>

        <TextInput
          style={styles.input}
          placeholder="Nueva contraseña"
          placeholderTextColor={Colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Confirmar contraseña"
          placeholderTextColor={Colors.textMuted}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Guardando...' : 'Guardar contraseña'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 24,
    justifyContent: 'center',
    gap: 14,
  },
  emoji: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 8,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.yellow,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  error: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
  },
  button: {
    backgroundColor: Colors.yellow,
    borderRadius: 50,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
});
