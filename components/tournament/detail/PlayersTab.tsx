import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { getTournamentPlayerDisplayName } from '@/lib/utils/userDisplay';
import { tournamentGuestDisplayName } from '@/lib/utils/resolveParticipant';
import type { Entry, User, TournamentDivision, TournamentGuestPlayer } from '@/types';
import Colors from '@/constants/Colors';
import { useTheme } from '@/lib/theme/useTheme';

type PlayerRow =
  | { kind: 'section'; sectionId: 'withTeam' | 'noTeamYet' }
  | { kind: 'roster'; entry: Entry }
  | { kind: 'waitlist'; userId: string }
  | { kind: 'guest'; guest: TournamentGuestPlayer };

function comparePlayerName(userMap: Record<string, User>, userIdA: string, userIdB: string): number {
  const na = getTournamentPlayerDisplayName(userMap[userIdA]).toLowerCase();
  const nb = getTournamentPlayerDisplayName(userMap[userIdB]).toLowerCase();
  return na.localeCompare(nb, undefined, { sensitivity: 'base' });
}

function entryDisplayName(
  entry: Entry,
  userMap: Record<string, User>,
  guestMap: Record<string, TournamentGuestPlayer | undefined>
): string {
  if (entry.userId) return getTournamentPlayerDisplayName(userMap[entry.userId]);
  if (entry.guestPlayerId) return tournamentGuestDisplayName(guestMap[entry.guestPlayerId]);
  return '';
}

function compareEntry(
  a: Entry,
  b: Entry,
  userMap: Record<string, User>,
  guestMap: Record<string, TournamentGuestPlayer | undefined>
): number {
  return entryDisplayName(a, userMap, guestMap)
    .toLowerCase()
    .localeCompare(entryDisplayName(b, userMap, guestMap).toLowerCase(), undefined, { sensitivity: 'base' });
}

/** Same visual language as completed matches in `FixtureTab` (mint-green pill + check). */
function MatchStyleStatusPill({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(34,197,94,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(34,197,94,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

export function PlayersTab({
  t,
  sortedEntries,
  guestPlayers = [],
  guestMap = {},
  waitlistUserIds,
  userMap,
  organizerIds,
  organizerOnlyIds,
  currentDivision,
  currentUserId,
  hasJoined,
  canManageTournament,
  mutationBusy,
  onOpenProfile,
  onPromoteOrganizer,
  onDemoteOrganizer,
  onDemoteOrganizeOnly,
  organizeOnlyUserIds,
  onConfirmLeave,
  onConfirmRemovePlayer,
  onDeleteGuestPlayer,
  onEditGuestPlayer,
  onRemoveWaitlistPlayer,
  viewerOnWaitlist,
  onInviteWaitlistUser,
  invitePartnerPending,
  playersPerDivisionCap,
  sectionHeadingStyle,
  emptyTextStyle,
  playerRowStyle,
  playerRowOrganizerStyle,
  playerRowTopStyle,
  playerRowMainStyle,
  playerRowTextStyle,
  playerRowNameStyle,
  orgBadgeStyle,
  playerRowRightStyle,
  waitlistBadgeStyle: _waitlistBadgeStyle,
  waitlistRankTextStyle: _waitlistRankTextStyle,
}: {
  t: (key: string, options?: Record<string, string | number>) => string;
  sortedEntries: Entry[];
  /** All tournament guest players (even those not currently in a team). */
  guestPlayers?: TournamentGuestPlayer[];
  guestMap?: Record<string, TournamentGuestPlayer | undefined>;
  /** Same division waitlist user ids (merged into one A–Z list with roster). */
  waitlistUserIds?: string[];
  userMap: Record<string, User>;
  organizerIds: string[];
  organizerOnlyIds?: string[];
  currentDivision: TournamentDivision;
  currentUserId: string | null;
  hasJoined: boolean;
  canManageTournament: boolean;
  mutationBusy: boolean;
  onOpenProfile: (userId: string) => void;
  onPromoteOrganizer: (targetUserId: string, playerName: string) => void;
  onDemoteOrganizer: (targetUserId: string, playerName: string) => void;
  onDemoteOrganizeOnly: (targetUserId: string, playerName: string) => void;
  /** Organizers who are not on the player roster (organize-only). */
  organizeOnlyUserIds: string[];
  onConfirmLeave: () => void;
  onConfirmRemovePlayer: (entry: Entry, playerName: string) => void;
  onDeleteGuestPlayer?: (guest: TournamentGuestPlayer) => void;
  onEditGuestPlayer?: (guest: TournamentGuestPlayer) => void;
  onRemoveWaitlistPlayer?: (userId: string, playerName: string) => void;
  viewerOnWaitlist?: boolean;
  onInviteWaitlistUser?: (userId: string) => void;
  invitePartnerPending?: boolean;
  playersPerDivisionCap?: number;
  /** Style used for group headings (e.g. “GRUPO 1”). */
  sectionHeadingStyle?: unknown;
  emptyTextStyle: unknown;
  playerRowStyle: unknown;
  playerRowOrganizerStyle: unknown;
  playerRowTopStyle: unknown;
  playerRowMainStyle: unknown;
  playerRowTextStyle: unknown;
  playerRowNameStyle: unknown;
  orgBadgeStyle: unknown;
  playerRowRightStyle: unknown;
  waitlistBadgeStyle?: unknown;
  waitlistRankTextStyle?: unknown;
}) {
  const { tokens } = useTheme();
  const onlySet = React.useMemo(() => new Set(organizerOnlyIds ?? []), [organizerOnlyIds]);
  const viewerGender = currentUserId ? (userMap[currentUserId]?.gender as unknown) : undefined;
  const userIdsInTeam = useMemo(
    () =>
      new Set(
        sortedEntries
          .filter((e) => !!e.teamId)
          .map((e) => e.userId)
          .filter((uid): uid is string => !!uid)
      ),
    [sortedEntries]
  );

  const hasValidGender = (g: unknown): g is 'male' | 'female' => g === 'male' || g === 'female';
  const canPairInDivision = (division: TournamentDivision, gA: unknown, gB: unknown): boolean => {
    // Tournament participation requires binary genders. If missing/invalid, disallow pairing.
    if (!hasValidGender(gA) || !hasValidGender(gB)) return false;
    if (division === 'mixed') return true;
    if (division === 'men') return gA === 'male' && gB === 'male';
    if (division === 'women') return gA === 'female' && gB === 'female';
    return false;
  };

  const organizeOnlySorted = useMemo(
    () =>
      [...organizeOnlyUserIds].sort((a, b) =>
        getTournamentPlayerDisplayName(userMap[a])
          .toLowerCase()
          .localeCompare(getTournamentPlayerDisplayName(userMap[b]).toLowerCase(), undefined, {
            sensitivity: 'base',
          })
      ),
    [organizeOnlyUserIds, userMap]
  );

  const guestIdsInRoster = useMemo(() => {
    const s = new Set<string>();
    for (const e of sortedEntries) {
      if (typeof e.guestPlayerId === 'string' && e.guestPlayerId) s.add(e.guestPlayerId);
    }
    return s;
  }, [sortedEntries]);
  const guestsNotInRoster = useMemo(
    () => guestPlayers.filter((g) => g && typeof g._id === 'string' && !guestIdsInRoster.has(g._id)),
    [guestPlayers, guestIdsInRoster]
  );

  /** Waitlist users who are not already represented by a roster row (no-team entry) or on a team. */
  const waitlistOnlyUserIds = useMemo(() => {
    const wl = waitlistUserIds ?? [];
    const entriesNoTeam = sortedEntries.filter((e) => !e.teamId);
    const userIdsWithNoTeamEntry = new Set(
      entriesNoTeam
        .map((e) => e.userId)
        .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0)
    );
    return wl.filter((id) => !userIdsWithNoTeamEntry.has(id) && !userIdsInTeam.has(id));
  }, [sortedEntries, waitlistUserIds, userIdsInTeam]);

  const listData = useMemo<PlayerRow[]>(() => {
    const withTeam = [...sortedEntries.filter((e) => !!e.teamId)].sort((a, b) =>
      compareEntry(a, b, userMap, guestMap)
    );
    const entriesNoTeam = [...sortedEntries.filter((e) => !e.teamId)];
    const guestsNoTeam = [...guestsNotInRoster];
    const waitSorted = [...waitlistOnlyUserIds].sort((a, b) => comparePlayerName(userMap, a, b));
    const noTeamYet: PlayerRow[] = [
      ...entriesNoTeam.map((entry) => ({ kind: 'roster' as const, entry })),
      ...guestsNoTeam.map((guest) => ({ kind: 'guest' as const, guest })),
      ...waitSorted.map((userId) => ({ kind: 'waitlist' as const, userId })),
    ].sort((a, b) => {
      const nameA =
        a.kind === 'roster'
          ? entryDisplayName(a.entry, userMap, guestMap)
          : a.kind === 'guest'
            ? (a.guest.displayName ?? '').trim() || tournamentGuestDisplayName(a.guest) || ''
            : getTournamentPlayerDisplayName(userMap[a.userId]) || '';
      const nameB =
        b.kind === 'roster'
          ? entryDisplayName(b.entry, userMap, guestMap)
          : b.kind === 'guest'
            ? (b.guest.displayName ?? '').trim() || tournamentGuestDisplayName(b.guest) || ''
            : getTournamentPlayerDisplayName(userMap[b.userId]) || '';
      return nameA.toLowerCase().localeCompare(nameB.toLowerCase(), undefined, { sensitivity: 'base' });
    });

    const out: PlayerRow[] = [];
    if (withTeam.length) {
      out.push({ kind: 'section', sectionId: 'withTeam' });
      for (const entry of withTeam) out.push({ kind: 'roster', entry });
    }
    if (noTeamYet.length) {
      out.push({ kind: 'section', sectionId: 'noTeamYet' });
      for (const row of noTeamYet) out.push(row);
    }
    return out;
  }, [sortedEntries, userMap, guestMap, guestsNotInRoster, waitlistOnlyUserIds]);

  const rightClusterStyle = [playerRowRightStyle as never, { gap: 8, alignItems: 'center' } as never];
  const rightSlotStyle = { width: 34, alignItems: 'center', justifyContent: 'center' } as const;

  const header = (
    <>
      {organizeOnlySorted.length > 0 ? (
        <View style={{ marginBottom: 12 }}>
          <Text
            style={[
              playerRowNameStyle as never,
              { fontSize: 13, opacity: 0.85, marginBottom: 8, fontWeight: '600' } as never,
            ]}
          >
            {t('tournamentDetail.organizersOrganizeOnlySection')}
          </Text>
          {organizeOnlySorted.map((uid) => {
            const u = userMap[uid];
            const playerName = getTournamentPlayerDisplayName(u) || t('common.player');
            const showDemote = canManageTournament;
            return (
              <View key={uid} style={[playerRowStyle as never, playerRowOrganizerStyle as never]}>
                <View style={playerRowTopStyle as never}>
                  <Pressable
                    style={playerRowMainStyle as never}
                    onPress={() => onOpenProfile(uid)}
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.viewProfile')}
                  >
                    <Avatar
                      firstName={u?.firstName ?? ''}
                      lastName={u?.lastName ?? ''}
                      gender={u?.gender === 'male' || u?.gender === 'female' ? u.gender : undefined}
                      size="sm"
                      photoUrl={u?.photoUrl}
                    />
                    <View style={playerRowTextStyle as never}>
                      <Text style={playerRowNameStyle as never}>{playerName}</Text>
                      <Text style={orgBadgeStyle as never}>{t('tournamentDetail.organizerOrganizeOnlyBadge')}</Text>
                    </View>
                  </Pressable>
                  <View style={rightClusterStyle}>
                    {showDemote ? (
                      <View style={rightSlotStyle}>
                        <IconButton
                          icon="ribbon"
                          onPress={() => onDemoteOrganizeOnly(uid, playerName)}
                          disabled={mutationBusy}
                          accessibilityLabel={t('tournamentDetail.removeOrganizer')}
                          color={tokens.accentHover}
                          compact
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );

  if (listData.length === 0) {
    return (
      <View>
        {header}
        <Text style={emptyTextStyle as never}>{t('tournamentDetail.noPlayersYet')}</Text>
      </View>
    );
  }

  const sectionTitle = (sectionId: 'withTeam' | 'noTeamYet'): string => {
    if (sectionId === 'withTeam') {
      const withTeamCount = sortedEntries.filter((e) => !!e.teamId).length;
      const cap = Number.isFinite(Number(playersPerDivisionCap)) ? Math.max(0, Number(playersPerDivisionCap)) : null;
      return cap != null ? `${t('tournamentDetail.playersGroupWithTeam')} ${withTeamCount}/${cap}` : t('tournamentDetail.playersGroupWithTeam');
    }
    const entriesNoTeamCount = sortedEntries.filter((e) => !e.teamId).length;
    const guestsNoTeamCount = guestsNotInRoster.length;
    const total = entriesNoTeamCount + guestsNoTeamCount + waitlistOnlyUserIds.length;
    return `${t('tournamentDetail.playersGroupNoTeamYet')} (${total})`;
  };

  return (
    <FlashList
      data={listData}
      keyExtractor={(row) =>
        row.kind === 'section'
          ? `sec-${row.sectionId}`
          : row.kind === 'roster'
            ? row.entry._id
            : row.kind === 'waitlist'
              ? `wl-${row.userId}`
              : `guest-${row.guest._id}`
      }
      ListHeaderComponent={header}
      renderItem={({ item: row, index }) => {
        if (row.kind === 'section') {
          return (
            <Text
              style={[
                (sectionHeadingStyle ?? playerRowNameStyle) as never,
                { marginTop: index === 0 ? 0 : 12 } as never,
              ]}
            >
              {sectionTitle(row.sectionId)}
            </Text>
          );
        }
        if (row.kind === 'waitlist') {
          const u = userMap[row.userId];
          const playerName = getTournamentPlayerDisplayName(u) || t('common.player');
          const isOrganizeOnly = onlySet.has(row.userId);
          const isOrg = organizerIds.includes(row.userId);
          const showInvite =
            !!onInviteWaitlistUser && viewerOnWaitlist && !!currentUserId && row.userId !== currentUserId;
          const canCreateTeamWith =
            showInvite &&
            canPairInDivision(currentDivision, viewerGender, (u as { gender?: unknown })?.gender) &&
            !userIdsInTeam.has(row.userId) &&
            !userIdsInTeam.has(currentUserId!);
          return (
            <View style={[playerRowStyle as never, isOrg ? (playerRowOrganizerStyle as never) : null]}>
              <View style={playerRowTopStyle as never}>
                <Pressable
                  style={playerRowMainStyle as never}
                  onPress={() => onOpenProfile(row.userId)}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.viewProfile')}
                >
                  <Avatar
                    firstName={u?.firstName ?? ''}
                    lastName={u?.lastName ?? ''}
                    gender={u?.gender === 'male' || u?.gender === 'female' ? u.gender : undefined}
                    size="sm"
                    photoUrl={u?.photoUrl}
                  />
                  <View style={playerRowTextStyle as never}>
                    <Text style={playerRowNameStyle as never}>{playerName}</Text>
                    {isOrg ? <Text style={orgBadgeStyle as never}>{t('tournamentDetail.organizerBadge')}</Text> : null}
                    {isOrganizeOnly ? (
                      <Text style={orgBadgeStyle as never}>{t('tournamentDetail.organizerOrganizeOnlyBadge')}</Text>
                    ) : null}
                  </View>
                </Pressable>
                <View style={rightClusterStyle}>
                  <View style={rightSlotStyle}>
                    <MatchStyleStatusPill>
                      <Ionicons name="person-outline" size={14} color={Colors.textSecondary} />
                    </MatchStyleStatusPill>
                  </View>
                  {showInvite && canCreateTeamWith ? (
                    <View style={rightSlotStyle}>
                      <IconButton
                        icon="add"
                        onPress={() => onInviteWaitlistUser!(row.userId)}
                        disabled={!!invitePartnerPending}
                        accessibilityLabel={t('tournamentDetail.waitlistInvitePartner')}
                        color={tokens.accentHover}
                        compact
                      />
                    </View>
                  ) : null}
                  {canManageTournament && onRemoveWaitlistPlayer ? (
                    <View style={rightSlotStyle}>
                      <IconButton
                        icon="trash-outline"
                        onPress={() => onRemoveWaitlistPlayer(row.userId, playerName)}
                        disabled={mutationBusy}
                        accessibilityLabel={t('tournamentDetail.removeFromWaitlist')}
                        color="#f87171"
                        compact
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          );
        }

        if (row.kind === 'guest') {
          const g = row.guest;
          const playerName = String(g?.displayName ?? '').trim() || tournamentGuestDisplayName(g) || t('common.player');
          const guestGender = g.gender === 'male' || g.gender === 'female' ? g.gender : undefined;
          const showGuestTrash = canManageTournament && !!onDeleteGuestPlayer;
          const showGuestEdit = canManageTournament && !!onEditGuestPlayer;
          return (
            <View style={playerRowStyle as never}>
              <View style={playerRowTopStyle as never}>
                <View style={playerRowMainStyle as never}>
                  <Avatar firstName={playerName} lastName="" gender={guestGender} size="sm" />
                  <View style={playerRowTextStyle as never}>
                    <Text style={playerRowNameStyle as never}>{playerName}</Text>
                    {typeof g.note === 'string' && g.note.trim() ? (
                      <Text style={{ fontSize: 12, color: Colors.textMuted }} numberOfLines={1}>
                        {g.note.trim()}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={rightClusterStyle}>
                  <View style={rightSlotStyle}>
                    <MatchStyleStatusPill>
                      <Ionicons name="person-outline" size={14} color={Colors.textSecondary} />
                    </MatchStyleStatusPill>
                  </View>
                  {showGuestEdit ? (
                    <View style={rightSlotStyle}>
                      <IconButton
                        icon="create-outline"
                        onPress={() => onEditGuestPlayer!(g)}
                        disabled={mutationBusy}
                        accessibilityLabel={t('tournamentDetail.guestEditAccessibility')}
                        compact
                      />
                    </View>
                  ) : null}
                  {showGuestTrash ? (
                    <View style={rightSlotStyle}>
                      <IconButton
                        icon="trash-outline"
                        onPress={() => onDeleteGuestPlayer!(g)}
                        disabled={mutationBusy}
                        accessibilityLabel={t('tournamentDetail.guestDeleteTitle')}
                        color="#f87171"
                        compact
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          );
        }

        const entry = row.entry;
        const isGuestEntry = !!entry.guestPlayerId;
        const u = entry.userId ? userMap[entry.userId] : undefined;
        const guest = entry.guestPlayerId ? guestMap[entry.guestPlayerId] : undefined;
        const playerName = isGuestEntry
          ? tournamentGuestDisplayName(guest)
          : getTournamentPlayerDisplayName(u) || t('common.player');
        const isOrg = !!(entry.userId && organizerIds.includes(entry.userId));
        const isSelf = !!(entry.userId && entry.userId === currentUserId);
        const showTopTrash =
          !isGuestEntry && ((canManageTournament && !isSelf) || (isSelf && hasJoined));
        const showOrganizerToggleIcon =
          canManageTournament && !isGuestEntry && (!isSelf || (isSelf && isOrg));
        const hasTeam = !!entry.teamId;
        const guestGender =
          guest?.gender === 'male' || guest?.gender === 'female' ? guest.gender : undefined;
        const rosterUserId =
          !isGuestEntry && typeof entry.userId === 'string' && entry.userId ? entry.userId : undefined;
        const showGuestTrash = canManageTournament && isGuestEntry && !!guest && !!onDeleteGuestPlayer;
        const showGuestEdit = canManageTournament && isGuestEntry && !!guest && !!onEditGuestPlayer;

        return (
          <View
            key={entry._id}
            style={[playerRowStyle as never, isOrg ? (playerRowOrganizerStyle as never) : null]}
          >
            <View style={playerRowTopStyle as never}>
              {isGuestEntry ? (
                <View style={playerRowMainStyle as never}>
                  <Avatar
                    firstName={playerName}
                    lastName=""
                    gender={guestGender}
                    size="sm"
                  />
                  <View style={playerRowTextStyle as never}>
                    <Text style={playerRowNameStyle as never}>{playerName}</Text>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={playerRowMainStyle as never}
                  onPress={() => entry.userId && onOpenProfile(entry.userId)}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.viewProfile')}
                >
                  <Avatar
                    firstName={u?.firstName ?? ''}
                    lastName={u?.lastName ?? ''}
                    gender={u?.gender === 'male' || u?.gender === 'female' ? u.gender : undefined}
                    size="sm"
                    photoUrl={u?.photoUrl}
                  />
                  <View style={playerRowTextStyle as never}>
                    <Text style={playerRowNameStyle as never}>{playerName}</Text>
                    {isOrg ? <Text style={orgBadgeStyle as never}>{t('tournamentDetail.organizerBadge')}</Text> : null}
                  </View>
                </Pressable>
              )}

              <View style={rightClusterStyle}>
                {isGuestEntry || (!isGuestEntry && !hasTeam) ? (
                  <View style={rightSlotStyle}>
                    <MatchStyleStatusPill>
                      <Ionicons name="person-outline" size={14} color={Colors.textSecondary} />
                    </MatchStyleStatusPill>
                  </View>
                ) : null}
                {showGuestEdit ? (
                  <View style={rightSlotStyle}>
                    <IconButton
                      icon="create-outline"
                      onPress={() => onEditGuestPlayer!(guest!)}
                      disabled={mutationBusy}
                      accessibilityLabel={t('tournamentDetail.guestEditAccessibility')}
                      compact
                    />
                  </View>
                ) : null}
                {showGuestTrash ? (
                  <View style={rightSlotStyle}>
                    <IconButton
                      icon="trash-outline"
                      onPress={() => onDeleteGuestPlayer!(guest!)}
                      disabled={mutationBusy}
                      accessibilityLabel={t('tournamentDetail.guestDeleteTitle')}
                      color="#f87171"
                      compact
                    />
                  </View>
                ) : null}
                {showOrganizerToggleIcon && rosterUserId ? (
                  <View style={rightSlotStyle}>
                    <IconButton
                      icon={isOrg ? 'ribbon' : 'ribbon-outline'}
                      onPress={() =>
                        isOrg
                          ? onDemoteOrganizer(rosterUserId, playerName)
                          : onPromoteOrganizer(rosterUserId, playerName)
                      }
                      disabled={mutationBusy}
                      accessibilityLabel={isOrg ? t('tournamentDetail.removeOrganizer') : t('tournamentDetail.makeOrganizer')}
                      color={isOrg ? tokens.accentHover : Colors.textMuted}
                      compact
                    />
                  </View>
                ) : null}

                {showTopTrash ? (
                  <View style={rightSlotStyle}>
                    <IconButton
                      icon="trash-outline"
                      onPress={() => (isSelf && hasJoined ? onConfirmLeave() : onConfirmRemovePlayer(entry, playerName))}
                      disabled={mutationBusy}
                      accessibilityLabel={
                        isSelf && hasJoined ? t('tournamentDetail.leaveTournament') : t('tournamentDetail.removePlayer')
                      }
                      color="#f87171"
                      compact
                    />
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        );
      }}
      getItemType={(row) => (row.kind === 'section' ? 'section' : 'row')}
    />
  );
}
