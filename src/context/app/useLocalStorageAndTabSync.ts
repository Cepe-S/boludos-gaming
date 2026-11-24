import { Dispatch, SetStateAction, useEffect, useRef } from 'react';
import {
  ChatMessage,
  DiscordIntegrationConfig,
  DiscordNotificationLog,
  Game,
  GamingGroup,
  GamingSession,
  PlayerProfile,
  PushNotificationAlert,
  SanctionRecord,
  UserGamePreference,
} from '../../types/domain';
import { STORAGE_KEYS, saveToStorage } from './storageAndHelpers';

export type SyncBroadcastMessage =
  | { type: 'SYNC_PLAYERS'; payload: PlayerProfile[] }
  | { type: 'SYNC_GROUPS'; payload: GamingGroup[] }
  | { type: 'SYNC_SESSIONS'; payload: GamingSession[] }
  | { type: 'SYNC_PREFERENCES'; payload: UserGamePreference[] }
  | { type: 'SYNC_SANCTIONS'; payload: SanctionRecord[] }
  | { type: 'SYNC_CHAT'; payload: ChatMessage[] }
  | { type: 'SYNC_DISCORD_LOGS'; payload: DiscordNotificationLog[] }
  | { type: 'SYNC_PUSH_ALERTS'; payload: PushNotificationAlert[] }
  | {
      type: 'SYNC_ALL';
      payload: Partial<{
        players: PlayerProfile[];
        groups: GamingGroup[];
        sessions: GamingSession[];
        preferences: UserGamePreference[];
        sanctions: SanctionRecord[];
        chatMessages: ChatMessage[];
        discordLogs: DiscordNotificationLog[];
        games: Game[];
      }>;
    };

export interface UseLocalStorageAndTabSyncParams {
  players: PlayerProfile[];
  currentUserId: string;
  isAuthenticated: boolean;
  games: Game[];
  preferences: UserGamePreference[];
  groups: GamingGroup[];
  activeGroupIdState: string | null;
  pendingInviteCode: string | null;
  sessions: GamingSession[];
  activeSessionId: string;
  sanctions: SanctionRecord[];
  chatMessages: ChatMessage[];
  discordConfig: DiscordIntegrationConfig;
  discordLogs: DiscordNotificationLog[];
  pushAlerts: PushNotificationAlert[];
  syncChannel: BroadcastChannel | null;
  setPlayers: Dispatch<SetStateAction<PlayerProfile[]>>;
  setGroups: Dispatch<SetStateAction<GamingGroup[]>>;
  setSessions: Dispatch<SetStateAction<GamingSession[]>>;
  setPreferences: Dispatch<SetStateAction<UserGamePreference[]>>;
  setSanctions: Dispatch<SetStateAction<SanctionRecord[]>>;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setDiscordLogs: Dispatch<SetStateAction<DiscordNotificationLog[]>>;
  setPushAlerts: Dispatch<SetStateAction<PushNotificationAlert[]>>;
  setGames: Dispatch<SetStateAction<Game[]>>;
}

const IS_TEST_ENV =
  typeof import.meta !== 'undefined' &&
  Boolean((import.meta as { env?: { MODE?: string } }).env?.MODE === 'test');

export function useLocalStorageAndTabSync({
  players,
  currentUserId,
  isAuthenticated,
  games,
  preferences,
  groups,
  activeGroupIdState,
  pendingInviteCode,
  sessions,
  activeSessionId,
  sanctions,
  chatMessages,
  discordConfig,
  discordLogs,
  pushAlerts,
  syncChannel,
  setPlayers,
  setGroups,
  setSessions,
  setPreferences,
  setSanctions,
  setChatMessages,
  setDiscordLogs,
  setPushAlerts,
  setGames,
}: UseLocalStorageAndTabSyncParams): void {
  const isInitialMountRef = useRef(true);
  const pendingWritesRef = useRef<Map<string, unknown>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingWrites = useRef(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (pendingWritesRef.current.size === 0) return;
    const entries = Array.from(pendingWritesRef.current.entries());
    pendingWritesRef.current.clear();
    for (const [key, val] of entries) {
      saveToStorage(key, val);
    }
  });

  const scheduleHeavyWrite = (key: string, value: unknown) => {
    if (IS_TEST_ENV) {
      saveToStorage(key, value);
      return;
    }
    pendingWritesRef.current.set(key, value);
    if (flushTimerRef.current) return;

    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (
          window as Window & {
            requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
          }
        ).requestIdleCallback(() => flushPendingWrites.current(), { timeout: 600 });
      } else {
        flushPendingWrites.current();
      }
    }, 220);
  };

  useEffect(() => {
    if (typeof window === 'undefined' || IS_TEST_ENV) return;
    const onFlush = () => flushPendingWrites.current();
    window.addEventListener('pagehide', onFlush);
    window.addEventListener('beforeunload', onFlush);
    return () => {
      window.removeEventListener('pagehide', onFlush);
      window.removeEventListener('beforeunload', onFlush);
      flushPendingWrites.current();
    };
  }, []);

  // Heavy slices: skip initial mount echo & defer JSON.stringify off the click critical path
  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    scheduleHeavyWrite(STORAGE_KEYS.PLAYERS, players);
  }, [players]);

  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    scheduleHeavyWrite(STORAGE_KEYS.GAMES, games);
  }, [games]);

  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    scheduleHeavyWrite(STORAGE_KEYS.PREFERENCES, preferences);
  }, [preferences]);

  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    scheduleHeavyWrite(STORAGE_KEYS.GROUPS, groups);
  }, [groups]);

  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    scheduleHeavyWrite(STORAGE_KEYS.SESSIONS, sessions);
  }, [sessions]);

  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    scheduleHeavyWrite(STORAGE_KEYS.SANCTIONS, sanctions);
  }, [sanctions]);

  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    scheduleHeavyWrite(STORAGE_KEYS.CHAT_MESSAGES, chatMessages);
  }, [chatMessages]);

  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    scheduleHeavyWrite(STORAGE_KEYS.DISCORD_CONFIG, discordConfig);
  }, [discordConfig]);

  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    scheduleHeavyWrite(STORAGE_KEYS.DISCORD_LOGS, discordLogs);
  }, [discordLogs]);

  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    scheduleHeavyWrite(STORAGE_KEYS.PUSH_ALERTS, pushAlerts);
  }, [pushAlerts]);

  // Tiny scalar keys: always fast (<0.05ms), keep synchronous
  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    saveToStorage(STORAGE_KEYS.CURRENT_USER_ID, currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    saveToStorage(STORAGE_KEYS.IS_AUTHENTICATED, isAuthenticated);
  }, [isAuthenticated]);

  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    saveToStorage(STORAGE_KEYS.ACTIVE_GROUP_ID, activeGroupIdState);
  }, [activeGroupIdState]);

  useEffect(() => {
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    saveToStorage(STORAGE_KEYS.ACTIVE_SESSION_ID, activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isInitialMountRef.current && !IS_TEST_ENV) return;
    if (pendingInviteCode) {
      saveToStorage(STORAGE_KEYS.PENDING_INVITE_CODE, pendingInviteCode);
    } else {
      localStorage.removeItem(STORAGE_KEYS.PENDING_INVITE_CODE);
    }
  }, [pendingInviteCode]);

  // Mark initial mount complete after the first effect pass
  useEffect(() => {
    isInitialMountRef.current = false;
  }, []);

  // Listen to BroadcastChannel messages for multi-tab sync
  useEffect(() => {
    if (!syncChannel) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data as SyncBroadcastMessage | null | undefined;
      if (!data || !data.type) return;

      switch (data.type) {
        case 'SYNC_PLAYERS':
          setPlayers(data.payload);
          break;
        case 'SYNC_GROUPS':
          setGroups(data.payload);
          break;
        case 'SYNC_SESSIONS':
          setSessions(data.payload);
          break;
        case 'SYNC_PREFERENCES':
          setPreferences(data.payload);
          break;
        case 'SYNC_SANCTIONS':
          setSanctions(data.payload);
          break;
        case 'SYNC_CHAT':
          setChatMessages(data.payload);
          break;
        case 'SYNC_DISCORD_LOGS':
          setDiscordLogs(data.payload);
          break;
        case 'SYNC_PUSH_ALERTS':
          setPushAlerts(data.payload);
          break;
        case 'SYNC_ALL':
          if (data.payload.players) setPlayers(data.payload.players);
          if (data.payload.groups) setGroups(data.payload.groups);
          if (data.payload.sessions) setSessions(data.payload.sessions);
          if (data.payload.preferences) setPreferences(data.payload.preferences);
          if (data.payload.sanctions) setSanctions(data.payload.sanctions);
          if (data.payload.chatMessages) setChatMessages(data.payload.chatMessages);
          if (data.payload.discordLogs) setDiscordLogs(data.payload.discordLogs);
          if (data.payload.games) setGames(data.payload.games);
          break;
      }
    };

    syncChannel.addEventListener('message', handleMessage);
    return () => {
      syncChannel.removeEventListener('message', handleMessage);
    };
  }, [
    syncChannel,
    setPlayers,
    setGroups,
    setSessions,
    setPreferences,
    setSanctions,
    setChatMessages,
    setDiscordLogs,
    setPushAlerts,
    setGames,
  ]);
}
