import { AppTab } from '@/lib/routes';

type ModuleLoader = () => Promise<unknown>;

/**
 * Centralized dynamic loaders for lazy-loaded views and modals.
 * Sharing the exact loader functions guarantees Vite/Rollup emits stable chunks
 * and allows prefetching on hover/focus or idle without duplicate downloads.
 */
export const routeLoaders = {
  sessions: () => import('@/components/SessionsView'),
  recommendations: () => import('@/components/RecommendationsView'),
  games: () => import('@/components/GamesCatalogView'),
  lol: () => import('@/components/LeagueOfLegendsView'),
  tribunal: () => import('@/components/LeaderboardSanctionsView'),
  groups: () => import('@/components/GroupsView'),
  discord: () => import('@/components/DiscordIntegrationModal'),
  chat: () => import('@/components/GlobalChatDrawer'),
  notifications: () => import('@/components/NotificationCenterModal'),
  onboarding: () => import('@/components/OnboardingTourModal'),
  schedule: () => import('@/components/WeeklyScheduleModal'),
  welcome: () => import('@/components/WelcomeAuthView'),
} as const satisfies Record<string, ModuleLoader>;

export type PrefetchTarget = keyof typeof routeLoaders;

const prefetched = new Set<PrefetchTarget>();

export function prefetchRouteModule(target: PrefetchTarget): void {
  if (prefetched.has(target)) return;
  prefetched.add(target);
  routeLoaders[target]().catch(() => {
    prefetched.delete(target);
  });
}

export function prefetchTabRoute(tab: AppTab): void {
  prefetchRouteModule(tab);
}

/**
 * Warms up core navigation chunks quietly during browser idle time
 * after the initial view has already painted.
 */
export function scheduleIdleRoutePrefetch(excludeTab?: AppTab): () => void {
  if (typeof window === 'undefined') return () => {};

  const targets: PrefetchTarget[] = [
    'sessions',
    'games',
    'recommendations',
    'groups',
    'tribunal',
    'lol',
  ].filter((t): t is PrefetchTarget => t !== excludeTab);

  let cancelled = false;
  const timers: number[] = [];

  const runNext = (index: number) => {
    if (cancelled || index >= targets.length) return;
    const target = targets[index];

    const trigger = () => {
      if (cancelled) return;
      prefetchRouteModule(target);
      const t = window.setTimeout(() => runNext(index + 1), 350);
      timers.push(t);
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleWindow.requestIdleCallback(trigger, { timeout: 2500 });
    } else {
      const t = globalThis.setTimeout(trigger, 600) as unknown as number;
      timers.push(t);
    }
  };

  const initialTimer = window.setTimeout(() => runNext(0), 1400);
  timers.push(initialTimer);

  return () => {
    cancelled = true;
    for (const id of timers) {
      window.clearTimeout(id);
    }
  };
}
