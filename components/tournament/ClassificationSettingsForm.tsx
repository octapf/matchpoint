import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ActivityIndicator, Pressable, Modal, ScrollView } from 'react-native';
import Colors from '@/constants/Colors';
import { useTranslation } from '@/lib/i18n';
import { useUpdateTournament } from '@/lib/hooks/useTournaments';
import type { Tournament, TournamentCategory } from '@/types';
import { alertApiError } from '@/lib/utils/apiError';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme/useTheme';

const CAT_ORDER: TournamentCategory[] = ['Gold', 'Silver', 'Bronze'];
const SAVE_DEBOUNCE_MS = 750;

function CountSelect({
  label,
  value,
  onChange,
  total,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  total: number;
  disabled?: boolean;
}) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const options = useMemo(() => Array.from({ length: Math.max(0, total) + 1 }, (_, i) => i), [total]);
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(total, Math.floor(value))) : 0;

  return (
    <View>
      <Pressable
        style={[styles.selectInput, disabled && styles.inputDisabled]}
        onPress={() => !disabled && setOpen(true)}
        disabled={!!disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={styles.selectInputText}>{String(safeValue)}</Text>
        <Ionicons name="chevron-down" size={20} color={Colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={[styles.modalDone, { color: tokens.accent }]}>OK</Text>
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.listScroll}>
              {options.map((n) => {
                const isSel = n === safeValue;
                return (
                  <Pressable
                    key={n}
                    style={[styles.optionRow, isSel && styles.optionRowSelected]}
                    onPress={() => {
                      onChange(n);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionText, isSel && styles.optionTextSelected]}>{String(n)}</Text>
                    {isSel ? <Ionicons name="checkmark" size={22} color={tokens.accent} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function numStr(n: unknown, fallback: string) {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return String(v);
}

function classificationMatchesServer(
  tournament: Tournament,
  matchesPerOpponent: string,
  advanceFraction: string,
  counts: { Gold: string; Silver: string; Bronze: string },
  hasCategories: boolean,
  activeCats?: TournamentCategory[]
): boolean {
  const keysForCats = (
    hasCategories && activeCats && activeCats.length ? [...new Set(activeCats)].filter(Boolean) : CAT_ORDER
  ) as TournamentCategory[];

  const m = Math.floor(Number(matchesPerOpponent));
  const serverM = Math.floor(Number(tournament.classificationMatchesPerOpponent ?? 1));
  if (!Number.isFinite(m) || m < 1) return false;
  if (m !== serverM) return false;

  if (!hasCategories) {
    const f = Number(advanceFraction);
    const serverF = Number(tournament.singleCategoryAdvanceFraction ?? 0.5);
    if (!Number.isFinite(f)) return false;
    return Math.abs(f - serverF) < 1e-5;
  }

  const srv = (tournament as { categoryCounts?: unknown }).categoryCounts as
    | Partial<Record<TournamentCategory, number>>
    | undefined;
  const localEmpty = keysForCats.every((k) => !counts[k].trim());
  if (localEmpty && (!srv || Object.keys(srv).length === 0)) return true;
  if (localEmpty !== (!srv || Object.keys(srv).length === 0)) return false;
  for (const k of keysForCats) {
    const s = counts[k].trim();
    const sv = srv?.[k];
    if (!s) {
      if (sv != null && Number(sv) !== 0) return false;
      continue;
    }
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return false;
    if (sv == null) return false;
    if (Math.floor(n) !== Math.floor(Number(sv))) return false;
  }
  return true;
}

export type ClassificationDraftState = {
  matchesPerOpponent: string;
  advanceFraction: string;
  counts: { Gold: string; Silver: string; Bronze: string };
};

/** Reparto entero según max equipos (suma = totalTeams) para las categorías activas. */
export function equalTeamCountsForCategories(
  totalTeams: number,
  categories: TournamentCategory[]
): ClassificationDraftState['counts'] {
  const empty = { Gold: '', Silver: '', Bronze: '' };
  const T = Math.max(0, Math.floor(totalTeams));
  const cats = CAT_ORDER.filter((c) => categories.includes(c));
  if (!cats.length || T === 0) return empty;

  const n = cats.length;
  const base = Math.floor(T / n);
  let rem = T - base * n;
  const next = { ...empty };
  for (const c of CAT_ORDER) {
    if (!cats.includes(c)) continue;
    const add = rem > 0 ? 1 : 0;
    if (rem > 0) rem -= 1;
    next[c] = String(base + add);
  }
  return next;
}

/** Solo para torneos viejos con `categoryFractions` y sin `categoryCounts`. */
function approximateTeamCountsFromLegacyFractions(
  totalTeams: number,
  categories: TournamentCategory[],
  fr: Partial<Record<TournamentCategory, number>> | null | undefined
): ClassificationDraftState['counts'] {
  const empty = { Gold: '', Silver: '', Bronze: '' };
  const cats = CAT_ORDER.filter((c) => categories.includes(c));
  const T = Math.max(0, Math.floor(totalTeams));
  if (!cats.length || T === 0) return empty;
  if (!fr || typeof fr !== 'object') return equalTeamCountsForCategories(totalTeams, categories);
  const weights = cats.map((c) => Math.max(0, Number((fr as Record<string, unknown>)[c] ?? 0)));
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return equalTeamCountsForCategories(totalTeams, categories);
  const scaled = weights.map((w) => ((w / sumW) * T) as number);
  const base = scaled.map((x) => Math.floor(x));
  let leftover = T - base.reduce((a, b) => a + b, 0);
  const bump = [...base];
  for (let r = 0; r < leftover; r++) {
    bump[r % bump.length] = (bump[r % bump.length] ?? 0) + 1;
  }
  for (let i = 0; i < cats.length; i++) {
    empty[cats[i]!] = String(bump[i] ?? 0);
  }
  return empty;
}

type FormFieldsProps = {
  hasCategories: boolean;
  activeCategories?: TournamentCategory[];
  totalTeamsHint?: number;
  matchesPerOpponent: string;
  advanceFraction: string;
  counts: { Gold: string; Silver: string; Bronze: string };
  onChangeMatches: (v: string) => void;
  onChangeAdvance: (v: string) => void;
  onChangeCount: (k: keyof ClassificationDraftState['counts'], v: string) => void;
  onBlurPersist?: () => void;
  onSchedulePersist?: () => void;
  disabled?: boolean;
  variant?: 'card' | 'admin';
};

export function ClassificationSettingsFormFields({
  hasCategories,
  activeCategories,
  totalTeamsHint,
  matchesPerOpponent,
  advanceFraction,
  counts,
  onChangeMatches,
  onChangeAdvance,
  onChangeCount,
  onBlurPersist,
  onSchedulePersist,
  disabled,
  variant = 'card',
}: FormFieldsProps) {
  const { t } = useTranslation();
  const inputStyle = variant === 'admin' ? [styles.input, styles.inputAdmin] : styles.input;
  const schedule = onSchedulePersist ?? (() => {});

  const cats = useMemo(
    () => CAT_ORDER.filter((c) => !activeCategories?.length || activeCategories.includes(c)),
    [activeCategories]
  );

  const catLabel = useCallback(
    (c: TournamentCategory) => {
      if (c === 'Gold') return t('tournaments.categoryGold');
      if (c === 'Silver') return t('tournaments.categorySilver');
      return t('tournaments.categoryBronze');
    },
    [t]
  );

  const totalHint = typeof totalTeamsHint === 'number' && totalTeamsHint > 0 ? Math.floor(totalTeamsHint) : null;

  const twoCatCount =
    hasCategories && cats.length === 2 && totalHint != null
      ? { a: cats[0]!, b: cats[1]!, total: totalHint }
      : null;

  const threeCatCount =
    hasCategories && cats.length === 3 && totalHint != null
      ? { c0: cats[0]!, c1: cats[1]!, c2: cats[2]!, total: totalHint }
      : null;

  const syncThreeFromGold = (nG: number) => {
    if (!threeCatCount) return;
    const { c0, c1, c2, total: T } = threeCatCount;
    const rem = T - nG;
    const s0 = Math.floor(Number(counts[c1]) || 0);
    const newS = Math.min(Math.max(0, s0), rem);
    const newB = rem - newS;
    onChangeCount(c0, String(nG));
    onChangeCount(c1, String(newS));
    onChangeCount(c2, String(newB));
    schedule();
  };

  const syncThreeFromSilver = (nS: number) => {
    if (!threeCatCount) return;
    const { c0, c1, c2, total: T } = threeCatCount;
    const rem = T - nS;
    const g0 = Math.floor(Number(counts[c0]) || 0);
    const newG = Math.min(Math.max(0, g0), rem);
    const newB = rem - newG;
    onChangeCount(c1, String(nS));
    onChangeCount(c0, String(newG));
    onChangeCount(c2, String(newB));
    schedule();
  };

  const syncThreeFromBronze = (nB: number) => {
    if (!threeCatCount) return;
    const { c0, c1, c2, total: T } = threeCatCount;
    const rem = T - nB;
    const g0 = Math.floor(Number(counts[c0]) || 0);
    const newG = Math.min(Math.max(0, g0), rem);
    const newS = rem - newG;
    onChangeCount(c2, String(nB));
    onChangeCount(c0, String(newG));
    onChangeCount(c1, String(newS));
    schedule();
  };

  return (
    <>
      <View style={styles.field}>
        <Text style={styles.label}>{t('tournamentDetail.matchesPerOpponentLabel')}</Text>
        <TextInput
          style={inputStyle}
          value={matchesPerOpponent}
          onChangeText={(v) => {
            onChangeMatches(v);
            schedule();
          }}
          onBlur={onBlurPersist}
          keyboardType="number-pad"
          placeholder="1"
          placeholderTextColor={Colors.textMuted}
          editable={!disabled}
        />
        <Text style={styles.hintInline}>{t('tournamentDetail.matchesPerOpponentHint')}</Text>
      </View>

      {hasCategories ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>{t('tournamentDetail.categoryFractionsLabel')}</Text>
            <Text style={styles.hintInline}>{t('tournamentDetail.categoryFractionsHint')}</Text>
          </View>

          {twoCatCount ? (
            <View style={styles.field}>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.miniLabel}>{catLabel(twoCatCount.a)}</Text>
                  <CountSelect
                    label={catLabel(twoCatCount.a)}
                    total={twoCatCount.total}
                    value={Math.max(0, Math.min(twoCatCount.total, Math.floor(Number(counts[twoCatCount.a]) || 0)))}
                    disabled={disabled}
                    onChange={(n) => {
                      onChangeCount(twoCatCount.a, String(n));
                      onChangeCount(twoCatCount.b, String(Math.max(0, twoCatCount.total - n)));
                      schedule();
                    }}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.miniLabel}>{catLabel(twoCatCount.b)}</Text>
                  <CountSelect
                    label={catLabel(twoCatCount.b)}
                    total={twoCatCount.total}
                    value={Math.max(0, Math.min(twoCatCount.total, Math.floor(Number(counts[twoCatCount.b]) || 0)))}
                    disabled={disabled}
                    onChange={(n) => {
                      onChangeCount(twoCatCount.b, String(n));
                      onChangeCount(twoCatCount.a, String(Math.max(0, twoCatCount.total - n)));
                      schedule();
                    }}
                  />
                </View>
              </View>
            </View>
          ) : threeCatCount ? (
            <View style={styles.field}>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.miniLabel}>{catLabel(threeCatCount.c0)}</Text>
                  <CountSelect
                    label={catLabel(threeCatCount.c0)}
                    total={threeCatCount.total}
                    value={Math.max(
                      0,
                      Math.min(threeCatCount.total, Math.floor(Number(counts[threeCatCount.c0]) || 0))
                    )}
                    disabled={disabled}
                    onChange={(n) => syncThreeFromGold(n)}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.miniLabel}>{catLabel(threeCatCount.c1)}</Text>
                  <CountSelect
                    label={catLabel(threeCatCount.c1)}
                    total={threeCatCount.total}
                    value={Math.max(
                      0,
                      Math.min(threeCatCount.total, Math.floor(Number(counts[threeCatCount.c1]) || 0))
                    )}
                    disabled={disabled}
                    onChange={(n) => syncThreeFromSilver(n)}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.miniLabel}>{catLabel(threeCatCount.c2)}</Text>
                  <CountSelect
                    label={catLabel(threeCatCount.c2)}
                    total={threeCatCount.total}
                    value={Math.max(
                      0,
                      Math.min(threeCatCount.total, Math.floor(Number(counts[threeCatCount.c2]) || 0))
                    )}
                    disabled={disabled}
                    onChange={(n) => syncThreeFromBronze(n)}
                  />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.field}>
              <View style={styles.row}>
                {cats.map((c) => (
                  <View key={c} style={styles.col}>
                    <Text style={styles.miniLabel}>{catLabel(c)}</Text>
                    <TextInput
                      style={inputStyle}
                      value={counts[c]}
                      onChangeText={(v) => {
                        onChangeCount(c, v);
                        schedule();
                      }}
                      onBlur={onBlurPersist}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={Colors.textMuted}
                      editable={!disabled}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}
        </>
      ) : (
        <View style={styles.field}>
          <Text style={styles.label}>{t('tournamentDetail.advanceFractionLabel')}</Text>
          <TextInput
            style={inputStyle}
            value={advanceFraction}
            onChangeText={(v) => {
              onChangeAdvance(v);
              schedule();
            }}
            onBlur={onBlurPersist}
            keyboardType="decimal-pad"
            placeholder="0.5"
            placeholderTextColor={Colors.textMuted}
            editable={!disabled}
          />
          <Text style={styles.hintInline}>{t('tournamentDetail.advanceFractionHint')}</Text>
        </View>
      )}
    </>
  );
}

type AutosaveProps = {
  tournamentId: string;
  tournament: Tournament;
  started: boolean;
  embedded?: boolean;
  /** Categories selected in the editor (live). When defined (including []), overrides server `categories` for this form. */
  activeCategoriesOverride?: TournamentCategory[];
  totalTeamsHintOverride?: number;
};

export function ClassificationSettingsAutosave({
  tournamentId,
  tournament,
  started,
  embedded,
  activeCategoriesOverride,
  totalTeamsHintOverride,
}: AutosaveProps) {
  const { t } = useTranslation();
  const updateTournament = useUpdateTournament();

  const [matchesPerOpponent, setMatchesPerOpponent] = useState('1');
  const [advanceFraction, setAdvanceFraction] = useState('0.5');
  const [counts, setCounts] = useState<{ Gold: string; Silver: string; Bronze: string }>({
    Gold: '',
    Silver: '',
    Bronze: '',
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef<() => void>(() => {});
  const lastDistributionResetKeyRef = useRef<string | null>(null);

  const activeCategories = (activeCategoriesOverride !== undefined
    ? activeCategoriesOverride
    : (tournament.categories ?? [])) as TournamentCategory[];
  const hasCategories = activeCategories.length > 0;
  const totalTeamsHint = typeof totalTeamsHintOverride === 'number' ? totalTeamsHintOverride : (tournament.maxTeams ?? 0);

  useLayoutEffect(() => {
    setMatchesPerOpponent(numStr(tournament.classificationMatchesPerOpponent ?? 1, '1'));
    setAdvanceFraction(numStr(tournament.singleCategoryAdvanceFraction ?? 0.5, '0.5'));

    const rawFr = tournament.categoryFractions ?? null;
    const rawC = (tournament as { categoryCounts?: unknown }).categoryCounts as
      | Partial<Record<TournamentCategory, number>>
      | null
      | undefined;
    const srvCats = CAT_ORDER.filter((c) =>
      ((tournament.categories ?? []) as string[]).includes(c)
    ) as TournamentCategory[];
    const T = Math.max(0, Math.floor(Number(tournament.maxTeams) || 0));

    const hasSrvCounts = rawC && typeof rawC === 'object' && Object.keys(rawC as object).length > 0;
    if (hasSrvCounts && rawC) {
      setCounts({
        Gold: numStr(rawC.Gold, ''),
        Silver: numStr(rawC.Silver, ''),
        Bronze: numStr(rawC.Bronze, ''),
      });
    } else if (srvCats.length && (rawFr && typeof rawFr === 'object') && !hasSrvCounts) {
      setCounts(approximateTeamCountsFromLegacyFractions(T, srvCats, rawFr));
    } else if (!srvCats.length) {
      setCounts({ Gold: '', Silver: '', Bronze: '' });
    } else if (T > 0) {
      setCounts(equalTeamCountsForCategories(T, srvCats));
    } else {
      setCounts({ Gold: '', Silver: '', Bronze: '' });
    }
  }, [tournament]);

  const persist = useCallback(() => {
    if (started) return;
    if (
      classificationMatchesServer(tournament, matchesPerOpponent, advanceFraction, counts, hasCategories, activeCategories)
    ) {
      return;
    }

    const m = Math.floor(Number(matchesPerOpponent));
    if (!Number.isFinite(m) || m < 1 || m > 5) return;

    const update: { id: string } & Record<string, unknown> = {
      id: tournamentId,
      classificationMatchesPerOpponent: m,
      categoryPhaseFormat: 'single_elim',
    };

    if (!hasCategories) {
      const f = Number(advanceFraction);
      if (!Number.isFinite(f) || f <= 0 || f >= 1) return;
      update.singleCategoryAdvanceFraction = Math.round(f * 1000) / 1000;
      update.categoryFractions = null;
      update.categoryCounts = null;
    } else {
      const raw: Partial<Record<TournamentCategory, number>> = {};
      for (const k of CAT_ORDER) {
        const active = activeCategories.includes(k);
        const s = counts[k].trim();
        if (!active) {
          raw[k] = 0;
          continue;
        }
        if (!s) continue;
        const n = Number(s);
        if (!Number.isFinite(n) || n < 0) return;
        raw[k] = Math.floor(n);
      }
      update.categoryCounts = raw;
      update.categoryFractions = null;
    }

    updateTournament.mutate(update, {
      onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
    });
  }, [started, tournament, tournamentId, matchesPerOpponent, advanceFraction, counts, hasCategories, activeCategories, updateTournament, t]);

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

  const categoriesKey = activeCategories.join('|');

  useEffect(() => {
    lastDistributionResetKeyRef.current = null;
  }, [tournamentId]);

  /** Recalcular distribución cuando cambian categorías o máximo de equipos. */
  useEffect(() => {
    if (started) return;
    if (!hasCategories) {
      lastDistributionResetKeyRef.current = null;
      return;
    }

    const total = Math.max(0, Math.floor(Number(totalTeamsHint) || 0));
    const key = `${categoriesKey}@${total}`;

    const applyEqual = () => {
      if (total > 0) setCounts(equalTeamCountsForCategories(total, activeCategories));
    };

    if (lastDistributionResetKeyRef.current === null) {
      lastDistributionResetKeyRef.current = key;
      const emptyInputs = !activeCategories.some((c) => Boolean(counts[c]?.trim()));
      if (emptyInputs && total > 0) {
        applyEqual();
        const tmr = setTimeout(() => scheduleSave(), 0);
        return () => clearTimeout(tmr);
      }
      return;
    }

    if (lastDistributionResetKeyRef.current === key) return;
    lastDistributionResetKeyRef.current = key;

    applyEqual();

    const tmr = setTimeout(() => scheduleSave(), 0);
    return () => clearTimeout(tmr);
  }, [started, hasCategories, categoriesKey, totalTeamsHint, activeCategories, scheduleSave, counts]);

  useEffect(() => {
    saveFnRef.current = () => {
      void persist();
    };
  }, [persist]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <View style={embedded ? styles.embeddedBlock : undefined}>
      <Text style={styles.sectionTitle}>{t('tournamentDetail.classificationSettingsTitle')}</Text>
      {started ? (
        <Text style={styles.lockedHint}>{t('tournamentDetail.classificationSettingsLocked')}</Text>
      ) : (
        <Text style={styles.sectionHint}>{t('tournamentDetail.classificationSettingsHint')}</Text>
      )}

      <ClassificationSettingsFormFields
        hasCategories={hasCategories}
        activeCategories={activeCategories}
        totalTeamsHint={totalTeamsHint}
        matchesPerOpponent={matchesPerOpponent}
        advanceFraction={advanceFraction}
        counts={counts}
        onChangeMatches={setMatchesPerOpponent}
        onChangeAdvance={setAdvanceFraction}
        onChangeCount={(k, v) => setCounts((p) => ({ ...p, [k]: v }))}
        onBlurPersist={flushSave}
        onSchedulePersist={scheduleSave}
        disabled={started}
        variant={embedded ? 'admin' : 'card'}
      />

      {!started && updateTournament.isPending ? (
        <View style={styles.savingRow}>
          <ActivityIndicator size="small" color={Colors.yellow} />
          <Text style={styles.savingText}>{t('editProfile.saving')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  embeddedBlock: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  sectionHint: { color: Colors.textSecondary, marginBottom: 14, fontSize: 13, lineHeight: 18 },
  lockedHint: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  miniLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4 },
  hintInline: { color: Colors.textMuted, marginTop: 8, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputAdmin: {
    borderWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
  },
  inputDisabled: { opacity: 0.55 },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  savingText: { color: Colors.textSecondary, fontSize: 14 },
  selectInput: {
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectInputText: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 10,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceLight,
  },
  modalTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  modalDone: { fontSize: 16, fontWeight: '700' },
  listScroll: { maxHeight: 360 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionRowSelected: { backgroundColor: Colors.surfaceLight },
  optionText: { color: Colors.text, fontSize: 16 },
  optionTextSelected: { fontWeight: '700' },
});
