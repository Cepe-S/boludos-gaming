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
  ChatMessage,
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
  UserGamePreference,
} from '../types/domain';
import { AppContextValue } from '../types/context';
import {
  calculateGameSynchrony,
  calculateScheduleOverlap,
  calculateTitleForPlayer,
  evaluateCheckInStatus,
  formatMinutesToTime,
  parseTimeMinutes,
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
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import {
  INITIAL_CHAT_MESSAGES,
  INITIAL_DISCORD_CONFIG,
  INITIAL_DISCORD_LOGS,
  INITIAL_GAMES,
  INITIAL_PLAYERS,
  INITIAL_PREFERENCES,
  INITIAL_SANCTIONS,
  INITIAL_SESSIONS,
} from '../lib/mockData';

const STORAGE_KEYS = {
  CURRENT_USER_ID: 'bg_v1_current_user_id',
  PLAYERS: 'bg_v1_players',
  GAMES: 'bg_v1_games',
  PREFERENCES: 'bg_v1_preferences',
  SESSIONS: 'bg_v1_sessions',
  ACTIVE_SESSION_ID: 'bg_v1_active_session_id',
  SANCTIONS: 'bg_v1_sanctions',
  CHAT_MESSAGES: 'bg_v1_chat_messages',
  DISCORD_CONFIG: 'bg_v1_discord_config',
  DISCORD_LOGS: 'bg_v1_discord_logs',
  PUSH_ALERTS: 'bg_v1_push_alerts',
} as const;

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

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Sync Channel for Multi-tab consistency
  const syncChannel = useMemo(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      return new BroadcastChannel('boludos_gaming_sync');
    }
    return null;
  }, []);

  // Players & Auth State
  const [players, setPlayers] = useState<PlayerProfile[]>(() =>
    loadFromStorage(STORAGE_KEYS.PLAYERS, INITIAL_PLAYERS)
  );

  const [currentUserId, setCurrentUserId] = useState<string>(() =>
    loadFromStorage(STORAGE_KEYS.CURRENT_USER_ID, INITIAL_PLAYERS[0].id)
  );

  const currentUser = useMemo(() => {
    return players.find((p) => p.id === currentUserId) || players[0] || INITIAL_PLAYERS[0];
  }, [players, currentUserId]);

  // Catalog Games & User Preferences (1-5★)
  const [games, setGames] = useState<Game[]>(() =>
    loadFromStorage(STORAGE_KEYS.GAMES, INITIAL_GAMES)
  );

  const [preferences, setPreferences] = useState<UserGamePreference[]>(() =>
    loadFromStorage(STORAGE_KEYS.PREFERENCES, INITIAL_PREFERENCES)
  );

  // Sessions State
  const [sessions, setSessions] = useState<GamingSession[]>(() =>
    loadFromStorage(STORAGE_KEYS.SESSIONS, INITIAL_SESSIONS)
  );

  const [activeSessionId, setActiveSessionIdState] = useState<string>(() =>
    loadFromStorage(STORAGE_KEYS.ACTIVE_SESSION_ID, INITIAL_SESSIONS[0]?.id || '')
  );

  // Sanctions History
  const [sanctions, setSanctions] = useState<SanctionRecord[]>(() =>
    loadFromStorage(STORAGE_KEYS.SANCTIONS, INITIAL_SANCTIONS)
  );

  // Global Chat Messages
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    loadFromStorage(STORAGE_KEYS.CHAT_MESSAGES, INITIAL_CHAT_MESSAGES)
  );

  // Discord Integration State
  const [discordConfig, setDiscordConfig] = useState<DiscordIntegrationConfig>(() =>
    loadFromStorage(STORAGE_KEYS.DISCORD_CONFIG, INITIAL_DISCORD_CONFIG)
  );

  const [discordLogs, setDiscordLogs] = useState<DiscordNotificationLog[]>(() =>
    loadFromStorage(STORAGE_KEYS.DISCORD_LOGS, INITIAL_DISCORD_LOGS)
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

  // Save changes to localStorage
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.PLAYERS, players);
  }, [players]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CURRENT_USER_ID, currentUserId);
  }, [currentUserId]);

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

  // 1. Current User & Auth
  const switchActivePlayer = useCallback(
    (userId: string) => {
      const target = players.find((p) => p.id === userId);
      if (target) {
        setCurrentUserId(userId);
      }
    },
    [players]
  );

  const loginWithDiscord = useCallback(async () => {
    if (isSupabaseConfigured() && supabase) {
      await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: window.location.origin,
        },
      });
    } else {
      // Demo Mode: Cycle through mock profiles
      const currentIndex = players.findIndex((p) => p.id === currentUserId);
      const nextIndex = (currentIndex + 1) % players.length;
      const nextUser = players[nextIndex];
      setCurrentUserId(nextUser.id);

      triggerNotificationPipeline(
        {
          title: '🎮 Perfil de Discord Cambiado',
          body: `Iniciaste como ${nextUser.displayName} (${nextUser.discordUsername}). Modo Demo 100% Funcional.`,
          tag: 'auth_switch',
          targetUserIds: [nextUser.id],
        },
        'message'
      );
    }
  }, [players, currentUserId, triggerNotificationPipeline]);

  // 2. Games & Preferences (1-5★)
  const updateGamePreference = useCallback(
    (gameId: string, plays: boolean, rating: GameRating) => {
      setPreferences((prev) => {
        const filtered = prev.filter(
          (p) => !(p.userId === currentUserId && p.gameId === gameId)
        );
        const updated = [...filtered, { userId: currentUserId, gameId, plays, rating }];
        syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: updated });
        return updated;
      });
    },
    [currentUserId, syncChannel]
  );

  const addGame = useCallback(
    (gameData: Omit<Game, 'id' | 'addedBy'>) => {
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

      // Add default preference for current user
      setPreferences((prev) => {
        const updated = [
          ...prev,
          { userId: currentUserId, gameId: newGame.id, plays: true, rating: 4 as GameRating },
        ];
        syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: updated });
        return updated;
      });

      triggerNotificationPipeline(
        {
          title: '🎮 Nuevo Juego Agregado',
          body: `${currentUser.displayName} agregó "${newGame.name}" al catálogo de Boludos Gaming.`,
          tag: 'game_added',
          targetUserIds: players.map((p) => p.id),
        },
        'message'
      );
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
      const newSession: GamingSession = {
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
        participants: [
          {
            userId: currentUserId,
            joinedAt: new Date().toISOString(),
            availableFrom: params.availableFrom,
            availableUntil: params.availableUntil,
            precisionMinutes: params.precisionMinutes,
            attendanceStatus: 'pending',
          },
        ],
      };

      setSessions((prev) => {
        const updated = [newSession, ...prev];
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });

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
          body: `${currentUser.displayName} convocó a "${params.title}" para las ${params.availableFrom} (±${params.precisionMinutes}m).`,
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
          return {
            ...p,
            checkedInAt: currentTime,
            attendanceStatus: evaluation.status,
          };
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
    setDiscordConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleDiscordEvent = useCallback((eventType: DiscordEventType, enabled: boolean) => {
    setDiscordConfig((prev) => ({
      ...prev,
      events: {
        ...prev.events,
        [eventType]: enabled,
      },
    }));
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

  // 8. Demo Utilities
  const resetDemoData = useCallback(() => {
    if (typeof window !== 'undefined') {
      Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    }
    setPlayers(INITIAL_PLAYERS);
    setCurrentUserId(INITIAL_PLAYERS[0].id);
    setGames(INITIAL_GAMES);
    setPreferences(INITIAL_PREFERENCES);
    setSessions(INITIAL_SESSIONS);
    setActiveSessionIdState(INITIAL_SESSIONS[0]?.id || '');
    setSanctions(INITIAL_SANCTIONS);
    setChatMessages(INITIAL_CHAT_MESSAGES);
    setDiscordConfig(INITIAL_DISCORD_CONFIG);
    setDiscordLogs(INITIAL_DISCORD_LOGS);
    setPushAlerts([]);

    syncChannel?.postMessage({
      type: 'SYNC_ALL',
      payload: {
        players: INITIAL_PLAYERS,
        sessions: INITIAL_SESSIONS,
        preferences: INITIAL_PREFERENCES,
        sanctions: INITIAL_SANCTIONS,
        chatMessages: INITIAL_CHAT_MESSAGES,
        discordLogs: INITIAL_DISCORD_LOGS,
        games: INITIAL_GAMES,
      },
    });

    playNotificationSound('message');
  }, [syncChannel]);

  const value = useMemo<AppContextValue>(
    () => ({
      currentUser,
      players,
      switchActivePlayer,
      loginWithDiscord,
      isSupabaseConnected: isSupabaseConfigured(),

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
      switchActivePlayer,
      loginWithDiscord,
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
