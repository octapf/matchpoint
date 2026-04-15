import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useTournament } from '@/lib/hooks/useTournaments';
import { useEntries, useCreateEntry, useDeleteEntry, useUpdateEntry } from '@/lib/hooks/useEntries';
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam } from '@/lib/hooks/useTeams';
import { useUsers } from '@/lib/hooks/useUsers';
import { usersApi } from '@/lib/api';
import { config } from '@/lib/config';
import { useUserStore } from '@/store/useUserStore';
import { getPlayerSortKey, getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import type { Entry, Team, User } from '@/types';
import {
  normalizeGroupCount,
  teamGroupIndex,
  tournamentAllowsManualGroupAssignment,
  validateTournamentGroups,
} from '@/lib/tournamentGroups';
import { alertApiError } from '@/lib/utils/apiError';
import { useTheme } from '@/lib/theme/useTheme';

const MAX_TEAM_PLAYERS = 2;

function sortEntriesByUser(entries: Entry[], userMap: Record<string, User | undefined>): Entry[] {
  return [...entries].sort((a, b) => {
    const ka = getPlayerSortKey(userMap[a.userId]) || a.userId;
    const kb = getPlayerSortKey(userMap[b.userId]) || b.userId;
    return ka.localeCompare(kb);
  });
}

export default function AdminTournamentRosterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const adminId = useUserStore((s) => s.user?._id ?? null);

  const { data: tournament, isLoading: loadingT } = useTournament(id);
  const { data: entries = [], isLoading: loadingE, refetch: refetchEntries } = useEntries(
    id ? { tournamentId: id } : undefined,
    { enabled: !!id }
  );
  const { data: teams = [], isLoading: loadingTeams, refetch: refetchTeams } = useTeams(
    id ? { tournamentId: id } : undefined
  );

  const playerIds = useMemo(() => [...new Set(entries.map((e) => e.userId))], [entries]);
  const { data: users = [] } = useUsers(playerIds);
  const userMap = useMemo(() => {
    const m: Record<string, User> = {};
    for (const u of users) m[u._id] = u;
    return m;
  }, [users]);

  const createEntry = useCreateEntry();
  const deleteEntry = useDeleteEntry();
  const updateEntry = useUpdateEntry();
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();

  const [email, setEmail] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedNewTeam, setSelectedNewTeam] = useState<string[]>([]);
  const [newTeamGroupIndex, setNewTeamGroupIndex] = useState(0);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPlayers, setEditPlayers] = useState<string[]>([]);
  const [editGroupIndex, setEditGroupIndex] = useState(0);

  const sortedEntries = useMemo(() => sortEntriesByUser(entries, userMap), [entries, userMap]);

  const rosterGroupCount = tournament
    ? normalizeGroupCount(tournament.groupCount)
    : 4;
  const rosterVg = tournament
    ? validateTournamentGroups(tournament.maxTeams, rosterGroupCount)
    : { ok: true, groupCount: 4, teamsPerGroup: 4 };
  const rosterGc = rosterVg.ok ? rosterVg.groupCount : rosterGroupCount;

  const showGroupPicker = tournament ? tournamentAllowsManualGroupAssignment(tournament) : false;

  const entriesWithoutTeam = useMemo(
    () => entries.filter((e) => !e.teamId),
    [entries]
  );
  const freeUserIds = useMemo(
    () => [...new Set(entriesWithoutTeam.map((e) => e.userId))],
    [entriesWithoutTeam]
  );

  const openEdit = (team: Team) => {
    setEditingTeamId(team._id);
    setEditName(team.name ?? '');
    setEditPlayers([...(team.playerIds ?? [])]);
    setEditGroupIndex(teamGroupIndex(team));
  };

  const handleAddByEmail = async () => {
    const em = email.trim().toLowerCase();
    if (!em || !id || !adminId || !config.api.isConfigured) return;
    try {
      const u = (await usersApi.findOne({ email: em })) as User | null;
      if (!u?._id) {
        Alert.alert(t('common.error'), t('admin.rosterUserNotFound'));
        return;
      }
      if (entries.some((e) => e.userId === u._id)) {
        Alert.alert(t('common.error'), t('admin.rosterAlreadyInTournament'));
        return;
      }
      await createEntry.mutateAsync({
        tournamentId: id,
        userId: u._id,
        lookingForPartner: true,
      });
      setEmail('');
      void refetchEntries();
    } catch (e) {
      alertApiError(t, e, 'admin.rosterAddFailed');
    }
  };

  const handleRemovePlayer = (entry: Entry) => {
    if (!adminId || !id) return;
    const name = getTournamentPlayerDisplayName(userMap[entry.userId]) || entry.userId;
    Alert.alert(t('admin.rosterRemovePlayer'), t('admin.rosterRemovePlayerConfirm', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void deleteEntry
            .mutateAsync({ id: entry._id, tournamentId: id })
            .then(() => {
              void refetchEntries();
              void refetchTeams();
            })
            .catch((e: unknown) => alertApiError(t, e, 'tournamentDetail.organizerActionFailed'));
        },
      },
    ]);
  };

  const handleCreateTeam = async () => {
    if (!id || !adminId || !newTeamName.trim()) {
      Alert.alert(t('common.error'), t('admin.rosterTeamNameRequired'));
      return;
    }
    if (selectedNewTeam.length === 0) {
      Alert.alert(t('common.error'), t('admin.rosterPickAtLeastOne'));
      return;
    }
    if (selectedNewTeam.length > MAX_TEAM_PLAYERS) {
      Alert.alert(t('common.error'), t('admin.rosterMaxPlayers', { max: MAX_TEAM_PLAYERS }));
      return;
    }
    try {
      const team = await createTeam.mutateAsync({
        tournamentId: id,
        name: newTeamName.trim(),
        playerIds: selectedNewTeam,
        createdBy: adminId,
        ...(showGroupPicker ? { groupIndex: Math.min(rosterGc - 1, Math.max(0, newTeamGroupIndex)) } : {}),
      });
      for (const pid of selectedNewTeam) {
        const ent = entries.find((e) => e.userId === pid && e.tournamentId === id);
        if (ent?._id && team?._id) {
          await updateEntry.mutateAsync({
            id: ent._id,
            update: { teamId: team._id, status: 'in_team', lookingForPartner: false },
          });
        }
      }
      setNewTeamName('');
      setSelectedNewTeam([]);
      void refetchEntries();
      void refetchTeams();
    } catch (e) {
      alertApiError(t, e, 'admin.rosterCreateTeamFailed');
    }
  };

  const handleSaveTeamEdit = async () => {
    if (!editingTeamId || !id) return;
    const team = teams.find((x) => x._id === editingTeamId);
    if (!team) return;
    if (!editName.trim()) {
      Alert.alert(t('common.error'), t('admin.rosterTeamNameRequired'));
      return;
    }
    if (editPlayers.length === 0) {
      Alert.alert(t('common.error'), t('admin.rosterPickAtLeastOne'));
      return;
    }
    if (editPlayers.length > MAX_TEAM_PLAYERS) {
      Alert.alert(t('common.error'), t('admin.rosterMaxPlayers', { max: MAX_TEAM_PLAYERS }));
      return;
    }
    try {
      await updateTeam.mutateAsync({
        id: editingTeamId,
        update: {
          name: editName.trim(),
          playerIds: editPlayers,
          ...(showGroupPicker ? { groupIndex: Math.min(rosterGc - 1, Math.max(0, editGroupIndex)) } : {}),
        },
      });
      setEditingTeamId(null);
      void refetchEntries();
      void refetchTeams();
    } catch (e) {
      alertApiError(t, e, 'admin.rosterSaveTeamFailed');
    }
  };

  const handleDeleteTeam = (team: Team) => {
    if (!adminId || !id) return;
    Alert.alert(t('admin.rosterDeleteTeam'), t('admin.rosterDeleteTeamConfirm', { name: team.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void deleteTeam
            .mutateAsync({ id: team._id, tournamentId: id })
            .then(() => {
              void refetchEntries();
              void refetchTeams();
              if (editingTeamId === team._id) setEditingTeamId(null);
            })
            .catch((e: unknown) => alertApiError(t, e, 'admin.rosterSaveTeamFailed'));
        },
      },
    ]);
  };

  const selectableForEdit = useMemo(() => {
    if (!editingTeamId) return [];
    const set = new Set<string>();
    for (const e of entries) {
      if (e.teamId === editingTeamId || !e.teamId) set.add(e.userId);
    }
    return [...set];
  }, [entries, editingTeamId]);

  const loading = loadingT || loadingE || loadingTeams;

  if (!id) {
    return (
      <>
        <Stack.Screen options={{ title: t('admin.rosterTitle') }} />
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('tournamentDetail.failedToLoad')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: tournament?.name ? `${t('admin.rosterTitle')}: ${tournament.name}` : t('admin.rosterTitle') }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {loading && !tournament ? (
          <ActivityIndicator color={tokens.accent} style={{ marginTop: 24 }} />
        ) : null}

        <Text style={styles.hint}>{t('admin.rosterHint')}</Text>

        <Text style={styles.sectionTitle}>{t('admin.rosterPlayers')}</Text>
        {sortedEntries.length === 0 ? (
          <Text style={styles.muted}>{t('admin.rosterNoPlayers')}</Text>
        ) : (
          sortedEntries.map((entry) => (
            <View key={entry._id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{getTournamentPlayerDisplayName(userMap[entry.userId]) || entry.userId}</Text>
                <Text style={styles.rowMeta}>
                  {entry.teamId ? t('admin.rosterInTeam') : t('admin.rosterSolo')}
                </Text>
              </View>
              <IconButton
                icon="trash-outline"
                onPress={() => handleRemovePlayer(entry)}
                accessibilityLabel={t('admin.rosterRemovePlayer')}
                color={Colors.danger}
              />
            </View>
          ))
        )}

        <View style={styles.field}>
          <Text style={styles.label}>{t('admin.rosterAddByEmail')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('admin.rosterEmailPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Button
            title={t('admin.rosterAddPlayer')}
            onPress={() => void handleAddByEmail()}
            disabled={createEntry.isPending || !email.trim()}
            variant="secondary"
            fullWidth
          />
        </View>

        <Text style={styles.sectionTitle}>{t('admin.rosterTeams')}</Text>
        {teams.length === 0 ? (
          <Text style={styles.muted}>{t('admin.rosterNoTeams')}</Text>
        ) : (
          teams.map((team) => (
            <View key={team._id} style={styles.teamCard}>
              {editingTeamId === team._id ? (
                <>
                  <TextInput
                    style={styles.input}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder={t('tournaments.name')}
                  />
                  {showGroupPicker ? (
                    <>
                      <Text style={styles.subLabel}>{t('admin.rosterGroup')}</Text>
                      <View style={styles.groupRow}>
                        {Array.from({ length: rosterGc }, (_, i) => (
                          <Pressable
                            key={i}
                            onPress={() => setEditGroupIndex(i)}
                            style={[styles.groupChip, editGroupIndex === i && styles.groupChipOn]}
                          >
                            <Text style={[styles.groupChipText, editGroupIndex === i && styles.groupChipTextOn]}>
                              {i + 1}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  ) : null}
                  <Text style={styles.subLabel}>{t('admin.rosterPickPlayers')}</Text>
                  <View style={styles.chipWrap}>
                    {selectableForEdit.map((uid) => (
                      <Pressable
                        key={uid}
                        style={[styles.chip, editPlayers.includes(uid) && styles.chipOn]}
                        onPress={() => {
                          if (editPlayers.includes(uid)) {
                            setEditPlayers(editPlayers.filter((x) => x !== uid));
                          } else if (editPlayers.length < MAX_TEAM_PLAYERS) {
                            setEditPlayers([...editPlayers, uid]);
                          }
                        }}
                      >
                        <Text style={styles.chipText}>{getTournamentPlayerDisplayName(userMap[uid]) || uid}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.rowActions}>
                    <Button title={t('common.save')} onPress={() => void handleSaveTeamEdit()} variant="primary" />
                    <Button title={t('common.cancel')} onPress={() => setEditingTeamId(null)} variant="outline" />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.teamCardHeader}>
                    <View style={styles.teamCardHeaderLeft}>
                      <Text style={styles.teamName}>{team.name}</Text>
                    </View>
                    <View style={styles.teamCardHeaderActions}>
                      <IconButton
                        icon="create-outline"
                        onPress={() => openEdit(team)}
                        accessibilityLabel={t('admin.edit')}
                        color={tokens.accent}
                      />
                      <IconButton
                        icon="trash-outline"
                        onPress={() => handleDeleteTeam(team)}
                        accessibilityLabel={t('admin.rosterDeleteTeam')}
                        color={Colors.danger}
                      />
                    </View>
                  </View>
                  <Text style={styles.teamGroupMeta}>
                    {tournament?.groupsDistributedAt === null && team.groupIndex == null
                      ? t('admin.rosterNoGroupYet')
                      : t('tournamentDetail.groupTitle', { n: teamGroupIndex(team) + 1 })}
                  </Text>
                  <Text style={styles.teamPlayers}>
                    {(team.playerIds ?? [])
                      .map((pid) => getTournamentPlayerDisplayName(userMap[pid]) || pid)
                      .join(' · ')}
                  </Text>
                </>
              )}
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>{t('admin.rosterCreateTeam')}</Text>
        <View style={styles.field}>
          <Text style={styles.label}>{t('team.teamName')}</Text>
          <TextInput
            style={styles.input}
            value={newTeamName}
            onChangeText={setNewTeamName}
            placeholder={t('team.teamNamePlaceholder')}
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        {showGroupPicker ? (
          <>
            <Text style={styles.subLabel}>{t('admin.rosterGroup')}</Text>
            <View style={styles.groupRow}>
              {Array.from({ length: rosterGc }, (_, i) => (
                <Pressable
                  key={i}
                  onPress={() => setNewTeamGroupIndex(i)}
                  style={[styles.groupChip, newTeamGroupIndex === i && styles.groupChipOn]}
                >
                  <Text style={[styles.groupChipText, newTeamGroupIndex === i && styles.groupChipTextOn]}>
                    {i + 1}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.muted}>{t('admin.rosterGroupsAfterCreateGroups')}</Text>
        )}
        <Text style={styles.subLabel}>{t('admin.rosterPickPlayersFree')}</Text>
        <View style={styles.chipWrap}>
          {freeUserIds.map((uid) => (
            <Pressable
              key={uid}
              style={[styles.chip, selectedNewTeam.includes(uid) && styles.chipOn]}
              onPress={() => {
                if (selectedNewTeam.includes(uid)) {
                  setSelectedNewTeam(selectedNewTeam.filter((x) => x !== uid));
                } else if (selectedNewTeam.length < MAX_TEAM_PLAYERS) {
                  setSelectedNewTeam([...selectedNewTeam, uid]);
                }
              }}
            >
              <Text style={styles.chipText}>{getTournamentPlayerDisplayName(userMap[uid]) || uid}</Text>
            </Pressable>
          ))}
        </View>
        {freeUserIds.length === 0 ? (
          <Text style={styles.muted}>{t('admin.rosterNoFreePlayers')}</Text>
        ) : null}
        <Button
          title={t('admin.rosterCreateTeam')}
          onPress={() => void handleCreateTeam()}
          disabled={createTeam.isPending || !newTeamName.trim() || selectedNewTeam.length === 0}
          fullWidth
        />

      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  hint: { fontSize: 13, color: Colors.textMuted, marginBottom: 16, lineHeight: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 12, marginTop: 8 },
  muted: { fontSize: 14, color: Colors.textMuted, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  rowMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  subLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 10,
  },
  teamCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    gap: 10,
  },
  teamCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  teamCardHeaderLeft: { flex: 1, minWidth: 0 },
  teamCardHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  teamName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  teamGroupMeta: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', marginBottom: 4 },
  teamPlayers: { fontSize: 14, color: Colors.textSecondary },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  groupChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surfaceLight,
  },
  groupChipOn: { backgroundColor: Colors.surfaceLight, borderColor: Colors.surfaceLight },
  groupChipText: { fontSize: 14, fontWeight: '600', color: Colors.text },
  groupChipTextOn: { color: '#fff' },
  rowActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  chipOn: { backgroundColor: Colors.surfaceLight, borderColor: Colors.surfaceLight },
  chipText: { fontSize: 14, fontWeight: '600', color: Colors.text },
});
