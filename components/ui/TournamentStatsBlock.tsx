import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { useTheme } from '@/lib/theme/useTheme';

type TournamentStatsBlockProps = {
  currentPlayers: number;
  totalPlayers: number;
  currentTeams: number;
  totalTeams: number;
  currentGroups: number;
  totalGroups: number;
  /** Players on the waiting list (full tournaments). */
  waitlistCount: number;
  muted?: boolean;
  /** Smaller type for list cards. */
  compact?: boolean;
  /** One row of stats (e.g. tournament detail); default is a vertical stack for list cards. */
  horizontal?: boolean;
  /** Show labels below values (used on tournament list cards). */
  showLabels?: boolean;
  /** Optional override for label/value text color (e.g. match tournament name). */
  textColor?: string;
};

export function TournamentStatsBlock({
  currentPlayers,
  totalPlayers,
  currentTeams,
  totalTeams,
  currentGroups,
  totalGroups,
  waitlistCount,
  muted,
  compact,
  horizontal,
  showLabels,
  textColor,
}: TournamentStatsBlockProps) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const iconSize = compact ? 14 : 16;
  /** Same width for every row so glyphs + “WL” line up with the value column. */
  const iconColWidth = compact ? 18 : 20;
  const accent = muted ? Colors.textSecondary : tokens.accent;
  const waitlistColor = muted ? Colors.textSecondary : tokens.accentSecondary;
  const lineStyle = [styles.line, compact && styles.lineCompact, muted && styles.lineMuted];
  const iconColStyle = [styles.iconCol, { width: iconColWidth, minHeight: iconSize }];

  if (horizontal) {
    const cellLine = [styles.hCellLine, compact && styles.lineCompact, muted && styles.lineMuted];
    const labelStyle = [styles.hCellLabel, compact && styles.hCellLabelCompact, muted && styles.hCellLabelMuted];
    const baseTextColor = muted ? Colors.textSecondary : (textColor ?? Colors.textSecondary);
    const wlTextColor = baseTextColor;
    return (
      <View style={styles.wrapHorizontal}>
        <View
          style={styles.hCell}
          accessibilityRole="text"
          accessibilityLabel={t('tournaments.statsPlayers', { current: currentPlayers, total: totalPlayers })}
        >
          <Ionicons name="people-outline" size={iconSize} color={accent} />
          {showLabels ? (
            <Text style={[labelStyle, { color: baseTextColor }]} numberOfLines={1}>
              {t('tournamentDetail.tabPlayers')}
            </Text>
          ) : null}
          <Text style={[cellLine, { color: baseTextColor }]}>
            {currentPlayers}/{totalPlayers}
          </Text>
        </View>
        <View
          style={styles.hCell}
          accessibilityRole="text"
          accessibilityLabel={t('tournaments.statsTeams', { current: currentTeams, total: totalTeams })}
        >
          <Ionicons name="shield-outline" size={iconSize} color={accent} />
          {showLabels ? (
            <Text style={[labelStyle, { color: baseTextColor }]} numberOfLines={1}>
              {t('tournamentDetail.tabTeams')}
            </Text>
          ) : null}
          <Text style={[cellLine, { color: baseTextColor }]}>
            {currentTeams}/{totalTeams}
          </Text>
        </View>
        <View
          style={styles.hCell}
          accessibilityRole="text"
          accessibilityLabel={t('tournaments.statsGroups', { current: currentGroups, total: totalGroups })}
        >
          <Ionicons name="grid-outline" size={iconSize} color={accent} />
          {showLabels ? (
            <Text style={[labelStyle, { color: baseTextColor }]} numberOfLines={1}>
              {t('tournamentDetail.tabGroups')}
            </Text>
          ) : null}
          <Text style={[cellLine, { color: baseTextColor }]}>
            {currentGroups}/{totalGroups}
          </Text>
        </View>
        <View
          style={styles.hCell}
          accessibilityRole="text"
          accessibilityLabel={t('tournaments.statsWaitlist', { count: waitlistCount })}
        >
          <Text style={[styles.wlIconText, { fontSize: iconSize, lineHeight: iconSize, color: accent }]} numberOfLines={1}>
            WL
          </Text>
          {showLabels ? (
            <Text style={[labelStyle, { color: wlTextColor }]} numberOfLines={1}>
              {t('tournamentDetail.tabWaitingList')}
            </Text>
          ) : null}
          <Text style={[cellLine, { color: wlTextColor }]}>{waitlistCount}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View
        style={styles.row}
        accessibilityRole="text"
        accessibilityLabel={t('tournaments.statsPlayers', { current: currentPlayers, total: totalPlayers })}
      >
        <View style={iconColStyle}>
          <Ionicons name="people-outline" size={iconSize} color={accent} />
        </View>
        <Text style={lineStyle}>
          {currentPlayers}/{totalPlayers}
        </Text>
      </View>
      <View
        style={styles.row}
        accessibilityRole="text"
        accessibilityLabel={t('tournaments.statsTeams', { current: currentTeams, total: totalTeams })}
      >
        <View style={iconColStyle}>
          <Ionicons name="shield-outline" size={iconSize} color={accent} />
        </View>
        <Text style={lineStyle}>
          {currentTeams}/{totalTeams}
        </Text>
      </View>
      <View
        style={styles.row}
        accessibilityRole="text"
        accessibilityLabel={t('tournaments.statsGroups', { current: currentGroups, total: totalGroups })}
      >
        <View style={iconColStyle}>
          <Ionicons name="grid-outline" size={iconSize} color={accent} />
        </View>
        <Text style={lineStyle}>
          {currentGroups}/{totalGroups}
        </Text>
      </View>
      <View
        style={styles.row}
        accessibilityRole="text"
        accessibilityLabel={t('tournaments.statsWaitlist', { count: waitlistCount })}
      >
        <View style={iconColStyle}>
          <Text style={[styles.wlMark, compact && styles.wlMarkCompact, { color: waitlistColor }]}>
            WL
          </Text>
        </View>
        <Text style={[lineStyle, { color: muted ? Colors.textSecondary : tokens.accentSecondary }]}>{waitlistCount}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  wrapHorizontal: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 4,
    width: '100%',
  },
  hCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
  },
  hCellLine: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  hCellLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  hCellLabelCompact: {
    fontSize: 10,
  },
  hCellLabelMuted: {
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconCol: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  line: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  wlMark: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  wlIconText: {
    fontWeight: '700',
    textAlign: 'center',
  },
  wlMarkCompact: {
    fontSize: 9,
  },
  lineCompact: {
    fontSize: 12,
    fontWeight: '600',
  },
  lineMuted: {
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});
