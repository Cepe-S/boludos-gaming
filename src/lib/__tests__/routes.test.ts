import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  buildGamesPath,
  buildGroupPath,
  buildInvitePath,
  buildLoginRedirectPath,
  buildSessionPath,
  getDocumentTitleForPath,
  getPathForTab,
  getTabFromPathname,
  isValidCatalogSubTab,
  isValidGlobalOverlay,
  isValidGroupSubTab,
  isValidSessionModal,
  isValidSessionSubTab,
  resolveLegacyHashToRoute,
  sanitizeRedirectPath,
} from '@/lib/routes';
import { extractInviteCodeFromInput } from '@/context/app/storageAndHelpers';

describe('routes helpers', () => {
  it('maps pathnames (including nested entity routes) to the right AppTab', () => {
    expect(getTabFromPathname('/')).toBe('sessions');
    expect(getTabFromPathname('/sessions')).toBe('sessions');
    expect(getTabFromPathname('/sessions/sess-42')).toBe('sessions');
    expect(getTabFromPathname('/recommendations')).toBe('recommendations');
    expect(getTabFromPathname('/games')).toBe('games');
    expect(getTabFromPathname('/lol')).toBe('lol');
    expect(getTabFromPathname('/tribunal/')).toBe('tribunal');
    expect(getTabFromPathname('/groups')).toBe('groups');
    expect(getTabFromPathname('/groups/g-1/discord')).toBe('groups');
    expect(getTabFromPathname('/groups/g-1/settings')).toBe('groups');
    expect(getTabFromPathname('/discord')).toBe('discord');
    expect(getTabFromPathname('/unknown-path')).toBe('sessions');
  });

  it('builds canonical paths for tabs, sessions, groups, games, and invites', () => {
    expect(getPathForTab('sessions')).toBe(ROUTES.SESSIONS);
    expect(getPathForTab('tribunal')).toBe(ROUTES.TRIBUNAL);
    expect(getPathForTab('lol')).toBe(ROUTES.LOL);

    expect(buildSessionPath()).toBe('/sessions');
    expect(buildSessionPath('s-1')).toBe('/sessions/s-1');
    expect(buildSessionPath('s-1', { tab: 'session' })).toBe('/sessions/s-1');
    expect(buildSessionPath('s-1', { tab: 'games' })).toBe('/sessions/s-1?tab=games');
    expect(buildSessionPath(undefined, { modal: 'create' })).toBe('/sessions?modal=create');

    expect(buildGroupPath()).toBe('/groups');
    expect(buildGroupPath('group-1')).toBe('/groups/group-1/members');
    expect(buildGroupPath('group-1', 'discord')).toBe('/groups/group-1/discord');
    expect(buildGroupPath('group-1', 'settings')).toBe('/groups/group-1/settings');

    expect(buildGamesPath()).toBe('/games');
    expect(buildGamesPath('profiler')).toBe('/games?tab=profiler');
    expect(buildInvitePath('bg-42ab')).toBe('/invite/BG-42AB');
  });

  it('computes document titles per route', () => {
    expect(getDocumentTitleForPath('/login')).toBe('Iniciar sesión — Boludos Gaming');
    expect(getDocumentTitleForPath('/invite/BG-1234')).toBe('Invitación a grupo — Boludos Gaming');
    expect(getDocumentTitleForPath('/tribunal')).toBe('Tribunal del Humo — Boludos Gaming');
    expect(getDocumentTitleForPath('/lol')).toBe('League of Legends — Boludos Gaming');
    expect(getDocumentTitleForPath('/groups/g1/games')).toBe('Grupos & Discord — Boludos Gaming');
  });

  it('sanitizes post-auth redirect paths and prevents open redirects or login loops', () => {
    expect(sanitizeRedirectPath(null)).toBe('/sessions');
    expect(sanitizeRedirectPath('')).toBe('/sessions');
    expect(sanitizeRedirectPath('/')).toBe('/sessions');
    expect(sanitizeRedirectPath('/login')).toBe('/sessions');
    expect(sanitizeRedirectPath('/login?redirect=/tribunal')).toBe('/sessions');
    expect(sanitizeRedirectPath('https://evil.example/phish')).toBe('/sessions');
    expect(sanitizeRedirectPath('//evil.example/phish')).toBe('/sessions');
    expect(sanitizeRedirectPath('/tribunal?sort=punctuality')).toBe('/tribunal?sort=punctuality');
    expect(sanitizeRedirectPath('/groups/g1/discord')).toBe('/groups/g1/discord');

    expect(buildLoginRedirectPath('/sessions')).toBe('/login');
    expect(buildLoginRedirectPath('/lol?mode=group')).toBe('/login?redirect=%2Flol%3Fmode%3Dgroup');
  });

  it('validates route param enums strictly', () => {
    expect(isValidSessionSubTab('games')).toBe(true);
    expect(isValidSessionSubTab('invalid')).toBe(false);
    expect(isValidSessionModal('create')).toBe(true);
    expect(isValidSessionModal('evil')).toBe(false);
    expect(isValidGroupSubTab('settings')).toBe(true);
    expect(isValidGroupSubTab('other')).toBe(false);
    expect(isValidCatalogSubTab('profiler')).toBe(true);
    expect(isValidCatalogSubTab('none')).toBe(false);
    expect(isValidGlobalOverlay('schedule')).toBe(true);
    expect(isValidGlobalOverlay('unknown')).toBe(false);
  });

  it('maps legacy PWA fragment hashes to canonical HashRouter URLs', () => {
    expect(resolveLegacyHashToRoute('#new-session')).toBe('#/sessions?modal=create');
    expect(resolveLegacyHashToRoute('#roulette')).toBe('#/sessions');
    expect(resolveLegacyHashToRoute('#tribunal')).toBe('#/tribunal');
    expect(resolveLegacyHashToRoute('#/sessions')).toBeNull();
    expect(resolveLegacyHashToRoute('')).toBeNull();
  });

  it('extracts group invite codes from query params, hash routes, and raw strings', () => {
    expect(extractInviteCodeFromInput('bg-1234')).toBe('BG-1234');
    expect(extractInviteCodeFromInput('https://boludos.test/app/?invite=bg-5678')).toBe('BG-5678');
    expect(extractInviteCodeFromInput('https://boludos.test/app/#/invite/bg-90ab')).toBe('BG-90AB');
    expect(extractInviteCodeFromInput('#/invite/bg-cdef')).toBe('BG-CDEF');
    expect(extractInviteCodeFromInput('https://boludos.test/app/#/login?invite=bg-7777')).toBe(
      'BG-7777'
    );
  });
});
