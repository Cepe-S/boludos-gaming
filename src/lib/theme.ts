export type ThemePaletteId =
  | 'discord-blurple'
  | 'emerald-tactical'
  | 'crimson-esports'
  | 'amber-arcade'
  | 'aldosivi';

export interface ThemePaletteOption {
  id: ThemePaletteId;
  label: string;
  swatch: string;
  colors: string[];
  meshColors?: [string, string, string, string];
}

export const THEME_STORAGE_KEY = 'boludos_theme_palette';

export const THEME_PALETTES: ThemePaletteOption[] = [
  {
    id: 'discord-blurple',
    label: 'Blurple',
    swatch: '#5865F2',
    colors: ['#0B0D10', '#11141A', '#232834', '#5865F2', '#F2F3F5'],
  },
  {
    id: 'emerald-tactical',
    label: 'Tactical',
    swatch: '#1BC785',
    colors: ['#0A100E', '#121C18', '#253630', '#1BC785', '#F2F3F5'],
  },
  {
    id: 'crimson-esports',
    label: 'Crimson',
    swatch: '#ED2E54',
    colors: ['#0B0B0F', '#13131A', '#282835', '#ED2E54', '#F2F3F5'],
  },
  {
    id: 'amber-arcade',
    label: 'Arcade',
    swatch: '#F98B10',
    colors: ['#120E0B', '#1E1813', '#3B3026', '#F98B10', '#F2F3F5'],
  },
  {
    id: 'aldosivi',
    label: 'Aldosivi',
    swatch: '#1E8449',
    colors: ['#031A11', '#005C3A', '#1E8449', '#FFFFFF', '#DA291C'],
    meshColors: ['#031A11', '#005C3A', '#1E8449', '#0A3B27'],
  },
];

export function getStoredTheme(): ThemePaletteId {
  if (typeof window === 'undefined') return 'discord-blurple';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemePaletteId | null;
  return THEME_PALETTES.some((p) => p.id === stored) ? (stored as ThemePaletteId) : 'discord-blurple';
}

export function applyTheme(themeId: ThemePaletteId): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (themeId === 'discord-blurple') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', themeId);
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {
    // Ignore storage quota errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('boludos-theme-change', { detail: themeId }));
  }
}

export function initTheme(): ThemePaletteId {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}
