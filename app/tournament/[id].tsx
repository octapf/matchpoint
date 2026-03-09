import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTournament } from '@/lib/hooks/useTournaments';
import { useTeams } from '@/lib/hooks/useTeams';
import { useEntries, useCreateEntry } from '@/lib/hooks/useEntries';
import { useUserStore } from '@/store/useUserStore';

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const userId = useUserStore((s) => s.user?._id ?? null);

  const { data: tournament, isLoading: loadingTournament, isError: errorTournament, error: tournamentError } = useTournament(id);
  const { data: teams = [], isLoading: loadingTeams } = useTeams(id ? { tournamentId: id } : undefined);
  const { data: entries = [], isLoading: loadingEntries } = useEntries(id ? { tournamentId: id } : undefined);

  const createEntry = useCreateEntry();

  const hasJoined = entries.some((e) => e.userId === userId);
  const isLoading = loadingTournament;
  const isError = errorTournament;

  if (isLoading || !tournament) {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.skeletonBlock}>
          <Skeleton height={28} width="80%" style={{ marginBottom: 12 }} />
          <Skeleton height={18} width="50%" style={{ marginBottom: 8 }} />
          <Skeleton height={18} width="60%" style={{ marginBottom: 24 }} />
        </View>
        <View style={styles.skeletonBlock}>
          <Skeleton height={20} width="30%" style={{ marginBottom: 12 }} />
          {[1, 2].map((i) => (
            <View key={i} style={styles.teamCard}>
              <Skeleton height={18} width="40%" style={{ marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Skeleton height={36} width={80} borderRadius={18} />
                <Skeleton height={36} width={80} borderRadius={18} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{tournamentError?.message || 'Failed to load tournament'}</Text>
      </View>
    );
  }

  const teamsCount = teams.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{tournament.name}</Text>
        <Text style={styles.date}>{formatDate(tournament.date)}</Text>
        <Text style={styles.location}>{tournament.location}</Text>
        <Text style={styles.spots}>
          {teamsCount}/{tournament.maxTeams} teams
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Teams</Text>
        {loadingTeams ? (
          <View style={styles.teamCard}>
            <Skeleton height={18} width="40%" style={{ marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Skeleton height={36} width={80} borderRadius={18} />
              <Skeleton height={36} width={80} borderRadius={18} />
            </View>
          </View>
        ) : teams.length === 0 ? (
          <Text style={styles.emptyText}>No teams yet</Text>
        ) : (
          teams.map((team) => (
            <View key={team._id} style={styles.teamCard}>
              <Text style={styles.teamName}>{team.name}</Text>
              <View style={styles.players}>
                {[0, 1].map((i) =>
                  team.playerIds[i] ? (
                    <View key={i} style={styles.player}>
                      <Avatar firstName="Player" lastName="" gender="other" size="sm" />
                      <Text style={styles.playerName}>Player {i + 1}</Text>
                    </View>
                  ) : (
                    <View key={i} style={styles.slot}>
                      <Text style={styles.slotText}>Open slot</Text>
                    </View>
                  )
                )}
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.actions}>
        {!hasJoined && (
          <Button
            title="Join tournament"
            onPress={() => {
              if (!userId || !id) return;
              createEntry.mutate({ tournamentId: id, userId, lookingForPartner: true });
            }}
            disabled={createEntry.isPending}
            fullWidth
          />
        )}
        {hasJoined && (
          <Text style={styles.joinedBadge}>You've joined this tournament</Text>
        )}
        <Button
          title="Create team"
          variant="secondary"
          onPress={() => router.push(`/tournament/${id}/team/create`)}
          fullWidth
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40 },
  centered: { justifyContent: 'center', padding: 24 },
  skeletonBlock: { marginBottom: 24 },
  header: { marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  date: { fontSize: 16, color: Colors.textSecondary, marginBottom: 2 },
  location: { fontSize: 16, color: Colors.textSecondary, marginBottom: 8 },
  spots: { fontSize: 14, color: Colors.textMuted },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: Colors.text, marginBottom: 12 },
  teamCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  teamName: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 12 },
  players: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  player: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerName: { fontSize: 14, color: Colors.text },
  slot: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Colors.surfaceLight, borderRadius: 8 },
  slotText: { fontSize: 14, color: Colors.textMuted },
  actions: { gap: 12 },
  errorText: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center' },
  emptyText: { fontSize: 14, color: Colors.textMuted, fontStyle: 'italic' },
  joinedBadge: { fontSize: 14, color: Colors.yellow, textAlign: 'center', marginBottom: 8 },
});
