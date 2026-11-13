import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AttendanceVote,
  CategoryPreferenceLevel,
  ChatMessage,
  DailyScheduleOverride,
  DiscordEventType,
  DiscordIntegrationConfig,
  DiscordNotificationLog,
  Game,
  GameRating,
  GamingSession,
  PlayerProfile,
  PrecisionMinutes,
  PushNotificationAlert,
  SanctionRecord,
  SessionParticipant,
  UserGamePreference,
  WeeklySchedule,
} from '../types/domain';
import { AppContextValue } from '../types/context';
import {
  calculateGameSynchrony,
  calculateScheduleOverlap,
  calculateTitleForPlayer,
  createDefaultWeeklySchedule,
  evaluateCheckInStatus,
  formatMinutesToTime,
  parseTimeMinutes,
  reconcileSessionParticipantsWithSchedules,
  spinWeightedRoulette,
} from '../lib/matchmakingEngine';
import {
  buildChatBroadcastLog,
  buildCheckinUpdateLog,
  buildLatePingLog,
  buildPlayerJoinedLog,
  buildRouletteWinnerLog,
  buildSanctionIssuedLog,
  buildSessionCreatedLog,
  dispatchDiscordWebhook,
} from '../lib/discordService';
import {
  getNotificationPermission,
  playNotificationSound,
  registerServiceWorker,
  requestBrowserNotificationPermission,
  showNativeNotification,
} from '../lib/pushService';
import { isDiscordOAuthProviderEnabled, isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import {
  dbCreateSession,
  dbDeleteParticipant,
  dbInsertChatMessage,
  dbInsertGame,
  dbInsertSanction,
  dbUpdateChatReactions,
  dbUpdateDiscordConfig,
  dbUpdateSessionGame,
  dbUpsertAttendanceVote,
  dbUpsertParticipant,
  dbUpsertPreference,
  dbUpsertProfile,
  fetchAllSupabaseData,
} from '../lib/supabaseSync';
import {
  INITIAL_DISCORD_CONFIG,
  INITIAL_GAMES,
} from '../lib/mockData';

const STORAGE_KEYS = {
  CURRENT_USER_ID: 'bg_prod_v2_current_user_id',
  IS_AUTHENTICATED: 'bg_prod_v2_is_authenticated',
  PLAYERS: 'bg_prod_v2_players',
  GAMES: 'bg_prod_v2_games',
  PREFERENCES: 'bg_prod_v2_preferences',
  SESSIONS: 'bg_prod_v2_sessions',
  ACTIVE_SESSION_ID: 'bg_prod_v2_active_session_id',
  SANCTIONS: 'bg_prod_v2_sanctions',
  CHAT_MESSAGES: 'bg_prod_v2_chat_messages',
  DISCORD_CONFIG: 'bg_prod_v2_discord_config',
  DISCORD_LOGS: 'bg_prod_v2_discord_logs',
  PUSH_ALERTS: 'bg_prod_v2_push_alerts',
} as const;

// Purge stale v1 localStorage keys so no demo/mock players persist in any browser
if (typeof window !== 'undefined') {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('bg_v1_')) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('Error purging stale bg_v1_ localStorage keys:', error);
  }
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Error reading key ${key} from localStorage:`, error);
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Error writing key ${key} to localStorage:`, error);
  }
}

const DEFAULT_FALLBACK_USER: PlayerProfile = {
  id: '',
  discordId: '',
  discordUsername: 'invitado',
  displayName: 'Invitado',
  avatarUrl: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Invitado',
  karmaScore: 100,
  sessionsPlayed: 0,
  hoursPlayed: 0,
  onTimeCount: 0,
  lateCount: 0,
  noShowCount: 0,
  currentStreak: 0,
  activeTitle: '⌚ Reloj Suizo',
};

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

  const currentUser = useMemo(() => {
    return players.find((p) => p.id === currentUserId) || players[0] || DEFAULT_FALLBACK_USER;
  }, [players, currentUserId]);

  // Ensure isAuthenticated is false whenever players.length === 0 or currentUserId does not exist in players
  useEffect(() => {
    if (players.length === 0 || !players.some((p) => p.id === currentUserId)) {
      setIsAuthenticated(false);
    }
  }, [players, currentUserId]);

  // Catalog Games & User Preferences (1-5★) - only games keeps initial catalog
  const [games, setGames] = useState<Game[]>(() =>
    loadFromStorage(STORAGE_KEYS.GAMES, INITIAL_GAMES)
  );

  const [preferences, setPreferences] = useState<UserGamePreference[]>(() =>
    loadFromStorage(STORAGE_KEYS.PREFERENCES, [])
  );

  // Sessions State - default to empty array
  const [sessions, setSessions] = useState<GamingSession[]>(() =>
    loadFromStorage(STORAGE_KEYS.SESSIONS, [])
  );

  const [activeSessionId, setActiveSessionIdState] = useState<string>(() =>
    loadFromStorage(STORAGE_KEYS.ACTIVE_SESSION_ID, '')
  );

  // Sanctions History - default to empty array
  const [sanctions, setSanctions] = useState<SanctionRecord[]>(() =>
    loadFromStorage(STORAGE_KEYS.SANCTIONS, [])
  );

  // Global Chat Messages - default to empty array
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    loadFromStorage(STORAGE_KEYS.CHAT_MESSAGES, [])
  );

  // Discord Integration State
  const [discordConfig, setDiscordConfig] = useState<DiscordIntegrationConfig>(() =>
    loadFromStorage(STORAGE_KEYS.DISCORD_CONFIG, INITIAL_DISCORD_CONFIG)
  );

  const [discordLogs, setDiscordLogs] = useState<DiscordNotificationLog[]>(() =>
    loadFromStorage(STORAGE_KEYS.DISCORD_LOGS, [])
  );

  // Push Alerts
  const [pushAlerts, setPushAlerts] = useState<PushNotificationAlert[]>(() =>
    loadFromStorage(STORAGE_KEYS.PUSH_ALERTS, [])
  );

  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getNotificationPermission());

  // Register Service Worker on initial mount
  useEffect(() => {
    registerServiceWorker().catch(() => {});
  }, []);

  // Hydrate and subscribe to Supabase Realtime when configured
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;

    let isMounted = true;

    const hydrate = async () => {
      const data = await fetchAllSupabaseData();
      if (!data || !isMounted) return;

      // Update state with Supabase tables while preserving any newly created active session profile not yet flushed
      setPlayers((prev) => {
        if (data.players.length === 0 && prev.length > 0) {
          return prev;
        }
        const merged = [...data.players];
        for (const localP of prev) {
          if (!merged.some((dbP) => dbP.id === localP.id)) {
            merged.push(localP);
          }
        }
        return merged;
      });
      if (data.games.length > 0) setGames(data.games);
      setPreferences(data.preferences);
      setSessions(data.sessions);
      setActiveSessionIdState((prev) =>
        data.sessions.some((s) => s.id === prev) ? prev : (data.sessions[0]?.id || '')
      );
      setSanctions(data.sanctions);
      setChatMessages(data.chatMessages);
      if (data.discordConfig) setDiscordConfig(data.discordConfig);
    };

    hydrate();

    const channel = supabase
      .channel('boludos-gaming-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        () => {
          hydrate();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase?.removeChannel(channel);
    };
  }, []);

  // Listen for Supabase Discord OAuth sessions
  useEffect(() => {
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const user = session.user;
        const userId = user.id;
        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const customClaims = (meta.custom_claims as Record<string, unknown> | undefined) || {};
        const displayName = String(
          customClaims.global_name ||
            meta.full_name ||
            meta.name ||
            user.email?.split('@')[0] ||
            'Gamer'
        );
        const discordUsername = String(
          meta.preferred_username || meta.name || displayName.toLowerCase().replace(/\s+/g, '_')
        );
        const discordId = String(meta.provider_id || meta.sub || '');
        const avatarUrl = String(
          meta.avatar_url ||
            `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(displayName)}`
        );

        setPlayers((prevPlayers) => {
          const existing = prevPlayers.find((p) => p.id === userId);
          if (existing) {
            setCurrentUserId(userId);
            setIsAuthenticated(true);
            if (!existing.onboardingCompleted) {
              setShowOnboardingModal(true);
            }
            return prevPlayers;
          }

          const newProfile: PlayerProfile = {
            id: userId,
            discordId,
            discordUsername,
            displayName,
            avatarUrl,
            karmaScore: 100,
            sessionsPlayed: 0,
            hoursPlayed: 0,
            onTimeCount: 0,
            lateCount: 0,
            noShowCount: 0,
            currentStreak: 0,
            activeTitle: '⌚ Reloj Suizo',
            isOnline: true,
            pushEnabled: true,
            onboardingCompleted: false,
            weeklySchedule: createDefaultWeeklySchedule(),
            dailyOverrides: {},
            categoryPreferences: {
              'Shooter Táctico': 'like',
              'MOBA': 'neutral',
              'Co-op Horror': 'like',
              'Co-op Acción': 'like',
              'Survival Sandbox': 'like',
              'RTS': 'neutral',
              'Party Casual': 'like',
              'Deportes / Autos': 'neutral',
              'RPG / Aventura': 'like',
            },
          };

          dbUpsertProfile(newProfile).catch(console.warn);
          setCurrentUserId(userId);
          setIsAuthenticated(true);
          setShowOnboardingModal(true);
          syncChannel?.postMessage({
            type: 'SYNC_PLAYERS',
            payload: [...prevPlayers, newProfile],
          });
          return [...prevPlayers, newProfile];
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [syncChannel]);

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
      const data = event.data;
      if (!data || !data.type) return;

      switch (data.type) {
        case 'SYNC_PLAYERS':
          setPlayers(data.payload);
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
  }, [syncChannel]);

  // Helper to append a push alert and trigger browser/sound notification
  const triggerNotificationPipeline = useCallback(
    async (
      alert: Omit<PushNotificationAlert, 'id' | 'createdAt'>,
      soundType: 'ping' | 'roulette' | 'sanction' | 'message'
    ) => {
      const newAlert: PushNotificationAlert = {
        ...alert,
        id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        createdAt: new Date().toISOString(),
      };

      setPushAlerts((prev) => {
        const next = [newAlert, ...prev].slice(0, 50);
        syncChannel?.postMessage({ type: 'SYNC_PUSH_ALERTS', payload: next });
        return next;
      });

      // Play synthesized audio chime
      playNotificationSound(soundType);

      // Attempt native OS/Browser notification
      await showNativeNotification(alert.title, {
        body: alert.body,
        tag: alert.tag,
      });
    },
    [syncChannel]
  );

  // Helper to log and dispatch to Discord Webhook
  const dispatchDiscordPipeline = useCallback(
    async (log: DiscordNotificationLog) => {
      let logWithStatus = { ...log };

      if (discordConfig.enabled && discordConfig.events[log.eventType] && discordConfig.webhookUrl) {
        const result = await dispatchDiscordWebhook(discordConfig.webhookUrl, log);
        logWithStatus = {
          ...log,
          deliveredToWebhook: result.ok,
          webhookError: result.error,
        };
      }

      setDiscordLogs((prev) => {
        const next = [logWithStatus, ...prev].slice(0, 100);
        syncChannel?.postMessage({ type: 'SYNC_DISCORD_LOGS', payload: next });
        return next;
      });
    },
    [discordConfig, syncChannel]
  );

  // 1. Current User, Welcome Screen & Auth
  const switchActivePlayer = useCallback(
    (userId: string) => {
      const target = players.find((p) => p.id === userId);
      if (target) {
        setCurrentUserId(userId);
        setIsAuthenticated(true);
      }
    },
    [players]
  );

  const loginAsProfile = useCallback(
    (userId: string) => {
      const target = players.find((p) => p.id === userId);
      if (target) {
        setCurrentUserId(userId);
        setIsAuthenticated(true);
        if (!target.onboardingCompleted) {
          setShowOnboardingModal(true);
        }
      }
    },
    [players]
  );

  const createAndLoginProfile = useCallback(
    (params: {
      displayName: string;
      discordUsername: string;
      discordId?: string;
      avatarUrl?: string;
    }): PlayerProfile => {
      const cleanUsername = params.discordUsername.trim().toLowerCase().replace(/^@/, '');
      const existing = players.find(
        (p) => p.discordUsername.trim().toLowerCase().replace(/^@/, '') === cleanUsername
      );

      // If user already exists in players, log in as them directly
      if (existing) {
        loginAsProfile(existing.id);
        return existing;
      }

      const cleanDisplayName = params.displayName.trim();
      const newProfile: PlayerProfile = {
        id: params.discordId ? `user-${params.discordId}` : `user-${Date.now()}`,
        discordId:
          params.discordId?.trim() ||
          `${Math.floor(100000000000000000 + Math.random() * 900000000000000000)}`,
        discordUsername: params.discordUsername.trim().replace(/^@/, ''),
        displayName: cleanDisplayName,
        avatarUrl:
          params.avatarUrl?.trim() ||
          `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(
            cleanDisplayName
          )}`,
        karmaScore: 100,
        sessionsPlayed: 0,
        hoursPlayed: 0,
        onTimeCount: 0,
        lateCount: 0,
        noShowCount: 0,
        currentStreak: 0,
        activeTitle: '⌚ Reloj Suizo',
        isOnline: true,
        pushEnabled: true,
        onboardingCompleted: false,
        weeklySchedule: createDefaultWeeklySchedule(),
        dailyOverrides: {},
        categoryPreferences: {
          'Shooter Táctico': 'like',
          'MOBA': 'neutral',
          'Co-op Horror': 'like',
          'Co-op Acción': 'like',
          'Survival Sandbox': 'like',
          'RTS': 'neutral',
          'Party Casual': 'like',
          'Deportes / Autos': 'neutral',
          'RPG / Aventura': 'like',
        },
      };

      const updatedPlayers = [...players, newProfile];
      setPlayers(updatedPlayers);
      syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: updatedPlayers });
      dbUpsertProfile(newProfile).catch(console.warn);

      // Reconcile active sessions so they are automatically enrolled
      setSessions((prevSessions) => {
        const updatedSessions = prevSessions.map((sess) => {
          if (sess.status === 'finished') return sess;
          const reconciledParticipants = reconcileSessionParticipantsWithSchedules(
            sess,
            updatedPlayers
          );
          for (const p of reconciledParticipants) {
            dbUpsertParticipant(sess.id, p).catch(console.warn);
          }
          return { ...sess, participants: reconciledParticipants };
        });
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updatedSessions });
        return updatedSessions;
      });

      setCurrentUserId(newProfile.id);
      setIsAuthenticated(true);
      setShowOnboardingModal(true);

      return newProfile;
    },
    [players, syncChannel, loginAsProfile]
  );

  const logout = useCallback(async () => {
    setIsAuthenticated(false);
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Error during Supabase signOut:', err);
      }
    }
  }, []);

  const loginWithDiscord = useCallback(async () => {
    const oauthEnabled = await isDiscordOAuthProviderEnabled();
    if (oauthEnabled && supabase) {
      await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: `${window.location.origin}${window.location.pathname}`,
        },
      });
    } else {
      throw new Error(
        'El proveedor OAuth2 de Discord aún no fue activado en el panel de Supabase (Authentication -> Providers -> Discord).'
      );
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    const updatedCurrentUser: PlayerProfile = {
      ...currentUser,
      onboardingCompleted: true,
    };

    const updatedPlayers = players.map((p) =>
      p.id === currentUser.id ? updatedCurrentUser : p
    );

    setPlayers(updatedPlayers);
    syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: updatedPlayers });
    dbUpsertProfile(updatedCurrentUser).catch(console.warn);

    // Reconcile all open sessions with reconcileSessionParticipantsWithSchedules
    setSessions((prevSessions) => {
      const updatedSessions = prevSessions.map((sess) => {
        if (sess.status === 'finished') return sess;
        const reconciledParticipants = reconcileSessionParticipantsWithSchedules(
          sess,
          updatedPlayers
        );
        for (const p of reconciledParticipants) {
          dbUpsertParticipant(sess.id, p).catch(console.warn);
        }
        return { ...sess, participants: reconciledParticipants };
      });
      syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updatedSessions });
      return updatedSessions;
    });

    setShowOnboardingModal(false);
  }, [currentUser, players, syncChannel]);

  // Weekly Schedule, Daily Overrides & "Hoy No Juego"
  const updateWeeklySchedule = useCallback(
    (schedule: WeeklySchedule, userId?: string) => {
      const targetId = userId || currentUserId;
      let targetUpdated: PlayerProfile | undefined;

      const updatedPlayers = players.map((p) => {
        if (p.id === targetId) {
          targetUpdated = { ...p, weeklySchedule: schedule };
          return targetUpdated;
        }
        return p;
      });

      if (!targetUpdated) return;

      setPlayers(updatedPlayers);
      syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: updatedPlayers });
      dbUpsertProfile(targetUpdated).catch(console.warn);

      // Reconcile open sessions
      setSessions((prevSessions) => {
        const updatedSessions = prevSessions.map((sess) => {
          if (sess.status === 'finished') return sess;
          const reconciledParticipants = reconcileSessionParticipantsWithSchedules(
            sess,
            updatedPlayers
          );
          const currentIds = new Set(reconciledParticipants.map((p) => p.userId));
          for (const oldP of sess.participants) {
            if (!currentIds.has(oldP.userId)) {
              dbDeleteParticipant(sess.id, oldP.userId).catch(console.warn);
            }
          }
          for (const p of reconciledParticipants) {
            dbUpsertParticipant(sess.id, p).catch(console.warn);
          }
          return { ...sess, participants: reconciledParticipants };
        });
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updatedSessions });
        return updatedSessions;
      });
    },
    [currentUserId, players, syncChannel]
  );

  const setDailyOverride = useCallback(
    (
      date: string,
      override: Omit<DailyScheduleOverride, 'date' | 'updatedAt'> | null,
      userId?: string
    ) => {
      const targetId = userId || currentUserId;
      let targetUpdated: PlayerProfile | undefined;

      const updatedPlayers = players.map((p) => {
        if (p.id !== targetId) return p;
        const nextOverrides = { ...(p.dailyOverrides || {}) };
        if (override === null) {
          delete nextOverrides[date];
        } else {
          nextOverrides[date] = {
            ...override,
            date,
            updatedAt: new Date().toISOString(),
          };
        }
        targetUpdated = { ...p, dailyOverrides: nextOverrides };
        return targetUpdated;
      });

      if (!targetUpdated) return;

      setPlayers(updatedPlayers);
      syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: updatedPlayers });
      dbUpsertProfile(targetUpdated).catch(console.warn);

      // Immediately runs reconcileSessionParticipantsWithSchedules on any session matching date
      setSessions((prevSessions) => {
        const updatedSessions = prevSessions.map((sess) => {
          if (sess.date !== date || sess.status === 'finished') return sess;
          const reconciledParticipants = reconcileSessionParticipantsWithSchedules(
            sess,
            updatedPlayers
          );
          const currentIds = new Set(reconciledParticipants.map((p) => p.userId));
          for (const oldP of sess.participants) {
            if (!currentIds.has(oldP.userId)) {
              dbDeleteParticipant(sess.id, oldP.userId).catch(console.warn);
            }
          }
          for (const p of reconciledParticipants) {
            dbUpsertParticipant(sess.id, p).catch(console.warn);
          }
          return { ...sess, participants: reconciledParticipants };
        });
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updatedSessions });
        return updatedSessions;
      });
    },
    [currentUserId, players, syncChannel]
  );

  const toggleTodayNotPlaying = useCallback(
    (reason?: string, userId?: string) => {
      const todayStr = new Date().toISOString().split('T')[0];
      const targetId = userId || currentUserId;
      const targetPlayer = players.find((p) => p.id === targetId) || currentUser;
      const currentOverride = targetPlayer.dailyOverrides?.[todayStr];
      const isCurrentlyNotPlaying = currentOverride?.status === 'not_playing';

      if (isCurrentlyNotPlaying) {
        // Clear override (restores automatic enrollment)
        setDailyOverride(todayStr, null, targetId);

        triggerNotificationPipeline(
          {
            title: `✅ ${targetPlayer.displayName} vuelve a jugar hoy`,
            body: 'Canceló el aviso de ausencia. Su horario habitual se reactivó automáticamente.',
            tag: `not_playing_cancel_${todayStr}_${targetId}`,
            targetUserIds: players.map((p) => p.id),
          },
          'ping'
        );
      } else {
        // Set not_playing override
        const notPlayingReason = reason || 'Avisó con el botón Hoy No Juego';
        setDailyOverride(
          todayStr,
          {
            status: 'not_playing',
            reason: notPlayingReason,
          },
          targetId
        );

        triggerNotificationPipeline(
          {
            title: `🏳️ ${targetPlayer.displayName} avisó que hoy no juega`,
            body: `${notPlayingReason}. Baja confirmada sin penalización de karma.`,
            tag: `not_playing_${todayStr}_${targetId}`,
            targetUserIds: players.map((p) => p.id),
          },
          'message'
        );

        const discordLog: DiscordNotificationLog = {
          id: `log-not-playing-${Date.now()}`,
          eventType: 'checkin_update',
          content: `🏳️ **Baja Confirmada:** <@${targetPlayer.discordId}> (${targetPlayer.displayName}) avisó que hoy no juega.`,
          embed: {
            title: '🏳️ Aviso de Ausencia Anticipado',
            description: `${targetPlayer.displayName} avisó con antelación que no podrá estar hoy. Se liberó su cupo sin restar karma.`,
            color: 0x64748b,
            fields: [
              { name: 'Motivo', value: notPlayingReason, inline: true },
              { name: 'Fecha', value: todayStr, inline: true },
              { name: 'Karma', value: `${targetPlayer.karmaScore} (Intacto)`, inline: true },
            ],
            footer: { text: 'Boludos Gaming • Asistencia & Convivencia' },
            timestamp: new Date().toISOString(),
          },
          buttons: [{ label: 'Ver Sesión', actionType: 'open_app', style: 'secondary' }],
          createdAt: new Date().toISOString(),
          deliveredToWebhook: false,
        };
        dispatchDiscordPipeline(discordLog);
      }
    },
    [
      currentUserId,
      currentUser,
      players,
      setDailyOverride,
      triggerNotificationPipeline,
      dispatchDiscordPipeline,
    ]
  );

  const updateCategoryPreferences = useCallback(
    (prefs: Record<string, CategoryPreferenceLevel>, userId?: string) => {
      const targetId = userId || currentUserId;
      let targetUpdated: PlayerProfile | undefined;

      const updatedPlayers = players.map((p) => {
        if (p.id === targetId) {
          targetUpdated = { ...p, categoryPreferences: prefs };
          return targetUpdated;
        }
        return p;
      });

      if (!targetUpdated) return;

      setPlayers(updatedPlayers);
      syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: updatedPlayers });
      dbUpsertProfile(targetUpdated).catch(console.warn);
    },
    [currentUserId, players, syncChannel]
  );

  // 2. Games & Preferences (1-5★)
  const updateGamePreference = useCallback(
    (gameId: string, plays: boolean, rating: GameRating) => {
      const nextPref = { userId: currentUserId, gameId, plays, rating };
      setPreferences((prev) => {
        const filtered = prev.filter(
          (p) => !(p.userId === currentUserId && p.gameId === gameId)
        );
        const updated = [...filtered, nextPref];
        syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: updated });
        return updated;
      });
      dbUpsertPreference(nextPref).catch(console.warn);
    },
    [currentUserId, syncChannel]
  );

  const addGame = useCallback(
    (gameData: Omit<Game, 'id' | 'addedBy'>): Game => {
      const newGame: Game = {
        ...gameData,
        id: `game-${Date.now()}`,
        addedBy: currentUserId,
      };

      setGames((prev) => {
        const updated = [...prev, newGame];
        syncChannel?.postMessage({ type: 'SYNC_ALL', payload: { games: updated } });
        return updated;
      });
      dbInsertGame(newGame).catch(console.warn);

      const defaultPref = {
        userId: currentUserId,
        gameId: newGame.id,
        plays: true,
        rating: 4 as GameRating,
      };
      // Add default preference for current user
      setPreferences((prev) => {
        const updated = [...prev, defaultPref];
        syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: updated });
        return updated;
      });
      dbUpsertPreference(defaultPref).catch(console.warn);

      triggerNotificationPipeline(
        {
          title: '🎮 Nuevo Juego Agregado',
          body: `${currentUser.displayName} agregó "${newGame.name}" al catálogo de Boludos Gaming.`,
          tag: 'game_added',
          targetUserIds: players.map((p) => p.id),
        },
        'message'
      );

      return newGame;
    },
    [currentUser, currentUserId, players, syncChannel, triggerNotificationPipeline]
  );

  // 3. Sessions & Matchmaking
  const setActiveSessionId = useCallback((sessionId: string) => {
    setActiveSessionIdState(sessionId);
  }, []);

  const createSession = useCallback(
    (params: {
      title: string;
      date: string;
      mode: 'fixed' | 'random';
      selectedGameId?: string;
      allowSplitLobbies: boolean;
      availableFrom: string;
      availableUntil: string;
      precisionMinutes: PrecisionMinutes;
    }): GamingSession => {
      const baseSession: GamingSession = {
        id: `session-${Date.now()}`,
        title: params.title,
        date: params.date,
        mode: params.mode,
        selectedGameId: params.selectedGameId,
        status: 'open',
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
        allowSplitLobbies: params.allowSplitLobbies,
        attendanceVotes: [],
        participants: [],
      };

      // Automatically populate participants using reconcileSessionParticipantsWithSchedules
      // so ALL players whose weekly schedule (or daily override) says they play on params.date
      // are enrolled automatically right when the session is created!
      const autoParticipants = reconcileSessionParticipantsWithSchedules(baseSession, players);

      // Ensure session creator's custom schedule parameters are preserved
      const creatorIndex = autoParticipants.findIndex((p) => p.userId === currentUserId);
      const creatorParticipant: SessionParticipant = {
        userId: currentUserId,
        joinedAt: new Date().toISOString(),
        availableFrom: params.availableFrom,
        availableUntil: params.availableUntil,
        precisionMinutes: params.precisionMinutes,
        attendanceStatus: 'pending',
        isAutoEnrolled: false,
      };

      if (creatorIndex >= 0) {
        autoParticipants[creatorIndex] = creatorParticipant;
      } else {
        autoParticipants.push(creatorParticipant);
      }

      const newSession: GamingSession = {
        ...baseSession,
        participants: autoParticipants,
      };

      setSessions((prev) => {
        const updated = [newSession, ...prev];
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });

      dbCreateSession(newSession).catch(console.warn);
      setActiveSessionIdState(newSession.id);

      // Discord Rich Embed & Webhook
      const discordLog = buildSessionCreatedLog(
        newSession,
        currentUser,
        discordConfig.mentionRoleId || '@everyone'
      );
      dispatchDiscordPipeline(discordLog);

      // Push Notification
      triggerNotificationPipeline(
        {
          title: '🎮 Nueva Sesión Creada',
          body: `${currentUser.displayName} convocó a "${params.title}" para las ${params.availableFrom} (±${params.precisionMinutes}m). Hay ${autoParticipants.length} jugadores convocados.`,
          tag: `session_${newSession.id}`,
          sessionId: newSession.id,
          targetUserIds: players.map((p) => p.id),
        },
        'ping'
      );

      return newSession;
    },
    [
      currentUserId,
      currentUser,
      discordConfig.mentionRoleId,
      players,
      syncChannel,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  const joinOrUpdateSessionSchedule = useCallback(
    (
      sessionId: string,
      params: {
        availableFrom: string;
        availableUntil: string;
        precisionMinutes: PrecisionMinutes;
        note?: string;
        userId?: string;
      }
    ) => {
      const targetUserId = params.userId || currentUserId;
      const targetPlayer = players.find((p) => p.id === targetUserId) || currentUser;

      setSessions((prev) => {
        const updated = prev.map((sess) => {
          if (sess.id !== sessionId) return sess;

          const existingIndex = sess.participants.findIndex((p) => p.userId === targetUserId);
          const participantData = {
            userId: targetUserId,
            joinedAt:
              existingIndex >= 0 ? sess.participants[existingIndex].joinedAt : new Date().toISOString(),
            availableFrom: params.availableFrom,
            availableUntil: params.availableUntil,
            precisionMinutes: params.precisionMinutes,
            attendanceStatus:
              existingIndex >= 0 ? sess.participants[existingIndex].attendanceStatus : ('pending' as const),
            checkedInAt:
              existingIndex >= 0 ? sess.participants[existingIndex].checkedInAt : undefined,
            note: params.note,
          };

          const newParticipants =
            existingIndex >= 0
              ? sess.participants.map((p, idx) => (idx === existingIndex ? participantData : p))
              : [...sess.participants, participantData];

          const updatedSession = { ...sess, participants: newParticipants };
          dbUpsertParticipant(sessionId, participantData).catch(console.warn);

          // Build Discord Log
          const log = buildPlayerJoinedLog(
            updatedSession,
            targetPlayer,
            params.precisionMinutes,
            params.availableFrom
          );
          dispatchDiscordPipeline(log);

          return updatedSession;
        });

        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });

      triggerNotificationPipeline(
        {
          title: '🙋‍♂️ Horario Actualizado en Sesión',
          body: `${targetPlayer.displayName} declaró ${params.availableFrom} (±${params.precisionMinutes}m).`,
          tag: `session_join_${sessionId}`,
          sessionId,
          targetUserIds: players.map((p) => p.id),
        },
        'ping'
      );
    },
    [
      currentUserId,
      currentUser,
      players,
      syncChannel,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  const leaveSession = useCallback(
    (sessionId: string, userId?: string) => {
      const targetUserId = userId || currentUserId;

      setSessions((prev) => {
        const updated = prev.map((sess) => {
          if (sess.id !== sessionId) return sess;
          return {
            ...sess,
            participants: sess.participants.filter((p) => p.userId !== targetUserId),
          };
        });
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });
      dbDeleteParticipant(sessionId, targetUserId).catch(console.warn);
    },
    [currentUserId, syncChannel]
  );

  const spinSessionRoulette = useCallback(
    (sessionId: string): Game | null => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return null;

      const synchronyResults = calculateGameSynchrony(
        games,
        preferences,
        session.participants,
        players,
        session.allowSplitLobbies
      );

      const winningGame = spinWeightedRoulette(synchronyResults);
      if (!winningGame) return null;

      const winningResult = synchronyResults.find((r) => r.game.id === winningGame.id);
      const synchronyScore = winningResult ? winningResult.synchronyScore : 80;

      setSessions((prev) => {
        const updated = prev.map((s) => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            rouletteWinnerGameId: winningGame.id,
            selectedGameId: winningGame.id,
          };
        });
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });
      dbUpdateSessionGame(sessionId, winningGame.id, true).catch(console.warn);

      // Discord Rich Embed & Webhook
      const discordLog = buildRouletteWinnerLog(
        session,
        winningGame,
        synchronyScore,
        session.participants.length
      );
      dispatchDiscordPipeline(discordLog);

      // Push Notification with fanfare
      triggerNotificationPipeline(
        {
          title: `🎉 ¡Ganó ${winningGame.name}!`,
          body: `La ruleta ponderada eligió ${winningGame.name} con ${synchronyScore}% de sincronía grupal.`,
          tag: `roulette_${sessionId}`,
          sessionId,
          targetUserIds: session.participants.map((p) => p.userId),
        },
        'roulette'
      );

      return winningGame;
    },
    [
      sessions,
      games,
      preferences,
      players,
      syncChannel,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  const lockSessionGame = useCallback(
    (sessionId: string, gameId: string) => {
      setSessions((prev) => {
        const updated = prev.map((s) => {
          if (s.id !== sessionId) return s;
          return { ...s, selectedGameId: gameId };
        });
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });
      dbUpdateSessionGame(sessionId, gameId, false).catch(console.warn);
    },
    [syncChannel]
  );

  // 4. Attendance, Check-in & Tribunal del Humo
  const checkInToSession = useCallback(
    (sessionId: string, simulatedTime?: string, userId?: string) => {
      const targetUserId = userId || currentUserId;
      const targetPlayer = players.find((p) => p.id === targetUserId) || currentUser;

      const currentTime = simulatedTime || formatMinutesToTime(new Date().getHours() * 60 + new Date().getMinutes());

      setSessions((prevSessions) => {
        const targetSession = prevSessions.find((s) => s.id === sessionId);
        if (!targetSession) return prevSessions;

        const participant = targetSession.participants.find((p) => p.userId === targetUserId);
        if (!participant) return prevSessions;

        const evaluation = evaluateCheckInStatus(
          participant.availableFrom,
          participant.precisionMinutes,
          currentTime
        );

        // Update player's stats & title
        setPlayers((prevPlayers) => {
          const updatedPlayers = prevPlayers.map((player) => {
            if (player.id !== targetUserId) return player;

            const newKarma = Math.min(100, Math.max(0, player.karmaScore + evaluation.karmaDelta));
            const newOnTime = evaluation.status === 'on_time' ? player.onTimeCount + 1 : player.onTimeCount;
            const newLate = evaluation.status === 'late' ? player.lateCount + 1 : player.lateCount;
            const newStreak = evaluation.status === 'on_time' ? player.currentStreak + 1 : 0;
            const newTitle = calculateTitleForPlayer(
              newKarma,
              newOnTime,
              newLate,
              player.noShowCount
            );

            // Record sanction history item
            const sanctionItem: SanctionRecord = {
              id: `sanction-${Date.now()}`,
              userId: targetUserId,
              sessionId,
              sessionTitle: targetSession.title,
              date: targetSession.date,
              type: evaluation.status === 'on_time' ? 'on_time_bonus' : 'late',
              promisedTime: participant.availableFrom,
              precisionMinutes: participant.precisionMinutes,
              actualTime: currentTime,
              karmaDelta: evaluation.karmaDelta,
              description:
                evaluation.status === 'on_time'
                  ? `Check-in puntual a las ${currentTime} (±${participant.precisionMinutes}m). ¡+5 Karma!`
                  : `Llegada demorada a las ${currentTime} (+${evaluation.minutesDiff}m tarde). -10 Karma.`,
            };

            setSanctions((prevSanc) => {
              const updatedSanc = [sanctionItem, ...prevSanc];
              syncChannel?.postMessage({ type: 'SYNC_SANCTIONS', payload: updatedSanc });
              return updatedSanc;
            });
            dbInsertSanction(sanctionItem).catch(console.warn);

            // Discord Rich Embed & Webhook
            const discordLog = buildCheckinUpdateLog(
              targetSession,
              player,
              evaluation.status,
              currentTime,
              evaluation.karmaDelta,
              newKarma
            );
            dispatchDiscordPipeline(discordLog);

            return {
              ...player,
              karmaScore: newKarma,
              onTimeCount: newOnTime,
              lateCount: newLate,
              currentStreak: newStreak,
              activeTitle: newTitle,
            };
          });

          syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: updatedPlayers });
          return updatedPlayers;
        });

        // Update participant in session
        const updatedParticipants = targetSession.participants.map((p) => {
          if (p.userId !== targetUserId) return p;
          const updatedPart = {
            ...p,
            checkedInAt: currentTime,
            attendanceStatus: evaluation.status,
          };
          dbUpsertParticipant(sessionId, {
            ...updatedPart,
            checkedInAt: new Date().toISOString(),
          }).catch(console.warn);
          return updatedPart;
        });

        const updatedSessions = prevSessions.map((s) =>
          s.id === sessionId ? { ...s, participants: updatedParticipants } : s
        );

        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updatedSessions });
        return updatedSessions;
      });

      triggerNotificationPipeline(
        {
          title: `⌚ Check-in: ${targetPlayer.displayName}`,
          body: `Registró presencia a las ${currentTime}. Estado: ${simulatedTime ? 'Simulado' : 'Confirmado'}.`,
          tag: `checkin_${sessionId}_${targetUserId}`,
          sessionId,
          targetUserIds: players.map((p) => p.id),
        },
        'ping'
      );
    },
    [
      currentUserId,
      currentUser,
      players,
      syncChannel,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  const issueDirectSanction = useCallback(
    (
      sessionId: string,
      targetUserId: string,
      type: 'late' | 'no_show',
      reason: string
    ) => {
      const targetPlayer = players.find((p) => p.id === targetUserId);
      const session = sessions.find((s) => s.id === sessionId);
      if (!targetPlayer) return;

      const karmaDelta = type === 'no_show' ? -25 : -10;
      const newKarma = Math.min(100, Math.max(0, targetPlayer.karmaScore + karmaDelta));
      const newLateCount = type === 'late' ? targetPlayer.lateCount + 1 : targetPlayer.lateCount;
      const newNoShowCount =
        type === 'no_show' ? targetPlayer.noShowCount + 1 : targetPlayer.noShowCount;
      const newTitle = calculateTitleForPlayer(
        newKarma,
        targetPlayer.onTimeCount,
        newLateCount,
        newNoShowCount
      );

      const sanctionRecord: SanctionRecord = {
        id: `sanction-${Date.now()}`,
        userId: targetUserId,
        sessionId,
        sessionTitle: session?.title || 'Sesión de Juego',
        date: session?.date || new Date().toISOString().split('T')[0],
        type,
        promisedTime: '22:00',
        precisionMinutes: 15,
        karmaDelta,
        description: reason,
      };

      setSanctions((prev) => {
        const updated = [sanctionRecord, ...prev];
        syncChannel?.postMessage({ type: 'SYNC_SANCTIONS', payload: updated });
        return updated;
      });
      dbInsertSanction(sanctionRecord).catch(console.warn);

      setPlayers((prev) => {
        const updated = prev.map((p) => {
          if (p.id !== targetUserId) return p;
          return {
            ...p,
            karmaScore: newKarma,
            lateCount: newLateCount,
            noShowCount: newNoShowCount,
            currentStreak: 0,
            activeTitle: newTitle,
          };
        });
        syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: updated });
        return updated;
      });

      // Discord notification
      const discordLog = buildSanctionIssuedLog(sanctionRecord, targetPlayer, newKarma, newTitle);
      dispatchDiscordPipeline(discordLog);

      // Push notification with gavel thud sound
      triggerNotificationPipeline(
        {
          title: `⚖️ Sanción Tribunal del Humo: ${targetPlayer.displayName}`,
          body: reason,
          tag: `sanction_${targetUserId}`,
          sessionId,
          targetUserIds: players.map((p) => p.id),
        },
        'sanction'
      );
    },
    [
      players,
      sessions,
      syncChannel,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  const castAttendanceVote = useCallback(
    (
      sessionId: string,
      targetUserId: string,
      vote: AttendanceVote['vote'],
      reason?: string
    ) => {
      const newVote: AttendanceVote = {
        voterId: currentUserId,
        targetUserId,
        vote,
        reason,
        timestamp: new Date().toISOString(),
      };

      setSessions((prev) => {
        const updated = prev.map((sess) => {
          if (sess.id !== sessionId) return sess;

          // Replace or add vote
          const filteredVotes = sess.attendanceVotes.filter(
            (v) => !(v.voterId === currentUserId && v.targetUserId === targetUserId)
          );
          const allVotes = [...filteredVotes, newVote];

          // Check for majority / unanimous sanctions
          const noShowVotes = allVotes.filter(
            (v) => v.targetUserId === targetUserId && v.vote === 'no_show'
          ).length;

          if (noShowVotes >= 2) {
            // Trigger automatic sanction
            setTimeout(() => {
              issueDirectSanction(
                sessionId,
                targetUserId,
                'no_show',
                `Votado Fantasma en el Tribunal por ${noShowVotes} jugadores presentes.`
              );
            }, 50);
          }

          return { ...sess, attendanceVotes: allVotes };
        });

        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });
      dbUpsertAttendanceVote(sessionId, newVote).catch(console.warn);
    },
    [currentUserId, syncChannel, issueDirectSanction]
  );

  const pingLatePlayer = useCallback(
    async (sessionId: string, targetUserId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      const targetPlayer = players.find((p) => p.id === targetUserId);
      if (!session || !targetPlayer) return;

      const participant = session.participants.find((p) => p.userId === targetUserId);
      const promisedMins = parseTimeMinutes(participant?.availableFrom || '22:00');
      const precision = participant?.precisionMinutes || 15;
      const strictDeadline = promisedMins + precision;
      const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
      const minutesLate = Math.max(5, nowMins - strictDeadline);

      const discordLog = buildLatePingLog(session, targetPlayer, currentUser, minutesLate);
      await dispatchDiscordPipeline(discordLog);

      await triggerNotificationPipeline(
        {
          title: `🚨 Reclamo de Presencia: ¡Entrá ${targetPlayer.displayName}!`,
          body: `${currentUser.displayName} te mandó un ping de alerta. Estás demorado para "${session.title}".`,
          tag: `ping_${targetUserId}`,
          sessionId,
          targetUserIds: [targetUserId],
        },
        'ping'
      );
    },
    [
      sessions,
      players,
      currentUser,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  // 5. Global Chat
  const sendChatMessage = useCallback(
    (params: {
      content: string;
      replyToId?: string;
      linkedSessionId?: string;
      forwardToDiscord?: boolean;
    }) => {
      if (!params.content.trim()) return;

      const newMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        userId: currentUserId,
        content: params.content.trim(),
        mentions: params.content.includes('@todos') || params.content.includes('@everyone')
          ? ['everyone']
          : [],
        replyToId: params.replyToId,
        linkedSessionId: params.linkedSessionId,
        reactions: [],
        forwardedToDiscord: Boolean(params.forwardToDiscord || discordConfig.events.chat_broadcast),
        createdAt: new Date().toISOString(),
      };

      setChatMessages((prev) => {
        const updated = [...prev, newMessage];
        syncChannel?.postMessage({ type: 'SYNC_CHAT', payload: updated });
        return updated;
      });
      dbInsertChatMessage(newMessage).catch(console.warn);

      // Sound chime
      playNotificationSound('message');

      // Forward to Discord if requested or configured
      if (newMessage.forwardedToDiscord) {
        const session = sessions.find((s) => s.id === params.linkedSessionId);
        const log = buildChatBroadcastLog(newMessage, currentUser, session);
        dispatchDiscordPipeline(log);
      }

      // Local push alert for other users
      triggerNotificationPipeline(
        {
          title: `💬 ${currentUser.displayName} en Chat`,
          body: params.content,
          tag: `chat_${newMessage.id}`,
          sessionId: params.linkedSessionId,
          targetUserIds: players.filter((p) => p.id !== currentUserId).map((p) => p.id),
        },
        'message'
      );
    },
    [
      currentUserId,
      currentUser,
      discordConfig.events.chat_broadcast,
      sessions,
      players,
      syncChannel,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  const toggleMessageReaction = useCallback(
    (messageId: string, emoji: string) => {
      setChatMessages((prev) => {
        const updated = prev.map((msg) => {
          if (msg.id !== messageId) return msg;

          const existingReaction = msg.reactions.find((r) => r.emoji === emoji);
          let newReactions;

          if (existingReaction) {
            const hasReacted = existingReaction.userIds.includes(currentUserId);
            if (hasReacted) {
              const updatedUserIds = existingReaction.userIds.filter((id) => id !== currentUserId);
              newReactions =
                updatedUserIds.length > 0
                  ? msg.reactions.map((r) =>
                      r.emoji === emoji ? { ...r, userIds: updatedUserIds } : r
                    )
                  : msg.reactions.filter((r) => r.emoji !== emoji);
            } else {
              newReactions = msg.reactions.map((r) =>
                r.emoji === emoji ? { ...r, userIds: [...r.userIds, currentUserId] } : r
              );
            }
          } else {
            newReactions = [...msg.reactions, { emoji, userIds: [currentUserId] }];
          }

          dbUpdateChatReactions(msg.id, newReactions).catch(console.warn);
          return { ...msg, reactions: newReactions };
        });

        syncChannel?.postMessage({ type: 'SYNC_CHAT', payload: updated });
        return updated;
      });
    },
    [currentUserId, syncChannel]
  );

  // 6. Discord Bot & Webhook Settings
  const updateDiscordConfig = useCallback((patch: Partial<DiscordIntegrationConfig>) => {
    setDiscordConfig((prev) => {
      const next = { ...prev, ...patch };
      dbUpdateDiscordConfig(next).catch(console.warn);
      return next;
    });
  }, []);

  const toggleDiscordEvent = useCallback((eventType: DiscordEventType, enabled: boolean) => {
    setDiscordConfig((prev) => {
      const next = {
        ...prev,
        events: {
          ...prev.events,
          [eventType]: enabled,
        },
      };
      dbUpdateDiscordConfig(next).catch(console.warn);
      return next;
    });
  }, []);

  const sendTestDiscordNotification = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    if (!discordConfig.webhookUrl) {
      return {
        ok: false,
        message: 'No se ingresó una URL de Webhook de Discord. Ingresá una en Configuración.',
      };
    }

    const testLog: DiscordNotificationLog = {
      id: `test-${Date.now()}`,
      eventType: 'chat_broadcast',
      content: `🎮 **Test de Integración Boludos Gaming** ejecutado por <@${currentUser.discordId}> (${currentUser.displayName})`,
      embed: {
        title: '✅ Conexión Exitosa con Discord Webhook',
        description:
          'Este mensaje confirma que el Bot de Boludos Gaming está enlazado correctamente al canal de Discord.',
        color: 0x10b981,
        fields: [
          { name: 'Canal', value: discordConfig.channelName || '#gaming-general', inline: true },
          { name: 'Servidor', value: discordConfig.guildName || 'Discord Server', inline: true },
          { name: 'Modo', value: 'Direct Webhook (Free Tier)', inline: true },
        ],
        footer: { text: 'Boludos Gaming • Webhook Verification' },
        timestamp: new Date().toISOString(),
      },
      buttons: [
        { label: 'Abrir App', actionType: 'open_app', style: 'primary' },
      ],
      createdAt: new Date().toISOString(),
      deliveredToWebhook: false,
    };

    const result = await dispatchDiscordWebhook(discordConfig.webhookUrl, testLog);
    const finalLog = {
      ...testLog,
      deliveredToWebhook: result.ok,
      webhookError: result.error,
    };

    setDiscordLogs((prev) => [finalLog, ...prev]);

    if (result.ok) {
      return { ok: true, message: '¡Mensaje de prueba enviado exitosamente a tu canal de Discord!' };
    } else {
      return { ok: false, message: result.error || 'Error desconocido al enviar a Discord' };
    }
  }, [discordConfig, currentUser]);

  const triggerDiscordButtonInteraction = useCallback(
    (
      actionType: 'join_session' | 'checkin_session' | 'spin_roulette',
      sessionId: string,
      simulatedDiscordUserId?: string
    ) => {
      // Find player by discord ID or use current user
      const targetPlayer = simulatedDiscordUserId
        ? players.find((p) => p.discordId === simulatedDiscordUserId) || currentUser
        : currentUser;

      switch (actionType) {
        case 'join_session':
          joinOrUpdateSessionSchedule(sessionId, {
            availableFrom: '22:00',
            availableUntil: '01:30',
            precisionMinutes: 15,
            note: 'Unido mediante botón interactivo de Discord',
            userId: targetPlayer.id,
          });
          break;
        case 'checkin_session':
          checkInToSession(sessionId, undefined, targetPlayer.id);
          break;
        case 'spin_roulette':
          spinSessionRoulette(sessionId);
          break;
      }
    },
    [
      players,
      currentUser,
      joinOrUpdateSessionSchedule,
      checkInToSession,
      spinSessionRoulette,
    ]
  );

  // 7. Push Notifications & Permissions
  const requestPushPermission = useCallback(async (): Promise<NotificationPermission | 'unsupported'> => {
    const result = await requestBrowserNotificationPermission();
    setNotificationPermission(result);
    return result;
  }, []);

  const sendTestPushNotification = useCallback(async () => {
    await triggerNotificationPipeline(
      {
        title: '🔔 Test de Notificación Boludos Gaming',
        body: 'El sistema de notificaciones sonoras y visuales está 100% operativo.',
        tag: 'test_push',
        targetUserIds: [currentUserId],
      },
      'ping'
    );
  }, [currentUserId, triggerNotificationPipeline]);

  // 8. Reset Utilities
  const resetDemoData = useCallback(() => {
    if (typeof window !== 'undefined') {
      Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    }
    setPlayers([]);
    setCurrentUserId('');
    setIsAuthenticated(false);
    setShowOnboardingModal(false);
    setShowWeeklyScheduleModal(false);
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

  const value = useMemo<AppContextValue>(
    () => ({
      currentUser,
      players,
      isAuthenticated,
      showOnboardingModal,
      setShowOnboardingModal,
      showWeeklyScheduleModal,
      setShowWeeklyScheduleModal,
      switchActivePlayer,
      loginAsProfile,
      createAndLoginProfile,
      logout,
      loginWithDiscord,
      completeOnboarding,
      isSupabaseConnected: isSupabaseConfigured(),

      updateWeeklySchedule,
      setDailyOverride,
      toggleTodayNotPlaying,
      updateCategoryPreferences,

      games,
      preferences,
      updateGamePreference,
      addGame,

      sessions,
      activeSessionId,
      setActiveSessionId,
      createSession,
      joinOrUpdateSessionSchedule,
      leaveSession,
      spinSessionRoulette,
      lockSessionGame,

      sanctions,
      checkInToSession,
      castAttendanceVote,
      issueDirectSanction,
      pingLatePlayer,

      chatMessages,
      sendChatMessage,
      toggleMessageReaction,

      discordConfig,
      discordLogs,
      updateDiscordConfig,
      toggleDiscordEvent,
      sendTestDiscordNotification,
      triggerDiscordButtonInteraction,

      pushAlerts,
      notificationPermission,
      requestPushPermission,
      sendTestPushNotification,

      resetDemoData,
    }),
    [
      currentUser,
      players,
      isAuthenticated,
      showOnboardingModal,
      showWeeklyScheduleModal,
      switchActivePlayer,
      loginAsProfile,
      createAndLoginProfile,
      logout,
      loginWithDiscord,
      completeOnboarding,
      updateWeeklySchedule,
      setDailyOverride,
      toggleTodayNotPlaying,
      updateCategoryPreferences,
      games,
      preferences,
      updateGamePreference,
      addGame,
      sessions,
      activeSessionId,
      setActiveSessionId,
      createSession,
      joinOrUpdateSessionSchedule,
      leaveSession,
      spinSessionRoulette,
      lockSessionGame,
      sanctions,
      checkInToSession,
      castAttendanceVote,
      issueDirectSanction,
      pingLatePlayer,
      chatMessages,
      sendChatMessage,
      toggleMessageReaction,
      discordConfig,
      discordLogs,
      updateDiscordConfig,
      toggleDiscordEvent,
      sendTestDiscordNotification,
      triggerDiscordButtonInteraction,
      pushAlerts,
      notificationPermission,
      requestPushPermission,
      sendTestPushNotification,
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
