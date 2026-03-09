import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { useCreateTournament } from '@/lib/hooks/useTournaments';
import { useUserStore } from '@/store/useUserStore';

function generateInviteToken() {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function CreateTournamentScreen() {
  const router = useRouter();
  const userId = useUserStore((s) => s.user?._id ?? null);
  const createTournament = useCreateTournament();

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [maxTeams, setMaxTeams] = useState('16');
  const [description, setDescription] = useState('');

  const handleCreate = () => {
    if (!name.trim() || !date.trim() || !location.trim()) {
      Alert.alert('Missing fields', 'Please fill in name, date, and location.');
      return;
    }
    const max = parseInt(maxTeams, 10) || 16;
    if (max < 2 || max > 64) {
      Alert.alert('Invalid max teams', 'Max teams must be between 2 and 64.');
      return;
    }
    if (!userId) {
      Alert.alert('Error', 'You must be signed in to create a tournament.');
      return;
    }

    const inviteToken = generateInviteToken();
    createTournament.mutate(
      {
        name: name.trim(),
        date: date.trim(),
        location: location.trim(),
        maxTeams: max,
        description: description.trim() || undefined,
        inviteLink: inviteToken,
        organizerIds: [userId],
      },
      {
        onSuccess: (data) => {
          router.replace(`/tournament/${data._id}`);
        },
        onError: (err) => {
          Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create tournament');
        },
      }
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create tournament</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Summer Beach Cup"
          placeholderTextColor={Colors.textMuted}
          value={name}
          onChangeText={setName}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Jul 15, 2026"
          placeholderTextColor={Colors.textMuted}
          value={date}
          onChangeText={setDate}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Barceloneta Beach"
          placeholderTextColor={Colors.textMuted}
          value={location}
          onChangeText={setLocation}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Max teams</Text>
        <TextInput
          style={styles.input}
          placeholder="16"
          placeholderTextColor={Colors.textMuted}
          keyboardType="number-pad"
          value={maxTeams}
          onChangeText={setMaxTeams}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Add details..."
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
          value={description}
          onChangeText={setDescription}
        />
      </View>

      <Button
        title="Create"
        onPress={handleCreate}
        disabled={createTournament.isPending}
        fullWidth
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 24 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
});
