import { all, type CountryData } from 'country-codes-list';
import * as Localization from 'expo-localization';

export type { CountryData } from 'country-codes-list';

export const allCountries: CountryData[] = all();

/** Dial codes longest-first so +1 / +12 / +34 match correctly. */
let _dialsSorted: string[] | null = null;
export function dialCodesLongestFirst(): string[] {
  if (!_dialsSorted) {
    _dialsSorted = [...new Set(allCountries.map((c) => c.countryCallingCode))].sort(
      (a, b) => b.length - a.length
    );
  }
  return _dialsSorted;
}

export function getDefaultCountryCode(): string {
  const region = Localization.getLocales()[0]?.regionCode;
  if (region && allCountries.some((c) => c.countryCode === region)) return region;
  return 'ES';
}

export function findCountryByIso2(iso2: string): CountryData | undefined {
  return allCountries.find((c) => c.countryCode === iso2);
}

/**
 * Split stored E.164 (+...) into ISO2 + national digits. Falls back if unparseable.
 */
export function parseE164ToLocal(
  phone: string | undefined,
  fallbackIso2: string
): { iso2: string; national: string } {
  if (!phone?.trim()) return { iso2: fallbackIso2, national: '' };
  const normalized = phone.trim().replace(/\s/g, '');
  if (!normalized.startsWith('+')) {
    return { iso2: fallbackIso2, national: normalized.replace(/\D/g, '') };
  }
  const digits = normalized.slice(1);
  for (const dial of dialCodesLongestFirst()) {
    if (digits.startsWith(dial)) {
      const c = allCountries.find((x) => x.countryCallingCode === dial);
      return { iso2: c?.countryCode ?? fallbackIso2, national: digits.slice(dial.length) };
    }
  }
  return { iso2: fallbackIso2, national: digits.replace(/\D/g, '') };
}

/** National digits only; empty string clears. */
export function buildE164(iso2: string, nationalDigits: string): string {
  const digits = nationalDigits.replace(/\D/g, '');
  if (!digits) return '';
  const c = findCountryByIso2(iso2);
  if (!c) return `+${digits}`;
  return `+${c.countryCallingCode}${digits}`;
}

export function formatPhoneDisplay(phone: string | undefined): string {
  if (!phone?.trim()) return '';
  const def = getDefaultCountryCode();
  const { iso2, national } = parseE164ToLocal(phone, def);
  const c = findCountryByIso2(iso2);
  if (!c) return phone;
  const n = national.replace(/\D/g, '');
  return `${c.flag} +${c.countryCallingCode} ${n}`;
}

export function filterCountries(query: string): CountryData[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...allCountries].sort((a, b) => a.countryNameEn.localeCompare(b.countryNameEn));
  return allCountries
    .filter(
      (c) =>
        c.countryNameEn.toLowerCase().includes(q) ||
        c.countryCallingCode.includes(q) ||
        c.countryCode.toLowerCase().includes(q)
    )
    .sort((a, b) => a.countryNameEn.localeCompare(b.countryNameEn));
}
