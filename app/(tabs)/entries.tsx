import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Avatar } from '@/components/ui/Avatar';
import Colors from '@/constants/Colors';
import { Skeleton } from '@/components/ui/Skeleton';
import { useEntries } from '@/lib/hooks/useEntries';
import { useTournament } from '@/lib/hooks/useTournaments';
import { useTeam } from '@/lib/hooks/useTeams';
import { useUserStore } from '@/store/useUserStore';
import type { Entry } from '@/types';

function EntryCard({ entry, tournamentName, teamName }: { entry: Entry; tournamentName?: string; teamName?: string }) {
  const hasTeam = !!entry.teamId;

  return (
    <Link href={`/tournament/${entry.tournamentId}`} asChild>
      <Pressable style={styles.card}>
        <Text style={styles.cardTitle}>{tournamentName ?? 'Tournament'}</Text>
        {hasTeam ? (
          <View style={styles.teamRow}>
            <Avatar firstName="You" lastName="" gender="other" size="sm" />
            <Text style={styles.teamName}>{teamName ?? 'Team'}</Text>
          </View>
        ) : (
          <Text style={styles.looking}>Looking for partner</Text>
        )}
      </Pressable>
    </Link>
  );
}

export default function MyEntriesScreen() {
  const userId = useUserStore((s) => s.user?._id ?? null);
  const { data: entries = [], isLoading, isError, error } = useEntries(
    userId ? { userId } : undefined,
    { enabled: !!userId }
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.scrollContent}>
          {[1, 2].map((i) => (
            <View key={i} style={styles.card}>
              <Skeleton height={22} width="70%" style={{ marginBottom: 8 }} />
              <Skeleton height={16} width="40%" />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Text style={styles.errorText}>{error?.message || 'Failed to load entries'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {entries.map((entry) => (
          <EntryCardWithData key={entry._id} entry={entry} />
        ))}
        {entries.length === 0 && (
          <Text style={styles.emptyText}>No entries yet. Join a tournament to get started.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function EntryCardWithData({ entry }: { entry: Entry }) {
  const { data: tournament } = useTournament(entry.tournamentId);
  const { data: team } = useTeam(entry.teamId ?? undefined);

  return (
    <EntryCard
      entry={entry}
      tournamentName={tournament?.name}
      teamName={team?.name}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamName: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  looking: {
    fontSize: 14,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  errorContainer: {
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
