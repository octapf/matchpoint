import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { openVenueInMaps } from '@/components/tournament/venueMapShared';
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
  showMeta = true,
  organizerMenuItems,
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
  headerTopActionsStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  tournament: {
    location?: string;
    date?: string;
    startDate?: string;
    pointsToWin?: number;
    setsPerMatch?: number;
    visibility?: string;
  };
  dateLabel: string | undefined;
  isCancelled: boolean;
  canManageTournament: boolean;
  showMeta?: boolean;
  organizerMenuItems: OrganizerMenuItem[];
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

      {showMeta || canManageTournament ? (
        <View style={headerTopRowStyle as never}>
          {showMeta ? (
            <View style={dateLocationLeftStyle as never}>
              <View style={dateLocationRowStyle as never}>
                <Ionicons name="location-outline" size={16} color={Colors.textMuted} />
                {tournament.location?.trim() ? (
                  <Pressable
                    onPress={() => openVenueInMaps(tournament.location!.trim())}
                    accessibilityRole="link"
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <Text
                      style={[locationStyle as never, { color: Colors.yellow, textDecorationLine: 'underline' }]}
                      numberOfLines={2}
                    >
                      {tournament.location.trim()}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={locationStyle as never}>—</Text>
                )}
                <Text style={dateLocationSepStyle as never}>·</Text>
                <Text style={dateStyle as never}>{formatTournamentDate(dateLabel) || '—'}</Text>
              </View>

              <Text style={matchRulesTextStyle as never}>
                {t('tournaments.pointsToWin')}: {tournament.pointsToWin ?? 21} · {t('tournaments.setsPerMatch')}: {tournament.setsPerMatch ?? 1}
              </Text>
            </View>
          ) : (
            <View />
          )}

          {canManageTournament ? (
            <View style={headerTopActionsStyle as never}>
              <TournamentOrganizerMenu menuLabel={t('tournamentDetail.actionsMenu')} items={organizerMenuItems} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

