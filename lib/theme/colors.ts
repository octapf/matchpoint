export type ThemePresetId =
  | 'classic'
  | 'sport_blue'
  | 'sport_orange'
  | 'neon_pop'
  | 'lavender_mist'
  | 'blush_ice'
  | 'candy_pink'
  | 'forest_lime'
  | 'sand_rose';

export type ThemeAccentTokens = {
  /** Primary accent (buttons, highlights). */
  accent: string;
  /**
   * Accent hover/pressed (web) or subtle emphasis.
   * NOTE: kept for backward compatibility — in our app this effectively behaves as "secondary accent".
   */
  accentHover: string;
  /** Low-alpha accent surface. */
  accentMuted: string;
  /** Accent outline / border. */
  accentOutline: string;
  /** Secondary accent (used where legacy UI used violet alongside yellow). */
  accentSecondary: string;
  /** Low-alpha secondary accent surface. */
  accentSecondaryMuted: string;
  /** Secondary accent outline / border. */
  accentSecondaryOutline: string;
  /** Active tab icon tint. */
  tabIconSelected: string;
};

export type ThemeTextTokens = {
  lightText: string; // white-ish
  lightTextSecondary: string;
  darkText: string; // black-ish
  darkTextSecondary: string;
};

export type ThemeBaseTokens = {
  background: string;
  surface: string;
  surfaceLight: string;
  border: string;
};

export type ThemeTokens = ThemeBaseTokens & ThemeTextTokens & ThemeAccentTokens;

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, '');
  if (![3, 6].includes(raw.length)) return null;
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${clamp01(alpha)})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha)})`;
}

function mix(hexA: string, hexB: string, t: number) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const tt = clamp01(t);
  const r = Math.round(a.r + (b.r - a.r) * tt);
  const g = Math.round(a.g + (b.g - a.g) * tt);
  const bch = Math.round(a.b + (b.b - a.b) * tt);
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(bch)}`;
}

function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const L1 = relativeLuminance(foregroundHex);
  const L2 = relativeLuminance(backgroundHex);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Picks light vs dark text for background to meet AA contrast.
 * - Default to light text, unless it fails.
 * - AA normal text threshold: 4.5:1
 */
export function readableTextOnBackground(bgHex: string, tokens: ThemeTextTokens): 'light' | 'dark' {
  const light = contrastRatio(tokens.lightText, bgHex);
  if (light >= 4.5) return 'light';
  return 'dark';
}

const base: ThemeBaseTokens = {
  background: '#1a1a1a',
  surface: '#2d2d2d',
  surfaceLight: '#3d3d3d',
  border: '#3d3d3d',
};

const text: ThemeTextTokens = {
  lightText: '#ffffff',
  lightTextSecondary: '#e5e5e5',
  darkText: '#111111',
  darkTextSecondary: '#1a1a1a',
};

function buildAccentPair(primary: string, secondary: string): ThemeAccentTokens {
  return {
    accent: primary,
    // Keep "hover" meaning but treat it as secondary accent in-app.
    accentHover: secondary,
    accentMuted: rgba(primary, 0.22),
    accentOutline: rgba(primary, 0.45),
    accentSecondary: secondary,
    accentSecondaryMuted: rgba(secondary, 0.22),
    accentSecondaryOutline: rgba(secondary, 0.45),
    tabIconSelected: primary,
  };
}

export const THEME_PRESETS: Record<ThemePresetId, { id: ThemePresetId; label: string; tokens: ThemeTokens }> = {
  classic: {
    id: 'classic',
    label: 'Retro Duo',
    // Match legacy palette: primary = yellow, secondary = violet
    tokens: { ...base, ...text, ...buildAccentPair('#fbbf24', '#8b5cf6') },
  },
  sport_blue: {
    id: 'sport_blue',
    label: 'Ocean Sky',
    tokens: { ...base, ...text, ...buildAccentPair('#3572EF', '#3ABEF9') },
  },
  sport_orange: {
    id: 'sport_orange',
    label: 'Sunset Gold',
    tokens: { ...base, ...text, ...buildAccentPair('#F07B3F', '#FFD460') },
  },
  neon_pop: {
    id: 'neon_pop',
    label: 'Neon Pop',
    tokens: { ...base, ...text, ...buildAccentPair('#08D9D6', '#FF2E63') },
  },
  lavender_mist: {
    id: 'lavender_mist',
    label: 'Lavender Mist',
    tokens: { ...base, ...text, ...buildAccentPair('#DCD6F7', '#A6B1E1') },
  },
  blush_ice: {
    id: 'blush_ice',
    label: 'Blush Ice',
    tokens: { ...base, ...text, ...buildAccentPair('#FDCEDF', '#F8E8EE') },
  },
  candy_pink: {
    id: 'candy_pink',
    label: 'Candy Pink',
    tokens: { ...base, ...text, ...buildAccentPair('#FF8DC7', '#FFACC7') },
  },
  forest_lime: {
    id: 'forest_lime',
    label: 'Forest Lime',
    tokens: { ...base, ...text, ...buildAccentPair('#4E9F3D', '#D8E9A8') },
  },
  sand_rose: {
    id: 'sand_rose',
    label: 'Sand Rose',
    tokens: { ...base, ...text, ...buildAccentPair('#F1DBBF', '#AA5656') },
  },
};

export const DEFAULT_THEME_PRESET_ID: ThemePresetId = 'classic';

