/**
 * Allowed `User.themePresetId` values for API validation.
 * Keep in sync with `ThemePresetId` / `THEME_PRESETS` in `lib/theme/colors.ts` (add new presets here first).
 * Intentionally NOT imported from `lib/theme/colors` so Vercel/server bundles never omit or reorder keys.
 */
export const ALLOWED_THEME_PRESET_IDS = [
  'classic',
  'sport_blue',
  'sport_orange',
  'neon_pop',
  'lavender_mist',
  'blush_ice',
  'candy_pink',
  'forest_lime',
  'sand_rose',
  'pearl_frost',
  'amber_lagoon',
] as const;

export type AllowedThemePresetId = (typeof ALLOWED_THEME_PRESET_IDS)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_THEME_PRESET_IDS);

export function isAllowedThemePresetId(id: string): boolean {
  return ALLOWED_SET.has(id);
}
