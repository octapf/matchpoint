/**
 * Matchpoint color palette
 * Dark theme: yellow + violet highlights, dark grey background, light grey text
 */

const palette = {
  background: '#1a1a1a',
  surface: '#2d2d2d',
  surfaceLight: '#3d3d3d',
  text: '#e5e5e5',
  textSecondary: '#a3a3a3',
  textMuted: '#737373',
  yellow: '#fbbf24',
  yellowHover: '#fcd34d',
  violet: '#8b5cf6',
  violetHover: '#a78bfa',
  /** Same RGB as `violet` (#8b5cf6) — translucent surfaces (e.g. organizer rows) */
  violetMuted: 'rgba(139, 92, 246, 0.22)',
  /** Same hue as `violet` — soft borders on violet-tinted UI */
  violetOutline: 'rgba(139, 92, 246, 0.45)',
  avatarMale: '#93c5fd',
  avatarFemale: '#f9a8d4',
  avatarOther: '#6b7280',
  success: '#22c55e',
  error: '#ef4444',
  /** Carmesí / crimson — danger actions, delete, destructive (opaco) */
  danger: '#b91c3c',
  warning: '#f59e0b',
  tabIconDefault: '#737373',
  tabIconSelected: '#fbbf24',
};

// Matchpoint uses dark theme only - both light/dark use same palette
const darkTheme = {
  ...palette,
  tint: palette.yellow,
  tabIconDefault: palette.tabIconDefault,
  tabIconSelected: palette.tabIconSelected,
};

export default {
  light: darkTheme,
  dark: darkTheme,
  ...palette,
} as const;
