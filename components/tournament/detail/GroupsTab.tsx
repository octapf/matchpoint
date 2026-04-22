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

  // When groups are not created yet: show only the legend + (if allowed) the Create Groups CTA.
  // Do not render empty group blocks or duplicate CTAs.
  if (groupsDistributionPending) {
    return (
      <>
        <Text style={groupsPendingLegendStyle as never}>{t('tournamentDetail.groupsTabNoGroupsLegend')}</Text>
        {canManageTournament && primaryGroupAction === 'distribute' ? (
          <View style={{ marginTop: 12 }}>
            <Button
              title={t('tournamentDetail.createGroupsButton')}
              variant="primary"
              size="sm"
              iconLeft="grid-outline"
              onPress={() => {
                Alert.alert(
                  t('tournamentDetail.createGroupsButton'),
                  t('tournamentDetail.createGroupsConfirm'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('common.ok'), onPress: onPrimaryGroupAction },
                  ]
                );
              }}
              disabled={primaryGroupPending}
              fullWidth
            />
          </View>
        ) : null}
      </>
    );
  }

  /**
   * One CTA only: when teams need fixing (bunched / over capacity), show rebalance; otherwise
   * create groups or random reorganize. Random reorganize stays available from the header menu.
   */
  const groupCtaKind: 'distribute' | 'reorganize' | 'rebalance' | null = offerGroupRebalance
    ? 'rebalance'
    : primaryGroupAction === 'distribute'
      ? 'distribute'
      : primaryGroupAction === 'reorganize'
        ? 'reorganize'
        : null;

  return (
    <>
      {canManageTournament && groupCtaKind != null ? (
        <View style={{ flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          <View style={{ gap: 6 }}>
            <Button
              title={
                groupCtaKind === 'distribute'
                  ? t('tournamentDetail.createGroupsButton')
                  : groupCtaKind === 'rebalance'
                    ? t('tournamentDetail.rebalanceGroups')
                    : t('tournamentDetail.menuReorganizeGroups')
              }
              variant="primary"
              size="sm"
              iconLeft={groupCtaKind === 'distribute' ? 'grid-outline' : 'shuffle-outline'}
              onPress={() => {
                if (groupCtaKind === 'distribute') {
                  Alert.alert(
                    t('tournamentDetail.createGroupsButton'),
                    t('tournamentDetail.createGroupsConfirm'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('common.ok'), onPress: onPrimaryGroupAction },
                    ],
                  );
                  return;
                }
                if (groupCtaKind === 'rebalance') {
                  Alert.alert(
                    t('tournamentDetail.rebalanceGroups'),
                    t('tournamentDetail.rebalanceGroupsConfirm'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('common.ok'), onPress: onRebalancePress },
                    ],
                  );
                  return;
                }
                Alert.alert(
                  t('tournamentDetail.menuReorganizeGroups'),
                  t('tournamentDetail.reorganizeGroupsConfirm'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('common.ok'), onPress: onPrimaryGroupAction },
                  ],
                );
              }}
              disabled={primaryGroupPending || rebalancePending}
              fullWidth
            />
            {groupCtaKind === 'distribute' ? (
              <Text style={rebalanceHintStyle as never}>{t('tournamentDetail.createGroupsHint')}</Text>
            ) : null}
          </View>
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
