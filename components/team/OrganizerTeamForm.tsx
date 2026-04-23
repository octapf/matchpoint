import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useTournament } from '@/lib/hooks/useTournaments';
import { useWaitlist } from '@/lib/hooks/useWaitlist';
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam } from '@/lib/hooks/useTeams';
import { useJoinTeamSlotWaitlist, useTeamSlotWaitlist } from '@/lib/hooks/useTeamSlotWaitlist';
import { useUsers } from '@/lib/hooks/useUsers';
import { getPlayerSortKey, getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import { resolveRosterSlotLabel } from '@/lib/utils/resolveParticipant';
import { alertApiError } from '@/lib/utils/apiError';
import { useTranslation } from '@/lib/i18n';
import { toGuestPlayerSlot, isGuestPlayerSlot } from '@/lib/playerSlots';
import { normalizeGroupCount, validateTournamentGroups } from '@/lib/tournamentGroups';
import { isTournamentStarted } from '@/lib/isTournamentStarted';
import { divisionForTeam } from '@/lib/tournamentDivision';
import type { Team, TournamentDivision, TournamentGuestPlayer } from '@/types';
import { TeamSlotWaitlistSection } from '@/components/tournament/detail/TeamSlotWaitlistSection';
import { TournamentTeamCard } from '@/components/tournament/detail/TournamentTeamCard';
import { useUserStore } from '@/store/useUserStore';

export type OrganizerTeamFormProps = {
  tournamentId: string;
  division: TournamentDivision;
  userId: string;
  /** When set, form updates this team instead of creating one. */
  editTeam?: Team | null;
};

export function OrganizerTeamForm({ tournamentId, division, userId, editTeam = null }: OrganizerTeamFormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: tournament } = useTournament(tournamentId);
  const { data: waitlistInfo } = useWaitlist(tournamentId, division);
  const { data: teams = [] } = useTeams({ tournamentId });
  const { data: teamSlotWaitlistRows = [] } = useTeamSlotWaitlist(tournamentId);
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();
  const joinTeamSlotWaitlist = useJoinTeamSlotWaitlist();
  const tournamentStarted = isTournamentStarted(tournament ?? null);
  const viewerRole = useUserStore((s) => s.user?.role);
  const canManageTournament = Boolean(
    tournament &&
      ((tournament.organizerIds ?? []).includes(userId) || viewerRole === 'admin')
  );

  const guestPlayers = tournament?.guestPlayers ?? [];
  const guestMap = useMemo(
    () => Object.fromEntries(guestPlayers.map((g) => [g._id, g])) as Record<string, TournamentGuestPlayer>,
    [guestPlayers]
  );

  const allUserIds = useMemo(
    () => (waitlistInfo?.users ?? []).map((w) => w.userId).filter(Boolean),
    [waitlistInfo?.users]
  );

  const teamRosterUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const tm of teams) {
      for (const pid of tm.playerIds ?? []) {
        if (pid && !isGuestPlayerSlot(pid)) s.add(pid);
      }
    }
    return [...s];
  }, [teams]);

  const allLabelUserIds = useMemo(() => [...new Set([...allUserIds, ...teamRosterUserIds])], [allUserIds, teamRosterUserIds]);

  const { data: users = [] } = useUsers(allLabelUserIds);
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u._id, u])), [users]);

  const takenSlotsAllTeams = useMemo(() => {
    const set = new Set<string>();
    for (const tm of teams) {
      for (const pid of tm.playerIds ?? []) if (pid) set.add(pid);
    }
    return set;
  }, [teams]);

  const takenSlotsOtherTeams = useMemo(() => {
    const set = new Set<string>();
    for (const tm of teams) {
      if (editTeam && tm._id === editTeam._id) continue;
      for (const pid of tm.playerIds ?? []) if (pid) set.add(pid);
    }
    return set;
  }, [teams, editTeam]);

  const teamSlotWaitlistSlotSet = useMemo(() => {
    const s = new Set<string>();
    for (const r of teamSlotWaitlistRows) {
      for (const pid of r.playerIds ?? []) if (pid) s.add(pid);
    }
    return s;
  }, [teamSlotWaitlistRows]);

  const blockedForPicker = useMemo(() => {
    const base = editTeam ? takenSlotsOtherTeams : takenSlotsAllTeams;
    const merged = new Set(base);
    for (const slot of teamSlotWaitlistSlotSet) merged.add(slot);
    return merged;
  }, [editTeam, takenSlotsOtherTeams, takenSlotsAllTeams, teamSlotWaitlistSlotSet]);

  const availablePlayers = useMemo(() => {
    return allUserIds
      .filter((uid) => !blockedForPicker.has(uid))
      .filter((uid, idx, arr) => arr.indexOf(uid) === idx)
      .sort((a, b) => getPlayerSortKey(userMap[a]).localeCompare(getPlayerSortKey(userMap[b])));
  }, [allUserIds, blockedForPicker, userMap]);

  const availableGuests = useMemo(
    () => guestPlayers.filter((g) => !blockedForPicker.has(toGuestPlayerSlot(g._id))),
    [guestPlayers, blockedForPicker]
  );

  const teamsInDivision = useMemo(() => {
    const list = teams.filter((tm) => divisionForTeam(tm, userMap, guestMap) === division);
    return [...list].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }));
  }, [teams, division, userMap, guestMap]);

  const [teamName, setTeamName] = useState('');
  const [p1, setP1] = useState<string | null>(null);
  const [p2, setP2] = useState<string | null>(null);
  const lastSuggestedTeamName = useRef('');

  useEffect(() => {
    if (!editTeam) return;
    const ids = editTeam.playerIds ?? [];
    setP1(ids[0] ?? null);
    setP2(ids[1] ?? null);
    setTeamName(editTeam.name ?? '');
    lastSuggestedTeamName.current = '';
  }, [editTeam?._id, editTeam?.name, editTeam?.playerIds]);

  const suggestedTeamName = useMemo(() => {
    if (!p1 || !p2 || p1 === p2) return '';
    const n1 = resolveRosterSlotLabel(p1, userMap, guestMap).trim() || t('common.player');
    const n2 = resolveRosterSlotLabel(p2, userMap, guestMap).trim() || t('common.player');
    return `${n1} & ${n2}`;
  }, [p1, p2, userMap, guestMap, t]);

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

  const confirmRemoveTeam = useCallback(
    (team: Team) => {
      if (!userId) return;
      const pNames = (team.playerIds ?? [])
        .map((pid) => (pid ? resolveRosterSlotLabel(pid, userMap, guestMap) : ''))
        .filter(Boolean)
        .join(' · ');
      Alert.alert(
        t('tournamentDetail.removeTeam'),
        `${t('tournamentDetail.removeTeamConfirm', { name: team.name })}${pNames ? `\n\n${pNames}` : ''}`,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () =>
              deleteTeam.mutate(
                { id: team._id, tournamentId },
                {
                  onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
                },
              ),
          },
        ],
      );
    },
    [userId, tournamentId, t, userMap, guestMap, deleteTeam],
  );

  if (!tournament) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('common.loading')}</Text>
      </View>
    );
  }

  const groupCount = normalizeGroupCount(tournament.groupCount);
  const vg = validateTournamentGroups(tournament.maxTeams, groupCount);
  const groupsConfigInvalid = !vg.ok;
  const maxT = Number(tournament.maxTeams ?? 0);
  const atTeamCapacity =
    !editTeam && Number.isFinite(maxT) && maxT > 0 && teams.length >= maxT && !tournamentStarted;
  const hasTwoPlayersSelected = !!p1 && !!p2 && p1 !== p2;

  const pickerBusy =
    createTeam.isPending || updateTeam.isPending || deleteTeam.isPending || joinTeamSlotWaitlist.isPending;

  const pick = (slotId: string) => {
    if (!p1) return setP1(slotId);
    if (p1 === slotId) return setP1(null);
    if (!p2) return setP2(slotId);
    if (p2 === slotId) return setP2(null);
    setP2(slotId);
  };

  const resetCreateForm = () => {
    setP1(null);
    setP2(null);
    setTeamName('');
    lastSuggestedTeamName.current = '';
  };

  const handleSubmit = () => {
    if (!userId) return Alert.alert(t('common.error'), t('apiErrors.authRequired'));
    if (!teamName.trim()) return Alert.alert(t('common.error'), t('team.missingName'));
    if (!p1 || !p2 || p1 === p2) return Alert.alert(t('common.error'), t('team.twoPlayersRequired'));
    if (!editTeam && groupsConfigInvalid) {
      return Alert.alert(t('common.error'), t('tournaments.invalidGroups'));
    }

    if (editTeam) {
      const update: Record<string, unknown> = {};
      if (!tournamentStarted && teamName.trim() !== (editTeam.name ?? '').trim()) {
        update.name = teamName.trim();
      }
      const cur = editTeam.playerIds ?? [];
      const rosterChanged = cur[0] !== p1 || cur[1] !== p2;
      if (rosterChanged) {
        update.playerIds = [p1, p2];
      }
      if (Object.keys(update).length === 0) {
        router.back();
        return;
      }
      updateTeam.mutate(
        { id: editTeam._id, update },
        {
          onSuccess: () => router.back(),
          onError: (err: unknown) => alertApiError(t, err, 'team.failedToUpdate'),
        }
      );
      return;
    }

    if (atTeamCapacity) {
      joinTeamSlotWaitlist.mutate(
        { tournamentId, name: teamName.trim(), playerIds: [p1, p2], createdBy: userId },
        {
          onSuccess: () => resetCreateForm(),
          onError: (err: unknown) => alertApiError(t, err, 'team.failedToJoinTeamSlotWaitlist'),
        }
      );
      return;
    }

    createTeam.mutate(
      { tournamentId, name: teamName.trim(), playerIds: [p1, p2], createdBy: userId },
      {
        onSuccess: () => {
          resetCreateForm();
        },
        onError: (err: unknown) => alertApiError(t, err, 'team.failedToCreate'),
      }
    );
  };

  return (
    <ScrollView
      style={styles.scrollRoot}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{editTeam ? t('team.editTeam') : t('team.createTeam')}</Text>

      {!editTeam && !atTeamCapacity ? (
        <Text style={styles.hint}>{t('tournamentDetail.organizerCreateTeamHint')}</Text>
      ) : null}

      {tournamentStarted && editTeam ? (
        <Text style={styles.hint}>{t('team.nameLockedAfterStart')}</Text>
      ) : null}
      {!editTeam && groupsConfigInvalid ? <Text style={styles.groupConfigError}>{t('tournaments.invalidGroups')}</Text> : null}

      <View style={styles.field}>
        <Text style={styles.label}>{t('team.teamName')}</Text>
        <TextInput
          style={[styles.input, tournamentStarted && editTeam ? styles.inputDisabled : null]}
          placeholder={t('team.teamNamePlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={teamName}
          editable={!(tournamentStarted && !!editTeam)}
          onChangeText={(text) => {
            setTeamName(text);
            lastSuggestedTeamName.current = '';
          }}
        />
      </View>

      <View style={styles.list}>
        {availablePlayers.map((uid) => {
          const u = userMap[uid];
          const selected = uid === p1 || uid === p2;
          return (
            <Pressable
              key={uid}
              style={[styles.row, selected && styles.rowSelected, pickerBusy && styles.rowDisabled]}
              onPress={pickerBusy ? undefined : () => pick(uid)}
              disabled={pickerBusy}
            >
              <Avatar
                firstName={u?.firstName ?? ''}
                lastName={u?.lastName ?? ''}
                gender={u?.gender}
                size="sm"
                photoUrl={u?.photoUrl}
              />
              <Text style={styles.rowText}>{getTournamentPlayerDisplayName(u) || t('common.player')}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.listGuests}>
        {availableGuests.map((g) => {
          const slot = toGuestPlayerSlot(g._id);
          const selected = slot === p1 || slot === p2;
          return (
            <Pressable
              key={g._id}
              style={[styles.row, selected && styles.rowSelected, pickerBusy && styles.rowDisabled]}
              onPress={pickerBusy ? undefined : () => pick(slot)}
              disabled={pickerBusy}
            >
              <Avatar
                firstName={(g.displayName ?? '').trim()}
                lastName=""
                gender={g.gender === 'male' || g.gender === 'female' ? g.gender : undefined}
                size="sm"
              />
              <Text style={styles.rowText}>{(g.displayName ?? '').trim() || t('common.player')}</Text>
            </Pressable>
          );
        })}
        {availableGuests.length === 0 ? <Text style={styles.empty}>{t('team.noGuestPlayers')}</Text> : null}
      </View>

      <View style={styles.submitBlock}>
        <Button
          title={
            editTeam ? t('common.save') : atTeamCapacity ? t('team.joinTeamSlotWaitlist') : t('team.createTeam')
          }
          onPress={handleSubmit}
          disabled={
            createTeam.isPending ||
            updateTeam.isPending ||
            deleteTeam.isPending ||
            joinTeamSlotWaitlist.isPending ||
            (atTeamCapacity && !hasTwoPlayersSelected) ||
            (!editTeam && groupsConfigInvalid)
          }
          size="sm"
          fullWidth
        />
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

      {!editTeam ? (
        <View style={styles.teamListBlock}>
          <Text style={styles.teamListTitle}>{t('team.teamsInDivision', { count: teamsInDivision.length })}</Text>
          {teamsInDivision.length === 0 ? (
            <Text style={styles.muted}>{t('tournamentDetail.noTeamsYet')}</Text>
          ) : (
            <View style={styles.teamList}>
              {teamsInDivision.map((tm) => (
                <TournamentTeamCard
                  key={tm._id}
                  team={tm}
                  userMap={userMap}
                  guestMap={guestMap}
                  currentUserId={userId}
                  t={t}
                  canRemoveTeam={canManageTournament}
                  onRemoveTeam={canManageTournament ? () => confirmRemoveTeam(tm) : undefined}
                  removeTeamPending={deleteTeam.isPending}
                  onOpenProfile={(uid) => router.push(`/profile/${uid}` as never)}
                  onPressTeam={() =>
                    router.push(`/tournament/${tournamentId}/team/${tm._id}?division=${division}` as never)
                  }
                />
              ))}
            </View>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollRoot: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  container: { flex: 1, backgroundColor: Colors.background, padding: 20 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  hint: { fontSize: 13, color: Colors.textMuted, marginBottom: 12, lineHeight: 18 },
  groupConfigError: { fontSize: 13, color: Colors.danger, marginBottom: 12 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, fontSize: 15, color: Colors.text },
  inputDisabled: { opacity: 0.65 },
  list: { marginBottom: 8 },
  listGuests: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12 },
  rowSelected: { backgroundColor: Colors.surfaceLight },
  rowDisabled: { opacity: 0.55 },
  rowText: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  empty: { padding: 14, color: Colors.textMuted, textAlign: 'center' },
  submitBlock: { marginTop: 8, marginBottom: 8 },
  teamListBlock: { marginTop: 16, gap: 8, paddingBottom: 8 },
  teamListTitle: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary },
  teamList: { gap: 0 },
  muted: { color: Colors.textMuted, textAlign: 'center', paddingVertical: 8 },
});
