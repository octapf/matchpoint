import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { OrganizerTeamForm } from '@/components/team/OrganizerTeamForm';
import { PlayerTeamForm } from '@/components/team/PlayerTeamForm';
import { useTeam } from '@/lib/hooks/useTeams';
import { useTournament } from '@/lib/hooks/useTournaments';
import { useUserStore } from '@/store/useUserStore';
import { isTournamentStarted } from '@/lib/isTournamentStarted';
import type { TournamentDivision } from '@/types';

export default function EditTeamScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, teamId, division } = useLocalSearchParams<{ id: string; teamId: string; division?: string }>();
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;
  const { data: tournament } = useTournament(id);
  const { data: team, isLoading, isError } = useTeam(teamId);

  const div: TournamentDivision = useMemo(() => {
    const d = division === 'men' || division === 'women' || division === 'mixed' ? division : 'mixed';
    return d;
  }, [division]);

  const canManageTournament = useMemo(
    () => !!tournament && !!userId && ((tournament.organizerIds ?? []).includes(userId) || user?.role === 'admin'),
    [tournament, userId, user?.role]
  );

  const isMember = !!(team && userId && (team.playerIds ?? []).includes(userId));
  const started = isTournamentStarted(tournament ?? null);

  if (!id || !teamId) {
    return (
      <>
        <Stack.Screen options={{ title: t('team.editTeam'), headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('tournamentDetail.failedToLoad')}</Text>
        </View>
      </>
    );
  }

  if (isLoading && !team) {
    return (
      <>
        <Stack.Screen options={{ title: t('team.editTeam'), headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.text} />
        </View>
      </>
    );
  }

  if (isError || !team) {
    return (
      <>
        <Stack.Screen options={{ title: t('team.editTeam'), headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('apiErrors.teamNotFound')}</Text>
          <Button title={t('inviteLink.goBack')} onPress={() => router.back()} variant="outline" />
        </View>
      </>
    );
  }

  if (String(team.tournamentId) !== String(id)) {
    return (
      <>
        <Stack.Screen options={{ title: t('team.editTeam'), headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.muted}>{t('tournamentDetail.failedToLoad')}</Text>
          <Button title={t('inviteLink.goBack')} onPress={() => router.back()} variant="outline" />
        </View>
      </>
    );
  }

  if (!canManageTournament && !isMember) {
    return (
      <>
        <Stack.Screen options={{ title: t('team.editTeam'), headerShown: true }} />
        <View style={[styles.centered, styles.padded]}>
          <Text style={styles.title}>{t('common.error')}</Text>
          <Text style={styles.muted}>{t('team.editAccessDenied')}</Text>
          <Button title={t('inviteLink.goBack')} onPress={() => router.back()} variant="primary" fullWidth />
        </View>
      </>
    );
  }

  if (!canManageTournament && isMember && started) {
    return (
      <>
        <Stack.Screen options={{ title: t('team.editTeam'), headerShown: true }} />
        <View style={[styles.centered, styles.padded]}>
          <Text style={styles.muted}>{t('team.cannotEditAfterStart')}</Text>
          <Button title={t('inviteLink.goBack')} onPress={() => router.back()} variant="primary" fullWidth />
        </View>
      </>
    );
  }

  if (canManageTournament) {
    if (!userId) {
      return (
        <>
          <Stack.Screen options={{ title: t('team.editTeam'), headerShown: true }} />
          <View style={[styles.centered, styles.padded]}>
            <Text style={styles.muted}>{t('apiErrors.authRequired')}</Text>
            <Button title={t('inviteLink.goBack')} onPress={() => router.back()} variant="outline" />
          </View>
        </>
      );
    }
    return (
      <>
        <Stack.Screen options={{ title: t('team.editTeam'), headerShown: true }} />
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <OrganizerTeamForm tournamentId={id} division={div} userId={userId} editTeam={team} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('team.editTeam'), headerShown: true }} />
      <PlayerTeamForm tournamentId={id} division={div} editTeam={team} />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  padded: { padding: 24, gap: 16 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  muted: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
