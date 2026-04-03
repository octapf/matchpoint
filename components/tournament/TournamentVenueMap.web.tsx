import React from 'react';
import { StyleSheet, View } from 'react-native';
import Colors from '@/constants/Colors';
import { TournamentVenueMapStaticPreview } from '@/components/tournament/TournamentVenueMapStaticPreview';

export type TournamentVenueMapProps = {
  address: string;
};

/** Web: Static Maps preview (enable Maps Static API + same key as Places). */
export function TournamentVenueMap({ address }: TournamentVenueMapProps) {
  const trimmed = address.trim();
  if (!trimmed) return null;
  return (
    <View style={styles.root}>
      <TournamentVenueMapStaticPreview address={trimmed} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.surfaceLight,
  },
});
