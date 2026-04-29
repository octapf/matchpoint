import Colors from '@/constants/Colors';

/** Same base size as classification “Grupo n” / bracket column labels. */
export const FIXTURE_BRACKET_SECTION_TITLE_FS = 14;

/** Brighter cool silver for titles/icons on dark backgrounds (also used for the Silver tab wash). */
export const FIXTURE_SILVER_ACCENT = '#e2e8f0';

/** Brighter warm bronze/copper for titles/icons on dark backgrounds (also used for the Bronze tab wash). */
export const FIXTURE_BRONZE_ACCENT = '#ebb078';

/**
 * Accent for category-tab section titles (“Cuadro”, column rounds, list round headings).
 * Uses the same colors as `CategoryTabContentGradient` in `FixtureTab`.
 */
export function medalCategoryAccentColor(category: 'Gold' | 'Silver' | 'Bronze'): string {
  if (category === 'Silver') return FIXTURE_SILVER_ACCENT;
  if (category === 'Bronze') return FIXTURE_BRONZE_ACCENT;
  return Colors.yellow;
}

/**
 * “Cuadro” / bracket diagram section title — also used for Live tab “Current games”.
 * Keep in sync with classification `groupHeading` top spacing (`marginTop: 4`).
 */
export const fixtureBracketSectionTitleStyle = {
  fontSize: FIXTURE_BRACKET_SECTION_TITLE_FS,
  fontWeight: '700' as const,
  fontStyle: 'italic' as const,
  color: Colors.yellow,
  marginTop: 4,
  marginBottom: 14,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.6,
};

/** Same typography as `fixtureBracketSectionTitleStyle` with medal-specific accent color. */
export function medalCategorySectionTitleStyle(category: 'Gold' | 'Silver' | 'Bronze') {
  return { ...fixtureBracketSectionTitleStyle, color: medalCategoryAccentColor(category) };
}
