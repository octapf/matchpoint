import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { useUserStore } from '@/store/useUserStore';
import type { Gender } from '@/types';

function formatGender(g?: Gender): string {
  if (!g) return '—';
  return { male: 'Male', female: 'Female', other: 'Other' }[g] || g;
}

export default function ProfileScreen() {
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const signOut = useUserStore((s) => s.signOut);

  const handleSignOut = async () => {
    try {
      await GoogleSignin.signOut();
    } catch (_) {}
    signOut();
    router.replace('/(auth)/sign-in');
  };

  const handleDeleteAccount = () => {
    Alert.alert('Delete account', 'This will be implemented soon. Contact support for now.', [{ text: 'OK' }]);
  };

  if (!user) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>No user data</Text>
        <Button title="Sign in" onPress={() => router.replace('/(auth)/sign-in')} fullWidth />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarSection}>
          <Avatar
            firstName={user.firstName || ''}
            lastName={user.lastName || ''}
            gender={user.gender || 'other'}
            size="lg"
          />
          <Text style={styles.name}>{[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}</Text>
          <Text style={styles.email}>{user.email || '—'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>First name</Text>
          <Text style={styles.value}>{user.firstName || '—'}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Last name</Text>
          <Text style={styles.value}>{user.lastName || '—'}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Gender</Text>
          <Text style={styles.value}>{formatGender(user.gender)}</Text>
        </View>

        <Text style={styles.footer}>Matchpoint by Miralab</Text>
        <Text style={styles.copyright}>© 2026 Miralab</Text>
      </ScrollView>

      <View style={styles.buttonsFooter} collapsable={false}>
        <TouchableOpacity
          style={[styles.signOutButton, styles.primaryButton]}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Sign out</Text>
        </TouchableOpacity>
        <View style={styles.spacer} />
        <Button title="Delete account" onPress={handleDeleteAccount} variant="outline" fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  buttonsFooter: {
    padding: 24,
    paddingBottom: 48,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceLight,
  },
  signOutButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  primaryButton: {
    backgroundColor: Colors.yellow,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  content: {
    padding: 24,
    paddingBottom: 24,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  name: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 12,
  },
  email: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: Colors.text,
  },
  spacer: {
    height: 12,
  },
  footer: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 32,
  },
  copyright: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
});
