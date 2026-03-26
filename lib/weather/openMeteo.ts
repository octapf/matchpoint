/**
 * Open-Meteo forecast API (no API key). https://open-meteo.com/
 */

export type LatLon = { lat: number; lon: number };

export type WeatherCurrent = {
  temperatureC: number;
  windSpeedKmh: number;
  weatherCode: number;
  isDay: boolean;
};

/** One hour in the 24h forecast (aligned index across arrays). */
export type HourlyWeatherPoint = {
  timeIso: string;
  temperatureC: number;
  weatherCode: number;
  windSpeedKmh: number;
};

export type WeatherPayload = {
  current: WeatherCurrent;
  hourly: HourlyWeatherPoint[];
};

/** Maps WMO code to i18n key under `feed.sky.*`. */
export function weatherCodeToSkyKey(code: number): string {
  if (code === 0) return 'clear';
  if (code === 1) return 'mainlyClear';
  if (code === 2) return 'partlyCloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'showers';
  if (code >= 85 && code <= 86) return 'snowShowers';
  if (code >= 95 && code <= 99) return 'thunderstorm';
  return 'unknown';
}

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    is_day?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    weather_code?: number[];
    wind_speed_10m?: number[];
  };
};

export async function fetchWeather(coords: LatLon): Promise<WeatherPayload> {
  const params = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    current: 'temperature_2m,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,weather_code,wind_speed_10m',
    forecast_hours: '24',
    wind_speed_unit: 'kmh',
    timezone: 'auto',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Weather HTTP ${res.status}`);
  }
  const json = (await res.json()) as OpenMeteoResponse;
  const c = json.current;
  if (!c || typeof c.temperature_2m !== 'number') {
    throw new Error('Invalid weather response');
  }
  const current: WeatherCurrent = {
    temperatureC: Math.round(c.temperature_2m * 10) / 10,
    windSpeedKmh: Math.round((c.wind_speed_10m ?? 0) * 10) / 10,
    weatherCode: c.weather_code ?? 0,
    isDay: c.is_day === 1,
  };

  const h = json.hourly;
  const hourly: HourlyWeatherPoint[] = [];
  if (h?.time?.length) {
    const n = Math.min(24, h.time.length);
    for (let i = 0; i < n; i++) {
      const timeIso = h.time[i]!;
      const temp = h.temperature_2m?.[i];
      const code = h.weather_code?.[i];
      const wspd = h.wind_speed_10m?.[i];
      if (typeof temp !== 'number') continue;
      hourly.push({
        timeIso,
        temperatureC: Math.round(temp * 10) / 10,
        weatherCode: typeof code === 'number' ? code : 0,
        windSpeedKmh: Math.round((typeof wspd === 'number' ? wspd : 0) * 10) / 10,
      });
    }
  }

  return { current, hourly };
}
