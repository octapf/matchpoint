import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, Share, Alert, Pressable, ImageBackground } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import type { Gender, User, TournamentDivision, Team, Entry, TournamentCategory } from '@/types';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import type { OrganizerMenuItem } from '@/components/tournament/TournamentOrganizerMenu';
import { TournamentOrganizerMenu } from '@/components/tournament/TournamentOrganizerMenu';
import { config, shouldUseDevMocks } from '@/lib/config';
import { DEV_TOURNAMENT_ID, MOCK_DEV_CATEGORY_MATCHES, MOCK_DEV_TOURNAMENT } from '@/lib/mocks/devTournamentMocks';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { GroupsTab } from '@/components/tournament/detail/GroupsTab';
import { WaitingListTab } from '@/components/tournament/detail/WaitingListTab';
import { PlayersTab } from '@/components/tournament/detail/PlayersTab';
import { TeamsTab } from '@/components/tournament/detail/TeamsTab';
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
import { useUsers } from '@/lib/hooks/useUsers';
import { useUserStore } from '@/store/useUserStore';
import { useLanguageStore } from '@/store/useLanguageStore';
import { getPlayerSortKey, getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import { useNetInfo } from '@react-native-community/netinfo';
import { buildSeededClassificationData } from '@/lib/tournamentFixtureSeed';
import { assignCategories, computeStandingsForGroup, tieBreakOrdinal } from '@/lib/tournamentStandings';
import { resolveTeamForFixture } from '@/lib/tournamentMatchDisplay';
import { divisionForEntry, divisionForTeam, type DivisionTab as DivisionTabUtil } from '@/lib/tournamentDivision';
import {
  maxPlayerSlotsForTournament,
  normalizeGroupCount,
  shouldOfferGroupRebalance,
  teamGroupIndex,
  validateTournamentGroups,
} from '@/lib/tournamentGroups';
import { alertApiError } from '@/lib/utils/apiError';
import {
  missingDivisionForOrganizers,
  organizerOnlyCoversFromTournament,
  tournamentDivisionsNormalized,
} from '@/lib/tournamentOrganizerCoverage';
import { OrganizeOnlyDivisionsModal } from '@/components/tournament/detail/OrganizeOnlyDivisionsModal';
import { NotificationsInboxButton } from '@/components/notifications/NotificationsInboxButton';
const TEAM_TAB_BRONZE_MEDAL = '#cd7f32';

/** Same default asset as `TournamentListRow` / tournament cards in the list. */
const DEFAULT_TOURNAMENT_CARD_BG = require('@/assets/images/tournament-card-bg.png');
/** Icon + text on card image (matches `TournamentListRow` `CARD_CONFIG_ICON_COLOR`). */
const TOURNAMENT_CONFIG_ON_CARD = 'rgba(255, 255, 255, 0.92)';

/** "BARCELONETA" / "summer beach" → "Barceloneta" / "Summer Beach" for the info card (no CSS all-caps). */
function formatTournamentLocationDisplay(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim();
  if (!s) return '—';
  return s
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

function TeamCard({
  team,
  userMap,
  currentUserId,
  t,
  canRemoveTeam,
  onRemoveTeam,
  removeTeamPending,
  onOpenProfile,
  classificationSummary,
}: {
  team: Team;
  userMap: Record<string, User>;
  currentUserId: string | null;
  t: (key: string, options?: Record<string, string | number>) => string;
  canRemoveTeam?: boolean;
  onRemoveTeam?: () => void;
  removeTeamPending?: boolean;
  onOpenProfile: (userId: string) => void;
  classificationSummary?: {
    wins: number;
    points: number;
    category: TournamentCategory | null;
    classified: boolean;
    /**
     * When false, hide category medal and qualified/eliminated icons — standings-based category is not meaningful yet
     * (e.g. registration or classification before any match is completed).
     */
    showOutcomeIcons?: boolean;
  };
}) {
  const showOutcomeIcons = classificationSummary?.showOutcomeIcons !== false;

  const medalColor =
    classificationSummary?.category === 'Gold'
      ? Colors.yellow
      : classificationSummary?.category === 'Silver'
        ? Colors.textSecondary
        : classificationSummary?.category === 'Bronze'
          ? TEAM_TAB_BRONZE_MEDAL
          : Colors.textMuted;

  const a11yIcons =
    classificationSummary != null
      ? [
          ...(showOutcomeIcons
            ? [
                classificationSummary.classified
                  ? t('tournamentDetail.teamClassified')
                  : t('tournamentDetail.teamEliminated'),
                ...(classificationSummary.category
                  ? [t('tournamentDetail.teamCategoryMedalA11y', { medal: classificationSummary.category })]
                  : []),
              ]
            : []),
          `${t('tournamentDetail.teamTabWins')}: ${classificationSummary.wins}`,
          `${t('tournamentDetail.teamTabPoints')}: ${classificationSummary.points}`,
        ].join('. ')
      : undefined;

  const showDelete = Boolean(canRemoveTeam && onRemoveTeam);

  return (
    <View style={styles.teamCard}>
      <View style={styles.teamCardTopRow}>
        <View style={styles.teamCardNameWrap}>
          <Text style={styles.teamName} numberOfLines={1} ellipsizeMode="tail">
            {team.name}
          </Text>
        </View>
        {classificationSummary ? (
          <View style={styles.teamCardActionsRow}>
            <View
              style={styles.teamCardIconsCluster}
              accessibilityLabel={a11yIcons}
              accessible={true}
            >
              {showOutcomeIcons ? (
                <Ionicons
                  name={classificationSummary.classified ? 'checkmark-circle' : 'close-circle'}
                  size={20}
                  color={classificationSummary.classified ? Colors.success : Colors.error}
                />
              ) : null}
              {showOutcomeIcons && classificationSummary.category ? (
                <MaterialCommunityIcons name="medal-outline" size={20} color={medalColor} />
              ) : null}
              <Ionicons name="trophy-outline" size={17} color={Colors.textSecondary} />
              <Text style={styles.teamCardStatNumber}>{classificationSummary.wins}</Text>
              <Text style={styles.teamCardPtsLabel}>{t('tournamentDetail.teamTabPoints')}</Text>
              <Text style={styles.teamCardStatNumber}>{classificationSummary.points}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={[styles.teamCardBottomRow, showDelete ? styles.teamCardBottomRowWithDelete : null]}>
        <View style={styles.teamCardPlayersWrap}>
          <View style={styles.teamCardPlayersRow}>
            {[0, 1].map((i) => {
              const pid = team.playerIds?.[i];
              const user = pid ? userMap[pid] : null;
              const playerName = user ? getTournamentPlayerDisplayName(user) : null;
              const isYou = pid === currentUserId;
              return pid ? (
                <Pressable
                  key={i}
                  style={styles.teamCardPlayerCell}
                  onPress={() => onOpenProfile(pid)}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.viewProfile')}
                >
                  <Avatar
                    firstName={user?.firstName ?? ''}
                    lastName={user?.lastName ?? ''}
                    gender={user?.gender === 'male' || user?.gender === 'female' ? user.gender : undefined}
                    size="xs"
                    photoUrl={user?.photoUrl}
                  />
                  <Text style={[styles.playerNameSmall, isYou && styles.playerNameHighlight]} numberOfLines={1}>
                    {playerName || t('common.player')}
                  </Text>
                </Pressable>
              ) : (
                <View key={i} style={styles.teamCardSlotCell}>
                  <Text style={styles.slotText}>{t('tournamentDetail.openSlot')}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
      {showDelete && onRemoveTeam ? (
        <View style={styles.teamCardDeleteAbsolute}>
          <IconButton
            icon="trash-outline"
            onPress={onRemoveTeam}
            disabled={removeTeamPending}
            accessibilityLabel={t('tournamentDetail.removeTeam')}
            color="#f87171"
            size={16}
            compact
          />
        </View>
      ) : null}
    </View>
  );
}

function hasValidGender(g?: Gender | string): g is Gender {
  return g === 'male' || g === 'female';
}

/** Tournament name in the info card (same look as the former nav title). */
const tournamentNameInCardStyle = {
  color: '#e5e5e5',
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

type TournamentTab = 'players' | 'teams' | 'groups' | 'waitinglist' | 'fixture';
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
    | 'tournamentDetail.tabWaitingList'
    | 'tournamentDetail.tabFixture';
}[] = [
  { id: 'waitinglist', icon: 'time-outline', labelKey: 'tournamentDetail.tabWaitingList' },
  { id: 'players', icon: 'people-outline', labelKey: 'tournamentDetail.tabPlayers' },
  { id: 'teams', icon: 'shield-outline', labelKey: 'tournamentDetail.tabTeams' },
  { id: 'groups', icon: 'grid-outline', labelKey: 'tournamentDetail.tabGroups' },
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

  const { data: tournament, isLoading: loadingTournament, isError: errorTournament, error: tournamentError } = useTournament(id);
  const { data: teams = [], isLoading: loadingTeams } = useTeams(id ? { tournamentId: id } : undefined);
  const { data: entries = [] } = useEntries(id ? { tournamentId: id, inTeamOnly: true } : undefined);
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

  const { data: allMatches = [] } = useMatches(
    id ? { tournamentId: id } : undefined,
    id ? { enabled: !!id, refetchIntervalMs: activeTab === 'fixture' ? 7_000 : undefined } : undefined
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

  const teamById = useMemo(() => Object.fromEntries(teams.map((tm) => [tm._id, tm])), [teams]);

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

  const organizerMenuBaseItems = useMemo((): OrganizerMenuItem[] => {
    const list: OrganizerMenuItem[] = [];

    if (!tournament) return list;

    const started =
      !!(tournament as { startedAt?: unknown }).startedAt ||
      (tournament as { phase?: unknown }).phase === 'classification' ||
      (tournament as { phase?: unknown }).phase === 'categories' ||
      (tournament as { phase?: unknown }).phase === 'completed';

    const gdaMenu = (tournament as { groupsDistributedAt?: unknown }).groupsDistributedAt;
    const anyGroupAssignedMenu = teams.some((tm) => typeof tm.groupIndex === 'number' && tm.groupIndex >= 0);
    const groupsDistributionPendingMenu =
      !shouldUseDevMocks() && gdaMenu === null && !anyGroupAssignedMenu;
    const rosterFull = teams.length >= (tournament.maxTeams ?? 0);
    const allTeamsPlacedInGroups =
      rosterFull &&
      teams.length > 0 &&
      teams.every((tm) => typeof tm.groupIndex === 'number' && tm.groupIndex >= 0);
    const cannotStartForGroups = gdaMenu === null && !allTeamsPlacedInGroups;

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
          key: 'start',
          label: t('tournamentDetail.menuStartTournament'),
          icon: 'play-outline',
          color: Colors.success,
          disabled: startTournamentMutation.isPending || cannotStartForGroups,
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
      if (groupsDistributionPendingMenu && rosterFull) {
        list.push({
          key: 'distributeGroups',
          label: t('tournamentDetail.menuCreateGroups'),
          icon: 'grid-outline',
          color: Colors.violet,
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
      } else if (!groupsDistributionPendingMenu) {
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
  ]);

  // Everything below must be declared before any early `return` so hook order stays stable.
  const organizerIds = tournament?.organizerIds ?? [];
  const organizeOnlyUserIds = useMemo(() => {
    if (!tournament) return [];
    const only = new Set(tournament.organizerOnlyIds ?? []);
    return (tournament.organizerIds ?? []).filter((uid) => only.has(uid));
  }, [tournament]);
  const dateLabel = tournament?.date || tournament?.startDate;
  const tournamentConfigCardImageSource = useMemo(() => {
    const url = tournament?.coverImageUrl?.trim();
    if (url) return { uri: url };
    return DEFAULT_TOURNAMENT_CARD_BG;
  }, [tournament?.coverImageUrl]);
  const isCancelled = tournament?.status === 'cancelled';
  const isOrganizeOnlyOrganizer = !!(userId && (tournament?.organizerOnlyIds ?? []).includes(userId));

  const divisions = (((tournament as { divisions?: unknown } | undefined)?.divisions ?? []) as TournamentDivision[]).filter(Boolean);
  const availableDivisions: DivisionTab[] = (divisions.length ? divisions : ['mixed']) as DivisionTab[];
  const currentDivision: DivisionTab = availableDivisions.includes(activeDivision)
    ? activeDivision
    : availableDivisions[0]!;
  const { data: waitlistInfo } = useWaitlist(id, currentDivision);
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

  const allPlayerIds = teams.flatMap((t) => t.playerIds ?? []).filter(Boolean);
  const entryUserIds = entries.map((e) => e.userId);
  const waitlistUserIds = (waitlistInfo?.users ?? []).map((w) => w.userId).filter(Boolean);
  const combinedUserIds = [
    ...new Set([...allPlayerIds, ...entryUserIds, ...waitlistUserIds, ...(tournament?.organizerIds ?? [])]),
  ];
  const { data: users = [] } = useUsers(combinedUserIds);
  const userMap = Object.fromEntries(users.map((u) => [u._id, u]));

  const userHasTeam = teams.some(
    (t) => (t.playerIds ?? []).includes(userId ?? '') && String((t as { tournamentId?: unknown }).tournamentId ?? '') === String(id ?? '')
  );
  const onWaitlist = useMemo(
    () => !!(userId && (waitlistInfo?.users ?? []).some((w) => w.userId === userId)),
    [waitlistInfo?.users, userId]
  );
  /** On waiting list or already on a team (registered for the tournament flow). */
  const isRegistered = onWaitlist || userHasTeam;
  const isLoading = loadingTournament;
  const isError = errorTournament;

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

  /**
   * Until organizer runs "distribute into groups", show all teams in one list (no Grupo 1…N buckets).
   * Legacy docs omit the field (not pending). If any team already has a group index (e.g. admin roster), show real groups.
   */
  const groupsDistributionPending = useMemo(() => {
    if (shouldUseDevMocks()) return false;
    const gda = tournament?.groupsDistributedAt;
    if (gda !== null && gda !== undefined) return false;
    if (gda === undefined) return false;
    const anyAssigned = teams.some((tm) => typeof tm.groupIndex === 'number' && tm.groupIndex >= 0);
    return !anyAssigned;
  }, [tournament?.groupsDistributedAt, teams]);

  const divisionTeamsByGroup = useMemo(() => {
    if (groupsDistributionPending) {
      return filteredTeams.length ? [filteredTeams] : [];
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

  const filteredGroupsWithTeams = divisionTeamsByGroup.filter((g) => g.length > 0).length;
  const filteredWaitlist = useMemo(() => waitlistInfo?.users ?? [], [waitlistInfo?.users]);

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
      const oa = tieBreakOrdinal(id, a._id);
      const ob = tieBreakOrdinal(id, b._id);
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
    const fromClass = categoryTeamIdsFromClassification;
    const hasClass = (['Gold', 'Silver', 'Bronze'] as const).some((k) => (fromClass[k]?.length ?? 0) > 0);
    if (hasClass) return fromClass;
    return categoryTeamIdsFromSnapshot;
  }, [categoryTeamIdsFromClassification, categoryTeamIdsFromSnapshot]);

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
    if (selectedMatchesSubtab === 'live') return null;
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
      status?: 'scheduled' | 'in_progress' | 'completed';
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
        color: Colors.yellow,
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
    leaveWaitlist.isPending;

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
    const entriesSlim = entries.map((e) => ({ userId: e.userId, teamId: e.teamId ?? undefined }));
    const nextOnlyAfterDemote = (tournament.organizerOnlyIds ?? []).filter((x) => x !== targetUserId);
    const nextCoversAfterDemote = organizerOnlyCoversFromTournament(
      tournament.organizerOnlyCovers,
      nextOnlyAfterDemote
    );
    const missing = missingDivisionForOrganizers(divisions, nextOrgs, entriesSlim, teamsById, userGender, {
      organizerOnlyIds: nextOnlyAfterDemote,
      organizerOnlyCovers: nextCoversAfterDemote,
    });
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
    const entriesSlim = entries.map((e) => ({ userId: e.userId, teamId: e.teamId ?? undefined }));
    const missing = missingDivisionForOrganizers(divisions, nextOrgs, entriesSlim, teamsById, userGender, {
      organizerOnlyIds: nextOnly,
      organizerOnlyCovers: nextCovers,
    });
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
              { id, userId: entry.userId, mode: 'dissolveToWaitlist' },
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

    if (userHasTeam) {
      Alert.alert(t('common.error'), t('tournamentDetail.leaveTournamentStateError'));
      return;
    }

    if (onWaitlist) {
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

  const confirmRemoveTeam = (team: Team) => {
    if (!userId || !id) return;
    if (!requireOnline()) return;
    const pNames = (team.playerIds ?? [])
      .map((pid) => (pid ? getTournamentPlayerDisplayName(userMap[pid]) : ''))
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
    <>
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
            canManageTournament={false}
            showMeta={false}
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

          {/* Tournament configuration */}
          {tournament ? (
            <ImageBackground
              source={tournamentConfigCardImageSource}
              style={styles.tournamentConfigCard}
              imageStyle={styles.tournamentConfigCardImage}
              resizeMode="cover"
            >
              <View style={styles.tournamentConfigScrim} pointerEvents="none" />
              <View style={styles.tournamentConfigContent}>
                {canManageTournament ? (
                  <View style={styles.tournamentConfigMenuAbs}>
                    <TournamentOrganizerMenu
                      menuLabel={t('tournamentDetail.actionsMenu')}
                      items={organizerMenuItems}
                    />
                  </View>
                ) : null}
                <Text style={[tournamentNameInCardStyle, styles.tournamentConfigName]} numberOfLines={3}>
                  {tournament.name?.trim() || t('common.tournament')}
                </Text>
                <View style={styles.tournamentConfigRow}>
                  <Ionicons name="location-outline" size={18} color={TOURNAMENT_CONFIG_ON_CARD} />
                  <Text style={styles.tournamentConfigText}>
                    {formatTournamentLocationDisplay(tournament.location)}
                  </Text>
                </View>
                <View style={styles.tournamentConfigRow}>
                  <Ionicons name="calendar-outline" size={18} color={TOURNAMENT_CONFIG_ON_CARD} />
                  <Text style={styles.tournamentConfigText}>{dateLabel || '—'}</Text>
                </View>
                <View style={styles.tournamentConfigRow}>
                  <Ionicons name="trophy-outline" size={18} color={TOURNAMENT_CONFIG_ON_CARD} />
                  <Text style={styles.tournamentConfigText}>
                    {t('tournaments.pointsToWin')}: {tournament.pointsToWin ?? 21}
                  </Text>
                </View>
                <View style={styles.tournamentConfigRow}>
                  <Ionicons name="layers-outline" size={18} color={TOURNAMENT_CONFIG_ON_CARD} />
                  <Text style={styles.tournamentConfigText}>
                    {t('tournaments.setsPerMatch')}: {tournament.setsPerMatch ?? 1}
                  </Text>
                </View>
              </View>
            </ImageBackground>
          ) : null}

          {/* Join / leave tournament (waitlist join + leave waitlist or delete entry when on a team) */}
          {canEnroll && !isCancelled && !isOrganizeOnlyOrganizer ? (
            <>
              {onWaitlist && !userHasTeam ? (
                <Text style={styles.waitlistOnWaitlistHint}>{t('tournamentDetail.onWaitlistFormTeam')}</Text>
              ) : null}
              <View style={styles.waitlistActions}>
                {!isRegistered ? (
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
                ) : (
                  <Button
                    title={t('tournamentDetail.leaveTournament')}
                    variant="outline"
                    onPress={confirmLeave}
                    disabled={leaveWaitlist.isPending || deleteEntry.isPending}
                    size="sm"
                    fullWidth
                  />
                )}
              </View>
            </>
          ) : null}

          {canManageTournament && id ? (
            <View style={styles.organizerTournamentActions}>
              <Button
                title={t('tournamentDetail.editTournament')}
                variant="primary"
                onPress={() => router.push(`/admin/tournament/${id}` as never)}
                size="sm"
                fullWidth
                disabled={isOffline}
              />
            </View>
          ) : null}

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
              groups: `${
                groupsDistributionPending ? `0/${groupsPerDivisionCap}` : `${filteredGroupsWithTeams}/${groupsPerDivisionCap}`
              }`,
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
            hasJoined={isRegistered}
            canManageTournament={canManageTournament}
            mutationBusy={mutationBusy}
            onOpenProfile={(uid) => router.push(`/profile/${uid}` as never)}
            onPromoteOrganizer={promoteOrganizer}
            onDemoteOrganizer={demoteOrganizer}
            onDemoteOrganizeOnly={demoteOrganizeOnlyOrganizer}
            organizeOnlyUserIds={organizeOnlyUserIds}
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
            canCreateTeam={!canManageTournament && !userHasTeam && onWaitlist && canEnroll && !!id}
            onCreateTeam={() => router.push(`/tournament/${id}/team/create?division=${currentDivision}`)}
            organizerActions={
              canManageTournament && id ? (
                <View style={styles.teamsTabCreateRow}>
                  <Button
                    title={t('tournamentDetail.createTeamFromEntries')}
                    variant="outline"
                    onPress={() => router.push(`/tournament/${id}/team/create-organizer?division=${currentDivision}`)}
                    size="sm"
                    fullWidth
                  />
                </View>
              ) : null
            }
            loadingTeams={loadingTeams}
            filteredTeams={teamsSortedForTeamsTab}
            renderTeam={(team) => {
              const row = teamClassificationLookup.get(team._id);
              const cat = classificationBundle.teamCategory.get(team._id) ?? null;
              return (
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
                  classificationSummary={{
                    wins: row?.wins ?? 0,
                    points: row?.points ?? 0,
                    category: cat,
                    classified: classificationBundle.teamCategory.has(team._id),
                    showOutcomeIcons: showQualificationOutcomeOnTeamsTab,
                  }}
                />
              );
            }}
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
            groupsDistributionPending={groupsDistributionPending}
            canDistributeGroups={
              !!canManageTournament &&
              !shouldUseDevMocks() &&
              !!id &&
              groupsDistributionPending &&
              teams.length >= (tournament?.maxTeams ?? 0)
            }
            onDistributeGroups={() => {
              if (!id) return;
              randomizeGroupsMutation.mutate(
                { id },
                { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
              );
            }}
            distributePending={randomizeGroupsMutation.isPending}
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
            canReorganizeGroups={
              canManageTournament && !tournamentStarted && !shouldUseDevMocks() && !!id && !groupsDistributionPending
            }
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
            canManageTournament={canManageTournament}
            mutationBusy={mutationBusy || removeTournamentPlayer.isPending}
            onRemoveWaitlistPlayer={confirmRemoveWaitlistPlayer}
            viewerUserId={userId}
            viewerOnWaitlist={onWaitlist}
            onInvitePartner={
              onWaitlist && id
                ? (toUserId) => {
                    if (!requireOnline()) return;
                    invitePartnerFromWaitlist.mutate(
                      { tournamentId: id, division: currentDivision, toUserId },
                      { onError: (err: unknown) => alertApiError(t, err, 'tournamentDetail.organizerActionFailed') }
                    );
                  }
                : undefined
            }
            invitePending={invitePartnerFromWaitlist.isPending}
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
              liveMatches={liveMatchesRows}
              classificationData={filteredClassificationData}
              categoryMatchesByCategory={categoryMatchesByCategory}
              teamById={teamById}
              userMap={userMap}
              tournamentId={id ?? ''}
              opponentTbdLabel={opponentTbdLabel}
              categoryTeamIdsByCategory={categoryTeamIdsByCategory}
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
          </View>
        ) : null}
      </View>

          <View style={styles.actions}>
        {!canEnroll && (
          <Text style={styles.genderRequired}>{t('tournamentDetail.genderRequired')}</Text>
        )}
        {userHasTeam && (
          <Text style={styles.joinedBadge}>{t('tournamentDetail.alreadyInTeam')}</Text>
        )}
          </View>
        </>
      )}
    />
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
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40 },
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
    backgroundColor: Colors.yellow,
    borderRadius: 999,
  },
  progressLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', textAlign: 'center' },
  waitlistActions: { marginBottom: 16 },
  organizerTournamentActions: {
    marginBottom: 16,
    marginTop: 4,
  },
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
  /** Knockout round titles in fixture list — same size as bracket diagram column labels (smaller than group). */
  bracketRoundHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.yellow,
    marginBottom: 8,
    marginTop: 4,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  emptyGroup: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 8 },
  teamCard: {
    position: 'relative',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  teamCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    marginBottom: 8,
  },
  teamCardNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  teamCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: 6,
  },
  teamCardBottomRowWithDelete: {
    paddingRight: 42,
    paddingBottom: 8,
  },
  teamCardPlayersWrap: {
    flex: 1,
    minWidth: 0,
  },
  teamCardDeleteAbsolute: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    zIndex: 2,
  },
  teamName: { fontSize: 14, fontWeight: '700', color: Colors.text, lineHeight: 18 },
  teamCardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    flexGrow: 0,
  },
  teamCardIconsCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    gap: 5,
  },
  teamCardPlayersRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
  },
  teamCardPtsLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0,
    textTransform: 'uppercase',
    lineHeight: 20,
  },
  teamCardPlayerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '48%',
    minWidth: 0,
    paddingVertical: 2,
  },
  teamCardSlotCell: {
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '48%',
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 28,
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 6,
  },
  teamCardStatNumber: { fontSize: 13, fontWeight: '700', color: Colors.text, lineHeight: 20 },
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
  waitlistExplainer: { fontSize: 13, color: Colors.textMuted, lineHeight: 18, marginBottom: 12 },
  waitlistOnWaitlistHint: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: 8 },
  tournamentConfigCard: {
    position: 'relative',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    overflow: 'hidden',
  },
  tournamentConfigCardImage: {
    borderRadius: 12,
  },
  /** Same scrim as `TournamentListRow` `cardBgScrim`. */
  tournamentConfigScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
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
    color: TOURNAMENT_CONFIG_ON_CARD,
    lineHeight: 20,
    fontStyle: 'italic',
    fontWeight: '700',
    textTransform: 'none',
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
