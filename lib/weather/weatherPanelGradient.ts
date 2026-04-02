/**
 * Full-bleed gradients for the feed weather panel, keyed like `weatherCodeToSkyKey`.
 * Evokes sky/conditions without bundling photo assets (swap to ImageBackground + assets if you prefer photos).
 */
export function getWeatherPanelGradient(skyKey: string, isDay: boolean): string[] {
  const key = skyKey || 'unknown';

  const day: Record<string, string[]> = {
    clear: ['#1d4ed8', '#38bdf8', '#7dd3fc'],
    mainlyClear: ['#2563eb', '#60a5fa', '#93c5fd'],
    partlyCloudy: ['#4a5d78', '#6b8299', '#9eb4c8'],
    overcast: ['#3f4f5c', '#5c6b78', '#7a8794'],
    fog: ['#6b6560', '#8a8580', '#a8a39e'],
    drizzle: ['#3d4f63', '#5a6f82'],
    rain: ['#2c3e50', '#3d5266', '#546e7a'],
    snow: ['#7c8ea3', '#a8b8c8', '#dce4ec'],
    showers: ['#2f4052', '#4a5f73'],
    snowShowers: ['#5c6e82', '#8fa0b2'],
    thunderstorm: ['#312e81', '#4338ca', '#5b21b6'],
    unknown: ['#3d3d3d', '#525252'],
  };

  const night: Record<string, string[]> = {
    clear: ['#0c1929', '#132a52', '#1e3a8a'],
    mainlyClear: ['#0f172a', '#1e293b', '#334155'],
    partlyCloudy: ['#0f172a', '#1a2332', '#2d3b4d'],
    overcast: ['#111827', '#1f2937', '#374151'],
    fog: ['#1c1917', '#292524', '#44403c'],
    drizzle: ['#0f172a', '#273549'],
    rain: ['#0a0f14', '#1e293b', '#334155'],
    snow: ['#1e293b', '#334155', '#475569'],
    showers: ['#0f172a', '#1e2a3a'],
    snowShowers: ['#1a2332', '#2d3b4d'],
    thunderstorm: ['#0c0a18', '#1e1b4b', '#312e81'],
    unknown: ['#1a1a1a', '#2d2d2d'],
  };

  const table = isDay ? day : night;
  return table[key] ?? table.unknown;
}

export function getWeatherPanelScrimColor(isDay: boolean): string {
  return isDay ? 'rgba(15, 23, 42, 0.38)' : 'rgba(10, 12, 18, 0.58)';
}

/** `sun` + `cloud` are used together for composite partly-clear / partly-cloudy glyphs (single-color icons can’t split fills). */
export type WeatherPanelIconColors = {
  glyph: string;
  wind: string;
  sun?: string;
  cloud?: string;
};

/**
 * Icon tints that read clearly on the gradient + scrim and match each condition’s palette.
 */
export function getWeatherPanelIconColors(skyKey: string, isDay: boolean): WeatherPanelIconColors {
  const key = skyKey || 'unknown';

  const day: Record<string, WeatherPanelIconColors> = {
    clear: { glyph: '#fef08a', wind: '#fde047' },
    mainlyClear: {
      glyph: '#e0f2fe',
      wind: '#bae6fd',
      sun: '#fde047',
      cloud: '#cbd5e1',
    },
    partlyCloudy: {
      glyph: '#f1f5f9',
      wind: '#cbd5e1',
      sun: '#fef08a',
      cloud: '#e2e8f0',
    },
    overcast: { glyph: '#e2e8f0', wind: '#94a3b8' },
    fog: { glyph: '#f5f5f4', wind: '#d6d3d1' },
    drizzle: { glyph: '#bfdbfe', wind: '#93c5fd' },
    rain: { glyph: '#7dd3fc', wind: '#38bdf8' },
    snow: { glyph: '#ffffff', wind: '#e2e8f0' },
    showers: { glyph: '#7dd3fc', wind: '#38bdf8' },
    snowShowers: { glyph: '#f1f5f9', wind: '#cbd5e1' },
    thunderstorm: { glyph: '#e9d5ff', wind: '#c4b5fd' },
    unknown: { glyph: '#e5e5e5', wind: '#a3a3a3' },
  };

  const night: Record<string, WeatherPanelIconColors> = {
    clear: { glyph: '#fde68a', wind: '#fcd34d' },
    mainlyClear: {
      glyph: '#cbd5e1',
      wind: '#94a3b8',
      sun: '#fde68a',
      cloud: '#94a3b8',
    },
    partlyCloudy: {
      glyph: '#cbd5e1',
      wind: '#94a3b8',
      sun: '#fde68a',
      cloud: '#a8b4c4',
    },
    overcast: { glyph: '#d1d5db', wind: '#9ca3af' },
    fog: { glyph: '#d6d3d1', wind: '#a8a29e' },
    drizzle: { glyph: '#93c5fd', wind: '#60a5fa' },
    rain: { glyph: '#7dd3fc', wind: '#38bdf8' },
    snow: { glyph: '#f1f5f9', wind: '#cbd5e1' },
    showers: { glyph: '#7dd3fc', wind: '#38bdf8' },
    snowShowers: { glyph: '#cbd5e1', wind: '#94a3b8' },
    thunderstorm: { glyph: '#ddd6fe', wind: '#a78bfa' },
    unknown: { glyph: '#d4d4d4', wind: '#a3a3a3' },
  };

  const table = isDay ? day : night;
  return table[key] ?? table.unknown;
}
