import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Switch,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { GroupCountSelect } from '@/components/ui/GroupCountSelect';
import { MaxTeamsSelect } from '@/components/ui/MaxTeamsSelect';
import { useTournament, useUpdateTournament } from '@/lib/hooks/useTournaments';
import type { Tournament, TournamentDivision } from '@/types';
import {
  normalizeGroupCount,
  validateTournamentGroups,
  getValidGroupCountsForMaxTeams,
  pickGroupCountForMaxTeams,
} from '@/lib/tournamentGroups';
import { alertApiError } from '@/lib/utils/apiError';
import { ClassificationSettingsAutosave } from '@/components/tournament/ClassificationSettingsForm';
import { TournamentLocationField } from '@/components/location/TournamentLocationField';
import { useTheme } from '@/lib/theme/useTheme';

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
  location: string,
  maxTeamsStr: string,
  pointsToWinStr: string,
  setsPerMatchStr: string,
  groupCountStr: string,
  description: string,
  divisions: TournamentDivision[],
  categoryPreset: CategoryPreset,
  visibilityPrivate: boolean,
): boolean {
  const max = parseInt(maxTeamsStr, 10) || 16;
  const p2w = parseInt(pointsToWinStr, 10) || 21;
  const spm = parseInt(setsPerMatchStr, 10) || 1;
  const gc = normalizeGroupCount(parseInt(groupCountStr, 10) || 4);
  const serverDivisions = (t.divisions ?? []) as TournamentDivision[];
  const serverCategories = (t.categories ?? []).map((x) => (x ?? '').trim()).filter(Boolean);
  const localCategories = presetToCategories(categoryPreset);
  const serverPrivate = (t.visibility ?? 'public') === 'private';
  return (
    (t.name ?? '') === name.trim() &&
    (t.location ?? '') === location.trim() &&
    (t.maxTeams ?? 16) === max &&
    (t.pointsToWin ?? 21) === p2w &&
    (t.setsPerMatch ?? 1) === spm &&
    (t.groupCount ?? 4) === gc &&
    (t.description ?? '') === description.trim() &&
    sameStringSet(serverDivisions, divisions) &&
    sameStringSet(serverCategories, localCategories) &&
    serverPrivate === visibilityPrivate
  );
}

function serverMatchesForm(
  t: Tournament,
  name: string,
  location: string,
  maxTeamsStr: string,
  pointsToWinStr: string,
  setsPerMatchStr: string,
  groupCountStr: string,
  description: string,
  divisions: TournamentDivision[],
  categoryPreset: CategoryPreset,
  visibilityPrivate: boolean,
  cancelledLocal: boolean,
): boolean {
  return (
    formFieldsMatchServer(
      t,
      name,
      location,
      maxTeamsStr,
      pointsToWinStr,
      setsPerMatchStr,
      groupCountStr,
      description,
      divisions,
      categoryPreset,
      visibilityPrivate
    ) &&
    (t.status === 'cancelled') === cancelledLocal
  );
}

export default function AdminEditTournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const router = useRouter();

  const { data: tournament, isLoading, isError, error: loadError } = useTournament(id);
  const updateTournament = useUpdateTournament();

  const [name, setName] = useState('');
  const [divisionDates, setDivisionDates] = useState<Partial<Record<TournamentDivision, { startDate: string; endDate: string }>>>(
    {},
  );
  const [location, setLocation] = useState('');
  const [maxTeams, setMaxTeams] = useState('16');
  const [pointsToWin, setPointsToWin] = useState('21');
  const [setsPerMatch, setSetsPerMatch] = useState('1');
  const [groupCount, setGroupCount] = useState('4');
  const [description, setDescription] = useState('');
  const [divisions, setDivisions] = useState<TournamentDivision[]>(['mixed']);
  const [categoryPreset, setCategoryPreset] = useState<CategoryPreset>('none');
  const [cancelledLocal, setCancelledLocal] = useState(false);
  const [visibilityPrivate, setVisibilityPrivate] = useState(false);
  const [bettingLocal, setBettingLocal] = useState<{
    bettingEnabled: boolean;
    bettingAllowWinner: boolean;
    bettingAllowScore: boolean;
    bettingAnonymous: boolean;
  }>({ bettingEnabled: false, bettingAllowWinner: true, bettingAllowScore: true, bettingAnonymous: false });
  const [saving, setSaving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!tournament) return;
    setName(tournament.name ?? '');
    const sd = tournament.startDate || tournament.date || '';
    const ed = tournament.endDate || sd;
    const dd = (tournament as unknown as { divisionDates?: unknown }).divisionDates as
      | Partial<Record<TournamentDivision, { startDate?: unknown; endDate?: unknown }>>
      | undefined;
    const safe: Partial<Record<TournamentDivision, { startDate: string; endDate: string }>> = {};
    const divs = (((tournament.divisions ?? ['mixed']) as TournamentDivision[]).filter(Boolean) ?? ['mixed']) as TournamentDivision[];
    for (const div of divs) {
      const r = dd?.[div];
      const s = typeof r?.startDate === 'string' && r.startDate.trim() ? r.startDate.trim() : sd;
      const e = typeof r?.endDate === 'string' && r.endDate.trim() ? r.endDate.trim() : ed;
      if (s) safe[div] = { startDate: s, endDate: e || s };
    }
    setDivisionDates(safe);
    setLocation(tournament.location ?? '');
    setMaxTeams(String(tournament.maxTeams ?? 16));
    setPointsToWin(String(tournament.pointsToWin ?? 21));
    setSetsPerMatch(String(tournament.setsPerMatch ?? 1));
    setGroupCount(String(tournament.groupCount ?? 4));
    setDescription(tournament.description ?? '');
    setDivisions(((tournament.divisions ?? ['mixed']) as TournamentDivision[]).filter(Boolean));
    setCategoryPreset(categoriesToPreset(tournament.categories));
    setCancelledLocal(tournament.status === 'cancelled');
    setVisibilityPrivate((tournament.visibility ?? 'public') === 'private');
    setBettingLocal({
      bettingEnabled: !!(tournament as unknown as Record<string, unknown>).bettingEnabled,
      bettingAllowWinner: !!(tournament as unknown as Record<string, unknown>).bettingAllowWinner,
      bettingAllowScore: !!(tournament as unknown as Record<string, unknown>).bettingAllowScore,
      bettingAnonymous: !!(tournament as unknown as Record<string, unknown>).bettingAnonymous,
    });
  }, [tournament]);

  const maxTeamsForSelect = useMemo(() => {
    const n = parseInt(maxTeams, 10);
    return Number.isFinite(n) && n >= 2 && n <= 64 ? n : 16;
  }, [maxTeams]);

  /** Pass overrides from toggles so we save the new value immediately (debounced save can run before state updates). */
  const persist = useCallback(
    (overrides?: {
      cancelled?: boolean;
      visibilityPrivate?: boolean;
      categoryPreset?: CategoryPreset;
      divisions?: TournamentDivision[];
    }) => {
      if (!id || !tournament) return;
      if (!name.trim() || !location.trim()) return;
      const divisionsEff = overrides?.divisions ?? divisions;
      if (!divisionsEff.length) return;
      // Require per-division dates for enabled divisions (fallback is allowed only for legacy init).
      for (const div of divisionsEff) {
        const r = divisionDates?.[div];
        if (!r?.startDate || !r?.endDate) return;
        if (r.endDate < r.startDate) return;
      }

      const cancelledEff = overrides?.cancelled !== undefined ? overrides.cancelled : cancelledLocal;
      const visibilityPrivateEff =
        overrides?.visibilityPrivate !== undefined ? overrides.visibilityPrivate : visibilityPrivate;
      const categoryPresetEff = overrides?.categoryPreset ?? categoryPreset;
      const serverCancelled = tournament.status === 'cancelled';

      /** Cancel/reopen must work even when max/group fail client validation (legacy DB data). */
      const onlyStatusChange =
        formFieldsMatchServer(
          tournament,
          name,
          location,
          maxTeams,
          pointsToWin,
          setsPerMatch,
          groupCount,
          description,
          divisionsEff,
          categoryPresetEff,
          visibilityPrivateEff,
        ) && cancelledEff !== serverCancelled;

      if (onlyStatusChange) {
        const payload: Record<string, unknown> = {
          id,
          status: cancelledEff ? 'cancelled' : 'open',
        };
        setSaving(true);
        updateTournament.mutate(
          payload as { id: string } & Record<string, unknown>,
          {
            onSettled: () => setSaving(false),
            onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.failedToLoad'),
          },
        );
        return;
      }

      const max = parseInt(maxTeams, 10) || 16;
      const p2w = parseInt(pointsToWin, 10) || 21;
      const spm = parseInt(setsPerMatch, 10) || 1;
      if (max < 2 || max > 64) return;
      if (p2w < 1 || p2w > 99) return;
      if (spm < 1 || spm > 7) return;
      const gc = normalizeGroupCount(parseInt(groupCount, 10) || 4);
      const vg = validateTournamentGroups(max, gc);
      if (!vg.ok) return;

      if (
        serverMatchesForm(
          tournament,
          name,
          location,
          maxTeams,
          pointsToWin,
          setsPerMatch,
          groupCount,
          description,
          divisions,
          categoryPreset,
          visibilityPrivate,
          cancelledEff,
        )
      ) {
        return;
      }

      const categories = presetToCategories(categoryPresetEff);
      const payload: Record<string, unknown> = {
        id,
        name: name.trim(),
        divisionDates,
        location: location.trim(),
        divisions: divisionsEff,
        categories,
        maxTeams: max,
        pointsToWin: p2w,
        setsPerMatch: spm,
        groupCount: vg.groupCount,
        description: description.trim() || undefined,
        visibility: visibilityPrivateEff ? 'private' : 'public',
      };
      if (cancelledEff !== serverCancelled) {
        payload.status = cancelledEff ? 'cancelled' : 'open';
      }

      setSaving(true);
      updateTournament.mutate(
        payload as { id: string } & Record<string, unknown>,
        {
          onSettled: () => setSaving(false),
          onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.failedToLoad'),
        },
      );
    },
    [
      id,
      tournament,
      name,
      divisionDates,
      location,
      maxTeams,
      pointsToWin,
      setsPerMatch,
      groupCount,
      description,
      divisions,
      categoryPreset,
      cancelledLocal,
      visibilityPrivate,
      t,
      updateTournament,
    ],
  );

  const globalRangeLabel = useMemo(() => {
    if (!tournament) return '—';
    const divs = (divisions.length ? divisions : (['mixed'] as TournamentDivision[])).filter(Boolean);
    const ranges = divs
      .map((d) => divisionDates?.[d])
      .filter(Boolean)
      .map((r) => ({ startDate: String(r!.startDate ?? '').trim(), endDate: String(r!.endDate ?? '').trim() }))
      .filter((r) => !!r.startDate && !!r.endDate);
    const minStart = ranges.map((r) => r.startDate).sort()[0] ?? (tournament.startDate || tournament.date || '');
    const maxEnd = ranges.map((r) => r.endDate).sort().slice(-1)[0] ?? (tournament.endDate || minStart);
    if (!minStart) return '—';
    return maxEnd && maxEnd !== minStart ? `${minStart} – ${maxEnd}` : minStart;
  }, [tournament, divisions, divisionDates]);

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

  const tournamentStarted =
    !!(tournament as { startedAt?: string | null }).startedAt ||
    tournament.phase === 'classification' ||
    tournament.phase === 'categories' ||
    tournament.phase === 'completed';

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
          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={styles.label}>{t('tournaments.visibilityLabel')}</Text>
              <Text style={styles.hintInline}>
                {visibilityPrivate ? t('tournaments.visibilityPrivate') : t('tournaments.visibilityPublic')}
              </Text>
            </View>
            <Switch
              value={visibilityPrivate}
              trackColor={{ false: Colors.surfaceLight, true: tokens.accentHover }}
              thumbColor="#f4f4f5"
              onValueChange={(v) => {
                setVisibilityPrivate(v);
                persist({ visibilityPrivate: v });
              }}
            />
          </View>
          <Text style={styles.hintInline}>{t('tournaments.visibilityHint')}</Text>
        </View>

        {id && tournament ? (
          <View style={styles.field}>
            <Text style={styles.label}>{t('tournaments.bettingSection')}</Text>
            {(
              [
                { key: 'bettingEnabled', labelKey: 'tournaments.bettingEnabled' as const },
                { key: 'bettingAllowWinner', labelKey: 'tournaments.bettingAllowWinner' as const },
                { key: 'bettingAllowScore', labelKey: 'tournaments.bettingAllowScore' as const },
                { key: 'bettingAnonymous', labelKey: 'tournaments.bettingAnonymous' as const },
              ] as const
            ).map(({ key, labelKey }) => (
              <View key={key} style={styles.switchRow}>
                <View style={styles.switchTextCol}>
                  <Text style={styles.label}>{t(labelKey)}</Text>
                </View>
                <Switch
                  value={!!(bettingLocal as unknown as Record<string, boolean>)[key]}
                  disabled={key !== 'bettingEnabled' && !bettingLocal.bettingEnabled}
                  trackColor={{ false: Colors.surfaceLight, true: tokens.accentHover }}
                  thumbColor="#f4f4f5"
                  onValueChange={(v) => {
                    const prev = bettingLocal;
                    const next = { ...bettingLocal, [key]: v } as typeof bettingLocal;
                    if (key === 'bettingEnabled' && !v) {
                      next.bettingAllowWinner = false;
                      next.bettingAllowScore = false;
                      next.bettingAnonymous = false;
                    }
                    setBettingLocal(next);
                    updateTournament.mutate(
                      { id, [key]: v },
                      {
                        onError: (err: unknown) => {
                          setBettingLocal(prev);
                          alertApiError(t, err, 'tournamentDetail.failedToLoad');
                        },
                      }
                    );
                  }}
                />
              </View>
            ))}
            <Text style={styles.hintInline}>{t('tournaments.bettingHint')}</Text>
          </View>
        ) : null}

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
                  style={[
                    styles.chip,
                    styles.chipFlex,
                    tournamentStarted && styles.chipDisabled,
                    selected && styles.chipSelected,
                    selected && { borderColor: tokens.accentOutline, backgroundColor: tokens.accentMuted },
                  ]}
                  onPress={() => {
                    if (tournamentStarted) return;
                    let nextDivs: TournamentDivision[] = [];
                    setDivisions((prev) => {
                      if (prev.includes(opt.id)) {
                        if (prev.length <= 1) return prev;
                        nextDivs = prev.filter((d) => d !== opt.id);
                        return nextDivs;
                      }
                      nextDivs = [...prev, opt.id];
                      return nextDivs;
                    });
                    // Divisions must persist immediately (otherwise query rehydrate looks like "revert").
                    persist({ divisions: nextDivs });
                  }}
                  disabled={tournamentStarted}
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
                  style={[
                    styles.chip,
                    styles.chipFlex,
                    tournamentStarted && styles.chipDisabled,
                    selected && styles.chipSelected,
                    selected && { borderColor: tokens.accentOutline, backgroundColor: tokens.accentMuted },
                  ]}
                  onPress={() => {
                    if (tournamentStarted) return;
                    setCategoryPreset(opt.id);
                    persist({ categoryPreset: opt.id });
                  }}
                  disabled={tournamentStarted}
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

        <View style={styles.field}>
          <Text style={styles.label}>{t('tournaments.startDate')} / {t('tournaments.endDate')}</Text>
          <Text style={styles.readOnlyValue} numberOfLines={1}>
            {globalRangeLabel}
          </Text>
          <Text style={styles.hintInline}>
            {t('admin.readOnlyDerivedFromDivisionDates')}
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('admin.divisionDatesTitle')}</Text>
          <View style={{ marginTop: 10, gap: 10 }}>
            {(['men', 'women', 'mixed'] as const)
              .filter((div) => divisions.includes(div))
              .map((div) => {
                const divLabel =
                  div === 'men'
                    ? t('tournaments.divisionMen')
                    : div === 'women'
                      ? t('tournaments.divisionWomen')
                      : t('tournaments.divisionMixed');
                const r = divisionDates?.[div] ?? { startDate: '', endDate: '' };
                const min = r.startDate ? new Date(r.startDate + 'T12:00:00') : MIN_DATE;
                return (
                  <View key={`div-dates-${div}`} style={styles.divDatesBlock}>
                    <Text style={styles.divDatesTitle}>{divLabel}</Text>
                    <View style={styles.dateRow}>
                      <DatePickerField
                        fieldStyle={styles.dateFieldHalf}
                        label={`${t('tournaments.startDate')}${t('common.requiredSuffix')}`}
                        value={r.startDate}
                        size="sm"
                        onChange={(d) => {
                          setDivisionDates((prev) => ({
                            ...(prev ?? {}),
                            [div]: { startDate: d, endDate: (prev?.[div]?.endDate ?? '') < d ? d : (prev?.[div]?.endDate ?? d) },
                          }));
                          scheduleSave();
                        }}
                        minDate={MIN_DATE}
                      />
                      <DatePickerField
                        fieldStyle={styles.dateFieldHalf}
                        label={t('tournaments.endDate')}
                        value={r.endDate}
                        size="sm"
                        onChange={(d) => {
                          setDivisionDates((prev) => ({
                            ...(prev ?? {}),
                            [div]: { startDate: prev?.[div]?.startDate ?? d, endDate: d },
                          }));
                          scheduleSave();
                        }}
                        minDate={min}
                      />
                    </View>
                  </View>
                );
              })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            {t('tournaments.tournamentLocationTitle')}
            {t('common.requiredSuffix')}
          </Text>
          <TournamentLocationField
            value={location}
            onChangeText={(v) => {
              setLocation(v);
              scheduleSave();
            }}
            onBlur={flushSave}
            onLocationCommitted={scheduleSave}
            placeholder={t('tournaments.locationPlaceholder')}
            inputStyle={styles.input}
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

        <View style={styles.dateRow}>
          <View style={styles.dateFieldHalf}>
            <Text style={styles.label}>
              {t('tournaments.pointsToWin')}
              {t('common.requiredSuffix')}
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={pointsToWin}
              onChangeText={(v) => {
                setPointsToWin(v);
                scheduleSave();
              }}
              onBlur={flushSave}
              placeholder={t('tournaments.pointsToWinPlaceholder')}
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={styles.dateFieldHalf}>
            <Text style={styles.label}>
              {t('tournaments.setsPerMatch')}
              {t('common.requiredSuffix')}
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={setsPerMatch}
              onChangeText={(v) => {
                setSetsPerMatch(v);
                scheduleSave();
              }}
              onBlur={flushSave}
              placeholder={t('tournaments.setsPerMatchPlaceholder')}
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>

        <ClassificationSettingsAutosave
          tournamentId={id!}
          tournament={tournament}
          started={tournamentStarted}
          embedded
        />

        <View style={styles.switchRow}>
          <View style={styles.switchRowText}>
            <Text style={styles.label}>{t('admin.cancelledSwitchLabel')}</Text>
          </View>
          <Switch
            value={cancelledLocal}
            trackColor={{ false: Colors.surfaceLight, true: tokens.accent }}
            thumbColor="#f4f4f5"
            onValueChange={(v) => {
              setCancelledLocal(v);
              persist({ cancelled: v });
            }}
          />
        </View>

        {saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator size="small" color={tokens.accent} />
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
  divDatesBlock: {
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
  },
  divDatesTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: 8,
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
  chipDisabled: { opacity: 0.5 },
  chipFlex: { flex: 1, minWidth: 0 },
  chipSelected: {
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surfaceLight,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  chipTextSelected: { color: Colors.text },
  medalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  hintInline: { fontSize: 12, color: Colors.textMuted, marginTop: 8, lineHeight: 16 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  readOnlyValue: {
    marginTop: 10,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '700',
    fontStyle: 'italic',
  },
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
    marginBottom: 4,
    paddingVertical: 4,
  },
  switchTextCol: { flex: 1 },
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
