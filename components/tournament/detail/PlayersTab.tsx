import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import type { Entry, User } from '@/types';
import Colors from '@/constants/Colors';

export function PlayersTab({
  t,
  sortedEntries,
  userMap,
  organizerIds,
  currentUserId,
  hasJoined,
  canManageTournament,
  mutationBusy,
  onOpenProfile,
  onPromoteOrganizer,
  onDemoteOrganizer,
  onDemoteOrganizeOnly,
  organizeOnlyUserIds,
  onConfirmLeave,
  onConfirmRemovePlayer,
  emptyTextStyle,
  playerRowStyle,
  playerRowOrganizerStyle,
  playerRowTopStyle,
  playerRowMainStyle,
  playerRowTextStyle,
  playerRowNameStyle,
  orgBadgeStyle,
  playerRowRightStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  sortedEntries: Entry[];
  userMap: Record<string, User>;
  organizerIds: string[];
  currentUserId: string | null;
  hasJoined: boolean;
  canManageTournament: boolean;
  mutationBusy: boolean;
  onOpenProfile: (userId: string) => void;
  onPromoteOrganizer: (targetUserId: string, playerName: string) => void;
  onDemoteOrganizer: (targetUserId: string, playerName: string) => void;
  onDemoteOrganizeOnly: (targetUserId: string, playerName: string) => void;
  /** Organizers who are not on the player roster (organize-only). */
  organizeOnlyUserIds: string[];
  onConfirmLeave: () => void;
  onConfirmRemovePlayer: (entry: Entry, playerName: string) => void;
  emptyTextStyle: unknown;
  playerRowStyle: unknown;
  playerRowOrganizerStyle: unknown;
  playerRowTopStyle: unknown;
  playerRowMainStyle: unknown;
  playerRowTextStyle: unknown;
  playerRowNameStyle: unknown;
  orgBadgeStyle: unknown;
  playerRowRightStyle: unknown;
}) {
  const header =
    organizeOnlyUserIds.length > 0 ? (
      <View style={{ marginBottom: 12 }}>
        <Text
          style={[
            playerRowNameStyle as never,
            { fontSize: 13, opacity: 0.85, marginBottom: 8, fontWeight: '600' } as never,
          ]}
        >
          {t('tournamentDetail.organizersOrganizeOnlySection')}
        </Text>
        {organizeOnlyUserIds.map((uid) => {
          const u = userMap[uid];
          const playerName = getTournamentPlayerDisplayName(u) || t('common.player');
          const showDemote = canManageTournament;
          return (
            <View
              key={uid}
              style={[playerRowStyle as never, playerRowOrganizerStyle as never]}
            >
              <View style={playerRowTopStyle as never}>
                <Pressable
                  style={playerRowMainStyle as never}
                  onPress={() => onOpenProfile(uid)}
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
                    <Text style={orgBadgeStyle as never}>{t('tournamentDetail.organizerOrganizeOnlyBadge')}</Text>
                  </View>
                </Pressable>
                <View style={playerRowRightStyle as never}>
                  {showDemote ? (
                    <IconButton
                      icon="person-circle-outline"
                      onPress={() => onDemoteOrganizeOnly(uid, playerName)}
                      disabled={mutationBusy}
                      accessibilityLabel={t('tournamentDetail.removeOrganizer')}
                      color={Colors.violet}
                      compact
                    />
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    ) : null;

  if (sortedEntries.length === 0) {
    return (
      <View>
        {header}
        <Text style={emptyTextStyle as never}>{t('tournamentDetail.noPlayersYet')}</Text>
      </View>
    );
  }

  return (
    <FlashList
      data={sortedEntries}
      keyExtractor={(entry) => entry._id}
      ListHeaderComponent={header}
      renderItem={({ item: entry }) => {
        const u = userMap[entry.userId];
        const playerName = getTournamentPlayerDisplayName(u) || t('common.player');
        const isOrg = organizerIds.includes(entry.userId);
        const isSelf = entry.userId === currentUserId;
        const showTopTrash = (canManageTournament && !isSelf) || (isSelf && hasJoined);
        const showOrganizerToggleIcon = canManageTournament && (!isSelf || (isSelf && isOrg));

        return (
          <View
            key={entry._id}
            style={[playerRowStyle as never, isOrg ? (playerRowOrganizerStyle as never) : null]}
          >
            <View style={playerRowTopStyle as never}>
              <Pressable
                style={playerRowMainStyle as never}
                onPress={() => onOpenProfile(entry.userId)}
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
                  {isOrg ? <Text style={orgBadgeStyle as never}>{t('tournamentDetail.organizerBadge')}</Text> : null}
                </View>
              </Pressable>

              <View style={playerRowRightStyle as never}>
                {showOrganizerToggleIcon ? (
                  <IconButton
                    icon="person-circle-outline"
                    onPress={() => (isOrg ? onDemoteOrganizer(entry.userId, playerName) : onPromoteOrganizer(entry.userId, playerName))}
                    disabled={mutationBusy}
                    accessibilityLabel={isOrg ? t('tournamentDetail.removeOrganizer') : t('tournamentDetail.makeOrganizer')}
                    color={isOrg ? Colors.violet : Colors.textMuted}
                    compact
                  />
                ) : null}

                {showTopTrash ? (
                  <IconButton
                    icon="trash-outline"
                    onPress={() => (isSelf && hasJoined ? onConfirmLeave() : onConfirmRemovePlayer(entry, playerName))}
                    disabled={mutationBusy}
                    accessibilityLabel={isSelf && hasJoined ? t('tournamentDetail.leaveTournament') : t('tournamentDetail.removePlayer')}
                    color="#f87171"
                    compact
                  />
                ) : null}
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

