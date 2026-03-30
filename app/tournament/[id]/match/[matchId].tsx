import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/lib/i18n';
import { useTournament } from '@/lib/hooks/useTournaments';
import { useMatches, useUpdateMatch } from '@/lib/hooks/useMatches';
import { useTeams } from '@/lib/hooks/useTeams';
import { useUserStore } from '@/store/useUserStore';
import { alertApiError } from '@/lib/utils/apiError';

export default function EditMatchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;

  const { data: tournament } = useTournament(id);
  const { data: teams = [] } = useTeams(id ? { tournamentId: id } : undefined);
  const { data: matches = [] } = useMatches(id ? { tournamentId: id } : undefined);
  const updateMatch = useUpdateMatch();

  const canManageTournament = !!tournament && ((tournament.organizerIds ?? []).includes(userId ?? '') || user?.role === 'admin');

  const teamById = useMemo(() => Object.fromEntries(teams.map((tm) => [tm._id, tm])), [teams]);
  const match = useMemo(() => matches.find((m) => m._id === matchId) ?? null, [matches, matchId]);

  const [setsWonA, setSetsWonA] = useState('0');
  const [setsWonB, setSetsWonB] = useState('0');
  const [pointsA, setPointsA] = useState('');
  const [pointsB, setPointsB] = useState('');

  useEffect(() => {
    if (!match) return;
    setSetsWonA(String(match.setsWonA ?? 0));
    setSetsWonB(String(match.setsWonB ?? 0));
    setPointsA(match.pointsA != null ? String(match.pointsA) : '');
    setPointsB(match.pointsB != null ? String(match.pointsB) : '');
  }, [match?._id]);

  if (!id || !matchId || !tournament || !match) {
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

  const teamA = teamById[match.teamAId];
  const teamB = teamById[match.teamBId];

  const aNum = Math.floor(Number(setsWonA));
  const bNum = Math.floor(Number(setsWonB));
  const paNum = Math.floor(Number(pointsA));
  const pbNum = Math.floor(Number(pointsB));
  const canSave =
    Number.isFinite(aNum) &&
    Number.isFinite(bNum) &&
    aNum >= 0 &&
    bNum >= 0 &&
    aNum !== bNum &&
    Number.isFinite(paNum) &&
    Number.isFinite(pbNum) &&
    paNum >= 0 &&
    pbNum >= 0 &&
    !updateMatch.isPending;

  const handleSave = () => {
    const a = aNum;
    const b = bNum;
    const pa = paNum;
    const pb = pbNum;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
      Alert.alert(t('common.error'), t('tournamentDetail.matchInvalidSets'));
      return;
    }
    if (a === b) {
      Alert.alert(t('common.error'), t('tournamentDetail.matchInvalidSets'));
      return;
    }
    if (!Number.isFinite(pa) || !Number.isFinite(pb) || pa < 0 || pb < 0) {
      Alert.alert(t('common.error'), t('tournamentDetail.matchPointsRequired'));
      return;
    }
    updateMatch.mutate(
      {
        id: matchId,
        tournamentId: id,
        update: { setsWonA: a, setsWonB: b, pointsA: pa, pointsB: pb },
      },
      {
        onSuccess: () => router.back(),
        onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
      }
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('tournamentDetail.editMatchTitle')}</Text>
      <Text style={styles.hint}>
        {(teamA?.name ?? match.teamAId)} vs {(teamB?.name ?? match.teamBId)}
      </Text>
      <Text style={styles.hint}>
        {aNum > bNum ? (teamA?.name ?? match.teamAId) : bNum > aNum ? (teamB?.name ?? match.teamBId) : '—'}
      </Text>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>{t('tournamentDetail.setsWonA')}</Text>
          <TextInput style={styles.input} value={setsWonA} onChangeText={setSetsWonA} keyboardType="number-pad" />
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>{t('tournamentDetail.setsWonB')}</Text>
          <TextInput style={styles.input} value={setsWonB} onChangeText={setSetsWonB} keyboardType="number-pad" />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>{t('tournamentDetail.pointsA')}</Text>
          <TextInput style={styles.input} value={pointsA} onChangeText={setPointsA} keyboardType="number-pad" placeholder="0" placeholderTextColor={Colors.textMuted} />
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>{t('tournamentDetail.pointsB')}</Text>
          <TextInput style={styles.input} value={pointsB} onChangeText={setPointsB} keyboardType="number-pad" placeholder="0" placeholderTextColor={Colors.textMuted} />
        </View>
      </View>

      <Button
        title={updateMatch.isPending ? t('common.loading') : t('common.save')}
        onPress={handleSave}
        disabled={!canSave}
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },
  hint: { color: Colors.textSecondary, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  label: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});

