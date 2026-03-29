import React, { memo, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
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
import type { Tournament } from '@/types';

const BRONZE = '#cd7f32';

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
  const divisions = tournament.divisions?.length ? tournament.divisions : ['mixed'];
  const divisionCount = Math.max(1, divisions.length);
  const totalTeams = tournament.maxTeams ?? 16;
  const totalPlayers = maxPlayerSlotsForTournament(totalTeams);
  const currentPlayers = tournament.entriesCount ?? 0;
  const currentTeams = tournament.teamsCount ?? 0;
  const currentGroups = tournament.groupsWithTeamsCount ?? 0;
  const waitlistCount = tournament.waitlistCount ?? 0;

  const categoryLine = useMemo(() => {
    if (!tournament.categories?.length) return t('tournaments.categoryNone');
    if (
      tournament.categories.length === 2 &&
      tournament.categories.includes('Gold') &&
      tournament.categories.includes('Silver')
    ) {
      return t('tournaments.categoryGoldSilver');
    }
    if (
      tournament.categories.length === 3 &&
      tournament.categories.includes('Gold') &&
      tournament.categories.includes('Silver') &&
      tournament.categories.includes('Bronze')
    ) {
      return t('tournaments.categoryGoldSilverBronze');
    }
    return tournament.categories.join(' · ');
  }, [t, tournament.categories]);

  const pointsLine = `${t('tournaments.pointsToWin')}: ${tournament.pointsToWin ?? 21} · ${t('tournaments.setsPerMatch')}: ${tournament.setsPerMatch ?? 1}`;

  const accessibilityLabel =
    variant === 'home'
      ? `${tournament.name}. ${formatTournamentDate(dateLabel) || ''}`
      : `${tournament.name}. ${t('common.tournament')}`;

  const body = (
    <>
      <View style={variant === 'home' ? styles.homeTitleRow : styles.feedTitleRow}>
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
      {variant === 'home' ? (
        <>
          <Text style={styles.homeDate}>{formatTournamentDate(dateLabel) || '—'}</Text>
          <Text style={styles.homeLocation}>{tournament.location?.trim() || '—'}</Text>
        </>
      ) : (
        <Text style={styles.feedMeta}>
          {formatTournamentDate(dateLabel) || '—'} · {tournament.location?.trim() || '—'}
        </Text>
      )}
      <View style={styles.categoryRow}>
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
        <Text style={styles.metaSecondary} numberOfLines={1}>
          {categoryLine}
        </Text>
      </View>
      <Text style={styles.metaSecondary} numberOfLines={1}>
        {pointsLine}
      </Text>
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
                currentPlayers={splitAcrossDivisions(currentPlayers, divisionCount, idx)}
                totalPlayers={splitAcrossDivisions(totalPlayers, divisionCount, idx)}
                currentTeams={splitAcrossDivisions(currentTeams, divisionCount, idx)}
                totalTeams={splitAcrossDivisions(totalTeams, divisionCount, idx)}
                currentGroups={splitAcrossDivisions(currentGroups, divisionCount, idx)}
                totalGroups={splitAcrossDivisions(totalGroups, divisionCount, idx)}
                waitlistCount={splitAcrossDivisions(waitlistCount, divisionCount, idx)}
              />
            </View>
          );
        })}
      </View>
      {isCancelled ? (
        <Text style={styles.cancelledHint}>{t('tournaments.cancelledListHint')}</Text>
      ) : null}
    </>
  );

  if (variant === 'home') {
    return (
      <View style={[styles.homeOuter, isCancelled && styles.homeOuterCancelled]}>
        <Pressable
          style={[styles.homePressable, hasInvite ? styles.homePressableWithShare : undefined]}
          onPressIn={onPressIn}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          {body}
        </Pressable>
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
      <Pressable
        style={[styles.feedCard, isCancelled && styles.feedCardCancelled]}
        onPressIn={onPressIn}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {body}
      </Pressable>
    </View>
  );
}

export const TournamentListRow = memo(TournamentListRowInner);

const styles = StyleSheet.create({
  homeOuter: {
    position: 'relative',
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  homeOuterCancelled: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  homePressable: {
    padding: 16,
  },
  homePressableWithShare: {
    paddingRight: 44,
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
  feedCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
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
  },
  feedTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    minWidth: 0,
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
  homeDate: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  homeLocation: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  feedMeta: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  metaSecondary: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  categoryMedals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 18,
  },
  homeStats: {
    marginBottom: 4,
    gap: 8,
  },
  feedStats: {
    marginBottom: 4,
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
