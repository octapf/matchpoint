import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useCreateTeam } from '@/lib/hooks/useTeams';
import { useUserStore } from '@/store/useUserStore';

export default function CreateTeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const userId = useUserStore((s) => s.user?._id ?? null);
  const createTeam = useCreateTeam();

  const [teamName, setTeamName] = useState('');

  const handleCreate = () => {
    if (!teamName.trim()) {
      Alert.alert('Missing name', 'Please enter a team name.');
      return;
    }
    if (!id || !userId) {
      Alert.alert('Error', 'Missing tournament or user.');
      return;
    }

    createTeam.mutate(
      {
        tournamentId: id,
        name: teamName.trim(),
        playerIds: [userId],
        createdBy: userId,
      },
      {
        onSuccess: () => {
          router.back();
        },
        onError: (err) => {
          Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create team');
        },
      }
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create team</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Team name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Team Alpha"
          placeholderTextColor={Colors.textMuted}
          value={teamName}
          onChangeText={setTeamName}
        />
      </View>

      <View style={styles.players}>
        <Text style={styles.label}>Players (2)</Text>
        <View style={styles.playerRow}>
          <Avatar firstName="You" lastName="" gender="other" size="md" />
          <Text style={styles.playerLabel}>You (creator)</Text>
        </View>
        <View style={styles.slot}>
          <Text style={styles.slotText}>Open slot — invite a partner</Text>
        </View>
      </View>

      <Button
        title="Create team"
        onPress={handleCreate}
        disabled={createTeam.isPending}
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 20 },
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
  players: { marginBottom: 24 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  playerLabel: { fontSize: 16, color: Colors.text },
  slot: { padding: 16, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.surfaceLight, borderStyle: 'dashed' },
  slotText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
});
