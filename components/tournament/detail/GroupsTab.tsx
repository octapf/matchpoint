import React from 'react';
import { View, Text, Alert } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconButton } from '@/components/ui/IconButton';
import type { Team } from '@/types';

export function GroupsTab({
  t,
  loadingTeams,
  filteredTeams,
  canManageTournament,
  offerGroupRebalance,
  groupMetaTeamsPerGroup,
  onRebalancePress,
  rebalancePending,
  canReorganizeGroups,
  onReorganizeGroups,
  reorganizePending,
  divisionTeamsByGroup,
  renderTeam,
  canReorderTeams,
  onReorderTeam,
  reorderPendingTeamId,
  emptyTextStyle,
  rebalanceBannerStyle,
  rebalanceHintStyle,
  groupBlockStyle,
  groupHeadingStyle,
  emptyGroupStyle,
  teamCardStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  loadingTeams: boolean;
  filteredTeams: Team[];
  canManageTournament: boolean;
  offerGroupRebalance: boolean;
  groupMetaTeamsPerGroup: number;
  onRebalancePress: () => void;
  rebalancePending: boolean;
  canReorganizeGroups: boolean;
  onReorganizeGroups: () => void;
  reorganizePending: boolean;
  divisionTeamsByGroup: Team[][];
  renderTeam: (team: Team) => React.ReactNode;
  canReorderTeams: boolean;
  onReorderTeam: (team: Team) => void;
  reorderPendingTeamId: string | null;
  emptyTextStyle: unknown;
  rebalanceBannerStyle: unknown;
  rebalanceHintStyle: unknown;
  groupBlockStyle: unknown;
  groupHeadingStyle: unknown;
  emptyGroupStyle: unknown;
  teamCardStyle: unknown;
}) {
  if (loadingTeams) {
    return (
      <View style={teamCardStyle as never}>
        <Skeleton height={18} width="40%" style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Skeleton height={36} width={80} borderRadius={18} />
          <Skeleton height={36} width={80} borderRadius={18} />
        </View>
      </View>
    );
  }

  if (filteredTeams.length === 0) {
    return <Text style={emptyTextStyle as never}>{t('tournamentDetail.noTeamsYet')}</Text>;
  }

  return (
    <>
      {canManageTournament && (offerGroupRebalance || canReorganizeGroups) ? (
        <View style={{ flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {canReorganizeGroups ? (
            <Button
              title={t('tournamentDetail.menuReorganizeGroups')}
              variant="secondary"
              size="sm"
              iconLeft="shuffle-outline"
              onPress={() => {
                Alert.alert(
                  t('tournamentDetail.menuReorganizeGroups'),
                  t('tournamentDetail.reorganizeGroupsConfirm'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('common.ok'), onPress: onReorganizeGroups },
                  ]
                );
              }}
              disabled={reorganizePending}
              fullWidth
            />
          ) : null}

          {offerGroupRebalance ? (
            <Button
              title={t('tournamentDetail.rebalanceGroups')}
              variant="outline"
              size="sm"
              iconLeft="shuffle-outline"
              onPress={() => {
                Alert.alert(
                  t('tournamentDetail.rebalanceGroups'),
                  t('tournamentDetail.rebalanceGroupsConfirm'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('common.ok'), onPress: onRebalancePress },
                  ]
                );
              }}
              disabled={rebalancePending}
              fullWidth
            />
          ) : null}
        </View>
      ) : null}

      {divisionTeamsByGroup.map((groupTeams, gi) => (
        <View key={`g-${gi}`} style={groupBlockStyle as never}>
          <Text style={groupHeadingStyle as never}>
            {t('tournamentDetail.groupTitle', { n: gi + 1 })}
          </Text>
          {groupTeams.length === 0 ? (
            <Text style={emptyGroupStyle as never}>{t('tournamentDetail.noTeamsInGroup')}</Text>
          ) : null}
          {groupTeams.map((team) => (
            <View key={team._id} style={{ position: 'relative' }}>
              {canReorderTeams ? (
                <View style={{ position: 'absolute', right: 6, top: 6, zIndex: 2 }}>
                  <IconButton
                    icon="swap-vertical-outline"
                    onPress={() => onReorderTeam(team)}
                    disabled={!!reorderPendingTeamId && reorderPendingTeamId !== team._id}
                    accessibilityLabel={t('tournamentDetail.reorderTeam')}
                    compact
                    size={18}
                  />
                </View>
              ) : null}
              {renderTeam(team)}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

