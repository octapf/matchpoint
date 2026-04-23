import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, TextInput, Alert, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useCreateTeam, useTeams, useUpdateTeam } from '@/lib/hooks/useTeams';
import { useJoinTeamSlotWaitlist, useTeamSlotWaitlist } from '@/lib/hooks/useTeamSlotWaitlist';
import { useTournament } from '@/lib/hooks/useTournaments';
import { useEntries } from '@/lib/hooks/useEntries';
import { useWaitlist } from '@/lib/hooks/useWaitlist';
import { useUsers } from '@/lib/hooks/useUsers';
import { normalizeGroupCount, validateTournamentGroups } from '@/lib/tournamentGroups';
import { isPairValidForTournamentDivisions } from '@/lib/teamDivisionPairing';
import { useUserStore } from '@/store/useUserStore';
import { getPlayerSortKey, getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import { alertApiError } from '@/lib/utils/apiError';
import { toGuestPlayerSlot, isGuestPlayerSlot, guestPlayerIdFromSlot } from '@/lib/playerSlots';
import { isTournamentStarted } from '@/lib/isTournamentStarted';
import type { Team, TournamentDivision, TournamentGuestPlayer } from '@/types';
import { TeamSlotWaitlistSection } from '@/components/tournament/detail/TeamSlotWaitlistSection';

type SecondPick =
  | { kind: 'waitlist'; userId: string }
  | { kind: 'guest'; guest: TournamentGuestPlayer }
  | null;

export type PlayerTeamFormProps = {
  tournamentId: string;
  division: TournamentDivision;
  /** When set, form saves team name only (roster locked). */
  editTeam?: Team | null;
};

export function PlayerTeamForm({ tournamentId, division, editTeam = null }: PlayerTeamFormProps) {
  const { t } = useTranslation();
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
      Alert.alert(t('team.genderRequiredTitle'), t('team.genderRequired'), [
        { text: t('common.ok'), onPress: () => router.replace('/profile/my-data') },
      ]);
    }
  }, [hasValidGender, userId, router, t]);

  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const joinTeamSlotWaitlist = useJoinTeamSlotWaitlist();
  const { data: tournament } = useTournament(tournamentId);
  const { data: teams = [] } = useTeams({ tournamentId });
  const { data: myEntries = [] } = useEntries(userId ? { tournamentId, userId } : undefined, { enabled: !!userId });
  const { data: waitlistInfo } = useWaitlist(tournamentId, division);
  const { data: teamSlotWaitlistRows = [] } = useTeamSlotWaitlist(tournamentId);
  const userHasTeam = teams.some((tm) => tm.playerIds?.includes(userId ?? ''));

  const inTeamSlotIds = useMemo(() => {
    const s = new Set<string>();
    for (const tm of teams) for (const pid of tm.playerIds ?? []) if (pid) s.add(pid);
    for (const r of teamSlotWaitlistRows) {
      const pids = r.playerIds ?? [];
      if (userId && pids.some((id) => id === userId)) continue;
      for (const pid of pids) if (pid) s.add(pid);
    }
    return s;
  }, [teams, teamSlotWaitlistRows, userId]);

  const partnerCandidates = useMemo(() => {
    const wl = (waitlistInfo?.users ?? []).map((w) => w.userId).filter(Boolean);
    return wl.filter((uid) => uid !== userId && !inTeamSlotIds.has(uid));
  }, [waitlistInfo?.users, userId, inTeamSlotIds]);

  const guestPlayers = tournament?.guestPlayers ?? [];
  const guestMap = useMemo(
    () => Object.fromEntries(guestPlayers.map((g) => [g._id, g])) as Record<string, TournamentGuestPlayer>,
    [guestPlayers]
  );
  const canManageTournament = Boolean(
    tournament &&
      userId &&
      (((tournament.organizerIds ?? []) as string[]).includes(userId) || user?.role === 'admin')
  );
  const availableGuests = useMemo(
    () => guestPlayers.filter((g) => !inTeamSlotIds.has(toGuestPlayerSlot(g._id))),
    [guestPlayers, inTeamSlotIds]
  );

  const { data: partnerUsers = [] } = useUsers(partnerCandidates);
  const partnerMap = useMemo(() => Object.fromEntries(partnerUsers.map((u) => [u._id, u])), [partnerUsers]);

  const onWaitlist = useMemo(
    () => !!(userId && (waitlistInfo?.users ?? []).some((w) => w.userId === userId)),
    [waitlistInfo?.users, userId]
  );
  const hasRosterEntry = useMemo(() => !!(userId && myEntries.some((e) => e.userId === userId)), [myEntries, userId]);
  const canCreateAsPlayer = !!userId && (onWaitlist || hasRosterEntry);

  const [teamName, setTeamName] = useState('');
  const [secondPick, setSecondPick] = useState<SecondPick>(null);
  const lastSuggestedTeamName = useRef('');

  const tournamentStarted = isTournamentStarted(tournament ?? null);

  useEffect(() => {
    if (!editTeam || !userId) return;
    setTeamName(editTeam.name ?? '');
    const ids = editTeam.playerIds ?? [];
    const other = ids.find((x) => x !== userId);
    if (!other) return;
    if (!isGuestPlayerSlot(other)) {
      setSecondPick({ kind: 'waitlist', userId: other });
    } else {
      const gid = guestPlayerIdFromSlot(other);
      const g = gid ? guestPlayers.find((x) => x._id === gid) : undefined;
      if (g) setSecondPick({ kind: 'guest', guest: g });
    }
    lastSuggestedTeamName.current = '';
  }, [editTeam?._id, editTeam?.name, editTeam?.playerIds, userId, guestPlayers]);

  const suggestedTeamName = useMemo(() => {
    if (!userId || !secondPick) return '';
    const n1 = getTournamentPlayerDisplayName(user ?? undefined) || t('common.player');
    let n2 = '';
    if (secondPick.kind === 'waitlist') {
      n2 = getTournamentPlayerDisplayName(partnerMap[secondPick.userId]) || t('common.player');
    } else {
      n2 = (secondPick.guest.displayName ?? '').trim() || t('common.player');
    }
    return `${n1.trim()} & ${n2.trim()}`;
  }, [user, secondPick, partnerMap, userId, t]);

  useEffect(() => {
    if (!suggestedTeamName) return;
    if (editTeam && tournamentStarted) return;

    setTeamName((prev) => {
      const trimmed = prev.trim();
      const sug = suggestedTeamName;
      if (editTeam && trimmed === sug) {
        lastSuggestedTeamName.current = sug;
        return prev;
      }
      if (prev === '' || prev === lastSuggestedTeamName.current) {
        lastSuggestedTeamName.current = sug;
        return sug;
      }
      return prev;
    });
  }, [suggestedTeamName, editTeam, tournamentStarted]);

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
  const maxTeamsCap = tournament ? Number(tournament.maxTeams ?? 0) : 0;
  const atTeamCapacity =
    !editTeam &&
    !!tournament &&
    Number.isFinite(maxTeamsCap) &&
    maxTeamsCap > 0 &&
    teams.length >= maxTeamsCap &&
    !tournamentStarted;

  const divisions = (tournament?.divisions ?? []) as TournamentDivision[];

  const handleSubmit = () => {
    if (editTeam) {
      if (!userId) {
        Alert.alert(t('common.error'), t('team.missingTournamentOrUser'));
        return;
      }
      if (tournamentStarted) {
        Alert.alert(t('common.error'), t('team.cannotEditAfterStart'));
        return;
      }
      if (!teamName.trim()) {
        Alert.alert(t('common.error'), t('team.missingName'));
        return;
      }
      if (teamName.trim() === (editTeam.name ?? '').trim()) {
        router.back();
        return;
      }
      updateTeam.mutate(
        { id: editTeam._id, update: { name: teamName.trim() } },
        {
          onSuccess: () => router.back(),
          onError: (err: unknown) => alertApiError(t, err, 'team.failedToUpdate'),
        }
      );
      return;
    }

    if (userHasTeam) {
      Alert.alert(t('common.error'), t('team.alreadyInTeam'));
      return;
    }
    if (!canCreateAsPlayer) {
      Alert.alert(t('common.error'), t('team.joinWaitlistFirst'));
      return;
    }
    if (!teamName.trim()) {
      Alert.alert(t('common.error'), t('team.missingName'));
      return;
    }
    if (!userId) {
      Alert.alert(t('common.error'), t('team.missingTournamentOrUser'));
      return;
    }
    if (!secondPick) {
      Alert.alert(t('common.error'), t('team.twoPlayersRequired'));
      return;
    }
    if (groupsConfigInvalid) {
      Alert.alert(t('common.error'), t('tournaments.invalidGroups'));
      return;
    }

    let partnerGender: string | undefined;
    let playerIds: [string, string];
    if (secondPick.kind === 'waitlist') {
      partnerGender = partnerMap[secondPick.userId]?.gender;
      playerIds = [userId, secondPick.userId];
    } else {
      partnerGender = secondPick.guest.gender;
      playerIds = [userId, toGuestPlayerSlot(secondPick.guest._id)];
    }

    const divCheck = isPairValidForTournamentDivisions(divisions, user?.gender, partnerGender);
    if (!divCheck.ok) {
      Alert.alert(t('common.error'), t('apiErrors.divisionNotEnabledForPair'));
      return;
    }

    if (atTeamCapacity) {
      joinTeamSlotWaitlist.mutate(
        { tournamentId, name: teamName.trim(), playerIds, createdBy: userId },
        {
          onSuccess: () => router.back(),
          onError: (err: unknown) => alertApiError(t, err, 'team.failedToJoinTeamSlotWaitlist'),
        }
      );
      return;
    }

    createTeam.mutate(
      {
        tournamentId,
        name: teamName.trim(),
        playerIds,
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

  const rosterLocked = !!editTeam;
  const nameEditable = !editTeam || !tournamentStarted;
  const pickerBusy = createTeam.isPending || updateTeam.isPending || joinTeamSlotWaitlist.isPending;
  const hasTwoPlayersSelected = !!userId && !!secondPick;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: 40 + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>
        {editTeam ? t('team.editTeam') : atTeamCapacity ? t('team.joinTeamSlotWaitlist') : t('team.createTeam')}
      </Text>

      {editTeam && tournamentStarted ? <Text style={styles.lockedHint}>{t('team.nameLockedAfterStart')}</Text> : null}

      <View style={styles.field}>
        <Text style={styles.label}>{t('team.teamName')}</Text>
        <TextInput
          style={[styles.input, !nameEditable ? styles.inputDisabled : null]}
          placeholder={t('team.teamNamePlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={teamName}
          editable={nameEditable}
          onChangeText={(text) => {
            setTeamName(text);
            lastSuggestedTeamName.current = '';
          }}
        />
      </View>

      {!editTeam ? (
        groupsConfigInvalid ? (
          <Text style={styles.groupConfigError}>{t('tournaments.invalidGroups')}</Text>
        ) : !atTeamCapacity ? (
          <Text style={styles.groupAutoHint}>{t('team.groupAutoAssign', { perGroup })}</Text>
        ) : null
      ) : null}

      <View style={styles.players}>
        <Pressable
          style={styles.playerRow}
          onPress={rosterLocked ? undefined : openMyProfile}
          accessibilityRole="button"
          accessibilityLabel={t('profile.viewProfile')}
          disabled={rosterLocked}
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

        <View style={styles.partnerList}>
          {sortedPartners.map((pid) => {
            const u = partnerMap[pid];
            const selected = secondPick?.kind === 'waitlist' && secondPick.userId === pid;
            return (
              <Pressable
                key={pid}
                style={[
                  styles.partnerRow,
                  selected && styles.partnerRowSelected,
                  (rosterLocked || pickerBusy) && styles.partnerRowDisabled,
                ]}
                onPress={
                  rosterLocked || pickerBusy
                    ? undefined
                    : () =>
                        setSecondPick((prev) =>
                          prev?.kind === 'waitlist' && prev.userId === pid ? null : { kind: 'waitlist', userId: pid }
                        )
                }
                disabled={rosterLocked || pickerBusy}
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
          {sortedPartners.length === 0 && !rosterLocked ? (
            <Text style={styles.emptyPartners}>{t('common.noResults')}</Text>
          ) : null}
        </View>

        <View style={styles.partnerList}>
          {availableGuests.map((g) => {
            const selected = secondPick?.kind === 'guest' && secondPick.guest._id === g._id;
            return (
              <Pressable
                key={g._id}
                style={[
                  styles.partnerRow,
                  selected && styles.partnerRowSelected,
                  (rosterLocked || pickerBusy) && styles.partnerRowDisabled,
                ]}
                onPress={
                  rosterLocked || pickerBusy
                    ? undefined
                    : () =>
                        setSecondPick((prev) =>
                          prev?.kind === 'guest' && prev.guest._id === g._id ? null : { kind: 'guest', guest: g }
                        )
                }
                disabled={rosterLocked || pickerBusy}
              >
                <Avatar
                  firstName={(g.displayName ?? '').trim()}
                  lastName=""
                  gender={g.gender === 'male' || g.gender === 'female' ? g.gender : undefined}
                  size="sm"
                />
                <Text style={styles.partnerName}>{(g.displayName ?? '').trim() || t('common.player')}</Text>
              </Pressable>
            );
          })}
          {availableGuests.length === 0 && !rosterLocked ? (
            <Text style={styles.emptyPartners}>{t('team.noGuestPlayers')}</Text>
          ) : null}
        </View>
      </View>

      {!editTeam && !tournamentStarted && teamSlotWaitlistRows.length > 0 ? (
        <TeamSlotWaitlistSection
          tournamentId={tournamentId}
          division={division}
          guestMap={guestMap}
          currentUserId={userId}
          canManageTournament={canManageTournament}
          t={t}
          onOpenProfile={(uid) => router.push(`/profile/${uid}` as never)}
        />
      ) : null}

      <Button
        title={
          editTeam ? t('common.save') : atTeamCapacity ? t('team.joinTeamSlotWaitlist') : t('team.createTeam')
        }
        onPress={handleSubmit}
        disabled={
          createTeam.isPending ||
          updateTeam.isPending ||
          joinTeamSlotWaitlist.isPending ||
          (!editTeam && atTeamCapacity && !hasTwoPlayersSelected) ||
          (!editTeam && (userHasTeam || groupsConfigInvalid || !canCreateAsPlayer)) ||
          (!!editTeam && tournamentStarted)
        }
        size="sm"
        fullWidth
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 24 },
  lockedHint: { fontSize: 13, color: Colors.textMuted, marginBottom: 16, lineHeight: 18 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
  },
  inputDisabled: { opacity: 0.65 },
  groupAutoHint: { fontSize: 13, color: Colors.textMuted, marginBottom: 20, lineHeight: 18 },
  groupConfigError: { fontSize: 13, color: Colors.danger, marginBottom: 20, lineHeight: 18 },
  players: { marginBottom: 24 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  playerLabel: { fontSize: 16, color: Colors.text },
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
  partnerRowDisabled: { opacity: 0.55 },
  partnerName: { fontSize: 16, color: Colors.text, fontWeight: '600' },
  emptyPartners: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', padding: 12 },
});
