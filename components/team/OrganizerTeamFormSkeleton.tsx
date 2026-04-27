import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';
import Colors from '@/constants/Colors';

type Props = {
  bottomInset?: number;
};

/** Placeholder while tournament + waitlist context for the organizer team form loads. */
export function OrganizerTeamFormSkeleton({ bottomInset = 0 }: Props) {
  return (
    <View style={[styles.root, { paddingBottom: 24 + bottomInset }]}>
      <Skeleton height={28} width="55%" style={{ marginBottom: 16 }} />
      <Skeleton height={16} width="92%" style={{ marginBottom: 8 }} />
      <Skeleton height={16} width="78%" style={{ marginBottom: 20 }} />
      <Skeleton height={13} width={100} style={{ marginBottom: 8 }} />
      <Skeleton height={44} width="100%" borderRadius={12} style={{ marginBottom: 16 }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.row}>
          <Skeleton height={40} width={40} borderRadius={20} />
          <Skeleton height={18} width="68%" style={{ marginLeft: 12, alignSelf: 'center' }} />
        </View>
      ))}
      <Skeleton height={48} width="100%" borderRadius={12} style={{ marginTop: 20 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 20, paddingTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
});
