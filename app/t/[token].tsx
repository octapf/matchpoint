import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTournamentByToken } from '@/lib/hooks/useTournaments';
import { useEntries, useCreateEntry } from '@/lib/hooks/useEntries';
import { useUserStore } from '@/store/useUserStore';

export default function JoinViaLinkScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const userId = useUserStore((s) => s.user?._id ?? null);

  const { data: tournament, isLoading, isError } = useTournamentByToken(token || undefined);
  const tournamentId = tournament?._id;
  const { data: entries = [] } = useEntries(tournamentId ? { tournamentId } : undefined, { enabled: !!tournamentId });
  const createEntry = useCreateEntry();

  const hasJoined = entries.some((e) => e.userId === userId);

  const handleJoin = () => {
    if (!tournamentId || !userId) return;
    if (hasJoined) {
      router.replace(`/tournament/${tournamentId}`);
      return;
    }
    createEntry.mutate(
      { tournamentId, userId, lookingForPartner: true },
      {
        onSuccess: () => router.replace(`/tournament/${tournamentId}`),
        onError: () => router.replace(`/tournament/${tournamentId}`),
      }
    );
  };

  const handleViewOnly = () => {
    if (tournamentId) router.replace(`/tournament/${tournamentId}`);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Skeleton height={28} width="70%" style={{ marginBottom: 16 }} />
        <Skeleton height={18} width="90%" style={{ marginBottom: 24 }} />
        <Skeleton height={48} width="100%" style={{ marginBottom: 12 }} />
        <Skeleton height={48} width="100%" />
      </View>
    );
  }

  if (isError || !tournament) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Invalid link</Text>
        <Text style={styles.subtitle}>This tournament link may be expired or invalid.</Text>
        <Button title="Go back" onPress={() => router.back()} fullWidth />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join Tournament</Text>
      <Text style={styles.tournamentName}>{tournament.name}</Text>
      <Text style={styles.subtitle}>
        {hasJoined ? "You've already joined. View tournament details." : "You've been invited to join this tournament."}
      </Text>
      <Button
        title={hasJoined ? 'View tournament' : 'Join tournament'}
        onPress={handleJoin}
        disabled={createEntry.isPending}
        fullWidth
      />
      <Button
        title="Cancel"
        onPress={() => router.back()}
        variant="outline"
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  tournamentName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.yellow,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  token: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 32,
  },
});
