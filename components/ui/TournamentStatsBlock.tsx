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
    return (
      <View style={styles.wrapHorizontal}>
        <View
          style={styles.hCell}
          accessibilityRole="text"
          accessibilityLabel={t('tournaments.statsPlayers', { current: currentPlayers, total: totalPlayers })}
        >
          <Ionicons name="people-outline" size={iconSize} color={accent} />
          <Text style={cellLine}>
            {currentPlayers}/{totalPlayers}
          </Text>
        </View>
        <View
          style={styles.hCell}
          accessibilityRole="text"
          accessibilityLabel={t('tournaments.statsTeams', { current: currentTeams, total: totalTeams })}
        >
          <Ionicons name="shield-outline" size={iconSize} color={accent} />
          <Text style={cellLine}>
            {currentTeams}/{totalTeams}
          </Text>
        </View>
        <View
          style={styles.hCell}
          accessibilityRole="text"
          accessibilityLabel={t('tournaments.statsGroups', { current: currentGroups, total: totalGroups })}
        >
          <Ionicons name="grid-outline" size={iconSize} color={accent} />
          <Text style={cellLine}>
            {currentGroups}/{totalGroups}
          </Text>
        </View>
        <View
          style={styles.hCell}
          accessibilityRole="text"
          accessibilityLabel={t('tournaments.statsWaitlist', { count: waitlistCount })}
        >
          <Text style={[styles.wlMark, compact && styles.wlMarkCompact, { color: waitlistColor }]}>WL</Text>
          <Text style={[cellLine, { color: muted ? Colors.textSecondary : tokens.accentSecondary }]}>{waitlistCount}</Text>
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
