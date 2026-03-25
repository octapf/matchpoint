import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Pressable } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { useTournament, useUpdateTournament } from '@/lib/hooks/useTournaments';
import { tournamentsApi } from '@/lib/api';
import { useUserStore } from '@/store/useUserStore';
import type { Tournament, TournamentStatus } from '@/types';

const MIN_DATE = new Date(2000, 0, 1);

const STATUSES: TournamentStatus[] = ['open', 'full', 'cancelled'];

export default function AdminEditTournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useUserStore((s) => s.user?._id ?? null);

  const { data: tournament, isLoading, isError, error: loadError } = useTournament(id);
  const updateTournament = useUpdateTournament();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [maxTeams, setMaxTeams] = useState('16');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TournamentStatus>('open');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!tournament) return;
    setName(tournament.name ?? '');
    const sd = tournament.startDate || tournament.date || '';
    setStartDate(sd);
    setEndDate(tournament.endDate || sd);
    setLocation(tournament.location ?? '');
    setMaxTeams(String(tournament.maxTeams ?? 16));
    setDescription(tournament.description ?? '');
    setStatus(tournament.status ?? 'open');
  }, [tournament]);

  const handleSave = () => {
    if (!id || !name.trim() || !startDate || !location.trim()) {
      Alert.alert(t('common.error'), t('tournaments.missingFields'));
      return;
    }
    const end = endDate || startDate;
    if (end < startDate) {
      Alert.alert(t('common.error'), t('tournaments.invalidDates'));
      return;
    }
    const max = parseInt(maxTeams, 10) || 16;
    if (max < 2 || max > 64) {
      Alert.alert(t('common.error'), t('tournaments.invalidMaxTeams'));
      return;
    }

    updateTournament.mutate(
      {
        id,
        name: name.trim(),
        date: startDate,
        startDate,
        endDate: end,
        location: location.trim(),
        maxTeams: max,
        description: description.trim() || undefined,
        status,
      },
      {
        onSuccess: () => router.back(),
        onError: (err) =>
          Alert.alert(t('common.error'), err instanceof Error ? err.message : t('tournamentDetail.failedToLoad')),
      }
    );
  };

  const handleDelete = () => {
    if (!id || !userId || !tournament) return;
    Alert.alert(t('admin.deleteTournamentAdmin'), t('admin.deleteTournamentAdminConfirm', { name: tournament.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          setDeleting(true);
          void (async () => {
            try {
              await tournamentsApi.deleteOne(id, userId);
              await queryClient.invalidateQueries({ queryKey: ['tournaments'] });
              router.replace('/admin/tournaments');
            } catch (e) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : 'Failed');
            } finally {
              setDeleting(false);
            }
          })();
        },
      },
    ]);
  };

  if (isError) {
    return (
      <>
        <Stack.Screen options={{ title: t('admin.editTournamentTitle') }} />
        <View style={styles.centered}>
          <Text style={styles.muted}>{loadError?.message ?? t('tournamentDetail.failedToLoad')}</Text>
          <Button title={t('common.ok')} onPress={() => router.back()} fullWidth />
        </View>
      </>
    );
  }

  if (isLoading || !tournament) {
    return (
      <>
        <Stack.Screen options={{ title: t('admin.editTournamentTitle') }} />
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('common.loading')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('admin.editTournamentTitle') }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.hint}>{t('admin.editTournamentHint')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('tournaments.name')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('tournaments.namePlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
          />
        </View>

        <DatePickerField label={t('tournaments.startDate')} value={startDate} onChange={setStartDate} minDate={MIN_DATE} />
        <DatePickerField
          label={t('tournaments.endDate')}
          value={endDate}
          onChange={(d) => setEndDate(d)}
          minDate={startDate ? new Date(startDate + 'T12:00:00') : MIN_DATE}
        />

        <View style={styles.field}>
          <Text style={styles.label}>{t('tournaments.location')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('tournaments.locationPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={location}
            onChangeText={setLocation}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('tournaments.maxTeams')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('tournaments.maxTeamsPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
            value={maxTeams}
            onChangeText={setMaxTeams}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('admin.statusLabel')}</Text>
          <View style={styles.statusRow}>
            {STATUSES.map((s) => (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.statusPill, status === s ? styles.statusPillActive : styles.statusPillInactive]}
              >
                <Text style={[styles.statusPillText, status === s && styles.statusPillTextActive]}>
                  {s === 'open' ? t('admin.statusOpen') : s === 'full' ? t('admin.statusFull') : t('admin.statusCancelled')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('tournaments.description')}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t('tournaments.descriptionPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={3}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View style={styles.actions}>
          <Button
            title={t('common.save')}
            onPress={handleSave}
            disabled={updateTournament.isPending}
            fullWidth
          />
          <Button
            title={t('admin.deleteTournamentAdmin')}
            onPress={handleDelete}
            variant="danger"
            fullWidth
            disabled={deleting || updateTournament.isPending}
          />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 24,
    gap: 16,
  },
  hint: { fontSize: 13, color: Colors.textMuted, marginBottom: 20, lineHeight: 18 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusPill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
  },
  statusPillActive: {
    backgroundColor: Colors.yellow,
    borderColor: Colors.yellow,
  },
  statusPillInactive: {},
  statusPillText: { fontSize: 14, fontWeight: '600', color: Colors.text },
  statusPillTextActive: { color: '#1a1a1a' },
  actions: { gap: 12, marginTop: 8 },
  muted: { color: Colors.textMuted },
});
