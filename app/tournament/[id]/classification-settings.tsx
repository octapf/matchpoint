import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { useTournament, useUpdateTournament } from '@/lib/hooks/useTournaments';
import { useUserStore } from '@/store/useUserStore';
import { useTranslation } from '@/lib/i18n';
import type { TournamentCategory } from '@/types';
import { alertApiError } from '@/lib/utils/apiError';

const CATEGORIES: TournamentCategory[] = ['Gold', 'Silver', 'Bronze'];

function numStr(n: unknown, fallback: string) {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return String(v);
}

export default function ClassificationSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;

  const { data: tournament } = useTournament(id);
  const updateTournament = useUpdateTournament();

  const canManageTournament = !!tournament && ((tournament.organizerIds ?? []).includes(userId ?? '') || user?.role === 'admin');

  const started =
    !!tournament?.startedAt ||
    tournament?.phase === 'classification' ||
    tournament?.phase === 'categories' ||
    tournament?.phase === 'completed';

  const hasCategories = (tournament?.categories?.length ?? 0) > 0;

  const initialFractions = useMemo(() => {
    const raw = tournament?.categoryFractions ?? null;
    if (!raw) return { Gold: '', Silver: '', Bronze: '' };
    return {
      Gold: numStr(raw.Gold, ''),
      Silver: numStr(raw.Silver, ''),
      Bronze: numStr(raw.Bronze, ''),
    };
  }, [tournament?.categoryFractions]);

  const [matchesPerOpponent, setMatchesPerOpponent] = useState<string>(
    numStr(tournament?.classificationMatchesPerOpponent ?? 1, '1')
  );
  const [advanceFraction, setAdvanceFraction] = useState<string>(
    numStr(tournament?.singleCategoryAdvanceFraction ?? 0.5, '0.5')
  );
  const [fractions, setFractions] = useState<{ Gold: string; Silver: string; Bronze: string }>(initialFractions);

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

  if (started) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('common.error')}</Text>
        <Text style={styles.hint}>{t('tournamentDetail.classificationSettingsLocked')}</Text>
      </View>
    );
  }

  const handleSave = () => {
    const m = Math.floor(Number(matchesPerOpponent));
    if (!Number.isFinite(m) || m < 1 || m > 5) {
      Alert.alert(t('common.error'), t('tournamentDetail.matchesPerOpponentInvalid'));
      return;
    }

    const update: { id: string } & Record<string, unknown> = {
      id,
      classificationMatchesPerOpponent: m,
    };

    if (!hasCategories) {
      const f = Number(advanceFraction);
      if (!Number.isFinite(f) || f <= 0 || f >= 1) {
        Alert.alert(t('common.error'), t('tournamentDetail.advanceFractionInvalid'));
        return;
      }
      update.singleCategoryAdvanceFraction = Math.round(f * 1000) / 1000;
      update.categoryFractions = null;
    } else {
      const raw: Partial<Record<TournamentCategory, number>> = {};
      for (const k of CATEGORIES) {
        const s = fractions[k].trim();
        if (!s) continue;
        const n = Number(s);
        if (!Number.isFinite(n) || n < 0) {
          Alert.alert(t('common.error'), t('tournamentDetail.categoryFractionsInvalid'));
          return;
        }
        raw[k] = n;
      }
      // Send raw; server normalizes (and sets null if empty/zero).
      update.categoryFractions = raw;
    }

    updateTournament.mutate(update, {
      onSuccess: () => router.back(),
      onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
    });
  };

  const setEqual = () => {
    setFractions({ Gold: '1', Silver: '1', Bronze: '1' });
  };

  const clearFractions = () => {
    setFractions({ Gold: '', Silver: '', Bronze: '' });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t('tournamentDetail.classificationSettingsTitle')}</Text>
      <Text style={styles.hint}>{t('tournamentDetail.classificationSettingsHint')}</Text>

      <View style={styles.field}>
        <Text style={styles.label}>{t('tournamentDetail.matchesPerOpponentLabel')}</Text>
        <TextInput
          style={styles.input}
          value={matchesPerOpponent}
          onChangeText={setMatchesPerOpponent}
          keyboardType="number-pad"
          placeholder="1"
          placeholderTextColor={Colors.textMuted}
        />
        <Text style={styles.hintInline}>{t('tournamentDetail.matchesPerOpponentHint')}</Text>
      </View>

      {hasCategories ? (
        <View style={styles.field}>
          <Text style={styles.label}>{t('tournamentDetail.categoryFractionsLabel')}</Text>
          <Text style={styles.hintInline}>{t('tournamentDetail.categoryFractionsHint')}</Text>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.miniLabel}>Gold</Text>
              <TextInput
                style={styles.input}
                value={fractions.Gold}
                onChangeText={(v) => setFractions((p) => ({ ...p, Gold: v }))}
                keyboardType="decimal-pad"
                placeholder="0.34"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.miniLabel}>Silver</Text>
              <TextInput
                style={styles.input}
                value={fractions.Silver}
                onChangeText={(v) => setFractions((p) => ({ ...p, Silver: v }))}
                keyboardType="decimal-pad"
                placeholder="0.33"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.miniLabel}>Bronze</Text>
              <TextInput
                style={styles.input}
                value={fractions.Bronze}
                onChangeText={(v) => setFractions((p) => ({ ...p, Bronze: v }))}
                keyboardType="decimal-pad"
                placeholder="0.33"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Button title={t('tournamentDetail.equalDistribution')} onPress={setEqual} size="sm" />
            <Button title={t('common.cancel')} onPress={clearFractions} size="sm" variant="outline" />
          </View>
        </View>
      ) : (
        <View style={styles.field}>
          <Text style={styles.label}>{t('tournamentDetail.advanceFractionLabel')}</Text>
          <TextInput
            style={styles.input}
            value={advanceFraction}
            onChangeText={setAdvanceFraction}
            keyboardType="decimal-pad"
            placeholder="0.5"
            placeholderTextColor={Colors.textMuted}
          />
          <Text style={styles.hintInline}>{t('tournamentDetail.advanceFractionHint')}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Button
          title={updateTournament.isPending ? t('common.loading') : t('common.save')}
          onPress={handleSave}
          disabled={updateTournament.isPending}
          fullWidth
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 24 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  hint: { color: Colors.textSecondary, marginBottom: 16 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  miniLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4 },
  hintInline: { color: Colors.textMuted, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  footer: { marginTop: 8 },
});

