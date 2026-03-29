import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, TextInput, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useCreateTeam } from '@/lib/hooks/useTeams';
import { useTeams } from '@/lib/hooks/useTeams';
import { useTournament } from '@/lib/hooks/useTournaments';
import { normalizeGroupCount, validateTournamentGroups } from '@/lib/tournamentGroups';
import { useEntries, useUpdateEntry } from '@/lib/hooks/useEntries';
import { useUserStore } from '@/store/useUserStore';
import { alertApiError } from '@/lib/utils/apiError';

export default function CreateTeamScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
  const updateEntry = useUpdateEntry();
  const { data: tournament } = useTournament(id);
  const { data: teams = [] } = useTeams(id ? { tournamentId: id } : undefined);
  const { data: entries = [] } = useEntries(
    id && userId ? { tournamentId: id, userId } : undefined,
    { enabled: !!id && !!userId }
  );
  const userHasTeam = teams.some((t) => t.playerIds?.includes(userId ?? ''));

  const [teamName, setTeamName] = useState('');

  const groupCount = tournament ? normalizeGroupCount(tournament.groupCount) : 4;
  const vg = tournament
    ? validateTournamentGroups(tournament.maxTeams, groupCount)
    : { ok: true, groupCount: 4, teamsPerGroup: 4 };
  const perGroup = vg.ok ? vg.teamsPerGroup : 4;
  const groupsConfigInvalid = !!tournament && !vg.ok;

  const handleCreate = () => {
    if (userHasTeam) {
      Alert.alert(t('common.error'), t('team.alreadyInTeam'));
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
    if (groupsConfigInvalid) {
      Alert.alert(t('common.error'), t('tournaments.invalidGroups'));
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
        onSuccess: (team) => {
          const myEntry = entries.find((e) => e.tournamentId === id && e.userId === userId);
          if (myEntry?._id && team?._id) {
            updateEntry.mutate(
              { id: myEntry._id, update: { teamId: team._id } },
              {
                onSuccess: () => router.back(),
                onError: (err: unknown) => alertApiError(t, err, 'team.failedToLinkEntry'),
              }
            );
          } else {
            router.back();
          }
        },
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
    <View style={styles.container}>
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
          <Avatar firstName={user?.firstName ?? t('common.you')} lastName={user?.lastName ?? ''} gender={user?.gender} size="md" />
          <Text style={styles.playerLabel}>{t('team.youCreator')}</Text>
        </Pressable>
        <View style={styles.slot}>
          <Text style={styles.slotText}>{t('team.openSlotInvite')}</Text>
        </View>
      </View>

      <Button
        title={t('team.createTeam')}
        onPress={handleCreate}
        disabled={createTeam.isPending || userHasTeam || groupsConfigInvalid}
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
  groupAutoHint: { fontSize: 13, color: Colors.textMuted, marginBottom: 20, lineHeight: 18 },
  groupConfigError: { fontSize: 13, color: Colors.danger, marginBottom: 20, lineHeight: 18 },
  players: { marginBottom: 24 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  playerLabel: { fontSize: 16, color: Colors.text },
  slot: { padding: 16, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.surfaceLight, borderStyle: 'dashed' },
  slotText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
});
