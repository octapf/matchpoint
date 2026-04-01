import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { getPlayerListName } from '@/lib/utils/userDisplay';
import type { User } from '@/types';

export function WaitingListTab({
  t,
  filteredWaitlist,
  userMap,
  onOpenProfile,
  canManageTournament,
  mutationBusy,
  onRemoveWaitlistPlayer,
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
        const playerName = getPlayerListName(u) || t('common.player');
        return (
          <View style={[playerRowStyle as never, { position: 'relative' } as never]}>
            <Pressable
              style={playerRowMainStyle as never}
              onPress={() => onOpenProfile(row.userId)}
              accessibilityRole="button"
              accessibilityLabel={t('profile.viewProfile')}
            >
              <Avatar
                firstName={u?.firstName ?? ''}
                lastName={u?.lastName ?? ''}
                gender={u?.gender === 'male' || u?.gender === 'female' ? u.gender : undefined}
                size="sm"
              />
              <View style={playerRowTextStyle as never}>
                <Text style={playerRowNameStyle as never}>{playerName}</Text>
                <Text style={waitlistRankTextStyle as never}>{t('tournaments.waitlistYouAre', { n: idx + 1 })}</Text>
              </View>
            </Pressable>
            {canManageTournament ? (
              <View style={{ position: 'absolute', top: 4, right: 4, zIndex: 2 } as never}>
                <IconButton
                  icon="trash-outline"
                  onPress={() => onRemoveWaitlistPlayer(row.userId, playerName)}
                  disabled={mutationBusy}
                  accessibilityLabel={t('tournamentDetail.removePlayer')}
                  color="#f87171"
                  compact
                />
              </View>
            ) : null}
          </View>
        );
      }}
    />
  );
}

