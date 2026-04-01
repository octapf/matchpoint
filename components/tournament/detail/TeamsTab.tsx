import React from 'react';
import { View, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Team } from '@/types';

export function TeamsTab({
  t,
  canCreateTeam,
  onCreateTeam,
  organizerActions,
  loadingTeams,
  filteredTeams,
  renderTeam,
  emptyTextStyle,
  teamsTabCreateRowStyle,
  teamCardStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  canCreateTeam: boolean;
  onCreateTeam: () => void;
  organizerActions?: React.ReactNode;
  loadingTeams: boolean;
  filteredTeams: Team[];
  renderTeam: (team: Team) => React.ReactNode;
  emptyTextStyle: unknown;
  teamsTabCreateRowStyle: unknown;
  teamCardStyle: unknown;
}) {
  return (
    <>
      {organizerActions}
      {canCreateTeam ? (
        <View style={teamsTabCreateRowStyle as never}>
          <Button
            title={t('tournamentDetail.createTeamFromEntries')}
            variant="secondary"
            onPress={onCreateTeam}
            size="sm"
            fullWidth
          />
        </View>
      ) : null}

      {loadingTeams ? (
        <View style={teamCardStyle as never}>
          <Skeleton height={18} width="40%" style={{ marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Skeleton height={36} width={80} borderRadius={18} />
            <Skeleton height={36} width={80} borderRadius={18} />
          </View>
        </View>
      ) : filteredTeams.length === 0 ? (
        <Text style={emptyTextStyle as never}>{t('tournamentDetail.noTeamsYet')}</Text>
      ) : (
        <FlashList
          data={filteredTeams}
          keyExtractor={(tm) => tm._id}
          renderItem={({ item }) => renderTeam(item) as never}
        />
      )}
    </>
  );
}

