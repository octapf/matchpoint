import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Pressable,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { GroupCountSelect } from '@/components/ui/GroupCountSelect';
import { MaxTeamsSelect } from '@/components/ui/MaxTeamsSelect';
import { useTournament, useUpdateTournament } from '@/lib/hooks/useTournaments';
import { useEntries } from '@/lib/hooks/useEntries';
import { useUserStore } from '@/store/useUserStore';
import type { Tournament } from '@/types';
import {
  normalizeGroupCount,
  validateTournamentGroups,
  getValidGroupCountsForMaxTeams,
  pickGroupCountForMaxTeams,
  maxPlayerSlotsForTournament,
} from '@/lib/tournamentGroups';

const MIN_DATE = new Date(2000, 0, 1);
const SAVE_DEBOUNCE_MS = 750;

function serverMatchesForm(
  t: Tournament,
  name: string,
  startDate: string,
  endDate: string,
  location: string,
  maxTeamsStr: string,
  groupCountStr: string,
  description: string,
  cancelledLocal: boolean,
): boolean {
  const max = parseInt(maxTeamsStr, 10) || 16;
  const gc = normalizeGroupCount(parseInt(groupCountStr, 10) || 4);
  const sd = t.startDate || t.date || '';
  const ed = t.endDate || sd;
  const end = endDate || startDate;
  return (
    (t.name ?? '') === name.trim() &&
    sd === startDate &&
    ed === end &&
    (t.location ?? '') === location.trim() &&
    (t.maxTeams ?? 16) === max &&
    (t.groupCount ?? 4) === gc &&
    (t.description ?? '') === description.trim() &&
    (t.status === 'cancelled') === cancelledLocal
  );
}

export default function AdminEditTournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();

  const { data: tournament, isLoading, isError, error: loadError } = useTournament(id);
  const { data: entries = [] } = useEntries(id ? { tournamentId: id } : undefined, { enabled: !!id });
  const updateTournament = useUpdateTournament();
  const actingUserId = useUserStore((s) => s.user?._id ?? null);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [maxTeams, setMaxTeams] = useState('16');
  const [groupCount, setGroupCount] = useState('4');
  const [description, setDescription] = useState('');
  const [cancelledLocal, setCancelledLocal] = useState(false);
  const [saving, setSaving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!tournament) return;
    setName(tournament.name ?? '');
    const sd = tournament.startDate || tournament.date || '';
    setStartDate(sd);
    setEndDate(tournament.endDate || sd);
    setLocation(tournament.location ?? '');
    setMaxTeams(String(tournament.maxTeams ?? 16));
    setGroupCount(String(tournament.groupCount ?? 4));
    setDescription(tournament.description ?? '');
    setCancelledLocal(tournament.status === 'cancelled');
  }, [tournament]);

  const maxTeamsForSelect = useMemo(() => {
    const n = parseInt(maxTeams, 10);
    return Number.isFinite(n) && n >= 2 && n <= 64 ? n : 16;
  }, [maxTeams]);

  /** Pass `cancelledOverride` from the cancel Switch so we save the new value immediately (debounced save can run before state updates). */
  const persist = useCallback(
    (cancelledOverride?: boolean) => {
      if (!id || !tournament) return;
      if (!name.trim() || !startDate || !location.trim()) return;

      const cancelledEff = cancelledOverride !== undefined ? cancelledOverride : cancelledLocal;

      const end = endDate || startDate;
      if (end < startDate) return;
      const max = parseInt(maxTeams, 10) || 16;
      if (max < 2 || max > 64) return;
      const gc = normalizeGroupCount(parseInt(groupCount, 10) || 4);
      const vg = validateTournamentGroups(max, gc);
      if (!vg.ok) return;

      if (
        serverMatchesForm(
          tournament,
          name,
          startDate,
          endDate,
          location,
          maxTeams,
          groupCount,
          description,
          cancelledEff,
        )
      ) {
        return;
      }

      const serverCancelled = tournament.status === 'cancelled';
      const payload: Record<string, unknown> = {
        id,
        name: name.trim(),
        date: startDate,
        startDate,
        endDate: end,
        location: location.trim(),
        maxTeams: max,
        groupCount: vg.groupCount,
        description: description.trim() || undefined,
      };
      if (actingUserId) {
        payload.actingUserId = actingUserId;
      }
      if (cancelledEff !== serverCancelled) {
        payload.status = cancelledEff ? 'cancelled' : 'open';
      }

      setSaving(true);
      updateTournament.mutate(
        payload as { id: string } & Record<string, unknown>,
        {
          onSettled: () => setSaving(false),
          onError: (err) =>
            Alert.alert(t('common.error'), err instanceof Error ? err.message : t('tournamentDetail.failedToLoad')),
        },
      );
    },
    [
      id,
      tournament,
      name,
      startDate,
      endDate,
      location,
      maxTeams,
      groupCount,
      description,
      cancelledLocal,
      actingUserId,
      t,
      updateTournament,
    ],
  );

  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      saveFnRef.current();
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const flushSave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    saveFnRef.current();
  }, []);

  useEffect(() => {
    const mt = parseInt(maxTeams, 10);
    if (!Number.isFinite(mt) || mt < 2 || mt > 64) return;
    const valid = getValidGroupCountsForMaxTeams(mt);
    if (valid.length === 0) return;
    const gc = parseInt(groupCount, 10);
    const cur = Number.isFinite(gc) ? gc : 4;
    if (!valid.includes(cur)) {
      const next = String(pickGroupCountForMaxTeams(mt, cur));
      setGroupCount(next);
      const tid = setTimeout(() => flushSave(), 120);
      return () => clearTimeout(tid);
    }
  }, [maxTeams, flushSave]);

  useEffect(() => {
    saveFnRef.current = () => {
      persist(undefined);
    };
  }, [persist]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.hint}>{t('admin.editTournamentHint')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('tournaments.name')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('tournaments.namePlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={(v) => {
              setName(v);
              scheduleSave();
            }}
            onBlur={flushSave}
          />
        </View>

        <DatePickerField
          label={t('tournaments.startDate')}
          value={startDate}
          onChange={(d) => {
            setStartDate(d);
            scheduleSave();
          }}
          minDate={MIN_DATE}
        />
        <DatePickerField
          label={t('tournaments.endDate')}
          value={endDate}
          onChange={(d) => {
            setEndDate(d);
            scheduleSave();
          }}
          minDate={startDate ? new Date(startDate + 'T12:00:00') : MIN_DATE}
        />

        <View style={styles.field}>
          <Text style={styles.label}>{t('tournaments.location')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('tournaments.locationPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={location}
            onChangeText={(v) => {
              setLocation(v);
              scheduleSave();
            }}
            onBlur={flushSave}
          />
        </View>

        <MaxTeamsSelect
          label={t('tournaments.maxTeams')}
          value={maxTeams}
          onChange={(v) => {
            setMaxTeams(v);
            scheduleSave();
          }}
        />

        <View style={styles.groupFieldWrap}>
          <GroupCountSelect
            label={t('tournaments.groupCount')}
            maxTeams={maxTeamsForSelect}
            value={groupCount}
            onChange={(v) => {
              setGroupCount(v);
              scheduleSave();
            }}
          />
          <Text style={styles.groupHint}>{t('tournaments.groupCountHint')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('admin.registrationStatus')}</Text>
          {cancelledLocal ? (
            <Text style={styles.statusReadout}>{t('admin.statusCancelled')}</Text>
          ) : (
            <>
              <Text style={styles.statusReadout}>
                {tournament.status === 'full' ? t('admin.statusFull') : t('admin.statusOpen')}
              </Text>
              <Text style={styles.registrationCount}>
                {t('admin.registrationPlayersCount', {
                  current: entries.length,
                  max: maxPlayerSlotsForTournament(parseInt(maxTeams, 10) || 16),
                })}
              </Text>
            </>
          )}
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchRowText}>
            <Text style={styles.label}>{t('admin.cancelledSwitchLabel')}</Text>
          </View>
          <Switch
            value={cancelledLocal}
            trackColor={{ false: Colors.surfaceLight, true: Colors.yellow }}
            thumbColor="#f4f4f5"
            onValueChange={(v) => {
              setCancelledLocal(v);
              persist(v);
            }}
          />
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
            onChangeText={(v) => {
              setDescription(v);
              scheduleSave();
            }}
            onBlur={flushSave}
          />
        </View>

        {saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator size="small" color={Colors.yellow} />
            <Text style={styles.savingText}>{t('editProfile.saving')}</Text>
          </View>
        ) : null}
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
  hint: { fontSize: 13, color: Colors.textMuted, marginBottom: 12, lineHeight: 18 },
  groupFieldWrap: { marginBottom: 0 },
  groupHint: { fontSize: 12, color: Colors.textMuted, marginBottom: 20, lineHeight: 16 },
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
  statusReadout: { fontSize: 17, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  registrationCount: { fontSize: 14, color: Colors.textMuted },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
    paddingVertical: 4,
  },
  switchRowText: { flex: 1 },
  muted: { color: Colors.textMuted },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  savingText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});
