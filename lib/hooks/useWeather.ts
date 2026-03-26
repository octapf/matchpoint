import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { config } from '@/lib/config';
import { tryGetDeviceLatLon } from '@/lib/weather/deviceLocation';
import { fetchWeather, type LatLon } from '@/lib/weather/openMeteo';
import { fetchLocationAreaName } from '@/lib/weather/reverseGeocode';
import { useLanguageStore } from '@/store/useLanguageStore';

export function useWeather() {
  const language = useLanguageStore((s) => s.language ?? 'en');

  const [coords, setCoords] = useState<LatLon>(() => ({
    lat: config.weather.defaultLat,
    lon: config.weather.defaultLon,
  }));
  const [usedDeviceLocation, setUsedDeviceLocation] = useState(false);
  const [locationAreaName, setLocationAreaName] = useState<string | null>(null);

  const refreshLocation = useCallback(async () => {
    const next = await tryGetDeviceLatLon();
    if (next) {
      setCoords(next);
      setUsedDeviceLocation(true);
    }
  }, []);

  useEffect(() => {
    void refreshLocation();
  }, [refreshLocation]);

  useEffect(() => {
    if (!usedDeviceLocation) return;
    let cancelled = false;
    void (async () => {
      const name = await fetchLocationAreaName(coords.lat, coords.lon, language);
      if (!cancelled) setLocationAreaName(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [language, usedDeviceLocation, coords.lat, coords.lon]);

  const query = useQuery({
    queryKey: ['weather', 'forecast', coords.lat, coords.lon],
    queryFn: () => fetchWeather(coords),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  return {
    ...query,
    usedDeviceLocation,
    refreshLocation,
    locationAreaName,
  };
}
