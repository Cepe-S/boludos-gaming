import React, { useEffect, useMemo, useState } from 'react';
import {
  Location,
  NavigationType,
  Navigator,
  Router,
  To,
  createPath,
  parsePath,
} from 'react-router-dom';

function normalizeHashPath(to: To): string {
  const raw = typeof to === 'string' ? to : createPath(to);
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function createLocationKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

function readCurrentHashLocation(): Location {
  if (typeof window === 'undefined') {
    return { pathname: '/', search: '', hash: '', state: null, key: 'default' };
  }
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const parsed = parsePath(rawHash || '/');
  const historyState = window.history.state as { usr?: unknown; key?: string } | null;

  return {
    pathname: parsed.pathname || '/',
    search: parsed.search || '',
    hash: parsed.hash || '',
    state: historyState?.usr ?? null,
    key: historyState?.key || 'default',
  };
}

function isSameLocation(a: Location, b: Location): boolean {
  return (
    a.pathname === b.pathname &&
    a.search === b.search &&
    a.hash === b.hash &&
    a.key === b.key
  );
}

interface RouterState {
  action: NavigationType;
  location: Location;
}

/**
 * Synchronous HashRouter built on react-router-dom's `<Router>`.
 *
 * Unlike v7's built-in `<HashRouter>`, which wraps every navigation in
 * `React.startTransition` (and gets starved by continuous 60fps WebGL/Canvas
 * background animations while the URL bar has already changed), this router
 * commits route changes with urgent priority so UI transitions stay instant.
 */
export const SyncHashRouter: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<RouterState>(() => ({
    action: NavigationType.Pop,
    location: readCurrentHashLocation(),
  }));

  useEffect(() => {
    const handleExternalNavigation = () => {
      const nextLocation = readCurrentHashLocation();
      setState((prev) =>
        isSameLocation(prev.location, nextLocation)
          ? prev
          : { action: NavigationType.Pop, location: nextLocation }
      );
    };

    window.addEventListener('popstate', handleExternalNavigation);
    window.addEventListener('hashchange', handleExternalNavigation);
    return () => {
      window.removeEventListener('popstate', handleExternalNavigation);
      window.removeEventListener('hashchange', handleExternalNavigation);
    };
  }, []);

  const navigator = useMemo<Navigator>(
    () => ({
      createHref(to: To): string {
        return `#${normalizeHashPath(to)}`;
      },
      go(delta: number): void {
        window.history.go(delta);
      },
      push(to: To, usrState?: unknown): void {
        const normalized = normalizeHashPath(to);
        const parsed = parsePath(normalized);
        const key = createLocationKey();
        const nextLocation: Location = {
          pathname: parsed.pathname || '/',
          search: parsed.search || '',
          hash: parsed.hash || '',
          state: usrState ?? null,
          key,
        };
        const nextUrl = `${window.location.pathname}${window.location.search}#${normalized}`;
        window.history.pushState({ usr: usrState ?? null, key }, '', nextUrl);
        setState({ action: NavigationType.Push, location: nextLocation });
      },
      replace(to: To, usrState?: unknown): void {
        const normalized = normalizeHashPath(to);
        const parsed = parsePath(normalized);
        const key = createLocationKey();
        const nextLocation: Location = {
          pathname: parsed.pathname || '/',
          search: parsed.search || '',
          hash: parsed.hash || '',
          state: usrState ?? null,
          key,
        };
        const nextUrl = `${window.location.pathname}${window.location.search}#${normalized}`;
        window.history.replaceState({ usr: usrState ?? null, key }, '', nextUrl);
        setState({ action: NavigationType.Replace, location: nextLocation });
      },
    }),
    []
  );

  return (
    <Router
      location={state.location}
      navigationType={state.action}
      navigator={navigator}
    >
      {children}
    </Router>
  );
};
