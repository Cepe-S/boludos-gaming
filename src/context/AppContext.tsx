import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
} from '../types/domain';
import { AppContextValue } from '../types/context';
import { getNotificationPermission, playNotificationSound } from '../lib/pushService';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { INITIAL_DISCORD_CONFIG, INITIAL_GAMES } from '../lib/mockData';
import {
  DEFAULT_FALLBACK_USER,
  STORAGE_KEYS,
  loadFromStorage,
  parseInitialInviteCodeFromUrl,
} from './app/storageAndHelpers';
import { ActiveSessionUserState, useSupabaseAuthSync } from './app/useSupabaseAuthSync';
import { useLocalStorageAndTabSync } from './app/useLocalStorageAndTabSync';
import {
  useDiscordButtonInteraction,
  useNotificationsAndDiscord,
} from './app/useNotificationsAndDiscord';
import { useGroupActions } from './app/useGroupActions';
import { useAuthAndScheduleActions } from './app/useAuthAndScheduleActions';
import { useCatalogActions } from './app/useCatalogActions';
import { useSessionLifecycleActions } from './app/useSessionLifecycleActions';
import { useSessionMatchmakingActions } from './app/useSessionMatchmakingActions';
import { useAttendanceTribunalActions } from './app/useAttendanceTribunalActions';
import { useChatActions } from './app/useChatActions';
import { useSteamImportActions } from './app/useSteamImportActions';
import { useUnifiedTasteActions } from './app/useUnifiedTasteActions';

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Sync Channel for Multi-tab consistency
  const syncChannel = useMemo(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      return new BroadcastChannel('boludos_gaming_sync');
    }
    return null;
  }, []);

  // Players & Auth State - default to clean production state (EMPTY arrays, not mock data)
  const [players, setPlayers] = useState<PlayerProfile[]>(() =>
    loadFromStorage(STORAGE_KEYS.PLAYERS, [])
  );
  const [currentUserId, setCurrentUserId] = useState<string>(() =>
    loadFromStorage(STORAGE_KEYS.CURRENT_USER_ID, '')
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const storedAuth = Boolean(loadFromStorage(STORAGE_KEYS.IS_AUTHENTICATED, false));
    const storedPlayers = loadFromStorage<PlayerProfile[]>(STORAGE_KEYS.PLAYERS, []);
    const storedUserId = loadFromStorage<string>(STORAGE_KEYS.CURRENT_USER_ID, '');
    return storedAuth && storedPlayers.length > 0 && storedPlayers.some((p) => p.id === storedUserId);
  });
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(false);
  const [showWeeklyScheduleModal, setShowWeeklyScheduleModal] = useState<boolean>(false);
  const autoOpenedTourUserIdsRef = useRef<Set<string>>(new Set());
  const activeSessionUserRef = useRef<ActiveSessionUserState>({
    userId: currentUserId,
    isAuthenticated,
  });
  activeSessionUserRef.current = { userId: currentUserId, isAuthenticated };

  const currentUser = useMemo(() => {
    return players.find((p) => p.id === currentUserId) || players[0] || DEFAULT_FALLBACK_USER;
  }, [players, currentUserId]);

  // Ensure isAuthenticated is false whenever players.length === 0 or currentUserId does not exist in players
  useEffect(() => {
    if (players.length === 0 || !players.some((p) => p.id === currentUserId)) {
      setIsAuthenticated(false);
    }
  }, [players, currentUserId]);

  // Domain State Slices
  const [games, setGames] = useState<Game[]>(() =>
    loadFromStorage(STORAGE_KEYS.GAMES, INITIAL_GAMES)
  );
  const [preferences, setPreferences] = useState<UserGamePreference[]>(() =>
    loadFromStorage(STORAGE_KEYS.PREFERENCES, [])
  );
  const [groups, setGroups] = useState<GamingGroup[]>(() =>
    loadFromStorage<GamingGroup[]>(STORAGE_KEYS.GROUPS, [])
  );
  const [activeGroupIdState, setActiveGroupIdState] = useState<string | null>(() =>
    loadFromStorage<string | null>(STORAGE_KEYS.ACTIVE_GROUP_ID, null)
  );
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() =>
    parseInitialInviteCodeFromUrl()
  );
  const [sessions, setSessions] = useState<GamingSession[]>(() => {
    const stored = loadFromStorage<GamingSession[]>(STORAGE_KEYS.SESSIONS, []);
    return stored.map((s) => ({ ...s, groupId: s.groupId || 'group-boludos-og' }));
  });
  const [activeSessionId, setActiveSessionIdState] = useState<string>(() =>
    loadFromStorage(STORAGE_KEYS.ACTIVE_SESSION_ID, '')
  );
  const [sanctions, setSanctions] = useState<SanctionRecord[]>(() =>
    loadFromStorage(STORAGE_KEYS.SANCTIONS, [])
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    loadFromStorage(STORAGE_KEYS.CHAT_MESSAGES, [])
  );
  const [discordConfig, setDiscordConfig] = useState<DiscordIntegrationConfig>(() =>
    loadFromStorage(STORAGE_KEYS.DISCORD_CONFIG, INITIAL_DISCORD_CONFIG)
  );
  const [discordLogs, setDiscordLogs] = useState<DiscordNotificationLog[]>(() =>
    loadFromStorage(STORAGE_KEYS.DISCORD_LOGS, [])
  );
  const [pushAlerts, setPushAlerts] = useState<PushNotificationAlert[]>(() =>
    loadFromStorage(STORAGE_KEYS.PUSH_ALERTS, [])
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getNotificationPermission());

  // Derived Group Selectors
  const userGroups = useMemo(() => {
    if (!currentUserId) return [];
    return groups.filter((g) => g.memberIds.includes(currentUserId));
  }, [groups, currentUserId]);

  const activeGroup = useMemo(() => {
    if (userGroups.length === 0) return null;
    if (activeGroupIdState) {
      const matched = userGroups.find((g) => g.id === activeGroupIdState);
      if (matched) return matched;
    }
    return userGroups[0] || null;
  }, [userGroups, activeGroupIdState]);

  const resolvedActiveGroupId = activeGroup?.id || null;

  const pendingInviteGroup = useMemo(() => {
    if (!pendingInviteCode) return null;
    const normalized = pendingInviteCode.trim().toUpperCase();
    return groups.find((g) => g.inviteCode.toUpperCase() === normalized) || null;
  }, [pendingInviteCode, groups]);

  // Lifecycle & Persistence Hooks
  useSupabaseAuthSync({
    players, preferences, games, syncChannel, activeSessionUserRef, autoOpenedTourUserIdsRef,
    setPlayers, setCurrentUserId, setIsAuthenticated, setShowOnboardingModal,
    setGames, setPreferences, setGroups, setSessions, setActiveSessionIdState,
    setSanctions, setChatMessages, setDiscordConfig,
  });

  useLocalStorageAndTabSync({
    players, currentUserId, isAuthenticated, games, preferences, groups,
    activeGroupIdState, pendingInviteCode, sessions, activeSessionId, sanctions,
    chatMessages, discordConfig, discordLogs, pushAlerts, syncChannel,
    setPlayers, setGroups, setSessions, setPreferences, setSanctions,
    setChatMessages, setDiscordLogs, setPushAlerts, setGames,
  });

  // Domain Action Hooks
  const notifications = useNotificationsAndDiscord({
    groups, discordConfig, currentUser, currentUserId, syncChannel,
    setPushAlerts, setDiscordLogs, setDiscordConfig, setNotificationPermission,
  });

  const groupActions = useGroupActions({
    currentUserId, currentUser, isAuthenticated, groups, players, pendingInviteCode, syncChannel,
    setGroups, setSessions, setActiveGroupIdState, setPendingInviteCode, setDiscordLogs,
    triggerNotificationPipeline: notifications.triggerNotificationPipeline,
  });

  const authAndSchedule = useAuthAndScheduleActions({
    currentUserId, currentUser, players, groups, preferences, games, pendingInviteCode,
    syncChannel, activeSessionUserRef,
    setPlayers, setCurrentUserId, setIsAuthenticated, setShowOnboardingModal,
    reconcileSessionsScopedToGroups: groupActions.reconcileSessionsScopedToGroups,
    triggerNotificationPipeline: notifications.triggerNotificationPipeline,
    dispatchDiscordPipeline: notifications.dispatchDiscordPipeline,
  });

  const catalogActions = useCatalogActions({
    currentUserId, currentUser, games, players, preferences, syncChannel,
    setGames, setPreferences, setPlayers,
    addGameToGroup: groupActions.publicActions.addGameToGroup,
    triggerNotificationPipeline: notifications.triggerNotificationPipeline,
  });

  const sessionLifecycle = useSessionLifecycleActions({
    currentUserId, currentUser, groups, resolvedActiveGroupId, userGroups,
    discordConfig, players, sessions, syncChannel,
    setGroups, setActiveGroupIdState, setSessions, setActiveSessionIdState,
    dispatchDiscordPipeline: notifications.dispatchDiscordPipeline,
    triggerNotificationPipeline: notifications.triggerNotificationPipeline,
  });

  const sessionMatchmaking = useSessionMatchmakingActions({
    currentUserId, currentUser, players, sessions, groups, games, preferences,
    discordConfig, syncChannel, setSessions,
    dispatchDiscordPipeline: notifications.dispatchDiscordPipeline,
    triggerNotificationPipeline: notifications.triggerNotificationPipeline,
  });

  const attendanceTribunal = useAttendanceTribunalActions({
    currentUserId, currentUser, players, sessions, groups, syncChannel,
    setSessions, setPlayers, setSanctions,
    dispatchDiscordPipeline: notifications.dispatchDiscordPipeline,
    triggerNotificationPipeline: notifications.triggerNotificationPipeline,
  });

  const { triggerDiscordButtonInteraction } = useDiscordButtonInteraction({
    players, currentUser,
    joinOrUpdateSessionSchedule: sessionMatchmaking.joinOrUpdateSessionSchedule,
    checkInToSession: attendanceTribunal.checkInToSession,
    spinSessionRoulette: sessionMatchmaking.spinSessionRoulette,
  });

  const chatActions = useChatActions({
    currentUserId, currentUser, discordConfig, sessions, groups, resolvedActiveGroupId,
    players, syncChannel, setChatMessages,
    dispatchDiscordPipeline: notifications.dispatchDiscordPipeline,
    triggerNotificationPipeline: notifications.triggerNotificationPipeline,
  });

  const steamImportActions = useSteamImportActions({
    currentUserId, discordConfig, players, preferences, games, syncChannel,
    updateDiscordConfig: notifications.updateDiscordConfig,
    setGames, setPreferences, setPlayers,
  });

  const unifiedTasteActions = useUnifiedTasteActions({
    currentUserId, games, preferences, syncChannel,
    setGames, setPreferences, setPlayers,
    updateSteamGameFeedback: steamImportActions.updateSteamGameFeedback,
  });

  // Reset Utilities
  const resetDemoData = useCallback(() => {
    if (typeof window !== 'undefined') {
      Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    }
    setPlayers([]);
    setCurrentUserId('');
    setIsAuthenticated(false);
    setShowOnboardingModal(false);
    setShowWeeklyScheduleModal(false);
    setGroups([]);
    setActiveGroupIdState(null);
    setPendingInviteCode(null);
    setGames(INITIAL_GAMES);
    setPreferences([]);
    setSessions([]);
    setActiveSessionIdState('');
    setSanctions([]);
    setChatMessages([]);
    setDiscordConfig(INITIAL_DISCORD_CONFIG);
    setDiscordLogs([]);
    setPushAlerts([]);

    syncChannel?.postMessage({
      type: 'SYNC_ALL',
      payload: {
        players: [],
        groups: [],
        sessions: [],
        preferences: [],
        sanctions: [],
        chatMessages: [],
        discordLogs: [],
        games: INITIAL_GAMES,
      },
    });

    playNotificationSound('message');
  }, [syncChannel]);

  // Visibility scoping: only expose players who share at least one group with currentUser (plus currentUser)
  const visiblePlayers = useMemo(() => {
    if (!currentUserId) return [];
    const sharedIds = new Set<string>([currentUserId]);
    userGroups.forEach((group) => {
      group.memberIds.forEach((memberId) => sharedIds.add(memberId));
    });
    return players.filter((p) => sharedIds.has(p.id));
  }, [players, userGroups, currentUserId]);

  const visiblePreferences = useMemo(() => {
    if (!currentUserId) return [];
    const sharedIds = new Set(visiblePlayers.map((p) => p.id));
    return preferences.filter((pref) => sharedIds.has(pref.userId));
  }, [preferences, visiblePlayers, currentUserId]);

  const visibleSessions = useMemo(() => {
    if (!currentUserId || userGroups.length === 0) return [];
    const groupIds = new Set(userGroups.map((g) => g.id));
    return sessions.filter((s) => groupIds.has(s.groupId));
  }, [sessions, userGroups, currentUserId]);

  const visibleSanctions = useMemo(() => {
    if (!currentUserId) return [];
    const sharedIds = new Set(visiblePlayers.map((p) => p.id));
    const groupIds = new Set(userGroups.map((g) => g.id));
    return sanctions.filter((san) =>
      san.groupId ? groupIds.has(san.groupId) : sharedIds.has(san.userId)
    );
  }, [sanctions, visiblePlayers, userGroups, currentUserId]);

  const visibleChatMessages = useMemo(() => {
    if (!currentUserId) return [];
    const sharedIds = new Set(visiblePlayers.map((p) => p.id));
    const groupIds = new Set(userGroups.map((g) => g.id));
    return chatMessages.filter((msg) =>
      msg.groupId ? groupIds.has(msg.groupId) : sharedIds.has(msg.userId)
    );
  }, [chatMessages, visiblePlayers, userGroups, currentUserId]);

  const value = useMemo<AppContextValue>(
    () => ({
      currentUser,
      players: visiblePlayers,
      isAuthenticated,
      showOnboardingModal,
      setShowOnboardingModal,
      showWeeklyScheduleModal,
      setShowWeeklyScheduleModal,
      isSupabaseConnected: isSupabaseConfigured(),
      ...authAndSchedule,

      groups,
      userGroups,
      activeGroupId: resolvedActiveGroupId,
      activeGroup,
      pendingInviteCode,
      pendingInviteGroup,
      ...groupActions.publicActions,

      games,
      preferences: visiblePreferences,
      ...catalogActions,
      ...steamImportActions,
      ...unifiedTasteActions,

      sessions: visibleSessions,
      activeSessionId,
      ...sessionLifecycle,
      ...sessionMatchmaking,

      sanctions: visibleSanctions,
      ...attendanceTribunal,

      chatMessages: visibleChatMessages,
      ...chatActions,

      discordConfig,
      discordLogs,
      updateDiscordConfig: notifications.updateDiscordConfig,
      toggleDiscordEvent: notifications.toggleDiscordEvent,
      sendTestDiscordNotification: notifications.sendTestDiscordNotification,
      triggerDiscordButtonInteraction,

      pushAlerts,
      notificationPermission,
      requestPushPermission: notifications.requestPushPermission,
      sendTestPushNotification: notifications.sendTestPushNotification,

      resetDemoData,
    }),
    [
      currentUser,
      visiblePlayers,
      isAuthenticated,
      showOnboardingModal,
      showWeeklyScheduleModal,
      authAndSchedule,
      groups,
      userGroups,
      resolvedActiveGroupId,
      activeGroup,
      pendingInviteCode,
      pendingInviteGroup,
      groupActions.publicActions,
      games,
      visiblePreferences,
      catalogActions,
      steamImportActions,
      unifiedTasteActions,
      visibleSessions,
      activeSessionId,
      sessionLifecycle,
      sessionMatchmaking,
      visibleSanctions,
      attendanceTribunal,
      visibleChatMessages,
      chatActions,
      discordConfig,
      discordLogs,
      notifications,
      triggerDiscordButtonInteraction,
      pushAlerts,
      notificationPermission,
      resetDemoData,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
