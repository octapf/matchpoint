import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { guestPlayerIdFromSlot, isGuestPlayerSlot } from '@/lib/playerSlots';
import { resolveRosterSlotLabel } from '@/lib/utils/resolveParticipant';
import { getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import type { Team, TournamentCategory, TournamentGuestPlayer, User } from '@/types';

const TEAM_TAB_BRONZE_MEDAL = '#cd7f32';

export const tournamentTeamCardStyles = StyleSheet.create({
  teamCard: {
    position: 'relative',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  teamCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    marginBottom: 8,
    minHeight: 22,
  },
  teamCardNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  teamCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: 6,
  },
  teamCardBottomRowWithDelete: {
    paddingRight: 42,
    paddingBottom: 8,
  },
  teamCardPlayersWrap: {
    flex: 1,
    minWidth: 0,
  },
  teamCardDeleteAbsolute: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    zIndex: 2,
  },
  teamName: { fontSize: 14, fontWeight: '700', color: Colors.text, lineHeight: 18 },
  /** Fixed band so waitlist / stats / empty state match the same card width and row height. */
  teamCardActionsFixed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    flexGrow: 0,
    minWidth: 118,
    minHeight: 22,
  },
  teamCardIconsCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'nowrap',
    gap: 5,
    minHeight: 22,
  },
  teamCardHeaderRightLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    textAlign: 'right',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    lineHeight: 14,
    maxWidth: 118,
  },
  teamCardPlayersRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  teamCardPtsLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0,
    textTransform: 'uppercase',
    lineHeight: 20,
  },
  teamCardPlayerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '48%',
    minWidth: 0,
    paddingVertical: 2,
  },
  teamCardSlotCell: {
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '48%',
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 28,
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 6,
  },
  teamCardStatNumber: { fontSize: 13, fontWeight: '700', color: Colors.text, lineHeight: 20 },
  playerNameSmall: { fontSize: 11, color: Colors.text, lineHeight: 14 },
  playerNameHighlight: { color: Colors.text, fontWeight: '600' },
  slotText: { fontSize: 11, color: Colors.textMuted },
});

const styles = tournamentTeamCardStyles;

export type TournamentTeamCardProps = {
  team: Team;
  userMap: Record<string, User>;
  guestMap?: Record<string, TournamentGuestPlayer | undefined>;
  currentUserId: string | null;
  t: (key: string, options?: Record<string, string | number>) => string;
  canRemoveTeam?: boolean;
  onRemoveTeam?: () => void;
  removeTeamPending?: boolean;
  onOpenProfile: (userId: string) => void;
  onPressTeam?: () => void;
  classificationSummary?: {
    wins: number;
    points: number;
    category: TournamentCategory | null;
    classified: boolean;
    showOutcomeIcons?: boolean;
  };
  /** Shown top-right (same band as classification icons), e.g. waitlist position. */
  headerRightLabel?: string;
  /** Overrides default `tournamentDetail.removeTeam` for the trash control (e.g. leave waitlist). */
  removeActionAccessibilityLabel?: string;
};

export function TournamentTeamCard({
  team,
  userMap,
  guestMap,
  currentUserId,
  t,
  canRemoveTeam,
  onRemoveTeam,
  removeTeamPending,
  onOpenProfile,
  classificationSummary,
  onPressTeam,
  headerRightLabel,
  removeActionAccessibilityLabel,
}: TournamentTeamCardProps) {
  const showOutcomeIcons = classificationSummary?.showOutcomeIcons !== false;

  const medalColor =
    classificationSummary?.category === 'Gold'
      ? Colors.yellow
      : classificationSummary?.category === 'Silver'
        ? Colors.textSecondary
        : classificationSummary?.category === 'Bronze'
          ? TEAM_TAB_BRONZE_MEDAL
          : Colors.textMuted;

  const a11yIcons =
    classificationSummary != null
      ? [
          ...(showOutcomeIcons
            ? [
                classificationSummary.classified
                  ? t('tournamentDetail.teamClassified')
                  : t('tournamentDetail.teamEliminated'),
                ...(classificationSummary.category
                  ? [t('tournamentDetail.teamCategoryMedalA11y', { medal: classificationSummary.category })]
                  : []),
              ]
            : []),
          `${t('tournamentDetail.teamTabWins')}: ${classificationSummary.wins}`,
          `${t('tournamentDetail.teamTabPoints')}: ${classificationSummary.points}`,
        ].join('. ')
      : undefined;

  const showDelete = Boolean(canRemoveTeam && onRemoveTeam);

  const cardInner = (
    <>
      <View style={styles.teamCardTopRow}>
        <View style={styles.teamCardNameWrap}>
          <Text style={styles.teamName} numberOfLines={1} ellipsizeMode="tail">
            {team.name}
          </Text>
        </View>
        <View style={styles.teamCardActionsFixed}>
          {classificationSummary ? (
            <View style={styles.teamCardIconsCluster} accessibilityLabel={a11yIcons} accessible={true}>
              {showOutcomeIcons ? (
                <Ionicons
                  name={classificationSummary.classified ? 'checkmark-circle' : 'close-circle'}
                  size={20}
                  color={classificationSummary.classified ? Colors.success : Colors.error}
                />
              ) : null}
              {showOutcomeIcons && classificationSummary.category ? (
                <MaterialCommunityIcons name="medal-outline" size={20} color={medalColor} />
              ) : null}
              <Ionicons name="trophy-outline" size={17} color={Colors.textSecondary} />
              <Text style={styles.teamCardStatNumber}>{classificationSummary.wins}</Text>
              <Text style={styles.teamCardPtsLabel}>{t('tournamentDetail.teamTabPoints')}</Text>
              <Text style={styles.teamCardStatNumber}>{classificationSummary.points}</Text>
            </View>
          ) : headerRightLabel ? (
            <View style={styles.teamCardIconsCluster}>
              <Text style={styles.teamCardHeaderRightLabel} numberOfLines={1} ellipsizeMode="tail">
                {headerRightLabel}
              </Text>
            </View>
          ) : (
            <View style={styles.teamCardIconsCluster} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          )}
        </View>
      </View>

      <View style={[styles.teamCardBottomRow, showDelete ? styles.teamCardBottomRowWithDelete : null]}>
        <View style={styles.teamCardPlayersWrap}>
          <View style={styles.teamCardPlayersRow}>
            {[0, 1].map((i) => {
              const pid = team.playerIds?.[i];
              const user = pid && !isGuestPlayerSlot(pid) ? userMap[pid] : null;
              const playerName = pid
                ? user
                  ? getTournamentPlayerDisplayName(user)
                  : resolveRosterSlotLabel(pid, userMap, guestMap ?? {})
                : null;
              const isYou = pid === currentUserId;
              const isGuest = !!(pid && isGuestPlayerSlot(pid));
              const guestId = pid && isGuest ? guestPlayerIdFromSlot(pid) : null;
              const guest = guestId && guestMap ? guestMap[guestId] : undefined;
              const guestGender = guest?.gender === 'male' || guest?.gender === 'female' ? guest.gender : undefined;
              return pid ? (
                <Pressable
                  key={i}
                  style={styles.teamCardPlayerCell}
                  onPress={isGuest ? undefined : () => onOpenProfile(pid)}
                  accessibilityRole="button"
                  accessibilityLabel={isGuest ? playerName ?? '' : t('profile.viewProfile')}
                  disabled={isGuest}
                >
                  <Avatar
                    firstName={isGuest ? (playerName ?? '') : (user?.firstName ?? '')}
                    lastName={isGuest ? '' : (user?.lastName ?? '')}
                    gender={
                      isGuest
                        ? guestGender
                        : user?.gender === 'male' || user?.gender === 'female'
                          ? user.gender
                          : undefined
                    }
                    size="xs"
                    photoUrl={user?.photoUrl}
                  />
                  <Text style={[styles.playerNameSmall, isYou && styles.playerNameHighlight]} numberOfLines={1}>
                    {playerName || t('common.player')}
                  </Text>
                </Pressable>
              ) : (
                <View key={i} style={styles.teamCardSlotCell}>
                  <Text style={styles.slotText}>{t('tournamentDetail.openSlot')}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
      {showDelete && onRemoveTeam ? (
        <View style={styles.teamCardDeleteAbsolute}>
          <IconButton
            icon="trash-outline"
            onPress={onRemoveTeam}
            disabled={removeTeamPending}
            accessibilityLabel={removeActionAccessibilityLabel ?? t('tournamentDetail.removeTeam')}
            color="#f87171"
            size={16}
            compact
          />
        </View>
      ) : null}
    </>
  );

  return onPressTeam ? (
    <Pressable
      style={({ pressed }) => [styles.teamCard, pressed ? { opacity: 0.92 } : null]}
      onPress={onPressTeam}
      accessibilityRole="button"
      accessibilityLabel={t('tournamentDetail.editTeamA11y')}
    >
      {cardInner}
    </Pressable>
  ) : (
    <View style={styles.teamCard}>{cardInner}</View>
  );
}
