import React from 'react';
import { Pressable } from 'react-native';
import { TournamentVenueMapOsmWebView } from '@/components/tournament/TournamentVenueMapOsmWebView';
import { VENUE_MAP_HEIGHT, openVenueInMaps } from '@/components/tournament/venueMapShared';

/**
 * Zoomed venue preview via OSM (no Google Maps APIs). Tap opens the address in Google Maps app/site.
 */
export function TournamentVenueMapStaticPreview({ address }: { address: string }) {
  return (
    <Pressable onPress={() => openVenueInMaps(address)} accessibilityRole="button">
      <TournamentVenueMapOsmWebView address={address} />
    </Pressable>
  );
}

export { VENUE_MAP_HEIGHT, openVenueInMaps, openVenueInGoogleMaps } from '@/components/tournament/venueMapShared';
