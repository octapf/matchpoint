import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { TournamentDivision } from '@/types';
import Colors from '@/constants/Colors';

export type TournamentTabId = 'players' | 'teams' | 'groups' | 'waitinglist' | 'fixture';

export function TournamentTabsBar({
  t,
  availableDivisions,
  currentDivision,
  onSelectDivision,
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
              <Text style={[divisionTabLabelStyle as never, selected ? (divisionTabLabelSelectedStyle as never) : null]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[tabBarStyle as never, { flexDirection: 'column' } as never]}>
        {matchProgress ? (
          <View style={[progressWrapStyle as never, { marginTop: 0, marginBottom: 10 } as never]} accessibilityRole="text">
            <View style={progressTrackStyle as never}>
              <View style={[progressFillStyle as never, { width: `${Math.round(matchProgress.ratio * 100)}%` }]} />
            </View>
            <Text style={progressLabelStyle as never}>
              {t('tournamentDetail.progressLabel', { done: matchProgress.completed, total: matchProgress.total })}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="tablist">
          {tabConfig.map(({ id: tabId, icon, labelKey }) => {
            const selected = activeTab === tabId;
            const tabValue = tabValueById[tabId] ?? '';
            const isWaitingListTab = tabId === 'waitinglist';
            const tabValueColor = selected
              ? isWaitingListTab
                ? Colors.violet
                : Colors.tabIconSelected
              : Colors.textMuted;
            const tabIconColor = selected
              ? isWaitingListTab
                ? Colors.violet
                : Colors.tabIconSelected
              : Colors.tabIconDefault;
            const tabLabelColorOverride = selected && isWaitingListTab ? Colors.violet : undefined;

            return (
              <Pressable
                key={tabId}
                style={[tabItemStyle as never, selected ? (tabItemSelectedStyle as never) : null]}
                onPress={() => onSelectTab(tabId)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                {isWaitingListTab ? (
                  <Text style={[waitingListMarkStyle as never, { color: tabIconColor } as never]}>WL</Text>
                ) : tabId === 'fixture' ? (
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
      </View>
    </View>
  );
}

