import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/lib/i18n';
import { useUpdateTournament } from '@/lib/hooks/useTournaments';
import type { Tournament, TournamentCategory } from '@/types';
import { alertApiError } from '@/lib/utils/apiError';

const CATEGORIES: TournamentCategory[] = ['Gold', 'Silver', 'Bronze'];
const SAVE_DEBOUNCE_MS = 750;

function numStr(n: unknown, fallback: string) {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return String(v);
}

function classificationMatchesServer(
  tournament: Tournament,
  matchesPerOpponent: string,
  advanceFraction: string,
  fractions: { Gold: string; Silver: string; Bronze: string },
  hasCategories: boolean
): boolean {
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

  const srv = tournament.categoryFractions;
  const localEmpty = CATEGORIES.every((k) => !fractions[k].trim());
  if (localEmpty && (!srv || Object.keys(srv).length === 0)) return true;
  if (localEmpty !== (!srv || Object.keys(srv).length === 0)) return false;

  for (const k of CATEGORIES) {
    const s = fractions[k].trim();
    const sv = srv?.[k];
    if (!s) {
      if (sv != null && Number(sv) !== 0) return false;
      continue;
    }
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return false;
    if (sv == null) return false;
    if (Math.abs(n - Number(sv)) > 1e-6) return false;
  }
  return true;
}

export type ClassificationDraftState = {
  matchesPerOpponent: string;
  advanceFraction: string;
  fractions: { Gold: string; Silver: string; Bronze: string };
};

type FormFieldsProps = {
  hasCategories: boolean;
  matchesPerOpponent: string;
  advanceFraction: string;
  fractions: { Gold: string; Silver: string; Bronze: string };
  onChangeMatches: (v: string) => void;
  onChangeAdvance: (v: string) => void;
  onChangeFraction: (k: keyof ClassificationDraftState['fractions'], v: string) => void;
  onEqualDistribution: () => void;
  onClearFractions: () => void;
  onBlurPersist?: () => void;
  onSchedulePersist?: () => void;
  disabled?: boolean;
  /** Compact inputs to match admin edit screen */
  variant?: 'card' | 'admin';
};

/**
 * Presentational fields for classification (matches per opponent, category fractions / advance fraction).
 */
export function ClassificationSettingsFormFields({
  hasCategories,
  matchesPerOpponent,
  advanceFraction,
  fractions,
  onChangeMatches,
  onChangeAdvance,
  onChangeFraction,
  onEqualDistribution,
  onClearFractions,
  onBlurPersist,
  onSchedulePersist,
  disabled,
  variant = 'card',
}: FormFieldsProps) {
  const { t } = useTranslation();
  const inputStyle = variant === 'admin' ? [styles.input, styles.inputAdmin] : styles.input;
  const schedule = onSchedulePersist ?? (() => {});

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

      <View style={styles.field}>
        <Text style={styles.label}>{t('tournamentDetail.categoryPhaseFormatLabel')}</Text>
        <Text style={styles.hintInline}>{t('tournamentDetail.categoryPhaseFormatBracketOnly')}</Text>
      </View>

      {hasCategories ? (
        <View style={styles.field}>
          <Text style={styles.label}>{t('tournamentDetail.categoryFractionsLabel')}</Text>
          <Text style={styles.hintInline}>{t('tournamentDetail.categoryFractionsHint')}</Text>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.miniLabel}>Gold</Text>
              <TextInput
                style={inputStyle}
                value={fractions.Gold}
                onChangeText={(v) => {
                  onChangeFraction('Gold', v);
                  schedule();
                }}
                onBlur={onBlurPersist}
                keyboardType="decimal-pad"
                placeholder="0.34"
                placeholderTextColor={Colors.textMuted}
                editable={!disabled}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.miniLabel}>Silver</Text>
              <TextInput
                style={inputStyle}
                value={fractions.Silver}
                onChangeText={(v) => {
                  onChangeFraction('Silver', v);
                  schedule();
                }}
                onBlur={onBlurPersist}
                keyboardType="decimal-pad"
                placeholder="0.33"
                placeholderTextColor={Colors.textMuted}
                editable={!disabled}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.miniLabel}>Bronze</Text>
              <TextInput
                style={inputStyle}
                value={fractions.Bronze}
                onChangeText={(v) => {
                  onChangeFraction('Bronze', v);
                  schedule();
                }}
                onBlur={onBlurPersist}
                keyboardType="decimal-pad"
                placeholder="0.33"
                placeholderTextColor={Colors.textMuted}
                editable={!disabled}
              />
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Button title={t('tournamentDetail.equalDistribution')} onPress={onEqualDistribution} size="sm" disabled={disabled} />
            <Button title={t('common.cancel')} onPress={onClearFractions} size="sm" variant="outline" disabled={disabled} />
          </View>
        </View>
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
  /** Use admin screen typography / inputs */
  embedded?: boolean;
};

/**
 * Autosaves classification settings to the tournament (organizer/admin edit flows).
 */
export function ClassificationSettingsAutosave({ tournamentId, tournament, started, embedded }: AutosaveProps) {
  const { t } = useTranslation();
  const updateTournament = useUpdateTournament();

  const [matchesPerOpponent, setMatchesPerOpponent] = useState('1');
  const [advanceFraction, setAdvanceFraction] = useState('0.5');
  const [fractions, setFractions] = useState<{ Gold: string; Silver: string; Bronze: string }>({
    Gold: '',
    Silver: '',
    Bronze: '',
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef<() => void>(() => {});

  const hasCategories = (tournament.categories?.length ?? 0) > 0;

  useEffect(() => {
    setMatchesPerOpponent(numStr(tournament.classificationMatchesPerOpponent ?? 1, '1'));
    setAdvanceFraction(numStr(tournament.singleCategoryAdvanceFraction ?? 0.5, '0.5'));
    const raw = tournament.categoryFractions ?? null;
    if (!raw) setFractions({ Gold: '', Silver: '', Bronze: '' });
    else {
      setFractions({
        Gold: numStr(raw.Gold, ''),
        Silver: numStr(raw.Silver, ''),
        Bronze: numStr(raw.Bronze, ''),
      });
    }
  }, [tournament]);

  const persist = useCallback(() => {
    if (started) return;
    if (classificationMatchesServer(tournament, matchesPerOpponent, advanceFraction, fractions, hasCategories)) {
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
    } else {
      const raw: Partial<Record<TournamentCategory, number>> = {};
      for (const k of CATEGORIES) {
        const s = fractions[k].trim();
        if (!s) continue;
        const n = Number(s);
        if (!Number.isFinite(n) || n < 0) return;
        raw[k] = n;
      }
      update.categoryFractions = raw;
    }

    updateTournament.mutate(update, {
      onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
    });
  }, [
    started,
    tournament,
    tournamentId,
    matchesPerOpponent,
    advanceFraction,
    fractions,
    hasCategories,
    updateTournament,
    t,
  ]);

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
    saveFnRef.current = () => {
      void persist();
    };
  }, [persist]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const setEqual = () => {
    setFractions({ Gold: '1', Silver: '1', Bronze: '1' });
    setTimeout(() => scheduleSave(), 0);
  };

  const clearFractions = () => {
    setFractions({ Gold: '', Silver: '', Bronze: '' });
    setTimeout(() => scheduleSave(), 0);
  };

  if (started) {
    return (
      <View style={embedded ? styles.embeddedBlock : undefined}>
        <Text style={styles.sectionTitle}>{t('tournamentDetail.classificationSettingsTitle')}</Text>
        <Text style={styles.lockedHint}>{t('tournamentDetail.classificationSettingsLocked')}</Text>
      </View>
    );
  }

  return (
    <View style={embedded ? styles.embeddedBlock : undefined}>
      <Text style={styles.sectionTitle}>{t('tournamentDetail.classificationSettingsTitle')}</Text>
      <Text style={styles.sectionHint}>{t('tournamentDetail.classificationSettingsHint')}</Text>

      <ClassificationSettingsFormFields
        hasCategories={hasCategories}
        matchesPerOpponent={matchesPerOpponent}
        advanceFraction={advanceFraction}
        fractions={fractions}
        onChangeMatches={setMatchesPerOpponent}
        onChangeAdvance={setAdvanceFraction}
        onChangeFraction={(k, v) => setFractions((p) => ({ ...p, [k]: v }))}
        onEqualDistribution={setEqual}
        onClearFractions={clearFractions}
        onBlurPersist={flushSave}
        onSchedulePersist={scheduleSave}
        variant={embedded ? 'admin' : 'card'}
      />

      {updateTournament.isPending ? (
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
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  savingText: { color: Colors.textSecondary, fontSize: 14 },
});
