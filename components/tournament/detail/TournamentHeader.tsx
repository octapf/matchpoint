import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { OrganizerMenuItem } from '@/components/tournament/TournamentOrganizerMenu';
import { TournamentOrganizerMenu } from '@/components/tournament/TournamentOrganizerMenu';
import Colors from '@/constants/Colors';
import { formatTournamentDate } from '@/lib/utils/dateFormat';

export function TournamentHeader({
  t,
  tournament,
  dateLabel,
  isCancelled,
  canManageTournament,
  organizerMenuItems,
  matchProgress,
  headerStyle,
  cancelledBannerStyle,
  cancelledBannerTextStyle,
  privateBannerStyle,
  privateBannerTextStyle,
  headerTopRowStyle,
  dateLocationLeftStyle,
  dateLocationRowStyle,
  locationStyle,
  dateLocationSepStyle,
  dateStyle,
  matchRulesTextStyle,
  progressWrapStyle,
  progressTrackStyle,
  progressFillStyle,
  progressLabelStyle,
  headerTopActionsStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  tournament: { location?: string; date?: string; startDate?: string; pointsToWin?: number; setsPerMatch?: number; visibility?: string };
  dateLabel: string | undefined;
  isCancelled: boolean;
  canManageTournament: boolean;
  organizerMenuItems: OrganizerMenuItem[];
  matchProgress: { total: number; completed: number; ratio: number } | null;
  headerStyle: unknown;
  cancelledBannerStyle: unknown;
  cancelledBannerTextStyle: unknown;
  privateBannerStyle: unknown;
  privateBannerTextStyle: unknown;
  headerTopRowStyle: unknown;
  dateLocationLeftStyle: unknown;
  dateLocationRowStyle: unknown;
  locationStyle: unknown;
  dateLocationSepStyle: unknown;
  dateStyle: unknown;
  matchRulesTextStyle: unknown;
  progressWrapStyle: unknown;
  progressTrackStyle: unknown;
  progressFillStyle: unknown;
  progressLabelStyle: unknown;
  headerTopActionsStyle: unknown;
}) {
  return (
    <View style={headerStyle as never}>
      {isCancelled ? (
        <View style={cancelledBannerStyle as never} accessibilityRole="alert">
          <Ionicons name="close-circle-outline" size={22} color={Colors.error} />
          <Text style={cancelledBannerTextStyle as never}>{t('tournamentDetail.cancelledBanner')}</Text>
        </View>
      ) : null}

      {(tournament.visibility ?? 'public') === 'private' ? (
        <View style={privateBannerStyle as never} accessibilityRole="text">
          <Ionicons name="lock-closed-outline" size={20} color={Colors.violet} />
          <Text style={privateBannerTextStyle as never}>{t('tournamentDetail.privateVisibilityBanner')}</Text>
        </View>
      ) : null}

      <View style={headerTopRowStyle as never}>
        <View style={dateLocationLeftStyle as never}>
          <View style={dateLocationRowStyle as never}>
            <Text style={locationStyle as never}>{tournament.location?.trim() || '—'}</Text>
            <Text style={dateLocationSepStyle as never}>·</Text>
            <Text style={dateStyle as never}>{formatTournamentDate(dateLabel) || '—'}</Text>
          </View>

          <Text style={matchRulesTextStyle as never}>
            {t('tournaments.pointsToWin')}: {tournament.pointsToWin ?? 21} · {t('tournaments.setsPerMatch')}: {tournament.setsPerMatch ?? 1}
          </Text>

          {matchProgress ? (
            <View style={progressWrapStyle as never} accessibilityRole="text">
              <View style={progressTrackStyle as never}>
                <View style={[progressFillStyle as never, { width: `${Math.round(matchProgress.ratio * 100)}%` }]} />
              </View>
              <Text style={progressLabelStyle as never}>
                {t('tournamentDetail.progressLabel', { done: matchProgress.completed, total: matchProgress.total })}
              </Text>
            </View>
          ) : null}
        </View>

        {canManageTournament ? (
          <View style={headerTopActionsStyle as never}>
            <TournamentOrganizerMenu menuLabel={t('tournamentDetail.actionsMenu')} items={organizerMenuItems} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

