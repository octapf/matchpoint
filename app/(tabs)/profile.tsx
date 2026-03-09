import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';

export default function ProfileScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatarSection}>
        <Avatar firstName="John" lastName="Doe" gender="male" size="lg" />
        <Text style={styles.name}>John Doe</Text>
        <Text style={styles.email}>john@example.com</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>First name</Text>
        <Text style={styles.value}>John</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Last name</Text>
        <Text style={styles.value}>Doe</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Gender</Text>
        <Text style={styles.value}>Male</Text>
      </View>

      <View style={styles.buttons}>
        <Button title="Sign out" onPress={() => {}} variant="outline" fullWidth />
        <View style={styles.spacer} />
        <Button title="Delete account" onPress={() => {}} variant="outline" fullWidth />
      </View>

      <Text style={styles.footer}>Matchpoint by Miralab</Text>
      <Text style={styles.copyright}>© 2026 Miralab</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 24,
    paddingBottom: 48,
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
  buttons: {
    marginTop: 24,
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
