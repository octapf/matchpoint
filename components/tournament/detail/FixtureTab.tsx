import React, { useEffect, useId, useRef } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet, type ViewStyle } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import type { Team, User } from '@/types';
import Colors from '@/constants/Colors';
import { CategoryBracketDiagram, type BracketMatchRow } from '@/components/tournament/detail/CategoryBracketDiagram';
import { buildBracketRowsForCategory, isSyntheticBracketMatchId } from '@/lib/categoryBracketRows';
import {
  bracketRoundTitleDisplay,
  estimateCategoryBracketTeamCount,
  resolveKnockoutRoundHeading,
} from '@/lib/knockoutRoundLabel';

type MatchCategoryTab = 'Gold' | 'Silver' | 'Bronze';
type MatchSubTab = 'live' | 'classification' | MatchCategoryTab;

const BRONZE = '#cd7f32';

const WASH_PEAK: Record<MatchCategoryTab, number> = {
  Gold: 0.28,
  Silver: 0.24,
  Bronze: 0.27,
};

/** Many opacity stops + smooth curve → less banding than few flat steps (esp. Android). */
function washStops(peak: number, stopColor: string, keyPrefix: string) {
  const n = 56;
  const gamma = 2.12;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const op = peak * (1 - t) ** gamma;
    return (
      <Stop
        key={`${keyPrefix}${i}`}
        offset={`${(t * 100).toFixed(4)}%`}
        stopColor={stopColor}
        stopOpacity={op}
      />
    );
  });
}

function CategoryTabContentGradient({ category }: { category: MatchCategoryTab }) {
  const uid = useId().replace(/:/g, '');
  const gradId = `fxCatBg${category}${uid}`;
  const peak = WASH_PEAK[category];
  const color = category === 'Gold' ? Colors.yellow : category === 'Silver' ? '#94a3b8' : BRONZE;
  const prefix = category === 'Gold' ? 'g' : category === 'Silver' ? 's' : 'b';
  return (
    <Svg style={StyleSheet.absoluteFillObject} viewBox="0 0 1 1" preserveAspectRatio="none" pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
          {washStops(peak, color, prefix)}
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={1} height={1} fill={`url(#${gradId})`} />
    </Svg>
  );
}

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

/** Gold/Silver/Bronze labels live under `tournaments`, not `tournamentDetail`. */
function tournamentCategoryI18nKey(cat: MatchCategoryTab): 'tournaments.categoryGold' | 'tournaments.categorySilver' | 'tournaments.categoryBronze' {
  switch (cat) {
    case 'Gold':
      return 'tournaments.categoryGold';
    case 'Silver':
      return 'tournaments.categorySilver';
    case 'Bronze':
      return 'tournaments.categoryBronze';
  }
}

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
  /** Category knockout: server round index (larger = closer to final). */
  bracketRound?: number;
  isBronzeMatch?: boolean;
  advanceTeamAFromMatchId?: string;
  advanceTeamBFromMatchId?: string;
  advanceTeamALoserFromMatchId?: string;
  advanceTeamBLoserFromMatchId?: string;
  /** Live tab only: classification vs category (icon only, no round text) */
  liveStage?: 'classification' | 'category';
  liveCategory?: MatchCategoryTab;
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
  bracketRoundHeadingStyle,
  emptyGroupStyle,
  matchRowStyle,
  matchTeamNameStyle,
  matchWinnerStyle,
  matchScoreStyle,
  matchStandingRowStyle,
  matchStandingRankStyle,
  matchStandingTeamStyle,
  matchStandingMetaStyle,
  teamById,
  userMap,
  tournamentId,
  opponentTbdLabel,
  categoryTeamIdsByCategory,
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
  bracketRoundHeadingStyle: unknown;
  emptyGroupStyle: unknown;
  matchRowStyle: unknown;
  matchTeamNameStyle: unknown;
  matchWinnerStyle: unknown;
  matchScoreStyle: unknown;
  matchStandingRowStyle: unknown;
  matchStandingRankStyle: unknown;
  matchStandingTeamStyle: unknown;
  matchStandingMetaStyle: unknown;
  teamById: Record<string, Team>;
  /** For bracket avatars: profile photos above team names. */
  userMap: Record<string, User>;
  tournamentId: string;
  opponentTbdLabel: string;
  categoryTeamIdsByCategory: Partial<Record<MatchCategoryTab, string[]>>;
}) {
  const safeOpenMatch =
    onOpenMatch &&
    ((mid: string) => {
      if (isSyntheticBracketMatchId(mid)) return;
      onOpenMatch(mid);
    });

  /** When category matches carry bracket metadata, show round headings (still a list — not a drawn tree). */
  const groupCategoryByBracketRound = (rows: MatchRow[], teamCountInCategory: number) => {
    const has = rows.some((r) => typeof r.bracketRound === 'number');
    if (!has || rows.length === 0) return null;
    const mainRows = rows.filter((r) => !r.isBronzeMatch);
    const distinctMainBracketRounds = [
      ...new Set(
        mainRows
          .map((r) => (typeof r.bracketRound === 'number' ? r.bracketRound : 0))
          .filter((br) => br > 0)
      ),
    ].sort((a, b) => a - b);

    const byRound = new Map<number, MatchRow[]>();
    for (const r of rows) {
      const br = typeof r.bracketRound === 'number' ? r.bracketRound : 0;
      const list = byRound.get(br) ?? [];
      list.push(r);
      byRound.set(br, list);
    }
    const ordered = [...byRound.entries()].sort((a, b) => a[0] - b[0]);
    return ordered.map(([round, matchRows]) => {
      const isBronzeGroup = matchRows.some((m) => m.isBronzeMatch);
      if (isBronzeGroup) {
        return {
          round,
          matches: sortMatches(matchRows),
          heading: t('tournamentDetail.bracketBronzeHeading'),
        };
      }
      const idx = distinctMainBracketRounds.indexOf(round);
      const roundIndexFromEnd =
        idx >= 0 ? distinctMainBracketRounds.length - 1 - idx : 0;
      const heading =
        idx < 0
          ? t('tournamentDetail.bracketRoundHeading', { n: round })
          : resolveKnockoutRoundHeading(
              roundIndexFromEnd,
              round,
              teamCountInCategory,
              distinctMainBracketRounds.length,
              t
            );
      return {
        round,
        matches: sortMatches(matchRows),
        heading,
      };
    });
  };

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
    const liveMedalColor =
      m.liveCategory === 'Gold'
        ? Colors.yellow
        : m.liveCategory === 'Silver'
          ? Colors.textSecondary
          : m.liveCategory === 'Bronze'
            ? BRONZE
            : Colors.textMuted;

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

    const liveIcon =
      m.liveStage === 'category' && m.liveCategory ? (
        <MaterialCommunityIcons
          name="medal-outline"
          size={16}
          color={liveMedalColor}
          accessibilityLabel={t(tournamentCategoryI18nKey(m.liveCategory))}
        />
      ) : m.liveStage === 'classification' ? (
        <Ionicons
          name="layers-outline"
          size={15}
          color={Colors.textMuted}
          accessibilityLabel={t('tournamentDetail.matchesClassification')}
        />
      ) : null;

    const content = (
      <View style={matchRowStyle as never}>
        <View
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {liveIcon ? (
            <View style={{ width: 22, alignItems: 'center', justifyContent: 'center' }}>{liveIcon}</View>
          ) : null}
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
        </View>
      </View>
    );

    if (!safeOpenMatch) return <View key={m.id}>{content}</View>;
    return (
      <Pressable key={m.id} onPress={() => safeOpenMatch(m.id)} accessibilityRole="button">
        {content}
      </Pressable>
    );
  };

  const counts = classificationCounts;
  const showClassificationProgress =
    counts != null &&
    selectedMatchesSubtab !== 'Gold' &&
    selectedMatchesSubtab !== 'Silver' &&
    selectedMatchesSubtab !== 'Bronze';

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
              {tab === 'live' ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 1,
                    gap: 4,
                  }}
                >
                  <Text
                    style={[matchesSubtabLabelStyle as never, selected ? (matchesSubtabLabelSelectedStyle as never) : null]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    {label}
                  </Text>
                  <LiveMatchStatusIcon color={Colors.yellow} size={12} />
                </View>
              ) : tab === 'classification' ? (
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

      {showClassificationProgress && counts ? (
        <View style={{ paddingTop: 10, paddingBottom: 6 }}>
          <Text style={classificationCountsTextStyle as never}>
            {counts.completed}/{counts.total} {t('tournamentDetail.matchesCompleted')}
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
        <View style={fixtureCategoryContentShell}>
          <CategoryTabContentGradient category={selectedMatchesSubtab as MatchCategoryTab} />
          <View style={fixtureCategoryContentInner}>
          {(categoryMatchesByCategory[selectedMatchesSubtab as MatchCategoryTab] ?? []).length > 0 ? (
            (() => {
              const tab = selectedMatchesSubtab as MatchCategoryTab;
              const catRows = sortMatches(
                (categoryMatchesByCategory[tab] ?? []) as MatchRow[]
              );
              const mergedRows = buildBracketRowsForCategory(
                catRows,
                categoryTeamIdsByCategory[tab],
                teamById,
                tournamentId,
                opponentTbdLabel
              );
              const idsLen = categoryTeamIdsByCategory[tab]?.filter(Boolean).length ?? 0;
              const teamCountForLabels =
                idsLen >= 2 ? idsLen : estimateCategoryBracketTeamCount(mergedRows as MatchRow[]);
              const bracketGroups = groupCategoryByBracketRound(mergedRows as MatchRow[], teamCountForLabels);
              if (bracketGroups && mergedRows.length > 0) {
                return (
                  <View style={groupBlockStyle as never}>
                    <CategoryBracketDiagram
                      t={t}
                      category={tab}
                      matches={mergedRows as BracketMatchRow[]}
                      userMap={userMap}
                      onOpenMatch={safeOpenMatch ?? undefined}
                    />
                    <View
                      style={{
                        alignSelf: 'stretch',
                        borderTopWidth: 1,
                        borderTopColor: Colors.surfaceLight,
                        marginTop: 4,
                        marginBottom: 12,
                      }}
                    />
                    {bracketGroups.map((g) => (
                      <View key={`br-${g.round}-${g.heading}`} style={{ marginBottom: 14 }}>
                        <Text style={bracketRoundHeadingStyle as never}>{bracketRoundTitleDisplay(g.heading)}</Text>
                        {sortMatches(g.matches).map((m) => (
                          <View key={m.id}>{renderMatchRow(m)}</View>
                        ))}
                      </View>
                    ))}
                  </View>
                );
              }
              return (
                <View style={groupBlockStyle as never}>
                  <FlashList
                    data={catRows}
                    keyExtractor={(m) => m.id}
                    renderItem={({ item }) => renderMatchRow(item) as never}
                  />
                </View>
              );
            })()
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
          </View>
        </View>
      )}
    </View>
  );
}

/** Must match `styles.content` horizontal padding on `app/tournament/[id].tsx` FlashList. */
const TOURNAMENT_CONTENT_PAD = 20;

const fixtureCategoryContentShell: ViewStyle = {
  position: 'relative',
  alignSelf: 'stretch',
  overflow: 'hidden',
  borderRadius: 12,
  marginTop: 2,
  /** Bleed gradient to the full screen width (edge to edge of the scroll). */
  marginHorizontal: -TOURNAMENT_CONTENT_PAD,
};

const fixtureCategoryContentInner: ViewStyle = {
  position: 'relative',
  zIndex: 1,
  paddingHorizontal: TOURNAMENT_CONTENT_PAD,
};

