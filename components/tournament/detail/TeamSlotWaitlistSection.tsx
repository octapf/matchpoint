import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Colors from '@/constants/Colors';
import { useUsers } from '@/lib/hooks/useUsers';
import { useTeamSlotWaitlist, useLeaveTeamSlotWaitlist, type TeamSlotWaitlistRow } from '@/lib/hooks/useTeamSlotWaitlist';
import { isGuestPlayerSlot } from '@/lib/playerSlots';
import type { Team, TournamentDivision, TournamentGuestPlayer, User } from '@/types';
import { shouldUseDevMocks } from '@/lib/config';
import { useTheme } from '@/lib/theme/useTheme';
import { alertApiError } from '@/lib/utils/apiError';
import { TournamentTeamCard } from '@/components/tournament/detail/TournamentTeamCard';

function waitlistRowToTeam(r: TeamSlotWaitlistRow, tournamentId: string): Team {
  const ids = r.playerIds ?? [];
  return {
    _id: r._id,
    tournamentId: String(r.tournamentId ?? tournamentId),
    name: (r.name ?? '').trim() || '—',
    playerIds: [ids[0] ?? '', ids[1] ?? ''],
    createdBy: r.createdBy ?? '',
    createdAt: '',
    updatedAt: '',
  };
}

type Props = {
  tournamentId: string;
  division: TournamentDivision;
  guestMap: Record<string, TournamentGuestPlayer | undefined>;
  currentUserId: string | null;
  canManageTournament: boolean;
  t: (key: string, options?: Record<string, string | number>) => string;
  onOpenProfile: (userId: string) => void;
};

export function TeamSlotWaitlistSection({
  tournamentId,
  division,
  guestMap,
  currentUserId,
  canManageTournament,
  t,
  onOpenProfile,
}: Props) {
  const { tokens } = useTheme();
  const { data: rows = [], isLoading } = useTeamSlotWaitlist(tournamentId, division);
  const leave = useLeaveTeamSlotWaitlist();

  const userIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      for (const pid of r.playerIds ?? []) {
        if (pid && !isGuestPlayerSlot(pid)) set.add(pid);
      }
    }
    return [...set];
  }, [rows]);

  const { data: users = [] } = useUsers(userIds);
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u._id, u])) as Record<string, User>, [users]);

  if (shouldUseDevMocks()) {
    return null;
  }

  const canRemoveRow = (r: TeamSlotWaitlistRow) => {
    if (!currentUserId) return false;
    if (canManageTournament) return true;
    if (r.createdBy === currentUserId) return true;
    return (r.playerIds ?? []).includes(currentUserId);
  };

  return (
    <View style={styles.block}>
      <Text style={styles.title}>{t('team.teamSlotWaitlistTitle')}</Text>
      {isLoading ? (
        <ActivityIndicator color={tokens.accent} style={{ marginVertical: 12 }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('team.teamSlotWaitlistEmpty')}</Text>
      ) : (
        <View>
          {rows.map((r, index) => {
            const removable = canRemoveRow(r);
            return (
              <TournamentTeamCard
                key={r._id}
                team={waitlistRowToTeam(r, tournamentId)}
                userMap={userMap}
                guestMap={guestMap}
                currentUserId={currentUserId}
                t={t}
                onOpenProfile={onOpenProfile}
                headerRightLabel={t('team.teamSlotWaitlistPosition', { n: index + 1 })}
                canRemoveTeam={removable}
                onRemoveTeam={
                  removable
                    ? () =>
                        leave.mutate(
                          { id: r._id, tournamentId },
                          {
                            onError: (err: unknown) =>
                              alertApiError(t, err, 'team.failedToLeaveTeamSlotWaitlist'),
                          }
                        )
                    : undefined
                }
                removeTeamPending={leave.isPending}
                removeActionAccessibilityLabel={t('team.teamSlotWaitlistLeave')}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Same horizontal bounds as team rows in the tab (no extra inset — cards must match width). */
  block: { marginTop: 16, marginBottom: 8 },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  empty: { fontSize: 14, color: Colors.textMuted, fontStyle: 'italic' },
});
