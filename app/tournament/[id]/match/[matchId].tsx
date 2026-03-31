import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Pressable, Image, Animated, Easing } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useTranslation } from '@/lib/i18n';
import { useTournament } from '@/lib/hooks/useTournaments';
import { useClaimReferee, useMatches, useRefereePoint, useSetServeOrder, useStartMatch, useUpdateMatch } from '@/lib/hooks/useMatches';
import { useTeams } from '@/lib/hooks/useTeams';
import { useUsers } from '@/lib/hooks/useUsers';
import { useUserStore } from '@/store/useUserStore';
import { alertApiError } from '@/lib/utils/apiError';
import { getPlayerListName } from '@/lib/utils/userDisplay';

export default function EditMatchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const insets = useSafeAreaInsets();
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;

  const { data: tournament } = useTournament(id);
  const { data: teams = [] } = useTeams(id ? { tournamentId: id } : undefined);
  const { data: matches = [] } = useMatches(id ? { tournamentId: id } : undefined);
  const updateMatch = useUpdateMatch();
  const claimReferee = useClaimReferee();
  const startMatch = useStartMatch();
  const refereePoint = useRefereePoint();
  const setServeOrder = useSetServeOrder();

  const canManageTournament = !!tournament && ((tournament.organizerIds ?? []).includes(userId ?? '') || user?.role === 'admin');

  const teamById = useMemo(() => Object.fromEntries(teams.map((tm) => [tm._id, tm])), [teams]);
  const match = useMemo(() => matches.find((m) => m._id === matchId) ?? null, [matches, matchId]);

  const teamAPlayerIds = useMemo(() => {
    if (!match) return [] as string[];
    const t = teamById[match.teamAId] as { playerIds?: unknown } | undefined;
    return Array.isArray(t?.playerIds) ? (t!.playerIds as string[]).filter(Boolean) : ([] as string[]);
  }, [match, teamById]);

  const teamBPlayerIds = useMemo(() => {
    if (!match) return [] as string[];
    const t = teamById[match.teamBId] as { playerIds?: unknown } | undefined;
    return Array.isArray(t?.playerIds) ? (t!.playerIds as string[]).filter(Boolean) : ([] as string[]);
  }, [match, teamById]);

  const defaultServeOrder = useMemo(() => {
    const a1 = teamAPlayerIds[0];
    const a2 = teamAPlayerIds[1] ?? teamAPlayerIds[0];
    const b1 = teamBPlayerIds[0];
    const b2 = teamBPlayerIds[1] ?? teamBPlayerIds[0];
    return [a1, b1, a2, b2].filter(Boolean) as string[];
  }, [teamAPlayerIds, teamBPlayerIds]);

  const playerIdsForNames = useMemo(() => {
    if (!match) return [] as string[];
    const a = teams.find((t) => t._id === match.teamAId)?.playerIds ?? [];
    const b = teams.find((t) => t._id === match.teamBId)?.playerIds ?? [];
    const ref = String((match as { refereeUserId?: unknown }).refereeUserId ?? '');
    return [...new Set([...a, ...b, ...(ref ? [ref] : [])].filter(Boolean))];
  }, [match, teams]);
  const { data: players = [] } = useUsers(playerIdsForNames);
  const usersById = useMemo(() => new Map(players.map((u) => [u._id, u])), [players]);

  const [setsWonA, setSetsWonA] = useState('0');
  const [setsWonB, setSetsWonB] = useState('0');
  const [pointsA, setPointsA] = useState('');
  const [pointsB, setPointsB] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const RotatingVolleyBall = useMemo(() => {
    const Cmp = ({ color }: { color: string }) => {
      const spin = useRef(new Animated.Value(0)).current;
      useEffect(() => {
        const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }));
        loop.start();
        return () => loop.stop();
      }, [spin]);
      return (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.serveBallIcon,
            {
              transform: [
                {
                  rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
                },
              ],
            },
          ]}
        >
          <MaterialCommunityIcons name="volleyball" size={22} color={color} />
        </Animated.View>
      );
    };
    return Cmp;
  }, []);

  useEffect(() => {
    const status = (match as { status?: string } | null)?.status;
    if (status !== 'in_progress') return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [match]);

  // Serving indicator is now the rotating volleyball icon (and no avatar ring).

  // Volleyball icon rotation is self-contained per rendered icon.

  useEffect(() => {
    if (!match) return;
    setSetsWonA(String(match.setsWonA ?? 0));
    setSetsWonB(String(match.setsWonB ?? 0));
    setPointsA(match.pointsA != null ? String(match.pointsA) : '');
    setPointsB(match.pointsB != null ? String(match.pointsB) : '');
  }, [match]);

  const isReferee = useMemo(() => {
    if (!userId || !match) return false;
    return String((match as { refereeUserId?: unknown }).refereeUserId ?? '') === userId;
  }, [match, userId]);

  const eligibleRefTeam = useMemo(() => {
    if (!userId || !match) return null;
    const stage = (match as { stage?: string }).stage;
    const division = (match as { division?: string }).division;
    const category = (match as { category?: string }).category;
    const groupIndex = (match as { groupIndex?: number }).groupIndex;
    const matchTeamIds = new Set([match.teamAId, match.teamBId]);

    const myTeam = teams.find((tm) => (tm.playerIds ?? []).includes(userId));
    if (!myTeam) return null;
    if (matchTeamIds.has(myTeam._id)) return null;

    if (division && myTeam.division && myTeam.division !== division) return null;
    if (stage === 'classification') {
      if (typeof groupIndex !== 'number') return null;
      if (typeof myTeam.groupIndex !== 'number' || myTeam.groupIndex !== groupIndex) return null;
    }
    if (stage === 'category') {
      if (!category) return null;
      if (myTeam.category !== category) return null;
    }

    // Must not be playing in any in-progress match.
    const playingNow = matches.some(
      (m) => (m as { status?: string }).status === 'in_progress' && (m.teamAId === myTeam._id || m.teamBId === myTeam._id)
    );
    if (playingNow) return null;
    return myTeam;
  }, [match, matches, teams, userId]);

  const suggestedRefTeam = useMemo(() => {
    if (!match) return null;
    const stage = (match as { stage?: string }).stage;
    const division = (match as { division?: string }).division;
    const category = (match as { category?: string }).category;
    const groupIndex = (match as { groupIndex?: number }).groupIndex;
    const matchTeamIds = new Set([match.teamAId, match.teamBId]);

    const inProgressTeamIds = new Set(
      matches
        .filter((m) => (m as { status?: string }).status === 'in_progress')
        .flatMap((m) => [m.teamAId, m.teamBId])
        .filter(Boolean)
    );

    // Also exclude teams that are about to play in the next scheduled matches for this same slice.
    const nextScheduledTeamIds = new Set(
      matches
        .filter((m) => {
          if ((m as { status?: string }).status !== 'scheduled') return false;
          if ((m as { stage?: string }).stage !== stage) return false;
          const mDiv = (m as { division?: string }).division;
          if (division && mDiv && mDiv !== division) return false;
          if (stage === 'classification') {
            if (typeof groupIndex !== 'number') return false;
            return (m as { groupIndex?: unknown }).groupIndex === groupIndex;
          }
          if (stage === 'category') {
            if (!category) return false;
            return String((m as { category?: unknown }).category ?? '') === String(category);
          }
          return false;
        })
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .slice(0, 2)
        .flatMap((m) => [m.teamAId, m.teamBId])
        .filter(Boolean)
    );

    const candidates = teams.filter((tm) => {
      if (matchTeamIds.has(tm._id)) return false;
      if (inProgressTeamIds.has(tm._id)) return false;
      if (nextScheduledTeamIds.has(tm._id)) return false;
      if (division && tm.division && tm.division !== division) return false;
      if (stage === 'classification') {
        if (typeof groupIndex !== 'number') return false;
        return typeof tm.groupIndex === 'number' && tm.groupIndex === groupIndex;
      }
      if (stage === 'category') {
        if (!category) return false;
        return tm.category === category;
      }
      return false;
    });
    return candidates[0] ?? null;
  }, [match, matches, teams]);

  const canEditScore = canManageTournament || isReferee;

  if (!id || !matchId || !tournament || !match) {
    return (
      <View style={styles.container}>
        <Text style={styles.stateTitle}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (!canManageTournament && !isReferee && !eligibleRefTeam) {
    return (
      <View style={styles.container}>
        <Text style={styles.stateTitle}>{t('common.error')}</Text>
        <Text style={styles.hint}>{t('tournamentDetail.refereeNotAllowed')}</Text>
      </View>
    );
  }

  const teamA = teamById[match.teamAId];
  const teamB = teamById[match.teamBId];

  const livePointsA = Number(match.pointsA ?? 0) || 0;
  const livePointsB = Number(match.pointsB ?? 0) || 0;

  const formatClock = (totalSeconds: number) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (hh > 0) return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };

  const clockSeconds = (() => {
    const status = String((match as { status?: unknown }).status ?? 'scheduled');
    if (status === 'completed') {
      const dur = Number((match as { durationSeconds?: unknown }).durationSeconds ?? 0);
      return Number.isFinite(dur) ? dur : 0;
    }
    if (status === 'in_progress') {
      const startedAt = String((match as { startedAt?: unknown }).startedAt ?? '');
      const startedMs = startedAt ? Date.parse(startedAt) : NaN;
      if (!Number.isFinite(startedMs)) return 0;
      return Math.max(0, Math.floor((nowMs - startedMs) / 1000));
    }
    return 0;
  })();

  const serveOrder = (match as { serveOrder?: unknown }).serveOrder as string[] | undefined;
  const serveIndex = Number((match as { serveIndex?: unknown }).serveIndex ?? 0) || 0;
  const servingPlayerId = String((match as { servingPlayerId?: unknown }).servingPlayerId ?? '');

  const order = (Array.isArray(serveOrder) && serveOrder.length === 4 ? serveOrder : defaultServeOrder).slice(0, 4);

  const renderServeLine = (teamAName: string, teamBName: string, order: string[]) => {
    const canChangeOrder = canEditScore && (match as { status?: string }).status === 'in_progress';
    const swapA = () => {
      if (order.length !== 4) return;
      const next = [...order];
      [next[0], next[2]] = [next[2]!, next[0]!];
      setServeOrder.mutate(
        { id: matchId, tournamentId: id, order: next, servingPlayerId: servingPlayerId || next[0] },
        { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
      );
    };
    const swapB = () => {
      if (order.length !== 4) return;
      const next = [...order];
      [next[1], next[3]] = [next[3]!, next[1]!];
      setServeOrder.mutate(
        { id: matchId, tournamentId: id, order: next, servingPlayerId: servingPlayerId || next[0] },
        { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
      );
    };
    const toggleTeamOrder = (pid: string) => {
      if (!canChangeOrder || order.length !== 4) return;
      const isTeamA = teamAPlayerIds.includes(pid);
      const next = [...order];
      if (isTeamA) {
        [next[0], next[2]] = [next[2]!, next[0]!];
      } else {
        [next[1], next[3]] = [next[3]!, next[1]!];
      }
      const nextServing = servingPlayerId || String(next[0] ?? '');
      setServeOrder.mutate(
        { id: matchId, tournamentId: id, order: next, servingPlayerId: nextServing },
        { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
      );
    };

    return (
      <View style={styles.serveRow}>
        <View style={styles.serveHeader}>
          {canChangeOrder ? (
            <View style={styles.serveSwapBtns}>
              <Pressable style={styles.serveSwapBtn} onPress={swapA} accessibilityRole="button">
                <Text style={styles.serveSwapText}>{t('tournamentDetail.swapServeA', { team: teamAName })}</Text>
              </Pressable>
              <Pressable style={styles.serveSwapBtn} onPress={swapB} accessibilityRole="button">
                <Text style={styles.serveSwapText}>{t('tournamentDetail.swapServeB', { team: teamBName })}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.servePlayersSides}>
          <View style={styles.serveSide}>
            {[0, 2].map((idx) => {
              const pid = order[idx]!;
              const u = usersById.get(pid);
              const label = u ? getPlayerListName(u as any) : pid;
              const isServer = servingPlayerId ? pid === servingPlayerId : idx === (serveIndex % 4);
              return (
                <View key={`${pid}-${idx}`} style={[styles.serveSlot, isServer ? styles.serveSlotActive : null]}>
                  <View style={styles.serveSlotTopRow}>
                    <View style={styles.serveAvatarWrap}>
                      <Avatar
                        firstName={(u as any)?.firstName ?? ''}
                        lastName={(u as any)?.lastName ?? ''}
                        gender={(u as any)?.gender === 'male' || (u as any)?.gender === 'female' ? (u as any).gender : undefined}
                        size="xs"
                      />
                    </View>
                    <View style={styles.serveOrderRow}>
                      {isServer ? <RotatingVolleyBall color="#fff" /> : null}
                    <Pressable
                      onPress={() => toggleTeamOrder(pid)}
                      disabled={!canChangeOrder}
                      accessibilityRole="button"
                      style={styles.serveSlotNumPill}
                    >
                      <Text style={styles.serveSlotNum}>{idx + 1}</Text>
                    </Pressable>
                    </View>
                  </View>
                  <Pressable
                    style={styles.serveSlotNameWrap}
                    onPress={() => {
                      if (!canChangeOrder) return;
                      setServeOrder.mutate(
                        { id: matchId, tournamentId: id, order, servingPlayerId: pid },
                        { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                      );
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.serveSlotName, styles.serveSlotNameA]} numberOfLines={3}>
                      {label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View style={styles.serveSide}>
            {[1, 3].map((idx) => {
              const pid = order[idx]!;
              const u = usersById.get(pid);
              const label = u ? getPlayerListName(u as any) : pid;
              const isServer = servingPlayerId ? pid === servingPlayerId : idx === (serveIndex % 4);
              return (
                <View key={`${pid}-${idx}`} style={[styles.serveSlot, isServer ? styles.serveSlotActive : null]}>
                  <View style={styles.serveSlotTopRow}>
                    <View style={styles.serveAvatarWrap}>
                      <Avatar
                        firstName={(u as any)?.firstName ?? ''}
                        lastName={(u as any)?.lastName ?? ''}
                        gender={(u as any)?.gender === 'male' || (u as any)?.gender === 'female' ? (u as any).gender : undefined}
                        size="xs"
                      />
                    </View>
                    <View style={styles.serveOrderRow}>
                      {isServer ? <RotatingVolleyBall color="#fff" /> : null}
                    <Pressable
                      onPress={() => toggleTeamOrder(pid)}
                      disabled={!canChangeOrder}
                      accessibilityRole="button"
                      style={styles.serveSlotNumPill}
                    >
                      <Text style={styles.serveSlotNum}>{idx + 1}</Text>
                    </Pressable>
                    </View>
                  </View>
                  <Pressable
                    style={styles.serveSlotNameWrap}
                    onPress={() => {
                      if (!canChangeOrder) return;
                      setServeOrder.mutate(
                        { id: matchId, tournamentId: id, order, servingPlayerId: pid },
                        { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                      );
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.serveSlotName, styles.serveSlotNameB]} numberOfLines={3}>
                      {label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const aNum = Math.floor(Number(setsWonA));
  const bNum = Math.floor(Number(setsWonB));
  const paNum = Math.floor(Number(pointsA));
  const pbNum = Math.floor(Number(pointsB));
  const canSave =
    Number.isFinite(aNum) &&
    Number.isFinite(bNum) &&
    aNum >= 0 &&
    bNum >= 0 &&
    aNum !== bNum &&
    Number.isFinite(paNum) &&
    Number.isFinite(pbNum) &&
    paNum >= 0 &&
    pbNum >= 0 &&
    !updateMatch.isPending &&
    canEditScore;

  const handleSave = () => {
    const a = aNum;
    const b = bNum;
    const pa = paNum;
    const pb = pbNum;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
      Alert.alert(t('common.error'), t('tournamentDetail.matchInvalidSets'));
      return;
    }
    if (a === b) {
      Alert.alert(t('common.error'), t('tournamentDetail.matchInvalidSets'));
      return;
    }
    if (!Number.isFinite(pa) || !Number.isFinite(pb) || pa < 0 || pb < 0) {
      Alert.alert(t('common.error'), t('tournamentDetail.matchPointsRequired'));
      return;
    }
    updateMatch.mutate(
      {
        id: matchId,
        tournamentId: id,
        update: { setsWonA: a, setsWonB: b, pointsA: pa, pointsB: pb, status: 'completed' },
      },
      {
        onSuccess: () => router.back(),
        onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
      }
    );
  };

  const handlePoint = (side: 'A' | 'B', delta: 1 | -1) => {
    refereePoint.mutate(
      { id: matchId, tournamentId: id, side, delta },
      { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
    );
  };

  const topPad = Math.max(insets.top, 12) + 8;

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Match the Tournament screen top-left logo placement + centered header */}
      <View style={styles.topBar}>
        <Image
          source={require('@/assets/images/android-icon-foreground.png')}
          style={styles.topLeftLogo}
          resizeMode="contain"
          accessibilityLabel="Matchpoint"
        />
        <View style={styles.topBarCenter}>
          <View style={styles.timerLabels}>
            <Text style={styles.timerLabel}>{t('tournamentDetail.timeLabel')}</Text>
            {(match as { status?: string }).status === 'in_progress' ? <Text style={styles.timerLabel}>{t('tournamentDetail.liveLabel')}</Text> : null}
          </View>
          <Text style={styles.timerValue}>{formatClock(clockSeconds)}</Text>
        </View>
      </View>

      <View style={styles.container}>
      <Text style={styles.vsHeadline} accessibilityRole="header">
        <Text style={styles.vsTeamA}>{teamA?.name ?? match.teamAId}</Text>
        <Text style={styles.vsSep}> VS </Text>
        <Text style={styles.vsTeamB}>{teamB?.name ?? match.teamBId}</Text>
      </Text>
      {(match as { status?: string }).status !== 'completed' ? (
        <>
          {(match as { status?: string }).status === 'in_progress' ? (
            <Text style={styles.hint}>{t('tournamentDetail.refereeLocked')}</Text>
          ) : null}

          <View style={styles.scoreBoard}>
            <View style={[styles.scoreSide, styles.scoreSideLeft]}>
              <View style={styles.scorePointsArea}>
                <Text style={styles.scorePoints}>{livePointsA}</Text>
                <View pointerEvents="box-none" style={styles.scoreOverlay}>
                  <Pressable
                    style={[
                      styles.scoreOverlayBtn,
                      styles.scoreOverlayBtnTop,
                      !(canEditScore && (match as { status?: string }).status === 'in_progress') ? styles.scoreOverlayDisabled : null,
                    ]}
                    onPress={() => handlePoint('A', +1)}
                    disabled={!canEditScore || (match as { status?: string }).status !== 'in_progress' || refereePoint.isPending}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.scoreOverlayArrow, styles.scoreOverlayArrowA, styles.scoreOverlayArrowNudgeTop]}>˄</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.scoreOverlayBtn,
                      styles.scoreOverlayBtnBottom,
                      !(canEditScore && (match as { status?: string }).status === 'in_progress') ? styles.scoreOverlayDisabled : null,
                    ]}
                    onPress={() => handlePoint('A', -1)}
                    disabled={!canEditScore || (match as { status?: string }).status !== 'in_progress' || refereePoint.isPending}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.scoreOverlayArrow, styles.scoreOverlayArrowA, styles.scoreOverlayArrowNudgeBottom]}>˅</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.scoreDivider} />

            <View style={[styles.scoreSide, styles.scoreSideRight]}>
              <View style={styles.scorePointsArea}>
                <Text style={[styles.scorePoints, styles.scorePointsRight]}>{livePointsB}</Text>
                <View pointerEvents="box-none" style={styles.scoreOverlay}>
                  <Pressable
                    style={[
                      styles.scoreOverlayBtn,
                      styles.scoreOverlayBtnTop,
                      !(canEditScore && (match as { status?: string }).status === 'in_progress') ? styles.scoreOverlayDisabled : null,
                    ]}
                    onPress={() => handlePoint('B', +1)}
                    disabled={!canEditScore || (match as { status?: string }).status !== 'in_progress' || refereePoint.isPending}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.scoreOverlayArrow, styles.scoreOverlayArrowB, styles.scoreOverlayArrowNudgeTop]}>˄</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.scoreOverlayBtn,
                      styles.scoreOverlayBtnBottom,
                      !(canEditScore && (match as { status?: string }).status === 'in_progress') ? styles.scoreOverlayDisabled : null,
                    ]}
                    onPress={() => handlePoint('B', -1)}
                    disabled={!canEditScore || (match as { status?: string }).status !== 'in_progress' || refereePoint.isPending}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.scoreOverlayArrow, styles.scoreOverlayArrowB, styles.scoreOverlayArrowNudgeBottom]}>˅</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {renderServeLine(teamA?.name ?? 'Team A', teamB?.name ?? 'Team B', order)}
        </>
      ) : null}

      {(match as { status?: string }).status !== 'completed' && (match as { status?: string }).status !== 'in_progress' ? (
        <View style={{ gap: 8 }}>
          {suggestedRefTeam ? (
            <Text style={[styles.hint, styles.centerText]}>{t('tournamentDetail.refereeSuggested', { name: suggestedRefTeam.name })}</Text>
          ) : null}
          {canManageTournament && (match as { status?: string }).status !== 'in_progress' ? (
            <Button
              title={startMatch.isPending ? t('common.loading') : t('tournamentDetail.startMatch')}
              onPress={() =>
                startMatch.mutate(
                  { id: matchId, tournamentId: id },
                  { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                )
              }
              disabled={startMatch.isPending}
              variant="secondary"
              size="sm"
              fullWidth
            />
          ) : null}
          {eligibleRefTeam ? (
            <Button
              title={claimReferee.isPending ? t('common.loading') : t('tournamentDetail.startAsReferee')}
              onPress={() =>
                claimReferee.mutate(
                  { id: matchId, tournamentId: id },
                  { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                )
              }
              disabled={claimReferee.isPending}
              fullWidth
            />
          ) : null}
        </View>
      ) : null}

      {(match as { status?: string }).status === 'in_progress' && (match as { refereeUserId?: unknown }).refereeUserId ? (
        <Text style={[styles.hint, styles.centerText]}>
          {t('tournamentDetail.refereeActual', {
            name:
              userId && String((match as { refereeUserId?: unknown }).refereeUserId ?? '') === userId
                ? t('common.you')
                : (usersById.get(String((match as { refereeUserId?: unknown }).refereeUserId ?? ''))?.firstName as string | undefined) ||
                  String((match as { refereeUserId?: unknown }).refereeUserId ?? ''),
          })}
        </Text>
      ) : null}
      {(match as { status?: string }).status === 'completed' ? (
        <>
          <Text style={styles.hint}>
            {aNum > bNum ? (teamA?.name ?? match.teamAId) : bNum > aNum ? (teamB?.name ?? match.teamBId) : '—'}
          </Text>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>{t('tournamentDetail.setsWonA')}</Text>
              <TextInput style={styles.input} value={setsWonA} onChangeText={setSetsWonA} keyboardType="number-pad" />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>{t('tournamentDetail.setsWonB')}</Text>
              <TextInput style={styles.input} value={setsWonB} onChangeText={setSetsWonB} keyboardType="number-pad" />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>{t('tournamentDetail.pointsA')}</Text>
              <TextInput
                style={styles.input}
                value={pointsA}
                onChangeText={setPointsA}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>{t('tournamentDetail.pointsB')}</Text>
              <TextInput
                style={styles.input}
                value={pointsB}
                onChangeText={setPointsB}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          </View>

          <Button title={updateMatch.isPending ? t('common.loading') : t('common.save')} onPress={handleSave} disabled={!canSave} fullWidth />
        </>
      ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  // content padding like other screens
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  stateTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  hint: { color: Colors.textSecondary, marginBottom: 8 },
  centerText: { textAlign: 'center' },
  // Mirror TabScreenHeader layout: logo absolute top-left, centered content
  topBar: {
    width: '100%',
    minHeight: 50,
    marginBottom: 14,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  topLeftLogo: { position: 'absolute', left: 0, top: 0, height: 50, width: 50 },
  topBarCenter: { alignItems: 'center', justifyContent: 'center' },
  vsHeadline: {
    fontSize: 16,
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 2,
  },
  vsTeamA: { color: Colors.yellow, fontWeight: '900' },
  vsTeamB: { color: Colors.violet, fontWeight: '900' },
  vsSep: { color: Colors.textMuted, fontWeight: '900' },
  timerLabels: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  timerLabel: { fontSize: 10, fontWeight: '900', fontStyle: 'italic', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  timerValue: { fontSize: 18, fontWeight: '900', color: Colors.text, fontStyle: 'italic' },
  scoreBoard: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
  },
  scoreDivider: { width: 1, backgroundColor: Colors.surfaceLight },
  scoreSide: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, gap: 10, justifyContent: 'space-between' },
  // Match the "violetMuted" panel intensity for yellow.
  scoreSideLeft: { backgroundColor: 'rgba(251, 191, 36, 0.22)' },
  scoreSideRight: { backgroundColor: Colors.violetMuted },
  scoreTeam: { fontSize: 13, fontWeight: '900', color: Colors.textSecondary, textTransform: 'uppercase', textAlign: 'center' },
  scorePoints: {
    fontSize: 144,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Colors.yellow,
    textAlign: 'center',
    lineHeight: 152,
    includeFontPadding: false,
  },
  scorePointsRight: { color: Colors.violet },
  // Avoid flex collapse in auto-height container: give scores a real box.
  scorePointsArea: { minHeight: 260, justifyContent: 'center', position: 'relative' },
  scoreOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  // Two transparent tappable halves
  scoreOverlayBtn: { position: 'absolute', left: 0, right: 0, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  scoreOverlayBtnTop: { top: 0, height: 124, justifyContent: 'flex-start', paddingTop: 0 },
  scoreOverlayBtnBottom: { bottom: 0, height: 124, justifyContent: 'flex-end', paddingBottom: 0 },
  scoreOverlayDisabled: { opacity: 0.35 },
  scoreOverlayArrow: {
    width: '96%',
    alignSelf: 'center',
    textAlign: 'center',
    fontSize: 88,
    fontWeight: '900',
    color: Colors.text,
    opacity: 0.68,
    lineHeight: 88,
    transform: [{ scaleX: 2.6 }],
    includeFontPadding: false,
  },
  scoreOverlayArrowA: { color: Colors.yellow, opacity: 0.62 },
  scoreOverlayArrowB: { color: Colors.violet, opacity: 0.62 },
  scoreOverlayArrowNudgeTop: { marginTop: -10 },
  scoreOverlayArrowNudgeBottom: { marginBottom: -26 },
  serveRow: { gap: 8, paddingVertical: 4 },
  serveHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  serveSwapBtns: { flexDirection: 'row', gap: 8 },
  serveSwapBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: Colors.surfaceLight, backgroundColor: Colors.surface },
  serveSwapText: { fontSize: 11, fontWeight: '900', color: Colors.textMuted, textTransform: 'uppercase' },
  servePlayersSides: { flexDirection: 'row', gap: 12 },
  serveSide: { flex: 1, gap: 10, alignItems: 'stretch' },
  serveSlot: { width: '100%', paddingVertical: 8, paddingHorizontal: 10, gap: 6, minHeight: 66, justifyContent: 'space-between' },
  // Serving player highlight: keep ring + ball, avoid row fill.
  serveSlotActive: { borderWidth: 1, borderColor: Colors.surfaceLight, borderRadius: 12 },
  serveSlotNumPill: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: 'transparent' },
  serveSlotNum: { fontSize: 20, fontWeight: '900', fontStyle: 'italic', color: Colors.textMuted, textTransform: 'uppercase' },
  serveSlotTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  serveOrderRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  serveAvatarWrap: { position: 'relative' },
  serveBallIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -2,
  },
  serveAvatarRing: {
    position: 'absolute',
    left: -6,
    top: -6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.yellow,
  },
  serveSlotNameWrap: { alignSelf: 'stretch' },
  serveSlotName: { fontSize: 13, fontWeight: '900', fontStyle: 'italic', lineHeight: 16 },
  serveSlotNameA: { color: Colors.yellow },
  serveSlotNameB: { color: Colors.violet },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  label: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});

