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
  Modal,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useTournament } from '@/lib/hooks/useTournaments';
import { tournamentsApi } from '@/lib/api';
import { useUserStore } from '@/store/useUserStore';
import { useTranslation } from '@/lib/i18n';
import { alertApiError } from '@/lib/utils/apiError';
import { shouldUseDevMocks } from '@/lib/config';
import type { Gender, TournamentGuestPlayer } from '@/types';

export default function TournamentGuestPlayersScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;

  const { data: tournament, isLoading } = useTournament(id);
  const canManage =
    !!tournament && !!userId && ((tournament.organizerIds ?? []).includes(userId) || user?.role === 'admin');

  const guests = tournament?.guestPlayers ?? [];

  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [note, setNote] = useState('');

  const [editingGuest, setEditingGuest] = useState<TournamentGuestPlayer | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editGender, setEditGender] = useState<Gender>('male');
  const [editNote, setEditNote] = useState('');

  const guestMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => tournamentsApi.action(id!, body) as Promise<unknown>,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      void queryClient.invalidateQueries({ queryKey: ['teams'] });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
  });

  const sortedGuests = useMemo(
    () => [...guests].sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })),
    [guests]
  );

  const handleCreate = () => {
    const n = displayName.trim();
    if (!n) return Alert.alert(t('common.error'), t('tournamentDetail.guestDisplayNameRequired'));
    guestMutation.mutate(
      { action: 'createGuestPlayer', displayName: n, gender, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: () => {
          setDisplayName('');
          setNote('');
        },
        onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
      }
    );
  };

  const openEditGuest = (g: TournamentGuestPlayer) => {
    setEditingGuest(g);
    setEditDisplayName(g.displayName);
    setEditGender(g.gender);
    setEditNote(typeof g.note === 'string' ? g.note : '');
  };

  const closeEditGuest = () => {
    setEditingGuest(null);
  };

  const handleSaveEdit = () => {
    if (!editingGuest) return;
    const n = editDisplayName.trim();
    if (!n) return Alert.alert(t('common.error'), t('tournamentDetail.guestDisplayNameRequired'));
    guestMutation.mutate(
      {
        action: 'updateGuestPlayer',
        guestId: editingGuest._id,
        displayName: n,
        gender: editGender,
        note: editNote.trim(),
      },
      {
        onSuccess: () => closeEditGuest(),
        onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
      }
    );
  };

  const confirmDelete = (g: TournamentGuestPlayer) => {
    Alert.alert(t('tournamentDetail.guestDeleteTitle'), t('tournamentDetail.guestDeleteConfirm', { name: g.displayName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          guestMutation.mutate(
            { action: 'deleteGuestPlayer', guestId: g._id },
            { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
          ),
      },
    ]);
  };

  if (!id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{t('tournamentDetail.failedToLoad')}</Text>
      </View>
    );
  }

  if (shouldUseDevMocks()) {
    return (
      <>
        <Stack.Screen options={{ title: t('tournamentDetail.guestPlayersTitle') }} />
        <View style={[styles.centered, { padding: 20 }]}>
          <Text style={styles.muted}>{t('tournamentDetail.guestPlayersDevMocks')}</Text>
        </View>
      </>
    );
  }

  if (isLoading || !tournament) {
    return (
      <>
        <Stack.Screen options={{ title: t('tournamentDetail.guestPlayersTitle') }} />
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.text} />
        </View>
      </>
    );
  }

  if (!canManage) {
    return (
      <>
        <Stack.Screen options={{ title: t('tournamentDetail.guestPlayersTitle') }} />
        <View style={[styles.centered, { padding: 20 }]}>
          <Text style={styles.muted}>{t('tournamentDetail.organizerActionFailed')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('tournamentDetail.guestPlayersTitle') }} />
      <Modal visible={!!editingGuest} animationType="fade" transparent onRequestClose={closeEditGuest}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeEditGuest} accessibilityRole="button" />
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>{t('tournamentDetail.guestEditTitle')}</Text>
            <Text style={styles.label}>{t('tournamentDetail.guestDisplayName')}</Text>
            <TextInput
              style={styles.input}
              value={editDisplayName}
              onChangeText={setEditDisplayName}
              placeholder={t('tournamentDetail.guestDisplayNamePlaceholder')}
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.label}>{t('profile.gender')}</Text>
            <View style={styles.genderRow}>
              {(['male', 'female'] as const).map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setEditGender(g)}
                  style={[styles.genderChip, editGender === g && styles.genderChipOn]}
                >
                  <Text style={[styles.genderChipText, editGender === g && styles.genderChipTextOn]}>
                    {g === 'male' ? t('profile.genderMale') : t('profile.genderFemale')}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>{t('tournamentDetail.guestNoteOptional')}</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={editNote}
              onChangeText={setEditNote}
              placeholder={t('tournamentDetail.guestNotePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              multiline
            />
            <View style={styles.modalActions}>
              <Button title={t('common.cancel')} variant="secondary" onPress={closeEditGuest} disabled={guestMutation.isPending} />
              <Button title={t('common.save')} onPress={handleSaveEdit} disabled={guestMutation.isPending} />
            </View>
          </View>
        </View>
      </Modal>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom, paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>{t('tournamentDetail.guestPlayersHint')}</Text>

        <Text style={styles.section}>{t('tournamentDetail.guestPlayersAdd')}</Text>
        <Text style={styles.label}>{t('tournamentDetail.guestDisplayName')}</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder={t('tournamentDetail.guestDisplayNamePlaceholder')}
          placeholderTextColor={Colors.textMuted}
        />
        <Text style={styles.label}>{t('profile.gender')}</Text>
        <View style={styles.genderRow}>
          {(['male', 'female'] as const).map((g) => (
            <Pressable
              key={g}
              onPress={() => setGender(g)}
              style={[styles.genderChip, gender === g && styles.genderChipOn]}
            >
              <Text style={[styles.genderChipText, gender === g && styles.genderChipTextOn]}>
                {g === 'male' ? t('profile.genderMale') : t('profile.genderFemale')}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>{t('tournamentDetail.guestNoteOptional')}</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={note}
          onChangeText={setNote}
          placeholder={t('tournamentDetail.guestNotePlaceholder')}
          placeholderTextColor={Colors.textMuted}
          multiline
        />
        <Button
          title={t('tournamentDetail.guestPlayersAddButton')}
          onPress={handleCreate}
          disabled={guestMutation.isPending}
          fullWidth
        />

        <Text style={[styles.section, { marginTop: 28 }]}>{t('tournamentDetail.guestPlayersList')}</Text>
        {sortedGuests.length === 0 ? (
          <Text style={styles.muted}>{t('team.noGuestPlayers')}</Text>
        ) : (
          sortedGuests.map((g) => (
            <View key={g._id} style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle}>{g.displayName}</Text>
                <Text style={styles.rowMeta}>
                  {g.gender === 'male' ? t('profile.genderMale') : t('profile.genderFemale')}
                  {g.note ? ` · ${g.note}` : ''}
                </Text>
              </View>
              <View style={styles.rowActions}>
                <IconButton
                  icon="create-outline"
                  onPress={() => openEditGuest(g)}
                  disabled={guestMutation.isPending}
                  accessibilityLabel={t('tournamentDetail.guestEditAccessibility')}
                  compact
                />
                <IconButton
                  icon="trash-outline"
                  onPress={() => confirmDelete(g)}
                  disabled={guestMutation.isPending}
                  accessibilityLabel={t('common.delete')}
                  color="#f87171"
                  compact
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  hint: { fontSize: 13, color: Colors.textMuted, marginTop: 12, marginBottom: 8 },
  section: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.text,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  genderRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  genderChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  genderChipOn: { backgroundColor: Colors.surfaceLight },
  genderChipText: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
  genderChipTextOn: { color: Colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    marginBottom: 8,
  },
  rowTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  rowMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
    flexWrap: 'wrap',
  },
  muted: { color: Colors.textMuted, textAlign: 'center' },
});
