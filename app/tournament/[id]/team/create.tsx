import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, TextInput, Alert, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useCreateTeam, useTeams } from '@/lib/hooks/useTeams';
import { useTournament } from '@/lib/hooks/useTournaments';
import { useWaitlist } from '@/lib/hooks/useWaitlist';
import { useUsers } from '@/lib/hooks/useUsers';
import { normalizeGroupCount, validateTournamentGroups } from '@/lib/tournamentGroups';
import { isPairValidForTournamentDivisions } from '@/lib/teamDivisionPairing';
import { useUserStore } from '@/store/useUserStore';
import { getPlayerSortKey, getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import { alertApiError } from '@/lib/utils/apiError';
import type { TournamentDivision } from '@/types';

export default function CreateTeamScreen() {
  const { t } = useTranslation();
  const { id, division } = useLocalSearchParams<{ id: string; division?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;
  const hasValidGender = user?.gender === 'male' || user?.gender === 'female';
  const openMyProfile = () => {
    if (userId) router.push(`/profile/${userId}` as never);
  };

  useEffect(() => {
    if (userId && !hasValidGender) {
      Alert.alert(t('team.genderRequiredTitle'), t('team.genderRequired'), [{ text: t('common.ok'), onPress: () => router.replace('/profile/my-data') }]);
    }
  }, [hasValidGender, userId, router, t]);

  const createTeam = useCreateTeam();
  const { data: tournament } = useTournament(id);
  const { data: teams = [] } = useTeams(id ? { tournamentId: id } : undefined);
  const div = division === 'men' || division === 'women' || division === 'mixed' ? division : 'mixed';
  const { data: waitlistInfo } = useWaitlist(id, div as TournamentDivision);
  const userHasTeam = teams.some((t) => t.playerIds?.includes(userId ?? ''));

  const inTeamUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const tm of teams) for (const pid of tm.playerIds ?? []) if (pid) s.add(pid);
    return s;
  }, [teams]);

  const partnerCandidates = useMemo(() => {
    const wl = (waitlistInfo?.users ?? []).map((w) => w.userId).filter(Boolean);
    return wl.filter((uid) => uid !== userId && !inTeamUserIds.has(uid));
  }, [waitlistInfo?.users, userId, inTeamUserIds]);

  const { data: partnerUsers = [] } = useUsers(partnerCandidates);
  const partnerMap = useMemo(() => Object.fromEntries(partnerUsers.map((u) => [u._id, u])), [partnerUsers]);

  const onWaitlist = useMemo(
    () => !!(userId && (waitlistInfo?.users ?? []).some((w) => w.userId === userId)),
    [waitlistInfo?.users, userId]
  );

  const [teamName, setTeamName] = useState('');
  const [partnerId, setPartnerId] = useState<string | null>(null);

  const sortedPartners = useMemo(() => {
    return [...partnerCandidates].sort((a, b) =>
      getPlayerSortKey(partnerMap[a]).localeCompare(getPlayerSortKey(partnerMap[b]))
    );
  }, [partnerCandidates, partnerMap]);

  const groupCount = tournament ? normalizeGroupCount(tournament.groupCount) : 4;
  const vg = tournament
    ? validateTournamentGroups(tournament.maxTeams, groupCount)
    : { ok: true, groupCount: 4, teamsPerGroup: 4 };
  const perGroup = vg.ok ? vg.teamsPerGroup : 4;
  const groupsConfigInvalid = !!tournament && !vg.ok;

  const divisions = (tournament?.divisions ?? []) as TournamentDivision[];

  const handleCreate = () => {
    if (userHasTeam) {
      Alert.alert(t('common.error'), t('team.alreadyInTeam'));
      return;
    }
    if (!onWaitlist) {
      Alert.alert(t('common.error'), t('team.joinWaitlistFirst'));
      return;
    }
    if (!teamName.trim()) {
      Alert.alert(t('common.error'), t('team.missingName'));
      return;
    }
    if (!id || !userId) {
      Alert.alert(t('common.error'), t('team.missingTournamentOrUser'));
      return;
    }
    if (!partnerId) {
      Alert.alert(t('common.error'), t('team.twoPlayersRequired'));
      return;
    }
    if (groupsConfigInvalid) {
      Alert.alert(t('common.error'), t('tournaments.invalidGroups'));
      return;
    }

    const partnerUser = partnerMap[partnerId];
    const divCheck = isPairValidForTournamentDivisions(divisions, user?.gender, partnerUser?.gender);
    if (!divCheck.ok) {
      Alert.alert(t('common.error'), t('apiErrors.divisionNotEnabledForPair'));
      return;
    }

    createTeam.mutate(
      {
        tournamentId: id,
        name: teamName.trim(),
        playerIds: [userId, partnerId],
        createdBy: userId,
      },
      {
        onSuccess: () => router.back(),
        onError: (err: unknown) => {
          alertApiError(t, err, 'team.failedToCreate');
        },
      }
    );
  };

  if (userId && !hasValidGender) {
    return null;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: 40 + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{t('team.createTeam')}</Text>

      <View style={styles.field}>
        <Text style={styles.label}>{t('team.teamName')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('team.teamNamePlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={teamName}
          onChangeText={setTeamName}
        />
      </View>

      {groupsConfigInvalid ? (
        <Text style={styles.groupConfigError}>{t('tournaments.invalidGroups')}</Text>
      ) : (
        <Text style={styles.groupAutoHint}>{t('team.groupAutoAssign', { perGroup })}</Text>
      )}

      <View style={styles.players}>
        <Text style={styles.label}>{t('team.players')}</Text>
        <Pressable
          style={styles.playerRow}
          onPress={openMyProfile}
          accessibilityRole="button"
          accessibilityLabel={t('profile.viewProfile')}
        >
          <Avatar
            firstName={user?.firstName ?? t('common.you')}
            lastName={user?.lastName ?? ''}
            gender={user?.gender}
            size="md"
            photoUrl={user?.photoUrl}
          />
          <Text style={styles.playerLabel}>{t('team.youCreator')}</Text>
        </Pressable>

        <Text style={styles.partnerHint}>{t('team.pickPartnerFromWaitlist')}</Text>
        <View style={styles.partnerList}>
          {sortedPartners.map((pid) => {
            const u = partnerMap[pid];
            const selected = partnerId === pid;
            return (
              <Pressable
                key={pid}
                style={[styles.partnerRow, selected && styles.partnerRowSelected]}
                onPress={() => setPartnerId((prev) => (prev === pid ? null : pid))}
              >
                <Avatar
                  firstName={u?.firstName ?? ''}
                  lastName={u?.lastName ?? ''}
                  gender={u?.gender === 'male' || u?.gender === 'female' ? u.gender : undefined}
                  size="sm"
                  photoUrl={u?.photoUrl}
                />
                <Text style={styles.partnerName}>{getTournamentPlayerDisplayName(u) || t('common.player')}</Text>
              </Pressable>
            );
          })}
          {sortedPartners.length === 0 ? <Text style={styles.emptyPartners}>{t('common.noResults')}</Text> : null}
        </View>
      </View>

      <Button
        title={t('team.createTeam')}
        onPress={handleCreate}
        disabled={createTeam.isPending || userHasTeam || groupsConfigInvalid || !onWaitlist}
        fullWidth
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingBottom: 40 },
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
  groupAutoHint: { fontSize: 13, color: Colors.textMuted, marginBottom: 20, lineHeight: 18 },
  groupConfigError: { fontSize: 13, color: Colors.danger, marginBottom: 20, lineHeight: 18 },
  players: { marginBottom: 24 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  playerLabel: { fontSize: 16, color: Colors.text },
  partnerHint: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  partnerList: { marginTop: 8, gap: 8 },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  partnerRowSelected: { borderWidth: 1, borderColor: Colors.surfaceLight },
  partnerName: { fontSize: 16, color: Colors.text, fontWeight: '600' },
  emptyPartners: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', padding: 12 },
});
