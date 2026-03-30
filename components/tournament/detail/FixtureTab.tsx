import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Team } from '@/types';

type MatchCategoryTab = 'Gold' | 'Silver' | 'Bronze';
type MatchSubTab = 'classification' | MatchCategoryTab;

export function FixtureTab({
  t,
  matchCategoryTabs,
  selectedMatchesSubtab,
  onSelectSubtab,
  classificationData,
  emptyTextStyle,
  matchesSubtabBarStyle,
  matchesSubtabItemStyle,
  matchesSubtabItemSelectedStyle,
  matchesSubtabLabelStyle,
  matchesSubtabLabelSelectedStyle,
  groupBlockStyle,
  groupHeadingStyle,
  emptyGroupStyle,
  matchRowStyle,
  matchTeamNameStyle,
  matchWinnerStyle,
  matchScoreStyle,
  matchStandingRowStyle,
  matchStandingRankStyle,
  matchStandingTeamStyle,
  matchStandingMetaStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  matchCategoryTabs: MatchSubTab[];
  selectedMatchesSubtab: MatchSubTab;
  onSelectSubtab: (tab: MatchSubTab) => void;
  classificationData: {
    matches: {
      id: string;
      teamA: Team;
      teamB: Team;
      setsWonA: number;
      setsWonB: number;
      winnerId: string;
    }[];
    standings: { team: Team; wins: number; points: number }[];
    categories: Partial<Record<MatchCategoryTab, { team: Team; wins: number; points: number }[]>>;
  }[];
  emptyTextStyle: unknown;
  matchesSubtabBarStyle: unknown;
  matchesSubtabItemStyle: unknown;
  matchesSubtabItemSelectedStyle: unknown;
  matchesSubtabLabelStyle: unknown;
  matchesSubtabLabelSelectedStyle: unknown;
  groupBlockStyle: unknown;
  groupHeadingStyle: unknown;
  emptyGroupStyle: unknown;
  matchRowStyle: unknown;
  matchTeamNameStyle: unknown;
  matchWinnerStyle: unknown;
  matchScoreStyle: unknown;
  matchStandingRowStyle: unknown;
  matchStandingRankStyle: unknown;
  matchStandingTeamStyle: unknown;
  matchStandingMetaStyle: unknown;
}) {
  return (
    <View>
      <View style={matchesSubtabBarStyle as never}>
        {matchCategoryTabs.map((tab) => {
          const selected = selectedMatchesSubtab === tab;
          const label =
            tab === 'classification'
              ? t('tournamentDetail.matchesClassification')
              : tab === 'Gold'
                ? t('tournaments.categoryGold')
                : tab === 'Silver'
                  ? t('tournaments.categorySilver')
                  : t('tournaments.categoryBronze');
          return (
            <Pressable
              key={tab}
              style={[matchesSubtabItemStyle as never, selected ? (matchesSubtabItemSelectedStyle as never) : null]}
              onPress={() => onSelectSubtab(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[matchesSubtabLabelStyle as never, selected ? (matchesSubtabLabelSelectedStyle as never) : null]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selectedMatchesSubtab === 'classification' ? (
        classificationData.length === 0 ? (
          <Text style={emptyTextStyle as never}>{t('tournamentDetail.fixturePlaceholder')}</Text>
        ) : (
          classificationData.map((groupData, gi) => (
            <View key={`class-group-${gi}`} style={groupBlockStyle as never}>
              <Text style={groupHeadingStyle as never}>{t('tournamentDetail.groupTitle', { n: gi + 1 })}</Text>
              {groupData.matches.map((m) => (
                <View key={m.id} style={matchRowStyle as never}>
                  <Text style={[matchTeamNameStyle as never, m.winnerId === m.teamA._id ? (matchWinnerStyle as never) : null]}>
                    {m.teamA.name}
                  </Text>
                  <Text style={matchScoreStyle as never}>
                    {m.setsWonA} - {m.setsWonB}
                  </Text>
                  <Text style={[matchTeamNameStyle as never, m.winnerId === m.teamB._id ? (matchWinnerStyle as never) : null]}>
                    {m.teamB.name}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )
      ) : (
        classificationData.map((groupData, gi) => {
          const categoryRows = groupData.categories[selectedMatchesSubtab as MatchCategoryTab] ?? [];
          return (
            <View key={`cat-group-${selectedMatchesSubtab}-${gi}`} style={groupBlockStyle as never}>
              <Text style={groupHeadingStyle as never}>{t('tournamentDetail.groupTitle', { n: gi + 1 })}</Text>
              {categoryRows.length === 0 ? (
                <Text style={emptyGroupStyle as never}>{t('tournamentDetail.noTeamsInGroup')}</Text>
              ) : (
                categoryRows.map((row, idx) => (
                  <View key={`${row.team._id}-${idx}`} style={matchStandingRowStyle as never}>
                    <Text style={matchStandingRankStyle as never}>#{idx + 1}</Text>
                    <Text style={matchStandingTeamStyle as never}>{row.team.name}</Text>
                    <Text style={matchStandingMetaStyle as never}>
                      {row.wins}W · {row.points}pts
                    </Text>
                  </View>
                ))
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

