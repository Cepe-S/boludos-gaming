import React, { useEffect } from 'react';
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

type SyncBroadcastMessage =
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
      payload: {
        players?: PlayerProfile[];
        groups?: GamingGroup[];
        sessions?: GamingSession[];
        preferences?: UserGamePreference[];
        sanctions?: SanctionRecord[];
        chatMessages?: ChatMessage[];
        discordLogs?: DiscordNotificationLog[];
        games?: Game[];
      };
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
  setPlayers: React.Dispatch<React.SetStateAction<PlayerProfile[]>>;
  setGroups: React.Dispatch<React.SetStateAction<GamingGroup[]>>;
  setSessions: React.Dispatch<React.SetStateAction<GamingSession[]>>;
  setPreferences: React.Dispatch<React.SetStateAction<UserGamePreference[]>>;
  setSanctions: React.Dispatch<React.SetStateAction<SanctionRecord[]>>;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setDiscordLogs: React.Dispatch<React.SetStateAction<DiscordNotificationLog[]>>;
  setPushAlerts: React.Dispatch<React.SetStateAction<PushNotificationAlert[]>>;
  setGames: React.Dispatch<React.SetStateAction<Game[]>>;
}

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
  // Save changes to localStorage
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PLAYERS, players);
  }, [players]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CURRENT_USER_ID, currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.IS_AUTHENTICATED, isAuthenticated);
  }, [isAuthenticated]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.GAMES, games);
  }, [games]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PREFERENCES, preferences);
  }, [preferences]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.GROUPS, groups);
  }, [groups]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.ACTIVE_GROUP_ID, activeGroupIdState);
  }, [activeGroupIdState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pendingInviteCode) {
      saveToStorage(STORAGE_KEYS.PENDING_INVITE_CODE, pendingInviteCode);
    } else {
      localStorage.removeItem(STORAGE_KEYS.PENDING_INVITE_CODE);
    }
  }, [pendingInviteCode]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SESSIONS, sessions);
  }, [sessions]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.ACTIVE_SESSION_ID, activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SANCTIONS, sanctions);
  }, [sanctions]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CHAT_MESSAGES, chatMessages);
  }, [chatMessages]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.DISCORD_CONFIG, discordConfig);
  }, [discordConfig]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.DISCORD_LOGS, discordLogs);
  }, [discordLogs]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PUSH_ALERTS, pushAlerts);
  }, [pushAlerts]);

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
