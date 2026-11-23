export type AppTab =
  | 'sessions'
  | 'recommendations'
  | 'lol'
  | 'groups'
  | 'games'
  | 'tribunal'
  | 'discord';

export type SessionSubTab = 'session' | 'games' | 'recommendations';
export type SessionModalKind = 'create' | 'instant' | 'invites' | 'callout';
export type GroupSubTab = 'members' | 'games' | 'discord' | 'sessions' | 'settings';
export type CatalogSubTab = 'profiler' | 'catalog';
export type GlobalOverlayKind = 'chat' | 'notifications' | 'discord' | 'schedule' | 'tour';
export type NotificationSubTab = 'feed' | 'install';
export type ScheduleSubTab = 'routine' | 'exceptions';
export type TourStepParam = 1 | 2 | 3;

export const POST_AUTH_REDIRECT_STORAGE_KEY = 'bg_post_auth_redirect';

export const ROUTES = {
  ROOT: '/',
  LOGIN: '/login',
  INVITE: '/invite/:code',
  SESSIONS: '/sessions',
  SESSION_DETAIL: '/sessions/:sessionId',
  RECOMMENDATIONS: '/recommendations',
  GAMES: '/games',
  LOL: '/lol',
  TRIBUNAL: '/tribunal',
  GROUPS: '/groups',
  GROUP_DETAIL: '/groups/:groupId',
  GROUP_SUBTAB: '/groups/:groupId/:subTab',
  DISCORD: '/discord',
} as const;

export const VALID_SESSION_SUBTABS: readonly SessionSubTab[] = [
  'session',
  'games',
  'recommendations',
];

export const VALID_SESSION_MODALS: readonly SessionModalKind[] = [
  'create',
  'instant',
  'invites',
  'callout',
];

export const VALID_GROUP_SUBTABS: readonly GroupSubTab[] = [
  'members',
  'games',
  'discord',
  'sessions',
  'settings',
];

export const VALID_CATALOG_SUBTABS: readonly CatalogSubTab[] = ['profiler', 'catalog'];

export const VALID_GLOBAL_OVERLAYS: readonly GlobalOverlayKind[] = [
  'chat',
  'notifications',
  'discord',
  'schedule',
  'tour',
];

export const TAB_PATHS: Record<AppTab, string> = {
  sessions: ROUTES.SESSIONS,
  recommendations: ROUTES.RECOMMENDATIONS,
  lol: ROUTES.LOL,
  games: ROUTES.GAMES,
  tribunal: ROUTES.TRIBUNAL,
  groups: ROUTES.GROUPS,
  discord: ROUTES.DISCORD,
};

export const TAB_TITLES: Record<AppTab, string> = {
  sessions: 'Sesiones & Ruleta',
  recommendations: 'Recomendaciones',
  lol: 'League of Legends',
  games: 'Catálogo & ADN',
  tribunal: 'Tribunal del Humo',
  groups: 'Grupos & Discord',
  discord: 'Discord',
};

export function getPathForTab(tab: AppTab): string {
  return TAB_PATHS[tab] ?? ROUTES.SESSIONS;
}

export function getTabFromPathname(pathname: string): AppTab {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/sessions' || normalized.startsWith('/sessions/')) return 'sessions';
  if (normalized === '/recommendations' || normalized.startsWith('/recommendations/')) {
    return 'recommendations';
  }
  if (normalized === '/lol' || normalized.startsWith('/lol/')) return 'lol';
  if (normalized === '/games' || normalized.startsWith('/games/')) return 'games';
  if (normalized === '/tribunal' || normalized.startsWith('/tribunal/')) return 'tribunal';
  if (normalized === '/groups' || normalized.startsWith('/groups/')) return 'groups';
  if (normalized === '/discord' || normalized.startsWith('/discord/')) return 'discord';
  return 'sessions';
}

export function getDocumentTitleForPath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === ROUTES.LOGIN) {
    return 'Iniciar sesión — Boludos Gaming';
  }
  if (normalized.startsWith('/invite/')) {
    return 'Invitación a grupo — Boludos Gaming';
  }
  const tab = getTabFromPathname(normalized);
  return `${TAB_TITLES[tab]} — Boludos Gaming`;
}

export function isValidSessionSubTab(value: string | null | undefined): value is SessionSubTab {
  return Boolean(value && (VALID_SESSION_SUBTABS as readonly string[]).includes(value));
}

export function isValidSessionModal(value: string | null | undefined): value is SessionModalKind {
  return Boolean(value && (VALID_SESSION_MODALS as readonly string[]).includes(value));
}

export function isValidGroupSubTab(value: string | null | undefined): value is GroupSubTab {
  return Boolean(value && (VALID_GROUP_SUBTABS as readonly string[]).includes(value));
}

export function isValidCatalogSubTab(value: string | null | undefined): value is CatalogSubTab {
  return Boolean(value && (VALID_CATALOG_SUBTABS as readonly string[]).includes(value));
}

export function isValidGlobalOverlay(value: string | null | undefined): value is GlobalOverlayKind {
  return Boolean(value && (VALID_GLOBAL_OVERLAYS as readonly string[]).includes(value));
}

export function buildSessionPath(
  sessionId?: string | null,
  options?: { tab?: SessionSubTab; modal?: SessionModalKind }
): string {
  const base = sessionId ? `${ROUTES.SESSIONS}/${encodeURIComponent(sessionId)}` : ROUTES.SESSIONS;
  const params = new URLSearchParams();
  if (options?.tab && options.tab !== 'session') {
    params.set('tab', options.tab);
  }
  if (options?.modal) {
    params.set('modal', options.modal);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function buildGroupPath(groupId?: string | null, subTab?: GroupSubTab): string {
  if (!groupId) return ROUTES.GROUPS;
  const encodedGroupId = encodeURIComponent(groupId);
  if (subTab && subTab !== 'members') {
    return `${ROUTES.GROUPS}/${encodedGroupId}/${subTab}`;
  }
  return `${ROUTES.GROUPS}/${encodedGroupId}/members`;
}

export function buildGamesPath(tab?: CatalogSubTab): string {
  if (!tab) return ROUTES.GAMES;
  return `${ROUTES.GAMES}?tab=${tab}`;
}

export function buildInvitePath(code: string): string {
  return `/invite/${encodeURIComponent(code.trim().toUpperCase())}`;
}

/**
 * Ensures post-auth redirect targets stay strictly inside the app and never loop to /login.
 */
export function sanitizeRedirectPath(raw: string | null | undefined): string {
  if (!raw) return ROUTES.SESSIONS;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return ROUTES.SESSIONS;
  }
  const pathOnly = trimmed.split('?')[0].split('#')[0];
  if (pathOnly === ROUTES.LOGIN || pathOnly === ROUTES.ROOT) {
    return ROUTES.SESSIONS;
  }
  return trimmed;
}

/**
 * Maps legacy fragment shortcuts (e.g. `#new-session`, `#roulette`, `#tribunal`)
 * to canonical HashRouter paths before React mounts.
 */
export function resolveLegacyHashToRoute(hash: string): string | null {
  const normalized = hash.trim().toLowerCase();
  if (!normalized || normalized.startsWith('#/')) return null;

  switch (normalized) {
    case '#new-session':
      return '#/sessions?modal=create';
    case '#roulette':
      return '#/sessions';
    case '#tribunal':
      return '#/tribunal';
    case '#groups':
      return '#/groups';
    case '#games':
      return '#/games';
    case '#lol':
      return '#/lol';
    case '#recommendations':
      return '#/recommendations';
    case '#discord':
      return '#/discord';
    default:
      return null;
  }
}

export function normalizeLegacyHashLocation(): void {
  if (typeof window === 'undefined') return;
  const mapped = resolveLegacyHashToRoute(window.location.hash);
  if (mapped) {
    const nextUrl = `${window.location.pathname}${window.location.search}${mapped}`;
    window.history.replaceState(null, '', nextUrl);
  }
}

export function savePostAuthRedirect(target: string): void {
  if (typeof window === 'undefined') return;
  const safe = sanitizeRedirectPath(target);
  if (safe === ROUTES.SESSIONS) return;
  try {
    window.sessionStorage.setItem(POST_AUTH_REDIRECT_STORAGE_KEY, safe);
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function consumePostAuthRedirect(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.sessionStorage.getItem(POST_AUTH_REDIRECT_STORAGE_KEY);
    if (stored) {
      window.sessionStorage.removeItem(POST_AUTH_REDIRECT_STORAGE_KEY);
      return sanitizeRedirectPath(stored);
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function buildLoginRedirectPath(fromPath: string): string {
  const safe = sanitizeRedirectPath(fromPath);
  if (safe === ROUTES.SESSIONS) {
    return ROUTES.LOGIN;
  }
  return `${ROUTES.LOGIN}?redirect=${encodeURIComponent(safe)}`;
}
