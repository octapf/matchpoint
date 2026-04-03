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
  playerRowMainStyle,
  playerRowTextStyle,
  playerRowNameStyle,
  waitlistRankTextStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  filteredWaitlist: { userId: string }[];
  userMap: Record<string, User>;
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
  playerRowMainStyle: unknown;
  playerRowTextStyle: unknown;
  playerRowNameStyle: unknown;
  waitlistRankTextStyle: unknown;
}) {
  if (filteredWaitlist.length === 0) {
    return <Text style={emptyTextStyle as never}>{t('tournamentDetail.waitinglistPlaceholder')}</Text>;
  }

  return (
    <FlashList
      data={filteredWaitlist}
      keyExtractor={(row, idx) => `${row.userId}-${idx}`}
      renderItem={({ item: row, index: idx }) => {
        const u = userMap[row.userId];
        const playerName = getTournamentPlayerDisplayName(u) || t('common.player');
        const showInvite =
          !!onInvitePartner &&
          viewerOnWaitlist &&
          !!viewerUserId &&
          row.userId !== viewerUserId;
        return (
          <View style={[playerRowStyle as never, { flexDirection: 'row', alignItems: 'center' } as never]}>
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
