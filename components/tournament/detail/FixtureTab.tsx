import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import type { Team } from '@/types';
import Colors from '@/constants/Colors';

const BRONZE = '#cd7f32';

type MatchCategoryTab = 'Gold' | 'Silver' | 'Bronze';
type MatchSubTab = 'classification' | MatchCategoryTab;

type MatchRow = {
  id: string;
  teamA: Team;
  teamB: Team;
  setsWonA: number;
  setsWonB: number;
  winnerId: string;
  status?: 'scheduled' | 'in_progress' | 'completed';
};

export function FixtureTab({
  t,
  matchCategoryTabs,
  selectedMatchesSubtab,
  onSelectSubtab,
  classificationCounts,
  classificationData,
  categoryMatchesByCategory,
  onOpenMatch,
  canQuickEditMatches,
  emptyTextStyle,
  classificationCountsTextStyle,
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
  classificationCounts: { total: number; completed: number } | null;
  classificationData: {
    matches: MatchRow[];
    standings: { team: Team; wins: number; points: number }[];
    categories: Partial<Record<MatchCategoryTab, { team: Team; wins: number; points: number }[]>>;
  }[];
  categoryMatchesByCategory: Partial<Record<MatchCategoryTab, MatchRow[]>>;
  onOpenMatch?: (matchId: string) => void;
  canQuickEditMatches?: boolean;
  emptyTextStyle: unknown;
  classificationCountsTextStyle: unknown;
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
  const renderMatchRow = (m: MatchRow) => {
    const statusLabel =
      m.status === 'completed'
        ? t('tournamentDetail.statusCompleted')
        : m.status === 'in_progress'
          ? t('tournamentDetail.statusInProgress')
          : t('tournamentDetail.statusScheduled');
    const statusBg =
      m.status === 'completed'
        ? 'rgba(34,197,94,0.15)'
        : m.status === 'in_progress'
          ? 'rgba(250,204,21,0.16)'
          : 'rgba(148,163,184,0.12)';
    const statusBorder =
      m.status === 'completed'
        ? 'rgba(34,197,94,0.35)'
        : m.status === 'in_progress'
          ? 'rgba(250,204,21,0.35)'
          : 'rgba(148,163,184,0.25)';
    const statusColor =
      m.status === 'completed' ? '#22c55e' : m.status === 'in_progress' ? Colors.yellow : Colors.textMuted;

    const content = (
      <View style={matchRowStyle as never}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: 999,
              backgroundColor: statusBg,
              borderWidth: 1,
              borderColor: statusBorder,
            }}
          >
            {m.status === 'completed' ? (
              <Ionicons name="checkmark" size={14} color={statusColor} />
            ) : m.status === 'in_progress' ? (
              <Ionicons name="play" size={14} color={statusColor} />
            ) : (
              <Text style={{ fontSize: 10, fontWeight: '800', color: statusColor, textTransform: 'uppercase' }}>{statusLabel}</Text>
            )}
          </View>

          {canQuickEditMatches && onOpenMatch ? (
            <Pressable
              onPress={() => onOpenMatch(m.id)}
              accessibilityRole="button"
              accessibilityLabel={t('tournamentDetail.editMatch')}
              hitSlop={10}
            >
              <Ionicons name="create-outline" size={16} color={Colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );

    if (!onOpenMatch) return <View key={m.id}>{content}</View>;
    return (
      <Pressable key={m.id} onPress={() => onOpenMatch(m.id)} accessibilityRole="button">
        {content}
      </Pressable>
    );
  };

  return (
    <View>
      <View style={matchesSubtabBarStyle as never}>
        {matchCategoryTabs.map((tab) => {
          const selected = selectedMatchesSubtab === tab;
          const label = tab === 'classification' ? t('tournamentDetail.matchesClassification') : '';
          // Give "Classification" more space; medal tabs can be narrower.
          const flexWeight = tab === 'classification' ? 2.4 : 0.7;
          const medalColor =
            tab === 'Gold' ? Colors.yellow : tab === 'Silver' ? Colors.textSecondary : tab === 'Bronze' ? BRONZE : Colors.textMuted;
          return (
            <Pressable
              key={tab}
              style={[
                matchesSubtabItemStyle as never,
                ({ flex: flexWeight } as never),
                selected ? (matchesSubtabItemSelectedStyle as never) : null,
              ]}
              onPress={() => onSelectSubtab(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              {tab === 'classification' ? (
                <Text
                  style={[matchesSubtabLabelStyle as never, selected ? (matchesSubtabLabelSelectedStyle as never) : null]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              ) : (
                <MaterialCommunityIcons name="medal-outline" size={18} color={medalColor} />
              )}
            </Pressable>
          );
        })}
      </View>

      {classificationCounts ? (
        <View style={{ paddingTop: 10, paddingBottom: 6 }}>
          <Text style={classificationCountsTextStyle as never}>
            {classificationCounts.completed}/{classificationCounts.total} {t('tournamentDetail.matchesCompleted')}
          </Text>
        </View>
      ) : null}

      {selectedMatchesSubtab === 'classification' ? (
        classificationData.length === 0 ? (
          <Text style={emptyTextStyle as never}>{t('tournamentDetail.fixturePlaceholder')}</Text>
        ) : (
          <>
          <FlashList
            data={classificationData}
            keyExtractor={(_g, gi) => `class-group-${gi}`}
            renderItem={({ item: groupData, index: gi }) => (
              <View style={groupBlockStyle as never}>
                <Text style={groupHeadingStyle as never}>{t('tournamentDetail.groupTitle', { n: gi + 1 })}</Text>
                <FlashList
                  data={groupData.matches}
                  keyExtractor={(m) => m.id}
                  renderItem={({ item }) => renderMatchRow(item) as never}
                />
              </View>
            )}
          />
          </>
        )
      ) : (
        <>
          {(categoryMatchesByCategory[selectedMatchesSubtab as MatchCategoryTab] ?? []).length > 0 ? (
            <View style={groupBlockStyle as never}>
              <FlashList
                data={(categoryMatchesByCategory[selectedMatchesSubtab as MatchCategoryTab] ?? []) as MatchRow[]}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => renderMatchRow(item) as never}
              />
            </View>
          ) : (
            <FlashList
              data={classificationData}
              keyExtractor={(_g, gi) => `cat-group-${selectedMatchesSubtab}-${gi}`}
              renderItem={({ item: groupData, index: gi }) => {
                const categoryRows = groupData.categories[selectedMatchesSubtab as MatchCategoryTab] ?? [];
                return (
                  <View style={groupBlockStyle as never}>
                    <Text style={groupHeadingStyle as never}>{t('tournamentDetail.groupTitle', { n: gi + 1 })}</Text>
                    {categoryRows.length === 0 ? (
                      <Text style={emptyGroupStyle as never}>{t('tournamentDetail.noTeamsInGroup')}</Text>
                    ) : (
                      <FlashList
                        data={categoryRows}
                        keyExtractor={(row, idx) => `${row.team._id}-${idx}`}
                        renderItem={({ item: row, index: idx }) => (
                          <View style={matchStandingRowStyle as never}>
                            <Text style={matchStandingRankStyle as never}>#{idx + 1}</Text>
                            <Text style={matchStandingTeamStyle as never}>{row.team.name}</Text>
                            <Text style={matchStandingMetaStyle as never}>
                              {row.wins}W · {row.points}pts
                            </Text>
                          </View>
                        )}
                      />
                    )}
                  </View>
                );
              }}
            />
          )}
        </>
      )}
    </View>
  );
}

