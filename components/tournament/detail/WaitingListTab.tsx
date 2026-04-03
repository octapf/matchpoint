import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import Colors from '@/constants/Colors';
import { getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import type { User } from '@/types';

export function WaitingListTab({
  t,
  filteredWaitlist,
  userMap,
  organizerIds,
  organizerOnlyIds,
  onOpenProfile,
  canManageTournament,
  mutationBusy,
  onRemoveWaitlistPlayer,
  viewerUserId,
  viewerOnWaitlist,
  onInvitePartner,
  invitePending,
  emptyTextStyle,
  playerRowStyle,
  playerRowOrganizerStyle,
  playerRowMainStyle,
  playerRowTextStyle,
  playerRowNameStyle,
  orgBadgeStyle,
  waitlistRankTextStyle,
  userHasTeam,
  alreadyInTeamHintStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  filteredWaitlist: { userId: string }[];
  userMap: Record<string, User>;
  /** When true, show "already in a team" below the empty placeholder or above the list. */
  userHasTeam: boolean;
  alreadyInTeamHintStyle: unknown;
  organizerIds: string[];
  /** Subset of organizers who are organize-only (same as Players tab). */
  organizerOnlyIds?: string[];
  onOpenProfile: (userId: string) => void;
  canManageTournament: boolean;
  mutationBusy: boolean;
  onRemoveWaitlistPlayer: (userId: string, playerName: string) => void;
  viewerUserId: string | null;
  viewerOnWaitlist: boolean;
  onInvitePartner?: (toUserId: string) => void;
  invitePending?: boolean;
  emptyTextStyle: unknown;
  playerRowStyle: unknown;
  playerRowOrganizerStyle: unknown;
  playerRowMainStyle: unknown;
  playerRowTextStyle: unknown;
  playerRowNameStyle: unknown;
  orgBadgeStyle: unknown;
  waitlistRankTextStyle: unknown;
}) {
  const onlySet = React.useMemo(() => new Set(organizerOnlyIds ?? []), [organizerOnlyIds]);
  if (filteredWaitlist.length === 0) {
    return (
      <View>
        <Text style={emptyTextStyle as never}>{t('tournamentDetail.waitinglistPlaceholder')}</Text>
        {userHasTeam ? (
          <Text style={alreadyInTeamHintStyle as never}>{t('tournamentDetail.alreadyInTeam')}</Text>
        ) : null}
      </View>
    );
  }

  const header =
    userHasTeam ? (
      <Text style={[alreadyInTeamHintStyle as never, { marginBottom: 12 } as never]}>
        {t('tournamentDetail.alreadyInTeam')}
      </Text>
    ) : null;

  return (
    <FlashList
      data={filteredWaitlist}
      ListHeaderComponent={header}
      keyExtractor={(row, idx) => `${row.userId}-${idx}`}
      renderItem={({ item: row, index: idx }) => {
        const u = userMap[row.userId];
        const playerName = getTournamentPlayerDisplayName(u) || t('common.player');
        const isOrganizeOnly = onlySet.has(row.userId);
        const isOrg = organizerIds.includes(row.userId);
        const showInvite =
          !!onInvitePartner &&
          viewerOnWaitlist &&
          !!viewerUserId &&
          row.userId !== viewerUserId;
        return (
          <View
            style={[
              playerRowStyle as never,
              isOrg ? (playerRowOrganizerStyle as never) : null,
              { flexDirection: 'row', alignItems: 'center' } as never,
            ]}
          >
            <Pressable
              style={[playerRowMainStyle as never, { flex: 1, minWidth: 0 } as never]}
              onPress={() => onOpenProfile(row.userId)}
              accessibilityRole="button"
              accessibilityLabel={t('profile.viewProfile')}
            >
              <Avatar
                firstName={u?.firstName ?? ''}
                lastName={u?.lastName ?? ''}
                gender={u?.gender === 'male' || u?.gender === 'female' ? u.gender : undefined}
                size="sm"
                photoUrl={u?.photoUrl}
              />
              <View style={playerRowTextStyle as never}>
                <Text style={playerRowNameStyle as never}>{playerName}</Text>
                {isOrganizeOnly ? (
                  <Text style={orgBadgeStyle as never}>{t('tournamentDetail.organizerOrganizeOnlyBadge')}</Text>
                ) : isOrg ? (
                  <Text style={orgBadgeStyle as never}>{t('tournamentDetail.organizerBadge')}</Text>
                ) : null}
                <Text style={waitlistRankTextStyle as never}>{t('tournaments.waitlistYouAre', { n: idx + 1 })}</Text>
              </View>
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 } as never}>
              {showInvite ? (
                <IconButton
                  icon="person-add-outline"
                  onPress={() => onInvitePartner?.(row.userId)}
                  disabled={!!invitePending}
                  accessibilityLabel={t('tournamentDetail.waitlistInvitePartnerHint')}
                  color={Colors.yellow}
                  compact
                />
              ) : null}
              {canManageTournament ? (
                <IconButton
                  icon="trash-outline"
                  onPress={() => onRemoveWaitlistPlayer(row.userId, playerName)}
                  disabled={mutationBusy}
                  accessibilityLabel={t('tournamentDetail.removePlayer')}
                  color="#f87171"
                  compact
                />
              ) : null}
            </View>
          </View>
        );
      }}
    />
  );
}
