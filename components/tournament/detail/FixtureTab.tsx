import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, Easing } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import type { Team } from '@/types';
import Colors from '@/constants/Colors';

const BRONZE = '#cd7f32';

/** Subtle breathe on the “live” match icon so it feels in progress */
function LiveMatchStatusIcon({ color, size }: { color: string; size: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.18,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.82,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name="radio-button-on" size={size} color={color} />
    </Animated.View>
  );
}

type MatchCategoryTab = 'Gold' | 'Silver' | 'Bronze';
type MatchSubTab = 'live' | 'classification' | MatchCategoryTab;

type MatchRow = {
  id: string;
  teamA: Team;
  teamB: Team;
  setsWonA: number;
  setsWonB: number;
  /** Final / current rally points (shown in list); not set wins */
  pointsA: number;
  pointsB: number;
  winnerId: string;
  status?: 'scheduled' | 'in_progress' | 'completed';
  orderIndex?: number;
  scheduledAt?: string;
  createdAt?: string;
};

export function FixtureTab({
  t,
  matchCategoryTabs,
  selectedMatchesSubtab,
  onSelectSubtab,
  classificationCounts,
  liveMatches,
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
  /** Matches with status `in_progress` for the current division (classification + category). */
  liveMatches: MatchRow[];
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
  const sortMatches = (rows: MatchRow[]) => {
    return [...rows].sort((a, b) => {
      const ao = typeof a.orderIndex === 'number' ? a.orderIndex : Number.POSITIVE_INFINITY;
      const bo = typeof b.orderIndex === 'number' ? b.orderIndex : Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      const as = a.scheduledAt ? Date.parse(a.scheduledAt) : Number.POSITIVE_INFINITY;
      const bs = b.scheduledAt ? Date.parse(b.scheduledAt) : Number.POSITIVE_INFINITY;
      if (as !== bs) return as - bs;
      const ac = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bc = b.createdAt ? Date.parse(b.createdAt) : 0;
      return ac - bc;
    });
  };

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
            {m.pointsA} - {m.pointsB}
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
              <LiveMatchStatusIcon color={statusColor} size={14} />
            ) : (
              <Ionicons name="time-outline" size={14} color={statusColor} />
            )}
          </View>

          {/* Row is already clickable; no redundant edit icon */}
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
          const label =
            tab === 'live'
              ? t('tournamentDetail.matchesLiveTab')
              : tab === 'classification'
                ? t('tournamentDetail.matchesClassification')
                : '';
          // Text tabs need more room; medal icon tabs stay compact.
          const flexWeight = tab === 'classification' ? 2.75 : tab === 'live' ? 1.25 : 0.48;
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
              {tab === 'live' || tab === 'classification' ? (
                <Text
                  style={[matchesSubtabLabelStyle as never, selected ? (matchesSubtabLabelSelectedStyle as never) : null]}
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {label}
                </Text>
              ) : (
                <MaterialCommunityIcons name="medal-outline" size={15} color={medalColor} />
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

      {selectedMatchesSubtab === 'live' ? (
        <>
          <View style={{ paddingTop: 10, paddingBottom: 6 }}>
            <Text style={classificationCountsTextStyle as never}>
              {t('tournamentDetail.matchesLiveCount', { n: liveMatches.length })}
            </Text>
          </View>
          {liveMatches.length === 0 ? (
            <Text style={emptyTextStyle as never}>{t('tournamentDetail.noLiveMatches')}</Text>
          ) : (
            <View style={groupBlockStyle as never}>
              <FlashList
                data={sortMatches(liveMatches)}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => renderMatchRow(item) as never}
              />
            </View>
          )}
        </>
      ) : selectedMatchesSubtab === 'classification' ? (
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
                  data={sortMatches(groupData.matches)}
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
                data={sortMatches((categoryMatchesByCategory[selectedMatchesSubtab as MatchCategoryTab] ?? []) as MatchRow[])}
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
                        data={[...categoryRows]}
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

