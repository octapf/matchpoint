import { contrastRatio, THEME_PRESETS } from './colors';

type Check = {
  name: string;
  ratio: number;
  pass: boolean;
  fg: string;
  bg: string;
};

/**
 * Dev helper: verify AA contrast for common text-on-surface combos per preset.
 * This is intentionally small and can run on-device (console only).
 */
export function verifyThemeA11y(): { preset: string; checks: Check[] }[] {
  const AA_NORMAL = 4.5;
  return Object.values(THEME_PRESETS).map((p) => {
    const t = p.tokens;
    const pairs: { name: string; fg: string; bg: string }[] = [
      { name: 'lightText_on_background', fg: t.lightText, bg: t.background },
      { name: 'lightText_on_surface', fg: t.lightText, bg: t.surface },
      { name: 'lightText_on_surfaceLight', fg: t.lightText, bg: t.surfaceLight },
      { name: 'darkText_on_accent', fg: t.darkTextSecondary, bg: t.accent },
      { name: 'darkText_on_accentSecondary', fg: t.darkTextSecondary, bg: t.accentSecondary },
    ];

    const checks = pairs.map((x) => {
      const ratio = contrastRatio(x.fg, x.bg);
      return { name: x.name, fg: x.fg, bg: x.bg, ratio, pass: ratio >= AA_NORMAL };
    });

    return { preset: p.id, checks };
  });
}

