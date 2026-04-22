import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, ScrollView, StyleSheet } from 'react-native';
import type { TournamentBettingSnapshot, TournamentBettingMatchRow, User } from '@/types';
import Colors from '@/constants/Colors';
import { Avatar } from '@/components/ui/Avatar';
import { getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import { useTheme } from '@/lib/theme/useTheme';

export function BetsTab({
  t,
  snapshot,
  userMap,
  currentUserId,
  canBet,
  onPlaceWinner,
  onPlaceScore,
  placePending,
  emptyTextStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  snapshot: TournamentBettingSnapshot | null | undefined;
  userMap: Record<string, User>;
  currentUserId: string | null;
  canBet: boolean;
  onPlaceWinner: (matchId: string, teamId: string) => void;
  onPlaceScore: (matchId: string, pointsA: number, pointsB: number) => void;
  placePending: boolean;
  emptyTextStyle: unknown;
}) {
  const { tokens } = useTheme();
  const fg = Colors.text;
  const fgMuted = Colors.textMuted;
  const [scoreDraft, setScoreDraft] = useState<Record<string, { a: string; b: string }>>({});

  const leaderboard = snapshot?.leaderboard ?? [];

  const myLinesByMatch = useMemo(() => {
    if (!currentUserId || !snapshot?.matches) return new Map<string, { winner?: boolean; score?: boolean }>();
    const m = new Map<string, { winner?: boolean; score?: boolean }>();
    for (const row of snapshot.matches) {
      const lines = row.lines ?? [];
      const mine = lines.filter((l) => l.userId === currentUserId);
      m.set(row.matchId, {
        winner: mine.some((x) => x.kind === 'winner'),
        score: mine.some((x) => x.kind === 'score'),
      });
    }
    return m;
  }, [snapshot?.matches, currentUserId]);

  const pickWinner = useCallback(
    (row: TournamentBettingMatchRow) => {
      Alert.alert(
        t('tournamentDetail.bettingPickWinnerTitle'),
        undefined,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: row.teamAName,
            onPress: () => onPlaceWinner(row.matchId, row.teamAId),
          },
          {
            text: row.teamBName,
            onPress: () => onPlaceWinner(row.matchId, row.teamBId),
          },
        ],
        { cancelable: true }
      );
    },
    [onPlaceWinner, t]
  );

  const submitScore = useCallback(
    (row: TournamentBettingMatchRow) => {
      const d = scoreDraft[row.matchId] ?? { a: '', b: '' };
      const pa = Math.floor(Number(d.a));
      const pb = Math.floor(Number(d.b));
      if (!Number.isFinite(pa) || !Number.isFinite(pb) || pa < 0 || pb < 0) {
        Alert.alert(t('common.error'), t('tournamentDetail.bettingInvalidScore'));
        return;
      }
      onPlaceScore(row.matchId, pa, pb);
    },
    [onPlaceScore, scoreDraft, t]
  );

  if (!snapshot?.bettingEnabled) {
    return <Text style={emptyTextStyle as never}>{t('tournamentDetail.bettingDisabled')}</Text>;
  }

  return (
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={[styles.sectionTitle, { color: fg }]}>{t('tournamentDetail.bettingLeaderboard')}</Text>
      {leaderboard.length === 0 ? (
        <Text style={[styles.muted, { color: Colors.textMuted }]}>{t('tournamentDetail.bettingNoLeaderboardYet')}</Text>
      ) : (
        leaderboard.map((row, i) => {
          const u = userMap[row.userId];
          const name = getTournamentPlayerDisplayName(u) || t('common.player');
          return (
            <View key={row.userId} style={[styles.lbRow, { borderColor: tokens.border }]}>
              <Text style={[styles.lbRank, { color: fgMuted }]}>{i + 1}</Text>
              <Avatar
                firstName={u?.firstName ?? ''}
                lastName={u?.lastName ?? ''}
                gender={u?.gender === 'male' || u?.gender === 'female' ? u.gender : undefined}
                size="xs"
                photoUrl={u?.photoUrl}
              />
              <Text style={[styles.lbName, { color: fg }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.lbPts, { color: tokens.accent }]}>{row.points}</Text>
              {(row.picksCount ?? 0) > 0 ? (
                <Text style={[styles.lbPicks, { color: fgMuted }]} numberOfLines={1}>
                  {' · '}
                  {t('tournamentDetail.bettingLeaderboardPicks', { count: row.picksCount ?? 0 })}
                </Text>
              ) : null}
              <Text style={[styles.lbEx, { color: fgMuted }]}>({row.exactHits})</Text>
            </View>
          );
        })
      )}

      <Text style={[styles.sectionTitle, { marginTop: 20, color: fg }]}>
        {t('tournamentDetail.bettingMatches')}
      </Text>
      {(snapshot.matches ?? []).map((row) => (
        <MatchBetCard
          key={row.matchId}
          row={row}
          userMap={userMap}
          t={t}
          fg={fg}
          fgMuted={fgMuted}
          tokens={tokens}
          my={myLinesByMatch.get(row.matchId)}
          canBet={canBet && snapshot.bettingEnabled}
          allowWinner={snapshot.bettingAllowWinner}
          allowScore={snapshot.bettingAllowScore}
          placePending={placePending}
          scoreDraft={scoreDraft[row.matchId] ?? { a: '', b: '' }}
          onScoreDraftChange={(a, b) => setScoreDraft((prev) => ({ ...prev, [row.matchId]: { a, b } }))}
          onPickWinner={() => pickWinner(row)}
          onSubmitScore={() => submitScore(row)}
        />
      ))}
    </ScrollView>
  );
}

function MatchBetCard({
  row,
  userMap,
  t,
  fg,
  fgMuted,
  tokens,
  my,
  canBet,
  allowWinner,
  allowScore,
  placePending,
  scoreDraft,
  onScoreDraftChange,
  onPickWinner,
  onSubmitScore,
}: {
  row: TournamentBettingMatchRow;
  userMap: Record<string, User>;
  t: (key: string, options?: Record<string, string | number>) => string;
  fg: string;
  fgMuted: string;
  tokens: { border: string; accent: string };
  my?: { winner?: boolean; score?: boolean };
  canBet: boolean;
  allowWinner: boolean;
  allowScore: boolean;
  placePending: boolean;
  scoreDraft: { a: string; b: string };
  onScoreDraftChange: (a: string, b: string) => void;
  onPickWinner: () => void;
  onSubmitScore: () => void;
}) {
  const scheduled = row.status === 'scheduled';
  const live = row.status === 'in_progress';
  const done = row.status === 'completed';
  const pctA = row.winnerPctA;
  const pctB = row.winnerPctB;
  const showPctBar = live && pctA != null && pctB != null;

  return (
    <View style={[styles.card, { borderColor: tokens.border }]}>
      <Text style={[styles.matchTitle, { color: fg }]} numberOfLines={2}>
        {row.teamAName} vs {row.teamBName}
      </Text>
      <Text style={[styles.status, { color: fgMuted }]}>
        {done
          ? t('tournamentDetail.bettingStatusDone')
          : live
            ? t('tournamentDetail.bettingStatusLive')
            : t('tournamentDetail.bettingStatusScheduled')}
      </Text>

      {showPctBar ? (
        <View style={styles.pctRow}>
          <View style={[styles.pctBar, { backgroundColor: tokens.border }]}>
            <View style={[styles.pctFillA, { flex: pctA ?? 0, backgroundColor: tokens.accent }]} />
            <View style={[styles.pctFillB, { flex: pctB ?? 0, backgroundColor: Colors.textMuted }]} />
          </View>
          <Text style={[styles.pctLabel, { color: fgMuted }]}>
            {Math.round((pctA ?? 0) * 100)}% — {Math.round((pctB ?? 0) * 100)}%
          </Text>
        </View>
      ) : live && (pctA == null || pctB == null) ? (
        <Text style={[styles.muted, { color: fgMuted }]}>{t('tournamentDetail.bettingNoCrowdData')}</Text>
      ) : null}

      {row.lines && row.lines.length > 0 ? (
        <View style={styles.lines}>
          {row.lines.map((ln, idx) => {
            const nu = userMap[ln.userId];
            const label = getTournamentPlayerDisplayName(nu) || `…${ln.userId.slice(-4)}`;
            const pickName =
              ln.kind === 'winner'
                ? ln.pickWinnerTeamId === row.teamAId
                  ? row.teamAName
                  : row.teamBName
                : `${ln.pickPointsA}-${ln.pickPointsB}`;
            return (
              <Text key={`${ln.userId}-${ln.kind}-${idx}`} style={[styles.line, { color: fg }]}>
                {ln.kind === 'winner' ? `${label} → ${pickName}` : `${label} ${pickName}`}
                {done ? ` (${ln.pointsAwarded ?? 0} pts)` : ''}
              </Text>
            );
          })}
        </View>
      ) : null}

      {scheduled && canBet ? (
        <View style={styles.actions}>
          {allowWinner && !my?.winner ? (
            <Pressable
              style={[styles.btn, { backgroundColor: tokens.accent }]}
              onPress={onPickWinner}
              disabled={placePending}
            >
              <Text style={styles.btnText}>{t('tournamentDetail.bettingPickWinner')}</Text>
            </Pressable>
          ) : null}
          {allowScore && !my?.score ? (
            <View style={styles.scoreRow}>
              <TextInput
                style={[styles.input, { borderColor: tokens.border, color: fg }]}
                keyboardType="number-pad"
                placeholder={t('tournamentDetail.bettingScorePlaceholderSideA')}
                placeholderTextColor={fgMuted}
                value={scoreDraft.a}
                onChangeText={(a) => onScoreDraftChange(a, scoreDraft.b)}
              />
              <Text style={{ color: fg }}>-</Text>
              <TextInput
                style={[styles.input, { borderColor: tokens.border, color: fg }]}
                keyboardType="number-pad"
                placeholder={t('tournamentDetail.bettingScorePlaceholderSideB')}
                placeholderTextColor={fgMuted}
                value={scoreDraft.b}
                onChangeText={(b) => onScoreDraftChange(scoreDraft.a, b)}
              />
              <Pressable
                style={[styles.btn, { backgroundColor: tokens.accent }]}
                onPress={onSubmitScore}
                disabled={placePending}
              >
                <Text style={styles.btnText}>{t('tournamentDetail.bettingSaveScore')}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  muted: { fontSize: 13, marginBottom: 8 },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lbRank: { width: 22, fontSize: 14 },
  lbName: { flex: 1, fontSize: 14 },
  lbPts: { fontSize: 14, fontWeight: '700' },
  lbPicks: { fontSize: 12, fontWeight: '600', maxWidth: 120 },
  lbEx: { fontSize: 12 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  matchTitle: { fontSize: 15, fontWeight: '600' },
  status: { fontSize: 12, marginTop: 4 },
  pctRow: { marginTop: 8 },
  pctBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  pctFillA: { minWidth: 2 },
  pctFillB: { minWidth: 2 },
  pctLabel: { fontSize: 11, marginTop: 4 },
  lines: { marginTop: 8, gap: 4 },
  line: { fontSize: 12 },
  actions: { marginTop: 10, gap: 8 },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  input: {
    borderWidth: 1,
    width: 52,
    padding: 8,
    borderRadius: 6,
  },
});
