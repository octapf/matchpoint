import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/Colors';
import { OrganizerTeamForm } from '@/components/team/OrganizerTeamForm';
import { useTournament } from '@/lib/hooks/useTournaments';
import { useUserStore } from '@/store/useUserStore';
import { useTranslation } from '@/lib/i18n';
import type { TournamentDivision } from '@/types';

export default function CreateTeamOrganizerScreen() {
  const { t } = useTranslation();
  const { id, division } = useLocalSearchParams<{ id: string; division?: string }>();
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;
  const { data: tournament } = useTournament(id);
  const canManageTournament = !!tournament && ((tournament.organizerIds ?? []).includes(userId ?? '') || user?.role === 'admin');
  const div: TournamentDivision =
    division === 'men' || division === 'women' || division === 'mixed' ? division : 'mixed';

  if (!id || !tournament) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (!canManageTournament || !userId) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('common.error')}</Text>
        <Text style={styles.hint}>{t('tournamentDetail.organizerActionFailed')}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <OrganizerTeamForm tournamentId={id} division={div} userId={userId} editTeam={null} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 20 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  hint: { fontSize: 13, color: Colors.textMuted, marginBottom: 16 },
});
