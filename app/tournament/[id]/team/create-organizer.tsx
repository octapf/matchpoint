import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useTournament } from '@/lib/hooks/useTournaments';
import { useWaitlist } from '@/lib/hooks/useWaitlist';
import { useTeams, useCreateTeam } from '@/lib/hooks/useTeams';
import { useUsers } from '@/lib/hooks/useUsers';
import { useUserStore } from '@/store/useUserStore';
import { getPlayerSortKey, getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import { resolveRosterSlotLabel } from '@/lib/utils/resolveParticipant';
import { alertApiError } from '@/lib/utils/apiError';
import { useTranslation } from '@/lib/i18n';
import { toGuestPlayerSlot } from '@/lib/playerSlots';
import type { TournamentDivision, TournamentGuestPlayer } from '@/types';

export default function CreateTeamOrganizerScreen() {
  const { t } = useTranslation();
  const { id, division } = useLocalSearchParams<{ id: string; division?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;

  const { data: tournament } = useTournament(id);
  const canManageTournament = !!tournament && ((tournament.organizerIds ?? []).includes(userId ?? '') || user?.role === 'admin');
  const div = division === 'men' || division === 'women' || division === 'mixed' ? division : 'mixed';
  const { data: waitlistInfo } = useWaitlist(id, div as TournamentDivision);
  const { data: teams = [] } = useTeams(id ? { tournamentId: id } : undefined);
  const createTeam = useCreateTeam();

  const guestPlayers = tournament?.guestPlayers ?? [];
  const guestMap = useMemo(
    () => Object.fromEntries(guestPlayers.map((g) => [g._id, g])) as Record<string, TournamentGuestPlayer>,
    [guestPlayers]
  );

  const allUserIds = useMemo(
    () => (waitlistInfo?.users ?? []).map((w) => w.userId).filter(Boolean),
    [waitlistInfo?.users]
  );
  const { data: users = [] } = useUsers(allUserIds);
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u._id, u])), [users]);

  const inTeamSlotIds = useMemo(() => {
    const set = new Set<string>();
    for (const tm of teams) {
      for (const pid of tm.playerIds ?? []) if (pid) set.add(pid);
    }
    return set;
  }, [teams]);

  const availablePlayers = useMemo(() => {
    const list = allUserIds
      .filter((uid) => !inTeamSlotIds.has(uid))
      .filter((uid, idx, arr) => arr.indexOf(uid) === idx)
      .sort((a, b) => getPlayerSortKey(userMap[a]).localeCompare(getPlayerSortKey(userMap[b])));
    return list;
  }, [allUserIds, inTeamSlotIds, userMap]);

  const availableGuests = useMemo(
    () => guestPlayers.filter((g) => !inTeamSlotIds.has(toGuestPlayerSlot(g._id))),
    [guestPlayers, inTeamSlotIds]
  );

  const [teamName, setTeamName] = useState('');
  const [p1, setP1] = useState<string | null>(null);
  const [p2, setP2] = useState<string | null>(null);

  if (!id || !tournament) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (!canManageTournament) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('common.error')}</Text>
        <Text style={styles.hint}>{t('tournamentDetail.organizerActionFailed')}</Text>
      </View>
    );
  }

  const pick = (slotId: string) => {
    if (!p1) return setP1(slotId);
    if (p1 === slotId) return setP1(null);
    if (!p2) return setP2(slotId);
    if (p2 === slotId) return setP2(null);
    setP2(slotId);
  };

  const handleCreate = () => {
    if (!userId) return Alert.alert(t('common.error'), t('apiErrors.authRequired'));
    if (!teamName.trim()) return Alert.alert(t('common.error'), t('team.missingName'));
    if (!p1 || !p2 || p1 === p2) return Alert.alert(t('common.error'), t('team.twoPlayersRequired'));

    createTeam.mutate(
      { tournamentId: id, name: teamName.trim(), playerIds: [p1, p2], createdBy: userId },
      {
        onSuccess: () => router.back(),
        onError: (err: unknown) => alertApiError(t, err, 'team.failedToCreate'),
      }
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: 20 + insets.bottom }]}>
      <Text style={styles.title}>{t('team.createTeam')}</Text>
      <Text style={styles.hint}>{t('tournamentDetail.organizerCreateTeamHint')}</Text>

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

      <View style={styles.field}>
        <Text style={styles.label}>{t('team.players')}</Text>
      </View>

      <View style={styles.picksRow}>
        <Text style={styles.pickText}>{p1 ? resolveRosterSlotLabel(p1, userMap, guestMap) : t('team.pickPlayer1')}</Text>
        <Text style={styles.pickText}>{p2 ? resolveRosterSlotLabel(p2, userMap, guestMap) : t('team.pickPlayer2')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.subsectionLabel}>{t('team.pickPartnerFromWaitlist')}</Text>
        <View style={styles.list}>
          {availablePlayers.map((uid) => {
            const u = userMap[uid];
            const selected = uid === p1 || uid === p2;
            return (
              <Pressable key={uid} style={[styles.row, selected && styles.rowSelected]} onPress={() => pick(uid)}>
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
          {availablePlayers.length === 0 ? <Text style={styles.empty}>{t('common.noResults')}</Text> : null}
        </View>

        <Text style={styles.subsectionLabel}>{t('team.guestPlayersSection')}</Text>
        <View style={styles.listGuests}>
          {availableGuests.map((g) => {
            const slot = toGuestPlayerSlot(g._id);
            const selected = slot === p1 || slot === p2;
            return (
              <Pressable key={g._id} style={[styles.row, selected && styles.rowSelected]} onPress={() => pick(slot)}>
                <View style={styles.guestAvatar}>
                  <Text style={styles.guestAvatarText}>G</Text>
                </View>
                <View style={styles.guestTextCol}>
                  <Text style={styles.rowText}>{(g.displayName ?? '').trim() || t('common.player')}</Text>
                  <Text style={styles.guestMeta}>{g.gender}</Text>
                </View>
              </Pressable>
            );
          })}
          {availableGuests.length === 0 ? <Text style={styles.empty}>{t('team.noGuestPlayers')}</Text> : null}
        </View>
      </ScrollView>

      <Button
        title={t('team.createTeam')}
        onPress={handleCreate}
        disabled={createTeam.isPending}
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 20 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  hint: { fontSize: 13, color: Colors.textMuted, marginBottom: 16 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, fontSize: 15, color: Colors.text },
  picksRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginVertical: 10 },
  pickText: { flex: 1, fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 12 },
  subsectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginTop: 8, marginBottom: 6 },
  list: { marginBottom: 8 },
  listGuests: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12 },
  guestAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestAvatarText: { fontSize: 14, fontWeight: '800', color: Colors.textMuted },
  guestTextCol: { flex: 1 },
  guestMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  rowSelected: { backgroundColor: Colors.surfaceLight },
  rowText: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  empty: { padding: 14, color: Colors.textMuted, textAlign: 'center' },
});

