import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useNetInfo } from '@react-native-community/netinfo';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { SimplePlayerCard } from '@/components/tournament/detail/SimplePlayerCard';
import { isTournamentPaused, isTournamentPlayActive, isTournamentStarted } from '@/lib/tournamentPlayAllowed';
import { useTranslation } from '@/lib/i18n';
import { useTheme } from '@/lib/theme/useTheme';
import { useTournament } from '@/lib/hooks/useTournaments';
import {
  applyRefereeDeltaToMatch,
  useClaimReferee,
  useMatches,
  useRefereeHeartbeat,
  useRefereePoint,
  useSetServeOrder,
  useStartMatch,
  useUpdateMatch,
} from '@/lib/hooks/useMatches';
import { useTeams } from '@/lib/hooks/useTeams';
import { useEntries } from '@/lib/hooks/useEntries';
import { useWaitlist } from '@/lib/hooks/useWaitlist';
import { useUsers } from '@/lib/hooks/useUsers';
import { useUserStore } from '@/store/useUserStore';
import { alertApiError } from '@/lib/utils/apiError';
import { normalizeMongoIdString } from '@/lib/mongoId';
import { isMongoObjectId, teamDisplayName } from '@/lib/tournamentMatchDisplay';
import { getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import { resolveRosterSlotLabel } from '@/lib/utils/resolveParticipant';
import { guestPlayerIdFromSlot, isGuestPlayerSlot } from '@/lib/playerSlots';
import type { Match, TournamentGuestPlayer } from '@/types';
import { Pressable as GHPressable, type PressableProps } from 'react-native-gesture-handler';
import { MPMark } from '@/components/ui/MPMark';
import { AppBackgroundGradient } from '@/components/ui/AppBackgroundGradient';
import { MatchDetailLoadingShell } from '@/components/match/MatchDetailLoadingShell';

type PressableEvent = Parameters<NonNullable<PressableProps['onPress']>>[0];

/** API rate limit (~300ms between points); spacing between queued mutateAsync calls. */
const REFEREE_POINT_QUEUE_GAP_MS = 320;

export default function EditMatchScreen() {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const queryClient = useQueryClient();
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const insets = useSafeAreaInsets();
  /** Android 3-button / gesture nav can still overlap UI even when `insets.bottom` is small. */
  const bottomPad = Math.max(insets.bottom, 18) + 40;
  const topPad = Math.max(insets.top, 8) + 2;
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;

  const { data: tournament, isLoading: tournamentLoading, isError: tournamentIsError } = useTournament(id);
  const { data: teams = [] } = useTeams(id ? { tournamentId: id } : undefined);
  // Joined state: entries or waitlist (used to allow any joined user into MatchDetail + refereeing).
  const { data: myEntries = [] } = useEntries(
    id && userId ? { tournamentId: id, userId } : undefined,
    { enabled: !!id && !!userId }
  );
  /** No polling here — periodic refetch was overwriting the score while pending ops were in flight. */
  const { data: matches = [], isLoading: matchesLoading } = useMatches(
    id ? { tournamentId: id } : undefined,
    id ? { enabled: !!id } : undefined
  );
  const claimReferee = useClaimReferee();
  const startMatch = useStartMatch();
  const updateMatch = useUpdateMatch();
  const refereePoint = useRefereePoint();
  const setServeOrder = useSetServeOrder();
  const refereeHeartbeat = useRefereeHeartbeat();

  /** FIFO deltas not yet confirmed by the server; UI = server match + these (see `displayedMatchForPoints`). */
  const pendingPointOpsRef = useRef<{ side: 'A' | 'B'; delta: 1 | -1 }[]>([]);
  const [pendingVersion, setPendingVersion] = useState(0);
  const drainPointQueueRunningRef = useRef(false);

  const bumpPendingVersion = useCallback(() => {
    setPendingVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    pendingPointOpsRef.current = [];
    drainPointQueueRunningRef.current = false;
    setPendingVersion((v) => v + 1);
  }, [matchId]);

  const canManageTournament = !!tournament && ((tournament.organizerIds ?? []).includes(userId ?? '') || user?.role === 'admin');

  /** Live play + betting gate (day started and organizer has not paused the tournament). */
  const tournamentPlayActive = useMemo(() => isTournamentPlayActive(tournament), [tournament]);
  const tournamentPlayLockedReason = useMemo((): 'not_started' | 'paused' | null => {
    if (!tournament) return null;
    if (!isTournamentStarted(tournament)) return 'not_started';
    if (isTournamentPaused(tournament)) return 'paused';
    return null;
  }, [tournament]);

  const teamById = useMemo(() => {
    const entries = teams
      .map((tm) => [normalizeMongoIdString(tm._id), tm] as const)
      .filter(([k]) => k.length > 0);
    return Object.fromEntries(entries);
  }, [teams]);
  const match = useMemo(() => matches.find((m) => m._id === matchId) ?? null, [matches, matchId]);
  const matchDivision = useMemo(() => {
    const d = match ? String((match as { division?: unknown }).division ?? '') : '';
    return (d === 'men' || d === 'women' || d === 'mixed') ? (d as 'men' | 'women' | 'mixed') : 'mixed';
  }, [match]);
  const { data: waitlistInfo } = useWaitlist(id, matchDivision);
  const isJoined = useMemo(() => {
    if (!userId) return false;
    if ((myEntries ?? []).some((e) => e && (e as any).userId === userId)) return true;
    return (waitlistInfo?.users ?? []).some((u) => u.userId === userId);
  }, [myEntries, userId, waitlistInfo]);

  /** Same limit resolution as the API (match field, else tournament default) so validation matches the server. */
  const matchWithPointsLimit = useMemo((): Match | null => {
    if (!match) return null;
    const fallbackPts = Math.max(
      1,
      Math.min(99, Number((tournament as { pointsToWin?: unknown } | null)?.pointsToWin ?? 21) || 21)
    );
    const rawMatchPts = Number((match as { pointsToWin?: unknown }).pointsToWin ?? NaN);
    const pts = Number.isFinite(rawMatchPts)
      ? Math.max(1, Math.min(99, rawMatchPts))
      : fallbackPts;
    return { ...match, pointsToWin: pts } as Match;
  }, [match, tournament]);

  const teamAPlayerIds = useMemo(() => {
    if (!match) return [] as string[];
    const t = teamById[normalizeMongoIdString(match.teamAId)] as { playerIds?: unknown } | undefined;
    return Array.isArray(t?.playerIds) ? (t!.playerIds as string[]).filter(Boolean) : ([] as string[]);
  }, [match, teamById]);

  const teamBPlayerIds = useMemo(() => {
    if (!match) return [] as string[];
    const t = teamById[normalizeMongoIdString(match.teamBId)] as { playerIds?: unknown } | undefined;
    return Array.isArray(t?.playerIds) ? (t!.playerIds as string[]).filter(Boolean) : ([] as string[]);
  }, [match, teamById]);

  const defaultServeOrder = useMemo(() => {
    const a1 = teamAPlayerIds[0];
    const a2 = teamAPlayerIds[1] ?? teamAPlayerIds[0];
    const b1 = teamBPlayerIds[0];
    const b2 = teamBPlayerIds[1] ?? teamBPlayerIds[0];
    return [a1, b1, a2, b2].filter(Boolean) as string[];
  }, [teamAPlayerIds, teamBPlayerIds]);

  /** Server snapshot + in-memory queue — avoids “counting back” when responses arrive out of order. */
  const displayedMatchForPoints = useMemo((): Match | null => {
    void pendingVersion;
    if (!matchWithPointsLimit) return null;
    // UX: initialize serve state locally so the FIRST side-out (often team B scoring first)
    // updates the server indicator immediately, without waiting for the first refereePoint response.
    const hasServeOrder =
      Array.isArray((matchWithPointsLimit as { serveOrder?: unknown }).serveOrder) &&
      ((matchWithPointsLimit as any).serveOrder as unknown[]).length === 4;
    const order = hasServeOrder
      ? (((matchWithPointsLimit as any).serveOrder as unknown[]).map(String).filter(Boolean) as string[])
      : defaultServeOrder;
    const canPatchServe = order.length === 4;
    const idxRaw = Number((matchWithPointsLimit as { serveIndex?: unknown }).serveIndex ?? 0);
    const idx = Number.isFinite(idxRaw) ? Math.floor(idxRaw) % 4 : 0;
    const servingRaw = String((matchWithPointsLimit as { servingPlayerId?: unknown }).servingPlayerId ?? '').trim();
    const servingPlayerId = servingRaw || String(order[idx] ?? order[0] ?? '');
    let m: Match = canPatchServe
      ? ({ ...matchWithPointsLimit, serveOrder: order, serveIndex: idx, servingPlayerId } as Match)
      : matchWithPointsLimit;
    for (const op of pendingPointOpsRef.current) {
      const n = applyRefereeDeltaToMatch(m, op.side, op.delta);
      if (!n) break;
      m = n;
    }
    return m;
  }, [matchWithPointsLimit, pendingVersion, defaultServeOrder]);

  const playerIdsForNames = useMemo(() => {
    if (!match) return [] as string[];
    const aid = normalizeMongoIdString(match.teamAId);
    const bid = normalizeMongoIdString(match.teamBId);
    const a = teams.find((t) => normalizeMongoIdString(t._id) === aid)?.playerIds ?? [];
    const b = teams.find((t) => normalizeMongoIdString(t._id) === bid)?.playerIds ?? [];
    const ref = String((match as { refereeUserId?: unknown }).refereeUserId ?? '');
    const all = [...new Set([...a, ...b, ...(ref ? [ref] : [])].filter(Boolean))];
    return all.filter((pid) => !isGuestPlayerSlot(pid));
  }, [match, teams]);
  const { data: players = [] } = useUsers(playerIdsForNames);
  const usersById = useMemo(() => new Map(players.map((u) => [u._id, u])), [players]);
  const guestMapRec = useMemo(
    () =>
      Object.fromEntries((tournament?.guestPlayers ?? []).map((g) => [g._id, g])) as Record<
        string,
        TournamentGuestPlayer
      >,
    [tournament?.guestPlayers]
  );
  const userMapRec = useMemo(() => Object.fromEntries(players.map((u) => [u._id, u])), [players]);
  const rosterSlotLabel = useCallback(
    (pid: string) => resolveRosterSlotLabel(pid, userMapRec, guestMapRec),
    [userMapRec, guestMapRec]
  );

  const [setsWonA, setSetsWonA] = useState('0');
  const [setsWonB, setSetsWonB] = useState('0');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [startCountdown, setStartCountdown] = useState<{ seconds: number; action: 'startMatch' | 'claimReferee' } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [serveOrderModalOpen, setServeOrderModalOpen] = useState(false);
  const [serveOrderDraft, setServeOrderDraft] = useState<string[] | null>(null);
  const [isEditingCompletedScore, setIsEditingCompletedScore] = useState(false);
  const [saveCompletedScoreRequested, setSaveCompletedScoreRequested] = useState(false);
  const [draftPointsA, setDraftPointsA] = useState(0);
  const [draftPointsB, setDraftPointsB] = useState(0);

  /** While live, rotation/server follow the same projected state as the score (pending queue). */
  const matchForServe =
    (match as { status?: string } | null)?.status === 'in_progress'
      ? (displayedMatchForPoints ?? matchWithPointsLimit)
      : match;
  const serveOrder = (matchForServe as { serveOrder?: unknown } | null)?.serveOrder as string[] | undefined;
  const serveIndex = Number((matchForServe as { serveIndex?: unknown } | null)?.serveIndex ?? 0) || 0;
  const servingPlayerId = String((matchForServe as { servingPlayerId?: unknown } | null)?.servingPlayerId ?? '');

  // Keep a stable reference for effects (avoid creating a new array every render).
  const order = useMemo(() => {
    const base =
      Array.isArray(serveOrder) && serveOrder.length === 4
        ? serveOrder.map(String).filter(Boolean)
        : defaultServeOrder.map(String).filter(Boolean);
    return base.slice(0, 4);
  }, [serveOrder, defaultServeOrder]);

  const computeInterleavedServeOrder = useCallback(
    (baseOrder: string[] | null | undefined): string[] => {
      const aRaw = (teamAPlayerIds ?? []).map(String).filter(Boolean);
      const bRaw = (teamBPlayerIds ?? []).map(String).filter(Boolean);
      if (aRaw.length === 0 || bRaw.length === 0) return [];

      // Ensure 2 per team (duplicate if needed, but keep ABAB invariant).
      const aPids = [aRaw[0]!, aRaw[1] ?? aRaw[0]!];
      const bPids = [bRaw[0]!, bRaw[1] ?? bRaw[0]!];

      const base = Array.isArray(baseOrder) ? baseOrder.map(String).filter(Boolean) : [];
      const inA = (pid: string) => aPids.includes(pid);
      const inB = (pid: string) => bPids.includes(pid);

      const orderWithinTeam = (team: string[]) => {
        const seen = base.filter((p) => team.includes(p));
        const p0 = seen[0] ?? team[0]!;
        const p1 = (seen.find((p) => p !== p0) ?? team.find((p) => p !== p0) ?? team[1]!)!;
        return [p0, p1] as const;
      };

      const [a0, a1] = orderWithinTeam(aPids);
      const [b0, b1] = orderWithinTeam(bPids);

      // Who starts at #1:
      // 1) baseOrder[0] team (if valid)
      // 2) servingPlayerId team (if valid)
      // 3) default Team A
      const baseFirst = base[0] ?? '';
      const starts: 'A' | 'B' =
        baseFirst && inA(baseFirst)
          ? 'A'
          : baseFirst && inB(baseFirst)
            ? 'B'
            : servingPlayerId && inB(servingPlayerId)
              ? 'B'
              : 'A';

      return starts === 'A' ? [a0, b0, a1, b1] : [b0, a0, b1, a1];
    },
    [teamAPlayerIds, teamBPlayerIds, servingPlayerId]
  );

  /** Seed draft only when opening — do not resync while open or refetches/heartbeat overwrite toggles before Save. */
  const openServeOrderModal = useCallback(() => {
    const initial = computeInterleavedServeOrder(order);
    setServeOrderDraft(initial.length === 4 ? initial : null);
    setServeOrderModalOpen(true);
  }, [computeInterleavedServeOrder, order]);

  useEffect(() => {
    if (!tournamentPlayActive && startCountdown) setStartCountdown(null);
  }, [tournamentPlayActive, startCountdown]);

  const drainPointQueue = useCallback(async () => {
    if (!id || !matchId) return;
    if (drainPointQueueRunningRef.current) return;
    if (pendingPointOpsRef.current.length === 0) return;
    drainPointQueueRunningRef.current = true;
    try {
      while (pendingPointOpsRef.current.length > 0) {
        /** Drop queued ops if cache already shows the match ended (avoids 400 after last point). */
        const cachedRows = queryClient.getQueriesData<Match[]>({ queryKey: ['matches'] });
        let abortedEarly = false;
        for (const [, rows] of cachedRows) {
          if (!rows) continue;
          const live = rows.find((m) => m._id === matchId);
          if (live && String((live as { status?: unknown }).status ?? '') !== 'in_progress') {
            pendingPointOpsRef.current = [];
            bumpPendingVersion();
            abortedEarly = true;
            break;
          }
        }
        if (abortedEarly) break;

        const op = pendingPointOpsRef.current[0]!;
        const updatedMatch = await refereePoint.mutateAsync({ id: matchId, tournamentId: id, ...op });
        pendingPointOpsRef.current = pendingPointOpsRef.current.slice(1);
        bumpPendingVersion();
        if (String((updatedMatch as { status?: unknown }).status ?? '') === 'completed') {
          pendingPointOpsRef.current = [];
          bumpPendingVersion();
          break;
        }
        if (pendingPointOpsRef.current.length > 0) {
          await new Promise((r) => setTimeout(r, REFEREE_POINT_QUEUE_GAP_MS));
        }
      }
    } catch (err: unknown) {
      pendingPointOpsRef.current = [];
      bumpPendingVersion();
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      const msg = err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? '');
      if (msg.includes('slow down')) {
        setNotice('Más lento');
        return;
      }
      if (String(msg).toLowerCase().includes('concurrent')) {
        setNotice('Reintentando…');
        return;
      }
      /** Benign races: extra taps after auto-complete or over-limit while queue drains. */
      if (msg.includes('Match is not in progress') || msg.includes('Score exceeds points limit')) {
        return;
      }
      alertApiError(t, err, 'tournamentDetail.organizerActionFailed');
    } finally {
      drainPointQueueRunningRef.current = false;
    }
  }, [id, matchId, queryClient, refereePoint, bumpPendingVersion, t]);

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
      if (!tournamentPlayActive) return;
      const curStatus = String((match as { status?: unknown } | null)?.status ?? '');
      if (action === 'startMatch') {
        // Guard: countdown is only for starting a scheduled match.
        // If the match changed state meanwhile (e.g. user paused/another ref started), don't fire startMatch late.
        if (curStatus !== 'scheduled') return;
        startMatch.mutate(
          { id: matchId, tournamentId: id },
          { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
        );
      } else {
        // Same guard for claim: avoid late claim + matches invalidation after the match already went live / ended.
        if (curStatus !== 'scheduled') return;
        claimReferee.mutate(
          { id: matchId, tournamentId: id, mode: 'claim' },
          { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
        );
      }
      return;
    }
    const h = setTimeout(() => setStartCountdown((prev) => (prev ? { ...prev, seconds: prev.seconds - 1 } : prev)), 1000);
    return () => clearTimeout(h);
  }, [startCountdown, claimReferee, id, matchId, match, startMatch, t, tournamentPlayActive]);

  useEffect(() => {
    if (!startCountdown) return;
    const status = String((match as { status?: unknown } | null)?.status ?? '');
    if (status && status !== 'scheduled') setStartCountdown(null);
  }, [match, startCountdown]);

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
    // MVP: any joined user can takeover referee when needed.
    return isJoined;
  }, [match, userId, currentRefereeUserId, canManageTournament, isJoined]);

  useEffect(() => {
    if (!id || !matchId) return;
    if (!match) return;
    if (!tournamentPlayActive) return;
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
  }, [id, matchId, match, isReferee, canManageTournament, refereeHeartbeat, tournamentPlayActive]);

  // Previously we restricted refereeing to an "eligible referee team" (same slice / not playing).
  // MVP requirement: any joined user can enter MatchDetail and act as referee.

  const suggestedRefTeam = useMemo(() => {
    if (!match) return null;
    const stage = (match as { stage?: string }).stage;
    const division = (match as { division?: string }).division;
    const category = (match as { category?: string }).category;
    const groupIndex = (match as { groupIndex?: number }).groupIndex;
    const matchTeamIds = new Set(
      [normalizeMongoIdString(match.teamAId), normalizeMongoIdString(match.teamBId)].filter(Boolean)
    );

    const inProgressTeamIds = new Set(
      matches
        .filter((m) => (m as { status?: string }).status === 'in_progress')
        .flatMap((m) => [normalizeMongoIdString(m.teamAId), normalizeMongoIdString(m.teamBId)])
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
        .flatMap((m) => [normalizeMongoIdString(m.teamAId), normalizeMongoIdString(m.teamBId)])
        .filter(Boolean)
    );

    const candidates = teams
      .filter((tm) => {
      const tid = normalizeMongoIdString(tm._id);
      if (matchTeamIds.has(tid)) return false;
      if (inProgressTeamIds.has(tid)) return false;
      if (nextScheduledTeamIds.has(tid)) return false;
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
    const scoreM = displayedMatchForPoints ?? matchWithPointsLimit;
    if (!scoreM) return false;
    const ptw = Math.max(1, Math.min(99, Number(scoreM.pointsToWin ?? 21) || 21));
    const interval = Math.max(1, Math.floor(ptw / 3));
    const a = Number(scoreM.pointsA ?? 0) || 0;
    const b = Number(scoreM.pointsB ?? 0) || 0;
    const total = a + b;
    return (
      String((match as { status?: unknown }).status ?? '') === 'in_progress' && total > 0 && total % interval === 0
    );
  }, [match, displayedMatchForPoints, matchWithPointsLimit]);

  // Match-point indicator removed: matches no longer auto-finish at pointsToWin.
  const matchPointSide = null;

  useEffect(() => {
    if (!showSwitchSidesReminder && !matchPointSide) {
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
  }, [showSwitchSidesReminder, matchPointSide, switchSidesPulse]);

  /** Right side of SET row: text (clasificación / división) or medal icon for Gold–Silver–Bronce. */
  const matchPhaseSuffix = useMemo(():
    | { mode: 'none' }
    | { mode: 'text'; label: string }
    | { mode: 'medal'; category: 'Gold' | 'Silver' | 'Bronze' } => {
    if (!match) return { mode: 'none' as const };
    const stage = String((match as { stage?: unknown }).stage ?? '');
    if (stage === 'classification') {
      const gi = (match as { groupIndex?: unknown }).groupIndex;
      const n = typeof gi === 'number' ? gi + 1 : null;
      const base = t('tournamentDetail.matchesClassification');
      const label = n != null ? `${base} · ${t('tournamentDetail.groupLabel')} ${n}` : base;
      return { mode: 'text' as const, label };
    }
    if (stage === 'category') {
      const cat = String((match as { category?: unknown }).category ?? '');
      if (cat === 'Gold' || cat === 'Silver' || cat === 'Bronze') {
        return { mode: 'medal' as const, category: cat };
      }
      return { mode: 'none' as const };
    }
    const div = (match as { division?: unknown }).division;
    if (div === 'men') return { mode: 'text' as const, label: t('tournaments.divisionMen') };
    if (div === 'women') return { mode: 'text' as const, label: t('tournaments.divisionWomen') };
    if (div === 'mixed') return { mode: 'text' as const, label: t('tournaments.divisionMixed') };
    if (div) return { mode: 'text' as const, label: String(div) };
    return { mode: 'none' as const };
  }, [match, t]);

  const canEditScore = isReferee || canManageTournament;
  const canEditLiveScore = canEditScore && tournamentPlayActive;

  const canEditCompletedScore = canManageTournament && tournamentPlayActive;

  const isFinalizePending = useMemo(() => {
    if (!updateMatch.isPending) return false;
    const vars = updateMatch.variables as { update?: { finalize?: boolean } } | undefined;
    return !!vars?.update?.finalize;
  }, [updateMatch.isPending, updateMatch.variables]);

  const beginEditCompletedScore = useCallback(() => {
    if (!match) return;
    setIsEditingCompletedScore(true);
    setSaveCompletedScoreRequested(false);
    setDraftPointsA(Number(match.pointsA ?? 0) || 0);
    setDraftPointsB(Number(match.pointsB ?? 0) || 0);
  }, [match]);

  useEffect(() => {
    if (!isEditingCompletedScore) {
      if (saveCompletedScoreRequested) setSaveCompletedScoreRequested(false);
      return;
    }
    if (saveCompletedScoreRequested && !updateMatch.isPending) {
      setSaveCompletedScoreRequested(false);
    }
  }, [isEditingCompletedScore, saveCompletedScoreRequested, updateMatch.isPending]);

  const saveEditCompletedScore = useCallback(() => {
    if (!id || !matchId) return;
    const ptsA = Math.max(0, Math.floor(Number(draftPointsA) || 0));
    const ptsB = Math.max(0, Math.floor(Number(draftPointsB) || 0));
    if (ptsA === ptsB) {
      Alert.alert(t('tournamentDetail.endMatchTieTitle'), t('tournamentDetail.endMatchTieMessage'), [
        { text: t('common.ok') },
      ]);
      return;
    }
    updateMatch.mutate(
      { id: matchId, tournamentId: id, update: { finalize: true, pointsA: ptsA, pointsB: ptsB } },
      {
        onSuccess: () => {
          setIsEditingCompletedScore(false);
          setSaveCompletedScoreRequested(false);
        },
        onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
      }
    );
  }, [draftPointsA, draftPointsB, id, matchId, updateMatch, t]);

  const finalizeMatchNow = useCallback(() => {
    if (!id || !matchId || !matchWithPointsLimit) return;
    if (!tournamentPlayActive) return;
    const ptsA = Math.max(0, Math.floor(Number(displayedMatchForPoints?.pointsA ?? matchWithPointsLimit.pointsA ?? 0) || 0));
    const ptsB = Math.max(0, Math.floor(Number(displayedMatchForPoints?.pointsB ?? matchWithPointsLimit.pointsB ?? 0) || 0));
    if (ptsA === ptsB) {
      Alert.alert(t('tournamentDetail.endMatchTieTitle'), t('tournamentDetail.endMatchTieMessage'), [
        { text: t('common.ok') },
      ]);
      return;
    }
    setStartCountdown(null);
    pendingPointOpsRef.current = [];
    updateMatch.mutate(
      {
        id: matchId,
        tournamentId: id,
        update: {
          finalize: true,
          pointsA: ptsA,
          pointsB: ptsB,
        },
      },
      {
        onSuccess: () => bumpPendingVersion(),
        onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
      }
    );
  }, [
    id,
    matchId,
    matchWithPointsLimit,
    tournamentPlayActive,
    displayedMatchForPoints,
    updateMatch,
    bumpPendingVersion,
    t,
    setStartCountdown,
  ]);

  if (!id || !matchId) {
    return (
      <View style={[styles.container, { paddingBottom: bottomPad }]}>
        <Text style={styles.stateTitle}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (tournamentLoading || matchesLoading) {
    return (
      <MatchDetailLoadingShell
        topPad={topPad}
        bottomPad={bottomPad}
        tokens={tokens}
        appNameLabel={t('common.appName')}
      />
    );
  }

  if (tournamentIsError || !tournament) {
    return (
      <View style={[styles.container, { paddingBottom: bottomPad }]}>
        <Text style={styles.stateTitle}>{t('tournamentDetail.failedToLoad')}</Text>
      </View>
    );
  }

  if (!match) {
    return (
      <View style={[styles.container, { paddingBottom: bottomPad }]}>
        <Text style={styles.stateTitle}>{t('common.error')}</Text>
        <Text style={styles.hint}>{t('tournamentDetail.failedToLoad')}</Text>
      </View>
    );
  }

  if (!canManageTournament && !isReferee && !isJoined) {
    return (
      <View style={[styles.container, { paddingBottom: bottomPad }]}>
        <Text style={styles.stateTitle}>{t('common.error')}</Text>
        <Text style={styles.hint}>{t('tournamentDetail.refereeNotAllowed')}</Text>
      </View>
    );
  }

  const teamA = teamById[normalizeMongoIdString(match.teamAId)];
  const teamB = teamById[normalizeMongoIdString(match.teamBId)];
  const tbdLabel = t('tournamentDetail.matchOpponentTbd');
  const teamAName = teamDisplayName(match.teamAId, teamA, tbdLabel);
  const teamBName = teamDisplayName(match.teamBId, teamB, tbdLabel);

  const matchTeamsReady =
    isMongoObjectId(normalizeMongoIdString(match.teamAId)) &&
    isMongoObjectId(normalizeMongoIdString(match.teamBId)) &&
    !!teamA &&
    !!teamB;

  /** Single start CTA: org/admin uses `startMatch`, others use `claimReferee` — both assign the starter as referee (API). */
  const matchStatusForUi = String((match as { status?: string }).status ?? 'scheduled');
  const canShowStartMatchCta =
    matchTeamsReady &&
    matchStatusForUi !== 'in_progress' &&
    matchStatusForUi !== 'completed' &&
    matchStatusForUi !== 'paused';
  const primaryStartAction: 'startMatch' | 'claimReferee' | null = !canShowStartMatchCta
    ? null
    : canManageTournament
      ? 'startMatch'
      : isJoined
        ? 'claimReferee'
        : null;

  const displayedPointsA =
    matchStatusForUi === 'completed' && isEditingCompletedScore
      ? Math.max(0, Math.floor(Number(draftPointsA) || 0))
      : Number(displayedMatchForPoints?.pointsA ?? match.pointsA ?? 0) || 0;
  const displayedPointsB =
    matchStatusForUi === 'completed' && isEditingCompletedScore
      ? Math.max(0, Math.floor(Number(draftPointsB) || 0))
      : Number(displayedMatchForPoints?.pointsB ?? match.pointsB ?? 0) || 0;

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
      let dur = Number((match as { durationSeconds?: unknown }).durationSeconds ?? 0);
      if (!Number.isFinite(dur) || dur < 0) return 0;
      /** Corrupt or legacy seed `durationSeconds` can be huge; cap so the clock stays readable. */
      const maxReasonableSeconds = 24 * 3600;
      return Math.min(dur, maxReasonableSeconds);
    }
    if (status === 'in_progress') {
      const startedAt = String((match as { startedAt?: unknown }).startedAt ?? '');
      const startedMs = startedAt ? Date.parse(startedAt) : NaN;
      const delta = Number.isFinite(startedMs) ? Math.max(0, Math.floor((nowMs - startedMs) / 1000)) : 0;
      return delta;
    }
    return 0;
  })();

  const renderServeLine = (teamAName: string, teamBName: string, order: string[]) => {
    const status = (match as { status?: string }).status;
    /** Serve order must be editable at any time (except after completion). */
    const canEditServeSetup =
      status !== 'completed' && (canManageTournament || isReferee) && tournamentPlayActive;

    const confirmSetServer = (pid: string) => {
      if (!canEditServeSetup) return;
      const label = rosterSlotLabel(pid).trim() || t('common.player');
      Alert.alert(
        t('tournamentDetail.setServerTitle'),
        t('tournamentDetail.setServerConfirm', { name: label }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            style: 'default',
            onPress: () =>
              setServeOrder.mutate(
                { id: matchId, tournamentId: id, order, servingPlayerId: pid },
                { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
              ),
          },
        ]
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
              const label = rosterSlotLabel(pid);
              const isGuest = isGuestPlayerSlot(pid);
              const gg = isGuest ? guestMapRec[guestPlayerIdFromSlot(pid) ?? ''] : undefined;
              const isServer = servingPlayerId ? pid === servingPlayerId : idx === (serveIndex % 4);
              return (
                <Pressable
                  key={`${pid}-${idx}`}
                  style={[styles.serveSlot, isServer ? styles.serveSlotActive : null]}
                  onPress={() => confirmSetServer(pid)}
                  disabled={!canEditServeSetup}
                  accessibilityRole="button"
                  accessibilityLabel={t('tournamentDetail.setServerTitle')}
                >
                  <View style={styles.serveSlotTopRow}>
                    <View style={styles.serveAvatarWrap} pointerEvents="none">
                      <Avatar
                        firstName={isGuest ? label : (u as any)?.firstName ?? ''}
                        lastName={isGuest ? '' : (u as any)?.lastName ?? ''}
                        gender={
                          isGuest
                            ? gg?.gender === 'male' || gg?.gender === 'female'
                              ? gg.gender
                              : undefined
                            : (u as any)?.gender === 'male' || (u as any)?.gender === 'female'
                              ? (u as any).gender
                              : undefined
                        }
                        size="xs"
                        photoUrl={isGuest ? undefined : (u as any)?.photoUrl}
                      />
                    </View>
                    <View style={styles.serveOrderRow}>
                      {isServer ? (
                        (match as { status?: string }).status === 'in_progress' ? (
                          <RotatingVolleyBall color="#fff" />
                        ) : (
                          <View pointerEvents="none" style={styles.serveBallIcon}>
                            <MaterialCommunityIcons name="volleyball" size={22} color="#fff" />
                          </View>
                        )
                      ) : null}
                    <View style={styles.serveSlotNumPill} accessibilityElementsHidden accessibilityRole="none">
                      <Text style={styles.serveSlotNum}>{idx + 1}</Text>
                    </View>
                    </View>
                  </View>
                  <View style={styles.serveSlotNameWrap} pointerEvents="none">
                    <Text style={[styles.serveSlotName, styles.serveSlotNameA, { color: tokens.accent }]} numberOfLines={3}>
                      {label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.serveSide}>
            {[1, 3].map((idx) => {
              const pid = order[idx]!;
              const u = usersById.get(pid);
              const label = rosterSlotLabel(pid);
              const isGuest = isGuestPlayerSlot(pid);
              const gg = isGuest ? guestMapRec[guestPlayerIdFromSlot(pid) ?? ''] : undefined;
              const isServer = servingPlayerId ? pid === servingPlayerId : idx === (serveIndex % 4);
              return (
                <Pressable
                  key={`${pid}-${idx}`}
                  style={[styles.serveSlot, isServer ? styles.serveSlotActive : null]}
                  onPress={() => confirmSetServer(pid)}
                  disabled={!canEditServeSetup}
                  accessibilityRole="button"
                  accessibilityLabel={t('tournamentDetail.setServerTitle')}
                >
                  <View style={styles.serveSlotTopRow}>
                    <View style={styles.serveAvatarWrap} pointerEvents="none">
                      <Avatar
                        firstName={isGuest ? label : (u as any)?.firstName ?? ''}
                        lastName={isGuest ? '' : (u as any)?.lastName ?? ''}
                        gender={
                          isGuest
                            ? gg?.gender === 'male' || gg?.gender === 'female'
                              ? gg.gender
                              : undefined
                            : (u as any)?.gender === 'male' || (u as any)?.gender === 'female'
                              ? (u as any).gender
                              : undefined
                        }
                        size="xs"
                        photoUrl={isGuest ? undefined : (u as any)?.photoUrl}
                      />
                    </View>
                    <View style={styles.serveOrderRow}>
                      {isServer ? (
                        (match as { status?: string }).status === 'in_progress' ? (
                          <RotatingVolleyBall color="#fff" />
                        ) : (
                          <View pointerEvents="none" style={styles.serveBallIcon}>
                            <MaterialCommunityIcons name="volleyball" size={22} color="#fff" />
                          </View>
                        )
                      ) : null}
                    <View style={styles.serveSlotNumPill} accessibilityElementsHidden accessibilityRole="none">
                      <Text style={styles.serveSlotNum}>{idx + 1}</Text>
                    </View>
                    </View>
                  </View>
                  <View style={styles.serveSlotNameWrap} pointerEvents="none">
                    <Text
                      style={[styles.serveSlotName, styles.serveSlotNameB, { color: tokens.accentSecondary }]}
                      numberOfLines={3}
                    >
                      {label}
                    </Text>
                  </View>
                </Pressable>
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
  const winnerId = normalizeMongoIdString((match as { winnerId?: unknown }).winnerId);
  const winnerSide: 'A' | 'B' | null =
    isCompleted && winnerId
      ? winnerId === normalizeMongoIdString(match.teamAId)
        ? 'A'
        : winnerId === normalizeMongoIdString(match.teamBId)
          ? 'B'
          : null
      : null;

  const handlePoint = (side: 'A' | 'B', delta: 1 | -1) => {
    if (isOffline) {
      setNotice(t('common.networkError'));
      return;
    }
    if (!tournamentPlayActive) return;
    const status = String((match as { status?: unknown }).status ?? '');
    if (status !== 'in_progress') return;
    const base = displayedMatchForPoints ?? matchWithPointsLimit;
    if (!base || !applyRefereeDeltaToMatch(base, side, delta)) {
      return;
    }
    pendingPointOpsRef.current = [...pendingPointOpsRef.current, { side, delta }];
    bumpPendingVersion();
    void Haptics.selectionAsync();
    const pulse = side === 'A' ? tapPulseA : tapPulseB;
    pulse.stopAnimation();
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
    void drainPointQueue();
  };

  const onScoreHalfPress = (side: 'A' | 'B', e: PressableEvent) => {
    const h = side === 'A' ? scorePanelHeightARef.current : scorePanelHeightBRef.current;
    if (h <= 0) return;
    const y = e.nativeEvent.locationY;
    const delta = (y < h / 2 ? 1 : -1) as 1 | -1;
    if (isCompleted && isEditingCompletedScore) {
      if (side === 'A') setDraftPointsA((v) => Math.max(0, Math.floor(Number(v) || 0) + delta));
      else setDraftPointsB((v) => Math.max(0, Math.floor(Number(v) || 0) + delta));
      void Haptics.selectionAsync();
      return;
    }
    handlePoint(side, delta);
  };

  const matchPointBannerColor =
    matchPointSide === 'A'
      ? tokens.accent
      : matchPointSide === 'B'
        ? tokens.accentSecondary
        : matchPointSide === 'both'
          ? Colors.yellow
          : '#ffffff';

  return (
    <View style={[styles.screen, { paddingTop: topPad }]}>
      <AppBackgroundGradient />
      <Stack.Screen
        options={{
          headerShown: false,
          // Tighten iOS back-swipe zone so it doesn't steal taps on the left (yellow) score half.
          ...(Platform.OS === 'ios' ? { gestureResponseDistance: { start: 12 } } : {}),
        }}
      />

      {/* Logo only — live clock sits under the VS headline in the scroll body */}
      <View style={styles.topBar}>
        <View style={styles.topLeftLogo} pointerEvents="none">
          <MPMark size={44} accessibilityLabel={t('common.appName')} />
        </View>
      </View>

      <View style={[styles.container, { paddingBottom: bottomPad }]}>
      {notice ? (
        <View style={styles.noticeBar}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}
      <Text style={styles.vsHeadline} accessibilityRole="header">
        <Text style={[styles.vsTeamA, { color: tokens.accent }]}>{teamAName}</Text>
        <Text style={styles.vsSep}>{t('tournamentDetail.matchVsSeparator')}</Text>
        <Text style={[styles.vsTeamB, { color: tokens.accentSecondary }]}>{teamBName}</Text>
      </Text>
      <View style={styles.matchMetaTimerBlock}>
        <View style={styles.timerLabels}>
          <Text style={styles.timerLabel}>{t('tournamentDetail.timeLabel')}</Text>
          {(match as { status?: string }).status === 'in_progress' ? (
            <Text style={styles.timerLabel}>{t('tournamentDetail.liveLabel')}</Text>
          ) : null}
        </View>
        <Text style={styles.timerValue}>{formatClock(clockSeconds)}</Text>
      </View>
      <View style={styles.setAndPhaseRow}>
        <View style={styles.setPhaseCenterWrap}>
          <View style={styles.setPhaseLeft}>
            <Text style={styles.setPhaseSetText} numberOfLines={1}>
              {t('tournamentDetail.matchSetProgress', { current: currentSet, total: totalSets })}
            </Text>
            {matchPhaseSuffix.mode !== 'none' ? (
              <>
                <Text style={styles.setPhaseSep}>·</Text>
                {matchPhaseSuffix.mode === 'medal' ? (
                  <MaterialCommunityIcons
                    name="medal-outline"
                    size={18}
                    color={
                      matchPhaseSuffix.category === 'Gold'
                        ? Colors.yellow
                        : matchPhaseSuffix.category === 'Silver'
                          ? Colors.textSecondary
                          : '#cd7f32'
                    }
                    accessibilityLabel={t(
                      matchPhaseSuffix.category === 'Gold'
                        ? 'tournaments.categoryGold'
                        : matchPhaseSuffix.category === 'Silver'
                          ? 'tournaments.categorySilver'
                          : 'tournaments.categoryBronze'
                    )}
                  />
                ) : (
                  <Text style={styles.setPhaseContextText} numberOfLines={1}>
                    {matchPhaseSuffix.label}
                  </Text>
                )}
              </>
            ) : null}
          </View>
          {(match as { status?: string }).status === 'in_progress' && (match as { refereeUserId?: unknown }).refereeUserId ? (
            <Text style={[styles.hint, styles.refereeInline]} numberOfLines={1}>
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
          ) : (match as { status?: string }).status !== 'completed' &&
            (match as { status?: string }).status !== 'in_progress' &&
            suggestedRefTeam ? (
            <Text style={[styles.hint, styles.refereeInline]} numberOfLines={1}>
              {t('tournamentDetail.refereeSuggested', { name: suggestedRefTeam.name })}
            </Text>
          ) : null}
        </View>
      </View>
      {null}
      {isCompleted ? (
        <View style={styles.endedLegendWrap}>
          <View style={styles.endedLegendPill}>
            <Ionicons name="checkmark" size={14} color={styles.endedLegendIcon.color as string} />
            <Text style={styles.endedLegendText}>{t('tournamentDetail.matchGameEnded')}</Text>
          </View>
        </View>
      ) : null}
      <>
          <View style={styles.scoreBoard}>
            <View
              style={[
                styles.scoreSide,
                isCompleted ? styles.scoreSideLeftFinished : styles.scoreSideLeft,
                !isCompleted ? ({ backgroundColor: tokens.accentMuted } as never) : null,
                isCompleted ? ({ borderColor: tokens.accentOutline } as never) : null,
              ]}
            >
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
                      { color: tokens.accent },
                      {
                        transform: [
                          {
                            scale: tapPulseA.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }),
                          },
                        ],
                      },
                    ]}
                  >
                    {displayedPointsA}
                  </Animated.Text>
                </View>
                {!isCompleted || isEditingCompletedScore ? (
                  <View style={styles.scoreArrowsLayer} pointerEvents="none">
                    <Text
                      style={[
                        styles.scoreOverlayArrow,
                        styles.scoreOverlayArrowA,
                        styles.scoreOverlayArrowNudgeTop,
                        { color: tokens.accent },
                      ]}
                    >
                      ˄
                    </Text>
                    <Text
                      style={[
                        styles.scoreOverlayArrow,
                        styles.scoreOverlayArrowA,
                        styles.scoreOverlayArrowNudgeBottom,
                        { color: tokens.accent },
                      ]}
                    >
                      ˅
                    </Text>
                  </View>
                ) : null}
                <GHPressable
                  style={[
                    styles.scoreTouchSurface,
                    !(
                      (canEditLiveScore && (match as { status?: string }).status === 'in_progress') ||
                      (isCompleted && isEditingCompletedScore && canEditCompletedScore)
                    )
                      ? styles.scoreOverlayDisabled
                      : null,
                  ]}
                  onPress={(e) => onScoreHalfPress('A', e)}
                  disabled={
                    !(
                      (canEditLiveScore && (match as { status?: string }).status === 'in_progress') ||
                      (isCompleted && isEditingCompletedScore && canEditCompletedScore)
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={t('tournamentDetail.matchScoreSideA')}
                />
              </View>
            </View>

            <View style={styles.scoreDivider} />

            <View
              style={[
                styles.scoreSide,
                isCompleted ? styles.scoreSideRightFinished : styles.scoreSideRight,
                !isCompleted ? ({ backgroundColor: tokens.accentSecondaryMuted } as never) : null,
                isCompleted ? ({ borderColor: tokens.accentSecondaryOutline } as never) : null,
              ]}
            >
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
                      { color: tokens.accentSecondary },
                      {
                        transform: [
                          {
                            scale: tapPulseB.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }),
                          },
                        ],
                      },
                    ]}
                  >
                    {displayedPointsB}
                  </Animated.Text>
                </View>
                {!isCompleted || isEditingCompletedScore ? (
                  <View style={styles.scoreArrowsLayer} pointerEvents="none">
                    <Text
                      style={[
                        styles.scoreOverlayArrow,
                        styles.scoreOverlayArrowB,
                        styles.scoreOverlayArrowNudgeTop,
                        { color: tokens.accentSecondary },
                      ]}
                    >
                      ˄
                    </Text>
                    <Text
                      style={[
                        styles.scoreOverlayArrow,
                        styles.scoreOverlayArrowB,
                        styles.scoreOverlayArrowNudgeBottom,
                        { color: tokens.accentSecondary },
                      ]}
                    >
                      ˅
                    </Text>
                  </View>
                ) : null}
                <GHPressable
                  style={[
                    styles.scoreTouchSurface,
                    !(
                      (canEditLiveScore && (match as { status?: string }).status === 'in_progress') ||
                      (isCompleted && isEditingCompletedScore && canEditCompletedScore)
                    )
                      ? styles.scoreOverlayDisabled
                      : null,
                  ]}
                  onPress={(e) => onScoreHalfPress('B', e)}
                  disabled={
                    !(
                      (canEditLiveScore && (match as { status?: string }).status === 'in_progress') ||
                      (isCompleted && isEditingCompletedScore && canEditCompletedScore)
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={t('tournamentDetail.matchScoreSideB')}
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
          {primaryStartAction ? (
            <>
              {tournamentPlayLockedReason === 'not_started' ? (
                <Text style={[styles.hint, styles.centerText, styles.refereeLine]}>
                  {t('tournamentDetail.tournamentNotStartedYet')}
                </Text>
              ) : null}
              {tournamentPlayLockedReason === 'paused' ? (
                <Text style={[styles.hint, styles.centerText, styles.refereeLine]}>
                  {t('tournamentDetail.tournamentPausedHint')}
                </Text>
              ) : null}
              <View style={styles.preStartActionsRow}>
                <View style={styles.preStartActionCol}>
                  <Button
                    title={
                      (primaryStartAction === 'startMatch' ? startMatch.isPending : claimReferee.isPending)
                        ? t('common.loading')
                        : String(t('tournamentDetail.startMatch') ?? '').toUpperCase()
                    }
                    onPress={() => {
                      if (!tournamentPlayActive) return;
                      setStartCountdown({ seconds: 3, action: primaryStartAction });
                    }}
                    disabled={
                      !tournamentPlayActive ||
                      (primaryStartAction === 'startMatch' ? startMatch.isPending : claimReferee.isPending) ||
                      !!startCountdown ||
                      isOffline
                    }
                    variant="secondary"
                    size="sm"
                    fullWidth
                    titleStyle={[styles.startMatchButtonTitle, { color: '#fff' }]}
                  />
                </View>
                <View style={styles.preStartActionCol}>
                  <Button
                    title={String(t('tournamentDetail.manageServeOrder') ?? '').toUpperCase()}
                    onPress={openServeOrderModal}
                    disabled={!tournamentPlayActive || isOffline}
                    variant="muted"
                    size="sm"
                    fullWidth
                    titleStyle={styles.startMatchButtonTitle}
                  />
                </View>
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      <Modal
        visible={serveOrderModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setServeOrderModalOpen(false);
          setServeOrderDraft(null);
        }}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setServeOrderModalOpen(false);
              setServeOrderDraft(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={String(t('common.done') ?? 'Done')}
          />
          <View style={styles.modalSheetWrap} pointerEvents="box-none">
            <View style={[styles.modalSheet, { borderColor: tokens.border, backgroundColor: Colors.background }]}>
              <Text style={[styles.modalTitle, { color: Colors.text }]} numberOfLines={2}>
                {t('tournamentDetail.manageServeOrder')}
              </Text>
              {null}
              {(() => {
                const canEdit = (canManageTournament || isReferee) && tournamentPlayActive && (match as { status?: string }).status !== 'completed';
                const labelFor = (pid: string) => (pid ? rosterSlotLabel(pid).trim() || t('common.player') : '—');

                const draft =
                  Array.isArray(serveOrderDraft) && serveOrderDraft.length === 4
                    ? serveOrderDraft
                    : computeInterleavedServeOrder(order);

                const bPids = (teamBPlayerIds ?? []).map(String).filter(Boolean);
                const inB = (pid: string) => bPids.includes(pid);
                const startsTeam: 'A' | 'B' = draft[0] && inB(String(draft[0])) ? 'B' : 'A';
                const swapWithin = (team: 'A' | 'B') => {
                  if (!canEdit || draft.length !== 4) return;
                  const isTeamOnOddSlots = team === startsTeam;
                  const i0 = isTeamOnOddSlots ? 0 : 1;
                  const i1 = isTeamOnOddSlots ? 2 : 3;
                  const next = [...draft];
                  [next[i0], next[i1]] = [next[i1]!, next[i0]!];
                  setServeOrderDraft(computeInterleavedServeOrder(next));
                };
                const toggleOddTeam = () => {
                  if (!canEdit || draft.length !== 4) return;
                  // Switch which team owns slots 1&3 by swapping pairs (ABAB <-> BABA)
                  const next = [draft[1]!, draft[0]!, draft[3]!, draft[2]!];
                  setServeOrderDraft(computeInterleavedServeOrder(next));
                };

                return (
                  <>
                    <View style={styles.serveControlsRow}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.serveControlBtn,
                          { borderColor: tokens.border },
                          { backgroundColor: 'transparent', borderColor: Colors.textMuted, overflow: 'hidden' },
                          pressed ? { opacity: 0.92 } : null,
                        ]}
                        disabled={!canEdit || draft.length !== 4}
                        onPress={toggleOddTeam}
                        accessibilityRole="button"
                        accessibilityLabel={t('tournamentDetail.serveOrderToggleOddTeam')}
                      >
                        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                          <Svg viewBox="0 0 1 1" preserveAspectRatio="none" width="100%" height="100%">
                            <Defs>
                              <SvgLinearGradient id="serveToggleDiag" x1="0" y1="0" x2="1" y2="1">
                                <Stop offset="0" stopColor={tokens.accentMuted} stopOpacity={1} />
                                <Stop offset="0.5" stopColor={tokens.accentMuted} stopOpacity={1} />
                                <Stop offset="0.5" stopColor={tokens.accentSecondaryMuted} stopOpacity={1} />
                                <Stop offset="1" stopColor={tokens.accentSecondaryMuted} stopOpacity={1} />
                              </SvgLinearGradient>
                            </Defs>
                            <Rect x={0} y={0} width={1} height={1} fill="url(#serveToggleDiag)" />
                          </Svg>
                        </View>
                        <Text style={styles.serveControlText}>{t('tournamentDetail.serveOrderToggleOddTeam')}</Text>
                      </Pressable>
                      <View style={styles.serveControlsRowTwoCols}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.serveControlBtn,
                            styles.serveControlBtnHalf,
                            { borderColor: tokens.border },
                            { backgroundColor: tokens.accent, borderColor: tokens.accentOutline },
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                          disabled={!canEdit || draft.length !== 4}
                          onPress={() => swapWithin('A')}
                          accessibilityRole="button"
                          accessibilityLabel={t('tournamentDetail.swapServeA', { team: teamAName })}
                        >
                          <Text style={styles.serveControlText} numberOfLines={1}>
                            {t('tournamentDetail.serveOrderTogglePlayers')}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [
                            styles.serveControlBtn,
                            styles.serveControlBtnHalf,
                            { borderColor: tokens.border },
                            { backgroundColor: tokens.accentSecondary, borderColor: tokens.accentSecondaryOutline },
                            pressed ? { opacity: 0.92 } : null,
                          ]}
                          disabled={!canEdit || draft.length !== 4}
                          onPress={() => swapWithin('B')}
                          accessibilityRole="button"
                          accessibilityLabel={t('tournamentDetail.swapServeB', { team: teamBName })}
                        >
                          <Text style={styles.serveControlText} numberOfLines={1}>
                            {t('tournamentDetail.serveOrderTogglePlayers')}
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.serveOrderList}>
                      {[0, 1, 2, 3].map((i) => (
                        <View key={i} style={styles.serveOrderRowWrap}>
                          <Text style={[styles.serveOrderNum, { color: Colors.textMuted }]}>{`#${i + 1}`}</Text>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            {(() => {
                              const pid = String(draft[i] ?? '');
                              const isGuest = isGuestPlayerSlot(pid);
                              const gg = isGuest ? guestMapRec[guestPlayerIdFromSlot(pid) ?? ''] : undefined;
                              const u = pid ? usersById.get(pid) : undefined;
                              const name = labelFor(pid);
                              const inA = (teamAPlayerIds ?? []).map(String).includes(pid);
                              const bg = inA ? tokens.accent : tokens.accentSecondary;
                              const gender =
                                isGuest
                                  ? gg?.gender === 'male' || gg?.gender === 'female'
                                    ? gg.gender
                                    : undefined
                                  : (u as any)?.gender === 'male' || (u as any)?.gender === 'female'
                                    ? (u as any).gender
                                    : undefined;
                              const photoUrl = isGuest ? undefined : (u as any)?.photoUrl;
                              return (
                                <SimplePlayerCard
                                  name={name}
                                  gender={gender}
                                  photoUrl={photoUrl}
                                  compact
                                  style={{ backgroundColor: 'transparent', borderWidth: 1.5, borderColor: bg }}
                                />
                              );
                            })()}
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                );
              })()}
              <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
                <Button
                  title={String(t('common.save') ?? 'Save').toUpperCase()}
                  onPress={() => {
                    // Always persist an interleaved, 4-player order.
                    const next =
                      Array.isArray(serveOrderDraft) && serveOrderDraft.length === 4
                        ? computeInterleavedServeOrder(serveOrderDraft)
                        : computeInterleavedServeOrder(order);
                    const keepServing = servingPlayerId || '';
                    if (next.length === 4) {
                      setServeOrder.mutate(
                        { id: matchId, tournamentId: id, order: next, ...(keepServing ? { servingPlayerId: keepServing } : null) },
                        { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                      );
                    }
                    setServeOrderModalOpen(false);
                    setServeOrderDraft(null);
                  }}
                  disabled={!tournamentPlayActive || isOffline}
                  variant="muted"
                  size="sm"
                  fullWidth
                  titleStyle={styles.startMatchButtonTitle}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {null}

      {(match as { status?: string }).status === 'in_progress' && canEditLiveScore && matchTeamsReady ? (
        <View style={{ marginTop: 8, paddingBottom: bottomPad }}>
          <View style={styles.preStartActionsRow}>
            <View style={styles.preStartActionCol}>
              <Button
                title={isFinalizePending ? t('common.loading') : String(t('common.finish') ?? 'Finish').toUpperCase()}
                onPress={finalizeMatchNow}
                disabled={isFinalizePending || isOffline || !tournamentPlayActive}
                variant="danger"
                size="sm"
                fullWidth
                titleStyle={styles.startMatchButtonTitle}
              />
            </View>
            <View style={styles.preStartActionCol}>
              <Button
                title={String(t('tournamentDetail.manageServeOrder') ?? '').toUpperCase()}
                onPress={openServeOrderModal}
                disabled={isOffline || !tournamentPlayActive}
                variant="muted"
                size="sm"
                fullWidth
                titleStyle={styles.startMatchButtonTitle}
              />
            </View>
          </View>
        </View>
      ) : null}

      {(match as { status?: string }).status === 'completed' && canEditScore ? (
        <View style={{ marginTop: 8, paddingBottom: bottomPad }}>
          <Button
            title={
              isEditingCompletedScore
                ? String(t('common.save') ?? 'Save').toUpperCase()
                : String(t('common.edit') ?? 'Edit').toUpperCase()
            }
            onPress={() => {
              if (!tournamentPlayActive) return;
              if (!canEditCompletedScore) return;
              if (isEditingCompletedScore) {
                setSaveCompletedScoreRequested(true);
                saveEditCompletedScore();
              } else {
                beginEditCompletedScore();
              }
            }}
            disabled={isOffline || !tournamentPlayActive || !canEditCompletedScore}
            loading={isEditingCompletedScore && saveCompletedScoreRequested && updateMatch.isPending}
            variant={isEditingCompletedScore ? 'secondary' : 'secondary'}
            size="sm"
            fullWidth
            titleStyle={[styles.startMatchButtonTitle, { color: '#fff' }]}
          />
        </View>
      ) : null}

      {null}

      {(match as { status?: string }).status === 'in_progress' &&
      (showSwitchSidesReminder || matchPointSide || canTakeoverReferee) ? (
        <View style={styles.refereeFooterBlock}>
          {canTakeoverReferee ? (
            <View style={{ marginTop: 8 }}>
              <Button
                title={t('tournamentDetail.takeControl')}
                variant="outline"
                size="sm"
                fullWidth
                disabled={claimReferee.isPending || isOffline || !tournamentPlayActive}
                onPress={() => {
                  if (!id || !matchId || !tournamentPlayActive) return;
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
          {matchPointSide ? (
            <Animated.View
              accessible
              accessibilityRole="text"
              accessibilityLabel={t('tournamentDetail.matchPointBanner')}
              style={[styles.matchPointBannerRow, { transform: [{ scale: switchSidesPulse }] }]}
            >
              <MaterialCommunityIcons name="medal" size={25} color={matchPointBannerColor} accessible={false} />
              <Text accessible={false} style={[styles.centerText, styles.switchSidesReminder, { color: matchPointBannerColor }]}>
                {t('tournamentDetail.matchPointBanner')}
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

      {null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  // content padding like other screens
  // Extra horizontal inset on Android: system edge-back gesture competes with taps on the left (team A) panel.
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: Platform.OS === 'android' ? 24 : 16,
    paddingTop: 0,
    paddingBottom: 12,
    gap: 8,
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
  refereeInline: { fontSize: 11, fontStyle: 'italic', textTransform: 'uppercase', flexShrink: 1, textAlign: 'center' },
  startMatchButtonTitle: { fontStyle: 'italic' },
  preStartActionsRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  preStartActionCol: { flex: 1 },
  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'stretch' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheetWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 18 },
  modalSheet: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  modalTitle: { fontSize: 16, fontWeight: '900', fontStyle: 'italic', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  modalHint: { fontSize: 12, fontWeight: '700', fontStyle: 'italic', paddingHorizontal: 16, paddingBottom: 12 },
  modalGrid: { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  modalActionBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12 },
  modalActionText: { fontSize: 12, fontWeight: '900', fontStyle: 'italic', textTransform: 'uppercase' },
  modalFooter: { paddingVertical: 12, alignItems: 'center', borderTopWidth: 1 },
  modalFooterText: { fontSize: 13, fontWeight: '900' },
  serveControlsRow: { gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  serveControlsRowTwoCols: { flexDirection: 'row', gap: 10 },
  serveControlBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  serveControlBtnHalf: { flex: 1 },
  serveControlText: { fontSize: 11, fontWeight: '900', color: '#fff', fontStyle: 'italic', textTransform: 'uppercase' },
  serveOrderList: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  serveOrderNum: { width: 40, fontSize: 16, fontWeight: '900', fontStyle: 'italic' },
  serveOrderRowWrap: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  refereeFooterBlock: { alignSelf: 'stretch', alignItems: 'center', gap: 6, marginTop: 2 },
  switchSidesReminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 8,
  },
  matchPointBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 8,
    marginTop: 2,
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
    minHeight: 46,
    marginBottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  topLeftLogo: { position: 'absolute', left: 0, top: 0, height: 46, width: 46 },
  vsHeadline: {
    fontSize: 16,
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
    marginTop: -2,
  },
  vsTeamA: { color: Colors.text, fontWeight: '900' },
  vsTeamB: { color: Colors.text, fontWeight: '900' },
  vsSep: { color: Colors.textMuted, fontWeight: '900' },
  matchMetaTimerBlock: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 6,
  },
  setAndPhaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'stretch',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  setPhaseCenterWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 6 },
  setPhaseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
    flexWrap: 'wrap',
  },
  setPhaseSetText: {
    fontSize: 12,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flexShrink: 0,
  },
  setPhaseSep: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.textMuted,
    opacity: 0.75,
    flexShrink: 0,
  },
  setPhaseContextText: {
    fontSize: 12,
    fontWeight: '800',
    fontStyle: 'italic',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flexShrink: 1,
    textAlign: 'center',
    minWidth: 0,
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
  // Accent-tinted live panel (left).
  scoreSideLeft: { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  scoreSideRight: { backgroundColor: Colors.surfaceLight },
  /** Completed: no fill — outline uses same hues as the live panels */
  scoreSideLeftFinished: {
    backgroundColor: 'transparent',
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  scoreSideRightFinished: {
    backgroundColor: 'transparent',
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 0,
    borderColor: Colors.surfaceLight,
  },
  scoreTeam: { fontSize: 13, fontWeight: '900', color: Colors.textSecondary, textTransform: 'uppercase', textAlign: 'center' },
  scorePoints: {
    width: '100%',
    fontSize: 144,
    fontWeight: '900',
    fontStyle: 'italic',
    color: Colors.text,
    textAlign: 'center',
    includeFontPadding: false,
  },
  scorePointsRight: { color: Colors.text },
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
  scoreOverlayArrowA: { color: Colors.text, opacity: 0.62 },
  scoreOverlayArrowB: { color: Colors.text, opacity: 0.62 },
  scoreOverlayArrowNudgeTop: { marginTop: -10 },
  scoreOverlayArrowNudgeBottom: { marginBottom: -26 },
  serveRow: { gap: 8, paddingVertical: 4 },
  serveHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  // (serve order editing UI lives in a modal triggered by the CTA row)
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
    backgroundColor: Colors.surfaceLight,
  },
  serveSlotNameWrap: { alignSelf: 'stretch' },
  serveSlotName: { fontSize: 13, fontWeight: '900', fontStyle: 'italic', lineHeight: 16 },
  serveSlotNameA: { color: Colors.text },
  serveSlotNameB: { color: Colors.text },
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

