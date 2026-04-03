/**
 * Google Places (Legacy) — optional when EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is set on native.
 * Web uses Photon instead (no CORS). Enable Places API for this key if you use it.
 */

export type PlacePrediction = { placeId: string; description: string };

export async function fetchPlacePredictions(
  input: string,
  apiKey: string,
  language: string,
  /** Prefer suggestions near this point (meters). */
  bias?: { latitude: number; longitude: number } | null,
): Promise<PlacePrediction[]> {
  const q = input.trim();
  if (!q || !apiKey) return [];

  const params = new URLSearchParams({
    input: q,
    key: apiKey,
    language,
    types: 'geocode',
  });
  if (bias && Number.isFinite(bias.latitude) && Number.isFinite(bias.longitude)) {
    params.set('location', `${bias.latitude},${bias.longitude}`);
    params.set('radius', '50000');
  }
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;
  let json: {
    predictions?: { place_id: string; description: string }[];
    status: string;
  };
  try {
    const res = await fetch(url);
    json = (await res.json()) as typeof json;
  } catch {
    return [];
  }

  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    return [];
  }

  return (json.predictions ?? []).map((p) => ({
    placeId: p.place_id,
    description: p.description,
  }));
}

export async function fetchPlaceFormattedAddress(
  placeId: string,
  apiKey: string,
  language: string,
): Promise<string | null> {
  if (!placeId || !apiKey) return null;

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'formatted_address',
    key: apiKey,
    language,
  });
  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
  let json: {
    result?: { formatted_address?: string };
    status: string;
  };
  try {
    const res = await fetch(url);
    json = (await res.json()) as typeof json;
  } catch {
    return null;
  }

  if (json.status !== 'OK' || !json.result?.formatted_address) return null;
  return json.result.formatted_address.trim();
}
