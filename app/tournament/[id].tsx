import React, { useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { View, Text, StyleSheet, ScrollView, Share, Alert, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import type { Gender, User, TournamentDivision } from '@/types';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TournamentOrganizerMenu, type OrganizerMenuItem } from '@/components/tournament/TournamentOrganizerMenu';
import { config, shouldUseDevMocks } from '@/lib/config';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  useTournament,
  useDeleteTournament,
  useUpdateTournament,
  useRebalanceTournamentGroups,
} from '@/lib/hooks/useTournaments';
import { useTeams, useDeleteTeam } from '@/lib/hooks/useTeams';
import { useEntries, useCreateEntry, useDeleteEntry } from '@/lib/hooks/useEntries';
import { useWaitlist, useJoinWaitlist, useLeaveWaitlist } from '@/lib/hooks/useWaitlist';
import { useUsers } from '@/lib/hooks/useUsers';
import { useUserStore } from '@/store/useUserStore';
import { useLanguageStore } from '@/store/useLanguageStore';
import i18n from '@/lib/i18n';
import { getPlayerListName, getPlayerSortKey } from '@/lib/utils/userDisplay';
import { formatTournamentDate } from '@/lib/utils/dateFormat';
import type { Team, Entry } from '@/types';
import {
  countGroupsWithTeams,
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
            size={18}
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
              <Text style={[styles.playerName, isYou && styles.playerNameHighlight]}>{playerName || t('common.player')}</Text>
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

const headerTitleStyle = { color: '#e5e5e5', fontSize: 17, fontWeight: '600' } as const;

type TournamentTab = 'players' | 'teams' | 'groups' | 'waitinglist' | 'fixture';
type DivisionTab = TournamentDivision;
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
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TournamentTab>('players');
  const [activeDivision, setActiveDivision] = useState<DivisionTab>('mixed');
  const [activeMatchesSubtab, setActiveMatchesSubtab] = useState<MatchSubTab>('classification');
  const user = useUserStore((s) => s.user);
  const userId = user?._id ?? null;
  const storedLanguage = useLanguageStore((s) => s.language);
  const canEnroll = hasValidGender(user?.gender);

  const { data: tournament, isLoading: loadingTournament, isError: errorTournament, error: tournamentError } = useTournament(id);
  const { data: teams = [], isLoading: loadingTeams } = useTeams(id ? { tournamentId: id } : undefined);
  const { data: entries = [], isLoading: loadingEntries } = useEntries(id ? { tournamentId: id } : undefined);
  const { data: waitlistInfo } = useWaitlist(id);
  const joinWaitlist = useJoinWaitlist();
  const leaveWaitlist = useLeaveWaitlist();

  const createEntry = useCreateEntry();
  const deleteTournament = useDeleteTournament();
  const updateTournament = useUpdateTournament();
  const deleteEntry = useDeleteEntry();
  const deleteTeam = useDeleteTeam();
  const rebalanceGroupsMutation = useRebalanceTournamentGroups();

  const allPlayerIds = teams.flatMap((t) => t.playerIds ?? []).filter(Boolean);
  const entryUserIds = entries.map((e) => e.userId);
  const waitlistUserIds = (waitlistInfo?.users ?? []).map((w) => w.userId).filter(Boolean);
  const combinedUserIds = [...new Set([...allPlayerIds, ...entryUserIds, ...waitlistUserIds])];
  const { data: users = [] } = useUsers(combinedUserIds);
  const userMap = Object.fromEntries(users.map((u) => [u._id, u]));

  const hasJoined = entries.some((e) => e.userId === userId);
  const userHasTeam = teams.some((t) => t.playerIds?.includes(userId ?? ''));
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

  const teamsByGroup = useMemo(() => {
    if (!tournament) return [[], [], [], []] as Team[][];
    const gc = groupMeta.groupCount;
    const buckets: Team[][] = Array.from({ length: gc }, () => []);
    for (const team of teams) {
      const gi = Math.min(gc - 1, Math.max(0, teamGroupIndex(team)));
      buckets[gi]!.push(team);
    }
    return buckets;
  }, [tournament, teams, groupMeta.groupCount]);

  const offerGroupRebalance = useMemo(
    () => shouldOfferGroupRebalance(teams, groupMeta.groupCount, groupMeta.teamsPerGroup),
    [teams, groupMeta.groupCount, groupMeta.teamsPerGroup]
  );

  const groupsWithTeams = useMemo(
    () => countGroupsWithTeams(teams, groupMeta.groupCount),
    [teams, groupMeta.groupCount],
  );

  // Must be declared before any early `return` so hook order stays stable.
  const handleDelete = () => {
    if (!userId || !id || !tournament) return;
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
  };

  const handleShareInvite = () => {
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
  };

  const organizerMenuItems = useMemo((): OrganizerMenuItem[] => {
    const list: OrganizerMenuItem[] = [];

    if (!tournament) return list;

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

    if (tournament.inviteLink) {
      list.push({
        key: 'share',
        label: t('tournamentDetail.menuShare'),
        icon: 'share-outline',
        color: Colors.yellow,
        onPress: handleShareInvite,
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
  }, [id, tournament, t, router, handleShareInvite, handleDelete, deleteTournament.isPending]);

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

  const isOrganizer = tournament.organizerIds?.includes(userId ?? '');
  const isAdmin = user?.role === 'admin';
  /** Organizers and global admins can manage roster, teams, and invites from this screen. */
  const canManageTournament = isOrganizer || isAdmin;

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
    Alert.alert(
      t('tournamentDetail.removeTeam'),
      t('tournamentDetail.removeTeamConfirm', { name: team.name }),
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

  const organizerIds = tournament.organizerIds ?? [];
  const dateLabel = tournament.date || tournament.startDate;
  const isCancelled = tournament.status === 'cancelled';
  const playerCap = maxPlayerSlotsForTournament(tournament.maxTeams ?? 16);
  const isFull = entries.length >= playerCap;
  const waitlistPosition = waitlistInfo?.position ?? null;
  const waitlistCountForStats = waitlistInfo?.count ?? tournament.waitlistCount ?? 0;
  const divisions = ((tournament.divisions ?? []) as TournamentDivision[]).filter(Boolean);
  const availableDivisions: DivisionTab[] = (divisions.length ? divisions : ['mixed']) as DivisionTab[];
  const currentDivision: DivisionTab = availableDivisions.includes(activeDivision)
    ? activeDivision
    : availableDivisions[0]!;
  const divisionCount = Math.max(1, availableDivisions.length);
  const teamsPerDivisionCap = Math.max(2, Math.floor((tournament.maxTeams ?? 16) / divisionCount));
  const playersPerDivisionCap = maxPlayerSlotsForTournament(teamsPerDivisionCap);
  const groupsPerDivisionCap = Math.max(1, Math.floor(groupMeta.groupCount / divisionCount));

  const teamDivisionById: Record<string, DivisionTab> = (() => {
    const map: Record<string, DivisionTab> = {};
    for (const team of teams) {
      const p1 = userMap[team.playerIds?.[0] ?? ''];
      const p2 = userMap[team.playerIds?.[1] ?? ''];
      const g1 = p1?.gender;
      const g2 = p2?.gender;
      const division: DivisionTab =
        g1 === 'male' && g2 === 'male'
          ? 'men'
          : g1 === 'female' && g2 === 'female'
            ? 'women'
            : g1 === 'male' || g2 === 'male'
              ? 'mixed'
              : g1 === 'female' || g2 === 'female'
                ? 'mixed'
                : 'mixed';
      map[team._id] = division;
    }
    return map;
  })();

  const filteredTeams = teams.filter((team) => teamDivisionById[team._id] === currentDivision);

  const filteredEntries = entries.filter((entry) => {
    if (entry.teamId) {
      return teamDivisionById[entry.teamId] === currentDivision;
    }
    const g = userMap[entry.userId]?.gender;
    if (currentDivision === 'men') return g === 'male';
    if (currentDivision === 'women') return g === 'female';
    return false;
  });

  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const na = getPlayerSortKey(userMap[a.userId]);
    const nb = getPlayerSortKey(userMap[b.userId]);
    return na.localeCompare(nb);
  });

  const divisionTeamsByGroup = (() => {
    const existingGroups = [...new Set(filteredTeams.map((tm) => teamGroupIndex(tm)))].sort((a, b) => a - b);
    const fallbackGroups = Array.from({ length: groupsPerDivisionCap }, (_, i) => i);
    const sourceGroups = existingGroups.length > 0 ? existingGroups : fallbackGroups;
    const buckets: Team[][] = sourceGroups.map(() => []);
    const idxByGroup = new Map<number, number>(sourceGroups.map((g, idx) => [g, idx]));
    for (const team of filteredTeams) {
      const gi = teamGroupIndex(team);
      const idx = idxByGroup.get(gi);
      if (idx != null) buckets[idx]!.push(team);
    }
    return buckets;
  })();

  const filteredGroupsWithTeams = divisionTeamsByGroup.filter((g) => g.length > 0).length;
  const filteredWaitlist = (waitlistInfo?.users ?? []).filter((row) => {
    const g = userMap[row.userId]?.gender;
    if (currentDivision === 'men') return g === 'male' || g == null;
    if (currentDivision === 'women') return g === 'female' || g == null;
    return true;
  });
  const matchCategoryTabs = (() => {
    const cats = (tournament.categories ?? []).filter((c): c is MatchCategoryTab =>
      c === 'Gold' || c === 'Silver' || c === 'Bronze'
    );
    return ['classification', ...cats] as MatchSubTab[];
  })();
  const selectedMatchesSubtab = matchCategoryTabs.includes(activeMatchesSubtab)
    ? activeMatchesSubtab
    : matchCategoryTabs[0]!;
  const classificationData = (() => {
    const categoryCount = Math.max(1, matchCategoryTabs.length - 1);
    const pointsToWin = Math.max(1, Math.min(99, Number(tournament.pointsToWin ?? 21) || 21));
    const setsPerMatch = Math.max(1, Math.min(7, Number(tournament.setsPerMatch ?? 1) || 1));
    const setsToWin = Math.floor(setsPerMatch / 2) + 1;
    const seeded = divisionTeamsByGroup.map((groupTeams) => {
      const matches: {
        id: string;
        teamA: Team;
        teamB: Team;
        setsWonA: number;
        setsWonB: number;
        scoreA: number;
        scoreB: number;
        winnerId: string;
      }[] = [];
      const stats: Record<string, { team: Team; wins: number; points: number }> = {};
      for (const team of groupTeams) {
        stats[team._id] = { team, wins: 0, points: 0 };
      }
      for (let i = 0; i < groupTeams.length; i++) {
        for (let j = i + 1; j < groupTeams.length; j++) {
          const teamA = groupTeams[i]!;
          const teamB = groupTeams[j]!;
          const seedA = teamA._id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
          const seedB = teamB._id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
          let setsWonA = 0;
          let setsWonB = 0;
          let scoreA = 0;
          let scoreB = 0;
          for (let setIdx = 0; setIdx < setsPerMatch; setIdx++) {
            if (setsWonA >= setsToWin || setsWonB >= setsToWin) break;
            const baseA = (seedA + seedB + i + j + setIdx * 3) % 10;
            const baseB = (seedA * 3 + seedB + i + j + setIdx * 5) % 10;
            let setA = Math.max(0, pointsToWin - 3 + baseA);
            let setB = Math.max(0, pointsToWin - 3 + baseB);
            if (setA === setB) setA += 1;
            if (setA > setB) {
              setsWonA += 1;
            } else {
              setsWonB += 1;
            }
            scoreA += setA;
            scoreB += setB;
          }
          const winnerId = setsWonA > setsWonB ? teamA._id : teamB._id;
          stats[teamA._id]!.points += scoreA;
          stats[teamB._id]!.points += scoreB;
          stats[winnerId]!.wins += 1;
          matches.push({
            id: `${teamA._id}-${teamB._id}`,
            teamA,
            teamB,
            setsWonA,
            setsWonB,
            scoreA,
            scoreB,
            winnerId,
          });
        }
      }
      const standings = Object.values(stats).sort(
        (a, b) =>
          b.wins - a.wins ||
          b.points - a.points ||
          a.team.name.localeCompare(b.team.name)
      );
      const categories: Partial<Record<MatchCategoryTab, typeof standings>> = {};
      if (categoryCount > 0) {
        const orderedCats = matchCategoryTabs.filter((x): x is MatchCategoryTab => x !== 'classification');
        let cursor = 0;
        for (let ci = 0; ci < orderedCats.length; ci++) {
          const remaining = standings.length - cursor;
          const slotsLeft = orderedCats.length - ci;
          const size = Math.ceil(remaining / slotsLeft);
          categories[orderedCats[ci]!] = standings.slice(cursor, cursor + size);
          cursor += size;
        }
      }
      return { matches, standings, categories };
    });
    return seeded;
  })();

  const mutationBusy =
    deleteEntry.isPending ||
    updateTournament.isPending ||
    deleteTeam.isPending ||
    deleteTournament.isPending ||
    rebalanceGroupsMutation.isPending;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {isCancelled ? (
          <View style={styles.cancelledBanner} accessibilityRole="alert">
            <Ionicons name="close-circle-outline" size={22} color={Colors.error} />
            <Text style={styles.cancelledBannerText}>{t('tournamentDetail.cancelledBanner')}</Text>
          </View>
        ) : null}
        {(tournament.visibility ?? 'public') === 'private' ? (
          <View style={styles.privateBanner} accessibilityRole="text">
            <Ionicons name="lock-closed-outline" size={20} color={Colors.violet} />
            <Text style={styles.privateBannerText}>{t('tournamentDetail.privateVisibilityBanner')}</Text>
          </View>
        ) : null}
        <View style={styles.headerTopRow}>
          <View style={styles.dateLocationLeft}>
            <View style={styles.dateLocationRow}>
              <Text style={styles.location}>{tournament.location?.trim() || '—'}</Text>
              <Text style={styles.dateLocationSep}>·</Text>
              <Text style={styles.date}>{formatTournamentDate(dateLabel) || '—'}</Text>
            </View>
            <Text style={styles.matchRulesText}>
              {t('tournaments.pointsToWin')}: {tournament.pointsToWin ?? 21} · {t('tournaments.setsPerMatch')}:{' '}
              {tournament.setsPerMatch ?? 1}
            </Text>
          </View>
          {canManageTournament ? (
            <View style={styles.headerTopActions}>
              <TournamentOrganizerMenu menuLabel={t('tournamentDetail.actionsMenu')} items={organizerMenuItems} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.tabsSection}>
        <View style={styles.divisionTabBar} accessibilityRole="tablist">
          {availableDivisions.map((division) => {
            const selected = currentDivision === division;
            const label =
              division === 'men'
                ? t('tournaments.divisionMen')
                : division === 'women'
                  ? t('tournaments.divisionWomen')
                  : t('tournaments.divisionMixed');
            return (
              <Pressable
                key={division}
                style={[styles.divisionTab, selected && styles.divisionTabSelected]}
                onPress={() => setActiveDivision(division)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.divisionTabLabel, selected && styles.divisionTabLabelSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.tabBar} accessibilityRole="tablist">
          {TAB_CONFIG.map(({ id: tabId, icon, labelKey }) => {
            const selected = activeTab === tabId;
            const tabValue =
              tabId === 'players'
                ? `${filteredEntries.length}/${playersPerDivisionCap}`
                : tabId === 'teams'
                  ? `${filteredTeams.length}/${teamsPerDivisionCap}`
                  : tabId === 'groups'
                  ? `${filteredGroupsWithTeams}/${groupsPerDivisionCap}`
                    : tabId === 'waitinglist'
                      ? `${Math.floor((tournament.waitlistCount ?? waitlistCountForStats) / divisionCount)}`
                      : '';

            const isWaitingListTab = tabId === 'waitinglist';
            const tabValueColor = selected
              ? isWaitingListTab
                ? Colors.violet
                : Colors.tabIconSelected
              : Colors.textMuted;
            const tabIconColor = selected
              ? isWaitingListTab
                ? Colors.violet
                : Colors.tabIconSelected
              : Colors.tabIconDefault;
            const tabLabelColorOverride = selected && isWaitingListTab ? Colors.violet : undefined;

            return (
              <Pressable
                key={tabId}
                style={[styles.tabItem, selected && styles.tabItemSelected]}
                onPress={() => setActiveTab(tabId)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
              {isWaitingListTab ? (
                  <Text style={[styles.waitingListMark, { color: tabIconColor }]}>WL</Text>
              ) : tabId === 'fixture' ? (
                <MaterialCommunityIcons
                  name="volleyball"
                  size={22}
                  color={tabIconColor}
                />
                ) : (
                  <Ionicons
                  name={icon as keyof typeof Ionicons.glyphMap}
                    size={22}
                    color={tabIconColor}
                  />
                )}
                {tabValue ? (
                  <Text style={[styles.tabValue, { color: tabValueColor }]}>{tabValue}</Text>
                ) : null}
                <Text
                  style={[
                    styles.tabLabel,
                    selected && !tabLabelColorOverride && styles.tabLabelSelected,
                    tabLabelColorOverride ? { color: tabLabelColorOverride } : undefined,
                  ]}
                  numberOfLines={1}
                >
                  {t(labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.tabPanel}>
        {activeTab === 'players' ? (
          sortedEntries.length === 0 ? (
            <Text style={styles.emptyText}>{t('tournamentDetail.noPlayersYet')}</Text>
          ) : (
            sortedEntries.map((entry) => {
              const u = userMap[entry.userId];
              const playerName = getPlayerListName(u) || t('common.player');
              const isOrg = organizerIds.includes(entry.userId);
              const isSelf = entry.userId === userId;
              const showTopTrash =
                (canManageTournament && !isSelf) || (isSelf && hasJoined);
              /** Toggle organizer: others (promote/demote), or self only when already organizer (demote). */
              const showOrganizerToggleIcon =
                canManageTournament && (!isSelf || (isSelf && isOrg));

              return (
                <View key={entry._id} style={[styles.playerRow, isOrg && styles.playerRowOrganizer]}>
                  <View style={styles.playerRowTop}>
                    <Pressable
                      style={styles.playerRowMain}
                      onPress={() => router.push(`/profile/${entry.userId}` as never)}
                      accessibilityRole="button"
                      accessibilityLabel={t('profile.viewProfile')}
                    >
                      <Avatar
                        firstName={u?.firstName ?? ''}
                        lastName={u?.lastName ?? ''}
                        gender={u?.gender === 'male' || u?.gender === 'female' ? u.gender : undefined}
                        size="sm"
                      />
                      <View style={styles.playerRowText}>
                        <Text style={styles.playerRowName}>{playerName}</Text>
                        {isOrg ? (
                          <Text style={styles.orgBadge}>{t('tournamentDetail.organizerBadge')}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                    <View style={styles.playerRowRight}>
                      {showOrganizerToggleIcon ? (
                        <IconButton
                          icon="person-circle-outline"
                          onPress={() =>
                            isOrg
                              ? demoteOrganizer(entry.userId, playerName)
                              : promoteOrganizer(entry.userId, playerName)
                          }
                          disabled={mutationBusy}
                          accessibilityLabel={
                            isOrg
                              ? t('tournamentDetail.removeOrganizer')
                              : t('tournamentDetail.makeOrganizer')
                          }
                          color={isOrg ? Colors.violet : Colors.textMuted}
                          compact
                        />
                      ) : null}
                      {showTopTrash ? (
                        <IconButton
                          icon="trash-outline"
                          onPress={() =>
                            isSelf && hasJoined ? confirmLeave() : confirmRemovePlayer(entry, playerName)
                          }
                          disabled={mutationBusy}
                          accessibilityLabel={
                            isSelf && hasJoined
                              ? t('tournamentDetail.leaveTournament')
                              : t('tournamentDetail.removePlayer')
                          }
                          color="#f87171"
                          compact
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })
          )
        ) : null}

        {activeTab === 'teams' ? (
          <>
            {!userHasTeam && hasJoined && canEnroll && id ? (
              <View style={styles.teamsTabCreateRow}>
                <Button
                  title={t('tournamentDetail.createTeam')}
                  variant="secondary"
                  onPress={() => router.push(`/tournament/${id}/team/create`)}
                  fullWidth
                />
              </View>
            ) : null}
            {loadingTeams ? (
              <View style={styles.teamCard}>
                <Skeleton height={18} width="40%" style={{ marginBottom: 12 }} />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Skeleton height={36} width={80} borderRadius={18} />
                  <Skeleton height={36} width={80} borderRadius={18} />
                </View>
              </View>
            ) : filteredTeams.length === 0 ? (
              <Text style={styles.emptyText}>{t('tournamentDetail.noTeamsYet')}</Text>
            ) : (
              filteredTeams.map((team) => (
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
              ))
            )}
          </>
        ) : null}

        {activeTab === 'groups' ? (
          loadingTeams ? (
            <View style={styles.teamCard}>
              <Skeleton height={18} width="40%" style={{ marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Skeleton height={36} width={80} borderRadius={18} />
                <Skeleton height={36} width={80} borderRadius={18} />
              </View>
            </View>
          ) : filteredTeams.length === 0 ? (
            <Text style={styles.emptyText}>{t('tournamentDetail.noTeamsYet')}</Text>
          ) : (
            <>
              {canManageTournament && !shouldUseDevMocks() && offerGroupRebalance && userId ? (
                <View style={styles.rebalanceBanner}>
                  <Text style={styles.rebalanceHint}>
                    {t('tournamentDetail.rebalanceGroupsHint', { max: groupMeta.teamsPerGroup })}
                  </Text>
                  <Button
                    title={t('tournamentDetail.rebalanceGroups')}
                    variant="secondary"
                    onPress={() => {
                      if (!id || !userId) return;
                      Alert.alert(
                        t('tournamentDetail.rebalanceGroups'),
                        t('tournamentDetail.rebalanceGroupsConfirm'),
                        [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('common.ok'),
                            onPress: () =>
                              rebalanceGroupsMutation.mutate(
                                { id },
                                {
                                  onError: (err: unknown) =>
                                    alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
                                }
                              ),
                          },
                        ]
                      );
                    }}
                    disabled={rebalanceGroupsMutation.isPending}
                    fullWidth
                  />
                </View>
              ) : null}
              {divisionTeamsByGroup.map((groupTeams, gi) => (
                <View key={`g-${gi}`} style={styles.groupBlock}>
                  <Text style={styles.groupHeading}>{t('tournamentDetail.groupTitle', { n: gi + 1 })}</Text>
                  {groupTeams.length === 0 ? (
                    <Text style={styles.emptyGroup}>{t('tournamentDetail.noTeamsInGroup')}</Text>
                  ) : null}
                  {groupTeams.map((team) => (
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
                  ))}
                </View>
              ))}
            </>
          )
        ) : null}

        {activeTab === 'waitinglist' ? (
          filteredWaitlist.length === 0 ? (
            <Text style={styles.emptyText}>{t('tournamentDetail.waitinglistPlaceholder')}</Text>
          ) : (
            filteredWaitlist.map((row, idx) => {
              const u = userMap[row.userId];
              const playerName = getPlayerListName(u) || t('common.player');
              return (
                <View key={`${row.userId}-${idx}`} style={styles.playerRow}>
                  <Pressable
                    style={styles.playerRowMain}
                    onPress={() => router.push(`/profile/${row.userId}` as never)}
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.viewProfile')}
                  >
                    <Avatar
                      firstName={u?.firstName ?? ''}
                      lastName={u?.lastName ?? ''}
                      gender={u?.gender === 'male' || u?.gender === 'female' ? u.gender : undefined}
                      size="sm"
                    />
                    <View style={styles.playerRowText}>
                      <Text style={styles.playerRowName}>{playerName}</Text>
                      <Text style={styles.waitlistRankText}>{t('tournaments.waitlistYouAre', { n: idx + 1 })}</Text>
                    </View>
                  </Pressable>
                </View>
              );
            })
          )
        ) : null}

        {activeTab === 'fixture' ? (
          <View>
            <View style={styles.matchesSubtabBar}>
              {matchCategoryTabs.map((tab) => {
                const selected = selectedMatchesSubtab === tab;
                const label =
                  tab === 'classification'
                    ? t('tournamentDetail.matchesClassification')
                    : tab === 'Gold'
                      ? t('tournaments.categoryGold')
                      : tab === 'Silver'
                        ? t('tournaments.categorySilver')
                        : t('tournaments.categoryBronze');
                return (
                  <Pressable
                    key={tab}
                    style={[styles.matchesSubtabItem, selected && styles.matchesSubtabItemSelected]}
                    onPress={() => setActiveMatchesSubtab(tab)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.matchesSubtabLabel, selected && styles.matchesSubtabLabelSelected]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {selectedMatchesSubtab === 'classification' ? (
              classificationData.length === 0 ? (
                <Text style={styles.emptyText}>{t('tournamentDetail.fixturePlaceholder')}</Text>
              ) : (
                classificationData.map((groupData, gi) => (
                  <View key={`class-group-${gi}`} style={styles.groupBlock}>
                    <Text style={styles.groupHeading}>{t('tournamentDetail.groupTitle', { n: gi + 1 })}</Text>
                    {groupData.matches.map((m) => (
                      <View key={m.id} style={styles.matchRow}>
                        <Text style={[styles.matchTeamName, m.winnerId === m.teamA._id && styles.matchWinner]}>
                          {m.teamA.name}
                        </Text>
                        <Text style={styles.matchScore}>{m.setsWonA} - {m.setsWonB}</Text>
                        <Text style={[styles.matchTeamName, m.winnerId === m.teamB._id && styles.matchWinner]}>
                          {m.teamB.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))
              )
            ) : (
              classificationData.map((groupData, gi) => {
                const categoryRows = groupData.categories[selectedMatchesSubtab as MatchCategoryTab] ?? [];
                return (
                  <View key={`cat-group-${selectedMatchesSubtab}-${gi}`} style={styles.groupBlock}>
                    <Text style={styles.groupHeading}>{t('tournamentDetail.groupTitle', { n: gi + 1 })}</Text>
                    {categoryRows.length === 0 ? (
                      <Text style={styles.emptyGroup}>{t('tournamentDetail.noTeamsInGroup')}</Text>
                    ) : (
                      categoryRows.map((row, idx) => (
                        <View key={`${row.team._id}-${idx}`} style={styles.matchStandingRow}>
                          <Text style={styles.matchStandingRank}>#{idx + 1}</Text>
                          <Text style={styles.matchStandingTeam}>{row.team.name}</Text>
                          <Text style={styles.matchStandingMeta}>{row.wins}W · {row.points}pts</Text>
                        </View>
                      ))
                    )}
                  </View>
                );
              })
            )}
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
        {!hasJoined && canEnroll && !isCancelled && isFull && waitlistPosition == null && (
          <Button
            title={t('tournaments.waitlistJoin')}
            variant="secondary"
            onPress={() => {
              if (!userId || !id) return;
              joinWaitlist.mutate(
                { tournamentId: id, userId },
                {
                  onError: (err: unknown) =>
                    alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
                }
              );
            }}
            disabled={joinWaitlist.isPending}
            fullWidth
          />
        )}
        {!hasJoined && canEnroll && !isCancelled && isFull && waitlistPosition != null && (
          <View style={styles.waitlistRow}>
            <Text style={styles.waitlistPositionText}>
              {t('tournaments.waitlistYouAre', { n: waitlistPosition })}
            </Text>
            <Button
              title={t('tournaments.waitlistLeave')}
              variant="outline"
              onPress={() => {
                if (!userId || !id) return;
                leaveWaitlist.mutate(
                  { tournamentId: id },
                  {
                    onError: (err: unknown) =>
                      alertApiError(t, err, 'tournamentDetail.organizerActionFailed'),
                  }
                );
              }}
              disabled={leaveWaitlist.isPending}
              fullWidth
            />
          </View>
        )}
        {userHasTeam && (
          <Text style={styles.joinedBadge}>{t('tournamentDetail.alreadyInTeam')}</Text>
        )}
      </View>
    </ScrollView>
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
  tabsSection: { marginBottom: 16, overflow: 'visible' },
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
  teamsTabCreateRow: { marginBottom: 12 },
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
    marginBottom: 12,
  },
  matchesSubtabItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  matchesSubtabItemSelected: {
    backgroundColor: Colors.violetMuted,
    borderColor: Colors.violetOutline,
  },
  matchesSubtabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
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
    color: Colors.violet,
    marginBottom: 8,
    marginTop: 4,
  },
  emptyGroup: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 8 },
  teamCard: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingVertical: 5,
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
  teamName: { fontSize: 14, fontWeight: '600', color: Colors.text, lineHeight: 18 },
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
    padding: 12,
    marginBottom: 10,
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
  playerRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  playerRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  playerRowText: { flex: 1, minWidth: 0 },
  playerRowName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  orgBadge: {
    fontSize: 11,
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
