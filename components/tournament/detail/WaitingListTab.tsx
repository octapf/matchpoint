import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Avatar } from '@/components/ui/Avatar';
import { getPlayerListName } from '@/lib/utils/userDisplay';
import type { User } from '@/types';

export function WaitingListTab({
  t,
  filteredWaitlist,
  userMap,
  onOpenProfile,
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
          <View style={playerRowStyle as never}>
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
          </View>
        );
      }}
    />
  );
}

