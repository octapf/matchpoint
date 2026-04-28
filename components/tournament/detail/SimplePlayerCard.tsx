import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Colors from '@/constants/Colors';
import { Avatar } from '@/components/ui/Avatar';

export function SimplePlayerCard({
  name,
  gender,
  photoUrl,
  compact,
  style,
}: {
  name: string;
  gender?: 'male' | 'female';
  photoUrl?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const safeName = String(name ?? '').trim() || '—';
  return (
    <View style={[styles.row, compact ? styles.rowCompact : null, style]}>
      <View style={styles.left}>
        <Avatar firstName={safeName} lastName="" gender={gender} size="sm" photoUrl={photoUrl} />
        <View style={styles.textCol}>
          <Text style={styles.name} numberOfLines={1}>
            {safeName}
          </Text>
        </View>
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
});

