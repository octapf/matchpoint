import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { GroupCountSelect } from '@/components/ui/GroupCountSelect';
import { MaxTeamsSelect } from '@/components/ui/MaxTeamsSelect';
import { useTournament, useUpdateTournament } from '@/lib/hooks/useTournaments';
import { useUserStore } from '@/store/useUserStore';
import type { Tournament, TournamentDivision } from '@/types';
import {
  normalizeGroupCount,
  validateTournamentGroups,
  getValidGroupCountsForMaxTeams,
  pickGroupCountForMaxTeams,
} from '@/lib/tournamentGroups';

const MIN_DATE = new Date(2000, 0, 1);
const SAVE_DEBOUNCE_MS = 750;

type CategoryPreset = 'none' | 'gold_silver' | 'gold_silver_bronze';

function presetToCategories(preset: CategoryPreset): string[] {
  if (preset === 'gold_silver') return ['Gold', 'Silver'];
  if (preset === 'gold_silver_bronze') return ['Gold', 'Silver', 'Bronze'];
  return [];
}

const BRONZE = '#cd7f32';

function categoriesToPreset(categories: string[] | undefined): CategoryPreset {
  const set = new Set((categories ?? []).map((x) => (x ?? '').trim()).filter(Boolean));
  if (set.size === 0) return 'none';
  if (set.size === 2 && set.has('Gold') && set.has('Silver')) return 'gold_silver';
  if (set.size === 3 && set.has('Gold') && set.has('Silver') && set.has('Bronze')) return 'gold_silver_bronze';
  return 'none';
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}

/** All editable fields except cancel flag match the server document. */
function formFieldsMatchServer(
  t: Tournament,
  name: string,
  startDate: string,
  endDate: string,
  location: string,
  maxTeamsStr: string,
  groupCountStr: string,
  description: string,
  divisions: TournamentDivision[],
  categoryPreset: CategoryPreset,
): boolean {
  const max = parseInt(maxTeamsStr, 10) || 16;
  const gc = normalizeGroupCount(parseInt(groupCountStr, 10) || 4);
  const sd = t.startDate || t.date || '';
  const ed = t.endDate || sd;
  const end = endDate || startDate;
  const serverDivisions = (t.divisions ?? []) as TournamentDivision[];
  const serverCategories = (t.categories ?? []).map((x) => (x ?? '').trim()).filter(Boolean);
  const localCategories = presetToCategories(categoryPreset);
  return (
    (t.name ?? '') === name.trim() &&
    sd === startDate &&
    ed === end &&
    (t.location ?? '') === location.trim() &&
    (t.maxTeams ?? 16) === max &&
    (t.groupCount ?? 4) === gc &&
    (t.description ?? '') === description.trim() &&
    sameStringSet(serverDivisions, divisions) &&
    sameStringSet(serverCategories, localCategories)
  );
}

function serverMatchesForm(
  t: Tournament,
  name: string,
  startDate: string,
  endDate: string,
  location: string,
  maxTeamsStr: string,
  groupCountStr: string,
  description: string,
  divisions: TournamentDivision[],
  categoryPreset: CategoryPreset,
  cancelledLocal: boolean,
): boolean {
  return (
    formFieldsMatchServer(t, name, startDate, endDate, location, maxTeamsStr, groupCountStr, description, divisions, categoryPreset) &&
    (t.status === 'cancelled') === cancelledLocal
  );
}

export default function AdminEditTournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();

  const { data: tournament, isLoading, isError, error: loadError } = useTournament(id);
  const updateTournament = useUpdateTournament();
  const actingUserId = useUserStore((s) => s.user?._id ?? null);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [maxTeams, setMaxTeams] = useState('16');
  const [groupCount, setGroupCount] = useState('4');
  const [description, setDescription] = useState('');
  const [divisions, setDivisions] = useState<TournamentDivision[]>(['mixed']);
  const [categoryPreset, setCategoryPreset] = useState<CategoryPreset>('none');
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
    setDivisions(((tournament.divisions ?? ['mixed']) as TournamentDivision[]).filter(Boolean));
    setCategoryPreset(categoriesToPreset(tournament.categories));
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
      if (!divisions.length) return;

      const cancelledEff = cancelledOverride !== undefined ? cancelledOverride : cancelledLocal;
      const serverCancelled = tournament.status === 'cancelled';

      /** Cancel/reopen must work even when max/group fail client validation (legacy DB data). */
      const onlyStatusChange =
        formFieldsMatchServer(
          tournament,
          name,
          startDate,
          endDate,
          location,
          maxTeams,
          groupCount,
          description,
          divisions,
          categoryPreset,
        ) && cancelledEff !== serverCancelled;

      if (onlyStatusChange) {
        const payload: Record<string, unknown> = {
          id,
          status: cancelledEff ? 'cancelled' : 'open',
        };
        if (actingUserId) {
          payload.actingUserId = actingUserId;
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
        return;
      }

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
          divisions,
          categoryPreset,
          cancelledEff,
        )
      ) {
        return;
      }

      const categories = presetToCategories(categoryPreset);
      const payload: Record<string, unknown> = {
        id,
        name: name.trim(),
        date: startDate,
        startDate,
        endDate: end,
        location: location.trim(),
        divisions,
        categories,
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
      divisions,
      categoryPreset,
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
        <View style={styles.field}>
          <Text style={styles.label}>
            {t('tournaments.name')}
            {t('common.requiredSuffix')}
          </Text>
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

        <View style={styles.field}>
          <Text style={styles.label}>
            {t('tournaments.divisions')}
            {t('common.requiredSuffix')}
          </Text>
          <View style={styles.chipRowSingle}>
            {([
              { id: 'men', label: t('tournaments.divisionMen') },
              { id: 'women', label: t('tournaments.divisionWomen') },
              { id: 'mixed', label: t('tournaments.divisionMixed') },
            ] as const).map((opt) => {
              const selected = divisions.includes(opt.id);
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.chip, styles.chipFlex, selected && styles.chipSelected]}
                  onPress={() => {
                    setDivisions((prev) => {
                      if (prev.includes(opt.id)) {
                        if (prev.length <= 1) return prev;
                        return prev.filter((d) => d !== opt.id);
                      }
                      return [...prev, opt.id];
                    });
                    scheduleSave();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hintInline}>{t('tournaments.divisionsHint')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            {t('tournaments.categories')}
            {t('common.requiredSuffix')}
          </Text>
          <View style={styles.chipRowSingle}>
            {([
              { id: 'none', label: t('tournaments.categoryNone') },
              { id: 'gold_silver', label: t('tournaments.categoryGoldSilver') },
              { id: 'gold_silver_bronze', label: t('tournaments.categoryGoldSilverBronze') },
            ] as const).map((opt) => {
              const selected = categoryPreset === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.chip, styles.chipFlex, selected && styles.chipSelected]}
                  onPress={() => {
                    setCategoryPreset(opt.id);
                    scheduleSave();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                >
                  {opt.id === 'none' ? (
                    <MaterialCommunityIcons name="medal-outline" size={20} color={selected ? Colors.yellow : Colors.textSecondary} />
                  ) : null}
                  {opt.id === 'gold_silver' ? (
                    <View style={styles.medalRow}>
                      <MaterialCommunityIcons name="medal-outline" size={20} color={Colors.yellow} />
                      <MaterialCommunityIcons name="medal-outline" size={20} color={Colors.textSecondary} />
                    </View>
                  ) : null}
                  {opt.id === 'gold_silver_bronze' ? (
                    <View style={styles.medalRow}>
                      <MaterialCommunityIcons name="medal-outline" size={20} color={Colors.yellow} />
                      <MaterialCommunityIcons name="medal-outline" size={20} color={Colors.textSecondary} />
                      <MaterialCommunityIcons name="medal-outline" size={20} color={BRONZE} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hintInline}>{t('tournaments.categoriesHint')}</Text>
        </View>

        <View style={styles.dateRow}>
          <DatePickerField
            fieldStyle={styles.dateFieldHalf}
            label={`${t('tournaments.startDate')}${t('common.requiredSuffix')}`}
            value={startDate}
            onChange={(d) => {
              setStartDate(d);
              scheduleSave();
            }}
            minDate={MIN_DATE}
          />
          <DatePickerField
            fieldStyle={styles.dateFieldHalf}
            label={t('tournaments.endDate')}
            value={endDate}
            onChange={(d) => {
              setEndDate(d);
              scheduleSave();
            }}
            minDate={startDate ? new Date(startDate + 'T12:00:00') : MIN_DATE}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            {t('tournaments.location')}
            {t('common.requiredSuffix')}
          </Text>
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
          label={`${t('tournaments.maxTeams')}${t('common.requiredSuffix')}`}
          value={maxTeams}
          onChange={(v) => {
            setMaxTeams(v);
            scheduleSave();
          }}
        />

        <View style={styles.groupSelectWrap}>
          <GroupCountSelect
            label={`${t('tournaments.groupCount')}${t('common.requiredSuffix')}`}
            maxTeams={maxTeamsForSelect}
            value={groupCount}
            onChange={(v) => {
              setGroupCount(v);
              scheduleSave();
            }}
          />
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
  dateRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  dateFieldHalf: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
  },
  groupSelectWrap: { marginBottom: 20 },
  field: { marginBottom: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chipRowSingle: { flexDirection: 'row', flexWrap: 'nowrap', gap: 10 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipFlex: { flex: 1, minWidth: 0 },
  chipSelected: {
    borderColor: Colors.yellow,
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
  },
  chipText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  chipTextSelected: { color: Colors.yellow },
  medalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  hintInline: { fontSize: 12, color: Colors.textMuted, marginTop: 8, lineHeight: 16 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
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
