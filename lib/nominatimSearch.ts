/**
 * Nominatim (OpenStreetMap) search fallback when Photon returns nothing.
 * https://operations.osmfoundation.org/policies/nominatim/ — identify app, no bulk abuse.
 */

import type { PhotonFeature, PhotonSearchBias } from '@/lib/photonGeocode';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

const UA = 'Matchpoint/1.0 (venue search; https://matchpoint.miralab.ar)';

type NominatimItem = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string | undefined>;
};

function queryVariants(q: string): string[] {
  const trimmed = q.trim();
  const out = new Set<string>([trimmed]);
  if (/\bplaya\b/i.test(trimmed)) {
    const alt = trimmed.replace(/\bplayas\b/gi, 'platjes').replace(/\bplaya\b/gi, 'platja');
    if (alt !== trimmed) out.add(alt);
  }
  return [...out];
}

function itemToFeature(item: NominatimItem): PhotonFeature {
  const lon = parseFloat(item.lon);
  const lat = parseFloat(item.lat);
  const cc = item.address?.country_code?.toUpperCase();
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      osm_key: 'nominatim',
      osm_value: 'search',
      name: item.display_name,
      nominatim_place_id: item.place_id,
      countrycode: cc,
      city: item.address?.city ?? item.address?.town ?? item.address?.village,
      country: item.address?.country,
    },
  };
}

export async function searchNominatimAsFeatures(
  query: string,
  bias?: PhotonSearchBias | null,
): Promise<PhotonFeature[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const variants = queryVariants(q);
  const merged = new Map<string, PhotonFeature>();

  for (const vq of variants) {
    const params = new URLSearchParams({
      q: vq,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '12',
    });
    /** Do not use bounded=1 + viewbox — wrong box or strict mode often returns 0 hits. Sort by distance after. */

    try {
      const res = await fetch(`${NOMINATIM}?${params.toString()}`, {
        headers: { Accept: 'application/json', 'User-Agent': UA },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as NominatimItem[];
      if (!Array.isArray(json)) continue;
      for (const item of json) {
        const f = itemToFeature(item);
        const k = `nominatim:${item.place_id}`;
        if (!merged.has(k)) merged.set(k, f);
      }
    } catch {
      continue;
    }
  }

  let out = [...merged.values()];
  if (bias && Number.isFinite(bias.latitude) && Number.isFinite(bias.longitude)) {
    out.sort((a, b) => {
      const [lonA, latA] = a.geometry.coordinates;
      const [lonB, latB] = b.geometry.coordinates;
      const dA =
        (latA - bias.latitude) * (latA - bias.latitude) + (lonA - bias.longitude) * (lonA - bias.longitude);
      const dB =
        (latB - bias.latitude) * (latB - bias.latitude) + (lonB - bias.longitude) * (lonB - bias.longitude);
      return dA - dB;
    });
  } else {
    out.sort((a, b) => {
      const esA = a.properties.countrycode === 'ES' ? 0 : 1;
      const esB = b.properties.countrycode === 'ES' ? 0 : 1;
      return esA - esB;
    });
  }

  return out.slice(0, 15);
}

export async function geocodeFirstWithNominatim(
  address: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const q = address.trim();
  if (!q) return null;
  const variants = queryVariants(q);

  for (const vq of variants) {
    try {
      const params = new URLSearchParams({
        q: vq,
        format: 'jsonv2',
        limit: '3',
        addressdetails: '0',
      });
      const res = await fetch(`${NOMINATIM}?${params.toString()}`, {
        headers: { Accept: 'application/json', 'User-Agent': UA },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as NominatimItem[];
      if (!Array.isArray(json) || json.length === 0) continue;
      const sorted = [...json].sort((a, b) => {
        const esA = a.address?.country_code?.toLowerCase() === 'es' ? 0 : 1;
        const esB = b.address?.country_code?.toLowerCase() === 'es' ? 0 : 1;
        return esA - esB;
      });
      const item = sorted[0];
      const lat = parseFloat(item.lat);
      const lon = parseFloat(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      return { latitude: lat, longitude: lon };
    } catch {
      continue;
    }
  }
  return null;
}
