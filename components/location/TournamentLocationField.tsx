import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import * as Location from 'expo-location';
import { Accuracy } from 'expo-location';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { config } from '@/lib/config';
import { formatGeocodedAddressLine } from '@/lib/formatGeocodedAddress';
import { openVenueInMaps } from '@/components/tournament/venueMapShared';

export type TournamentLocationFieldProps = {
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  /** After filling from GPS (e.g. debounced autosave). */
  onLocationCommitted?: () => void;
  placeholder: string;
  inputStyle?: TextStyle;
  /** Dev-only hint about `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (default true). */
  showDevMapsKeyHint?: boolean;
};

export function TournamentLocationField({
  value,
  onChangeText,
  onBlur,
  onLocationCommitted,
  placeholder,
  inputStyle,
  showDevMapsKeyHint = true,
}: TournamentLocationFieldProps) {
  const { t } = useTranslation();
  const [geoLoading, setGeoLoading] = useState(false);

  const useCurrentLocation = useCallback(async () => {
    setGeoLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.error'), t('tournaments.locationPermissionDenied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Accuracy.Balanced });
      const rows = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const geo = rows[0];
      if (!geo) {
        Alert.alert(t('common.error'), t('tournaments.mapsSearchFailed'));
        return;
      }
      const line = formatGeocodedAddressLine(geo);
      if (!line.trim()) {
        Alert.alert(t('common.error'), t('tournaments.mapsSearchFailed'));
        return;
      }
      onChangeText(line);
      onLocationCommitted?.();
    } catch {
      Alert.alert(t('common.error'), t('tournaments.mapsSearchFailed'));
    } finally {
      setGeoLoading(false);
    }
  }, [onChangeText, onLocationCommitted, t]);

  const openInMapsApp = useCallback(() => {
    const q = value.trim();
    if (!q) return;
    openVenueInMaps(q, () => Alert.alert(t('common.error'), t('tournaments.mapsOpenFailed')));
  }, [t, value]);

  return (
    <View>
      <TextInput
        style={[styles.input, inputStyle]}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
      />

      <View style={styles.locationAction}>
        <Button
          title={t('tournaments.mapsUseCurrentLocation')}
          variant="secondary"
          size="sm"
          fullWidth
          iconLeft="navigate-outline"
          onPress={useCurrentLocation}
          disabled={geoLoading}
        />
      </View>

      {value.trim().length > 0 ? (
        <View style={styles.openMapsBtn}>
          <Button
            title={t('tournaments.mapsOpenInMaps')}
            variant="outline"
            size="sm"
            fullWidth
            iconLeft="open-outline"
            onPress={openInMapsApp}
          />
        </View>
      ) : null}

      {showDevMapsKeyHint &&
      typeof __DEV__ !== 'undefined' &&
      __DEV__ &&
      !config.google.mapsConfigured ? (
        <Text style={styles.hint}>{t('tournaments.mapsApiKeyHint')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
  },
  locationAction: {
    marginTop: 10,
    marginBottom: 8,
  },
  openMapsBtn: {
    marginTop: 4,
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 16,
  },
});
