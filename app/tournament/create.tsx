import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { GroupCountSelect } from '@/components/ui/GroupCountSelect';
import { useCreateTournament } from '@/lib/hooks/useTournaments';
import { useUserStore } from '@/store/useUserStore';
import {
  validateTournamentGroups,
  normalizeGroupCount,
  getValidGroupCountsForMaxTeams,
  pickGroupCountForMaxTeams,
} from '@/lib/tournamentGroups';

function generateInviteToken() {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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
  const [groupCount, setGroupCount] = useState('4');
  const [description, setDescription] = useState('');

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

  const handleCreate = () => {
    if (!name.trim() || !startDate || !location.trim()) {
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
    const gc = normalizeGroupCount(parseInt(groupCount, 10) || 4);
    const vg = validateTournamentGroups(max, gc);
    if (!vg.ok) {
      Alert.alert(t('common.error'), t('tournaments.invalidGroups'));
      return;
    }
    if (!userId) {
      Alert.alert(t('common.error'), t('tournaments.mustBeSignedIn'));
      return;
    }

    const inviteToken = generateInviteToken();
    createTournament.mutate(
      {
        name: name.trim(),
        date: startDate,
        startDate,
        endDate: end,
        location: location.trim(),
        maxTeams: max,
        description: description.trim() || undefined,
        inviteLink: inviteToken,
        organizerIds: [userId],
        groupCount: vg.groupCount,
      },
      {
        onSuccess: (data) => {
          router.replace(`/tournament/${data._id}`);
        },
        onError: (err) => {
          Alert.alert(t('common.error'), err instanceof Error ? err.message : t('tournaments.failedToCreate'));
        },
      }
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('tournaments.createTitle')}</Text>

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
      <DatePickerField
        label={t('tournaments.startDate')}
        value={startDate}
        onChange={(d) => {
          setStartDate(d);
          if (endDate && endDate < d) setEndDate(d);
        }}
        minDate={new Date()}
      />
      <DatePickerField
        label={t('tournaments.endDate')}
        value={endDate}
        onChange={setEndDate}
        minDate={startDate ? new Date(startDate + 'T12:00:00') : new Date()}
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
      <View style={styles.groupBlock}>
        <GroupCountSelect
          label={t('tournaments.groupCount')}
          maxTeams={maxTeamsForSelect}
          value={groupCount}
          onChange={setGroupCount}
        />
        <Text style={styles.hint}>{t('tournaments.groupCountHint')}</Text>
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
  field: { marginBottom: 20 },
  groupBlock: { marginBottom: 20 },
  hint: { fontSize: 12, color: Colors.textMuted, marginTop: 8, lineHeight: 16 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
});
