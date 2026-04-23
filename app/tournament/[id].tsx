import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, Share, Alert, Pressable, Platform, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import type {
  Gender,
  TournamentDivision,
  Team,
  Entry,
  TournamentCategory,
  TournamentGuestPlayer,
} from '@/types';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import type { OrganizerMenuItem } from '@/components/tournament/TournamentOrganizerMenu';
import { TournamentOrganizerMenu } from '@/components/tournament/TournamentOrganizerMenu';
import { config, shouldUseDevMocks } from '@/lib/config';
import { DEV_TOURNAMENT_ID, MOCK_DEV_CATEGORY_MATCHES, MOCK_DEV_TOURNAMENT } from '@/lib/mocks/devTournamentMocks';
import { Skeleton } from '@/components/ui/Skeleton';
import { GroupsTab } from '@/components/tournament/detail/GroupsTab';
import { PlayersTab } from '@/components/tournament/detail/PlayersTab';
import { BetsTab } from '@/components/tournament/detail/BetsTab';
import { TeamsTab } from '@/components/tournament/detail/TeamsTab';
import { TeamSlotWaitlistSection } from '@/components/tournament/detail/TeamSlotWaitlistSection';
import { TournamentTeamCard, tournamentTeamCardStyles } from '@/components/tournament/detail/TournamentTeamCard';
import { FixtureTab } from '@/components/tournament/detail/FixtureTab';
import { TournamentHeader } from '@/components/tournament/detail/TournamentHeader';
import { TournamentTabsBar } from '@/components/tournament/detail/TournamentTabsBar';
import {
  useTournament,
  useDeleteTournament,
  useUpdateTournament,
  useRebalanceTournamentGroups,
  useRandomizeTournamentGroups,
  useStartTournament,
  useFinalizeClassification,
  useRemoveTournamentPlayer,
} from '@/lib/hooks/useTournaments';
import { useTeams, useDeleteTeam, useUpdateTeam } from '@/lib/hooks/useTeams';
import { useEntries, useCreateEntry, useDeleteEntry } from '@/lib/hooks/useEntries';
import { useWaitlist, useJoinWaitlist, useLeaveWaitlist, useInvitePartnerFromWaitlist } from '@/lib/hooks/useWaitlist';
import { useMatches } from '@/lib/hooks/useMatches';
import { useTournamentBetting, usePlaceTournamentBet } from '@/lib/hooks/useTournamentBetting';
import { useUsers } from '@/lib/hooks/useUsers';
import { useUserStore } from '@/store/useUserStore';
import { useLanguageStore } from '@/store/useLanguageStore';
import { getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import { useNetInfo } from '@react-native-community/netinfo';
import { isGuestPlayerSlot } from '@/lib/playerSlots';
import { resolveRosterSlotLabel, tournamentGuestDisplayName } from '@/lib/utils/resolveParticipant';
import { buildSeededClassificationData } from '@/lib/tournamentFixtureSeed';
import { assignCategories, computeStandingsForGroup, tieBreakOrdinal } from '@/lib/tournamentStandings';
import { normalizeMongoIdString } from '@/lib/mongoId';
import { resolveTeamForFixture } from '@/lib/tournamentMatchDisplay';
import { divisionForEntry, divisionForTeam, type DivisionTab as DivisionTabUtil } from '@/lib/tournamentDivision';
import { useTheme } from '@/lib/theme/useTheme';
import {
  maxPlayerSlotsForTournament,
  normalizeGroupCount,
  shouldOfferGroupRebalance,
  teamGroupIndex,
  tournamentGroupPlacementPending,
  validateTournamentGroups,
} from '@/lib/tournamentGroups';
import { alertApiError } from '@/lib/utils/apiError';
import { isTournamentPaused, isTournamentPlayActive, isTournamentStarted } from '@/lib/tournamentPlayAllowed';
import {
  missingDivisionForOrganizers,
  organizerOnlyCoversFromTournament,
  tournamentDivisionsNormalized,
} from '@/lib/tournamentOrganizerCoverage';
import { tournamentsApi } from '@/lib/api';
import { OrganizeOnlyDivisionsModal } from '@/components/tournament/detail/OrganizeOnlyDivisionsModal';
import { NotificationsInboxButton } from '@/components/notifications/NotificationsInboxButton';
import { openVenueInMaps } from '@/components/tournament/venueMapShared';
import { AppBackgroundGradient } from '@/components/ui/AppBackgroundGradient';
import { PersistentBottomTabs, PERSISTENT_TABS_HEIGHT } from '@/components/ui/PersistentBottomTabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
function hasValidGender(g?: Gender | string): g is Gender {
  return g === 'male' || g === 'female';
}

function canJoinDivisionByGender(division: DivisionTab, gender: Gender | string | undefined): boolean {
  // Tournament participation requires binary genders. If missing/invalid, disallow joining any division.
  if (!hasValidGender(gender)) return false;
  if (division === 'mixed') return true;
  if (division === 'men') return gender === 'male';
  if (division === 'women') return gender === 'female';
  return false;
}

/** Tournament name in the info card (same look as the former nav title). */
const tournamentNameInCardStyle = {
  // Keep consistent with the selected tab color (see override where rendered).
  color: Colors.text,
  fontSize: 17,
  fontWeight: '600',
  fontStyle: 'italic',
  textTransform: 'uppercase',
} as const;

function TournamentDetailsNavTitle() {
  const { t } = useTranslation();
  return (
    <Text style={tournamentDetailsNavTitleStyle} numberOfLines={1}>
      {t('tournamentDetail.tournamentDetails')}
    </Text>
  );
}

const tournamentDetailsNavTitleStyle = {
  color: '#e5e5e5',
  fontSize: 17,
  fontWeight: '600',
  fontStyle: 'italic',
  textTransform: 'uppercase',
} as const;

type TournamentTab = 'players' | 'teams' | 'groups' | 'bets' | 'fixture';
type DivisionTab = DivisionTabUtil;
type MatchCategoryTab = 'Gold' | 'Silver' | 'Bronze';
type MatchSubTab = 'live' | 'classification' | MatchCategoryTab;

const TAB_CONFIG: {
  id: TournamentTab;
  icon: keyof typeof Ionicons.glyphMap | 'volleyball';
  labelKey:
    | 'tournamentDetail.tabPlayers'
    | 'tournamentDetail.tabTeams'
    | 'tournamentDetail.tabGroups'
    | 'tournamentDetail.tabBets'
    | 'tournamentDetail.tabFixture';
}[] = [
  { id: 'players', icon: 'people-outline', labelKey: 'tournamentDetail.tabPlayers' },
  { id: 'teams', icon: 'shield-outline', labelKey: 'tournamentDetail.tabTeams' },
  { id: 'groups', icon: 'grid-outline', labelKey: 'tournamentDetail.tabGroups' },
  { id: 'bets', icon: 'stats-chart-outline', labelKey: 'tournamentDetail.tabBets' },
  { id: 'fixture', icon: 'volleyball', labelKey: 'tournamentDetail.tabFixture' },
];

export default function TournamentDetailScreen() {
  const { t, i18n } = useTranslation();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const rawId = useLocalSearchParams<{ id: string | string[] }>().id;
  const id =
    typeof rawId === 'string'
      ? rawId.trim() || undefined
      : Array.isArray(rawId) && typeof rawId[0] === 'string'
        ? rawId[0].trim() || undefined
        : undefined;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TournamentTab>('players');
  const [activeDivision, setActiveDivision] = useState<DivisionTab>('mixed');
  const [activeMatchesSubtab, setActiveMatchesSubtab] = useState<MatchSubTab>('classification');
  const [organizeOnlyModal, setOrganizeOnlyModal] = useState<{
    mode: 'promote' | 'self';
    targetUserId: string;
    playerName: string;
    selected: TournamentDivision[];
  } | null>(null);
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;
  const opponentTbdLabel = t('tournamentDetail.matchOpponentTbd');
  const storedLanguage = useLanguageStore((s) => s.language);
  const canEnroll = hasValidGender(user?.gender);
  const netInfo = useNetInfo();
  const isOffline = (netInfo.isConnected === false || netInfo.isInternetReachable === false) && !shouldUseDevMocks();
  const requireOnline = useCallback((): boolean => {
    if (!isOffline) return true;
    Alert.alert(t('common.error'), t('common.offlineBanner'));
    return false;
  }, [isOffline, t]);

  const [pullRefreshing, setPullRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { data: tournament, isLoading: loadingTournament, isError: errorTournament, error: tournamentError } = useTournament(id);
  const { data: teams = [], isLoading: loadingTeams } = useTeams(id ? { tournamentId: id } : undefined);
  /** Tournament roster rows (joined + in_team). */
  const { data: entries = [] } = useEntries(id ? { tournamentId: id } : undefined);
  /** Current user's entry for this tournament (any teamId); used to leave — not the inTeamOnly roster list. */
  const { data: myTournamentEntries = [] } = useEntries(
    id && userId ? { tournamentId: id, userId } : undefined,
    { enabled: !!id && !!userId }
  );
  const joinWaitlist = useJoinWaitlist();
  const leaveWaitlist = useLeaveWaitlist();
  const invitePartnerFromWaitlist = useInvitePartnerFromWaitlist();

  const createEntry = useCreateEntry();
  const deleteTournament = useDeleteTournament();
  const updateTournament = useUpdateTournament();
  const deleteEntry = useDeleteEntry();
  const deleteTeam = useDeleteTeam();
  const updateTeam = useUpdateTeam();
  const rebalanceGroupsMutation = useRebalanceTournamentGroups();
  const randomizeGroupsMutation = useRandomizeTournamentGroups();
  const startTournamentMutation = useStartTournament();
  const finalizeClassificationMutation = useFinalizeClassification();
  const removeTournamentPlayer = useRemoveTournamentPlayer();
  const placeTournamentBetMutation = usePlaceTournamentBet(id);

  const guestMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => tournamentsApi.action(id!, body) as Promise<unknown>,
    onMutate: async (variables) => {
      if (!id) return undefined;
      const act = typeof variables === 'object' && variables && 'action' in variables ? String((variables as { action?: unknown }).action) : '';
      if (act !== 'deleteGuestPlayer') return undefined;
      const guestId =
        typeof variables === 'object' && variables && 'guestId' in variables ? String((variables as { guestId?: unknown }).guestId ?? '') : '';
      if (!guestId) return undefined;

      // Optimistic update: remove guest from tournament guestPlayers immediately.
      await queryClient.cancelQueries({ queryKey: ['tournament', id] });
      const prev = queryClient.getQueryData(['tournament', id]) as any;
      queryClient.setQueryData(['tournament', id], (cur: any) => {
        if (!cur) return cur;
        const list = Array.isArray(cur.guestPlayers) ? cur.guestPlayers : [];
        return { ...cur, guestPlayers: list.filter((g: any) => String(g?._id ?? '') !== guestId) };
      });

      return { prevTournament: prev };
    },
    onError: (_err, variables, context) => {
      const act = typeof variables === 'object' && variables && 'action' in variables ? String((variables as { action?: unknown }).action) : '';
      if (act !== 'deleteGuestPlayer') return;
      const prev = (context as any)?.prevTournament;
      if (id && prev) {
        queryClient.setQueryData(['tournament', id], prev);
      }
    },
    onSuccess: (_data, variables) => {
      if (!id) return;
      void queryClient.invalidateQueries({ queryKey: ['tournament', id] });
      void queryClient.invalidateQueries({ queryKey: ['teams'] });
      void queryClient.invalidateQueries({ queryKey: ['entries'] });
      const act = typeof variables === 'object' && variables && 'action' in variables ? String((variables as { action?: unknown }).action) : '';
      if (act === 'pauseTournament' || act === 'resumeTournament') {
        void queryClient.invalidateQueries({ queryKey: ['matches'] });
        void queryClient.invalidateQueries({ queryKey: ['tournament', id, 'betting'] });
      }
    },
  });

  const handleTournamentPullRefresh = useCallback(async () => {
    if (!id || shouldUseDevMocks()) return;
    if (!requireOnline()) return;
    setPullRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tournament', id] }),
        queryClient.invalidateQueries({ queryKey: ['teams', { tournamentId: id }] }),
        queryClient.invalidateQueries({ queryKey: ['matches', { tournamentId: id }] }),
        queryClient.invalidateQueries({ queryKey: ['waitlist', id] }),
        queryClient.invalidateQueries({ queryKey: ['tournament', id, 'betting'] }),
        queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
        queryClient.invalidateQueries({
          predicate: (q) => {
            const k = q.queryKey;
            if (k[0] !== 'entries' || typeof k[1] !== 'object' || k[1] === null) return false;
            return (k[1] as { tournamentId?: string }).tournamentId === id;
          },
        }),
        queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'users' }),
      ]);
    } finally {
      setPullRefreshing(false);
    }
  }, [id, queryClient, requireOnline]);

  const { data: allMatches = [] } = useMatches(
    id ? { tournamentId: id } : undefined,
    id
      ? {
          enabled: !!id,
          refetchIntervalMs: activeTab === 'fixture' || activeTab === 'bets' ? 7_000 : undefined,
        }
      : undefined
  );
  const classificationMatches = useMemo(
    () => allMatches.filter((m) => (m as { stage?: string }).stage === 'classification'),
    [allMatches]
  );
  /**
   * assignCategories() assigns Gold/Silver from tie-break even with 0 matches played.
   * Only show medal + qualified/eliminated icons once outcomes are meaningful.
   */
  const showQualificationOutcomeOnTeamsTab = useMemo(() => {
    if (shouldUseDevMocks()) return true;
    const phase = String((tournament as { phase?: unknown } | undefined)?.phase ?? 'registration');
    if (phase === 'registration' || phase === 'open') return false;
    if (phase === 'categories' || phase === 'completed') return true;
    if (phase === 'classification') {
      return classificationMatches.some((m) => m.status === 'completed');
    }
    return false;
  }, [tournament?.phase, classificationMatches]);
  /** Category matches from API; when empty, fall back to embedded dev bracket so Gold/Oro shows with API URL + OAuth on. */
  const categoryMatches = useMemo(() => {
    const fromApi = allMatches.filter((m) => (m as { stage?: string }).stage === 'category');
    if (fromApi.length > 0) return fromApi;
    const devFixture =
      shouldUseDevMocks() ||
      String((tournament as { _id?: unknown } | undefined)?._id ?? '') === DEV_TOURNAMENT_ID ||
      String((tournament as { inviteLink?: string } | undefined)?.inviteLink ?? '') === 'dev-invite';
    if (devFixture) return MOCK_DEV_CATEGORY_MATCHES;
    return fromApi;
  }, [allMatches, tournament]);

  const teamById = useMemo(() => {
    const entries = teams
      .map((tm) => [normalizeMongoIdString(tm._id), tm] as const)
      .filter(([k]) => k.length > 0);
    return Object.fromEntries(entries);
  }, [teams]);

  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <TournamentDetailsNavTitle />,
      headerRight: () => <NotificationsInboxButton />,
    });
  }, [navigation, t]);

  const groupMeta = useMemo(() => {
    if (!tournament) return { groupCount: 4, teamsPerGroup: 4 };
    const gc = normalizeGroupCount(tournament.groupCount);
    const v = validateTournamentGroups(tournament.maxTeams, gc);
    if (v.ok) return { groupCount: v.groupCount, teamsPerGroup: v.teamsPerGroup };
    return {
      groupCount: gc,
      teamsPerGroup: Math.max(1, Math.floor(tournament.maxTeams / gc)),
    };
  }, [tournament]);

  const offerGroupRebalance = useMemo(
    () => shouldOfferGroupRebalance(teams, groupMeta.groupCount, groupMeta.teamsPerGroup),
    [teams, groupMeta.groupCount, groupMeta.teamsPerGroup]
  );

  // Must be declared before any early `return` so hook order stays stable.
  const handleDelete = useCallback(() => {
    if (!userId || !id || !tournament) return;
    if (!requireOnline()) return;
    const organizerIds = tournament.organizerIds ?? [];
    const hasNonOrganizerEntry = entries.some((e) => {
      if (e.userId) return !organizerIds.includes(e.userId);
      if (e.guestPlayerId) return true;
      return false;
    });
    if (hasNonOrganizerEntry) {
      Alert.alert(t('common.error'), t('tournamentDetail.cannotDeleteWithPlayers'));
      return;
    }
    Alert.alert(
      t('tournamentDetail.deleteTournament'),
      t('tournamentDetail.deleteConfirm', { name: tournament.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () =>
            deleteTournament.mutate(
              { id },
              {
                onError: (err: unknown) =>
                  alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
              }
            ),
        },
      ]
    );
  }, [deleteTournament, entries, id, requireOnline, t, tournament, userId]);

  const handleShareInvite = useCallback(() => {
    if (!tournament?.inviteLink) return;
    const lang: 'en' | 'es' | 'it' =
      storedLanguage === 'en' || storedLanguage === 'es' || storedLanguage === 'it'
        ? storedLanguage
        : i18n.locale === 'es' || i18n.locale === 'it'
          ? i18n.locale
          : 'en';
    const url = config.invite.getUrl(tournament.inviteLink, lang);
    const androidIntentUrl = config.invite.getAndroidIntentUrl(tournament.inviteLink, lang);
    const shareUrl = Platform.OS === 'android' ? androidIntentUrl : url;
    const message =
      Platform.OS === 'android'
        ? `${t('tournamentDetail.inviteMessage', { name: tournament.name, url })}\n\n${androidIntentUrl}`
        : t('tournamentDetail.inviteMessage', { name: tournament.name, url });
    Share.share({
      message,
      url: shareUrl,
      title: t('tournamentDetail.inviteTitle'),
    }).catch(() => Alert.alert(t('common.error'), t('tournamentDetail.couldNotShare')));
  }, [i18n.locale, storedLanguage, t, tournament?.inviteLink, tournament?.name]);

  const confirmDeleteGuest = useCallback(
    (g: TournamentGuestPlayer) => {
      if (!id) return;
      Alert.alert(
        t('tournamentDetail.guestDeleteTitle'),
        t('tournamentDetail.guestDeleteConfirm', { name: g.displayName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () =>
              guestMutation.mutate(
                { action: 'deleteGuestPlayer', guestId: g._id },
                { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
              ),
          },
        ]
      );
    },
    [id, t, guestMutation]
  );

  const organizerMenuBaseItems = useMemo((): OrganizerMenuItem[] => {
    const list: OrganizerMenuItem[] = [];

    if (!tournament) return list;

    const started =
      !!(tournament as { startedAt?: unknown }).startedAt ||
      (tournament as { phase?: unknown }).phase === 'classification' ||
      (tournament as { phase?: unknown }).phase === 'categories' ||
      (tournament as { phase?: unknown }).phase === 'completed';

    const gdaMenu = (tournament as { groupsDistributedAt?: unknown }).groupsDistributedAt;
    const groupsDistributedMenu = typeof gdaMenu === 'string' && gdaMenu.length > 0;
    const anyGroupAssignedMenu = teams.some((tm) => typeof tm.groupIndex === 'number' && tm.groupIndex >= 0);
    const groupsDistributionPendingMenu =
      !shouldUseDevMocks() && !groupsDistributedMenu && !anyGroupAssignedMenu;
    const rosterFull = teams.length >= (tournament.maxTeams ?? 0);
    const startDateRaw = String(
      (tournament as { startDate?: unknown }).startDate ?? (tournament as { date?: unknown }).date ?? ''
    );
    const todayLocal = new Date();
    const todayIsoDate = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(
      todayLocal.getDate()
    ).padStart(2, '0')}`;
    const tournamentIsoDate = startDateRaw ? String(startDateRaw).slice(0, 10) : '';
    const isTournamentDayToday = !!tournamentIsoDate && tournamentIsoDate === todayIsoDate;
    const allTeamsPlacedInGroups =
      rosterFull &&
      teams.length > 0 &&
      teams.every((tm) => typeof tm.groupIndex === 'number' && tm.groupIndex >= 0);
    const cannotStartForGroups = rosterFull && !groupsDistributedMenu && !allTeamsPlacedInGroups;
    const cannotStartForRoster = !rosterFull;

    if (id) {
      list.push(
        {
          key: 'edit',
          label: t('tournamentDetail.menuEdit'),
          icon: 'create-outline',
          color: tokens.accent,
          onPress: () => router.push(`/admin/tournament/${id}` as never),
        }
      );
    }

    if (id && !shouldUseDevMocks()) {
      list.push({
        key: 'guestPlayers',
        label: t('tournamentDetail.menuGuestPlayers'),
        icon: 'person-add-outline',
        color: tokens.accentHover,
        onPress: () => router.push(`/tournament/${id}/guest-players` as never),
      });
    }

    if (!started && id && !shouldUseDevMocks()) {
      list.push(
        {
          key: 'start',
          label: t('tournamentDetail.menuStartTournament'),
          icon: 'play-outline',
          color: Colors.success,
          disabled: startTournamentMutation.isPending || cannotStartForRoster || cannotStartForGroups,
          onPress: () =>
            !isTournamentDayToday
              ? Alert.alert(
                  t('tournamentDetail.startTournamentWrongDateTitle'),
                  t('tournamentDetail.startTournamentWrongDateBody'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('tournamentDetail.startTournamentAdjustDateCta'),
                      onPress: () => router.push(`/admin/tournament/${id}` as never),
                    },
                  ]
                )
              : Alert.alert(
                  t('tournamentDetail.menuStartTournament'),
                  t('tournamentDetail.startTournamentConfirm'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('common.ok'),
                      onPress: () =>
                        startTournamentMutation.mutate(
                          { id },
                          { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                        ),
                    },
                  ]
                ),
        }
      );
    }

    if (!started && id && !shouldUseDevMocks() && rosterFull) {
      if (groupsDistributionPendingMenu) {
        list.push({
          key: 'distributeGroups',
          label: t('tournamentDetail.menuCreateGroups'),
          icon: 'grid-outline',
          color: tokens.accentHover,
          disabled: randomizeGroupsMutation.isPending,
          onPress: () =>
            Alert.alert(
              t('tournamentDetail.menuCreateGroups'),
              t('tournamentDetail.createGroupsConfirm'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.ok'),
                  onPress: () =>
                    randomizeGroupsMutation.mutate(
                      { id },
                      { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                    ),
                },
              ]
            ),
        });
      } else {
        list.push({
          key: 'randomizeGroups',
          label: t('tournamentDetail.menuReorganizeGroups'),
          icon: 'shuffle-outline',
          color: tokens.accentHover,
          disabled: randomizeGroupsMutation.isPending,
          onPress: () =>
            Alert.alert(
              t('tournamentDetail.menuReorganizeGroups'),
              t('tournamentDetail.reorganizeGroupsConfirm'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.ok'),
                  onPress: () =>
                    randomizeGroupsMutation.mutate(
                      { id },
                      { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                    ),
                },
              ]
            ),
        });
      }
    }

    // Share is available to all users, but it stays in the menu list for organizers too.
    if (tournament.inviteLink) {
      list.push({
        key: 'share',
        label: t('tournamentDetail.menuShare'),
        icon: 'share-outline',
        color: tokens.accent,
        onPress: handleShareInvite,
      });
    }

    const phase = String((tournament as { phase?: unknown }).phase ?? '');
    const classificationComplete =
      classificationMatches.length > 0 && classificationMatches.every((m) => m.status === 'completed');
    if (id && !shouldUseDevMocks() && phase === 'classification' && classificationComplete) {
      list.push({
        key: 'finalizeClassification',
        label: t('tournamentDetail.menuGenerateCategoryMatches'),
        icon: 'trophy-outline',
        color: tokens.accentHover,
        disabled: finalizeClassificationMutation.isPending,
        onPress: () =>
          Alert.alert(
            t('tournamentDetail.menuGenerateCategoryMatches'),
            t('tournamentDetail.generateCategoryMatchesConfirm'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('common.ok'),
                onPress: () =>
                  finalizeClassificationMutation.mutate(
                    { id },
                    {
                      onError: (err: unknown) => {
                        const remaining =
                          err instanceof Error && typeof (err as Error & { remaining?: unknown }).remaining === 'number'
                            ? (err as Error & { remaining: number }).remaining
                            : null;
                        if (remaining != null) {
                          Alert.alert(
                            t('tournamentDetail.menuGenerateCategoryMatches'),
                            t('tournamentDetail.classificationRemaining', { n: remaining })
                          );
                          return;
                        }
                        alertApiError(t, err, 'tournamentDetail.organizerActionFailed');
                      },
                    }
                  ),
              },
            ]
          ),
      });
    }

    if (
      started &&
      id &&
      !shouldUseDevMocks() &&
      ((tournament.organizerIds ?? []).includes(userId ?? '') || user?.role === 'admin')
    ) {
      const tp = isTournamentPaused(tournament);
      list.push({
        key: tp ? 'resumeTournament' : 'pauseTournament',
        label: tp ? t('tournamentDetail.menuResumeTournament') : t('tournamentDetail.menuPauseTournament'),
        icon: (tp ? 'play-outline' : 'pause-outline') as keyof typeof Ionicons.glyphMap,
        color: tp ? Colors.success : Colors.text,
        disabled: guestMutation.isPending,
        onPress: () =>
          Alert.alert(
            tp ? t('tournamentDetail.menuResumeTournament') : t('tournamentDetail.menuPauseTournament'),
            tp ? t('tournamentDetail.resumeTournamentConfirm') : t('tournamentDetail.pauseTournamentConfirm'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('common.ok'),
                onPress: () =>
                  guestMutation.mutate(
                    { action: tp ? 'resumeTournament' : 'pauseTournament' },
                    { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                  ),
              },
            ]
          ),
      });
    }

    list.push({
      key: 'delete',
      label: t('tournamentDetail.menuCancel'),
      icon: 'trash-outline',
      color: Colors.danger,
      onPress: handleDelete,
      disabled: deleteTournament.isPending,
      accessibilityLabel: t('tournamentDetail.deleteTournament'),
    });

    return list;
  }, [
    id,
    tournament,
    teams,
    t,
    router,
    handleShareInvite,
    handleDelete,
    deleteTournament.isPending,
    randomizeGroupsMutation,
    startTournamentMutation,
    finalizeClassificationMutation,
    classificationMatches,
    userId,
    user?.role,
    guestMutation,
  ]);

  // Everything below must be declared before any early `return` so hook order stays stable.
  const organizerIds = tournament?.organizerIds ?? [];
  const guestPlayersList = tournament?.guestPlayers ?? [];
  const guestMap = useMemo(
    () =>
      Object.fromEntries(guestPlayersList.map((g: TournamentGuestPlayer) => [g._id.toLowerCase(), g])) as Record<
        string,
        TournamentGuestPlayer
      >,
    [guestPlayersList]
  );
  const guestGenderById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of guestPlayersList) {
      m.set(g._id, g.gender === 'male' || g.gender === 'female' ? g.gender : '');
    }
    return m;
  }, [guestPlayersList]);

  const organizeOnlyUserIds = useMemo(() => {
    if (!tournament) return [];
    const only = new Set(tournament.organizerOnlyIds ?? []);
    return (tournament.organizerIds ?? []).filter((uid) => only.has(uid));
  }, [tournament]);
  const isCancelled = tournament?.status === 'cancelled';
  const isOrganizeOnlyOrganizer = !!(userId && (tournament?.organizerOnlyIds ?? []).includes(userId));

  const divisions = (((tournament as { divisions?: unknown } | undefined)?.divisions ?? []) as TournamentDivision[]).filter(Boolean);
  const availableDivisions: DivisionTab[] = (divisions.length ? divisions : ['mixed']) as DivisionTab[];
  const currentDivision: DivisionTab = availableDivisions.includes(activeDivision)
    ? activeDivision
    : availableDivisions[0]!;
  const dateLabel = useMemo(() => {
    if (!tournament) return undefined;
    const dd = (tournament as { divisionDates?: any }).divisionDates;
    const r = dd && typeof dd === 'object' ? dd[currentDivision] : null;
    const s =
      typeof r?.startDate === 'string' && r.startDate.trim()
        ? r.startDate.trim()
        : tournament.date || tournament.startDate;
    const e =
      typeof r?.endDate === 'string' && r.endDate.trim()
        ? r.endDate.trim()
        : tournament.endDate || s;
    return e && s && e !== s ? `${s} – ${e}` : s;
  }, [tournament, currentDivision]);
  const { data: waitlistInfo } = useWaitlist(id, currentDivision);
  const { data: bettingSnapshot } = useTournamentBetting(id, currentDivision, {
    enabled: !!id && activeTab === 'bets',
    refetchIntervalMs: activeTab === 'bets' ? 7_000 : undefined,
  });
  const divisionCount = Math.max(1, availableDivisions.length);
  const teamsPerDivisionCap = Math.max(2, Math.floor(((tournament as { maxTeams?: number } | undefined)?.maxTeams ?? 16) / divisionCount));
  const playersPerDivisionCap = maxPlayerSlotsForTournament(teamsPerDivisionCap);
  // Groups are configured per division (e.g. 4), but stored as total groups across divisions (e.g. 12).
  // Each division maps to a contiguous slice of size `groupsPerDivisionCap`.
  const totalGroups = groupMeta.groupCount;
  const groupsPerDivisionCap =
    divisionCount > 1 && totalGroups % divisionCount === 0
      ? totalGroups / divisionCount
      : totalGroups;
  const divisionIndex = Math.max(0, availableDivisions.indexOf(currentDivision));
  const divisionGroupOffset = divisionIndex * groupsPerDivisionCap;

  const rosterSlotIds = teams.flatMap((t) => t.playerIds ?? []).filter(Boolean);
  const registeredUserIdsFromTeams = rosterSlotIds.filter((pid) => !isGuestPlayerSlot(pid));
  const entryUserIds = entries
    .map((e) => e.userId)
    .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0);
  const waitlistUserIds = (waitlistInfo?.users ?? []).map((w) => w.userId).filter(Boolean);
  const bettingSnapshotUserIds = useMemo(
    () => [
      ...new Set([
        ...(bettingSnapshot?.leaderboard?.map((r) => r.userId) ?? []),
        ...(bettingSnapshot?.matches?.flatMap((row) => (row.lines ?? []).map((l) => l.userId)) ?? []),
      ]),
    ],
    [bettingSnapshot]
  );
  const combinedUserIds = [
    ...new Set([
      ...registeredUserIdsFromTeams,
      ...entryUserIds,
      ...waitlistUserIds,
      ...(tournament?.organizerIds ?? []),
      ...bettingSnapshotUserIds,
    ]),
  ];
  const { data: users = [] } = useUsers(combinedUserIds);
  const userMap = Object.fromEntries(users.map((u) => [u._id, u]));

  const isLoading = loadingTournament;
  const isError = errorTournament;

  const teamDivisionById = useMemo(() => {
    const map: Record<string, DivisionTab> = {};
    for (const team of teams) map[team._id] = divisionForTeam(team, userMap, guestMap);
    return map;
  }, [teams, userMap, guestMap]);

  const userHasTeam = useMemo(() => {
    if (!userId) return false;
    return teams.some((tm) => (tm.playerIds ?? []).includes(userId));
  }, [teams, userId]);

  const userHasTeamInDivision = useMemo(() => {
    if (!userId || !id) return false;
    return teams.some((tm) => {
      if (String((tm as { tournamentId?: unknown }).tournamentId ?? '') !== String(id)) return false;
      if (!(tm.playerIds ?? []).includes(userId)) return false;
      return teamDivisionById[tm._id] === currentDivision;
    });
  }, [userId, id, teams, teamDivisionById, currentDivision]);

  const onWaitlistInDivision = useMemo(
    () => !!(userId && (waitlistInfo?.users ?? []).some((w) => w.userId === userId)),
    [waitlistInfo?.users, userId]
  );

  /** Registered in this division: waiting list, roster entry (no team yet), or already on a team. */
  const userHasRosterEntryInDivision = useMemo(() => {
    if (!userId) return false;
    return entries.some((e) => {
      if (e.userId !== userId) return false;
      const d = divisionForEntry(e, userMap, teamDivisionById, guestMap);
      return d === currentDivision;
    });
  }, [entries, userId, userMap, teamDivisionById, guestMap, currentDivision]);

  const isRegistered = onWaitlistInDivision || userHasTeamInDivision || userHasRosterEntryInDivision;

  const filteredTeams = useMemo(
    () => teams.filter((team) => teamDivisionById[team._id] === currentDivision),
    [teams, teamDivisionById, currentDivision]
  );

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const d = divisionForEntry(entry, userMap, teamDivisionById, guestMap);
      return d === currentDivision;
    });
  }, [entries, userMap, teamDivisionById, guestMap, currentDivision]);

  /** Players tab: A–Z by visible name (same as labels), not raw username. */
  const sortedEntries = useMemo(() => {
    const label = (e: Entry) => {
      if (e.userId) return getTournamentPlayerDisplayName(userMap[e.userId]);
      if (e.guestPlayerId) return tournamentGuestDisplayName(guestMap[e.guestPlayerId]);
      return '';
    };
    return [...filteredEntries].sort((a, b) =>
      label(a).toLowerCase().localeCompare(label(b).toLowerCase(), undefined, { sensitivity: 'base' })
    );
  }, [filteredEntries, userMap, guestMap]);

  /**
   * Until organizer runs Create groups (or legacy data has numeric groupIndex), show one bucket — not fake "Grupo 1".
   */
  const groupsDistributionPending = useMemo(() => {
    if (shouldUseDevMocks()) return false;
    return tournamentGroupPlacementPending(tournament, teams);
  }, [tournament, teams]);

  const divisionTeamsByGroup = useMemo(() => {
    // Before organizer runs Create groups: show only empty group slots (no team list — teams live under Equipos tab).
    if (groupsDistributionPending) {
      return Array.from({ length: Math.max(1, groupsPerDivisionCap) }, () => [] as Team[]);
    }
    // Clamp and map groupIndex into the current division slice.
    const clampLocalGi = (gi: number) => Math.max(0, Math.min(groupsPerDivisionCap - 1, gi));
    const sourceGroups = Array.from({ length: groupsPerDivisionCap }, (_, i) => i);
    const buckets: Team[][] = sourceGroups.map(() => []);
    const idxByGroup = new Map<number, number>(sourceGroups.map((g, idx) => [g, idx]));
    for (const team of filteredTeams) {
      const raw = teamGroupIndex(team);
      const local = clampLocalGi(raw - divisionGroupOffset);
      const idx = idxByGroup.get(local);
      if (idx != null) buckets[idx]!.push(team);
    }
    return buckets;
  }, [filteredTeams, groupsPerDivisionCap, divisionGroupOffset, groupsDistributionPending]);

  const matchCategoryTabs = (() => {
    const cats = (((tournament as { categories?: unknown } | undefined)?.categories ?? []) as unknown[]).filter(
      (c): c is MatchCategoryTab => c === 'Gold' || c === 'Silver' || c === 'Bronze'
    );
    return ['classification', ...cats, 'live'] as MatchSubTab[];
  })();

  const selectedMatchesSubtab = matchCategoryTabs.includes(activeMatchesSubtab)
    ? activeMatchesSubtab
    : matchCategoryTabs[0]!;

  const classificationBundle = useMemo(() => {
    // Dev mocks: keep deterministic seeded fixture.
    if (shouldUseDevMocks()) {
      const pointsToWin = Math.max(
        1,
        Math.min(99, Number((tournament as { pointsToWin?: unknown } | undefined)?.pointsToWin ?? 21) || 21)
      );
      const setsPerMatch = Math.max(
        1,
        Math.min(7, Number((tournament as { setsPerMatch?: unknown } | undefined)?.setsPerMatch ?? 1) || 1)
      );
      return buildSeededClassificationData({
        divisionTeamsByGroup,
        matchCategoryTabs,
        pointsToWin,
        setsPerMatch,
        categoryFractions: (tournament as { categoryFractions?: unknown } | undefined)?.categoryFractions as
          | Partial<Record<'Gold' | 'Silver' | 'Bronze', number>>
          | null
          | undefined,
        singleCategoryAdvanceFraction: Number(
          (tournament as { singleCategoryAdvanceFraction?: unknown } | undefined)?.singleCategoryAdvanceFraction ?? 0.5
        ),
        tieBreakSeed: id,
      });
    }

    // Live data: compute standings from completed matches and assign categories from tournament config.
    const groupMatchesByLocal = new Map<number, typeof classificationMatches>();
    for (let localGi = 0; localGi < groupsPerDivisionCap; localGi++) {
      const globalGi = divisionGroupOffset + localGi;
      groupMatchesByLocal.set(
        localGi,
        classificationMatches.filter((m) => Number((m as { groupIndex?: unknown }).groupIndex ?? -1) === globalGi)
      );
    }

    const standingsByGroup = divisionTeamsByGroup.map((teamsInGroup, localGi) =>
      computeStandingsForGroup({
        teams: teamsInGroup,
        matches: groupMatchesByLocal.get(localGi) ?? [],
        tieBreakSeed: id,
      })
    );

    const cats = (((tournament as { categories?: unknown } | undefined)?.categories ?? []) as unknown[]).filter(
      (c): c is MatchCategoryTab => c === 'Gold' || c === 'Silver' || c === 'Bronze'
    );
    const categoryFractions = (tournament as { categoryFractions?: unknown } | undefined)?.categoryFractions as
      | Partial<Record<'Gold' | 'Silver' | 'Bronze', number>>
      | null
      | undefined;
    const singleCategoryAdvanceFraction = Number(
      (tournament as { singleCategoryAdvanceFraction?: unknown } | undefined)?.singleCategoryAdvanceFraction ?? 0.5
    );

    const { teamCategory, eliminated, globalOrder } = assignCategories({
      standingsByGroup,
      categories: cats,
      categoryFractions: categoryFractions ?? null,
      singleCategoryAdvanceFraction,
      tieBreakSeed: id,
    });

    const perGroup = standingsByGroup.map((standings, localGi) => {
      const matches = (groupMatchesByLocal.get(localGi) ?? []).map((m) => {
        const teamA = resolveTeamForFixture(m.teamAId, teamById, id ?? '', opponentTbdLabel);
        const teamB = resolveTeamForFixture(m.teamBId, teamById, id ?? '', opponentTbdLabel);
        return {
          id: m._id,
          teamA,
          teamB,
          setsWonA: m.setsWonA ?? 0,
          setsWonB: m.setsWonB ?? 0,
          pointsA: Math.max(0, Math.floor(Number((m as { pointsA?: unknown }).pointsA ?? 0) || 0)),
          pointsB: Math.max(0, Math.floor(Number((m as { pointsB?: unknown }).pointsB ?? 0) || 0)),
          winnerId: m.winnerId ?? '',
          status: m.status,
          orderIndex: typeof (m as { orderIndex?: unknown }).orderIndex === 'number' ? (m as { orderIndex: number }).orderIndex : undefined,
          scheduledAt: typeof (m as { scheduledAt?: unknown }).scheduledAt === 'string' ? (m as { scheduledAt: string }).scheduledAt : undefined,
          createdAt: (m as { createdAt?: string }).createdAt,
        };
      });

      const categoriesMap: Partial<Record<MatchCategoryTab, typeof standings>> = {};
      for (const cat of cats) {
        categoriesMap[cat] = standings.filter((row) => teamCategory.get(row.team._id) === cat);
      }
      return { matches, standings, categories: categoriesMap };
    });

    return { perGroup, teamCategory, eliminated, globalOrder };
  }, [
    classificationMatches,
    divisionTeamsByGroup,
    divisionGroupOffset,
    groupsPerDivisionCap,
    matchCategoryTabs,
    tournament,
    id,
    opponentTbdLabel,
    teamById,
  ]);

  const classificationData = classificationBundle.perGroup;

  const teamClassificationLookup = useMemo(() => {
    const m = new Map<string, { wins: number; points: number }>();
    for (const g of classificationData) {
      for (const row of g.standings) {
        m.set(row.team._id, { wins: row.wins, points: row.points });
      }
    }
    return m;
  }, [classificationData]);

  /** Teams tab: best record first (wins, then points, then name). */
  const teamsSortedForTeamsTab = useMemo(() => {
    return [...filteredTeams].sort((a, b) => {
      const sa = teamClassificationLookup.get(a._id);
      const sb = teamClassificationLookup.get(b._id);
      const wa = sa?.wins ?? 0;
      const wb = sb?.wins ?? 0;
      if (wb !== wa) return wb - wa;
      const pa = sa?.points ?? 0;
      const pb = sb?.points ?? 0;
      if (pb !== pa) return pb - pa;
      const oa = tieBreakOrdinal(id ?? '', a._id);
      const ob = tieBreakOrdinal(id ?? '', b._id);
      if (oa !== ob) return oa < ob ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredTeams, teamClassificationLookup, id]);

  const categoryMatchesByCategory = useMemo(() => {
    const out: Partial<Record<'Gold' | 'Silver' | 'Bronze', any[]>> = {};
    const cats: ('Gold' | 'Silver' | 'Bronze')[] = ['Gold', 'Silver', 'Bronze'];
    for (const c of cats) out[c] = [];

    const devFixtureSnap =
      shouldUseDevMocks() ||
      String((tournament as { _id?: unknown } | undefined)?._id ?? '') === DEV_TOURNAMENT_ID ||
      String((tournament as { inviteLink?: string } | undefined)?.inviteLink ?? '') === 'dev-invite';
    const rawSnap = (tournament as { categoriesSnapshot?: unknown } | undefined)?.categoriesSnapshot as
      | {
          divisions?: {
            division: string;
            categories: { category: 'Gold' | 'Silver' | 'Bronze'; matchIds: string[] }[];
          }[];
        }
      | undefined;
    const snapshot =
      rawSnap?.divisions?.length && rawSnap
        ? rawSnap
        : devFixtureSnap
          ? (MOCK_DEV_TOURNAMENT.categoriesSnapshot as typeof rawSnap)
          : undefined;

    // Build lookup for match rows from live data (no filtering).
    const rowByMatchId = new Map<string, any>();
    for (const m of categoryMatches) {
      const teamA = resolveTeamForFixture(m.teamAId, teamById, id ?? '', opponentTbdLabel);
      const teamB = resolveTeamForFixture(m.teamBId, teamById, id ?? '', opponentTbdLabel);
      rowByMatchId.set(m._id, {
        id: m._id,
        teamA,
        teamB,
        setsWonA: m.setsWonA ?? 0,
        setsWonB: m.setsWonB ?? 0,
        pointsA: Math.max(0, Math.floor(Number((m as { pointsA?: unknown }).pointsA ?? 0) || 0)),
        pointsB: Math.max(0, Math.floor(Number((m as { pointsB?: unknown }).pointsB ?? 0) || 0)),
        winnerId: m.winnerId ?? '',
        status: m.status,
        orderIndex: typeof (m as { orderIndex?: unknown }).orderIndex === 'number' ? (m as { orderIndex: number }).orderIndex : undefined,
        scheduledAt: typeof (m as { scheduledAt?: unknown }).scheduledAt === 'string' ? (m as { scheduledAt: string }).scheduledAt : undefined,
        createdAt: (m as { createdAt?: string }).createdAt,
        bracketRound: typeof (m as { bracketRound?: unknown }).bracketRound === 'number' ? (m as { bracketRound: number }).bracketRound : undefined,
        isBronzeMatch: !!(m as { isBronzeMatch?: unknown }).isBronzeMatch,
        advanceTeamAFromMatchId:
          typeof (m as { advanceTeamAFromMatchId?: unknown }).advanceTeamAFromMatchId === 'string'
            ? (m as { advanceTeamAFromMatchId: string }).advanceTeamAFromMatchId
            : undefined,
        advanceTeamBFromMatchId:
          typeof (m as { advanceTeamBFromMatchId?: unknown }).advanceTeamBFromMatchId === 'string'
            ? (m as { advanceTeamBFromMatchId: string }).advanceTeamBFromMatchId
            : undefined,
        advanceTeamALoserFromMatchId:
          typeof (m as { advanceTeamALoserFromMatchId?: unknown }).advanceTeamALoserFromMatchId === 'string'
            ? (m as { advanceTeamALoserFromMatchId: string }).advanceTeamALoserFromMatchId
            : undefined,
        advanceTeamBLoserFromMatchId:
          typeof (m as { advanceTeamBLoserFromMatchId?: unknown }).advanceTeamBLoserFromMatchId === 'string'
            ? (m as { advanceTeamBLoserFromMatchId: string }).advanceTeamBLoserFromMatchId
            : undefined,
      });
    }

    // Prefer snapshot as the source-of-truth for what belongs in each category/division.
    const snapDiv = snapshot?.divisions?.find((d) => d.division === currentDivision);
    if (snapDiv) {
      for (const c of cats) {
        const catSnap = snapDiv.categories?.find((x) => x.category === c);
        if (!catSnap?.matchIds?.length) continue;
        const ordered: any[] = [];
        for (const mid of catSnap.matchIds) {
          const row = rowByMatchId.get(mid);
          if (row) ordered.push(row);
        }
        out[c] = ordered;
      }
      // Snapshot often lists only one category's matchIds (e.g. Gold); Silver/Bronze still exist on matches.
      for (const c of cats) {
        if ((out[c]?.length ?? 0) > 0) continue;
        for (const m of categoryMatches) {
          const cat = (m as { category?: unknown }).category;
          if (cat !== c) continue;
          const div = (m as { division?: unknown }).division;
          if (div && div !== currentDivision) continue;
          const row = rowByMatchId.get(m._id);
          if (row) out[c]!.push(row);
        }
      }
      for (const c of cats) {
        const rows = out[c];
        if (!rows?.length) continue;
        out[c] = [...rows].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      }
      return out;
    }

    // Fallback: derive from live match fields (older tournaments w/out snapshot).
    for (const m of categoryMatches) {
      const cat = (m as { category?: unknown }).category;
      if (cat !== 'Gold' && cat !== 'Silver' && cat !== 'Bronze') continue;
      const div = (m as { division?: unknown }).division;
      if (div && div !== currentDivision) continue;
      const row = rowByMatchId.get(m._id);
      if (row) out[cat]!.push(row);
    }

    return out;
  }, [categoryMatches, currentDivision, id, opponentTbdLabel, teamById, tournament]);

  /** Snapshot team order from server (fallback). */
  const categoryTeamIdsFromSnapshot = useMemo(() => {
    const snap = (tournament as { categoriesSnapshot?: { divisions?: { division: string; categories: { category: string; teamIds: string[] }[] }[] } } | undefined)
      ?.categoriesSnapshot;
    const div = snap?.divisions?.find((d) => d.division === currentDivision);
    const out: Partial<Record<'Gold' | 'Silver' | 'Bronze', string[]>> = {};
    if (!div?.categories) return out;
    for (const c of ['Gold', 'Silver', 'Bronze'] as const) {
      const cat = div.categories.find((x) => x.category === c);
      if (cat?.teamIds?.length) out[c] = cat.teamIds.map(String);
    }
    return out;
  }, [tournament, currentDivision]);

  /**
   * Same teams and order as the classification category lists (`assignCategories` + `globalOrder`).
   * Prefer this for the bracket so counts match the list; snapshot can be stale or from a different split.
   */
  const categoryTeamIdsFromClassification = useMemo(() => {
    const cats = (((tournament as { categories?: unknown } | undefined)?.categories ?? []) as unknown[]).filter(
      (c): c is MatchCategoryTab => c === 'Gold' || c === 'Silver' || c === 'Bronze'
    );
    const go = classificationBundle.globalOrder;
    const tc = classificationBundle.teamCategory;
    if (!go?.length) return {};
    const out: Partial<Record<'Gold' | 'Silver' | 'Bronze', string[]>> = {};
    for (const c of cats) {
      const ids = go.filter((tid) => tc.get(tid) === c);
      if (ids.length) out[c] = ids;
    }
    return out;
  }, [classificationBundle, tournament]);

  const categoryTeamIdsByCategory = useMemo(() => {
    if (groupsDistributionPending && !shouldUseDevMocks()) {
      return {};
    }
    const fromClass = categoryTeamIdsFromClassification;
    const hasClass = (['Gold', 'Silver', 'Bronze'] as const).some((k) => (fromClass[k]?.length ?? 0) > 0);
    if (hasClass) return fromClass;
    return categoryTeamIdsFromSnapshot;
  }, [categoryTeamIdsFromClassification, categoryTeamIdsFromSnapshot, groupsDistributionPending]);

  /** Ongoing matches in the current division (classification + category stages). */
  const liveMatchesRows = useMemo(() => {
    type LiveRow = {
      id: string;
      teamA: Team;
      teamB: Team;
      setsWonA: number;
      setsWonB: number;
      pointsA: number;
      pointsB: number;
      winnerId: string;
      status?: 'scheduled' | 'in_progress' | 'paused' | 'completed';
      orderIndex?: number;
      scheduledAt?: string;
      createdAt?: string;
      bracketRound?: number;
      isBronzeMatch?: boolean;
      liveStage?: 'classification' | 'category';
      liveCategory?: 'Gold' | 'Silver' | 'Bronze';
    };
    const out: LiveRow[] = [];

    for (const g of classificationData) {
      for (const m of g.matches ?? []) {
        if (m.status !== 'in_progress') continue;
        out.push({
          ...m,
          liveStage: 'classification',
        });
      }
    }

    for (const m of categoryMatches) {
      if ((m as { status?: string }).status !== 'in_progress') continue;
      const div = (m as { division?: unknown }).division;
      if (div && div !== currentDivision) continue;
      const cat = (m as { category?: TournamentCategory }).category;
      if (cat !== 'Gold' && cat !== 'Silver' && cat !== 'Bronze') continue;

      const teamA = resolveTeamForFixture(m.teamAId, teamById, id ?? '', opponentTbdLabel);
      const teamB = resolveTeamForFixture(m.teamBId, teamById, id ?? '', opponentTbdLabel);
      out.push({
        id: m._id,
        teamA,
        teamB,
        setsWonA: m.setsWonA ?? 0,
        setsWonB: m.setsWonB ?? 0,
        pointsA: Math.max(0, Math.floor(Number((m as { pointsA?: unknown }).pointsA ?? 0) || 0)),
        pointsB: Math.max(0, Math.floor(Number((m as { pointsB?: unknown }).pointsB ?? 0) || 0)),
        winnerId: m.winnerId ?? '',
        status: m.status,
        orderIndex:
          typeof (m as { orderIndex?: unknown }).orderIndex === 'number'
            ? (m as { orderIndex: number }).orderIndex
            : undefined,
        scheduledAt:
          typeof (m as { scheduledAt?: unknown }).scheduledAt === 'string'
            ? (m as { scheduledAt: string }).scheduledAt
            : undefined,
        createdAt: (m as { createdAt?: string }).createdAt,
        bracketRound: typeof (m as { bracketRound?: unknown }).bracketRound === 'number' ? (m as { bracketRound: number }).bracketRound : undefined,
        isBronzeMatch: !!(m as { isBronzeMatch?: unknown }).isBronzeMatch,
        liveStage: 'category',
        liveCategory: cat,
      });
    }

    return [...out].sort((a, b) => {
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
  }, [classificationData, categoryMatches, currentDivision, id, opponentTbdLabel, teamById]);

  const tournamentStarted =
    !!(tournament as { startedAt?: unknown } | undefined)?.startedAt ||
    (tournament as { phase?: unknown } | undefined)?.phase === 'classification' ||
    (tournament as { phase?: unknown } | undefined)?.phase === 'categories' ||
    (tournament as { phase?: unknown } | undefined)?.phase === 'completed';

  const tournamentPlayLockedReason = useMemo((): 'not_started' | 'paused' | null => {
    if (!tournament) return null;
    if (!isTournamentStarted(tournament)) return 'not_started';
    if (isTournamentPaused(tournament)) return 'paused';
    return null;
  }, [tournament]);

  const tournamentPlayActive = useMemo(() => isTournamentPlayActive(tournament), [tournament]);

  const canPlaceTournamentBet = useMemo(
    () =>
      !!userId &&
      sortedEntries.some((e) => e.userId === userId && e.teamId) &&
      !!(tournament as { bettingEnabled?: boolean } | undefined)?.bettingEnabled &&
      tournamentPlayActive,
    [userId, sortedEntries, tournament, tournamentPlayActive]
  );

  const teamSlotsFull = useMemo(() => {
    if (!tournament) return false;
    const maxT = Number((tournament as { maxTeams?: unknown }).maxTeams ?? 0);
    if (!Number.isFinite(maxT) || maxT <= 0) return false;
    return teams.length >= maxT;
  }, [tournament, teams.length]);

  const handleRegisterAsPlayer = useCallback(() => {
    if (!id || !userId || !tournament) return;
    if (!requireOnline()) return;
    const only = (tournament.organizerOnlyIds ?? []).filter((x) => x !== userId);
    const raw = (tournament.organizerOnlyCovers ?? {}) as Partial<Record<string, TournamentDivision[]>>;
    const nextCovers: Record<string, TournamentDivision[]> = {};
    for (const uid of only) {
      const v = raw[uid];
      nextCovers[uid] = Array.isArray(v) ? v : [];
    }
    updateTournament.mutate(
      { id, organizerOnlyIds: only, organizerOnlyCovers: nextCovers },
      {
        onSuccess: () => {
          createEntry.mutate(
            { tournamentId: id, userId, lookingForPartner: true },
            {
              onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
            }
          );
        },
        onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
      }
    );
  }, [id, userId, tournament, requireOnline, updateTournament, createEntry, t]);

  const organizerMenuRoleItems = useMemo((): OrganizerMenuItem[] => {
    const list: OrganizerMenuItem[] = [];
    if (!tournament || !userId || !id) return list;
    const isOrg = (tournament.organizerIds ?? []).includes(userId);
    const isOrganizeOnly = (tournament.organizerOnlyIds ?? []).includes(userId);
    if (!isOrg || tournamentStarted) return list;
    if (!isOrganizeOnly && isRegistered) {
      list.push({
        key: 'organizeOnly',
        label: t('tournamentDetail.menuOrganizeOnly'),
        icon: 'clipboard-outline',
        color: tokens.accent,
        onPress: () =>
          setOrganizeOnlyModal({
            mode: 'self',
            targetUserId: userId,
            playerName: t('common.you'),
            selected: [...availableDivisions],
          }),
      });
    }
    if (isOrganizeOnly) {
      list.push({
        key: 'playAsPlayer',
        label: t('tournamentDetail.menuPlayAsPlayer'),
        icon: 'person-outline',
        color: Colors.success,
        onPress: () =>
          Alert.alert(
            t('tournamentDetail.menuPlayAsPlayer'),
            t('tournamentDetail.menuPlayAsPlayerConfirm'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.ok'), onPress: handleRegisterAsPlayer },
            ]
          ),
      });
    }
    return list;
  }, [
    tournament,
    userId,
    id,
    isRegistered,
    tournamentStarted,
    t,
    availableDivisions,
    handleRegisterAsPlayer,
  ]);

  const organizerMenuItems = useMemo(
    () => [...organizerMenuBaseItems, ...organizerMenuRoleItems],
    [organizerMenuBaseItems, organizerMenuRoleItems]
  );

  const infoMenuItems = useMemo((): OrganizerMenuItem[] => {
    if (!tournament) return [];

    return [
      {
        key: 'info_location',
        label: t('tournamentDetail.menuOpenLocation'),
        icon: 'navigate-outline',
        color: tokens.accentHover,
        disabled: !tournament.location?.trim(),
        onPress: () => {
          if (!tournament.location?.trim()) return;
          openVenueInMaps(tournament.location.trim());
        },
      },
    ];
  }, [t, tokens.accent, tokens.accentHover, tournament]);

  const [reorderPendingTeamId, setReorderPendingTeamId] = useState<string | null>(null);
  const [swapSourceTeamId, setSwapSourceTeamId] = useState<string | null>(null);

  const mutationBusy =
    deleteEntry.isPending ||
    updateTournament.isPending ||
    deleteTeam.isPending ||
    deleteTournament.isPending ||
    rebalanceGroupsMutation.isPending ||
    randomizeGroupsMutation.isPending ||
    startTournamentMutation.isPending ||
    updateTeam.isPending ||
    leaveWaitlist.isPending ||
    joinWaitlist.isPending ||
    guestMutation.isPending;

  const isOrganizer = organizerIds.includes(userId ?? '');
  const isAdmin = user?.role === 'admin';
  /** Organizers and global admins can manage roster, teams, and invites from this screen. */
  const canManageTournament = isOrganizer || isAdmin;

  const rosterFull =
    (tournament?.maxTeams ?? 0) > 0 && teams.length >= (tournament?.maxTeams ?? 0);

  const primaryGroupAction = useMemo((): 'distribute' | 'reorganize' | null => {
    if (!canManageTournament || shouldUseDevMocks() || !id || tournamentStarted) return null;
    if (!rosterFull) return null;
    if (groupsDistributionPending) return 'distribute';
    return 'reorganize';
  }, [canManageTournament, id, tournamentStarted, rosterFull, groupsDistributionPending]);

  /** Only block the UI on error when there is no cached tournament (avoids hiding data after a failed refetch). */
  if (isError && !tournament) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{tournamentError?.message || t('tournamentDetail.failedToLoad')}</Text>
      </View>
    );
  }

  if (!id) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{t('tournamentDetail.failedToLoad')}</Text>
      </View>
    );
  }

  if (isLoading || !tournament) {
    return (
      <View style={[styles.container, styles.centered]}>
        <View style={styles.skeletonBlock}>
          <Skeleton height={28} width="80%" style={{ marginBottom: 12 }} />
          <Skeleton height={18} width="50%" style={{ marginBottom: 8 }} />
          <Skeleton height={18} width="60%" style={{ marginBottom: 24 }} />
        </View>
        <View style={styles.skeletonBlock}>
          <Skeleton height={20} width="30%" style={{ marginBottom: 12 }} />
          {[1, 2].map((i) => (
            <View key={i} style={tournamentTeamCardStyles.teamCard}>
              <Skeleton height={18} width="50%" style={{ marginBottom: 10 }} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Skeleton height={28} width="45%" />
                <Skeleton height={28} width="45%" />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  const handleSwapTeam = (team: Team) => {
    if (!id || !userId) return;
    if (!tournamentStarted) return;
    if (!canManageTournament) return;
    if (!requireOnline()) return;
    if (!swapSourceTeamId) {
      setSwapSourceTeamId(team._id);
      Alert.alert(t('tournamentDetail.reorderTeam'), t('tournamentDetail.swapPickTarget'));
      return;
    }
    if (swapSourceTeamId === team._id) {
      setSwapSourceTeamId(null);
      return;
    }
    const source = filteredTeams.find((x) => x._id === swapSourceTeamId);
    const target = team;
    if (!source) {
      setSwapSourceTeamId(null);
      return;
    }
    const giA = teamGroupIndex(source);
    const giB = teamGroupIndex(target);
    if (giA === giB) {
      setSwapSourceTeamId(null);
      return;
    }

    Alert.alert(
      t('tournamentDetail.reorderTeam'),
      `${source.name} ↔ ${target.name}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          onPress: () => {
            setSwapSourceTeamId(null);
            setReorderPendingTeamId(source._id);
            updateTeam
              .mutateAsync({ id: source._id, update: { groupIndex: giB } })
              .then(() => updateTeam.mutateAsync({ id: target._id, update: { groupIndex: giA } }))
              .catch(async (err: unknown) => {
                // Best-effort rollback if only first update succeeded.
                try {
                  await updateTeam.mutateAsync({ id: source._id, update: { groupIndex: giA } });
                } catch {
                  // ignore
                }
                alertApiError(t, err, 'tournamentDetail.organizerActionFailed');
              })
              .finally(() => setReorderPendingTeamId(null));
          },
        },
      ]
    );
  };

  const promoteOrganizer = (targetUserId: string, playerName: string) => {
    if (!userId || !id || !tournament) return;
    Alert.alert(t('tournamentDetail.makeOrganizer'), t('tournamentDetail.makeOrganizerRoleHint'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('tournamentDetail.organizerRolePlay'),
        onPress: () => {
          const next = [...new Set([...(tournament.organizerIds ?? []), targetUserId])];
          updateTournament.mutate(
            { id, organizerIds: next },
            {
              onError: (err: unknown) =>
                alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
            }
          );
        },
      },
      {
        text: t('tournamentDetail.organizerRoleOrganizeOnly'),
        onPress: () =>
          setOrganizeOnlyModal({
            mode: 'promote',
            targetUserId,
            playerName,
            selected: [...availableDivisions],
          }),
      },
    ]);
  };

  const submitOrganizeOnlyModal = () => {
    if (!organizeOnlyModal || !id || !tournament) return;
    if (!requireOnline()) return;
    const sel = organizeOnlyModal.selected;
    if (sel.length === 0) {
      Alert.alert(t('common.error'), t('tournamentDetail.organizeOnlyPickDivision'));
      return;
    }
    if (organizeOnlyModal.mode === 'promote') {
      const uid = organizeOnlyModal.targetUserId;
      const nextOrgs = [...new Set([...(tournament.organizerIds ?? []), uid])];
      const nextOnly = [...new Set([...(tournament.organizerOnlyIds ?? []), uid])];
      const covers = {
        ...(tournament.organizerOnlyCovers as Partial<Record<string, TournamentDivision[]>> | undefined),
        [uid]: sel,
      } as Record<string, TournamentDivision[]>;
      updateTournament.mutate(
        { id, organizerIds: nextOrgs, organizerOnlyIds: nextOnly, organizerOnlyCovers: covers },
        {
          onSuccess: () => setOrganizeOnlyModal(null),
          onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
        }
      );
      return;
    }
    if (!userId) return;
    const nextOnly = [...new Set([...(tournament.organizerOnlyIds ?? []), userId])];
    const covers = {
      ...(tournament.organizerOnlyCovers as Partial<Record<string, TournamentDivision[]>> | undefined),
      [userId]: sel,
    } as Record<string, TournamentDivision[]>;
    updateTournament.mutate(
      {
        id,
        organizerOnlyIds: nextOnly,
        organizerOnlyCovers: covers,
      },
      {
        onSuccess: () => setOrganizeOnlyModal(null),
        onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
      }
    );
  };

  const demoteOrganizer = (targetUserId: string, playerName: string) => {
    if (!userId || !id || !tournament) return;
    const prev = tournament.organizerIds ?? [];
    if (prev.length <= 1) {
      Alert.alert(t('common.error'), t('tournamentDetail.cannotRemoveLastOrganizer'));
      return;
    }
    if (!prev.includes(targetUserId)) return;
    const nextOrgs = prev.filter((x) => x !== targetUserId);
    const divisions = tournamentDivisionsNormalized(tournament.divisions);
    const teamsById = new Map(teams.map((tm) => [tm._id, { playerIds: tm.playerIds ?? [] }]));
    const userGender = new Map<string, string>();
    for (const u of Object.values(userMap)) {
      userGender.set(u._id, u.gender === 'male' || u.gender === 'female' ? u.gender : '');
    }
    const entriesSlim = entries
      .filter((e): e is Entry & { userId: string } => typeof e.userId === 'string' && e.userId.length > 0)
      .map((e) => ({ userId: e.userId, teamId: e.teamId ?? undefined }));
    const nextOnlyAfterDemote = (tournament.organizerOnlyIds ?? []).filter((x) => x !== targetUserId);
    const nextCoversAfterDemote = organizerOnlyCoversFromTournament(
      tournament.organizerOnlyCovers,
      nextOnlyAfterDemote
    );
    const missing = missingDivisionForOrganizers(
      divisions,
      nextOrgs,
      entriesSlim,
      teamsById,
      userGender,
      {
        organizerOnlyIds: nextOnlyAfterDemote,
        organizerOnlyCovers: nextCoversAfterDemote,
      },
      guestGenderById
    );
    if (missing) {
      const divLabel =
        missing === 'men'
          ? t('tournaments.divisionMen')
          : missing === 'women'
            ? t('tournaments.divisionWomen')
            : t('tournaments.divisionMixed');
      Alert.alert(t('common.error'), t('tournamentDetail.organizerMustCoverDivision', { division: divLabel }));
      return;
    }
    Alert.alert(
      t('tournamentDetail.removeOrganizer'),
      t('tournamentDetail.removeOrganizerConfirm', { name: playerName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          style: 'destructive',
          onPress: () => {
            updateTournament.mutate(
              {
                id,
                organizerIds: nextOrgs,
                organizerOnlyIds: nextOnlyAfterDemote,
                organizerOnlyCovers: nextCoversAfterDemote,
              },
              {
                onError: (err: unknown) =>
                  alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
              }
            );
          },
        },
      ]
    );
  };

  const demoteOrganizeOnlyOrganizer = (targetUserId: string, playerName: string) => {
    if (!userId || !id || !tournament) return;
    const prev = tournament.organizerIds ?? [];
    if (prev.length <= 1) {
      Alert.alert(t('common.error'), t('tournamentDetail.cannotRemoveLastOrganizer'));
      return;
    }
    if (!prev.includes(targetUserId)) return;
    const nextOrgs = prev.filter((x) => x !== targetUserId);
    const nextOnly = (tournament.organizerOnlyIds ?? []).filter((x) => x !== targetUserId);
    const nextCovers = organizerOnlyCoversFromTournament(tournament.organizerOnlyCovers, nextOnly);
    const divisions = tournamentDivisionsNormalized(tournament.divisions);
    const teamsById = new Map(teams.map((tm) => [tm._id, { playerIds: tm.playerIds ?? [] }]));
    const userGender = new Map<string, string>();
    for (const u of Object.values(userMap)) {
      userGender.set(u._id, u.gender === 'male' || u.gender === 'female' ? u.gender : '');
    }
    const entriesSlim = entries
      .filter((e): e is Entry & { userId: string } => typeof e.userId === 'string' && e.userId.length > 0)
      .map((e) => ({ userId: e.userId, teamId: e.teamId ?? undefined }));
    const missing = missingDivisionForOrganizers(
      divisions,
      nextOrgs,
      entriesSlim,
      teamsById,
      userGender,
      {
        organizerOnlyIds: nextOnly,
        organizerOnlyCovers: nextCovers,
      },
      guestGenderById
    );
    if (missing) {
      const divLabel =
        missing === 'men'
          ? t('tournaments.divisionMen')
          : missing === 'women'
            ? t('tournaments.divisionWomen')
            : t('tournaments.divisionMixed');
      Alert.alert(t('common.error'), t('tournamentDetail.organizerMustCoverDivision', { division: divLabel }));
      return;
    }
    Alert.alert(
      t('tournamentDetail.removeOrganizer'),
      t('tournamentDetail.removeOrganizerConfirm', { name: playerName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          style: 'destructive',
          onPress: () => {
            updateTournament.mutate(
              {
                id,
                organizerIds: nextOrgs,
                organizerOnlyIds: nextOnly,
                organizerOnlyCovers: nextCovers,
              },
              {
                onError: (err: unknown) =>
                  alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
              }
            );
          },
        },
      ]
    );
  };

  const confirmRemovePlayer = (entry: Entry, playerName: string) => {
    if (!userId || !id) return;
    if (!requireOnline()) return;
    const removeUid = entry.userId;
    if (!removeUid) {
      Alert.alert(t('common.error'), t('tournamentDetail.organizerActionFailed'));
      return;
    }
    Alert.alert(
      t('tournamentDetail.removePlayer'),
      t('tournamentDetail.removePlayerConfirm', { name: playerName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () =>
            removeTournamentPlayer.mutate(
              { id, userId: removeUid, mode: 'dissolveToWaitlist' },
              { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
            ),
        },
      ]
    );
  };

  const confirmRemoveWaitlistPlayer = (targetUserId: string, playerName: string) => {
    if (!userId || !id) return;
    if (!requireOnline()) return;
    Alert.alert(
      t('tournamentDetail.removePlayer'),
      t('tournamentDetail.removePlayerConfirm', { name: playerName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () =>
            removeTournamentPlayer.mutate(
              { id, userId: targetUserId, mode: 'removeFromTournament' },
              { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
            ),
        },
      ]
    );
  };

  const confirmLeave = () => {
    if (!userId || !id) return;
    if (!requireOnline()) return;
    const ownEntry: Entry | undefined =
      myTournamentEntries.find((e) => e.userId === userId) ?? myTournamentEntries[0];

    if (ownEntry) {
      Alert.alert(t('tournamentDetail.leaveTournament'), t('tournamentDetail.leaveTournamentConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('tournamentDetail.leaveTournament'),
          style: 'destructive',
          onPress: () =>
            deleteEntry.mutate(
              { id: ownEntry._id, tournamentId: id },
              {
                onError: (err: unknown) =>
                  alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
              }
            ),
        },
      ]);
      return;
    }

    if (userHasTeamInDivision) {
      Alert.alert(t('common.error'), t('tournamentDetail.leaveTournamentStateError'));
      return;
    }

    if (onWaitlistInDivision) {
      Alert.alert(t('tournamentDetail.leaveTournament'), t('tournamentDetail.leaveTournamentConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('tournamentDetail.leaveTournament'),
          style: 'destructive',
          onPress: () =>
            leaveWaitlist.mutate(
              { tournamentId: id, division: currentDivision },
              { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
            ),
        },
      ]);
    }
  };

  const showJoinAsPlayerInMenu =
    !!userId &&
    !!id &&
    canEnroll &&
    !isCancelled &&
    !isOrganizeOnlyOrganizer &&
    !isRegistered &&
    !tournamentStarted;

  const tournamentCardMenuItems: OrganizerMenuItem[] = [
    ...infoMenuItems,
    ...(canManageTournament ? organizerMenuItems : []),
    ...(showJoinAsPlayerInMenu
      ? ([
          {
            key: 'joinAsPlayerWaitlist',
            label: t('tournamentDetail.menuPlayAsPlayer'),
            icon: 'person-outline' as const,
            color: Colors.success,
            disabled: joinWaitlist.isPending,
            onPress: () => {
              if (!userId || !id) return;
              if (!requireOnline()) return;
              if (!canJoinDivisionByGender(currentDivision, user?.gender)) {
                Alert.alert(t('common.error'), t('tournamentDetail.joinDivisionBlockedHint'));
                return;
              }
              joinWaitlist.mutate(
                { tournamentId: id, division: currentDivision, userId },
                { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.joinFailed') }
              );
            },
          },
        ] satisfies OrganizerMenuItem[])
      : []),
    ...(canEnroll && !isCancelled && !isOrganizeOnlyOrganizer && isRegistered
      ? ([
          {
            key: 'leaveTournament',
            label: t('tournamentDetail.leaveTournament'),
            icon: 'log-out-outline' as const,
            color: Colors.danger,
            onPress: () => confirmLeave(),
            disabled: leaveWaitlist.isPending || deleteEntry.isPending,
          },
        ] satisfies OrganizerMenuItem[])
      : []),
  ];

  const confirmRemoveTeam = (team: Team) => {
    if (!userId || !id) return;
    if (!requireOnline()) return;
    const pNames = (team.playerIds ?? [])
      .map((pid) => (pid ? resolveRosterSlotLabel(pid, userMap, guestMap) : ''))
      .filter(Boolean)
      .join(' · ');
    Alert.alert(
      t('tournamentDetail.removeTeam'),
      `${t('tournamentDetail.removeTeamConfirm', { name: team.name })}${pNames ? `\n\n${pNames}` : ''}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () =>
            deleteTeam.mutate(
              { id: team._id, tournamentId: id },
              {
                onError: (err: unknown) =>
                  alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
              }
            ),
        },
      ]
    );
  };

  // (moved above) division/group/match derived state lives above early returns
  const matchProgress = (() => {
    if (!tournamentStarted) return null;
    const classForDiv = classificationMatches.filter((m) => !m.division || m.division === currentDivision);
    const catForDiv = categoryMatches.filter((m) => !m.division || m.division === currentDivision);
    const total = classForDiv.length + catForDiv.length;
    if (total === 0) return { total: 0, completed: 0, ratio: 0 };
    const completed =
      classForDiv.filter((m) => m.status === 'completed').length +
      catForDiv.filter((m) => m.status === 'completed').length;
    return { total, completed, ratio: completed / total };
  })();

  return (
    <View style={styles.container}>
      <AppBackgroundGradient />
    <FlashList
      data={[0]}
      keyExtractor={() => 'tournament-detail'}
      refreshControl={
        <RefreshControl
          refreshing={pullRefreshing}
          onRefresh={() => void handleTournamentPullRefresh()}
          tintColor={tokens.tabIconSelected}
          colors={[tokens.accent]}
        />
      }
        contentContainerStyle={[styles.content, { paddingBottom: 40 + PERSISTENT_TABS_HEIGHT + insets.bottom }] as never}
      ListHeaderComponent={
        <>
            <TournamentHeader
            t={t}
            tournament={tournament}
            dateLabel={dateLabel}
            isCancelled={isCancelled}
            canManageTournament={false}
            showMeta={false}
            organizerMenuItems={organizerMenuItems}
            headerStyle={styles.header}
            cancelledBannerStyle={styles.cancelledBanner}
            cancelledBannerTextStyle={styles.cancelledBannerText}
              privateBannerStyle={[styles.privateBanner, { backgroundColor: tokens.accentMuted, borderColor: tokens.accentOutline }]}
            privateBannerTextStyle={styles.privateBannerText}
            headerTopRowStyle={styles.headerTopRow}
            dateLocationLeftStyle={styles.dateLocationLeft}
            dateLocationRowStyle={styles.dateLocationRow}
            locationStyle={styles.location}
            dateLocationSepStyle={styles.dateLocationSep}
            dateStyle={styles.date}
            matchRulesTextStyle={styles.matchRulesText}
            headerTopActionsStyle={styles.headerTopActions}
          />

          {/* Tournament configuration */}
          {tournament ? (
            <View style={styles.tournamentConfigCard}>
              <View style={styles.tournamentConfigContent}>
                {tournamentCardMenuItems.length > 0 ? (
                  <View style={styles.tournamentConfigMenuAbs}>
                    <TournamentOrganizerMenu
                      menuLabel={t('tournamentDetail.actionsMenu')}
                      title={t('tournamentDetail.tournamentPanelTitle')}
                      items={tournamentCardMenuItems}
                    />
                  </View>
                ) : null}
                <Text
                  style={[tournamentNameInCardStyle, styles.tournamentConfigName, { color: tokens.tabIconSelected }]}
                  numberOfLines={3}
                >
                  {tournament.name?.trim() || t('common.tournament')}
                </Text>
                <View style={styles.tournamentConfigRow}>
                  <Ionicons name="location-outline" size={18} color={Colors.textMuted} />
                  {tournament.location?.trim() ? (
                    <Pressable
                      onPress={() => openVenueInMaps(tournament.location!.trim())}
                      accessibilityRole="link"
                      style={styles.tournamentConfigLocationPress}
                    >
                      <Text
                        style={[styles.tournamentConfigText, styles.tournamentLocationLink, { color: Colors.textMuted }]}
                        numberOfLines={3}
                      >
                        {tournament.location.trim()}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.tournamentConfigText, { color: Colors.textMuted }]}>—</Text>
                  )}
                  <Ionicons name="calendar-outline" size={18} color={Colors.textMuted} />
                  <Text style={[styles.tournamentConfigText, { color: Colors.textMuted }]}>{dateLabel || '—'}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {tournament && tournamentStarted && isTournamentPaused(tournament) ? (
            <View style={[styles.privateBanner, { marginBottom: 12 }]}>
              <Ionicons name="pause-circle-outline" size={22} color={Colors.textMuted} />
              <Text style={styles.privateBannerText}>{t('tournamentDetail.tournamentPausedHint')}</Text>
            </View>
          ) : null}

          {/* Join / leave tournament (waitlist join + leave waitlist or delete entry when on a team) */}
          {canEnroll && !isCancelled && !isOrganizeOnlyOrganizer ? (
            <>
            </>
          ) : null}

          <TournamentTabsBar
            t={t}
            availableDivisions={availableDivisions}
            currentDivision={currentDivision}
            onSelectDivision={setActiveDivision}
            divisionActionNode={
              !isRegistered &&
              canEnroll &&
              !isCancelled &&
              !isOrganizeOnlyOrganizer &&
              canJoinDivisionByGender(currentDivision, user?.gender) ? (
                <Button
                  title={t('tournamentDetail.joinTournament')}
                  variant="secondary"
                  onPress={() => {
                    if (!userId || !id) return;
                    if (!requireOnline()) return;
                    joinWaitlist.mutate(
                      { tournamentId: id, division: currentDivision, userId },
                      { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.joinFailed') }
                    );
                  }}
                  disabled={joinWaitlist.isPending}
                  size="sm"
                  fullWidth
                />
              ) : null
            }
            matchProgress={matchProgress}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            tabConfig={TAB_CONFIG as never}
            tabValueById={{
            }}
            tabsSectionStyle={styles.tabsSection}
            divisionTabBarStyle={styles.divisionTabBar}
            divisionTabStyle={styles.divisionTab}
            divisionTabSelectedStyle={styles.divisionTabSelected}
            divisionTabLabelStyle={styles.divisionTabLabel}
            divisionTabLabelSelectedStyle={styles.divisionTabLabelSelected}
            progressWrapStyle={styles.progressWrap}
            progressTrackStyle={styles.progressTrack}
            progressFillStyle={styles.progressFill}
            progressLabelStyle={styles.progressLabel}
            tabBarStyle={styles.tabBar}
            tabItemStyle={styles.tabItem}
            tabItemSelectedStyle={styles.tabItemSelected}
            waitingListMarkStyle={styles.waitingListMark}
            tabValueStyle={styles.tabValue}
            tabLabelStyle={styles.tabLabel}
            tabLabelSelectedStyle={styles.tabLabelSelected}
          />
        </>
      }
      renderItem={() => (
        <>
          <View style={[styles.tabPanel, activeTab === 'fixture' ? styles.tabPanelTight : styles.tabPanelSpaced]}>
        {activeTab === 'players' ? (
          <>
            {canManageTournament && id && !shouldUseDevMocks() ? (
              <View style={styles.teamsTabCreateRow}>
                <Pressable
                  style={tournamentTeamCardStyles.teamCard as never}
                  onPress={() => router.push(`/tournament/${id}/guest-players` as never)}
                  accessibilityRole="button"
                  accessibilityLabel={t('tournamentDetail.menuGuestPlayers')}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', fontStyle: 'italic', color: Colors.text }} numberOfLines={1}>
                        {t('tournamentDetail.newGuestPlayerPlaceholder')}
                      </Text>
                    </View>
                    <Ionicons name="person-add-outline" size={26} color={tokens.accentHover} />
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-start', gap: 10 }}>
                    {[0, 1].map((i) => (
                      <View
                        key={i}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          flexGrow: 0,
                          flexShrink: 1,
                          maxWidth: '48%',
                          minWidth: 0,
                          paddingVertical: 2,
                        }}
                      >
                        <View
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 13,
                            backgroundColor: Colors.surfaceLight,
                            borderWidth: 1,
                            borderColor: Colors.surfaceLight,
                          }}
                        />
                        <View
                          style={{
                            height: 10,
                            width: 70,
                            borderRadius: 6,
                            backgroundColor: Colors.surfaceLight,
                          }}
                        />
                      </View>
                    ))}
                  </View>
                </Pressable>
              </View>
            ) : null}
          <PlayersTab
            t={t}
            sortedEntries={sortedEntries}
            guestPlayers={guestPlayersList}
            guestMap={guestMap}
            waitlistUserIds={waitlistUserIds}
            userMap={userMap}
            organizerIds={organizerIds}
            organizerOnlyIds={tournament?.organizerOnlyIds ?? []}
            currentDivision={currentDivision}
            currentUserId={userId}
            hasJoined={isRegistered}
            canManageTournament={canManageTournament}
            mutationBusy={mutationBusy || removeTournamentPlayer.isPending}
            onOpenProfile={(uid) => router.push(`/profile/${uid}` as never)}
            onPromoteOrganizer={promoteOrganizer}
            onDemoteOrganizer={demoteOrganizer}
            onDemoteOrganizeOnly={demoteOrganizeOnlyOrganizer}
            organizeOnlyUserIds={organizeOnlyUserIds}
            onConfirmLeave={confirmLeave}
            onConfirmRemovePlayer={confirmRemovePlayer}
            onDeleteGuestPlayer={canManageTournament ? confirmDeleteGuest : undefined}
            onEditGuestPlayer={canManageTournament && id ? (g) => router.push(`/tournament/${id}/guest-players?guestId=${g._id}` as never) : undefined}
            onRemoveWaitlistPlayer={confirmRemoveWaitlistPlayer}
            viewerOnWaitlist={onWaitlistInDivision}
            onInviteWaitlistUser={
              onWaitlistInDivision && id
                ? (toUserId) => {
                    if (!requireOnline()) return;
                    invitePartnerFromWaitlist.mutate(
                      { tournamentId: id, division: currentDivision, toUserId },
                      { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                    );
                  }
                : undefined
            }
            invitePartnerPending={invitePartnerFromWaitlist.isPending}
            playersPerDivisionCap={playersPerDivisionCap}
            sectionHeadingStyle={styles.groupHeading}
            emptyTextStyle={styles.emptyText}
            playerRowStyle={styles.playerRow}
            playerRowOrganizerStyle={styles.playerRowOrganizer}
            playerRowTopStyle={styles.playerRowTop}
            playerRowMainStyle={styles.playerRowMain}
            playerRowTextStyle={styles.playerRowText}
            playerRowNameStyle={styles.playerRowName}
            orgBadgeStyle={styles.orgBadge}
            playerRowRightStyle={styles.playerRowRight}
            waitlistRankTextStyle={styles.waitlistRankText}
          />
          </>
        ) : null}

        {activeTab === 'teams' ? (
          <TeamsTab
            t={t}
            canCreateTeam={!canManageTournament && !userHasTeam && onWaitlistInDivision && canEnroll && !!id}
                      onCreateTeam={() => router.push(`/tournament/${id}/team/create?division=${currentDivision}`)}
            organizerActions={
              canManageTournament && id ? (
                <View style={styles.teamsTabCreateRow}>
                  <Pressable
                    style={tournamentTeamCardStyles.teamCard as never}
                    onPress={() => router.push(`/tournament/${id}/team/create-organizer?division=${currentDivision}`)}
                    accessibilityRole="button"
                    accessibilityLabel={t('tournamentDetail.createTeamFromEntries')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', fontStyle: 'italic', color: Colors.text }} numberOfLines={1}>
                          {t('tournamentDetail.newTeamPlaceholder')}
                        </Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={28} color={tokens.accentHover} />
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-start', gap: 10 }}>
                      {[0, 1].map((i) => (
                        <View
                          key={i}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            flexGrow: 0,
                            flexShrink: 1,
                            maxWidth: '48%',
                            minWidth: 0,
                            paddingVertical: 2,
                          }}
                        >
                          <View
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 13,
                              backgroundColor: Colors.surfaceLight,
                              borderWidth: 1,
                              borderColor: Colors.surfaceLight,
                            }}
                          />
                          <View
                            style={{
                              height: 10,
                              width: 70,
                              borderRadius: 6,
                              backgroundColor: Colors.surfaceLight,
                            }}
                          />
                        </View>
                      ))}
                    </View>
                  </Pressable>
                </View>
              ) : null
            }
            teamsCountText={`${filteredTeams.length}/${teamsPerDivisionCap} ${t('tournamentDetail.teams')}`}
            loadingTeams={loadingTeams}
            filteredTeams={teamsSortedForTeamsTab}
            renderTeam={(team) => {
              const row = teamClassificationLookup.get(team._id);
              const showOut = showQualificationOutcomeOnTeamsTab;
              const cat = showOut ? (classificationBundle.teamCategory.get(team._id) ?? null) : null;
              return (
                <TournamentTeamCard
                  key={team._id}
                  team={team}
                  userMap={userMap}
                  guestMap={guestMap}
                  currentUserId={userId}
                  t={t}
                  canRemoveTeam={canManageTournament}
                  onRemoveTeam={canManageTournament ? () => confirmRemoveTeam(team) : undefined}
                  removeTeamPending={deleteTeam.isPending}
                  onOpenProfile={(uid) => router.push(`/profile/${uid}` as never)}
                  onPressTeam={
                    id &&
                    (canManageTournament ||
                      (!!userId && (team.playerIds ?? []).includes(userId) && !tournamentStarted))
                      ? () =>
                          router.push(
                            `/tournament/${id}/team/${team._id}?division=${currentDivision}` as never
                          )
                      : undefined
                  }
                  classificationSummary={{
                    wins: row?.wins ?? 0,
                    points: row?.points ?? 0,
                    category: cat,
                    classified: showOut && classificationBundle.teamCategory.has(team._id),
                    showOutcomeIcons: showOut,
                  }}
                />
              );
            }}
            emptyTextStyle={styles.emptyText}
            teamsTabCreateRowStyle={styles.teamsTabCreateRow}
            teamCardStyle={tournamentTeamCardStyles.teamCard}
            footerContent={
              teamSlotsFull && id && !tournamentStarted ? (
                <TeamSlotWaitlistSection
                  tournamentId={id}
                  division={currentDivision}
                  guestMap={guestMap}
                  currentUserId={userId}
                  canManageTournament={canManageTournament}
                  t={t}
                  onOpenProfile={(uid) => router.push(`/profile/${uid}` as never)}
                />
              ) : null
            }
          />
        ) : null}

        {activeTab === 'groups' ? (
          <GroupsTab
            t={t}
            loadingTeams={loadingTeams}
            filteredTeams={filteredTeams}
            canManageTournament={canManageTournament && !shouldUseDevMocks() && !!userId}
            groupsDistributionPending={groupsDistributionPending}
            primaryGroupAction={primaryGroupAction}
            onPrimaryGroupAction={() => {
              if (!id) return;
              randomizeGroupsMutation.mutate(
                { id },
                { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
              );
            }}
            primaryGroupPending={randomizeGroupsMutation.isPending}
            rosterTeamsTotal={teams.length}
            maxTeams={tournament?.maxTeams ?? 0}
            offerGroupRebalance={offerGroupRebalance}
            groupMetaTeamsPerGroup={groupMeta.teamsPerGroup}
            onRebalancePress={() => {
              if (!id) return;
              rebalanceGroupsMutation.mutate(
                { id },
                {
                  onError: (err: unknown) =>
                    alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
                }
              );
            }}
            rebalancePending={rebalanceGroupsMutation.isPending}
            divisionTeamsByGroup={divisionTeamsByGroup}
            renderTeam={(team) => (
              <TournamentTeamCard
                key={team._id}
                team={team}
                userMap={userMap}
                guestMap={guestMap}
                currentUserId={userId}
                t={t}
                canRemoveTeam={canManageTournament}
                onRemoveTeam={canManageTournament ? () => confirmRemoveTeam(team) : undefined}
                removeTeamPending={deleteTeam.isPending}
                onOpenProfile={(uid) => router.push(`/profile/${uid}` as never)}
                onPressTeam={
                  id &&
                  (canManageTournament ||
                    (!!userId && (team.playerIds ?? []).includes(userId) && !tournamentStarted))
                    ? () =>
                        router.push(`/tournament/${id}/team/${team._id}?division=${currentDivision}` as never)
                    : undefined
                }
              />
            )}
            canReorderTeams={canManageTournament && tournamentStarted}
            onReorderTeam={() => {}}
            swapSourceTeamId={swapSourceTeamId}
            onSwapTeam={handleSwapTeam}
            onCancelSwap={() => setSwapSourceTeamId(null)}
            reorderPendingTeamId={reorderPendingTeamId}
            emptyTextStyle={styles.emptyText}
            rebalanceBannerStyle={styles.rebalanceBanner}
            rebalanceHintStyle={styles.rebalanceHint}
            groupBlockStyle={styles.groupBlock}
            groupHeadingStyle={styles.groupHeading}
            emptyGroupStyle={styles.emptyGroup}
            teamCardStyle={tournamentTeamCardStyles.teamCard}
            groupsPendingLegendStyle={styles.fixtureClassificationEmptyLegend}
          />
        ) : null}

        {activeTab === 'bets' ? (
          <BetsTab
            t={t}
            snapshot={bettingSnapshot ?? undefined}
            userMap={userMap}
            currentUserId={userId}
            playLockedReason={tournamentPlayLockedReason}
            canBet={canPlaceTournamentBet}
            onPlaceWinner={(matchId, teamId) => {
              if (!requireOnline()) return;
              placeTournamentBetMutation.mutate(
                { matchId, kind: 'winner', pickWinnerTeamId: teamId },
                { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.bettingPlaceFailed') }
              );
            }}
            onPlaceScore={(matchId, pointsA, pointsB) => {
              if (!requireOnline()) return;
              placeTournamentBetMutation.mutate(
                { matchId, kind: 'score', pickPointsA: pointsA, pickPointsB: pointsB },
                { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.bettingPlaceFailed') }
              );
            }}
            placePending={placeTournamentBetMutation.isPending}
            emptyTextStyle={styles.emptyText}
          />
        ) : null}

        {activeTab === 'fixture' ? (
            <FixtureTab
              t={t}
              matchCategoryTabs={matchCategoryTabs}
              selectedMatchesSubtab={selectedMatchesSubtab}
              onSelectSubtab={setActiveMatchesSubtab}
              liveMatches={liveMatchesRows}
              classificationData={classificationData}
              categoryMatchesByCategory={categoryMatchesByCategory}
              teamById={teamById}
              userMap={userMap}
              guestMap={guestMap}
              tournamentId={id ?? ''}
              opponentTbdLabel={opponentTbdLabel}
              categoryTeamIdsByCategory={categoryTeamIdsByCategory}
              divisionHasTeams={filteredTeams.length > 0}
              groupsDistributionPending={groupsDistributionPending}
              fixtureClassificationEmptyLegendStyle={styles.fixtureClassificationEmptyLegend}
              onOpenMatch={(matchId) => {
                if (!id) return;
                router.push(`/tournament/${id}/match/${matchId}` as never);
              }}
              canQuickEditMatches={canManageTournament}
              emptyTextStyle={styles.emptyText}
              matchesSubtabBarStyle={styles.matchesSubtabBar}
              matchesSubtabItemStyle={styles.matchesSubtabItem}
              matchesSubtabItemSelectedStyle={styles.matchesSubtabItemSelected}
              matchesSubtabLabelStyle={styles.matchesSubtabLabel}
              matchesSubtabLabelSelectedStyle={styles.matchesSubtabLabelSelected}
              groupBlockStyle={styles.groupBlock}
              groupHeadingStyle={styles.groupHeading}
              bracketRoundHeadingStyle={styles.bracketRoundHeading}
              emptyGroupStyle={styles.emptyGroup}
              matchRowStyle={styles.matchRow}
              matchTeamNameStyle={styles.matchTeamName}
              matchWinnerStyle={styles.matchWinner}
              matchScoreStyle={styles.matchScore}
              matchStandingRowStyle={styles.matchStandingRow}
              matchStandingRankStyle={styles.matchStandingRank}
              matchStandingTeamStyle={styles.matchStandingTeam}
              matchStandingMetaStyle={styles.matchStandingMeta}
            />
        ) : null}
      </View>

          <View style={styles.actions}>
        {!canEnroll && (
          <Text style={styles.genderRequired}>{t('tournamentDetail.genderRequired')}</Text>
        )}
          </View>
        </>
      )}
    />
    <View style={styles.persistentTabsWrap} pointerEvents="box-none">
      <PersistentBottomTabs active="tournaments" />
    </View>
    <OrganizeOnlyDivisionsModal
      visible={organizeOnlyModal != null}
      onClose={() => setOrganizeOnlyModal(null)}
      title={
        organizeOnlyModal?.mode === 'promote'
          ? t('tournamentDetail.organizeOnlyDivisionsTitlePromote', { name: organizeOnlyModal.playerName })
          : t('tournamentDetail.organizeOnlyDivisionsTitleSelf')
      }
      subtitle={t('tournamentDetail.organizeOnlyDivisionsSubtitle')}
      divisionLabel={(d) =>
        d === 'men'
          ? t('tournaments.divisionMen')
          : d === 'women'
            ? t('tournaments.divisionWomen')
            : t('tournaments.divisionMixed')
      }
      confirmLabel={t('common.ok')}
      cancelLabel={t('common.cancel')}
      divisionsEnabled={availableDivisions}
      selected={new Set(organizeOnlyModal?.selected ?? [])}
      onToggleDivision={(d) =>
        setOrganizeOnlyModal((prev) => {
          if (!prev) return prev;
          const next = new Set(prev.selected);
          if (next.has(d)) next.delete(d);
          else next.add(d);
          return { ...prev, selected: [...next] };
        })
      }
      onConfirm={submitOrganizeOnlyModal}
      confirmDisabled={!(organizeOnlyModal?.selected.length)}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 20, paddingBottom: 40 + PERSISTENT_TABS_HEIGHT },
  centered: { justifyContent: 'center', padding: 24 },
  skeletonBlock: { marginBottom: 24 },
  header: { marginBottom: 0 },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  headerTopRowEnd: { justifyContent: 'flex-end' },
  headerTopActions: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  dateLocationLeft: { flex: 1, minWidth: 0 },
  progressWrap: { marginTop: 10, gap: 8, paddingHorizontal: 6, paddingTop: 2 },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: Colors.text,
    borderRadius: 999,
  },
  progressLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', textAlign: 'center' },
  waitlistActions: { marginBottom: 16 },
  tabsSection: { marginBottom: 8, overflow: 'visible' },
  persistentTabsWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  divisionTabBar: {
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
    zIndex: 3,
    marginBottom: -2,
    paddingHorizontal: 6,
  },
  divisionTab: {
    flex: 1,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    zIndex: 1,
  },
  divisionTabSelected: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    borderBottomColor: Colors.surface,
    zIndex: 4,
    transform: [{ translateY: -1 }],
  },
  divisionTabLabel: {
    fontSize: 14,
    fontWeight: '700',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    color: Colors.textMuted,
  },
  divisionTabLabelSelected: { color: Colors.text },
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  cancelledBannerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 21,
  },
  privateBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  privateBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 20,
  },
  dateLocationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 6,
  },
  date: { fontSize: 16, color: Colors.textSecondary, flexShrink: 0, textTransform: 'none' },
  dateLocationSep: { fontSize: 16, color: Colors.textSecondary, lineHeight: 22, textTransform: 'none' },
  location: { fontSize: 16, color: Colors.textSecondary, flex: 1, minWidth: 0, textTransform: 'none' },
  matchRulesText: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    textTransform: 'none',
  },
  statsBlock: { marginTop: 4 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    marginTop: -2,
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 4,
    marginBottom: 0,
    gap: 4,
    zIndex: 2,
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    gap: 4,
  },
  tabItemSelected: {
    backgroundColor: Colors.surfaceLight,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  tabValue: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
    textAlign: 'center',
  },
  waitingListMark: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.6,
    lineHeight: 22,
    textAlign: 'center',
    minHeight: 22,
    textTransform: 'uppercase',
  },
  tabLabelSelected: {
    color: Colors.text,
  },
  tabPanel: { marginBottom: 8, minHeight: 80 },
  tabPanelTight: { marginTop: -10 },
  tabPanelSpaced: { marginTop: 10 },
  teamsTabCreateRow: { marginBottom: 8, gap: 8 },
  fixturePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  fixturePlaceholderText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  matchesSubtabBar: {
    flexDirection: 'row',
    gap: 4,
    position: 'relative',
    zIndex: 3,
    marginTop: -2,
    marginBottom: -2,
    paddingHorizontal: 6,
  },
  matchesSubtabItem: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
    zIndex: 1,
  },
  matchesSubtabItemSelected: {
    backgroundColor: Colors.surface,
    borderColor: Colors.surfaceLight,
    borderTopColor: Colors.surface,
    zIndex: 4,
  },
  matchesSubtabLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    color: Colors.textMuted,
  },
  matchesSubtabLabelSelected: {
    color: Colors.text,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  fixtureSearch: {
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
    color: Colors.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  matchTeamName: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  matchWinner: {
    fontWeight: '700',
  },
  matchScore: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '700',
  },
  matchStandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  matchStandingRank: {
    width: 28,
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  matchStandingTeam: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600',
  },
  matchStandingMeta: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  groupBlock: { marginBottom: 8 },
  groupHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
    marginTop: 4,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  /** Knockout round titles in fixture list — same size as bracket diagram column labels and “Grupo n”. */
  bracketRoundHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
    marginTop: 4,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  emptyGroup: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 8 },
  rebalanceBanner: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    gap: 12,
  },
  rebalanceHint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  actions: { gap: 12 },
  errorText: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center' },
  emptyText: { fontSize: 14, color: Colors.textMuted, fontStyle: 'italic' },
  /** Fixture + Groups tab: centered italic legend (pre–groups / empty category). */
  fixtureClassificationEmptyLegend: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
    alignSelf: 'stretch',
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  /** Shown in Waiting list tab below the empty-state placeholder (or above the list). */
  waitlistAlreadyInTeamHint: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 12,
    textAlign: 'left',
    fontStyle: 'italic',
  },
  genderRequired: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: 12 },
  waitlistExplainer: { fontSize: 13, color: Colors.textMuted, lineHeight: 18, marginBottom: 12 },
  tournamentConfigCard: {
    position: 'relative',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  tournamentConfigContent: {
    position: 'relative',
    zIndex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tournamentConfigName: {
    paddingRight: 34,
    marginBottom: 8,
  },
  tournamentConfigMenuAbs: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 2,
  },
  tournamentConfigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 34,
  },
  tournamentConfigText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
    fontStyle: 'italic',
    fontWeight: '700',
    textTransform: 'none',
  },
  tournamentConfigLocationPress: {
    flex: 1,
    minWidth: 0,
  },
  tournamentLocationLink: {
    color: Colors.text,
    textDecorationLine: 'underline',
  },
  playerRow: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  /** Organizers — palette `violet` via `violetMuted` / `violetOutline`. */
  playerRowOrganizer: {
    backgroundColor: Colors.surfaceLight,
    borderColor: Colors.surfaceLight,
  },
  playerRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  playerRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  playerRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  playerRowText: { flex: 1, minWidth: 0 },
  playerRowName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  orgBadge: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  waitlistRankText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
