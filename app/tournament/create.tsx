import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { GroupCountSelect } from '@/components/ui/GroupCountSelect';
import { MaxTeamsSelect } from '@/components/ui/MaxTeamsSelect';
import { useCreateTournament } from '@/lib/hooks/useTournaments';
import { useUserStore } from '@/store/useUserStore';
import type { TournamentDivision } from '@/types';
import {
  validateTournamentGroups,
  normalizeGroupCount,
  getValidGroupCountsForMaxTeams,
  pickGroupCountForMaxTeams,
  defaultGroupCountForDivisions,
  defaultMaxTeamsForDivisions,
} from '@/lib/tournamentGroups';
import { alertApiError } from '@/lib/utils/apiError';

const MIN_DATE = new Date(2000, 0, 1);

function generateInviteToken() {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type CategoryPreset = 'none' | 'gold_silver' | 'gold_silver_bronze';

function presetToCategories(preset: CategoryPreset): string[] {
  if (preset === 'gold_silver') return ['Gold', 'Silver'];
  if (preset === 'gold_silver_bronze') return ['Gold', 'Silver', 'Bronze'];
  return [];
}

const BRONZE = '#cd7f32';

export default function CreateTournamentScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const userId = useUserStore((s) => s.user?._id ?? null);
  const createTournament = useCreateTournament();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [location, setLocation] = useState('');
  const [maxTeams, setMaxTeams] = useState('16');
  const [pointsToWin, setPointsToWin] = useState('21');
  const [setsPerMatch, setSetsPerMatch] = useState('1');
  const [groupCount, setGroupCount] = useState('4');
  const [description, setDescription] = useState('');
  const [visibilityPrivate, setVisibilityPrivate] = useState(false);
  const [divisions, setDivisions] = useState<TournamentDivision[]>(['mixed']);
  const [categoryPreset, setCategoryPreset] = useState<CategoryPreset>('none');
  const [lastDivisionsCount, setLastDivisionsCount] = useState<number>(1);

  const maxTeamsForSelect = useMemo(() => {
    const n = parseInt(maxTeams, 10);
    return Number.isFinite(n) && n >= 2 && n <= 64 ? n : 16;
  }, [maxTeams]);

  useEffect(() => {
    const mt = parseInt(maxTeams, 10);
    if (!Number.isFinite(mt) || mt < 2 || mt > 64) return;
    const valid = getValidGroupCountsForMaxTeams(mt);
    if (valid.length === 0) return;
    const gc = parseInt(groupCount, 10);
    const cur = Number.isFinite(gc) ? gc : 4;
    if (!valid.includes(cur)) {
      setGroupCount(String(pickGroupCountForMaxTeams(mt, cur)));
    }
  }, [maxTeams]);

  useEffect(() => {
    const dc = Math.max(1, divisions.length);
    if (dc === lastDivisionsCount) return;

    // If the user was using the previous defaults, keep them on defaults after changing divisions.
    const prevDefaultMaxTeams = defaultMaxTeamsForDivisions(lastDivisionsCount);
    const prevDefaultGroupCount = defaultGroupCountForDivisions(lastDivisionsCount);
    const curMaxTeams = parseInt(maxTeams, 10);
    const curGroupCount = parseInt(groupCount, 10);

    if (Number.isFinite(curMaxTeams) && curMaxTeams === prevDefaultMaxTeams) {
      setMaxTeams(String(defaultMaxTeamsForDivisions(dc)));
    }
    if (Number.isFinite(curGroupCount) && curGroupCount === prevDefaultGroupCount) {
      setGroupCount(String(defaultGroupCountForDivisions(dc)));
    }

    setLastDivisionsCount(dc);
  }, [divisions, groupCount, lastDivisionsCount, maxTeams]);

  const handleCreate = () => {
    if (!name.trim() || !startDate || !location.trim()) {
      Alert.alert(t('common.error'), t('tournaments.missingFields'));
      return;
    }
    if (!divisions.length) {
      Alert.alert(t('common.error'), t('tournaments.divisionsRequired'));
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
    const gc = normalizeGroupCount(parseInt(groupCount, 10) || 4);
    const p2w = parseInt(pointsToWin, 10) || 21;
    const spm = parseInt(setsPerMatch, 10) || 1;
    const vg = validateTournamentGroups(max, gc);
    if (!vg.ok) {
      Alert.alert(t('common.error'), t('tournaments.invalidGroups'));
      return;
    }
    if (!userId) {
      Alert.alert(t('common.error'), t('tournaments.mustBeSignedIn'));
      return;
    }
    if (p2w < 1 || p2w > 99) {
      Alert.alert(t('common.error'), t('tournaments.invalidPointsToWin'));
      return;
    }
    if (spm < 1 || spm > 7) {
      Alert.alert(t('common.error'), t('tournaments.invalidSetsPerMatch'));
      return;
    }

    const categories = presetToCategories(categoryPreset);
    const inviteToken = generateInviteToken();
    createTournament.mutate(
      {
        name: name.trim(),
        date: startDate,
        startDate,
        endDate: end,
        location: location.trim(),
        divisions,
        categories,
        maxTeams: max,
        pointsToWin: p2w,
        setsPerMatch: spm,
        description: description.trim() || undefined,
        inviteLink: inviteToken,
        organizerIds: [userId],
        groupCount: vg.groupCount,
        visibility: visibilityPrivate ? 'private' : 'public',
      },
      {
        onSuccess: (data) => {
          router.replace(`/tournament/${data._id}`);
        },
        onError: (err: unknown) => alertApiError(t, err, 'tournaments.failedToCreate'),
      }
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{t('tournaments.createTitle')}</Text>

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
          onChangeText={setName}
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
          onChangeText={setDescription}
        />
      </View>

      <View style={styles.field}>
        <View style={styles.switchRow}>
          <View style={styles.switchTextCol}>
            <Text style={styles.label}>{t('tournaments.visibilityLabel')}</Text>
            <Text style={styles.hint}>
              {visibilityPrivate ? t('tournaments.visibilityPrivate') : t('tournaments.visibilityPublic')}
            </Text>
          </View>
          <Switch
            value={visibilityPrivate}
            trackColor={{ false: Colors.surfaceLight, true: Colors.violet }}
            thumbColor="#f4f4f5"
            onValueChange={setVisibilityPrivate}
          />
        </View>
        <Text style={styles.hint}>{t('tournaments.visibilityHint')}</Text>
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
                onPress={() => setCategoryPreset(opt.id)}
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
            if (endDate && endDate < d) setEndDate(d);
          }}
          minDate={MIN_DATE}
        />
        <DatePickerField
          fieldStyle={styles.dateFieldHalf}
          label={t('tournaments.endDate')}
          value={endDate}
          onChange={setEndDate}
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
          onChangeText={setLocation}
        />
      </View>

      <MaxTeamsSelect
        label={`${t('tournaments.maxTeams')}${t('common.requiredSuffix')}`}
        value={maxTeams}
        onChange={setMaxTeams}
      />

      <View style={styles.groupSelectWrap}>
        <GroupCountSelect
          label={`${t('tournaments.groupCount')}${t('common.requiredSuffix')}`}
          maxTeams={maxTeamsForSelect}
          value={groupCount}
          onChange={setGroupCount}
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
            onChangeText={setPointsToWin}
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
            onChangeText={setSetsPerMatch}
            placeholder={t('tournaments.setsPerMatchPlaceholder')}
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      </View>

      <Button
        title={t('common.create')}
        onPress={handleCreate}
        disabled={createTournament.isPending}
        fullWidth
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 24 },
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
  field: { marginBottom: 20 },
  groupSelectWrap: { marginBottom: 20 },
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
    borderColor: Colors.violet,
    backgroundColor: Colors.violetMuted,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  chipTextSelected: { color: Colors.violet },
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
  },
  switchTextCol: { flex: 1 },
  hint: { fontSize: 12, color: Colors.textMuted, marginTop: 4, lineHeight: 16 },
});
