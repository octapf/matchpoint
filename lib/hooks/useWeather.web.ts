import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { config } from '@/lib/config';
import { fetchWeather } from '@/lib/weather/openMeteo';

export function useWeather() {
  const coords = useMemo(
    () => ({
      lat: config.weather.defaultLat,
      lon: config.weather.defaultLon,
    }),
    []
  );

  const query = useQuery({
    queryKey: ['weather', 'forecast', coords.lat, coords.lon],
    queryFn: () => fetchWeather(coords),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const refreshLocation = useCallback(async () => {
    /* no GPS on web hook */
  }, []);

  return { ...query, usedDeviceLocation: false, refreshLocation, locationAreaName: null as string | null };
}
