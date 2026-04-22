import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import type { TournamentGuestPlayer } from '@/types';

function GuestPill() {
  return (
    <View style={styles.guestPill}>
      <Ionicons name="person-outline" size={14} color={Colors.textSecondary} />
    </View>
  );
}

export function GuestPlayerCard({
  guest,
  t,
  onEdit,
  onDelete,
  disabled,
  compact,
}: {
  guest: TournamentGuestPlayer;
  t: (key: string, options?: Record<string, string | number>) => string;
  onEdit?: (g: TournamentGuestPlayer) => void;
  onDelete?: (g: TournamentGuestPlayer) => void;
  disabled?: boolean;
  /** Smaller padding to match dense lists */
  compact?: boolean;
}) {
  const playerName = String(guest?.displayName ?? '').trim() || t('common.player');
  const guestGender = guest.gender === 'male' || guest.gender === 'female' ? guest.gender : undefined;

  return (
    <View style={[styles.row, compact ? styles.rowCompact : null]}>
      <View style={styles.left}>
        <Avatar firstName={playerName} lastName="" gender={guestGender} size="sm" />
        <View style={styles.textCol}>
          <Text style={styles.name} numberOfLines={1}>
            {playerName}
          </Text>
          {typeof guest.note === 'string' && guest.note.trim() ? (
            <Text style={styles.note} numberOfLines={1}>
              {guest.note.trim()}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.right}>
        <GuestPill />
        {onEdit ? (
          <IconButton
            icon="create-outline"
            onPress={() => onEdit(guest)}
            disabled={!!disabled}
            accessibilityLabel={t('tournamentDetail.guestEditAccessibility')}
            compact
          />
        ) : null}
        {onDelete ? (
          <IconButton
            icon="trash-outline"
            onPress={() => onDelete(guest)}
            disabled={!!disabled}
            accessibilityLabel={t('tournamentDetail.guestDeleteTitle')}
            color="#f87171"
            compact
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.surface,
  },
  rowCompact: { paddingVertical: 10, paddingHorizontal: 12 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  note: { fontSize: 12, color: Colors.textMuted },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  guestPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

