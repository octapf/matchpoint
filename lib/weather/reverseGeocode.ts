import type { Language } from '@/lib/i18n';

/**
 * Human-readable area from coordinates (neighborhood / suburb + city when useful).
 * Uses OpenStreetMap Nominatim — respect their usage policy (no bulk; one-off for UI).
 */
export async function fetchLocationAreaName(
  lat: number,
  lon: number,
  language: Language | null
): Promise<string | null> {
  const lang = language ?? 'en';
  const acceptLang = lang === 'es' ? 'es,en;q=0.8' : lang === 'it' ? 'it,en;q=0.8' : 'en';

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('zoom', '18');

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Matchpoint/1.0 (weather; https://matchpoint.miralab.ar)',
        'Accept-Language': acceptLang,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: Record<string, string> };
    const a = data.address;
    if (!a) return null;
    return formatAreaLine(a);
  } catch {
    return null;
  }
}

function formatAreaLine(a: Record<string, string>): string | null {
  const area =
    a.neighbourhood ||
    a.suburb ||
    a.quarter ||
    a.city_district ||
    a.hamlet ||
    a.village;
  const city = a.city || a.town || a.municipality;
  const region = a.state || a.region;

  if (area && city && normalize(area) !== normalize(city)) {
    return `${area}, ${city}`;
  }
  if (area) return area;
  if (city) return city;
  if (region) return region;
  return null;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}
