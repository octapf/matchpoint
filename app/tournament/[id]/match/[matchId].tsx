import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNetInfo } from '@react-native-community/netinfo';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useTranslation } from '@/lib/i18n';
import { useTournament } from '@/lib/hooks/useTournaments';
import { useClaimReferee, useMatches, useRefereeHeartbeat, useRefereePoint, useSetServeOrder, useStartMatch } from '@/lib/hooks/useMatches';
import { useTeams } from '@/lib/hooks/useTeams';
import { useUsers } from '@/lib/hooks/useUsers';
import { useUserStore } from '@/store/useUserStore';
import { alertApiError } from '@/lib/utils/apiError';
import { isMongoObjectId, teamDisplayName } from '@/lib/tournamentMatchDisplay';
import { getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import { Pressable as GHPressable, type PressableProps } from 'react-native-gesture-handler';

type PressableEvent = Parameters<NonNullable<PressableProps['onPress']>>[0];

export default function EditMatchScreen() {
  const { t } = useTranslation();
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const insets = useSafeAreaInsets();
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;

  const { data: tournament } = useTournament(id);
  const { data: teams = [] } = useTeams(id ? { tournamentId: id } : undefined);
  const { data: matches = [] } = useMatches(id ? { tournamentId: id } : undefined, id ? { enabled: !!id, refetchIntervalMs: 7_000 } : undefined);
  const claimReferee = useClaimReferee();
  const startMatch = useStartMatch();
  const refereePoint = useRefereePoint();
  const setServeOrder = useSetServeOrder();
  const refereeHeartbeat = useRefereeHeartbeat();

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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [startCountdown, setStartCountdown] = useState<{ seconds: number; action: 'startMatch' | 'claimReferee' } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastTapRef = useRef(0);
  const tapPulseA = useRef(new Animated.Value(0)).current;
  const tapPulseB = useRef(new Animated.Value(0)).current;
  /** Full panel height for single-surface +/− split (locationY vs half height) */
  const scorePanelHeightARef = useRef(0);
  const scorePanelHeightBRef = useRef(0);
  const switchSidesPulse = useRef(new Animated.Value(1)).current;
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

  useEffect(() => {
    if (!startCountdown) return;
    if (startCountdown.seconds <= 1) {
      const action = startCountdown.action;
      setStartCountdown(null);
      if (action === 'startMatch') {
        startMatch.mutate(
          { id: matchId, tournamentId: id },
          { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
        );
      } else {
        claimReferee.mutate(
          { id: matchId, tournamentId: id, mode: 'claim' },
          { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
        );
      }
      return;
    }
    const h = setTimeout(() => setStartCountdown((prev) => (prev ? { ...prev, seconds: prev.seconds - 1 } : prev)), 1000);
    return () => clearTimeout(h);
  }, [startCountdown, claimReferee, id, matchId, startMatch, t]);

  // Serving indicator is now the rotating volleyball icon (and no avatar ring).

  // Volleyball icon rotation is self-contained per rendered icon.

  useEffect(() => {
    if (!match) return;
    setSetsWonA(String(match.setsWonA ?? 0));
    setSetsWonB(String(match.setsWonB ?? 0));
  }, [match]);

  const isReferee = useMemo(() => {
    if (!userId || !match) return false;
    return String((match as { refereeUserId?: unknown }).refereeUserId ?? '') === userId;
  }, [match, userId]);

  const currentRefereeUserId = useMemo(() => (match ? String((match as { refereeUserId?: unknown }).refereeUserId ?? '') : ''), [match]);
  const myTeamId = useMemo(() => {
    if (!userId) return '';
    const myTeam = teams.find((tm) => (tm.playerIds ?? []).includes(userId));
    return myTeam?._id ?? '';
  }, [teams, userId]);
  const refereeTeamId = useMemo(() => {
    if (!currentRefereeUserId) return '';
    const t = teams.find((tm) => (tm.playerIds ?? []).includes(currentRefereeUserId));
    return t?._id ?? '';
  }, [teams, currentRefereeUserId]);
  const canTakeoverReferee = useMemo(() => {
    if (!match || !userId) return false;
    if (!currentRefereeUserId || currentRefereeUserId === userId) return false;
    if (canManageTournament) return true;
    return !!(myTeamId && refereeTeamId && myTeamId === refereeTeamId);
  }, [match, userId, currentRefereeUserId, canManageTournament, myTeamId, refereeTeamId]);

  useEffect(() => {
    if (!id || !matchId) return;
    if (!match) return;
    // Keep referee lock fresh: assigned referee, or organizer/admin (server assigns lock to them on heartbeat).
    if (!isReferee && !canManageTournament) return;
    if ((match as { status?: string }).status !== 'in_progress') return;
    const h = setInterval(() => {
      refereeHeartbeat.mutate(
        { id: matchId, tournamentId: id },
        {
          onError: () => {
            // If lock was stolen/expired, polling will refresh match state and UI will disable controls.
          },
        }
      );
    }, 5_000);
    return () => clearInterval(h);
  }, [id, matchId, match, isReferee, canManageTournament, refereeHeartbeat]);

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
        .sort((a, b) => {
          const ao = typeof (a as any).orderIndex === 'number' ? Number((a as any).orderIndex) : Number.POSITIVE_INFINITY;
          const bo = typeof (b as any).orderIndex === 'number' ? Number((b as any).orderIndex) : Number.POSITIVE_INFINITY;
          if (ao !== bo) return ao - bo;
          const as = (a as any).scheduledAt ? Date.parse(String((a as any).scheduledAt)) : Number.POSITIVE_INFINITY;
          const bs = (b as any).scheduledAt ? Date.parse(String((b as any).scheduledAt)) : Number.POSITIVE_INFINITY;
          if (as !== bs) return as - bs;
          return Date.parse(a.createdAt) - Date.parse(b.createdAt);
        })
        .slice(0, 2)
        .flatMap((m) => [m.teamAId, m.teamBId])
        .filter(Boolean)
    );

    const candidates = teams
      .filter((tm) => {
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
    })
      .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
    return candidates[0] ?? null;
  }, [match, matches, teams]);

  /** Switch sides every (pointsToWin / 3) combined rally points (e.g. 15→every 5, 21→every 7). */
  const showSwitchSidesReminder = useMemo(() => {
    if (!match) return false;
    const ptw = Math.max(
      1,
      Math.min(
        99,
        Number((match as { pointsToWin?: unknown }).pointsToWin ?? (tournament as { pointsToWin?: unknown } | null)?.pointsToWin ?? 21) || 21
      )
    );
    const interval = Math.max(1, Math.floor(ptw / 3));
    const a = Number(match.pointsA ?? 0) || 0;
    const b = Number(match.pointsB ?? 0) || 0;
    const total = a + b;
    return (
      String((match as { status?: unknown }).status ?? '') === 'in_progress' && total > 0 && total % interval === 0
    );
  }, [match, tournament]);

  useEffect(() => {
    if (!showSwitchSidesReminder) {
      switchSidesPulse.setValue(1);
      return;
    }
    // Single smooth breath 1 → peak → 1 each cycle (no jump when the loop restarts).
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(switchSidesPulse, {
          toValue: 1.07,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(switchSidesPulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showSwitchSidesReminder, switchSidesPulse]);

  const canEditScore = isReferee || canManageTournament;

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
  const tbdLabel = t('tournamentDetail.matchOpponentTbd');
  const teamAName = teamDisplayName(match.teamAId, teamA, tbdLabel);
  const teamBName = teamDisplayName(match.teamBId, teamB, tbdLabel);
  const matchTeamsReady =
    isMongoObjectId(match.teamAId) && isMongoObjectId(match.teamBId) && !!teamA && !!teamB;

  const livePointsA = Number(match.pointsA ?? 0) || 0;
  const livePointsB = Number(match.pointsB ?? 0) || 0;
  const pointsToWinLimit = Math.max(
    1,
    Math.min(
      99,
      Number((match as { pointsToWin?: unknown }).pointsToWin ?? (tournament as { pointsToWin?: unknown } | null)?.pointsToWin ?? 21) || 21
    )
  );

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
    const status = (match as { status?: string }).status;
    /** Rotation + initial server are fixed once the match is in progress (only editable while scheduled / pre-start). */
    const canEditServeSetup =
      status !== 'completed' &&
      status !== 'in_progress' &&
      (canManageTournament || isReferee);
    const bumpOrderNumber = (pid: string) => {
      if (!canEditServeSetup || order.length !== 4) return;
      const idx = order.findIndex((p) => p === pid);
      if (idx < 0) return;
      const nextIdx = (idx + 1) % 4;
      const next = [...order];
      [next[idx], next[nextIdx]] = [next[nextIdx]!, next[idx]!];
      const nextServing = servingPlayerId || String(next[0] ?? '');
      setServeOrder.mutate(
        { id: matchId, tournamentId: id, order: next, servingPlayerId: nextServing },
        { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
      );
    };

    return (
      <View style={styles.serveRow}>
        <View style={styles.serveHeader} />

        <View style={styles.servePlayersSides}>
          <View style={styles.serveSide}>
            {[0, 2].map((idx) => {
              const pid = order[idx]!;
              const u = usersById.get(pid);
              const label = u ? getTournamentPlayerDisplayName(u as any) : pid;
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
                        photoUrl={(u as any)?.photoUrl}
                      />
                    </View>
                    <View style={styles.serveOrderRow}>
                      {isServer && (match as { status?: string }).status === 'in_progress' ? <RotatingVolleyBall color="#fff" /> : null}
                    <Pressable
                      onPress={() => bumpOrderNumber(pid)}
                      disabled={!canEditServeSetup}
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
                      if (!canEditServeSetup) return;
                      setServeOrder.mutate(
                        { id: matchId, tournamentId: id, order, servingPlayerId: pid },
                        { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                      );
                    }}
                    disabled={!canEditServeSetup}
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
              const label = u ? getTournamentPlayerDisplayName(u as any) : pid;
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
                        photoUrl={(u as any)?.photoUrl}
                      />
                    </View>
                    <View style={styles.serveOrderRow}>
                      {isServer && (match as { status?: string }).status === 'in_progress' ? <RotatingVolleyBall color="#fff" /> : null}
                    <Pressable
                      onPress={() => bumpOrderNumber(pid)}
                      disabled={!canEditServeSetup}
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
                      if (!canEditServeSetup) return;
                      setServeOrder.mutate(
                        { id: matchId, tournamentId: id, order, servingPlayerId: pid },
                        { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                      );
                    }}
                    disabled={!canEditServeSetup}
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
  const totalSets = Math.max(1, Number(match.setsPerMatch ?? tournament.setsPerMatch ?? 1) || 1);
  const currentSet = Math.min(totalSets, Math.max(1, aNum + bNum + 1));
  const isCompleted = (match as { status?: string }).status === 'completed';
  const winnerId = String((match as { winnerId?: unknown }).winnerId ?? '');
  const winnerSide: 'A' | 'B' | null =
    isCompleted && winnerId
      ? winnerId === String(match.teamAId)
        ? 'A'
        : winnerId === String(match.teamBId)
          ? 'B'
          : null
      : null;

  const handlePoint = (side: 'A' | 'B', delta: 1 | -1) => {
    if (isOffline) {
      setNotice(t('common.networkError'));
      return;
    }
    if (delta === 1) {
      const nextA = side === 'A' ? livePointsA + 1 : livePointsA;
      const nextB = side === 'B' ? livePointsB + 1 : livePointsB;
      if (nextA > pointsToWinLimit || nextB > pointsToWinLimit) {
        return;
      }
    }
    const now = Date.now();
    if (now - lastTapRef.current < 180) return;
    lastTapRef.current = now;
    void Haptics.selectionAsync();
    const pulse = side === 'A' ? tapPulseA : tapPulseB;
    pulse.stopAnimation();
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
    refereePoint.mutate(
      { id: matchId, tournamentId: id, side, delta },
      {
        onError: (err: any) => {
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes('slow down')) {
            setNotice('Más lento');
            return;
          }
          if (msg.toLowerCase().includes('concurrent')) {
            setNotice('Reintentando…');
            return;
          }
          alertApiError(t, err, 'tournamentDetail.organizerActionFailed');
        },
      }
    );
  };

  const onScoreHalfPress = (side: 'A' | 'B', e: PressableEvent) => {
    const h = side === 'A' ? scorePanelHeightARef.current : scorePanelHeightBRef.current;
    if (h <= 0) return;
    const y = e.nativeEvent.locationY;
    const delta = (y < h / 2 ? 1 : -1) as 1 | -1;
    handlePoint(side, delta);
  };

  const topPad = Math.max(insets.top, 12) + 8;

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <Stack.Screen
        options={{
          headerShown: false,
          // Tighten iOS back-swipe zone so it doesn't steal taps on the left (yellow) score half.
          ...(Platform.OS === 'ios' ? { gestureResponseDistance: { start: 12 } } : {}),
        }}
      />

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
      {notice ? (
        <View style={styles.noticeBar}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}
      <Text style={styles.vsHeadline} accessibilityRole="header">
        <Text style={styles.vsTeamA}>{teamAName}</Text>
        <Text style={styles.vsSep}> VS </Text>
        <Text style={styles.vsTeamB}>{teamBName}</Text>
      </Text>
      <Text style={styles.setsIndicator}>SET {currentSet}/{totalSets}</Text>
      {isCompleted ? (
        <View style={styles.endedLegendWrap}>
          <View style={styles.endedLegendPill}>
            <Ionicons name="checkmark" size={14} color={styles.endedLegendIcon.color as string} />
            <Text style={styles.endedLegendText}>Game ended</Text>
          </View>
        </View>
      ) : null}
      <>
          <View style={styles.scoreBoard}>
            <View style={[styles.scoreSide, isCompleted ? styles.scoreSideLeftFinished : styles.scoreSideLeft]}>
              <View
                style={styles.scorePointsArea}
                collapsable={false}
                onLayout={(e) => {
                  scorePanelHeightARef.current = e.nativeEvent.layout.height;
                }}
              >
                <View style={styles.scorePointsFloat} pointerEvents="none">
                  <Animated.Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.42}
                    style={[
                      styles.scorePoints,
                      isCompleted && winnerSide === 'B' ? styles.scorePointsLoser : null,
                      {
                        transform: [
                          {
                            scale: tapPulseA.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }),
                          },
                        ],
                      },
                    ]}
                  >
                    {livePointsA}
                  </Animated.Text>
                </View>
                {!isCompleted ? (
                  <View style={styles.scoreArrowsLayer} pointerEvents="none">
                    <Text style={[styles.scoreOverlayArrow, styles.scoreOverlayArrowA, styles.scoreOverlayArrowNudgeTop]}>˄</Text>
                    <Text style={[styles.scoreOverlayArrow, styles.scoreOverlayArrowA, styles.scoreOverlayArrowNudgeBottom]}>˅</Text>
                  </View>
                ) : null}
                <GHPressable
                  style={[
                    styles.scoreTouchSurface,
                    !(canEditScore && (match as { status?: string }).status === 'in_progress')
                      ? styles.scoreOverlayDisabled
                      : null,
                  ]}
                  onPress={(e) => onScoreHalfPress('A', e)}
                  disabled={!canEditScore || (match as { status?: string }).status !== 'in_progress' || refereePoint.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Team A score"
                />
              </View>
            </View>

            <View style={styles.scoreDivider} />

            <View style={[styles.scoreSide, isCompleted ? styles.scoreSideRightFinished : styles.scoreSideRight]}>
              <View
                style={styles.scorePointsArea}
                collapsable={false}
                onLayout={(e) => {
                  scorePanelHeightBRef.current = e.nativeEvent.layout.height;
                }}
              >
                <View style={styles.scorePointsFloat} pointerEvents="none">
                  <Animated.Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.42}
                    style={[
                      styles.scorePoints,
                      styles.scorePointsRight,
                      isCompleted && winnerSide === 'A' ? styles.scorePointsLoser : null,
                      {
                        transform: [
                          {
                            scale: tapPulseB.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }),
                          },
                        ],
                      },
                    ]}
                  >
                    {livePointsB}
                  </Animated.Text>
                </View>
                {!isCompleted ? (
                  <View style={styles.scoreArrowsLayer} pointerEvents="none">
                    <Text style={[styles.scoreOverlayArrow, styles.scoreOverlayArrowB, styles.scoreOverlayArrowNudgeTop]}>˄</Text>
                    <Text style={[styles.scoreOverlayArrow, styles.scoreOverlayArrowB, styles.scoreOverlayArrowNudgeBottom]}>˅</Text>
                  </View>
                ) : null}
                <GHPressable
                  style={[
                    styles.scoreTouchSurface,
                    !(canEditScore && (match as { status?: string }).status === 'in_progress')
                      ? styles.scoreOverlayDisabled
                      : null,
                  ]}
                  onPress={(e) => onScoreHalfPress('B', e)}
                  disabled={!canEditScore || (match as { status?: string }).status !== 'in_progress' || refereePoint.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Team B score"
                />
              </View>
            </View>
          </View>

          {renderServeLine(teamAName, teamBName, order)}
        </>

      {(match as { status?: string }).status !== 'completed' && (match as { status?: string }).status !== 'in_progress' ? (
        <View style={{ gap: 8 }}>
          {!matchTeamsReady ? (
            <Text style={[styles.hint, styles.centerText, styles.refereeLine]}>{t('tournamentDetail.matchWaitingForOpponents')}</Text>
          ) : null}
          {suggestedRefTeam ? (
            <Text style={[styles.hint, styles.centerText, styles.refereeLine]}>
              {t('tournamentDetail.refereeSuggested', { name: suggestedRefTeam.name })}
            </Text>
          ) : null}
          {canManageTournament && (match as { status?: string }).status !== 'in_progress' ? (
            <Button
              title={startMatch.isPending ? t('common.loading') : String(t('tournamentDetail.startMatch') ?? '').toUpperCase()}
              onPress={() => setStartCountdown({ seconds: 5, action: 'startMatch' })}
              disabled={startMatch.isPending || !!startCountdown || isOffline || !matchTeamsReady}
              variant="secondary"
              size="sm"
              fullWidth
            />
          ) : null}
          {eligibleRefTeam ? (
            <Button
              title={claimReferee.isPending ? t('common.loading') : t('tournamentDetail.startAsReferee')}
              onPress={() => setStartCountdown({ seconds: 5, action: 'claimReferee' })}
              disabled={claimReferee.isPending || !!startCountdown || isOffline || !matchTeamsReady}
              fullWidth
            />
          ) : null}
        </View>
      ) : null}

      {(match as { status?: string }).status === 'in_progress' &&
      ((match as { refereeUserId?: unknown }).refereeUserId || showSwitchSidesReminder) ? (
        <View style={styles.refereeFooterBlock}>
          {(match as { refereeUserId?: unknown }).refereeUserId ? (
            <Text style={[styles.hint, styles.centerText, styles.refereeLine]}>
              {t('tournamentDetail.refereeActual', {
                name:
                  userId && String((match as { refereeUserId?: unknown }).refereeUserId ?? '') === userId
                    ? t('common.you')
                    : (() => {
                        const refUid = String((match as { refereeUserId?: unknown }).refereeUserId ?? '');
                        const refU = refUid ? usersById.get(refUid) : undefined;
                        return refU ? getTournamentPlayerDisplayName(refU as any) : refUid;
                      })(),
              })}
            </Text>
          ) : null}
          {canTakeoverReferee ? (
            <View style={{ marginTop: 8 }}>
              <Button
                title={t('tournamentDetail.takeControl')}
                variant="outline"
                size="sm"
                fullWidth
                disabled={claimReferee.isPending || isOffline}
                onPress={() => {
                  if (!id || !matchId) return;
                  claimReferee.mutate(
                    { id: matchId, tournamentId: id, mode: 'takeover' },
                    { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                  );
                }}
              />
            </View>
          ) : null}
          {showSwitchSidesReminder ? (
            <Animated.View
              accessible
              accessibilityRole="text"
              accessibilityLabel={t('tournamentDetail.switchSidesReminder')}
              style={[styles.switchSidesReminderRow, { transform: [{ scale: switchSidesPulse }] }]}
            >
              <MaterialCommunityIcons name="swap-horizontal" size={25} color="#ffffff" accessible={false} />
              <Text accessible={false} style={[styles.centerText, styles.switchSidesReminder]}>
                {t('tournamentDetail.switchSidesReminder')}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      ) : null}
      </View>

      {startCountdown ? (
        <View
          pointerEvents="none"
          style={[styles.countdownOverlay, { top: -topPad, paddingBottom: insets.bottom }]}
        >
          <Text style={styles.countdownText}>{startCountdown.seconds}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  // content padding like other screens
  // Extra horizontal inset on Android: system edge-back gesture competes with taps on the left (team A) panel.
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Platform.OS === 'android' ? 24 : 16,
    paddingVertical: 12,
    gap: 10,
  },
  stateTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  hint: { color: Colors.textSecondary, marginBottom: 8 },
  centerText: { textAlign: 'center' },
  noticeBar: {
    alignSelf: 'stretch',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.22)',
  },
  noticeText: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, textAlign: 'center' },
  refereeLine: { fontSize: 11, fontStyle: 'italic', textTransform: 'uppercase' },
  refereeFooterBlock: { alignSelf: 'stretch', alignItems: 'center', gap: 6, marginTop: 2 },
  switchSidesReminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 8,
  },
  switchSidesReminder: {
    fontSize: 16,
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.82,
    color: '#ffffff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  // Mirror TabScreenHeader layout: logo absolute top-left, centered content
  topBar: {
    width: '100%',
    minHeight: 50,
    marginBottom: 8,
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
  setsIndicator: {
    marginTop: -2,
    marginBottom: 6,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  endedLegendWrap: { alignItems: 'center', paddingBottom: 8 },
  endedLegendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  endedLegendIcon: { color: '#22c55e' },
  endedLegendText: { fontSize: 11, fontWeight: '900', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
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
  scoreDivider: { width: 1, backgroundColor: Colors.surfaceLight, alignSelf: 'stretch' },
  // Ensure the score panel never collapses (scheduled/preview should still show 0-0).
  // No bottom padding: avoids a dark strip between team tint and scoreBoard bottom edge.
  scoreSide: {
    flex: 1,
    minHeight: 260,
    paddingTop: 10,
    paddingBottom: 0,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  // Match the "violetMuted" panel intensity for yellow.
  scoreSideLeft: { backgroundColor: 'rgba(251, 191, 36, 0.22)' },
  scoreSideRight: { backgroundColor: Colors.violetMuted },
  /** Completed: no fill — outline uses same hues as the live panels */
  scoreSideLeftFinished: {
    backgroundColor: 'transparent',
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 0,
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  scoreSideRightFinished: {
    backgroundColor: 'transparent',
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 0,
    borderColor: Colors.violetOutline,
  },
  scoreTeam: { fontSize: 13, fontWeight: '900', color: Colors.textSecondary, textTransform: 'uppercase', textAlign: 'center' },
  scorePoints: {
    width: '100%',
    fontSize: 144,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Colors.yellow,
    textAlign: 'center',
    includeFontPadding: false,
  },
  scorePointsRight: { color: Colors.violet },
  scorePointsLoser: { opacity: 0.3 },
  // Avoid flex collapse in auto-height container: give scores a real box.
  scorePointsArea: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  // Score (zIndex 1) under arrows + single full-surface GHPressable (zIndex 3).
  scorePointsFloat: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreArrowsLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreTouchSurface: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
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
  countdownOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: { fontSize: 152, fontWeight: '900', color: Colors.text, fontStyle: 'italic' },
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

