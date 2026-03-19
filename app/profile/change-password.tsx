import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useUserStore } from '@/store/useUserStore';
import { authApi } from '@/lib/api';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const user = useUserStore((s) => s.user);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);

  function validate() {
    if (!currentPassword) return 'Ingresá tu contraseña actual';
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return 'La nueva contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.';
    }
    if (newPassword !== confirmPassword) return 'Las contraseñas no coinciden';
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      Alert.alert('Error', err);
      return;
    }
    if (!user?._id) return;
    setLoading(true);
    try {
      await authApi.changePassword(user._id, currentPassword, newPassword);
      Alert.alert('Listo', 'Contraseña actualizada.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar');
    } finally {
      setLoading(false);
    }
  }

  if (!user || user.authProvider !== 'email') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Solo los usuarios con email pueden cambiar la contraseña.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.title}>Cambiar contraseña</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Contraseña actual</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry={!showCurrent}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowCurrent((s) => !s)} style={styles.eyeBtn}>
              <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={22} color={Colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Nueva contraseña</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Mín. 8 chars, mayúscula, minúscula y número"
              placeholderTextColor={Colors.textMuted}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNew}
              autoCapitalize="none"
            />
            <Pressable onPress={() => setShowNew((s) => !s)} style={styles.eyeBtn}>
              <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={22} color={Colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirmar nueva contraseña</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={Colors.textMuted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Guardando...' : 'Guardar'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 24 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, height: 52, paddingHorizontal: 16, fontSize: 15, color: Colors.text, flex: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, paddingRight: 12 },
  eyeBtn: { padding: 8 },
  button: { backgroundColor: Colors.yellow, borderRadius: 50, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.background, fontSize: 16, fontWeight: '700' },
  errorText: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center', marginTop: 24 },
});
