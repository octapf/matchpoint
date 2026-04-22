import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, Alert } from 'react-native';
import type { TournamentBettingSnapshot, TournamentBettingMatchRow, User } from '@/types';
import Colors from '@/constants/Colors';
import { Avatar } from '@/components/ui/Avatar';
import { getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import { useTheme } from '@/lib/theme/useTheme';

const BET_SCORE_MAX = 35;
const BET_SCORE_CHOICES = Array.from({ length: BET_SCORE_MAX + 1 }, (_, i) => i);

type ScoreBetConstraintContext = {
  allowWinner: boolean;
  winnerTeamId: string | undefined;
  teamAId: string;
  teamBId: string;
};

/** Valid volleyball set-style bet: no tie; if user picked a winner, their side must have the higher score. */
function scoreBetPairIsValid(a: number, b: number, c: ScoreBetConstraintContext): boolean {
  if (a === b) return false;
  if (c.allowWinner && c.winnerTeamId) {
    if (c.winnerTeamId === c.teamAId) return a > b;
    if (c.winnerTeamId === c.teamBId) return b > a;
  }
  return true;
}

/** Options shown in the score modal for one side, given the other side's draft (or null). */
function allowedScoresForPicker(
  side: 'a' | 'b',
  other: number | null,
  c: ScoreBetConstraintContext
): number[] {
  const { allowWinner, winnerTeamId, teamAId, teamBId } = c;
  const max = BET_SCORE_MAX;

  if (allowWinner && winnerTeamId) {
    if (winnerTeamId === teamAId) {
      if (side === 'a') {
        if (other === null) return BET_SCORE_CHOICES.filter((n) => n >= 1);
        return BET_SCORE_CHOICES.filter((n) => n > other);
      }
      if (other === null) return BET_SCORE_CHOICES.filter((n) => n <= max - 1);
      return BET_SCORE_CHOICES.filter((n) => n < other);
    }
    if (winnerTeamId === teamBId) {
      if (side === 'b') {
        if (other === null) return BET_SCORE_CHOICES.filter((n) => n >= 1);
        return BET_SCORE_CHOICES.filter((n) => n > other);
      }
      if (other === null) return BET_SCORE_CHOICES.filter((n) => n <= max - 1);
      return BET_SCORE_CHOICES.filter((n) => n < other);
    }
  }

  if (other === null) return [...BET_SCORE_CHOICES];
  return BET_SCORE_CHOICES.filter((n) => n !== other);
}

type ThemeTokensPublic = ReturnType<typeof useTheme>['tokens'];

function ScorePickerModal({
  visible,
  title,
  closeLabel,
  tokens,
  fg,
  choices,
  emptyHint,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  closeLabel: string;
  tokens: ThemeTokensPublic;
  fg: string;
  choices: number[];
  emptyHint?: string;
  onClose: () => void;
  onSelect: (n: number) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
        <View style={styles.modalSheetWrap} pointerEvents="box-none">
          <View style={[styles.scoreModalSheet, { borderColor: tokens.border, backgroundColor: Colors.background }]}>
          <Text style={[styles.scoreModalTitle, { color: fg }]} numberOfLines={2}>
            {title}
          </Text>
          <ScrollView
            style={styles.scoreModalScroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scoreModalGrid}
          >
            {choices.length === 0 ? (
              <Text style={[styles.scoreModalEmpty, { color: fg }]}>{emptyHint ?? ''}</Text>
            ) : (
              choices.map((n) => (
              <Pressable
                key={n}
                style={({ pressed }) => [
                  styles.scoreChip,
                  { borderColor: tokens.border },
                  pressed ? { backgroundColor: tokens.accentMuted } : null,
                ]}
                onPress={() => {
                  onSelect(n);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={String(n)}
              >
                <Text style={[styles.scoreChipText, { color: fg }]}>{n}</Text>
              </Pressable>
            ))
            )}
          </ScrollView>
          <Pressable
            style={[styles.scoreModalFooter, { borderTopColor: tokens.border }]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={[styles.scoreModalFooterText, { color: fg }]}>{closeLabel}</Text>
          </Pressable>
        </View>
        </View>
      </View>
    </Modal>
  );
}

export function BetsTab({
  t,
  snapshot,
  userMap,
  currentUserId,
  playLockedReason,
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
  /** `not_started` | `paused` show the same lock UX as match detail; `null` = play allowed. */
  playLockedReason: 'not_started' | 'paused' | null;
  canBet: boolean;
  onPlaceWinner: (matchId: string, teamId: string) => void;
  onPlaceScore: (matchId: string, pointsA: number, pointsB: number) => void;
  placePending: boolean;
  emptyTextStyle: unknown;
}) {
  const { tokens } = useTheme();
  const fg = Colors.text;
  const fgMuted = Colors.textMuted;
  const [scoreDraft, setScoreDraft] = useState<Record<string, { a: number | null; b: number | null }>>({});

  const leaderboard = snapshot?.leaderboard ?? [];

  const myLinesByMatch = useMemo(() => {
    if (!currentUserId || !snapshot?.matches) {
      return new Map<string, { winner?: boolean; winnerTeamId?: string; score?: boolean }>();
    }
    const m = new Map<string, { winner?: boolean; winnerTeamId?: string; score?: boolean }>();
    for (const row of snapshot.matches) {
      const lines = row.lines ?? [];
      const mine = lines.filter((l) => l.userId === currentUserId);
      const winnerLine = mine.find((x) => x.kind === 'winner');
      m.set(row.matchId, {
        winner: mine.some((x) => x.kind === 'winner'),
        winnerTeamId: typeof winnerLine?.pickWinnerTeamId === 'string' ? winnerLine.pickWinnerTeamId : undefined,
        score: mine.some((x) => x.kind === 'score'),
      });
    }
    return m;
  }, [snapshot?.matches, currentUserId]);

  const submitScore = useCallback(
    (row: TournamentBettingMatchRow) => {
      const d = scoreDraft[row.matchId] ?? { a: null, b: null };
      if (d.a === null || d.b === null) {
        Alert.alert(t('common.error'), t('tournamentDetail.bettingInvalidScore'));
        return;
      }
      const my = myLinesByMatch.get(row.matchId);
      const ctx: ScoreBetConstraintContext = {
        allowWinner: !!snapshot?.bettingAllowWinner,
        winnerTeamId: my?.winnerTeamId,
        teamAId: row.teamAId,
        teamBId: row.teamBId,
      };
      if (!scoreBetPairIsValid(d.a, d.b, ctx)) {
        Alert.alert(
          t('common.error'),
          d.a === d.b ? t('tournamentDetail.bettingInvalidScoreTie') : t('tournamentDetail.bettingInvalidScoreVsWinner')
        );
        return;
      }
      onPlaceScore(row.matchId, d.a, d.b);
    },
    [onPlaceScore, scoreDraft, t, myLinesByMatch, snapshot?.bettingAllowWinner]
  );

  if (!snapshot?.bettingEnabled) {
    return <Text style={emptyTextStyle as never}>{t('tournamentDetail.bettingDisabled')}</Text>;
  }

  return (
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
      {playLockedReason === 'not_started' ? (
        <Text style={[styles.tournamentNotStartedBanner, { color: fgMuted }]}>{t('tournamentDetail.tournamentNotStartedYet')}</Text>
      ) : null}
      {playLockedReason === 'paused' ? (
        <Text style={[styles.tournamentNotStartedBanner, { color: fgMuted }]}>{t('tournamentDetail.tournamentPausedHint')}</Text>
      ) : null}
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
          scoreDraft={scoreDraft[row.matchId] ?? { a: null, b: null }}
          onScoreChange={(side, v) =>
            setScoreDraft((prev) => ({
              ...prev,
              [row.matchId]: {
                ...(prev[row.matchId] ?? { a: null, b: null }),
                [side]: v,
              },
            }))
          }
          onSelectWinner={(teamId) => onPlaceWinner(row.matchId, teamId)}
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
  onScoreChange,
  onSelectWinner,
  onSubmitScore,
}: {
  row: TournamentBettingMatchRow;
  userMap: Record<string, User>;
  t: (key: string, options?: Record<string, string | number>) => string;
  fg: string;
  fgMuted: string;
  tokens: ThemeTokensPublic;
  my?: { winner?: boolean; winnerTeamId?: string; score?: boolean };
  canBet: boolean;
  allowWinner: boolean;
  allowScore: boolean;
  placePending: boolean;
  scoreDraft: { a: number | null; b: number | null };
  onScoreChange: (side: 'a' | 'b', value: number) => void;
  onSelectWinner: (teamId: string) => void;
  onSubmitScore: () => void;
}) {
  const scheduled = row.status === 'scheduled';
  const live = row.status === 'in_progress';
  const done = row.status === 'completed';
  const pctA = row.winnerPctA;
  const pctB = row.winnerPctB;
  const showPctBar = live && pctA != null && pctB != null;
  const scoreLocked = allowWinner && !my?.winner;
  const [scorePicker, setScorePicker] = useState<null | 'a' | 'b'>(null);

  const scoreConstraint = useMemo(
    (): ScoreBetConstraintContext => ({
      allowWinner,
      winnerTeamId: my?.winnerTeamId,
      teamAId: row.teamAId,
      teamBId: row.teamBId,
    }),
    [allowWinner, my?.winnerTeamId, row.teamAId, row.teamBId]
  );

  const pickerChoices = useMemo(() => {
    if (scorePicker === null) return BET_SCORE_CHOICES;
    const other = scorePicker === 'a' ? scoreDraft.b : scoreDraft.a;
    return allowedScoresForPicker(scorePicker, other, scoreConstraint);
  }, [scorePicker, scoreDraft.a, scoreDraft.b, scoreConstraint]);

  const bothScoresSet = scoreDraft.a !== null && scoreDraft.b !== null;
  const scorePairOk =
    bothScoresSet && scoreBetPairIsValid(scoreDraft.a!, scoreDraft.b!, scoreConstraint);

  const winnerPickInteractive = scheduled && canBet && allowWinner && !my?.winner && !placePending;
  const teamASelected = my?.winnerTeamId === row.teamAId;
  const teamBSelected = my?.winnerTeamId === row.teamBId;

  return (
    <View style={[styles.card, { borderColor: tokens.border }]}>
      {live || done ? (
        <Text style={[styles.status, { color: fgMuted }]}>
          {done ? t('tournamentDetail.bettingStatusDone') : t('tournamentDetail.bettingStatusLive')}
        </Text>
      ) : null}

      <View style={styles.teamRow}>
        <Pressable
          style={({ pressed }) => [
            styles.teamCard,
            { borderColor: teamASelected ? tokens.accent : tokens.border, backgroundColor: teamASelected ? tokens.accentMuted : 'transparent' },
            winnerPickInteractive && pressed ? { opacity: 0.88 } : null,
            !winnerPickInteractive && !teamASelected ? styles.teamCardPassive : null,
          ]}
          onPress={() => {
            if (!winnerPickInteractive) return;
            onSelectWinner(row.teamAId);
          }}
          disabled={!winnerPickInteractive}
          accessibilityRole="button"
          accessibilityState={{ disabled: !winnerPickInteractive, selected: teamASelected }}
          accessibilityLabel={row.teamAName}
        >
          <Text style={[styles.teamCardName, { color: fg }]} numberOfLines={3}>
            {row.teamAName}
          </Text>
          {allowWinner && my?.winner && teamASelected ? (
            <Text style={[styles.teamCardBadge, { color: tokens.accent }]}>{t('tournamentDetail.bettingYourWinner')}</Text>
          ) : null}
        </Pressable>

        <View style={[styles.teamVs, { backgroundColor: tokens.border }]}>
          <Text style={[styles.teamVsText, { color: fgMuted }]}>{t('tournamentDetail.matchVsSeparator').trim()}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.teamCard,
            { borderColor: teamBSelected ? tokens.accent : tokens.border, backgroundColor: teamBSelected ? tokens.accentMuted : 'transparent' },
            winnerPickInteractive && pressed ? { opacity: 0.88 } : null,
            !winnerPickInteractive && !teamBSelected ? styles.teamCardPassive : null,
          ]}
          onPress={() => {
            if (!winnerPickInteractive) return;
            onSelectWinner(row.teamBId);
          }}
          disabled={!winnerPickInteractive}
          accessibilityRole="button"
          accessibilityState={{ disabled: !winnerPickInteractive, selected: teamBSelected }}
          accessibilityLabel={row.teamBName}
        >
          <Text style={[styles.teamCardName, { color: fg }]} numberOfLines={3}>
            {row.teamBName}
          </Text>
          {allowWinner && my?.winner && teamBSelected ? (
            <Text style={[styles.teamCardBadge, { color: tokens.accent }]}>{t('tournamentDetail.bettingYourWinner')}</Text>
          ) : null}
        </Pressable>
      </View>

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
        <Text style={[styles.muted, { color: fgMuted, marginTop: 8 }]}>{t('tournamentDetail.bettingNoCrowdData')}</Text>
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
            <Text style={[styles.pickWinnerHint, { color: fgMuted }]}>{t('tournamentDetail.bettingTapTeamToPickWinner')}</Text>
          ) : null}
          {allowScore && !my?.score ? (
            <View style={styles.scoreBlock}>
              {scoreLocked ? (
                <Text style={[styles.scoreHint, { color: fgMuted }]}>{t('tournamentDetail.bettingScoreAfterWinner')}</Text>
              ) : null}
              <View style={[styles.scoreRow, scoreLocked && styles.scoreRowLocked]}>
                <Pressable
                  style={[
                    styles.scoreSelect,
                    { borderColor: tokens.border },
                    scoreDraft.a !== null ? { borderColor: tokens.accentOutline } : null,
                  ]}
                  onPress={() => !scoreLocked && !placePending && setScorePicker('a')}
                  disabled={scoreLocked || placePending}
                  accessibilityRole="button"
                  accessibilityLabel={t('tournamentDetail.bettingScorePickTitle', { name: row.teamAName })}
                >
                  <Text style={[styles.scoreSelectLabel, { color: fgMuted }]} numberOfLines={1}>
                    {row.teamAName}
                  </Text>
                  <Text style={[styles.scoreSelectValue, { color: fg }]}>{scoreDraft.a === null ? '—' : String(scoreDraft.a)}</Text>
                </Pressable>
                <Text style={[styles.scoreDash, { color: fg }]}>—</Text>
                <Pressable
                  style={[
                    styles.scoreSelect,
                    { borderColor: tokens.border },
                    scoreDraft.b !== null ? { borderColor: tokens.accentOutline } : null,
                  ]}
                  onPress={() => !scoreLocked && !placePending && setScorePicker('b')}
                  disabled={scoreLocked || placePending}
                  accessibilityRole="button"
                  accessibilityLabel={t('tournamentDetail.bettingScorePickTitle', { name: row.teamBName })}
                >
                  <Text style={[styles.scoreSelectLabel, { color: fgMuted }]} numberOfLines={1}>
                    {row.teamBName}
                  </Text>
                  <Text style={[styles.scoreSelectValue, { color: fg }]}>{scoreDraft.b === null ? '—' : String(scoreDraft.b)}</Text>
                </Pressable>
              </View>
              <Pressable
                style={[
                  styles.btn,
                  styles.btnFullWidth,
                  { backgroundColor: tokens.accent },
                  (placePending || scoreLocked || !bothScoresSet || !scorePairOk) && styles.btnDisabled,
                ]}
                onPress={onSubmitScore}
                disabled={placePending || scoreLocked || !bothScoresSet || !scorePairOk}
              >
                <Text style={styles.btnText}>{t('tournamentDetail.bettingSaveScore')}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <ScorePickerModal
        visible={scorePicker !== null}
        title={
          scorePicker === 'a'
            ? t('tournamentDetail.bettingScorePickTitle', { name: row.teamAName })
            : scorePicker === 'b'
              ? t('tournamentDetail.bettingScorePickTitle', { name: row.teamBName })
              : ''
        }
        closeLabel={t('common.cancel')}
        tokens={tokens}
        fg={fg}
        choices={pickerChoices}
        emptyHint={t('tournamentDetail.bettingScoreNoValidChoices')}
        onClose={() => setScorePicker(null)}
        onSelect={(n) => {
          if (scorePicker === 'a' || scorePicker === 'b') {
            onScoreChange(scorePicker, n);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  tournamentNotStartedBanner: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    textAlign: 'center',
  },
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
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  status: { fontSize: 12, marginBottom: 8, fontWeight: '600' },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 4,
  },
  teamCard: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    minHeight: 76,
    justifyContent: 'center',
  },
  teamCardPassive: {
    opacity: 0.85,
  },
  teamCardName: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  teamCardBadge: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  teamVs: {
    width: 28,
    alignSelf: 'stretch',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamVsText: {
    fontSize: 11,
    fontWeight: '800',
  },
  pctRow: { marginTop: 8 },
  pctBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  pctFillA: { minWidth: 2 },
  pctFillB: { minWidth: 2 },
  pctLabel: { fontSize: 11, marginTop: 4 },
  lines: { marginTop: 8, gap: 4 },
  line: { fontSize: 12 },
  actions: { marginTop: 12, gap: 10 },
  pickWinnerHint: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  btnFullWidth: { width: '100%', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '700' },
  scoreBlock: { gap: 8 },
  scoreHint: { fontSize: 12, lineHeight: 16 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  scoreRowLocked: { opacity: 0.45 },
  scoreSelect: {
    flex: 1,
    minWidth: 96,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  scoreSelectLabel: { fontSize: 10, fontWeight: '600', marginBottom: 4 },
  scoreSelectValue: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  scoreDash: { fontSize: 18, fontWeight: '700', paddingBottom: 8 },
  btnDisabled: { opacity: 0.5 },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheetWrap: {
    marginHorizontal: 20,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  scoreModalSheet: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: 440,
    overflow: 'hidden',
  },
  scoreModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    textAlign: 'center',
  },
  scoreModalScroll: { maxHeight: 320 },
  scoreModalEmpty: {
    alignSelf: 'stretch',
    paddingVertical: 20,
    paddingHorizontal: 16,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  scoreModalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  scoreChip: {
    width: 48,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreChipText: { fontSize: 16, fontWeight: '800' },
  scoreModalFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    alignItems: 'center',
  },
  scoreModalFooterText: { fontSize: 15, fontWeight: '600' },
});
