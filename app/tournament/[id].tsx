import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, Share, Alert, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import type { Gender, User, TournamentDivision, Team, Entry } from '@/types';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import type { OrganizerMenuItem } from '@/components/tournament/TournamentOrganizerMenu';
import { config, shouldUseDevMocks } from '@/lib/config';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { GroupsTab } from '@/components/tournament/detail/GroupsTab';
import { WaitingListTab } from '@/components/tournament/detail/WaitingListTab';
import { PlayersTab } from '@/components/tournament/detail/PlayersTab';
import { TeamsTab } from '@/components/tournament/detail/TeamsTab';
import { FixtureTab } from '@/components/tournament/detail/FixtureTab';
import { TournamentHeader } from '@/components/tournament/detail/TournamentHeader';
import { WaitlistActions } from '@/components/tournament/detail/WaitlistActions';
import { TournamentTabsBar } from '@/components/tournament/detail/TournamentTabsBar';
import {
  useTournament,
  useDeleteTournament,
  useUpdateTournament,
  useRebalanceTournamentGroups,
  useRandomizeTournamentGroups,
  useStartTournament,
  useFinalizeClassification,
} from '@/lib/hooks/useTournaments';
import { useTeams, useDeleteTeam, useUpdateTeam } from '@/lib/hooks/useTeams';
import { useEntries, useCreateEntry, useDeleteEntry } from '@/lib/hooks/useEntries';
import { useWaitlist, useJoinWaitlist, useLeaveWaitlist } from '@/lib/hooks/useWaitlist';
import { useMatches } from '@/lib/hooks/useMatches';
import { useUsers } from '@/lib/hooks/useUsers';
import { useUserStore } from '@/store/useUserStore';
import { useLanguageStore } from '@/store/useLanguageStore';
import { getPlayerListName, getPlayerSortKey } from '@/lib/utils/userDisplay';
import { useNetInfo } from '@react-native-community/netinfo';
import { buildSeededClassificationData } from '@/lib/tournamentFixtureSeed';
import { assignCategories, computeStandingsForGroup } from '@/lib/tournamentStandings';
import { divisionForEntry, divisionForTeam, type DivisionTab as DivisionTabUtil } from '@/lib/tournamentDivision';
import {
  maxPlayerSlotsForTournament,
  normalizeGroupCount,
  shouldOfferGroupRebalance,
  teamGroupIndex,
  validateTournamentGroups,
} from '@/lib/tournamentGroups';
import { alertApiError } from '@/lib/utils/apiError';

function TeamCard({
  team,
  userMap,
  currentUserId,
  t,
  canRemoveTeam,
  onRemoveTeam,
  removeTeamPending,
  onOpenProfile,
}: {
  team: Team;
  userMap: Record<string, User>;
  currentUserId: string | null;
  t: (key: string, options?: Record<string, string | number>) => string;
  canRemoveTeam?: boolean;
  onRemoveTeam?: () => void;
  removeTeamPending?: boolean;
  onOpenProfile: (userId: string) => void;
}) {
  return (
    <View style={styles.teamCard}>
      <View style={styles.teamCardHeader}>
        <View style={styles.teamCardHeaderLeft}>
          <Text style={styles.teamName}>{team.name}</Text>
        </View>
        {canRemoveTeam && onRemoveTeam ? (
          <IconButton
            icon="trash-outline"
            onPress={onRemoveTeam}
            disabled={removeTeamPending}
            accessibilityLabel={t('tournamentDetail.removeTeam')}
            color="#f87171"
            size={16}
            compact
          />
        ) : null}
      </View>
      <View style={styles.players}>
        {[0, 1].map((i) => {
          const pid = team.playerIds?.[i];
          const user = pid ? userMap[pid] : null;
          const playerName = user ? getPlayerListName(user) : null;
          const isYou = pid === currentUserId;
          return pid ? (
            <Pressable
              key={i}
              style={styles.player}
              onPress={() => onOpenProfile(pid)}
              accessibilityRole="button"
              accessibilityLabel={t('profile.viewProfile')}
            >
              <Avatar
                firstName={user?.firstName ?? ''}
                lastName={user?.lastName ?? ''}
                gender={user?.gender === 'male' || user?.gender === 'female' ? user.gender : undefined}
                size="xs"
              />
              <Text style={[styles.playerNameSmall, isYou && styles.playerNameHighlight]}>{playerName || t('common.player')}</Text>
            </Pressable>
          ) : (
            <View key={i} style={styles.slot}>
              <Text style={styles.slotText}>{t('tournamentDetail.openSlot')}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function hasValidGender(g?: Gender | string): g is Gender {
  return g === 'male' || g === 'female';
}

function TournamentHeaderTitle({ id }: { id: string | undefined }) {
  const { t } = useTranslation();
  const { data: tournament } = useTournament(id);
  return <Text style={headerTitleStyle}>{tournament?.name ?? t('common.tournament')}</Text>;
}

const headerTitleStyle = {
  color: '#e5e5e5',
  fontSize: 17,
  fontWeight: '600',
  fontStyle: 'italic',
  textTransform: 'uppercase',
} as const;

type TournamentTab = 'players' | 'teams' | 'groups' | 'waitinglist' | 'fixture';
type DivisionTab = DivisionTabUtil;
type MatchCategoryTab = 'Gold' | 'Silver' | 'Bronze';
type MatchSubTab = 'classification' | MatchCategoryTab;

const TAB_CONFIG: {
  id: TournamentTab;
  icon: keyof typeof Ionicons.glyphMap | 'volleyball';
  labelKey:
    | 'tournamentDetail.tabPlayers'
    | 'tournamentDetail.tabTeams'
    | 'tournamentDetail.tabGroups'
    | 'tournamentDetail.tabWaitingList'
    | 'tournamentDetail.tabFixture';
}[] = [
  { id: 'players', icon: 'people-outline', labelKey: 'tournamentDetail.tabPlayers' },
  { id: 'teams', icon: 'shield-outline', labelKey: 'tournamentDetail.tabTeams' },
  { id: 'groups', icon: 'grid-outline', labelKey: 'tournamentDetail.tabGroups' },
  { id: 'waitinglist', icon: 'time-outline', labelKey: 'tournamentDetail.tabWaitingList' },
  { id: 'fixture', icon: 'volleyball', labelKey: 'tournamentDetail.tabFixture' },
];

export default function TournamentDetailScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TournamentTab>('players');
  const [activeDivision, setActiveDivision] = useState<DivisionTab>('mixed');
  const [activeMatchesSubtab, setActiveMatchesSubtab] = useState<MatchSubTab>('classification');
  const [onlyMyClassificationMatches, setOnlyMyClassificationMatches] = useState(false);
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;
  const storedLanguage = useLanguageStore((s) => s.language);
  const canEnroll = hasValidGender(user?.gender);
  const netInfo = useNetInfo();
  const isOffline = (netInfo.isConnected === false || netInfo.isInternetReachable === false) && !shouldUseDevMocks();
  const requireOnline = useCallback((): boolean => {
    if (!isOffline) return true;
    Alert.alert(t('common.error'), t('common.offlineBanner'));
    return false;
  }, [isOffline, t]);

  const { data: tournament, isLoading: loadingTournament, isError: errorTournament, error: tournamentError } = useTournament(id);
  const { data: teams = [], isLoading: loadingTeams } = useTeams(id ? { tournamentId: id } : undefined);
  const { data: entries = [] } = useEntries(id ? { tournamentId: id } : undefined);
  const { data: waitlistInfo } = useWaitlist(id);
  const joinWaitlist = useJoinWaitlist();
  const leaveWaitlist = useLeaveWaitlist();

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

  const { data: allMatches = [] } = useMatches(id ? { tournamentId: id } : undefined);
  const classificationMatches = useMemo(
    () => allMatches.filter((m) => (m as { stage?: string }).stage === 'classification'),
    [allMatches]
  );
  const categoryMatches = useMemo(
    () => allMatches.filter((m) => (m as { stage?: string }).stage === 'category'),
    [allMatches]
  );

  const teamById = useMemo(() => Object.fromEntries(teams.map((tm) => [tm._id, tm])), [teams]);

  const allPlayerIds = teams.flatMap((t) => t.playerIds ?? []).filter(Boolean);
  const entryUserIds = entries.map((e) => e.userId);
  const waitlistUserIds = (waitlistInfo?.users ?? []).map((w) => w.userId).filter(Boolean);
  const combinedUserIds = [...new Set([...allPlayerIds, ...entryUserIds, ...waitlistUserIds])];
  const { data: users = [] } = useUsers(combinedUserIds);
  const userMap = Object.fromEntries(users.map((u) => [u._id, u]));

  const hasJoined = entries.some((e) => e.userId === userId);
  const userHasTeam = teams.some(
    (t) => (t.playerIds ?? []).includes(userId ?? '') && String((t as { tournamentId?: unknown }).tournamentId ?? '') === String(id ?? '')
  );
  const isLoading = loadingTournament;
  const isError = errorTournament;

  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: () => <TournamentHeaderTitle id={id ?? undefined} /> });
  }, [navigation, id]);

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
    const hasNonOrganizerEntry = entries.some((e) => !organizerIds.includes(e.userId));
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
    Share.share({
      message: t('tournamentDetail.inviteMessage', { name: tournament.name, url }),
      url,
      title: t('tournamentDetail.inviteTitle'),
    }).catch(() => Alert.alert(t('common.error'), t('tournamentDetail.couldNotShare')));
  }, [i18n.locale, storedLanguage, t, tournament?.inviteLink, tournament?.name]);

  const organizerMenuItems = useMemo((): OrganizerMenuItem[] => {
    const list: OrganizerMenuItem[] = [];

    if (!tournament) return list;

    const started =
      !!(tournament as { startedAt?: unknown }).startedAt ||
      (tournament as { phase?: unknown }).phase === 'classification' ||
      (tournament as { phase?: unknown }).phase === 'categories' ||
      (tournament as { phase?: unknown }).phase === 'completed';

    if (id) {
      list.push(
        {
          key: 'edit',
          label: t('tournamentDetail.menuEdit'),
          icon: 'create-outline',
          color: Colors.yellow,
          onPress: () => router.push(`/admin/tournament/${id}` as never),
        },
        {
          key: 'roster',
          label: t('tournamentDetail.menuAdd'),
          icon: 'person-add-outline',
          color: Colors.yellow,
          onPress: () => router.push(`/admin/tournament/${id}/roster` as never),
        }
      );
    }

    if (!started && id && !shouldUseDevMocks()) {
      list.push(
        {
          key: 'classificationSettings',
          label: t('tournamentDetail.menuClassificationSettings'),
          icon: 'options-outline',
          color: Colors.yellow,
          onPress: () => router.push(`/tournament/${id}/classification-settings` as never),
        },
        {
          key: 'start',
          label: t('tournamentDetail.menuStartTournament'),
          icon: 'play-outline',
          color: Colors.success,
          disabled: startTournamentMutation.isPending,
          onPress: () =>
            Alert.alert(
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

    if (!started && id && !shouldUseDevMocks()) {
      list.push({
        key: 'randomizeGroups',
        label: t('tournamentDetail.menuReorganizeGroups'),
        icon: 'shuffle-outline',
        color: Colors.violet,
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

    if (tournament.inviteLink) {
      list.push({
        key: 'share',
        label: t('tournamentDetail.menuShare'),
        icon: 'share-outline',
        color: Colors.yellow,
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
        color: Colors.violet,
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
    t,
    router,
    handleShareInvite,
    handleDelete,
    deleteTournament.isPending,
    randomizeGroupsMutation,
    startTournamentMutation,
    finalizeClassificationMutation,
    classificationMatches,
  ]);

  // Everything below must be declared before any early `return` so hook order stays stable.
  const organizerIds = tournament?.organizerIds ?? [];
  const dateLabel = tournament?.date || tournament?.startDate;
  const isCancelled = tournament?.status === 'cancelled';
  const playerCap = maxPlayerSlotsForTournament(tournament?.maxTeams ?? 16);
  const isFull = entries.length >= playerCap;

  const divisions = (((tournament as { divisions?: unknown } | undefined)?.divisions ?? []) as TournamentDivision[]).filter(Boolean);
  const availableDivisions: DivisionTab[] = (divisions.length ? divisions : ['mixed']) as DivisionTab[];
  const currentDivision: DivisionTab = availableDivisions.includes(activeDivision)
    ? activeDivision
    : availableDivisions[0]!;
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

  const teamDivisionById = useMemo(() => {
    const map: Record<string, DivisionTab> = {};
    for (const team of teams) map[team._id] = divisionForTeam(team, userMap);
    return map;
  }, [teams, userMap]);

  const filteredTeams = useMemo(
    () => teams.filter((team) => teamDivisionById[team._id] === currentDivision),
    [teams, teamDivisionById, currentDivision]
  );

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const d = divisionForEntry(entry, userMap, teamDivisionById);
      return d === currentDivision;
    });
  }, [entries, userMap, teamDivisionById, currentDivision]);

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      const na = getPlayerSortKey(userMap[a.userId]);
      const nb = getPlayerSortKey(userMap[b.userId]);
      return na.localeCompare(nb);
    });
  }, [filteredEntries, userMap]);

  const divisionTeamsByGroup = useMemo(() => {
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
  }, [filteredTeams, groupsPerDivisionCap, divisionGroupOffset]);

  const filteredGroupsWithTeams = divisionTeamsByGroup.filter((g) => g.length > 0).length;
  const filteredWaitlist = useMemo(() => {
    return (waitlistInfo?.users ?? []).filter((row) => {
      const g = userMap[row.userId]?.gender;
      if (currentDivision === 'men') return g === 'male' || g == null;
      if (currentDivision === 'women') return g === 'female' || g == null;
      return true;
    });
  }, [waitlistInfo?.users, userMap, currentDivision]);

  const waitlistPositionForDivision = useMemo(() => {
    if (!userId) return null;
    const idx = filteredWaitlist.findIndex((r) => r.userId === userId);
    return idx >= 0 ? idx + 1 : null;
  }, [filteredWaitlist, userId]);

  const matchCategoryTabs = (() => {
    const cats = (((tournament as { categories?: unknown } | undefined)?.categories ?? []) as unknown[]).filter(
      (c): c is MatchCategoryTab => c === 'Gold' || c === 'Silver' || c === 'Bronze'
    );
    return ['classification', ...cats] as MatchSubTab[];
  })();

  const selectedMatchesSubtab = matchCategoryTabs.includes(activeMatchesSubtab)
    ? activeMatchesSubtab
    : matchCategoryTabs[0]!;

  const classificationData = useMemo(() => {
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
      computeStandingsForGroup({ teams: teamsInGroup, matches: groupMatchesByLocal.get(localGi) ?? [] })
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

    const { teamCategory } = assignCategories({
      standingsByGroup,
      categories: cats,
      categoryFractions: categoryFractions ?? null,
      singleCategoryAdvanceFraction,
    });

    // Shape expected by FixtureTab.
    return standingsByGroup.map((standings, localGi) => {
      const matches = (groupMatchesByLocal.get(localGi) ?? []).map((m) => {
        const teamA =
          teamById[m.teamAId] ??
          ({ _id: m.teamAId, name: m.teamAId, tournamentId: id ?? '', playerIds: [], createdBy: '', createdAt: '', updatedAt: '' } as Team);
        const teamB =
          teamById[m.teamBId] ??
          ({ _id: m.teamBId, name: m.teamBId, tournamentId: id ?? '', playerIds: [], createdBy: '', createdAt: '', updatedAt: '' } as Team);
        return {
          id: m._id,
          teamA,
          teamB,
          setsWonA: m.setsWonA ?? 0,
          setsWonB: m.setsWonB ?? 0,
          winnerId: m.winnerId ?? '',
          status: m.status,
        };
      });

      const categoriesMap: Partial<Record<MatchCategoryTab, typeof standings>> = {};
      for (const cat of cats) {
        categoriesMap[cat] = standings.filter((row) => teamCategory.get(row.team._id) === cat);
      }
      return { matches, standings, categories: categoriesMap };
    });
  }, [
    classificationMatches,
    divisionTeamsByGroup,
    divisionGroupOffset,
    groupsPerDivisionCap,
    matchCategoryTabs,
    tournament,
    id,
    teamById,
  ]);

  const categoryMatchesByCategory = useMemo(() => {
    const out: Partial<Record<'Gold' | 'Silver' | 'Bronze', any[]>> = {};
    const cats: ('Gold' | 'Silver' | 'Bronze')[] = ['Gold', 'Silver', 'Bronze'];
    for (const c of cats) out[c] = [];

    const snapshot = (tournament as { categoriesSnapshot?: unknown } | undefined)?.categoriesSnapshot as
      | {
          divisions?: {
            division: string;
            categories: { category: 'Gold' | 'Silver' | 'Bronze'; matchIds: string[] }[];
          }[];
        }
      | undefined;

    // Build lookup for match rows from live data (no filtering).
    const rowByMatchId = new Map<string, any>();
    for (const m of categoryMatches) {
      const teamA =
        teamById[m.teamAId] ??
        ({ _id: m.teamAId, name: m.teamAId, tournamentId: id ?? '', playerIds: [], createdBy: '', createdAt: '', updatedAt: '' } as Team);
      const teamB =
        teamById[m.teamBId] ??
        ({ _id: m.teamBId, name: m.teamBId, tournamentId: id ?? '', playerIds: [], createdBy: '', createdAt: '', updatedAt: '' } as Team);
      rowByMatchId.set(m._id, {
        id: m._id,
        teamA,
        teamB,
        setsWonA: m.setsWonA ?? 0,
        setsWonB: m.setsWonB ?? 0,
        winnerId: m.winnerId ?? '',
        status: m.status,
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
  }, [categoryMatches, currentDivision, id, teamById, tournament]);

  const myTeamIdForDivision = useMemo(() => {
    if (!userId) return null;
    const mine = teams.find((tm) => (tm.playerIds ?? []).includes(userId) && divisionForTeam(tm, userMap) === currentDivision);
    return mine?._id ?? null;
  }, [currentDivision, teams, userId, userMap]);

  const filteredClassificationData = useMemo(() => {
    if (!onlyMyClassificationMatches || !myTeamIdForDivision) return classificationData;
    return classificationData
      .map((g) => {
        const matches = (g.matches ?? []).filter(
          (m: any) => m?.teamA?._id === myTeamIdForDivision || m?.teamB?._id === myTeamIdForDivision
        );
        return { ...g, matches };
      })
      .filter((g) => (g.matches ?? []).length > 0);
  }, [classificationData, myTeamIdForDivision, onlyMyClassificationMatches]);

  const fixtureCounts = useMemo(() => {
    if (selectedMatchesSubtab === 'classification') {
      const ms = filteredClassificationData.flatMap((g) => g.matches ?? []);
      const total = ms.length;
      const completed = ms.filter((m: any) => m.status === 'completed').length;
      return { total, completed };
    }
    const ms = (categoryMatchesByCategory[selectedMatchesSubtab as 'Gold' | 'Silver' | 'Bronze'] ?? []) as any[];
    const total = ms.length;
    const completed = ms.filter((m) => m.status === 'completed').length;
    return { total, completed };
  }, [categoryMatchesByCategory, filteredClassificationData, selectedMatchesSubtab]);

  const tournamentStarted =
    !!(tournament as { startedAt?: unknown } | undefined)?.startedAt ||
    (tournament as { phase?: unknown } | undefined)?.phase === 'classification' ||
    (tournament as { phase?: unknown } | undefined)?.phase === 'categories' ||
    (tournament as { phase?: unknown } | undefined)?.phase === 'completed';

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
    updateTeam.isPending;

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
            <View key={i} style={styles.teamCard}>
              <Skeleton height={18} width="40%" style={{ marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Skeleton height={36} width={80} borderRadius={18} />
                <Skeleton height={36} width={80} borderRadius={18} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{tournamentError?.message || t('tournamentDetail.failedToLoad')}</Text>
      </View>
    );
  }

  const isOrganizer = organizerIds.includes(userId ?? '');
  const isAdmin = user?.role === 'admin';
  /** Organizers and global admins can manage roster, teams, and invites from this screen. */
  const canManageTournament = isOrganizer || isAdmin;

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
    if (!userId || !id) return;
    Alert.alert(t('tournamentDetail.makeOrganizer'), t('tournamentDetail.makeOrganizerConfirm', { name: playerName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.ok'),
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
    ]);
  };

  const demoteOrganizer = (targetUserId: string, playerName: string) => {
    if (!userId || !id) return;
    const prev = tournament.organizerIds ?? [];
    if (prev.length <= 1) {
      Alert.alert(t('common.error'), t('tournamentDetail.cannotRemoveLastOrganizer'));
      return;
    }
    if (!prev.includes(targetUserId)) return;
    Alert.alert(
      t('tournamentDetail.removeOrganizer'),
      t('tournamentDetail.removeOrganizerConfirm', { name: playerName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          style: 'destructive',
          onPress: () => {
            const next = prev.filter((x) => x !== targetUserId);
            updateTournament.mutate(
              { id, organizerIds: next },
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
    Alert.alert(
      t('tournamentDetail.removePlayer'),
      t('tournamentDetail.removePlayerConfirm', { name: playerName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () =>
            deleteEntry.mutate(
              { id: entry._id, tournamentId: id },
              {
                onError: (err: unknown) =>
                  alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
              }
            ),
        },
      ]
    );
  };

  const confirmLeave = () => {
    if (!userId || !id) return;
    if (!requireOnline()) return;
    const ownEntry = entries.find((e) => e.userId === userId);
    if (!ownEntry) return;
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
  };

  const confirmRemoveTeam = (team: Team) => {
    if (!userId || !id) return;
    if (!requireOnline()) return;
    const pNames = (team.playerIds ?? [])
      .map((pid) => (pid ? getPlayerListName(userMap[pid]) : ''))
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
    <FlashList
      data={[0]}
      keyExtractor={() => 'tournament-detail'}
      contentContainerStyle={styles.content as never}
      ListHeaderComponent={
        <>
          <TournamentHeader
            t={t}
            tournament={tournament}
            dateLabel={dateLabel}
            isCancelled={isCancelled}
            canManageTournament={canManageTournament}
            organizerMenuItems={organizerMenuItems}
            headerStyle={styles.header}
            cancelledBannerStyle={styles.cancelledBanner}
            cancelledBannerTextStyle={styles.cancelledBannerText}
            privateBannerStyle={styles.privateBanner}
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

          {/* Waitlist join/leave lives under tournament info (not inside tabs). */}
          <WaitlistActions
            t={t}
            show={!hasJoined && canEnroll && !isCancelled && isFull && filteredEntries.length >= playersPerDivisionCap}
            waitlistPosition={waitlistPositionForDivision}
            onJoin={() => {
              if (!userId || !id) return;
              if (!requireOnline()) return;
              joinWaitlist.mutate(
                { tournamentId: id, userId },
                { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
              );
            }}
            onLeave={() => {
              if (!userId || !id) return;
              if (!requireOnline()) return;
              leaveWaitlist.mutate(
                { tournamentId: id },
                { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
              );
            }}
            joinPending={joinWaitlist.isPending}
            leavePending={leaveWaitlist.isPending}
            wrapStyle={styles.waitlistActions}
            waitlistRowStyle={styles.waitlistRow}
            waitlistPositionTextStyle={styles.waitlistPositionText}
          />

          <TournamentTabsBar
            t={t}
            availableDivisions={availableDivisions}
            currentDivision={currentDivision}
            onSelectDivision={setActiveDivision}
            matchProgress={matchProgress}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            tabConfig={TAB_CONFIG as never}
            tabValueById={{
              players: `${filteredEntries.length}/${playersPerDivisionCap}`,
              teams: `${filteredTeams.length}/${teamsPerDivisionCap}`,
              groups: `${filteredGroupsWithTeams}/${groupsPerDivisionCap}`,
              waitinglist: `${filteredWaitlist.length}`,
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
          <PlayersTab
            t={t}
            sortedEntries={sortedEntries}
            userMap={userMap}
            organizerIds={organizerIds}
            currentUserId={userId}
            hasJoined={hasJoined}
            canManageTournament={canManageTournament}
            mutationBusy={mutationBusy}
            onOpenProfile={(uid) => router.push(`/profile/${uid}` as never)}
            onPromoteOrganizer={promoteOrganizer}
            onDemoteOrganizer={demoteOrganizer}
            onConfirmLeave={confirmLeave}
            onConfirmRemovePlayer={confirmRemovePlayer}
            emptyTextStyle={styles.emptyText}
            playerRowStyle={styles.playerRow}
            playerRowOrganizerStyle={styles.playerRowOrganizer}
            playerRowTopStyle={styles.playerRowTop}
            playerRowMainStyle={styles.playerRowMain}
            playerRowTextStyle={styles.playerRowText}
            playerRowNameStyle={styles.playerRowName}
            orgBadgeStyle={styles.orgBadge}
            playerRowRightStyle={styles.playerRowRight}
          />
        ) : null}

        {activeTab === 'teams' ? (
          <TeamsTab
            t={t}
            canCreateTeam={!userHasTeam && hasJoined && canEnroll && !!id}
            onCreateTeam={() => router.push(`/tournament/${id}/team/create`)}
            organizerActions={
              canManageTournament && id ? (
                <View style={styles.teamsTabCreateRow}>
                  <Button
                    title={t('tournamentDetail.createTeamFromEntries')}
                    variant="outline"
                    onPress={() => router.push(`/tournament/${id}/team/create-organizer`)}
                    size="sm"
                    fullWidth
                  />
                  <Button
                    title={t('admin.manageRoster')}
                    variant="secondary"
                    onPress={() => router.push(`/admin/tournament/${id}` as never)}
                    size="sm"
                    fullWidth
                    disabled={isOffline}
                  />
                </View>
              ) : null
            }
            loadingTeams={loadingTeams}
            filteredTeams={filteredTeams}
            renderTeam={(team) => (
              <TeamCard
                key={team._id}
                team={team}
                userMap={userMap}
                currentUserId={userId}
                t={t}
                canRemoveTeam={canManageTournament}
                onRemoveTeam={canManageTournament ? () => confirmRemoveTeam(team) : undefined}
                removeTeamPending={deleteTeam.isPending}
                onOpenProfile={(uid) => router.push(`/profile/${uid}` as never)}
              />
            )}
            emptyTextStyle={styles.emptyText}
            teamsTabCreateRowStyle={styles.teamsTabCreateRow}
            teamCardStyle={styles.teamCard}
          />
        ) : null}

        {activeTab === 'groups' ? (
          <GroupsTab
            t={t}
            loadingTeams={loadingTeams}
            filteredTeams={filteredTeams}
            canManageTournament={canManageTournament && !shouldUseDevMocks() && !!userId}
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
            canReorganizeGroups={canManageTournament && !tournamentStarted && !shouldUseDevMocks() && !!id}
            onReorganizeGroups={() => {
              if (!id) return;
              randomizeGroupsMutation.mutate(
                { id },
                { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
              );
            }}
            reorganizePending={randomizeGroupsMutation.isPending}
            divisionTeamsByGroup={divisionTeamsByGroup}
            renderTeam={(team) => (
              <TeamCard
                key={team._id}
                team={team}
                userMap={userMap}
                currentUserId={userId}
                t={t}
                canRemoveTeam={canManageTournament}
                onRemoveTeam={canManageTournament ? () => confirmRemoveTeam(team) : undefined}
                removeTeamPending={deleteTeam.isPending}
                onOpenProfile={(uid) => router.push(`/profile/${uid}` as never)}
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
            teamCardStyle={styles.teamCard}
          />
        ) : null}

        {activeTab === 'waitinglist' ? (
          <WaitingListTab
            t={t}
            filteredWaitlist={filteredWaitlist}
            userMap={userMap}
            onOpenProfile={(uid) => router.push(`/profile/${uid}` as never)}
            emptyTextStyle={styles.emptyText}
            playerRowStyle={styles.playerRow}
            playerRowMainStyle={styles.playerRowMain}
            playerRowTextStyle={styles.playerRowText}
            playerRowNameStyle={styles.playerRowName}
            waitlistRankTextStyle={styles.waitlistRankText}
          />
        ) : null}

        {activeTab === 'fixture' ? (
          <View>
            {selectedMatchesSubtab === 'classification' && myTeamIdForDivision ? (
              <View style={styles.fixtureQuickFilters}>
                <Pressable
                  onPress={() => setOnlyMyClassificationMatches((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: onlyMyClassificationMatches }}
                  style={[styles.fixtureQuickFilterPill, onlyMyClassificationMatches ? styles.fixtureQuickFilterPillSelected : null]}
                >
                  <Text style={[styles.fixtureQuickFilterLabel, onlyMyClassificationMatches ? styles.fixtureQuickFilterLabelSelected : null]}>
                    {t('tournamentDetail.onlyMyMatches')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <FixtureTab
              t={t}
              matchCategoryTabs={matchCategoryTabs}
              selectedMatchesSubtab={selectedMatchesSubtab}
              onSelectSubtab={setActiveMatchesSubtab}
              classificationCounts={fixtureCounts}
              classificationData={filteredClassificationData}
              categoryMatchesByCategory={categoryMatchesByCategory}
              onOpenMatch={(matchId) => {
                if (!id) return;
                router.push(`/tournament/${id}/match/${matchId}` as never);
              }}
              canQuickEditMatches={canManageTournament}
              emptyTextStyle={styles.emptyText}
              classificationCountsTextStyle={styles.fixtureCounts}
              matchesSubtabBarStyle={styles.matchesSubtabBar}
              matchesSubtabItemStyle={styles.matchesSubtabItem}
              matchesSubtabItemSelectedStyle={styles.matchesSubtabItemSelected}
              matchesSubtabLabelStyle={styles.matchesSubtabLabel}
              matchesSubtabLabelSelectedStyle={styles.matchesSubtabLabelSelected}
              groupBlockStyle={styles.groupBlock}
              groupHeadingStyle={styles.groupHeading}
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
          </View>
        ) : null}
      </View>

          <View style={styles.actions}>
        {!canEnroll && (
          <Text style={styles.genderRequired}>{t('tournamentDetail.genderRequired')}</Text>
        )}
        {!hasJoined && canEnroll && !isCancelled && !isFull && (
          <Button
            title={t('tournamentDetail.joinTournament')}
            onPress={() => {
              if (!userId || !id) return;
              if (!requireOnline()) return;
              createEntry.mutate(
                { tournamentId: id, userId, lookingForPartner: true },
                {
                  onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.joinFailed'),
                }
              );
            }}
            disabled={createEntry.isPending}
            fullWidth
          />
        )}
        {userHasTeam && (
          <Text style={styles.joinedBadge}>{t('tournamentDetail.alreadyInTeam')}</Text>
        )}
          </View>
        </>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40 },
  centered: { justifyContent: 'center', padding: 24 },
  skeletonBlock: { marginBottom: 24 },
  header: { marginBottom: 24 },
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
    backgroundColor: Colors.yellow,
    borderRadius: 999,
  },
  progressLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', textAlign: 'center' },
  waitlistActions: { marginBottom: 16 },
  tabsSection: { marginBottom: 8, overflow: 'visible' },
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
  divisionTabLabelSelected: { color: Colors.violet },
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
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
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
  date: { fontSize: 16, color: Colors.textSecondary, flexShrink: 0 },
  dateLocationSep: { fontSize: 16, color: Colors.textSecondary, lineHeight: 22 },
  location: { fontSize: 16, color: Colors.textSecondary, flex: 1, minWidth: 0 },
  matchRulesText: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
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
    color: Colors.yellow,
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
    gap: 8,
    position: 'relative',
    zIndex: 3,
    marginTop: -2,
    marginBottom: -2,
    paddingHorizontal: 6,
  },
  matchesSubtabItem: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
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
    color: Colors.violet,
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
  fixtureQuickFilters: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  fixtureQuickFilterPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  fixtureQuickFilterPillSelected: { backgroundColor: Colors.violetMuted, borderColor: Colors.violetOutline },
  fixtureQuickFilterLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  fixtureQuickFilterLabelSelected: { color: Colors.violet },
  fixtureCounts: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  matchTeamName: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  matchWinner: {
    color: Colors.yellow,
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
    color: Colors.yellow,
    marginBottom: 8,
    marginTop: 4,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  emptyGroup: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 8 },
  teamCard: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  teamCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 4,
  },
  teamCardHeaderLeft: { flex: 1, minWidth: 0 },
  teamName: { fontSize: 13, fontWeight: '700', color: Colors.text, lineHeight: 16 },
  players: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  rebalanceBanner: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.violetOutline,
    gap: 12,
  },
  rebalanceHint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  playerName: { fontSize: 12, color: Colors.text, lineHeight: 16 },
  playerNameSmall: { fontSize: 11, color: Colors.text, lineHeight: 14 },
  playerNameHighlight: { color: Colors.yellow, fontWeight: '600' },
  slot: { paddingVertical: 2, paddingHorizontal: 6, minHeight: 26, justifyContent: 'center', backgroundColor: Colors.surfaceLight, borderRadius: 4 },
  slotText: { fontSize: 11, color: Colors.textMuted },
  actions: { gap: 12 },
  errorText: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center' },
  emptyText: { fontSize: 14, color: Colors.textMuted, fontStyle: 'italic' },
  joinedBadge: { fontSize: 14, color: Colors.yellow, textAlign: 'center', marginBottom: 8 },
  genderRequired: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: 12 },
  waitlistRow: { gap: 10 },
  waitlistPositionText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
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
    backgroundColor: Colors.violetMuted,
    borderColor: Colors.violetOutline,
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
    color: Colors.yellow,
    fontWeight: '600',
    marginTop: 2,
  },
  waitlistRankText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
