import { useMemo } from 'react';
import Colors from '@/constants/Colors';
import { DEFAULT_THEME_PRESET_ID, THEME_PRESETS, type ThemePresetId, type ThemeTokens } from './colors';
import { useThemeStore } from '@/store/useThemeStore';

/**
 * Theme hook that keeps current dark UI but makes accent tokens dynamic.
 * It also exposes two text color patterns (light vs dark) for rare light backgrounds.
 */
export function useTheme(): {
  presetId: ThemePresetId;
  presetLabel: string;
  tokens: ThemeTokens & {
    // Keep existing base tokens from Colors for compatibility in old code.
    legacy: typeof Colors;
  };
} {
  const presetId = useThemeStore((s) => s.presetId) ?? DEFAULT_THEME_PRESET_ID;

  return useMemo(() => {
    const preset = THEME_PRESETS[presetId] ?? THEME_PRESETS[DEFAULT_THEME_PRESET_ID];
    return {
      presetId: preset.id,
      presetLabel: preset.label,
      tokens: {
        ...preset.tokens,
        legacy: Colors,
      },
    };
  }, [presetId]);
}

