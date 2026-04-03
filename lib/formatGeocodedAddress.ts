import type { LocationGeocodedAddress } from 'expo-location';

/** Build a single-line venue string from expo-location reverse geocode. */
export function formatGeocodedAddressLine(r: LocationGeocodedAddress): string {
  const street = [r.streetNumber, r.street].filter(Boolean).join(' ').trim();
  const parts: string[] = [];
  if (street) parts.push(street);
  if (r.district) parts.push(r.district);
  if (r.city) parts.push(r.city);
  if (r.region) parts.push(r.region);
  if (r.postalCode) parts.push(r.postalCode);
  if (r.country) parts.push(r.country);
  if (!parts.length && r.name) parts.push(r.name);
  return parts.join(', ');
}
