import React from 'react';
import { View, Text, Alert } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Team } from '@/types';

export function GroupsTab({
  t,
  loadingTeams,
  filteredTeams,
  canManageTournament,
  groupsDistributionPending,
  /** 'distribute' = crear grupos; 'reorganize' = mismo CTA después de crear. */
  primaryGroupAction,
  onPrimaryGroupAction,
  primaryGroupPending,
  rosterTeamsTotal: _rosterTeamsTotal,
  maxTeams: _maxTeams,
  offerGroupRebalance,
  groupMetaTeamsPerGroup: _groupMetaTeamsPerGroup,
  onRebalancePress,
  rebalancePending,
  divisionTeamsByGroup,
  renderTeam,
  canReorderTeams: _canReorderTeams,
  onReorderTeam: _onReorderTeam,
  swapSourceTeamId: _swapSourceTeamId,
  onSwapTeam: _onSwapTeam,
  onCancelSwap: _onCancelSwap,
  reorderPendingTeamId: _reorderPendingTeamId,
  emptyTextStyle,
  rebalanceBannerStyle: _rebalanceBannerStyle,
  rebalanceHintStyle,
  groupBlockStyle,
  groupHeadingStyle,
  emptyGroupStyle,
  teamCardStyle,
  groupsPendingLegendStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  loadingTeams: boolean;
  filteredTeams: Team[];
  canManageTournament: boolean;
  groupsDistributionPending: boolean;
  primaryGroupAction: 'distribute' | 'reorganize' | null;
  onPrimaryGroupAction: () => void;
  primaryGroupPending: boolean;
  rosterTeamsTotal: number;
  maxTeams: number;
  offerGroupRebalance: boolean;
  groupMetaTeamsPerGroup: number;
  onRebalancePress: () => void;
  rebalancePending: boolean;
  divisionTeamsByGroup: Team[][];
  renderTeam: (team: Team) => React.ReactNode;
  canReorderTeams: boolean;
  onReorderTeam: (team: Team) => void;
  swapSourceTeamId: string | null;
  onSwapTeam: (team: Team) => void;
  onCancelSwap: () => void;
  reorderPendingTeamId: string | null;
  emptyTextStyle: unknown;
  rebalanceBannerStyle: unknown;
  rebalanceHintStyle: unknown;
  groupBlockStyle: unknown;
  groupHeadingStyle: unknown;
  emptyGroupStyle: unknown;
  teamCardStyle: unknown;
  /** Centered italic line when groups are not created yet (same look as fixture legends). */
  groupsPendingLegendStyle: unknown;
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

  /** Grupos aún no creados: solo la leyenda (crear grupos sigue en el menú del organizador). */
  if (groupsDistributionPending) {
    return (
      <Text style={groupsPendingLegendStyle as never}>{t('tournamentDetail.groupsTabNoGroupsLegend')}</Text>
    );
  }

  const showRebalance = offerGroupRebalance;

  return (
    <>
      {canManageTournament && (primaryGroupAction != null || showRebalance) ? (
        <View style={{ flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {primaryGroupAction ? (
            <View style={{ gap: 6 }}>
              <Button
                title={
                  primaryGroupAction === 'distribute'
                    ? t('tournamentDetail.createGroupsButton')
                    : t('tournamentDetail.menuReorganizeGroups')
                }
                variant="primary"
                size="sm"
                iconLeft={primaryGroupAction === 'distribute' ? 'grid-outline' : 'shuffle-outline'}
                onPress={() => {
                  const isDist = primaryGroupAction === 'distribute';
                  Alert.alert(
                    isDist ? t('tournamentDetail.createGroupsButton') : t('tournamentDetail.menuReorganizeGroups'),
                    isDist ? t('tournamentDetail.createGroupsConfirm') : t('tournamentDetail.reorganizeGroupsConfirm'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('common.ok'), onPress: onPrimaryGroupAction },
                    ]
                  );
                }}
                disabled={primaryGroupPending}
                fullWidth
              />
              <Text style={rebalanceHintStyle as never}>
                {primaryGroupAction === 'distribute'
                  ? t('tournamentDetail.createGroupsHint')
                  : t('tournamentDetail.reorganizeGroupsHint')}
              </Text>
            </View>
          ) : null}

          {showRebalance ? (
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

      {filteredTeams.length === 0 ? (
        <Text style={emptyTextStyle as never}>{t('tournamentDetail.noTeamsYet')}</Text>
      ) : (
        divisionTeamsByGroup.map((groupTeams, gi) => (
          <View key={`g-${gi}`} style={groupBlockStyle as never}>
            <Text style={groupHeadingStyle as never}>{t('tournamentDetail.groupTitle', { n: gi + 1 })}</Text>
            {groupTeams.length === 0 ? (
              <Text style={emptyGroupStyle as never}>{t('tournamentDetail.noTeamsInGroup')}</Text>
            ) : null}
            {groupTeams.map((team) => (
              <View key={team._id} style={{ borderRadius: 12 } as never}>
                {renderTeam(team)}
              </View>
            ))}
          </View>
        ))
      )}
    </>
  );
}
