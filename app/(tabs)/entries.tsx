import React from 'react';
import { useTranslation } from '@/lib/i18n';
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

function EntryCard({
  entry,
  tournamentName,
  teamName,
  userGender,
  t,
}: {
  entry: Entry;
  tournamentName?: string;
  teamName?: string;
  userGender?: 'male' | 'female';
  t: (k: string) => string;
}) {
  const hasTeam = !!entry.teamId;

  return (
    <Link href={`/tournament/${entry.tournamentId}`} asChild>
      <Pressable style={styles.card}>
        <Text style={styles.cardTitle}>{tournamentName ?? t('common.tournament')}</Text>
        {hasTeam ? (
          <View style={styles.teamRow}>
            <Avatar firstName={t('common.you')} lastName="" gender={userGender} size="sm" />
            <Text style={styles.teamName}>{teamName ?? t('common.team')}</Text>
          </View>
        ) : (
          <Text style={styles.looking}>{t('entries.lookingForPartner')}</Text>
        )}
      </Pressable>
    </Link>
  );
}

export default function MyEntriesScreen() {
  const { t } = useTranslation();
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
        <Text style={styles.errorText}>{error?.message || t('entries.failedToLoad')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {entries.map((entry) => (
          <EntryCardWithData key={entry._id} entry={entry} t={t} />
        ))}
        {entries.length === 0 && (
          <Text style={styles.emptyText}>{t('entries.noEntries')}</Text>
        )}
      </ScrollView>
    </View>
  );
}

function EntryCardWithData({ entry, t }: { entry: Entry; t: (k: string) => string }) {
  const user = useUserStore((s) => s.user);
  const { data: tournament } = useTournament(entry.tournamentId);
  const { data: team } = useTeam(entry.teamId ?? undefined);
  const userGender = user?.gender === 'male' || user?.gender === 'female' ? user.gender : undefined;

  return (
    <EntryCard
      entry={entry}
      tournamentName={tournament?.name}
      teamName={team?.name}
      userGender={userGender}
      t={t}
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
