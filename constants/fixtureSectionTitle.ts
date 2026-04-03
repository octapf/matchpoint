import Colors from '@/constants/Colors';

/** Same base size as classification “Grupo n” / bracket column labels. */
export const FIXTURE_BRACKET_SECTION_TITLE_FS = 14;

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
