import React, { useLayoutEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, ScrollView, Share, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import type { Gender, User } from '@/types';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { config } from '@/lib/config';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTournament, useDeleteTournament } from '@/lib/hooks/useTournaments';
import { useTeams } from '@/lib/hooks/useTeams';
import { useEntries, useCreateEntry } from '@/lib/hooks/useEntries';
import { useUsers } from '@/lib/hooks/useUsers';
import { useUserStore } from '@/store/useUserStore';
import { getUserDisplayName } from '@/lib/utils/userDisplay';
import { formatTournamentDate } from '@/lib/utils/dateFormat';
import type { Team } from '@/types';

function TeamCard({
  team,
  userMap,
  currentUserId,
  t,
}: {
  team: Team;
  userMap: Record<string, User>;
  currentUserId: string | null;
  t: (key: string, options?: Record<string, string | number>) => string;
}) {
  return (
    <View style={styles.teamCard}>
      <Text style={styles.teamName}>{team.name}</Text>
      <View style={styles.players}>
        {[0, 1].map((i) => {
          const pid = team.playerIds?.[i];
          const user = pid ? userMap[pid] : null;
          const displayName = user ? getUserDisplayName(user) : null;
          const isYou = pid === currentUserId;
          return pid ? (
            <View key={i} style={styles.player}>
              <Avatar
                firstName={user?.firstName ?? ''}
                lastName={user?.lastName ?? ''}
                gender={user?.gender === 'male' || user?.gender === 'female' ? user.gender : undefined}
                size="sm"
              />
              <Text style={[styles.playerName, isYou && styles.playerNameHighlight]}>{displayName || t('common.player')}</Text>
            </View>
          ) : (
            <View key={i} style={styles.slot}>
              <Text style={styles.slotText}>{t('tournamentDetail.openSlot')}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function hasValidGender(g?: Gender | string): g is Gender {
  return g === 'male' || g === 'female';
}

function TournamentHeaderTitle({ id }: { id: string | undefined }) {
  const { t } = useTranslation();
  const { data: tournament } = useTournament(id);
  return <Text style={headerTitleStyle}>{tournament?.name ?? t('common.tournament')}</Text>;
}

const headerTitleStyle = { color: '#e5e5e5', fontSize: 17, fontWeight: '600' } as const;

export default function TournamentDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;
  const canEnroll = hasValidGender(user?.gender);

  const { data: tournament, isLoading: loadingTournament, isError: errorTournament, error: tournamentError } = useTournament(id);
  const { data: teams = [], isLoading: loadingTeams } = useTeams(id ? { tournamentId: id } : undefined);
  const { data: entries = [], isLoading: loadingEntries } = useEntries(id ? { tournamentId: id } : undefined);

  const createEntry = useCreateEntry();
  const deleteTournament = useDeleteTournament();

  const allPlayerIds = teams.flatMap((t) => t.playerIds ?? []).filter(Boolean);
  const { data: users = [] } = useUsers([...new Set(allPlayerIds)]);
  const userMap = Object.fromEntries(users.map((u) => [u._id, u]));

  const hasJoined = entries.some((e) => e.userId === userId);
  const userHasTeam = teams.some((t) => t.playerIds?.includes(userId ?? ''));
  const isLoading = loadingTournament;
  const isError = errorTournament;

  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: () => <TournamentHeaderTitle id={id ?? undefined} /> });
  }, [navigation, id]);

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
        <Text style={styles.errorText}>{tournamentError?.message || t('tournamentDetail.failedToLoad')}</Text>
      </View>
    );
  }

  const teamsCount = teams.length;
  const isOrganizer = tournament.organizerIds?.includes(userId ?? '');

  const handleDelete = () => {
    Alert.alert(
      t('tournamentDetail.deleteTournament'),
      t('tournamentDetail.deleteConfirm', { name: tournament.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteTournament.mutate(id),
        },
      ]
    );
  };

  const handleShareInvite = () => {
    const url = config.invite.getUrl(tournament.inviteLink);
    Share.share({
      message: t('tournamentDetail.inviteMessage', { name: tournament.name, url }),
      url,
      title: t('tournamentDetail.inviteTitle'),
    }).catch(() => Alert.alert(t('common.error'), t('tournamentDetail.couldNotShare')));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{tournament.name}</Text>
        <Text style={styles.date}>{formatTournamentDate(tournament.date)}</Text>
        <Text style={styles.location}>{tournament.location}</Text>
        <Text style={styles.spots}>
          {t('tournamentDetail.teamsCount', { count: teamsCount, max: tournament.maxTeams ?? 16 })}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('tournamentDetail.teams')}</Text>
        {loadingTeams ? (
          <View style={styles.teamCard}>
            <Skeleton height={18} width="40%" style={{ marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Skeleton height={36} width={80} borderRadius={18} />
              <Skeleton height={36} width={80} borderRadius={18} />
            </View>
          </View>
        ) : teams.length === 0 ? (
          <Text style={styles.emptyText}>{t('tournamentDetail.noTeamsYet')}</Text>
        ) : (
          teams.map((team) => (
            <TeamCard key={team._id} team={team} userMap={userMap} currentUserId={userId} t={t} />
          ))
        )}
      </View>

      <View style={styles.actions}>
        {!canEnroll && (
          <Text style={styles.genderRequired}>{t('tournamentDetail.genderRequired')}</Text>
        )}
        {!hasJoined && canEnroll && (
          <Button
            title={t('tournamentDetail.joinTournament')}
            onPress={() => {
              if (!userId || !id) return;
              createEntry.mutate({ tournamentId: id, userId, lookingForPartner: true });
            }}
            disabled={createEntry.isPending}
            fullWidth
          />
        )}
        {hasJoined && (
          <Text style={styles.joinedBadge}>{t('tournamentDetail.joinedBadge')}</Text>
        )}
        {!userHasTeam && hasJoined && canEnroll && (
          <Button
            title={t('tournamentDetail.createTeam')}
            variant="secondary"
            onPress={() => router.push(`/tournament/${id}/team/create`)}
            fullWidth
          />
        )}
        {userHasTeam && (
          <Text style={styles.joinedBadge}>{t('tournamentDetail.alreadyInTeam')}</Text>
        )}
        {isOrganizer && tournament.inviteLink && (
          <Button
            title={t('tournamentDetail.shareInvite')}
            variant="secondary"
            onPress={handleShareInvite}
            fullWidth
          />
        )}
        {isOrganizer && (
          <Button
            title={t('tournamentDetail.deleteTournament')}
            variant="danger"
            onPress={handleDelete}
            disabled={deleteTournament.isPending}
            fullWidth
          />
        )}
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
  playerNameHighlight: { color: Colors.yellow, fontWeight: '600' },
  slot: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Colors.surfaceLight, borderRadius: 8 },
  slotText: { fontSize: 14, color: Colors.textMuted },
  actions: { gap: 12 },
  errorText: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center' },
  emptyText: { fontSize: 14, color: Colors.textMuted, fontStyle: 'italic' },
  joinedBadge: { fontSize: 14, color: Colors.yellow, textAlign: 'center', marginBottom: 8 },
  genderRequired: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: 12 },
});
