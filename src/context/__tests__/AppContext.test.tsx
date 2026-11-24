import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContextValue } from '../../types/context';
import type {
  Game,
  GamingGroup,
  GamingSession,
  PlayerProfile,
  PlayerSteamProfile,
  UnifiedSelectorGame,
  UserGamePreference,
} from '../../types/domain';
import { INITIAL_DISCORD_CONFIG, INITIAL_GAMES } from '../../lib/mockData';
import { createDefaultWeeklySchedule } from '../../lib/matchmakingEngine';

// ---------------------------------------------------------------------------
// Minimal typed browser/DOM harness for React 19 createRoot in Vitest (node)
// ---------------------------------------------------------------------------

interface BroadcastRecord {
  channel: string;
  data: unknown;
}

type BroadcastListener = (event: MessageEvent) => void;

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  static posted: BroadcastRecord[] = [];

  readonly name: string;
  private listeners = new Set<BroadcastListener>();

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    MockBroadcastChannel.posted.push({ channel: this.name, data });
  }

  addEventListener(type: string, listener: BroadcastListener): void {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: BroadcastListener): void {
    if (type === 'message') {
      this.listeners.delete(listener);
    }
  }

  emitIncoming(data: unknown): void {
    const event = { data } as MessageEvent;
    this.listeners.forEach((listener) => listener(event));
  }

  close(): void {
    this.listeners.clear();
  }

  static reset(): void {
    MockBroadcastChannel.instances = [];
    MockBroadcastChannel.posted = [];
  }
}

function createMockStorage(): Storage {
  const store = new Map<string, string>();

  const target: Record<string, unknown> = {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  };

  return new Proxy(target, {
    ownKeys(): ArrayLike<string | symbol> {
      return Array.from(store.keys());
    },
    getOwnPropertyDescriptor(_t, prop: string | symbol): PropertyDescriptor | undefined {
      if (typeof prop === 'string' && store.has(prop)) {
        return {
          enumerable: true,
          configurable: true,
          value: store.get(prop),
        };
      }
      return Object.getOwnPropertyDescriptor(target, prop);
    },
    get(_t, prop: string | symbol): unknown {
      if (prop in target) {
        const val = target[prop as string];
        return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(target) : val;
      }
      if (typeof prop === 'string' && store.has(prop)) {
        return store.get(prop);
      }
      return undefined;
    },
  }) as unknown as Storage;
}

interface FakeNode {
  nodeType: number;
  nodeName: string;
  tagName?: string;
  ownerDocument: FakeDocument | null;
  parentNode: FakeNode | null;
  childNodes: FakeNode[];
  firstChild: FakeNode | null;
  lastChild: FakeNode | null;
  nextSibling: FakeNode | null;
  previousSibling: FakeNode | null;
  textContent: string;
  appendChild: (child: FakeNode) => FakeNode;
  removeChild: (child: FakeNode) => FakeNode;
  insertBefore: (child: FakeNode, before: FakeNode | null) => FakeNode;
  addEventListener: () => void;
  removeEventListener: () => void;
}

interface FakeDocument extends FakeNode {
  defaultView: unknown;
  activeElement: FakeNode | null;
  body: FakeNode;
  documentElement: FakeNode;
  createElement: (tag: string) => FakeNode;
  createTextNode: (text: string) => FakeNode;
  createComment: (text: string) => FakeNode;
  createDocumentFragment: () => FakeNode;
}

class StubNode {
  static readonly ELEMENT_NODE = 1;
  static readonly TEXT_NODE = 3;
  static readonly COMMENT_NODE = 8;
  static readonly DOCUMENT_NODE = 9;
}
class StubElement extends StubNode {}
class StubHTMLElement extends StubElement {}
class StubHTMLIFrameElement extends StubHTMLElement {}
class StubShadowRoot {}

function makeFakeNode(
  nodeType: number,
  nodeName: string,
  ownerDocument: FakeDocument | null,
  tagName?: string
): FakeNode {
  const node: FakeNode = {
    nodeType,
    nodeName,
    tagName,
    ownerDocument,
    parentNode: null,
    childNodes: [],
    firstChild: null,
    lastChild: null,
    nextSibling: null,
    previousSibling: null,
    textContent: '',
    appendChild(child: FakeNode): FakeNode {
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      const prev = node.childNodes[node.childNodes.length - 1] ?? null;
      if (prev) prev.nextSibling = child;
      child.previousSibling = prev;
      child.nextSibling = null;
      child.parentNode = node;
      node.childNodes.push(child);
      node.firstChild = node.childNodes[0] ?? null;
      node.lastChild = node.childNodes[node.childNodes.length - 1] ?? null;
      return child;
    },
    removeChild(child: FakeNode): FakeNode {
      const idx = node.childNodes.indexOf(child);
      if (idx >= 0) {
        node.childNodes.splice(idx, 1);
        const prev = node.childNodes[idx - 1] ?? null;
        const next = node.childNodes[idx] ?? null;
        if (prev) prev.nextSibling = next;
        if (next) next.previousSibling = prev;
        child.parentNode = null;
        child.previousSibling = null;
        child.nextSibling = null;
        node.firstChild = node.childNodes[0] ?? null;
        node.lastChild = node.childNodes[node.childNodes.length - 1] ?? null;
      }
      return child;
    },
    insertBefore(child: FakeNode, before: FakeNode | null): FakeNode {
      if (!before) return node.appendChild(child);
      const idx = node.childNodes.indexOf(before);
      if (idx < 0) return node.appendChild(child);
      if (child.parentNode) child.parentNode.removeChild(child);
      node.childNodes.splice(idx, 0, child);
      child.parentNode = node;
      node.childNodes.forEach((c, i) => {
        c.previousSibling = node.childNodes[i - 1] ?? null;
        c.nextSibling = node.childNodes[i + 1] ?? null;
      });
      node.firstChild = node.childNodes[0] ?? null;
      node.lastChild = node.childNodes[node.childNodes.length - 1] ?? null;
      return child;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return node;
}

function createFakeBrowserEnv(initialSearch = ''): {
  storage: Storage;
  container: HTMLElement;
  setSearch: (search: string) => void;
} {
  const storage = createMockStorage();
  const locationObj = {
    origin: 'https://boludos.test',
    pathname: '/app/',
    search: initialSearch,
    protocol: 'https:',
    href: `https://boludos.test/app/${initialSearch}`,
  };

  const doc = makeFakeNode(9, '#document', null) as FakeDocument;
  doc.createElement = (tag: string) => makeFakeNode(1, tag.toUpperCase(), doc, tag.toUpperCase());
  doc.createTextNode = (text: string) => {
    const n = makeFakeNode(3, '#text', doc);
    n.textContent = text;
    return n;
  };
  doc.createComment = (text: string) => {
    const n = makeFakeNode(8, '#comment', doc);
    n.textContent = text;
    return n;
  };
  doc.createDocumentFragment = () => makeFakeNode(11, '#document-fragment', doc);
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  doc.activeElement = null;

  const fakeWindow = {
    document: doc,
    localStorage: storage,
    location: locationObj,
    history: {
      replaceState: (_data: unknown, _unused: string, url?: string | URL | null) => {
        if (typeof url === 'string') {
          const idx = url.indexOf('?');
          locationObj.search = idx >= 0 ? url.slice(idx) : '';
          locationObj.href = url;
        }
      },
    },
    BroadcastChannel: MockBroadcastChannel,
    Node: StubNode,
    Element: StubElement,
    HTMLElement: StubHTMLElement,
    HTMLIFrameElement: StubHTMLIFrameElement,
    ShadowRoot: StubShadowRoot,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  doc.defaultView = fakeWindow;

  const g = globalThis as unknown as Record<string, unknown>;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.window = fakeWindow;
  g.document = doc;
  g.localStorage = storage;
  g.BroadcastChannel = MockBroadcastChannel;
  g.Node = StubNode;
  g.Element = StubElement;
  g.HTMLElement = StubHTMLElement;
  g.HTMLIFrameElement = StubHTMLIFrameElement;
  g.ShadowRoot = StubShadowRoot;

  const container = doc.createElement('div') as unknown as HTMLElement;

  return {
    storage,
    container,
    setSearch(search: string) {
      locationObj.search = search;
      locationObj.href = `https://boludos.test/app/${search}`;
    },
  };
}

// ---------------------------------------------------------------------------
// Module mocks: isolate Local/Demo mode without live Supabase/Discord network
// ---------------------------------------------------------------------------

const dispatchDiscordWebhookMock = vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; error?: string }>>(
  async () => ({ ok: true })
);
const showNativeNotificationMock = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
const playNotificationSoundMock = vi.fn();
const requestBrowserNotificationPermissionMock = vi.fn<() => Promise<NotificationPermission | 'unsupported'>>(
  async () => 'granted'
);

vi.mock('../../lib/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: () => false,
  isDiscordOAuthProviderEnabled: async () => false,
}));

vi.mock('../../lib/supabaseSync', () => ({
  dbAddGameToGroup: vi.fn(async () => {}),
  dbAddMemberToGroup: vi.fn(async () => {}),
  dbCastGroupRecommendationVote: vi.fn(async () => {}),
  dbCreateSession: vi.fn(async () => {}),
  dbDeleteGroup: vi.fn(async () => {}),
  dbDeleteParticipant: vi.fn(async () => {}),
  dbDeleteSession: vi.fn(async () => {}),
  dbInsertChatMessage: vi.fn(async () => {}),
  dbInsertGame: vi.fn(async () => {}),
  dbInsertSanction: vi.fn(async () => {}),
  dbRemoveGameFromGroup: vi.fn(async () => {}),
  dbRemoveMemberFromGroup: vi.fn(async () => {}),
  dbUpdateChatReactions: vi.fn(async () => {}),
  dbUpdateDiscordConfig: vi.fn(async () => {}),
  dbUpdateSessionGame: vi.fn(async () => {}),
  dbUpdateSessionInvitesAndCallouts: vi.fn(async () => {}),
  dbUpsertAttendanceVote: vi.fn(async () => {}),
  dbUpsertGroup: vi.fn(async () => {}),
  dbUpsertInstantRsvp: vi.fn(async () => {}),
  dbUpsertParticipant: vi.fn(async () => {}),
  dbUpsertPreference: vi.fn(async () => {}),
  dbUpsertProfile: vi.fn(async () => {}),
  fetchAllSupabaseData: vi.fn(async () => null),
  subscribeToSupabaseRealtime: vi.fn(() => () => {}),
}));

vi.mock('../../lib/discordService', async () => {
  const actual = await vi.importActual<typeof import('../../lib/discordService')>(
    '../../lib/discordService'
  );
  return {
    ...actual,
    dispatchDiscordWebhook: (...args: unknown[]) => dispatchDiscordWebhookMock(...args),
  };
});

vi.mock('../../lib/pushService', () => ({
  getNotificationPermission: () => 'default' as NotificationPermission,
  playNotificationSound: (...args: unknown[]) => playNotificationSoundMock(...args),
  registerServiceWorker: vi.fn(async () => null),
  requestBrowserNotificationPermission: () => requestBrowserNotificationPermissionMock(),
  showNativeNotification: (...args: unknown[]) => showNativeNotificationMock(...args),
}));

// Initialize browser env BEFORE importing AppContext so module-level storage reset guard runs cleanly
const initialEnv = createFakeBrowserEnv();
initialEnv.storage.setItem('bg_prod_v4_reset_gen_1', '1');

const { AppProvider, useApp } = await import('../AppContext');

// ---------------------------------------------------------------------------
// Storage keys mirrored from AppContext for persistence & hydration assertions
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  RESET_GEN_1: 'bg_prod_v4_reset_gen_1',
  CURRENT_USER_ID: 'bg_prod_v4_current_user_id',
  IS_AUTHENTICATED: 'bg_prod_v4_is_authenticated',
  PLAYERS: 'bg_prod_v4_players',
  GAMES: 'bg_prod_v4_games',
  PREFERENCES: 'bg_prod_v4_preferences',
  SESSIONS: 'bg_prod_v4_sessions',
  ACTIVE_SESSION_ID: 'bg_prod_v4_active_session_id',
  SANCTIONS: 'bg_prod_v4_sanctions',
  CHAT_MESSAGES: 'bg_prod_v4_chat_messages',
  DISCORD_CONFIG: 'bg_prod_v4_discord_config',
  DISCORD_LOGS: 'bg_prod_v4_discord_logs',
  PUSH_ALERTS: 'bg_prod_v4_push_alerts',
  GROUPS: 'bg_prod_v4_groups',
  ACTIVE_GROUP_ID: 'bg_prod_v4_active_group_id',
  PENDING_INVITE_CODE: 'bg_prod_v4_pending_invite_code',
} as const;

// ---------------------------------------------------------------------------
// Test helper: mount AppProvider & read latest AppContextValue
// ---------------------------------------------------------------------------

interface MountedApp {
  getCtx: () => AppContextValue;
  storage: Storage;
  setSearch: (search: string) => void;
  unmount: () => void;
}

const activeRoots: Root[] = [];

function mountApp(options?: {
  seedStorage?: Record<string, unknown>;
  search?: string;
}): MountedApp {
  const env = createFakeBrowserEnv(options?.search ?? '');
  env.storage.setItem(STORAGE_KEYS.RESET_GEN_1, '1');

  if (options?.seedStorage) {
    Object.entries(options.seedStorage).forEach(([key, val]) => {
      env.storage.setItem(key, JSON.stringify(val));
    });
  }

  let latestCtx: AppContextValue | null = null;

  const Probe: React.FC = () => {
    latestCtx = useApp();
    return null;
  };

  const root = createRoot(env.container);
  activeRoots.push(root);

  act(() => {
    root.render(
      <AppProvider>
        <Probe />
      </AppProvider>
    );
  });

  if (!latestCtx) {
    throw new Error('AppProvider did not populate context value on initial render');
  }

  return {
    getCtx: () => {
      if (!latestCtx) {
        throw new Error('Context value unavailable');
      }
      return latestCtx;
    },
    storage: env.storage,
    setSearch: env.setSearch,
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

function makePlayer(overrides: Partial<PlayerProfile> & { id: string; displayName: string }): PlayerProfile {
  return {
    discordId: `discord-${overrides.id}`,
    discordUsername: overrides.displayName.toLowerCase().replace(/\s+/g, '_'),
    avatarUrl: `https://example.com/${overrides.id}.png`,
    karmaScore: 100,
    sessionsPlayed: 0,
    hoursPlayed: 0,
    onTimeCount: 0,
    lateCount: 0,
    noShowCount: 0,
    currentStreak: 0,
    activeTitle: '⌚ Reloj Suizo',
    onboardingCompleted: true,
    weeklySchedule: createDefaultWeeklySchedule(),
    dailyOverrides: {},
    ...overrides,
  };
}

function makeGroup(overrides: Partial<GamingGroup> & { id: string; name: string; inviteCode: string }): GamingGroup {
  const now = new Date().toISOString();
  return {
    description: '',
    createdBy: 'u1',
    memberIds: ['u1'],
    adminIds: ['u1'],
    gameIds: [INITIAL_GAMES[0].id],
    discordConfig: {
      enabled: true,
      webhookUrl: '',
      channelName: 'general',
      guildName: 'Boludos',
      mentionRoleId: '',
      useEveryoneMention: false,
    },
    recommendationVotes: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Regression Suite for src/context/AppContext.tsx
// ---------------------------------------------------------------------------

describe('AppContext public contract & regression suite', () => {
  beforeEach(() => {
    MockBroadcastChannel.reset();
    dispatchDiscordWebhookMock.mockClear();
    showNativeNotificationMock.mockClear();
    playNotificationSoundMock.mockClear();
    requestBrowserNotificationPermissionMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    while (activeRoots.length > 0) {
      const root = activeRoots.pop();
      if (root) {
        act(() => {
          root.unmount();
        });
      }
    }
  });

  // -------------------------------------------------------------------------
  // 1. Public Exports & Context Contract
  // -------------------------------------------------------------------------

  describe('public exports and context contract', () => {
    it('throws a clear error when useApp is called outside AppProvider', () => {
      const env = createFakeBrowserEnv();
      const root = createRoot(env.container);
      activeRoots.push(root);

      let caughtError: unknown = null;
      const BrokenConsumer: React.FC = () => {
        try {
          useApp();
        } catch (err) {
          caughtError = err;
        }
        return null;
      };

      act(() => {
        root.render(<BrokenConsumer />);
      });

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toBe('useApp must be used within an AppProvider');
    });

    it('exposes every property and action defined in AppContextValue', () => {
      const { getCtx } = mountApp();
      const ctx = getCtx();

      const expectedFunctions: Array<keyof AppContextValue> = [
        'setShowOnboardingModal',
        'setShowWeeklyScheduleModal',
        'createAndLoginProfile',
        'logout',
        'loginWithDiscord',
        'updateUserProfile',
        'completeOnboarding',
        'updateWeeklySchedule',
        'setDailyOverride',
        'toggleTodayNotPlaying',
        'updateCategoryPreferences',
        'updateGamePreference',
        'addGame',
        'importSteamProfile',
        'updateSteamGameFeedback',
        'updatePlayerTasteProfile',
        'syncSteamGamesToCatalog',
        'setUnifiedGameFeedback',
        'syncUnifiedGameToCatalog',
        'setActiveGroupId',
        'createGroup',
        'updateGroup',
        'deleteGroup',
        'joinGroupByInviteCode',
        'addMemberToGroup',
        'removeMemberFromGroup',
        'addGameToGroup',
        'removeGameFromGroup',
        'addAndLinkGameToGroup',
        'testGroupDiscordWebhook',
        'getGroupInviteLink',
        'voteGroupRecommendation',
        'setActiveSessionId',
        'createSession',
        'createInstantSession',
        'deleteSession',
        'respondToInstantSession',
        'joinOrUpdateSessionSchedule',
        'confirmSessionAttendance',
        'sendSessionCallout',
        'updateSessionInvites',
        'leaveSession',
        'spinSessionRoulette',
        'lockSessionGame',
        'selectSessionGame',
        'checkInToSession',
        'castAttendanceVote',
        'issueDirectSanction',
        'pingLatePlayer',
        'sendChatMessage',
        'toggleMessageReaction',
        'updateDiscordConfig',
        'toggleDiscordEvent',
        'sendTestDiscordNotification',
        'triggerDiscordButtonInteraction',
        'requestPushPermission',
        'sendTestPushNotification',
        'resetDemoData',
      ];

      for (const fnKey of expectedFunctions) {
        expect(typeof ctx[fnKey]).toBe('function');
      }

      expect(ctx.isSupabaseConnected).toBe(false);
      expect(ctx.isAuthenticated).toBe(false);
      expect(ctx.currentUser.displayName).toBe('Invitado');
      expect(ctx.games.length).toBe(INITIAL_GAMES.length);
      expect(ctx.players).toEqual([]);
      expect(ctx.groups).toEqual([]);
      expect(ctx.sessions).toEqual([]);
      expect(ctx.sanctions).toEqual([]);
      expect(ctx.chatMessages).toEqual([]);
      expect(ctx.discordConfig.channelName).toBe(INITIAL_DISCORD_CONFIG.channelName);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Hydration & localStorage Persistence
  // -------------------------------------------------------------------------

  describe('localStorage hydration, URL invite parsing and persistence', () => {
    it('hydrates full state from localStorage and sanitizes legacy sessions without groupId', () => {
      const p1 = makePlayer({ id: 'u1', displayName: 'Santi' });
      const group = makeGroup({ id: 'group-boludos-og', name: 'OG Squad', inviteCode: 'BG-OG01', memberIds: ['u1'] });
      const legacySession: Omit<GamingSession, 'groupId'> & { groupId?: string } = {
        id: 'sess-legacy',
        title: 'Legacy Night',
        date: '2026-11-22',
        mode: 'fixed',
        status: 'open',
        createdBy: 'u1',
        createdAt: '2026-11-22T20:00:00.000Z',
        allowSplitLobbies: false,
        participants: [],
        attendanceVotes: [],
      };
      const pref: UserGamePreference = {
        userId: 'u1',
        gameId: INITIAL_GAMES[0].id,
        plays: true,
        rating: 5,
      };

      const { getCtx } = mountApp({
        seedStorage: {
          [STORAGE_KEYS.PLAYERS]: [p1],
          [STORAGE_KEYS.CURRENT_USER_ID]: 'u1',
          [STORAGE_KEYS.IS_AUTHENTICATED]: true,
          [STORAGE_KEYS.GROUPS]: [group],
          [STORAGE_KEYS.ACTIVE_GROUP_ID]: group.id,
          [STORAGE_KEYS.SESSIONS]: [legacySession],
          [STORAGE_KEYS.PREFERENCES]: [pref],
        },
      });

      const ctx = getCtx();
      expect(ctx.isAuthenticated).toBe(true);
      expect(ctx.currentUser.id).toBe('u1');
      expect(ctx.activeGroupId).toBe('group-boludos-og');
      expect(ctx.sessions).toHaveLength(1);
      expect(ctx.sessions[0].groupId).toBe('group-boludos-og');
      expect(ctx.preferences).toHaveLength(1);
      expect(ctx.preferences[0].rating).toBe(5);
    });

    it('forces isAuthenticated to false if stored currentUserId is missing from players', () => {
      const { getCtx } = mountApp({
        seedStorage: {
          [STORAGE_KEYS.PLAYERS]: [],
          [STORAGE_KEYS.CURRENT_USER_ID]: 'ghost-user',
          [STORAGE_KEYS.IS_AUTHENTICATED]: true,
        },
      });

      expect(getCtx().isAuthenticated).toBe(false);
    });

    it('parses ?invite= from URL, normalizes uppercase, and auto-joins once authenticated', () => {
      const owner = makePlayer({ id: 'owner-1', displayName: 'Owner' });
      const group = makeGroup({
        id: 'g-invite',
        name: 'Squad Invitado',
        inviteCode: 'BG-JOIN',
        createdBy: 'owner-1',
        memberIds: ['owner-1'],
        adminIds: ['owner-1'],
      });

      const { getCtx, storage } = mountApp({
        search: '?invite=bg-join',
        seedStorage: {
          [STORAGE_KEYS.PLAYERS]: [owner],
          [STORAGE_KEYS.GROUPS]: [group],
        },
      });

      expect(getCtx().pendingInviteCode).toBe('BG-JOIN');
      expect(getCtx().pendingInviteGroup?.id).toBe('g-invite');

      act(() => {
        getCtx().createAndLoginProfile({
          displayName: 'NuevoPlayer',
          discordUsername: 'nuevo_player',
          discordId: '999888',
        });
      });

      const ctx = getCtx();
      expect(ctx.pendingInviteCode).toBeNull();
      expect(ctx.activeGroupId).toBe('g-invite');
      expect(ctx.userGroups.map((g) => g.id)).toContain('g-invite');
      expect(storage.getItem(STORAGE_KEYS.PENDING_INVITE_CODE)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Auth, Profile, Onboarding & Schedules
  // -------------------------------------------------------------------------

  describe('auth, player profile, onboarding and schedule overrides', () => {
    it('creates and logs in a profile, blocks duplicate hijacking, updates profile, completes onboarding and logs out', () => {
      const { getCtx, storage } = mountApp();

      let created: PlayerProfile | undefined;
      act(() => {
        created = getCtx().createAndLoginProfile({
          displayName: '  Tincho  ',
          discordUsername: '@TinchoGG',
          discordId: '123456',
        });
      });

      expect(created?.id).toBe('user-123456');
      expect(created?.displayName).toBe('Tincho');
      expect(created?.discordUsername).toBe('TinchoGG');
      expect(created?.karmaScore).toBe(100);
      expect(getCtx().isAuthenticated).toBe(true);
      expect(getCtx().showOnboardingModal).toBe(true);

      // Duplicate Discord username must throw (anti-hijack)
      expect(() => {
        getCtx().createAndLoginProfile({
          displayName: 'Otro Nombre',
          discordUsername: 'tinchogg',
        });
      }).toThrow(/ya está registrado/i);

      // Update profile fields
      act(() => {
        getCtx().updateUserProfile({
          displayName: 'Tincho Pro',
          bio: 'Main soporte',
          birthDate: '1998-05-10',
        });
      });
      expect(getCtx().currentUser.displayName).toBe('Tincho Pro');
      expect(getCtx().currentUser.bio).toBe('Main soporte');
      expect(getCtx().currentUser.birthDate).toBe('1998-05-10');

      // Complete onboarding
      act(() => {
        getCtx().completeOnboarding();
      });
      expect(getCtx().currentUser.onboardingCompleted).toBe(true);
      expect(getCtx().showOnboardingModal).toBe(false);

      // Verify persistence in localStorage
      const storedPlayers = JSON.parse(storage.getItem(STORAGE_KEYS.PLAYERS) || '[]') as PlayerProfile[];
      expect(storedPlayers).toHaveLength(1);
      expect(storedPlayers[0].displayName).toBe('Tincho Pro');
      expect(storedPlayers[0].onboardingCompleted).toBe(true);

      // Logout keeps stored player but sets isAuthenticated = false
      act(() => {
        getCtx().logout();
      });
      expect(getCtx().isAuthenticated).toBe(false);
    });

    it('updates weekly schedule, daily overrides, Hoy No Juego toggle and category preferences', () => {
      const { getCtx } = mountApp();

      act(() => {
        getCtx().createAndLoginProfile({ displayName: 'Fede', discordUsername: 'fede' });
      });
      act(() => {
        getCtx().createGroup({ name: 'Los Pibes' });
      });

      const customSchedule = createDefaultWeeklySchedule();
      customSchedule.mon = {
        enabled: true,
        availableFrom: '20:30',
        availableUntil: '23:30',
        precisionMinutes: 15,
      };
      act(() => {
        getCtx().updateWeeklySchedule(customSchedule);
      });
      expect(getCtx().currentUser.weeklySchedule?.mon.availableFrom).toBe('20:30');

      // Set and clear daily override
      act(() => {
        getCtx().setDailyOverride('2026-12-01', {
          status: 'playing',
          availableFrom: '21:00',
          availableUntil: '00:00',
          precisionMinutes: 30,
          reason: 'Turno tarde',
        });
      });
      expect(getCtx().currentUser.dailyOverrides?.['2026-12-01']?.availableFrom).toBe('21:00');

      act(() => {
        getCtx().setDailyOverride('2026-12-01', null);
      });
      expect(getCtx().currentUser.dailyOverrides?.['2026-12-01']).toBeUndefined();

      // Toggle Hoy No Juego ON -> creates not_playing override, preserves karma, logs Discord & push
      const todayStr = new Date().toISOString().split('T')[0];
      act(() => {
        getCtx().toggleTodayNotPlaying('Asado familiar');
      });
      expect(getCtx().currentUser.dailyOverrides?.[todayStr]?.status).toBe('not_playing');
      expect(getCtx().currentUser.karmaScore).toBe(100);
      expect(getCtx().discordLogs.length).toBeGreaterThanOrEqual(1);
      expect(getCtx().pushAlerts.length).toBeGreaterThanOrEqual(1);

      // Toggle Hoy No Juego OFF -> clears override
      act(() => {
        getCtx().toggleTodayNotPlaying();
      });
      expect(getCtx().currentUser.dailyOverrides?.[todayStr]).toBeUndefined();

      // Category preferences recompute tasteProfile
      act(() => {
        getCtx().updateCategoryPreferences({
          'Shooter Táctico': 'like',
          MOBA: 'dislike',
        });
      });
      expect(getCtx().currentUser.categoryPreferences?.['Shooter Táctico']).toBe('like');
      expect(getCtx().currentUser.tasteProfile).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Groups, Active Group Switching, Invites & Visibility Scoping
  // -------------------------------------------------------------------------

  describe('gaming groups, active group switching and visibility scoping', () => {
    it('creates, switches, updates, invites, links games, votes recommendations and deletes groups', () => {
      const otherPlayer = makePlayer({ id: 'u2', displayName: 'Mati' });
      const outsider = makePlayer({ id: 'u-outsider', displayName: 'Externo' });
      const { getCtx } = mountApp({
        seedStorage: {
          [STORAGE_KEYS.PLAYERS]: [otherPlayer, outsider],
        },
      });

      act(() => {
        getCtx().createAndLoginProfile({ displayName: 'Santi', discordUsername: 'santi' });
      });

      let g1!: GamingGroup;
      let g2!: GamingGroup;
      act(() => {
        g1 = getCtx().createGroup({ name: 'Grupo Alfa', description: 'CS y Valorant' });
      });
      act(() => {
        g2 = getCtx().createGroup({ name: 'Grupo Beta', description: 'Co-op' });
      });

      expect(g1.inviteCode).toMatch(/^BG-/);
      expect(getCtx().activeGroupId).toBe(g2.id);
      expect(getCtx().activeGroup?.name).toBe('Grupo Beta');
      expect(getCtx().getGroupInviteLink(g1.inviteCode)).toBe(
        `https://boludos.test/app/?invite=${encodeURIComponent(g1.inviteCode)}`
      );

      // Switch active group
      act(() => {
        getCtx().setActiveGroupId(g1.id);
      });
      expect(getCtx().activeGroupId).toBe(g1.id);
      expect(getCtx().activeGroup?.name).toBe('Grupo Alfa');

      // Update group partially preserving discordConfig fields
      act(() => {
        getCtx().updateGroup(g1.id, {
          name: 'Grupo Alfa Prime',
          discordConfig: { channelName: 'cs2-ranked' } as GamingGroup['discordConfig'],
        });
      });
      expect(getCtx().activeGroup?.name).toBe('Grupo Alfa Prime');
      expect(getCtx().activeGroup?.discordConfig.channelName).toBe('cs2-ranked');

      // Visibility scoping: before adding u2, only currentUser is visible (u2 and outsider are hidden)
      expect(getCtx().players.map((p) => p.id)).toEqual([getCtx().currentUser.id]);

      // Add u2 to g1 -> now u2 becomes visible, outsider stays hidden
      act(() => {
        getCtx().addMemberToGroup(g1.id, 'u2');
      });
      expect(getCtx().players.map((p) => p.id).sort()).toEqual([getCtx().currentUser.id, 'u2'].sort());

      // Join by full invite URL for another user
      let joinResult!: { ok: boolean; group?: GamingGroup; error?: string };
      act(() => {
        joinResult = getCtx().joinGroupByInviteCode(
          `https://boludos.test/app/?invite=${g2.inviteCode.toLowerCase()}`,
          'u2'
        );
      });
      expect(joinResult.ok).toBe(true);
      expect(joinResult.group?.memberIds).toContain('u2');

      // Invalid invite code returns error cleanly
      const invalidJoin = getCtx().joinGroupByInviteCode('BG-NOPE');
      expect(invalidJoin.ok).toBe(false);
      expect(invalidJoin.error).toBeTruthy();

      // Add & link games without duplicating existing catalog game
      const firstCatalogGame = INITIAL_GAMES[0];
      let linkedExisting!: Game;
      act(() => {
        linkedExisting = getCtx().addAndLinkGameToGroup(g1.id, {
          name: firstCatalogGame.name,
          category: firstCatalogGame.category,
          minPlayers: firstCatalogGame.minPlayers,
          maxPlayers: firstCatalogGame.maxPlayers,
          coverUrl: firstCatalogGame.coverUrl,
          tags: firstCatalogGame.tags,
          averageDurationMins: firstCatalogGame.averageDurationMins,
        });
      });
      expect(linkedExisting.id).toBe(firstCatalogGame.id);
      expect(getCtx().groups.find((g) => g.id === g1.id)?.gameIds).toContain(firstCatalogGame.id);

      // Recommendation voting (set and clear)
      act(() => {
        getCtx().voteGroupRecommendation(g1.id, 'rec-hades', 'up', 'Hades II');
      });
      expect(
        getCtx().groups.find((g) => g.id === g1.id)?.recommendationVotes?.['rec-hades']?.[
          getCtx().currentUser.id
        ]
      ).toBe('up');

      act(() => {
        getCtx().voteGroupRecommendation(g1.id, 'rec-hades', null);
      });
      expect(
        getCtx().groups.find((g) => g.id === g1.id)?.recommendationVotes?.['rec-hades']?.[
          getCtx().currentUser.id
        ]
      ).toBeUndefined();

      // Remove game and member
      act(() => {
        getCtx().removeGameFromGroup(g1.id, firstCatalogGame.id);
        getCtx().removeMemberFromGroup(g1.id, 'u2');
      });
      expect(getCtx().groups.find((g) => g.id === g1.id)?.gameIds).not.toContain(firstCatalogGame.id);
      expect(getCtx().groups.find((g) => g.id === g1.id)?.memberIds).not.toContain('u2');

      // Delete active group falls back to remaining userGroup
      act(() => {
        getCtx().setActiveGroupId(g2.id);
      });
      act(() => {
        getCtx().deleteGroup(g2.id);
      });
      expect(getCtx().groups.map((g) => g.id)).toEqual([g1.id]);
      expect(getCtx().activeGroupId).toBe(g1.id);
    });

    it('manages group admin roles, game idempotency, group session cleanup on delete, and group Discord webhook testing', async () => {
      const memberB = makePlayer({ id: 'u2', displayName: 'Mati' });
      const { getCtx } = mountApp({
        seedStorage: {
          [STORAGE_KEYS.PLAYERS]: [memberB],
        },
      });

      // Unauthenticated invite join fails cleanly
      const unauthJoin = getCtx().joinGroupByInviteCode('BG-TEST');
      expect(unauthJoin.ok).toBe(false);
      expect(unauthJoin.error).toBeTruthy();

      act(() => {
        getCtx().createAndLoginProfile({ displayName: 'Santi', discordUsername: 'santi' });
      });

      let g1!: GamingGroup;
      let g2!: GamingGroup;
      act(() => {
        g1 = getCtx().createGroup({ name: 'Grupo Principal' });
      });
      act(() => {
        g2 = getCtx().createGroup({ name: 'Grupo Secundario' });
      });

      // Add member and promote to admin, then demote, then remove as admin
      act(() => {
        getCtx().addMemberToGroup(g1.id, 'u2');
      });
      act(() => {
        getCtx().updateGroup(g1.id, {
          adminIds: [getCtx().currentUser.id, 'u2'],
        });
      });
      expect(getCtx().groups.find((g) => g.id === g1.id)?.adminIds).toEqual([
        getCtx().currentUser.id,
        'u2',
      ]);

      // Demote admin via updateGroup
      act(() => {
        getCtx().updateGroup(g1.id, {
          adminIds: [getCtx().currentUser.id],
        });
      });
      expect(getCtx().groups.find((g) => g.id === g1.id)?.adminIds).toEqual([
        getCtx().currentUser.id,
      ]);

      // Re-promote and verify removeMemberFromGroup strips from both memberIds and adminIds
      act(() => {
        getCtx().updateGroup(g1.id, {
          adminIds: [getCtx().currentUser.id, 'u2'],
        });
      });
      act(() => {
        getCtx().removeMemberFromGroup(g1.id, 'u2');
      });
      const updatedG1 = getCtx().groups.find((g) => g.id === g1.id)!;
      expect(updatedG1.memberIds).not.toContain('u2');
      expect(updatedG1.adminIds).not.toContain('u2');

      // addGameToGroup is idempotent and removeGameFromGroup is safe
      const gameId = INITIAL_GAMES[0].id;
      act(() => {
        getCtx().addGameToGroup(g1.id, gameId);
        getCtx().addGameToGroup(g1.id, gameId);
      });
      expect(
        getCtx().groups.find((g) => g.id === g1.id)?.gameIds.filter((id) => id === gameId)
      ).toHaveLength(1);

      act(() => {
        getCtx().removeGameFromGroup(g1.id, gameId);
      });
      act(() => {
        getCtx().removeGameFromGroup(g1.id, 'non-existent-game');
      });
      expect(getCtx().groups.find((g) => g.id === g1.id)?.gameIds).toEqual([]);

      // Group Discord webhook validation + successful dispatch + failure logging
      let webhookRes!: { ok: boolean; error?: string };
      await act(async () => {
        webhookRes = await getCtx().testGroupDiscordWebhook('missing-group');
      });
      expect(webhookRes).toEqual({ ok: false, error: 'Grupo no encontrado' });

      await act(async () => {
        webhookRes = await getCtx().testGroupDiscordWebhook(g1.id);
      });
      expect(webhookRes.ok).toBe(false);
      expect(webhookRes.error).toContain('Webhook');

      const webhookUrl = 'https://discord.com/api/webhooks/123456/abcdef';
      act(() => {
        getCtx().updateGroup(g1.id, {
          discordConfig: {
            enabled: true,
            webhookUrl,
            channelName: 'grupo-principal',
            guildName: 'Boludos Server',
            mentionRoleId: '999888',
            useEveryoneMention: true,
          },
        });
      });

      const logsBefore = getCtx().discordLogs.length;
      await act(async () => {
        webhookRes = await getCtx().testGroupDiscordWebhook(g1.id);
      });
      expect(webhookRes).toEqual({ ok: true });
      expect(dispatchDiscordWebhookMock).toHaveBeenCalledTimes(1);
      expect(dispatchDiscordWebhookMock.mock.calls[0][0]).toBe(webhookUrl);
      expect(getCtx().discordLogs.length).toBe(logsBefore + 1);
      expect(getCtx().discordLogs[0].groupId).toBe(g1.id);
      expect(getCtx().discordLogs[0].deliveredToWebhook).toBe(true);

      dispatchDiscordWebhookMock.mockResolvedValueOnce({ ok: false, error: 'HTTP 404' });
      await act(async () => {
        webhookRes = await getCtx().testGroupDiscordWebhook(g1.id);
      });
      expect(webhookRes).toEqual({ ok: false, error: 'HTTP 404' });
      expect(getCtx().discordLogs[0].deliveredToWebhook).toBe(false);
      expect(getCtx().discordLogs[0].webhookError).toBe('HTTP 404');

      // Deleting a group also removes sessions scoped to that group while keeping others
      let monotonicNow = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => ++monotonicNow);
      let sessG1!: GamingSession;
      let sessG2!: GamingSession;
      try {
        act(() => {
          sessG1 = getCtx().createSession({
            title: 'Session G1',
            date: '2026-11-24',
            mode: 'random',
            allowSplitLobbies: false,
            availableFrom: '21:00',
            availableUntil: '23:00',
            precisionMinutes: 15,
            groupId: g1.id,
          });
          sessG2 = getCtx().createSession({
            title: 'Session G2',
            date: '2026-11-24',
            mode: 'random',
            allowSplitLobbies: false,
            availableFrom: '21:00',
            availableUntil: '23:00',
            precisionMinutes: 15,
            groupId: g2.id,
          });
        });
      } finally {
        nowSpy.mockRestore();
      }
      expect(getCtx().sessions.map((s) => s.id)).toContain(sessG1.id);
      expect(getCtx().sessions.map((s) => s.id)).toContain(sessG2.id);

      act(() => {
        getCtx().deleteGroup(g2.id);
      });
      expect(getCtx().sessions.map((s) => s.id)).toContain(sessG1.id);
      expect(getCtx().sessions.map((s) => s.id)).not.toContain(sessG2.id);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Games Catalog & Ratings (1-5 stars)
  // -------------------------------------------------------------------------

  describe('games catalog, ratings and taste profile updates', () => {
    it('adds a custom game with default 4-star preference and updates ratings with persistence', () => {
      const { getCtx, storage } = mountApp();

      act(() => {
        getCtx().createAndLoginProfile({ displayName: 'Lucho', discordUsername: 'lucho' });
      });

      const initialGameCount = getCtx().games.length;
      let customGame!: Game;
      act(() => {
        customGame = getCtx().addGame({
          name: 'Deep Rock Galactic',
          category: 'Co-op Acción',
          minPlayers: 1,
          maxPlayers: 4,
          coverUrl: 'https://example.com/drg.jpg',
          tags: ['co-op', 'fps', 'mining'],
          averageDurationMins: 40,
        });
      });

      expect(getCtx().games.length).toBe(initialGameCount + 1);
      expect(customGame.addedBy).toBe(getCtx().currentUser.id);
      const defaultPref = getCtx().preferences.find(
        (p) => p.gameId === customGame.id && p.userId === getCtx().currentUser.id
      );
      expect(defaultPref).toMatchObject({ plays: true, rating: 4 });

      // Update rating to 5 with hours played
      act(() => {
        getCtx().updateGamePreference(customGame.id, true, 5, 140, 12);
      });
      const updatedPref = getCtx().preferences.find((p) => p.gameId === customGame.id);
      expect(updatedPref?.rating).toBe(5);
      expect(updatedPref?.hoursPlayed).toBe(140);
      expect(updatedPref?.recentHoursPlayed).toBe(12);

      // Update explicit taste profile patch
      act(() => {
        getCtx().updatePlayerTasteProfile({
          topMultiplayerGames: [
            {
              rank: 1,
              gameId: customGame.id,
              name: 'Deep Rock Galactic',
              coverUrl: customGame.coverUrl,
              category: customGame.category,
              tags: customGame.tags,
              minPlayers: customGame.minPlayers,
              maxPlayers: customGame.maxPlayers,
              isMultiplayer: true,
              source: 'catalog',
              hoursPlayed: 140,
            },
          ],
        });
      });
      expect(getCtx().currentUser.tasteProfile?.topMultiplayerGames[0]?.name).toBe(
        'Deep Rock Galactic'
      );

      // Persisted to localStorage
      const savedPrefs = JSON.parse(storage.getItem(STORAGE_KEYS.PREFERENCES) || '[]') as UserGamePreference[];
      expect(savedPrefs.some((p) => p.gameId === customGame.id && p.rating === 5)).toBe(true);
    });

    it('updates Steam feedback, syncs Steam/unified games to catalog, and strips non-game apps on mount', () => {
      const steamProfile: PlayerSteamProfile = {
        steamId64: '76561198000000001',
        profileUrl: 'https://steamcommunity.com/profiles/76561198000000001',
        personaName: 'SteamGamer',
        avatarUrl: 'https://example.com/steam.png',
        lastSyncedAt: '2026-11-22T12:00:00.000Z',
        totalHours: 500,
        considerableGamesCount: 2,
        ownedGames: [
          {
            appId: 431960, // Wallpaper Engine (non-game utility -> must be auto-stripped)
            name: 'Wallpaper Engine',
            playtimeHours: 300,
            playtimeRecentHours: 10,
            headerImageUrl: 'https://example.com/we.jpg',
            genres: ['Utilities'],
            tags: ['Utilities'],
            isMultiplayer: false,
            minPlayers: 1,
            maxPlayers: 1,
            suggestedRating: 4,
          },
          {
            appId: 548430,
            name: 'Deep Rock Galactic',
            playtimeHours: 200,
            playtimeRecentHours: 15,
            headerImageUrl: 'https://example.com/drg.jpg',
            genres: ['Action', 'Co-op'],
            tags: ['Co-op', 'FPS'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 4,
            suggestedRating: 5,
          },
        ],
      };

      const p1 = makePlayer({
        id: 'u1',
        displayName: 'SteamGamer',
        steamProfile,
      });

      const { getCtx } = mountApp({
        seedStorage: {
          [STORAGE_KEYS.PLAYERS]: [p1],
          [STORAGE_KEYS.CURRENT_USER_ID]: 'u1',
          [STORAGE_KEYS.IS_AUTHENTICATED]: true,
        },
      });

      // Auto-sanitization effect strips Wallpaper Engine on load
      expect(
        getCtx().currentUser.steamProfile?.ownedGames.some((g) => g.appId === 431960)
      ).toBe(false);
      expect(
        getCtx().currentUser.steamProfile?.ownedGames.some((g) => g.appId === 548430)
      ).toBe(true);

      // Update Steam game feedback & sync Steam game to catalog
      act(() => {
        getCtx().updateSteamGameFeedback(548430, {
          userRating: 5,
          burnedOut: false,
          selectedForCatalog: true,
        });
      });
      const updatedSteamGame = getCtx().currentUser.steamProfile?.ownedGames.find(
        (g) => g.appId === 548430
      );
      expect(updatedSteamGame?.userRating).toBe(5);
      expect(updatedSteamGame?.selectedForCatalog).toBe(true);

      act(() => {
        getCtx().syncSteamGamesToCatalog([548430]);
      });
      expect(getCtx().games.some((g) => g.tags.includes('steam:548430'))).toBe(true);

      // Unified game selector feedback + sync to catalog for a brand-new external game
      const unifiedExternal: UnifiedSelectorGame = {
        key: 'ext:ror2',
        name: 'Risk of Rain 2',
        coverUrl: 'https://example.com/ror2.jpg',
        category: 'Co-op Acción',
        tags: ['co-op', 'roguelike'],
        genres: ['Action'],
        minPlayers: 1,
        maxPlayers: 4,
        isMultiplayer: true,
        platform: 'Steam',
        source: 'external_rated',
        steamAppId: 632360,
        ownedOnSteam: false,
        playtimeHours: 45,
        playtimeRecentHours: 6,
        isPlayedOrRatedByUser: true,
        effectiveRating: 5,
        hasExplicitUserRating: true,
        burnedOut: false,
        inClubCatalog: false,
        tasteAffinityPct: 92,
        likelihoodScore: 88,
        likelihoodBadge: 'Alta',
      };

      let syncedGame: Game | null = null;
      act(() => {
        getCtx().setUnifiedGameFeedback(unifiedExternal, {
          plays: true,
          rating: 5,
          hoursPlayed: 50,
        });
      });
      act(() => {
        syncedGame = getCtx().syncUnifiedGameToCatalog(unifiedExternal);
      });
      expect(syncedGame).not.toBeNull();
      expect(syncedGame!.id).toBe('game-steam-632360');
      expect(getCtx().games.some((g) => g.id === 'game-steam-632360')).toBe(true);
      expect(
        getCtx().preferences.some(
          (p) => p.gameId === 'game-steam-632360' && p.userId === 'u1' && p.rating === 5
        )
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Sessions, Instant RSVP, Schedule Precision, Roulette & Callouts
  // -------------------------------------------------------------------------

  describe('sessions lifecycle, instant RSVP, roulette and callouts', () => {
    it('creates session, manages participants/precision/invites, locks/selects games, spins roulette and deletes', async () => {
      const p2 = makePlayer({ id: 'u2', displayName: 'Rami' });
      const { getCtx } = mountApp({
        seedStorage: {
          [STORAGE_KEYS.PLAYERS]: [p2],
        },
      });

      act(() => {
        getCtx().createAndLoginProfile({ displayName: 'Santi', discordUsername: 'santi' });
      });
      let group!: GamingGroup;
      act(() => {
        group = getCtx().createGroup({ name: 'Ranked Squad', memberIds: ['u2'] });
      });

      const gameA = INITIAL_GAMES[0];
      const gameB = INITIAL_GAMES[1];
      act(() => {
        getCtx().addGameToGroup(group.id, gameA.id);
        getCtx().addGameToGroup(group.id, gameB.id);
        getCtx().updateGamePreference(gameA.id, true, 5);
        getCtx().updateGamePreference(gameB.id, true, 4);
      });

      // Create scheduled session
      let session!: GamingSession;
      act(() => {
        session = getCtx().createSession({
          title: 'Viernes de Tiros',
          date: '2026-11-27',
          mode: 'random',
          allowSplitLobbies: true,
          availableFrom: '22:00',
          availableUntil: '01:00',
          precisionMinutes: 15,
          groupId: group.id,
        });
      });

      expect(getCtx().activeSessionId).toBe(session.id);
      expect(getCtx().sessions.find((s) => s.id === session.id)?.participants.some((p) => p.userId === getCtx().currentUser.id)).toBe(true);

      // Second player joins with ±30m precision and confirms attendance
      act(() => {
        getCtx().joinOrUpdateSessionSchedule(session.id, {
          availableFrom: '22:15',
          availableUntil: '01:30',
          precisionMinutes: 30,
          note: 'Llego después de cenar',
          userId: 'u2',
          confirmAttendance: false,
        });
      });
      let liveSession = getCtx().sessions.find((s) => s.id === session.id)!;
      const ramiPart = liveSession.participants.find((p) => p.userId === 'u2');
      expect(ramiPart?.precisionMinutes).toBe(30);
      expect(ramiPart?.note).toBe('Llego después de cenar');

      act(() => {
        getCtx().confirmSessionAttendance(session.id, 'u2');
      });
      liveSession = getCtx().sessions.find((s) => s.id === session.id)!;
      expect(liveSession.participants.find((p) => p.userId === 'u2')?.confirmationStatus).toBe('confirmed');

      // Update invites
      act(() => {
        getCtx().updateSessionInvites(session.id, [getCtx().currentUser.id, 'u2']);
      });
      expect(getCtx().sessions.find((s) => s.id === session.id)?.invitedUserIds).toEqual([
        getCtx().currentUser.id,
        'u2',
      ]);

      // Lock games & spin roulette (onlyLocked)
      act(() => {
        getCtx().lockSessionGame(session.id, gameA.id);
        getCtx().lockSessionGame(session.id, gameB.id);
      });
      expect(getCtx().sessions.find((s) => s.id === session.id)?.selectedGameIds).toEqual([
        gameA.id,
        gameB.id,
      ]);

      let winner: Game | null = null;
      act(() => {
        winner = getCtx().spinSessionRoulette(session.id, { onlyLocked: true });
      });
      expect(winner).not.toBeNull();
      expect([gameA.id, gameB.id]).toContain(winner!.id);
      expect(getCtx().sessions.find((s) => s.id === session.id)?.rouletteWinnerGameId).toBe(winner!.id);

      // Select primary game clears rouletteWinnerGameId
      act(() => {
        getCtx().selectSessionGame(session.id, gameB.id);
      });
      liveSession = getCtx().sessions.find((s) => s.id === session.id)!;
      expect(liveSession.selectedGameId).toBe(gameB.id);
      expect(liveSession.rouletteWinnerGameId).toBeUndefined();

      // Send session callout
      let calloutResult: { notifiedUsers: PlayerProfile[] } = { notifiedUsers: [] };
      await act(async () => {
        calloutResult = await getCtx().sendSessionCallout(session.id, 'Entren al Discord!');
      });
      expect(calloutResult.notifiedUsers).toBeDefined();
      expect(getCtx().sessions.find((s) => s.id === session.id)?.callouts?.length).toBe(1);

      // Leave session & delete session
      act(() => {
        getCtx().leaveSession(session.id, 'u2');
      });
      expect(
        getCtx().sessions.find((s) => s.id === session.id)?.participants.some((p) => p.userId === 'u2')
      ).toBe(false);

      act(() => {
        getCtx().deleteSession(session.id);
      });
      expect(getCtx().sessions.some((s) => s.id === session.id)).toBe(false);
    });

    it('creates idempotent instant sessions and handles going/declined RSVPs', () => {
      const p2 = makePlayer({ id: 'u2', displayName: 'Nico' });
      const { getCtx } = mountApp({
        seedStorage: {
          [STORAGE_KEYS.PLAYERS]: [p2],
        },
      });

      act(() => {
        getCtx().createAndLoginProfile({ displayName: 'Santi', discordUsername: 'santi' });
      });
      let group!: GamingGroup;
      act(() => {
        group = getCtx().createGroup({ name: 'Express', memberIds: ['u2'] });
      });

      let instant1!: GamingSession;
      let instant2!: GamingSession;
      act(() => {
        instant1 = getCtx().createInstantSession({ groupId: group.id, startsInMinutes: 15 });
      });
      act(() => {
        // Calling again while open returns the existing instant session
        instant2 = getCtx().createInstantSession({ groupId: group.id, startsInMinutes: 30 });
      });
      expect(instant1.sessionKind).toBe('instant');
      expect(instant2.id).toBe(instant1.id);

      // Respond going
      act(() => {
        getCtx().respondToInstantSession(instant1.id, {
          status: 'going',
          etaMinutes: 10,
          durationMinutes: 120,
        });
      });
      let live = getCtx().sessions.find((s) => s.id === instant1.id)!;
      expect(live.instantRsvps?.find((r) => r.userId === getCtx().currentUser.id)?.status).toBe('going');
      expect(live.participants.some((p) => p.userId === getCtx().currentUser.id)).toBe(true);

      // Respond declined for u2
      act(() => {
        getCtx().respondToInstantSession(instant1.id, {
          status: 'declined',
          userId: 'u2',
        });
      });
      live = getCtx().sessions.find((s) => s.id === instant1.id)!;
      expect(live.instantRsvps?.find((r) => r.userId === 'u2')?.status).toBe('declined');
    });
  });

  // -------------------------------------------------------------------------
  // 7. Check-in, Karma & Tribunal del Humo
  // -------------------------------------------------------------------------

  describe('check-in evaluation, karma updates and Tribunal del Humo sanctions', () => {
    it('awards on-time check-in bonus and penalizes late check-in with sanction records', () => {
      const p1 = makePlayer({ id: 'u1', displayName: 'Puntual', karmaScore: 80 });
      const p2 = makePlayer({ id: 'u2', displayName: 'Tarde', karmaScore: 90, currentStreak: 3 });
      const group = makeGroup({ id: 'g1', name: 'Puntuales', inviteCode: 'BG-TIME', memberIds: ['u1', 'u2'] });
      const session: GamingSession = {
        id: 'sess-checkin',
        groupId: 'g1',
        title: 'Noche de Ranked',
        date: '2026-11-22',
        mode: 'fixed',
        status: 'open',
        createdBy: 'u1',
        createdAt: '2026-11-22T20:00:00.000Z',
        allowSplitLobbies: false,
        participants: [
          {
            userId: 'u1',
            availableFrom: '22:00',
            availableUntil: '01:00',
            precisionMinutes: 15,
            attendanceStatus: 'pending',
            joinedAt: '2026-11-22T20:00:00.000Z',
          },
          {
            userId: 'u2',
            availableFrom: '22:00',
            availableUntil: '01:00',
            precisionMinutes: 15,
            attendanceStatus: 'pending',
            joinedAt: '2026-11-22T20:00:00.000Z',
          },
        ],
        attendanceVotes: [],
      };

      const { getCtx } = mountApp({
        seedStorage: {
          [STORAGE_KEYS.PLAYERS]: [p1, p2],
          [STORAGE_KEYS.CURRENT_USER_ID]: 'u1',
          [STORAGE_KEYS.IS_AUTHENTICATED]: true,
          [STORAGE_KEYS.GROUPS]: [group],
          [STORAGE_KEYS.ACTIVE_GROUP_ID]: 'g1',
          [STORAGE_KEYS.SESSIONS]: [session],
        },
      });

      // On-time check-in (within ±15m of 22:00)
      act(() => {
        getCtx().checkInToSession('sess-checkin', '22:10', 'u1');
      });
      const updatedP1 = getCtx().players.find((p) => p.id === 'u1')!;
      expect(updatedP1.karmaScore).toBe(85);
      expect(updatedP1.onTimeCount).toBe(1);
      expect(updatedP1.currentStreak).toBe(1);
      expect(
        getCtx().sessions[0].participants.find((p) => p.userId === 'u1')?.attendanceStatus
      ).toBe('on_time');

      // Late check-in (+45m past 22:00 with ±15m window)
      act(() => {
        getCtx().checkInToSession('sess-checkin', '22:45', 'u2');
      });
      const updatedP2 = getCtx().players.find((p) => p.id === 'u2')!;
      expect(updatedP2.karmaScore).toBe(80);
      expect(updatedP2.lateCount).toBe(1);
      expect(updatedP2.currentStreak).toBe(0);
      expect(getCtx().sanctions).toHaveLength(2);
      expect(getCtx().sanctions.some((s) => s.userId === 'u1' && s.type === 'on_time_bonus')).toBe(true);
      expect(getCtx().sanctions.some((s) => s.userId === 'u2' && s.type === 'late')).toBe(true);
    });

    it('issues direct sanctions, triggers automatic sanction on 2 no_show votes, and pings late players', async () => {
      vi.useFakeTimers();

      const p1 = makePlayer({ id: 'u1', displayName: 'Juez1', karmaScore: 100 });
      const p2 = makePlayer({ id: 'u2', displayName: 'Fantasma', karmaScore: 100 });
      const group = makeGroup({ id: 'g1', name: 'Tribunal', inviteCode: 'BG-HUMO', memberIds: ['u1', 'u2'] });
      const session: GamingSession = {
        id: 'sess-tribunal',
        groupId: 'g1',
        title: 'Juicio del Humo',
        date: '2026-11-22',
        mode: 'fixed',
        status: 'open',
        createdBy: 'u1',
        createdAt: '2026-11-22T20:00:00.000Z',
        allowSplitLobbies: false,
        participants: [
          {
            userId: 'u1',
            availableFrom: '22:00',
            availableUntil: '01:00',
            precisionMinutes: 15,
            attendanceStatus: 'on_time',
            joinedAt: '2026-11-22T20:00:00.000Z',
          },
          {
            userId: 'u2',
            availableFrom: '22:00',
            availableUntil: '01:00',
            precisionMinutes: 15,
            attendanceStatus: 'pending',
            joinedAt: '2026-11-22T20:00:00.000Z',
          },
        ],
        // Pre-seed one vote from another voter so casting a second vote triggers auto-sanction
        attendanceVotes: [
          {
            voterId: 'u3-voter',
            targetUserId: 'u2',
            vote: 'no_show',
            reason: 'No apareció',
            timestamp: '2026-11-22T22:30:00.000Z',
          },
        ],
      };

      const { getCtx } = mountApp({
        seedStorage: {
          [STORAGE_KEYS.PLAYERS]: [p1, p2],
          [STORAGE_KEYS.CURRENT_USER_ID]: 'u1',
          [STORAGE_KEYS.IS_AUTHENTICATED]: true,
          [STORAGE_KEYS.GROUPS]: [group],
          [STORAGE_KEYS.ACTIVE_GROUP_ID]: 'g1',
          [STORAGE_KEYS.SESSIONS]: [session],
        },
      });

      // Direct late sanction (-10 karma)
      act(() => {
        getCtx().issueDirectSanction('sess-tribunal', 'u2', 'late', 'Llegó 30m tarde');
      });
      expect(getCtx().players.find((p) => p.id === 'u2')?.karmaScore).toBe(90);
      expect(getCtx().players.find((p) => p.id === 'u2')?.lateCount).toBe(1);

      // Cast 2nd no_show vote -> auto-triggers -25 karma sanction after 50ms timeout
      act(() => {
        getCtx().castAttendanceVote('sess-tribunal', 'u2', 'no_show', 'Se fue a dormir sin avisar');
      });
      expect(getCtx().sessions[0].attendanceVotes).toHaveLength(2);

      act(() => {
        vi.advanceTimersByTime(100);
      });
      const penalized = getCtx().players.find((p) => p.id === 'u2')!;
      expect(penalized.karmaScore).toBe(65);
      expect(penalized.noShowCount).toBe(1);
      expect(getCtx().sanctions.some((s) => s.type === 'no_show' && s.userId === 'u2')).toBe(true);

      // Ping late player adds Discord log and push alert
      const logsBefore = getCtx().discordLogs.length;
      const alertsBefore = getCtx().pushAlerts.length;
      await act(async () => {
        await getCtx().pingLatePlayer('sess-tribunal', 'u2');
      });
      expect(getCtx().discordLogs.length).toBeGreaterThan(logsBefore);
      expect(getCtx().pushAlerts.length).toBeGreaterThan(alertsBefore);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Chat, Discord Config/Interactions, Push, BroadcastChannel & Reset
  // -------------------------------------------------------------------------

  describe('chat, Discord interactions, push notifications, multi-tab sync and resetDemoData', () => {
    it('sends chat messages, ignores blank input, toggles reactions and forwards to Discord', () => {
      const { getCtx } = mountApp();

      act(() => {
        getCtx().createAndLoginProfile({ displayName: 'Santi', discordUsername: 'santi' });
      });
      act(() => {
        getCtx().createGroup({ name: 'Chat Squad' });
      });

      // Blank message ignored
      act(() => {
        getCtx().sendChatMessage({ content: '   ' });
      });
      expect(getCtx().chatMessages).toHaveLength(0);

      // Valid message with @todos + forwardToDiscord
      act(() => {
        getCtx().sendChatMessage({
          content: 'Sale CS2 @todos',
          forwardToDiscord: true,
        });
      });
      expect(getCtx().chatMessages).toHaveLength(1);
      const msg = getCtx().chatMessages[0];
      expect(msg.mentions).toContain('everyone');
      expect(msg.forwardedToDiscord).toBe(true);
      expect(getCtx().discordLogs.some((l) => l.eventType === 'chat_broadcast')).toBe(true);

      // Toggle reaction ON then OFF
      act(() => {
        getCtx().toggleMessageReaction(msg.id, '🔥');
      });
      expect(getCtx().chatMessages[0].reactions).toEqual([
        { emoji: '🔥', userIds: [getCtx().currentUser.id] },
      ]);

      act(() => {
        getCtx().toggleMessageReaction(msg.id, '🔥');
      });
      expect(getCtx().chatMessages[0].reactions).toEqual([]);
    });

    it('updates Discord config/events, triggers Discord button interactions and push notifications', async () => {
      const { getCtx } = mountApp();

      act(() => {
        getCtx().createAndLoginProfile({
          displayName: 'BotTester',
          discordUsername: 'bottester',
          discordId: '777777',
        });
      });
      let group!: GamingGroup;
      act(() => {
        group = getCtx().createGroup({ name: 'Discord Squad' });
        getCtx().addGameToGroup(group.id, INITIAL_GAMES[0].id);
        getCtx().updateGamePreference(INITIAL_GAMES[0].id, true, 5);
      });
      let session!: GamingSession;
      act(() => {
        session = getCtx().createSession({
          title: 'Bot Session',
          date: '2026-11-22',
          mode: 'random',
          allowSplitLobbies: false,
          availableFrom: '22:00',
          availableUntil: '01:00',
          precisionMinutes: 15,
          groupId: group.id,
        });
      });

      act(() => {
        getCtx().updateDiscordConfig({ channelName: 'bot-alerts' });
        getCtx().toggleDiscordEvent('chat_broadcast', true);
      });
      expect(getCtx().discordConfig.channelName).toBe('bot-alerts');
      expect(getCtx().discordConfig.events.chat_broadcast).toBe(true);

      // Discord button interaction: spin_roulette
      act(() => {
        getCtx().triggerDiscordButtonInteraction('spin_roulette', session.id, '777777');
      });
      expect(getCtx().sessions.find((s) => s.id === session.id)?.rouletteWinnerGameId).toBe(
        INITIAL_GAMES[0].id
      );

      // Push permission & test notification
      let perm: NotificationPermission | 'unsupported' = 'default';
      await act(async () => {
        perm = await getCtx().requestPushPermission();
      });
      expect(perm).toBe('granted');
      expect(getCtx().notificationPermission).toBe('granted');

      const alertsBefore = getCtx().pushAlerts.length;
      await act(async () => {
        await getCtx().sendTestPushNotification();
      });
      expect(getCtx().pushAlerts.length).toBe(alertsBefore + 1);
    });

    it('synchronizes state via BroadcastChannel and clears everything on resetDemoData', () => {
      const { getCtx, storage } = mountApp();

      act(() => {
        getCtx().createAndLoginProfile({ displayName: 'SyncUser', discordUsername: 'syncuser' });
      });
      let group!: GamingGroup;
      act(() => {
        group = getCtx().createGroup({ name: 'Sync Group' });
      });

      // Simulate incoming BroadcastChannel message from another tab
      const channel = MockBroadcastChannel.instances[MockBroadcastChannel.instances.length - 1];
      expect(channel).toBeDefined();
      act(() => {
        channel.emitIncoming({
          type: 'SYNC_CHAT',
          payload: [
            {
              id: 'msg-remote-1',
              groupId: group.id,
              userId: getCtx().currentUser.id,
              content: 'Mensaje desde otra pestaña',
              mentions: [],
              reactions: [],
              forwardedToDiscord: false,
              createdAt: '2026-11-22T21:00:00.000Z',
            },
          ],
        });
      });
      expect(getCtx().chatMessages).toHaveLength(1);
      expect(getCtx().chatMessages[0].id).toBe('msg-remote-1');

      // resetDemoData wipes state and restores defaults
      act(() => {
        getCtx().resetDemoData();
      });

      const ctx = getCtx();
      expect(ctx.isAuthenticated).toBe(false);
      expect(ctx.players).toEqual([]);
      expect(ctx.groups).toEqual([]);
      expect(ctx.sessions).toEqual([]);
      expect(ctx.chatMessages).toEqual([]);
      expect(ctx.sanctions).toEqual([]);
      expect(ctx.games.length).toBe(INITIAL_GAMES.length);
      expect(ctx.discordConfig.channelName).toBe(INITIAL_DISCORD_CONFIG.channelName);
      expect(JSON.parse(storage.getItem(STORAGE_KEYS.PLAYERS) || '[]')).toEqual([]);
    });
  });
});
