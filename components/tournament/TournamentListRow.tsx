import React, { memo, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ImageBackground } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { IconButton } from '@/components/ui/IconButton';
import { TournamentStatsBlock } from '@/components/ui/TournamentStatsBlock';
import { formatTournamentDate } from '@/lib/utils/dateFormat';
import {
  maxPlayerSlotsForTournament,
  normalizeGroupCount,
  splitAcrossDivisions,
} from '@/lib/tournamentGroups';
import type { Tournament, TournamentDivision } from '@/types';

const BRONZE = '#cd7f32';

/** Matches `cardConfigText` so row icons align with label color on the card image. */
const CARD_CONFIG_ICON_COLOR = 'rgba(255, 255, 255, 0.92)';

const DEFAULT_TOURNAMENT_CARD_BG = require('@/assets/images/tournament-card-bg.png');

export type TournamentListRowProps = {
  tournament: Tournament;
  variant: 'home' | 'feed';
  onPress: () => void;
  onPressIn?: () => void;
  /** Shown on home tab when the tournament has an invite link */
  onSharePress?: (tournament: Tournament) => void;
};

function TournamentListRowInner({
  tournament,
  variant,
  onPress,
  onPressIn,
  onSharePress,
}: TournamentListRowProps) {
  const { t } = useTranslation();
  const dateLabel = tournament.date || tournament.startDate;
  const totalGroups = normalizeGroupCount(tournament.groupCount);
  const hasInvite = !!tournament.inviteLink;
  const isCancelled = tournament.status === 'cancelled';
  const divisions = (tournament.divisions?.length ? tournament.divisions : ['mixed']) as TournamentDivision[];
  const divisionCount = Math.max(1, divisions.length);
  const totalTeams = tournament.maxTeams ?? 16;
  const totalPlayers = maxPlayerSlotsForTournament(totalTeams);
  const currentPlayers = tournament.entriesCount ?? 0;
  const currentTeams = tournament.teamsCount ?? 0;
  const currentGroups = tournament.groupsWithTeamsCount ?? 0;
  const waitlistCount = tournament.waitlistCount ?? 0;
  const waitlistByDivision = tournament.waitlistCountByDivision;
  const playersByDivision = tournament.entriesCountByDivision;
  const teamsByDivision = tournament.teamsCountByDivision;
  const groupsByDivision = tournament.groupsWithTeamsCountByDivision;

  const formattedDate = formatTournamentDate(dateLabel) || '—';
  const pointsConfigText = `${t('tournaments.pointsToWin')}: ${tournament.pointsToWin ?? 21}`;
  const setsConfigText = `${t('tournaments.setsPerMatch')}: ${tournament.setsPerMatch ?? 1}`;

  const cardImageSource = useMemo(() => {
    const url = tournament.coverImageUrl?.trim();
    if (url) return { uri: url };
    return DEFAULT_TOURNAMENT_CARD_BG;
  }, [tournament.coverImageUrl]);

  const accessibilityLabel =
    variant === 'home'
      ? `${tournament.name}. ${formatTournamentDate(dateLabel) || ''}`
      : `${tournament.name}. ${t('common.tournament')}`;

  const body = (
    <>
      <View
        style={[
          variant === 'home' ? styles.homeTitleRow : styles.feedTitleRow,
          variant === 'home' && hasInvite && onSharePress ? styles.homeTitleRowWithShare : undefined,
        ]}
      >
        <Text style={variant === 'home' ? styles.homeTitle : styles.feedTitle}>{tournament.name}</Text>
        {(tournament.visibility ?? 'public') === 'private' ? (
          <View style={styles.privateBadge}>
            <Text style={styles.privateBadgeText}>{t('tournaments.privateBadge')}</Text>
          </View>
        ) : null}
      </View>
      {isCancelled ? (
        <View style={styles.cancelledRow} accessibilityRole="text">
          <Ionicons name="close-circle" size={16} color={Colors.error} />
          <Text style={styles.cancelledBadge}>{t('tournaments.cancelledBadge')}</Text>
        </View>
      ) : null}
      <View style={styles.cardConfigBlock}>
        <View style={styles.cardConfigRow}>
          <Ionicons name="location-outline" size={18} color={CARD_CONFIG_ICON_COLOR} />
          <Text style={styles.cardConfigText} numberOfLines={2}>
            {tournament.location?.trim() || '—'}
          </Text>
        </View>
        <View style={styles.cardConfigRow}>
          <Ionicons name="calendar-outline" size={18} color={CARD_CONFIG_ICON_COLOR} />
          <Text style={styles.cardConfigText} numberOfLines={1}>
            {formattedDate}
          </Text>
        </View>
        <View style={styles.cardConfigRow}>
          <Ionicons name="trophy-outline" size={18} color={CARD_CONFIG_ICON_COLOR} />
          <Text style={styles.cardConfigText} numberOfLines={1}>
            {pointsConfigText}
          </Text>
        </View>
        <View style={styles.cardConfigRow}>
          <Ionicons name="layers-outline" size={18} color={CARD_CONFIG_ICON_COLOR} />
          <Text style={styles.cardConfigText} numberOfLines={1}>
            {setsConfigText}
          </Text>
        </View>
      </View>
      <View style={styles.categoryMedalsRow}>
        <View style={styles.categoryMedals}>
          {tournament.categories?.includes('Gold') ? (
            <MaterialCommunityIcons name="medal-outline" size={16} color={Colors.yellow} />
          ) : null}
          {tournament.categories?.includes('Silver') ? (
            <MaterialCommunityIcons name="medal-outline" size={16} color={Colors.textSecondary} />
          ) : null}
          {tournament.categories?.includes('Bronze') ? (
            <MaterialCommunityIcons name="medal-outline" size={16} color={BRONZE} />
          ) : null}
          {!tournament.categories?.length ? (
            <MaterialCommunityIcons name="medal-outline" size={16} color={Colors.yellow} />
          ) : null}
        </View>
      </View>
      <View style={styles.divisionStatsContainer}>
        <View style={variant === 'home' ? styles.homeStats : styles.feedStats}>
          {divisions.map((division, idx) => {
            const divisionLabel =
              division === 'men'
                ? t('tournaments.divisionMen')
                : division === 'women'
                  ? t('tournaments.divisionWomen')
                  : t('tournaments.divisionMixed');
            return (
              <View key={`${tournament._id}-${division}`} style={styles.divisionStatsSection}>
                <Text style={[styles.divisionStatsTitle, isCancelled && styles.divisionStatsTitleMuted]}>
                  {divisionLabel}
                </Text>
                <TournamentStatsBlock
                  compact
                  horizontal
                  muted={isCancelled}
                  currentPlayers={
                    playersByDivision?.[division] ?? splitAcrossDivisions(currentPlayers, divisionCount, idx)
                  }
                  totalPlayers={splitAcrossDivisions(totalPlayers, divisionCount, idx)}
                  currentTeams={
                    teamsByDivision?.[division] ?? splitAcrossDivisions(currentTeams, divisionCount, idx)
                  }
                  totalTeams={splitAcrossDivisions(totalTeams, divisionCount, idx)}
                  currentGroups={
                    groupsByDivision?.[division] ?? splitAcrossDivisions(currentGroups, divisionCount, idx)
                  }
                  totalGroups={splitAcrossDivisions(totalGroups, divisionCount, idx)}
                  waitlistCount={
                    waitlistByDivision?.[division] ??
                    // Back-compat for older cached tournaments; avoid showing nonsense splits once server provides per-division counts.
                    splitAcrossDivisions(waitlistCount, divisionCount, idx)
                  }
                />
              </View>
            );
          })}
        </View>
      </View>
      {isCancelled ? (
        <Text style={styles.cancelledHint}>{t('tournaments.cancelledListHint')}</Text>
      ) : null}
    </>
  );

  if (variant === 'home') {
    return (
      <View style={[styles.homeOuter, isCancelled && styles.homeOuterCancelled]}>
        <ImageBackground
          source={cardImageSource}
          style={styles.homeImageBg}
          imageStyle={styles.homeImage}
          resizeMode="cover"
        >
          <View style={styles.cardBgScrim} pointerEvents="none" />
          <Pressable
            style={styles.homePressable}
            onPressIn={onPressIn}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
          >
            {body}
          </Pressable>
        </ImageBackground>
        {hasInvite && onSharePress ? (
          <View style={styles.shareCorner} pointerEvents="box-none">
            <IconButton
              icon="share-outline"
              onPress={() => onSharePress(tournament)}
              accessibilityLabel={t('tournamentDetail.shareInvite')}
              color={Colors.yellow}
              compact
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.feedRow}>
      <ImageBackground
        source={cardImageSource}
        style={styles.feedImageBg}
        imageStyle={styles.feedImage}
        resizeMode="cover"
      >
        <View style={styles.cardBgScrim} pointerEvents="none" />
        <Pressable
          style={[styles.feedPressable, isCancelled && styles.feedCardCancelled]}
          onPressIn={onPressIn}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          {body}
        </Pressable>
      </ImageBackground>
    </View>
  );
}

export const TournamentListRow = memo(TournamentListRowInner);

const styles = StyleSheet.create({
  homeOuter: {
    position: 'relative',
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  homeImageBg: {
    width: '100%',
  },
  homeImage: {
    borderRadius: 12,
  },
  cardBgScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
  },
  homeOuterCancelled: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  homePressable: {
    padding: 16,
    position: 'relative',
    zIndex: 1,
  },
  /** Clears the top-right share control only; keeps horizontal padding symmetric for the rest of the card */
  homeTitleRowWithShare: {
    paddingRight: 28,
  },
  shareCorner: {
    position: 'absolute',
    top: 8,
    right: 6,
    zIndex: 2,
  },
  feedRow: {
    marginBottom: 10,
  },
  feedImageBg: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    overflow: 'hidden',
  },
  feedImage: {
    borderRadius: 14,
  },
  feedPressable: {
    padding: 16,
    position: 'relative',
    zIndex: 1,
  },
  feedCardCancelled: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  homeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  feedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  homeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    minWidth: 0,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  feedTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    minWidth: 0,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  privateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.45)',
  },
  privateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.violet,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cancelledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  cancelledBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.error,
    letterSpacing: 0.3,
  },
  cardConfigBlock: {
    marginBottom: 8,
    gap: 2,
  },
  cardConfigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  cardConfigText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    color: CARD_CONFIG_ICON_COLOR,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  categoryMedalsRow: {
    marginBottom: 8,
  },
  categoryMedals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  /** Same hue as `Colors.surface` (#2d2d2d) at 40% opacity; full width to match title / config rows */
  divisionStatsContainer: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(45, 45, 45, 0.4)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 4,
    overflow: 'hidden',
  },
  homeStats: {
    gap: 8,
  },
  feedStats: {
    gap: 8,
  },
  divisionStatsSection: {
    gap: 4,
  },
  divisionStatsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.violet,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  divisionStatsTitleMuted: {
    color: Colors.textSecondary,
  },
  cancelledHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
});
