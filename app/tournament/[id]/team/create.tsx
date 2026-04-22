import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PlayerTeamForm } from '@/components/team/PlayerTeamForm';
import type { TournamentDivision } from '@/types';

export default function CreateTeamScreen() {
  const { id, division } = useLocalSearchParams<{ id: string; division?: string }>();
  const div: TournamentDivision =
    division === 'men' || division === 'women' || division === 'mixed' ? division : 'mixed';
  if (!id) return null;
  return <PlayerTeamForm tournamentId={id} division={div} editTeam={null} />;
}
