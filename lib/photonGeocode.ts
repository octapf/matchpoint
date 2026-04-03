/**
 * Photon (Komoot) — OSM-based search/geocode, no API key.
 * https://photon.komoot.io — use fairly; not for bulk/offline dumps.
 * Falls back to Nominatim if Photon returns nothing (public instances can rate-limit or fail).
 */

import { geocodeFirstWithNominatim, searchNominatimAsFeatures } from '@/lib/nominatimSearch';

const PHOTON_API = 'https://photon.komoot.io/api/';

export type PhotonFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
};

type PhotonResponse = {
  type?: string;
  features?: PhotonFeature[];
  /** Present when `lang` is invalid (e.g. es/it). */
  lang?: unknown;
};

/** Photon only supports: default, de, en, fr (not es/it — those return an error and zero results). */
function photonLang(locale: string): string {
  const l = (locale || 'en').split(/[-_]/)[0]?.toLowerCase() ?? 'en';
  if (l === 'de' || l === 'fr' || l === 'en') return l;
  return 'default';
}

function distanceSqToBias(f: PhotonFeature, bias: PhotonSearchBias): number {
  const [lon, lat] = f.geometry.coordinates;
  const dlat = lat - bias.latitude;
  const dlon = lon - bias.longitude;
  return dlat * dlat + dlon * dlon;
}

function featureDedupeKey(f: PhotonFeature): string {
  const p = f.properties;
  const id = p.osm_id != null ? String(p.osm_id) : '';
  const typ = p.osm_type != null ? String(p.osm_type) : '';
  if (id && typ) return `${typ}:${id}`;
  const [lon, lat] = f.geometry.coordinates;
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

/** OSM often tags Catalan beaches as "Platja …" while users type Spanish "playa …". */
export function buildPhotonQueryVariants(query: string): string[] {
  const trimmed = query.trim();
  const out = new Set<string>([trimmed]);
  if (/\bplaya\b/i.test(trimmed)) {
    const alt = trimmed.replace(/\bplayas\b/gi, 'platjes').replace(/\bplaya\b/gi, 'platja');
    if (alt !== trimmed) out.add(alt);
  }
  return [...out];
}

/** Build a single-line address from a Photon feature (OSM-backed). */
export function formatPhotonLabel(feature: PhotonFeature): string {
  const p = feature.properties;
  if (p.osm_key === 'nominatim') {
    return (p.name != null ? String(p.name) : '').trim();
  }
  const name = p.name != null ? String(p.name) : '';
  const hn = p.housenumber != null ? String(p.housenumber) : '';
  const st = p.street != null ? String(p.street) : '';
  const streetLine = [hn, st].filter(Boolean).join(' ').trim();
  const cityRaw = p.city ?? p.town ?? p.locality ?? p.district ?? p.county;
  const city = cityRaw != null ? String(cityRaw) : '';
  const pc = p.postcode != null ? String(p.postcode) : '';
  const state = p.state != null ? String(p.state) : '';
  const country = p.country != null ? String(p.country) : '';

  const isBeachOrNatural =
    p.osm_value === 'beach' || p.osm_key === 'natural' || (p.type === 'other' && !!name);

  const parts: string[] = [];
  if (isBeachOrNatural && name) {
    parts.push(name);
  }
  if (streetLine) parts.push(streetLine);
  else if (!isBeachOrNatural && name && (st || p.type === 'house')) parts.push(name);
  else if (!isBeachOrNatural && name && !city) parts.push(name);

  if (pc && city) parts.push(`${pc} ${city}`);
  else if (city && !parts.some((x) => x.includes(city))) parts.push(city);

  if (state && state !== city) parts.push(state);
  if (country) parts.push(country);

  const line = parts.filter(Boolean).join(', ');
  if (line.trim()) return line.trim();
  return name.trim() || streetLine || city || '';
}

/** Prefer results near this point (device GPS). See Photon docs: lat, lon, zoom, location_bias_scale. */
export type PhotonSearchBias = { latitude: number; longitude: number };

async function fetchPhotonOnce(
  q: string,
  locale: string,
  bias?: PhotonSearchBias | null,
): Promise<PhotonFeature[]> {
  const params = new URLSearchParams({ q, limit: '15', lang: photonLang(locale) });
  if (bias && Number.isFinite(bias.latitude) && Number.isFinite(bias.longitude)) {
    params.set('lat', String(bias.latitude));
    params.set('lon', String(bias.longitude));
    params.set('zoom', '11');
    params.set('location_bias_scale', '0.35');
  }
  const res = await fetch(`${PHOTON_API}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Matchpoint/1.0 (venue search; https://matchpoint.miralab.ar)',
    },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as PhotonResponse;
  if (json.lang != null && !Array.isArray(json.features)) {
    const retry = new URLSearchParams({ q, limit: '15', lang: 'default' });
    if (bias && Number.isFinite(bias.latitude) && Number.isFinite(bias.longitude)) {
      retry.set('lat', String(bias.latitude));
      retry.set('lon', String(bias.longitude));
      retry.set('zoom', '11');
      retry.set('location_bias_scale', '0.35');
    }
    const res2 = await fetch(`${PHOTON_API}?${retry.toString()}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Matchpoint/1.0' },
    });
    if (!res2.ok) return [];
    const j2 = (await res2.json()) as PhotonResponse;
    return Array.isArray(j2.features) ? j2.features : [];
  }
  return Array.isArray(json.features) ? json.features : [];
}

async function fetchPhotonOnceSafe(
  q: string,
  locale: string,
  bias?: PhotonSearchBias | null,
): Promise<PhotonFeature[]> {
  try {
    return await fetchPhotonOnce(q, locale, bias);
  } catch {
    return [];
  }
}

export async function searchPhoton(
  query: string,
  locale: string,
  bias?: PhotonSearchBias | null,
): Promise<PhotonFeature[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const variants = buildPhotonQueryVariants(q);
  const variantResults = await Promise.all(variants.map((vq) => fetchPhotonOnceSafe(vq, locale, bias)));

  const merged = new Map<string, PhotonFeature>();
  for (const list of variantResults) {
    for (const f of list) {
      const k = featureDedupeKey(f);
      if (!merged.has(k)) merged.set(k, f);
    }
  }
  let out = [...merged.values()];

  if (bias && Number.isFinite(bias.latitude) && Number.isFinite(bias.longitude)) {
    out.sort((a, b) => distanceSqToBias(a, bias) - distanceSqToBias(b, bias));
  } else {
    out.sort((a, b) => {
      const esA = a.properties.countrycode === 'ES' ? 0 : 1;
      const esB = b.properties.countrycode === 'ES' ? 0 : 1;
      return esA - esB;
    });
  }

  let slice = out.slice(0, 15);
  if (slice.length === 0) {
    try {
      slice = await searchNominatimAsFeatures(q, bias);
    } catch {
      /* Nominatim optional fallback */
    }
  }
  return slice;
}

/** First hit for a full address string (validation / map center). */
export async function geocodeVenueWithPhoton(
  address: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const variants = buildPhotonQueryVariants(trimmed);
  for (const q of variants) {
    try {
      const params = new URLSearchParams({ q, limit: '3', lang: 'default' });
      const res = await fetch(`${PHOTON_API}?${params.toString()}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'Matchpoint/1.0' },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as PhotonResponse;
      const list = json.features;
      if (!Array.isArray(list) || list.length === 0) continue;

      const sorted = [...list].sort((a, b) => {
        const esA = a.properties.countrycode === 'ES' ? 0 : 1;
        const esB = b.properties.countrycode === 'ES' ? 0 : 1;
        return esA - esB;
      });

      const f = sorted[0];
      if (!f || f.geometry?.type !== 'Point') continue;
      const [lon, lat] = f.geometry.coordinates;
      if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }
      return { latitude: lat, longitude: lon };
    } catch {
      continue;
    }
  }
  return geocodeFirstWithNominatim(trimmed);
}

export function photonFeatureKey(f: PhotonFeature, index: number): string {
  const p = f.properties;
  if (p.osm_key === 'nominatim' && p.nominatim_place_id != null) {
    return `nom-${String(p.nominatim_place_id)}`;
  }
  const id = p.osm_id;
  const [lon, lat] = f.geometry?.coordinates ?? [0, 0];
  return `${id ?? 'x'}-${index}-${lon}-${lat}`;
}
