import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { GuestPlayerCard } from '@/components/tournament/detail/GuestPlayerCard';
import { useTournament } from '@/lib/hooks/useTournaments';
import { tournamentsApi } from '@/lib/api';
import { useUserStore } from '@/store/useUserStore';
import { useTranslation } from '@/lib/i18n';
import { alertApiError } from '@/lib/utils/apiError';
import { shouldUseDevMocks } from '@/lib/config';
import type { Gender, Tournament, TournamentGuestPlayer } from '@/types';

type GuestActionBody = Record<string, unknown> & { action?: string };
type GuestMutationContext = { previous?: Tournament; optimisticGuestId?: string };

export default function TournamentGuestPlayersScreen() {
  const { t } = useTranslation();
  const { id, guestId } = useLocalSearchParams<{ id: string; guestId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;

  const { data: tournament, isLoading } = useTournament(id);
  const canManage =
    !!tournament && !!userId && ((tournament.organizerIds ?? []).includes(userId) || user?.role === 'admin');

  const guests = tournament?.guestPlayers ?? [];
  const sortedGuests = useMemo(
    () =>
      [...guests].sort((a, b) => {
        const an = String(a?.displayName ?? '').trim().toLowerCase();
        const bn = String(b?.displayName ?? '').trim().toLowerCase();
        if (an !== bn) return an < bn ? -1 : 1;
        const ai = String(a?._id ?? '');
        const bi = String(b?._id ?? '');
        return ai < bi ? -1 : ai > bi ? 1 : 0;
      }),
    [guests]
  );

  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [note, setNote] = useState('');

  const [editingGuest, setEditingGuest] = useState<TournamentGuestPlayer | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editGender, setEditGender] = useState<Gender>('male');
  const [editNote, setEditNote] = useState('');

  const autoOpenedEditRef = useRef(false);

  const guestMutation = useMutation<unknown, unknown, GuestActionBody, GuestMutationContext>({
    mutationFn: (body) => tournamentsApi.action(id!, body) as Promise<unknown>,
    onMutate: async (body) => {
      if (!id || body.action !== 'createGuestPlayer') return {};
      const displayName = String(body.displayName ?? '').trim();
      const gender = body.gender === 'female' ? 'female' : 'male';
      const note = typeof body.note === 'string' ? body.note.trim() : '';
      if (!displayName) return {};

      await queryClient.cancelQueries({ queryKey: ['tournament', id] });
      const previous = queryClient.getQueryData<Tournament>(['tournament', id]);
      const optimisticGuestId = `optimistic-guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const now = new Date().toISOString();
      const optimisticGuest: TournamentGuestPlayer = {
        _id: optimisticGuestId,
        tournamentId: id,
        displayName,
        gender,
        ...(note ? { note } : {}),
        createdBy: userId ?? '',
        createdAt: now,
        updatedAt: now,
      };

      queryClient.setQueryData<Tournament>(['tournament', id], (old) => {
        if (!old) return old;
        return { ...old, guestPlayers: [...(old.guestPlayers ?? []), optimisticGuest] };
      });

      return { previous, optimisticGuestId };
    },
    onError: (err, variables, context) => {
      if (context?.previous !== undefined && id) {
        queryClient.setQueryData(['tournament', id], context.previous);
      }
      alertApiError(t, err, 'tournamentDetail.organizerActionFailed');
    },
    onSuccess: (data, variables, context) => {
      if (!id) return;
      if (variables.action === 'createGuestPlayer' && context?.optimisticGuestId && data && typeof data === 'object') {
        const real = data as TournamentGuestPlayer;
        queryClient.setQueryData<Tournament>(['tournament', id], (old) => {
          if (!old) return old;
          const list = old.guestPlayers ?? [];
          const next = list.map((g) => (g._id === context.optimisticGuestId ? real : g));
          return { ...old, guestPlayers: next };
        });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      void queryClient.invalidateQueries({ queryKey: ['teams'] });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
  });

  useEffect(() => {
    if (!canManage) return;
    const gid = String(guestId ?? '').trim();
    if (!gid) return;
    if (autoOpenedEditRef.current) return;
    const target = guests.find((g) => String(g?._id ?? '') === gid);
    if (target) {
      autoOpenedEditRef.current = true;
      openEditGuest(target);
    }
  }, [guestId, guests, canManage]);

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
        onSuccess: () => {
          closeEditGuest();
          if (String(guestId ?? '').trim()) {
            router.back();
          }
        },
      }
    );
  };

  const confirmDeleteGuest = (g: TournamentGuestPlayer) => {
    Alert.alert(t('tournamentDetail.guestDeleteTitle'), t('tournamentDetail.guestDeleteConfirm', { name: g.displayName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          guestMutation.mutate({ action: 'deleteGuestPlayer', guestId: g._id }),
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
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom, paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.section}>
          {editingGuest ? t('tournamentDetail.guestEditTitle') : t('tournamentDetail.guestPlayersAdd')}
        </Text>
        <Text style={styles.label}>{t('tournamentDetail.guestDisplayName')}</Text>
        <TextInput
          style={styles.input}
          value={editingGuest ? editDisplayName : displayName}
          onChangeText={editingGuest ? setEditDisplayName : setDisplayName}
          placeholder={t('tournamentDetail.guestDisplayNamePlaceholder')}
          placeholderTextColor={Colors.textMuted}
        />
        <Text style={styles.label}>{t('profile.gender')}</Text>
        <View style={styles.genderRow}>
          {(['male', 'female'] as const).map((g) => (
            <Pressable
              key={g}
              onPress={() => (editingGuest ? setEditGender(g) : setGender(g))}
              style={[
                styles.genderChip,
                (editingGuest ? editGender : gender) === g && styles.genderChipOn,
              ]}
            >
              <Text
                style={[
                  styles.genderChipText,
                  (editingGuest ? editGender : gender) === g && styles.genderChipTextOn,
                ]}
              >
                {g === 'male' ? t('profile.genderMale') : t('profile.genderFemale')}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>{t('tournamentDetail.guestNoteOptional')}</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={editingGuest ? editNote : note}
          onChangeText={editingGuest ? setEditNote : setNote}
          placeholder={t('tournamentDetail.guestNotePlaceholder')}
          placeholderTextColor={Colors.textMuted}
          multiline
        />
        <View style={{ marginTop: 14 }}>
          {editingGuest ? (
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <View style={{ flexGrow: 1, flexBasis: 140 }}>
                <Button
                  title={t('common.cancel')}
                  variant="secondary"
                  onPress={() => {
                    closeEditGuest();
                    if (String(guestId ?? '').trim()) router.back();
                  }}
                  disabled={guestMutation.isPending}
                  fullWidth
                />
              </View>
              <View style={{ flexGrow: 1, flexBasis: 140 }}>
                <Button
                  title={t('common.save')}
                  onPress={handleSaveEdit}
                  disabled={guestMutation.isPending}
                  fullWidth
                />
              </View>
            </View>
          ) : (
            <Button
              title={t('tournamentDetail.guestPlayersAddButton')}
              onPress={handleCreate}
              disabled={guestMutation.isPending}
              fullWidth
            />
          )}
        </View>

        <View style={styles.guestListBlock}>
          <Text style={styles.guestListTitle}>
            {t('tournamentDetail.tabPlayers')} ({sortedGuests.length})
          </Text>
          {sortedGuests.length === 0 ? (
            <Text style={styles.muted}>{t('common.noResults')}</Text>
          ) : (
            <View style={styles.guestList}>
              {sortedGuests.map((g) => {
                const gid = String(g._id ?? '').trim();
                const isEditing = !!(editingGuest && String(editingGuest._id ?? '') === gid);
                return (
                  <Pressable
                    key={gid}
                    onPress={() => {
                      if (!gid) return;
                      router.push(`/tournament/${id}/guest-players?guestId=${gid}` as never);
                    }}
                    style={isEditing ? styles.guestRowActive : null}
                    accessibilityRole="button"
                  >
                    <GuestPlayerCard
                      guest={g}
                      t={t}
                      onEdit={() => router.push(`/tournament/${id}/guest-players?guestId=${gid}` as never)}
                      onDelete={() => confirmDeleteGuest(g)}
                      disabled={guestMutation.isPending}
                      compact
                    />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
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
  muted: { color: Colors.textMuted, textAlign: 'center' },
  guestListBlock: { marginTop: 16, gap: 8, paddingBottom: 8 },
  guestListTitle: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary },
  guestList: { gap: 10 },
  guestRowActive: { borderWidth: 1, borderColor: Colors.surfaceLight, borderRadius: 14 },
});
