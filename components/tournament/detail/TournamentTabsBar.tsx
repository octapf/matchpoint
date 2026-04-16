import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { TournamentDivision } from '@/types';
import Colors from '@/constants/Colors';
import { useTheme } from '@/lib/theme/useTheme';

export type TournamentTabId = 'players' | 'teams' | 'groups' | 'bets' | 'fixture';

export function TournamentTabsBar({
  t,
  availableDivisions,
  currentDivision,
  onSelectDivision,
  divisionActionNode,
  matchProgress,
  activeTab,
  onSelectTab,
  tabConfig,
  tabValueById,
  tabsSectionStyle,
  divisionTabBarStyle,
  divisionTabStyle,
  divisionTabSelectedStyle,
  divisionTabLabelStyle,
  divisionTabLabelSelectedStyle,
  progressWrapStyle,
  progressTrackStyle,
  progressFillStyle,
  progressLabelStyle,
  tabBarStyle,
  tabItemStyle,
  tabItemSelectedStyle,
  waitingListMarkStyle,
  tabValueStyle,
  tabLabelStyle,
  tabLabelSelectedStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  availableDivisions: TournamentDivision[];
  currentDivision: TournamentDivision;
  onSelectDivision: (division: TournamentDivision) => void;
  divisionActionNode?: React.ReactNode;
  matchProgress: { total: number; completed: number; ratio: number } | null;
  activeTab: TournamentTabId;
  onSelectTab: (tab: TournamentTabId) => void;
  tabConfig: { id: TournamentTabId; icon: string; labelKey: string }[];
  tabValueById: Partial<Record<TournamentTabId, string>>;
  tabsSectionStyle: unknown;
  divisionTabBarStyle: unknown;
  divisionTabStyle: unknown;
  divisionTabSelectedStyle: unknown;
  divisionTabLabelStyle: unknown;
  divisionTabLabelSelectedStyle: unknown;
  progressWrapStyle: unknown;
  progressTrackStyle: unknown;
  progressFillStyle: unknown;
  progressLabelStyle: unknown;
  tabBarStyle: unknown;
  tabItemStyle: unknown;
  tabItemSelectedStyle: unknown;
  waitingListMarkStyle: unknown;
  tabValueStyle: unknown;
  tabLabelStyle: unknown;
  tabLabelSelectedStyle: unknown;
}) {
  const { tokens } = useTheme();
  return (
    <View style={tabsSectionStyle as never}>
      <View style={divisionTabBarStyle as never} accessibilityRole="tablist">
        {availableDivisions.map((division) => {
          const selected = currentDivision === division;
          const label =
            division === 'men'
              ? t('tournaments.divisionMen')
              : division === 'women'
                ? t('tournaments.divisionWomen')
                : t('tournaments.divisionMixed');
          return (
            <Pressable
              key={division}
              style={[divisionTabStyle as never, selected ? (divisionTabSelectedStyle as never) : null]}
              onPress={() => onSelectDivision(division)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  divisionTabLabelStyle as never,
                  selected ? (divisionTabLabelSelectedStyle as never) : null,
                  selected ? ({ color: tokens.accentSecondary } as never) : null,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[tabBarStyle as never, { flexDirection: 'column' } as never]}>
        {divisionActionNode ? <View style={{ marginBottom: 10 }}>{divisionActionNode}</View> : null}
        <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="tablist">
          {tabConfig.map(({ id: tabId, icon, labelKey }) => {
            const selected = activeTab === tabId;
            const tabValue = tabValueById[tabId] ?? '';
            const tabValueColor = selected ? tokens.tabIconSelected : Colors.textMuted;
            const tabIconColor = selected ? tokens.tabIconSelected : Colors.tabIconDefault;
            const tabLabelColorOverride = selected ? tokens.tabIconSelected : undefined;

            return (
              <Pressable
                key={tabId}
                style={[tabItemStyle as never, selected ? (tabItemSelectedStyle as never) : null]}
                onPress={() => onSelectTab(tabId)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                {tabId === 'fixture' ? (
                  <MaterialCommunityIcons name="volleyball" size={22} color={tabIconColor} />
                ) : (
                  <Ionicons name={icon as never} size={22} color={tabIconColor} />
                )}

                {tabValue ? <Text style={[tabValueStyle as never, { color: tabValueColor } as never]}>{tabValue}</Text> : null}

                <Text
                  style={[
                    tabLabelStyle as never,
                    selected && !tabLabelColorOverride ? (tabLabelSelectedStyle as never) : null,
                    tabLabelColorOverride ? ({ color: tabLabelColorOverride } as never) : null,
                  ]}
                  numberOfLines={1}
                >
                  {t(labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeTab === 'fixture' && matchProgress ? (
          <View style={[progressWrapStyle as never, { marginTop: 8, marginBottom: 10 } as never]} accessibilityRole="text">
            <Text style={[progressLabelStyle as never, { color: tokens.accent } as never]}>
              {t('tournamentDetail.progressLabel', { done: matchProgress.completed, total: matchProgress.total })}
            </Text>
            <View style={progressTrackStyle as never}>
              <View
                style={[
                  progressFillStyle as never,
                  { backgroundColor: tokens.accent } as never,
                  { width: `${Math.round(matchProgress.ratio * 100)}%` },
                ]}
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

