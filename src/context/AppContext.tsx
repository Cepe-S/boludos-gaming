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
  AttendanceVote,
  CategoryPreferenceLevel,
  ChatMessage,
  DailyScheduleOverride,
  DiscordEventType,
  DiscordIntegrationConfig,
  DiscordNotificationLog,
  ExternalGamePlatform,
  ExternalRatedGame,
  Game,
  GameRating,
  GamingGroup,
  GamingSession,
  GroupDiscordConfig,
  InstantSessionRsvp,
  PlayerProfile,
  PlayerSteamProfile,
  PlayerTasteProfile,
  PrecisionMinutes,
  PushNotificationAlert,
  RecommendationVoteValue,
  SanctionRecord,
  SessionCalloutRecord,
  SessionParticipant,
  TasteDimensionKey,
  UnifiedSelectorGame,
  UserGamePreference,
  WeeklySchedule,
} from '../types/domain';
import { AppContextValue } from '../types/context';
import { fetchSteamProfileLibrary } from '../lib/steamService';
import {
  MAX_AUTO_SELECTED_STEAM_GAMES,
  buildPlayerTasteVector,
  isConsiderableSteamGame,
  isNonGameSteamApp,
  normalizeGameName,
} from '../lib/tasteProfileEngine';
import { computePlayerPvj6dProfile } from '../lib/playerCategorizationEngine';
import {
  calculateGameSynchrony,
  calculateScheduleOverlap,
  calculateTitleForPlayer,
  createDefaultWeeklySchedule,
  evaluateCheckInStatus,
  formatMinutesToTime,
  getEffectiveDailySchedule,
  getProbableAvailablePlayersForSession,
  parseTimeMinutes,
  reconcileAutoParticipantsForSession,
  reconcileSessionParticipantsWithSchedules,
  spinWeightedRoulette,
} from '../lib/matchmakingEngine';
import {
  buildChatBroadcastLog,
  buildCheckinUpdateLog,
  buildGroupWebhookTestLog,
  buildLatePingLog,
  buildPlayerJoinedLog,
  buildRouletteWinnerLog,
  buildSanctionIssuedLog,
  buildSessionCalloutDiscordPayload,
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
  dbAddGameToGroup,
  dbAddMemberToGroup,
  dbCastGroupRecommendationVote,
  dbCreateSession,
  dbDeleteGroup,
  dbDeleteParticipant,
  dbDeleteSession,
  dbInsertChatMessage,
  dbInsertGame,
  dbInsertSanction,
  dbRemoveGameFromGroup,
  dbRemoveMemberFromGroup,
  dbUpdateChatReactions,
  dbUpdateDiscordConfig,
  dbUpdateSessionGame,
  dbUpdateSessionInvitesAndCallouts,
  dbUpsertAttendanceVote,
  dbUpsertGroup,
  dbUpsertInstantRsvp,
  dbUpsertParticipant,
  dbUpsertPreference,
  dbUpsertProfile,
  fetchAllSupabaseData,
  subscribeToSupabaseRealtime,
} from '../lib/supabaseSync';
import {
  INITIAL_DISCORD_CONFIG,
  INITIAL_GAMES,
} from '../lib/mockData';

const STORAGE_KEYS = {
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

const STORAGE_RESET_GEN_KEY = 'bg_prod_v4_reset_gen_1';
let didRunInitialStorageReset = false;
let pendingInitialSignOut: Promise<unknown> | null = null;

// One-time reset guard for clean v4 production start + purge of legacy bg_v1_ keys
if (typeof window !== 'undefined') {
  try {
    const hasResetGen1 = localStorage.getItem(STORAGE_RESET_GEN_KEY) === '1';
    if (!hasResetGen1) {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('bg_') || key.startsWith('sb-')) {
          localStorage.removeItem(key);
        }
      });
      localStorage.setItem(STORAGE_RESET_GEN_KEY, '1');
      didRunInitialStorageReset = true;
    } else {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('bg_v1_')) {
          localStorage.removeItem(key);
        }
      });
    }
  } catch (error) {
    console.warn('Error purging stale localStorage keys:', error);
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

function extractInviteCodeFromInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('://') || trimmed.includes('?')) {
      const url = trimmed.includes('://')
        ? new URL(trimmed)
        : new URL(trimmed, 'https://boludos.local');
      const fromQuery = url.searchParams.get('invite') || url.searchParams.get('joinGroup');
      if (fromQuery) {
        return fromQuery.trim().toUpperCase();
      }
    }
  } catch {
    // Fall through to regex/string parsing
  }
  const match = trimmed.match(/(?:invite|joinGroup)=([^&#\s]+)/i);
  if (match && match[1]) {
    return decodeURIComponent(match[1]).trim().toUpperCase();
  }
  return trimmed.toUpperCase();
}

function parseInitialInviteCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const urlInvite = params.get('invite') || params.get('joinGroup');
    if (urlInvite && urlInvite.trim()) {
      const normalized = urlInvite.trim().toUpperCase();
      saveToStorage(STORAGE_KEYS.PENDING_INVITE_CODE, normalized);
      return normalized;
    }
  } catch (error) {
    console.warn('Error parsing URL invite code:', error);
  }
  return loadFromStorage<string | null>(STORAGE_KEYS.PENDING_INVITE_CODE, null);
}

function generateUniqueInviteCode(existingGroups: GamingGroup[]): string {
  const existing = new Set(existingGroups.map((g) => g.inviteCode.toUpperCase()));
  for (let i = 0; i < 20; i++) {
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase().padEnd(4, 'X');
    const candidate = `BG-${rand}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `BG-${Date.now().toString(36).slice(-4).toUpperCase()}`;
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

function stripNonGamesFromPlayer(player: PlayerProfile): {
  cleanedPlayer: PlayerProfile;
  removedAny: boolean;
} {
  let removedAny = false;

  let nextSteamProfile = player.steamProfile;
  if (nextSteamProfile?.ownedGames) {
    const cleanOwned = nextSteamProfile.ownedGames.filter((g) => !isNonGameSteamApp(g));
    if (cleanOwned.length !== nextSteamProfile.ownedGames.length) {
      removedAny = true;
      const totalHours =
        Math.round(cleanOwned.reduce((acc, g) => acc + (g.playtimeHours || 0), 0) * 10) / 10;
      const considerableGamesCount = cleanOwned.filter((g, idx) =>
        isConsiderableSteamGame(g, idx)
      ).length;
      nextSteamProfile = {
        ...nextSteamProfile,
        totalHours,
        considerableGamesCount,
        ownedGames: cleanOwned,
      };
    }
  }

  let nextTasteProfile = player.tasteProfile;
  if (nextTasteProfile) {
    const origTopMp = nextTasteProfile.topMultiplayerGames || [];
    const origTopSp = nextTasteProfile.topSingleplayerGames || [];
    const origExt = nextTasteProfile.externalGames || [];

    const cleanTopMp = origTopMp.filter((g) => !isNonGameSteamApp(g));
    const cleanTopSp = origTopSp.filter((g) => !isNonGameSteamApp(g));
    const cleanExt = origExt.filter((g) => !isNonGameSteamApp(g));

    if (
      cleanTopMp.length !== origTopMp.length ||
      cleanTopSp.length !== origTopSp.length ||
      cleanExt.length !== origExt.length
    ) {
      removedAny = true;
      nextTasteProfile = {
        ...nextTasteProfile,
        topMultiplayerGames: cleanTopMp.slice(0, 3).map((g, idx) => ({
          ...g,
          rank: (idx + 1) as 1 | 2 | 3,
        })),
        topSingleplayerGames: cleanTopSp.slice(0, 3).map((g, idx) => ({
          ...g,
          rank: (idx + 1) as 1 | 2 | 3,
        })),
        externalGames: cleanExt,
      };
    }
  }

  if (!removedAny) {
    return { cleanedPlayer: player, removedAny: false };
  }

  return {
    cleanedPlayer: {
      ...player,
      steamProfile: nextSteamProfile,
      tasteProfile: nextTasteProfile,
    },
    removedAny: true,
  };
}

function recomputeTasteProfileForPlayer(
  player: PlayerProfile,
  allPrefs: UserGamePreference[],
  allGames: Game[]
): PlayerTasteProfile {
  const { cleanedPlayer } = stripNonGamesFromPlayer(player);
  const currentTaste: PlayerTasteProfile = cleanedPlayer.tasteProfile || {
    topMultiplayerGames: [],
    topSingleplayerGames: [],
    externalGames: [],
    updatedAt: new Date().toISOString(),
  };

  let featureVector: Partial<Record<TasteDimensionKey, number>> = {};
  let topDimensions: Array<{ key: TasteDimensionKey; label: string; score: number }> = [];

  try {
    const vectorResult = buildPlayerTasteVector(cleanedPlayer, allPrefs, allGames) as
      | {
          featureVector?: Partial<Record<TasteDimensionKey, number>>;
          topDimensions?: Array<{ key: TasteDimensionKey; label: string; score: number }>;
        }
      | Partial<Record<TasteDimensionKey, number>>
      | undefined;

    if (vectorResult) {
      if ('featureVector' in vectorResult && vectorResult.featureVector) {
        featureVector = vectorResult.featureVector;
        topDimensions = vectorResult.topDimensions || [];
      } else if (typeof vectorResult === 'object') {
        featureVector = vectorResult as Partial<Record<TasteDimensionKey, number>>;
      }
    }
  } catch (err) {
    console.warn('Error in buildPlayerTasteVector:', err);
  }

  if (topDimensions.length === 0 && Object.keys(featureVector).length > 0) {
    topDimensions = Object.entries(featureVector)
      .map(([key, score]) => ({
        key: key as TasteDimensionKey,
        label: key.replace(/_/g, ' '),
        score: Number(score) || 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  let pvjProfile = currentTaste.pvjProfile;
  try {
    pvjProfile = computePlayerPvj6dProfile(cleanedPlayer, allPrefs, allGames);
  } catch (err) {
    console.warn('Error in computePlayerPvj6dProfile:', err);
  }

  return {
    ...currentTaste,
    featureVector,
    topDimensions,
    pvjProfile,
    updatedAt: new Date().toISOString(),
  };
}

function sanitizePlayerProfileNonGames(
  player: PlayerProfile,
  allPrefs: UserGamePreference[],
  allGames: Game[]
): { player: PlayerProfile; changed: boolean } {
  const { cleanedPlayer, removedAny } = stripNonGamesFromPlayer(player);
  const pvjHasNonGames = Boolean(
    cleanedPlayer.tasteProfile?.pvjProfile?.top_influencing_games?.some((g) =>
      isNonGameSteamApp({ appId: g.app_id, name: g.name })
    )
  );

  if (!removedAny && !pvjHasNonGames) {
    return { player, changed: false };
  }

  const updatedTaste = recomputeTasteProfileForPlayer(cleanedPlayer, allPrefs, allGames);
  return {
    player: {
      ...cleanedPlayer,
      tasteProfile: updatedTaste,
    },
    changed: true,
  };
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
  const activeSessionUserRef = useRef<{ userId: string; isAuthenticated: boolean }>({
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

  // Catalog Games & User Preferences (1-5★) - only games keeps initial catalog
  const [games, setGames] = useState<Game[]>(() =>
    loadFromStorage(STORAGE_KEYS.GAMES, INITIAL_GAMES)
  );

  const [preferences, setPreferences] = useState<UserGamePreference[]>(() =>
    loadFromStorage(STORAGE_KEYS.PREFERENCES, [])
  );

  // Gaming Groups State
  const [groups, setGroups] = useState<GamingGroup[]>(() =>
    loadFromStorage<GamingGroup[]>(STORAGE_KEYS.GROUPS, [])
  );

  const [activeGroupIdState, setActiveGroupIdState] = useState<string | null>(() =>
    loadFromStorage<string | null>(STORAGE_KEYS.ACTIVE_GROUP_ID, null)
  );

  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() =>
    parseInitialInviteCodeFromUrl()
  );

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

  // Sessions State - default to empty array, sanitizing legacy localStorage sessions lacking groupId
  const [sessions, setSessions] = useState<GamingSession[]>(() => {
    const stored = loadFromStorage<GamingSession[]>(STORAGE_KEYS.SESSIONS, []);
    return stored.map((s) => ({
      ...s,
      groupId: s.groupId || 'group-boludos-og',
    }));
  });

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

      // Update state with Supabase tables while preserving only an active local profile not yet flushed
      setPlayers((prev) => {
        if (data.players.length === 0 && prev.length === 0) {
          return prev;
        }
        const merged = [...data.players];
        const activeId = activeSessionUserRef.current.userId;
        const activeLocal = activeId ? prev.find((localP) => localP.id === activeId) : undefined;
        if (activeLocal && !merged.some((dbP) => dbP.id === activeLocal.id)) {
          merged.push(activeLocal);
        }
        return merged;
      });
      if (data.games.length > 0) setGames(data.games);
      setPreferences(data.preferences);
      setGroups(data.groups);
      setSessions((prev) => {
        const prevMap = new Map(prev.map((s) => [s.id, s]));
        return data.sessions.map((remote) => {
          const local = prevMap.get(remote.id);
          let nextSession = remote;

          if (
            (!remote.selectedGameIds || remote.selectedGameIds.length === 0) &&
            local?.selectedGameIds &&
            local.selectedGameIds.length > 0
          ) {
            nextSession = {
              ...nextSession,
              selectedGameIds: local.selectedGameIds,
              selectedGameId: local.selectedGameIds[0],
            };
          }

          // For instant sessions, avoid transient flicker if a participant row is mid-flight
          if (nextSession.sessionKind === 'instant' && local) {
            const goingIds = new Set(
              (nextSession.instantRsvps || [])
                .filter((r) => r.status === 'going')
                .map((r) => r.userId)
            );
            const remotePartIds = new Set(
              nextSession.participants.map((p) => p.userId)
            );
            const missingFromRemote = local.participants.filter(
              (p) => goingIds.has(p.userId) && !remotePartIds.has(p.userId)
            );
            if (missingFromRemote.length > 0) {
              nextSession = {
                ...nextSession,
                participants: [...nextSession.participants, ...missingFromRemote],
              };
            }
          }

          return nextSession;
        });
      });
      setActiveSessionIdState((prev) =>
        data.sessions.some((s) => s.id === prev) ? prev : (data.sessions[0]?.id || '')
      );
      setSanctions(data.sanctions);
      setChatMessages(data.chatMessages);
      if (data.discordConfig) setDiscordConfig(data.discordConfig);
    };

    hydrate();

    const unsubscribe = subscribeToSupabaseRealtime(() => {
      hydrate();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Listen for Supabase Discord OAuth sessions
  useEffect(() => {
    const sbClient = supabase;
    if (!sbClient) return;

    let isCancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const attachAuthListener = async () => {
      if (didRunInitialStorageReset) {
        if (!pendingInitialSignOut) {
          pendingInitialSignOut = sbClient.auth.signOut({ scope: 'local' }).catch((err) => {
            console.warn('Error clearing cached Supabase auth session on clean reset:', err);
          });
        }
        await pendingInitialSignOut;
        didRunInitialStorageReset = false;
      }

      if (isCancelled) return;

      const { data } = sbClient.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          const user = session.user;
          const userId = user.id;
          const isSameActiveUser =
            activeSessionUserRef.current.isAuthenticated &&
            activeSessionUserRef.current.userId === userId;

          // Ignore token refresh / tab-focus re-emissions when user is already active in app
          if (isSameActiveUser && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
            return;
          }
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
              dbUpsertProfile(existing).catch(console.warn);
              activeSessionUserRef.current = { userId, isAuthenticated: true };
              setTimeout(() => {
                setCurrentUserId(userId);
                setIsAuthenticated(true);
                if (
                  !existing.onboardingCompleted &&
                  !isSameActiveUser &&
                  !autoOpenedTourUserIdsRef.current.has(userId)
                ) {
                  autoOpenedTourUserIdsRef.current.add(userId);
                  setShowOnboardingModal(true);
                }
              }, 0);
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
            activeSessionUserRef.current = { userId, isAuthenticated: true };
            setTimeout(() => {
              setCurrentUserId(userId);
              setIsAuthenticated(true);
              if (!autoOpenedTourUserIdsRef.current.has(userId)) {
                autoOpenedTourUserIdsRef.current.add(userId);
                setShowOnboardingModal(true);
              }
            }, 0);
            syncChannel?.postMessage({
              type: 'SYNC_PLAYERS',
              payload: [...prevPlayers, newProfile],
            });
            return [...prevPlayers, newProfile];
          });
        }
      });

      if (isCancelled) {
        data.subscription.unsubscribe();
        return;
      }
      subscription = data.subscription;
    };

    attachAuthListener();

    return () => {
      isCancelled = true;
      subscription?.unsubscribe();
    };
  }, [syncChannel]);

  // Auto-sanitize existing profiles loaded from localStorage / Supabase to purge non-game utilities (e.g., Wallpaper Engine)
  useEffect(() => {
    if (players.length === 0) return;

    let anyChanged = false;
    const changedPlayers: PlayerProfile[] = [];
    const sanitizedPlayers = players.map((p) => {
      const res = sanitizePlayerProfileNonGames(p, preferences, games);
      if (res.changed) {
        anyChanged = true;
        changedPlayers.push(res.player);
        return res.player;
      }
      return p;
    });

    if (!anyChanged) return;

    setPlayers(sanitizedPlayers);
    changedPlayers.forEach((cp) => {
      dbUpsertProfile(cp).catch(console.warn);
    });
    syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: sanitizedPlayers });
  }, [players, preferences, games, syncChannel]);

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
      const data = event.data;
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

  // Helper to log and dispatch to Discord Webhook (group-scoped with optional global fallback)
  const dispatchDiscordPipeline = useCallback(
    async (log: DiscordNotificationLog, targetGroupId?: string) => {
      const resolvedGroupId = targetGroupId || log.groupId;
      const targetGroup = resolvedGroupId
        ? groups.find((g) => g.id === resolvedGroupId)
        : undefined;

      const enrichedLog: DiscordNotificationLog = {
        ...log,
        groupId: targetGroup?.id || log.groupId,
        groupName: targetGroup?.name || log.groupName,
      };

      let logWithStatus: DiscordNotificationLog = { ...enrichedLog };
      const eventAllowed = discordConfig.events[enrichedLog.eventType] ?? true;

      if (targetGroup) {
        const groupWebhook = targetGroup.discordConfig.webhookUrl.trim();
        if (targetGroup.discordConfig.enabled && groupWebhook) {
          if (eventAllowed) {
            const result = await dispatchDiscordWebhook(groupWebhook, enrichedLog);
            logWithStatus = {
              ...enrichedLog,
              deliveredToWebhook: result.ok,
              webhookError: result.error,
            };
          }
        } else if (
          !groupWebhook &&
          discordConfig.enabled &&
          discordConfig.webhookUrl.trim() &&
          eventAllowed
        ) {
          const result = await dispatchDiscordWebhook(discordConfig.webhookUrl, enrichedLog);
          logWithStatus = {
            ...enrichedLog,
            deliveredToWebhook: result.ok,
            webhookError: result.error,
          };
        } else if (!targetGroup.discordConfig.enabled) {
          logWithStatus = {
            ...enrichedLog,
            deliveredToWebhook: false,
            webhookError: `Webhook de Discord deshabilitado para "${targetGroup.name}"`,
          };
        } else {
          logWithStatus = {
            ...enrichedLog,
            deliveredToWebhook: false,
            webhookError: 'El grupo no tiene un Webhook de Discord configurado',
          };
        }
      } else if (discordConfig.enabled && eventAllowed && discordConfig.webhookUrl.trim()) {
        const result = await dispatchDiscordWebhook(discordConfig.webhookUrl, enrichedLog);
        logWithStatus = {
          ...enrichedLog,
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
    [groups, discordConfig, syncChannel]
  );

  // Reconcile open sessions strictly scoped to their group members
  const reconcileGroupOpenSessions = useCallback(
    (group: GamingGroup, currentPlayers: PlayerProfile[]) => {
      const memberSet = new Set(group.memberIds);
      const groupPlayers = currentPlayers.filter((p) => memberSet.has(p.id));

      setSessions((prevSessions) => {
        const updatedSessions = prevSessions.map((sess) => {
          if (sess.groupId !== group.id || sess.status === 'finished' || sess.sessionKind === 'instant') {
            return sess;
          }
          const reconciled = reconcileAutoParticipantsForSession(
            sess,
            groupPlayers,
            undefined,
            group.memberIds
          );
          const nextIds = new Set(reconciled.participants.map((p) => p.userId));
          for (const oldP of sess.participants) {
            if (!nextIds.has(oldP.userId)) {
              dbDeleteParticipant(sess.id, oldP.userId).catch(console.warn);
            }
          }
          for (const p of reconciled.participants) {
            dbUpsertParticipant(sess.id, p).catch(console.warn);
          }
          return reconciled;
        });
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updatedSessions });
        return updatedSessions;
      });
    },
    [syncChannel]
  );

  const reconcileSessionsScopedToGroups = useCallback(
    (updatedPlayers: PlayerProfile[], filterDate?: string) => {
      setSessions((prevSessions) => {
        const updatedSessions = prevSessions.map((sess) => {
          if (sess.status === 'finished' || sess.sessionKind === 'instant') return sess;
          if (filterDate && sess.date !== filterDate) return sess;

          const sessGroup = groups.find((g) => g.id === sess.groupId);
          const groupPlayers = sessGroup
            ? updatedPlayers.filter((p) => sessGroup.memberIds.includes(p.id))
            : updatedPlayers;

          const reconciledParticipants = reconcileSessionParticipantsWithSchedules(
            sess,
            groupPlayers,
            sessGroup?.memberIds
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
    [groups, syncChannel]
  );

  // 0. Gaming Groups & Unified App+Group Invites
  const setActiveGroupId = useCallback((groupId: string | null) => {
    setActiveGroupIdState(groupId);
  }, []);

  const getGroupInviteLink = useCallback((inviteCode: string): string => {
    if (typeof window === 'undefined') {
      return `?invite=${encodeURIComponent(inviteCode)}`;
    }
    return `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(inviteCode)}`;
  }, []);

  const createGroup = useCallback(
    (params: {
      name: string;
      description?: string;
      avatarUrl?: string;
      memberIds?: string[];
      discordConfig?: Partial<GroupDiscordConfig>;
    }): GamingGroup => {
      const nowIso = new Date().toISOString();
      const creatorId = currentUserId;
      const memberIds = Array.from(
        new Set([...(params.memberIds || []), ...(creatorId ? [creatorId] : [])])
      );
      const adminIds = creatorId ? [creatorId] : [];
      const inviteCode = generateUniqueInviteCode(groups);

      const newGroup: GamingGroup = {
        id: `group-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: params.name.trim() || 'Nuevo Grupo Gaming',
        description: params.description?.trim() || '',
        avatarUrl: params.avatarUrl?.trim() || undefined,
        inviteCode,
        createdBy: creatorId,
        memberIds,
        adminIds,
        gameIds: [],
        discordConfig: {
          enabled: params.discordConfig?.enabled ?? true,
          webhookUrl: params.discordConfig?.webhookUrl?.trim() || '',
          channelName: params.discordConfig?.channelName?.trim() || 'general-gaming',
          guildName: params.discordConfig?.guildName?.trim() || '',
          mentionRoleId: params.discordConfig?.mentionRoleId?.trim() || '',
          useEveryoneMention: params.discordConfig?.useEveryoneMention ?? false,
        },
        recommendationVotes: {},
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const nextGroups = [newGroup, ...groups];
      setGroups(nextGroups);
      syncChannel?.postMessage({ type: 'SYNC_GROUPS', payload: nextGroups });
      setActiveGroupIdState(newGroup.id);
      dbUpsertGroup(newGroup).catch(console.warn);

      return newGroup;
    },
    [currentUserId, groups, syncChannel]
  );

  const updateGroup = useCallback(
    (groupId: string, patch: Partial<Omit<GamingGroup, 'id' | 'createdAt'>>) => {
      const existing = groups.find((g) => g.id === groupId);
      if (!existing) return;

      const updatedGroup: GamingGroup = {
        ...existing,
        ...patch,
        discordConfig: patch.discordConfig
          ? { ...existing.discordConfig, ...patch.discordConfig }
          : existing.discordConfig,
        updatedAt: new Date().toISOString(),
      };

      const nextGroups = groups.map((g) => (g.id === groupId ? updatedGroup : g));
      setGroups(nextGroups);
      syncChannel?.postMessage({ type: 'SYNC_GROUPS', payload: nextGroups });
      dbUpsertGroup(updatedGroup).catch(console.warn);

      if (patch.memberIds) {
        reconcileGroupOpenSessions(updatedGroup, players);
      }
    },
    [groups, players, syncChannel, reconcileGroupOpenSessions]
  );

  const deleteGroup = useCallback(
    (groupId: string) => {
      const nextGroups = groups.filter((g) => g.id !== groupId);
      setGroups(nextGroups);
      syncChannel?.postMessage({ type: 'SYNC_GROUPS', payload: nextGroups });

      setSessions((prev) => {
        const nextSessions = prev.filter((s) => s.groupId !== groupId);
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: nextSessions });
        return nextSessions;
      });

      setActiveGroupIdState((prev) => (prev === groupId ? null : prev));
      dbDeleteGroup(groupId).catch(console.warn);
    },
    [groups, syncChannel]
  );

  const joinGroupByInviteCode = useCallback(
    (inviteCode: string, userId?: string): { ok: boolean; group?: GamingGroup; error?: string } => {
      const targetUserId = userId || currentUserId;
      if (!targetUserId) {
        return { ok: false, error: 'Debés iniciar sesión para unirte a un grupo.' };
      }

      const normalizedCode = extractInviteCodeFromInput(inviteCode);
      if (!normalizedCode) {
        return { ok: false, error: 'Ingresá un código o link de invitación válido.' };
      }

      const targetGroup = groups.find((g) => g.inviteCode.toUpperCase() === normalizedCode);
      if (!targetGroup) {
        return { ok: false, error: 'No encontramos ningún grupo con ese código de invitación.' };
      }

      const alreadyMember = targetGroup.memberIds.includes(targetUserId);
      const updatedGroup: GamingGroup = alreadyMember
        ? targetGroup
        : {
            ...targetGroup,
            memberIds: [...targetGroup.memberIds, targetUserId],
            updatedAt: new Date().toISOString(),
          };

      if (!alreadyMember) {
        setGroups((prev) => {
          const nextGroups = prev.map((g) => {
            if (g.id !== updatedGroup.id) return g;
            if (g.memberIds.includes(targetUserId)) return g;
            return {
              ...g,
              memberIds: [...g.memberIds, targetUserId],
              updatedAt: new Date().toISOString(),
            };
          });
          syncChannel?.postMessage({ type: 'SYNC_GROUPS', payload: nextGroups });
          return nextGroups;
        });
        dbAddMemberToGroup(updatedGroup.id, targetUserId).catch(console.warn);

        reconcileGroupOpenSessions(updatedGroup, players);

        const joiningPlayer = players.find((p) => p.id === targetUserId) || currentUser;
        triggerNotificationPipeline(
          {
            title: `👋 Nuevo integrante en ${updatedGroup.name}`,
            body: `${joiningPlayer.displayName} se unió al grupo con el código ${updatedGroup.inviteCode}.`,
            tag: `group_join_${updatedGroup.id}_${targetUserId}`,
            targetUserIds: updatedGroup.memberIds,
          },
          'ping'
        );
      }

      setActiveGroupIdState(updatedGroup.id);
      return { ok: true, group: updatedGroup };
    },
    [
      currentUserId,
      currentUser,
      groups,
      players,
      syncChannel,
      reconcileGroupOpenSessions,
      triggerNotificationPipeline,
    ]
  );

  const addMemberToGroup = useCallback(
    (groupId: string, userId: string) => {
      const targetGroup = groups.find((g) => g.id === groupId);
      if (!targetGroup || targetGroup.memberIds.includes(userId)) return;

      const updatedGroup: GamingGroup = {
        ...targetGroup,
        memberIds: [...targetGroup.memberIds, userId],
        updatedAt: new Date().toISOString(),
      };

      setGroups((prev) => {
        const nextGroups = prev.map((g) => {
          if (g.id !== groupId) return g;
          if (g.memberIds.includes(userId)) return g;
          return {
            ...g,
            memberIds: [...g.memberIds, userId],
            updatedAt: new Date().toISOString(),
          };
        });
        syncChannel?.postMessage({ type: 'SYNC_GROUPS', payload: nextGroups });
        return nextGroups;
      });
      dbAddMemberToGroup(groupId, userId).catch(console.warn);

      reconcileGroupOpenSessions(updatedGroup, players);
    },
    [groups, players, syncChannel, reconcileGroupOpenSessions]
  );

  const removeMemberFromGroup = useCallback(
    (groupId: string, userId: string) => {
      const targetGroup = groups.find((g) => g.id === groupId);
      if (!targetGroup || !targetGroup.memberIds.includes(userId)) return;

      const updatedGroup: GamingGroup = {
        ...targetGroup,
        memberIds: targetGroup.memberIds.filter((id) => id !== userId),
        adminIds: targetGroup.adminIds.filter((id) => id !== userId),
        updatedAt: new Date().toISOString(),
      };

      setGroups((prev) => {
        const nextGroups = prev.map((g) => {
          if (g.id !== groupId) return g;
          return {
            ...g,
            memberIds: g.memberIds.filter((id) => id !== userId),
            adminIds: g.adminIds.filter((id) => id !== userId),
            updatedAt: new Date().toISOString(),
          };
        });
        syncChannel?.postMessage({ type: 'SYNC_GROUPS', payload: nextGroups });
        return nextGroups;
      });
      dbRemoveMemberFromGroup(groupId, userId).catch(console.warn);

      reconcileGroupOpenSessions(updatedGroup, players);
    },
    [groups, players, syncChannel, reconcileGroupOpenSessions]
  );

  const addGameToGroup = useCallback(
    (groupId: string, gameId: string) => {
      setGroups((prev) => {
        const nextGroups = prev.map((g) => {
          if (g.id !== groupId) return g;
          if (g.gameIds.includes(gameId)) return g;
          return {
            ...g,
            gameIds: [...g.gameIds, gameId],
            updatedAt: new Date().toISOString(),
          };
        });
        syncChannel?.postMessage({ type: 'SYNC_GROUPS', payload: nextGroups });
        return nextGroups;
      });
      dbAddGameToGroup(groupId, gameId).catch(console.warn);
    },
    [syncChannel]
  );

  const removeGameFromGroup = useCallback(
    (groupId: string, gameId: string) => {
      setGroups((prev) => {
        const nextGroups = prev.map((g) => {
          if (g.id !== groupId) return g;
          if (!g.gameIds.includes(gameId)) return g;
          return {
            ...g,
            gameIds: g.gameIds.filter((id) => id !== gameId),
            updatedAt: new Date().toISOString(),
          };
        });
        syncChannel?.postMessage({ type: 'SYNC_GROUPS', payload: nextGroups });
        return nextGroups;
      });
      dbRemoveGameFromGroup(groupId, gameId).catch(console.warn);
    },
    [syncChannel]
  );

  const voteGroupRecommendation = useCallback(
    (
      groupId: string,
      recKey: string,
      vote: RecommendationVoteValue | null,
      _gameName?: string
    ) => {
      if (!currentUserId || !groupId || !recKey) return;

      // TODO(recommendation-votes-feedback): En una etapa futura, usar cada voto ('up' | 'down')
      // como señal de feedback en tiempo real para ajustar el vector de gustos 32D del jugador
      // y el ranking grupal (por ahora solo se persiste y se muestra consenso/mayoría en la UI).
      setGroups((prev) => {
        const nextGroups = prev.map((g) => {
          if (g.id !== groupId) return g;
          const currentVotes = g.recommendationVotes || {};
          const nextRecVotes: Record<string, RecommendationVoteValue> = {
            ...(currentVotes[recKey] || {}),
          };
          if (vote === null) {
            delete nextRecVotes[currentUserId];
          } else {
            nextRecVotes[currentUserId] = vote;
          }
          const nextMap = { ...currentVotes };
          if (Object.keys(nextRecVotes).length === 0) {
            delete nextMap[recKey];
          } else {
            nextMap[recKey] = nextRecVotes;
          }
          return {
            ...g,
            recommendationVotes: nextMap,
            updatedAt: new Date().toISOString(),
          };
        });
        syncChannel?.postMessage({ type: 'SYNC_GROUPS', payload: nextGroups });
        return nextGroups;
      });

      dbCastGroupRecommendationVote(groupId, recKey, currentUserId, vote).catch(console.warn);
    },
    [currentUserId, syncChannel]
  );

  const testGroupDiscordWebhook = useCallback(
    async (groupId: string): Promise<{ ok: boolean; error?: string }> => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) {
        return { ok: false, error: 'Grupo no encontrado' };
      }
      if (!group.discordConfig.webhookUrl || !group.discordConfig.webhookUrl.trim()) {
        return {
          ok: false,
          error: 'El grupo no tiene una URL de Webhook de Discord configurada',
        };
      }

      const testLog = buildGroupWebhookTestLog(group, currentUser);
      const result = await dispatchDiscordWebhook(group.discordConfig.webhookUrl, testLog);
      const finalLog: DiscordNotificationLog = {
        ...testLog,
        deliveredToWebhook: result.ok,
        webhookError: result.error,
      };

      setDiscordLogs((prev) => {
        const next = [finalLog, ...prev].slice(0, 100);
        syncChannel?.postMessage({ type: 'SYNC_DISCORD_LOGS', payload: next });
        return next;
      });

      return result;
    },
    [groups, currentUser, syncChannel]
  );

  // Auto-join pending invite code once authenticated and groups are loaded
  useEffect(() => {
    if (!isAuthenticated || !currentUserId || !pendingInviteCode || groups.length === 0) {
      return;
    }

    const normalized = pendingInviteCode.trim().toUpperCase();
    const matchedGroup = groups.find((g) => g.inviteCode.toUpperCase() === normalized);
    if (!matchedGroup) return;

    joinGroupByInviteCode(normalized, currentUserId);
    setPendingInviteCode(null);

    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEYS.PENDING_INVITE_CODE);
        const url = new URL(window.location.href);
        if (url.searchParams.has('invite') || url.searchParams.has('joinGroup')) {
          url.searchParams.delete('invite');
          url.searchParams.delete('joinGroup');
          window.history.replaceState({}, '', url.toString());
        }
      } catch (err) {
        console.warn('Error cleaning invite URL params:', err);
      }
    }
  }, [isAuthenticated, currentUserId, pendingInviteCode, groups, joinGroupByInviteCode]);

  // 1. Current User, Welcome Screen & Auth
  const createAndLoginProfile = useCallback(
    (params: {
      displayName: string;
      discordUsername?: string;
      discordId?: string;
      avatarUrl?: string;
    }): PlayerProfile => {
      const cleanUsername = (params.discordUsername || '').trim().toLowerCase().replace(/^@/, '');
      const cleanDisplayName = params.displayName.trim();
      const existing = cleanUsername
        ? players.find(
            (p) => p.discordUsername.trim().toLowerCase().replace(/^@/, '') === cleanUsername
          )
        : players.find(
            (p) => p.displayName.trim().toLowerCase() === cleanDisplayName.toLowerCase()
          );

      // Do not allow hijacking or logging into an existing player's profile without Discord OAuth
      if (existing) {
        throw new Error(
          cleanUsername
            ? 'Ese usuario de Discord ya está registrado. Ingresá con Discord OAuth2.'
            : 'Ese apodo ya está registrado.'
        );
      }

      const newProfile: PlayerProfile = {
        id: params.discordId?.trim() ? `user-${params.discordId.trim()}` : `user-${Date.now()}`,
        discordId: params.discordId?.trim() || '',
        discordUsername: (params.discordUsername || '').trim().replace(/^@/, ''),
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
      activeSessionUserRef.current = { userId: newProfile.id, isAuthenticated: true };
      setPlayers(updatedPlayers);
      syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: updatedPlayers });
      dbUpsertProfile(newProfile).catch(console.warn);

      // Reconcile active sessions so they are automatically enrolled
      reconcileSessionsScopedToGroups(updatedPlayers);

      setCurrentUserId(newProfile.id);
      setIsAuthenticated(true);
      setShowOnboardingModal(true);

      return newProfile;
    },
    [players, reconcileSessionsScopedToGroups]
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
      const baseRedirectUrl = `${window.location.origin}${window.location.pathname}`;
      const redirectTo = pendingInviteCode
        ? `${baseRedirectUrl}?invite=${encodeURIComponent(pendingInviteCode)}`
        : baseRedirectUrl;
      await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo,
        },
      });
    } else {
      throw new Error(
        'El proveedor OAuth2 de Discord aún no fue activado en el panel de Supabase (Authentication -> Providers -> Discord).'
      );
    }
  }, [pendingInviteCode]);

  const updateUserProfile = useCallback(
    (
      patch: Partial<Pick<PlayerProfile, 'displayName' | 'discordUsername' | 'avatarUrl' | 'birthDate' | 'bio'>>,
      userId?: string
    ) => {
      const targetUserId = userId || currentUserId;
      let updatedProfile: PlayerProfile | undefined;

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== targetUserId) return p;
          updatedProfile = {
            ...p,
            ...(patch.displayName !== undefined ? { displayName: patch.displayName.trim() || p.displayName } : {}),
            ...(patch.discordUsername !== undefined ? { discordUsername: patch.discordUsername.trim() } : {}),
            ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl.trim() || p.avatarUrl } : {}),
            ...(patch.birthDate !== undefined ? { birthDate: patch.birthDate || undefined } : {}),
            ...(patch.bio !== undefined ? { bio: patch.bio.trim() || undefined } : {}),
          };
          return updatedProfile;
        });

        if (updatedProfile) {
          dbUpsertProfile(updatedProfile).catch(console.warn);
          syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        }

        return nextPlayers;
      });
    },
    [currentUserId, syncChannel]
  );

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

    // Reconcile all open sessions strictly scoped to the user's groups
    reconcileSessionsScopedToGroups(updatedPlayers);

    setShowOnboardingModal(false);
  }, [currentUser, players, reconcileSessionsScopedToGroups]);

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

      // Reconcile open sessions strictly scoped to the user's groups
      reconcileSessionsScopedToGroups(updatedPlayers);
    },
    [currentUserId, players, syncChannel, reconcileSessionsScopedToGroups]
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

      // Immediately runs group-scoped schedule reconciliation on any session matching date
      reconcileSessionsScopedToGroups(updatedPlayers, date);
    },
    [currentUserId, players, syncChannel, reconcileSessionsScopedToGroups]
  );

  const toggleTodayNotPlaying = useCallback(
    (reason?: string, userId?: string) => {
      const todayStr = new Date().toISOString().split('T')[0];
      const targetId = userId || currentUserId;
      const targetPlayer = players.find((p) => p.id === targetId) || currentUser;
      const currentOverride = targetPlayer.dailyOverrides?.[todayStr];
      const isCurrentlyNotPlaying = currentOverride?.status === 'not_playing';

      const targetGroups = groups.filter((g) => g.memberIds.includes(targetId));
      const scopedTargetUserIds =
        targetGroups.length > 0
          ? Array.from(new Set(targetGroups.flatMap((g) => g.memberIds)))
          : players.map((p) => p.id);

      if (isCurrentlyNotPlaying) {
        // Clear override (restores automatic enrollment)
        setDailyOverride(todayStr, null, targetId);

        triggerNotificationPipeline(
          {
            title: `✅ ${targetPlayer.displayName} vuelve a jugar hoy`,
            body: 'Canceló el aviso de ausencia. Su horario habitual se reactivó automáticamente.',
            tag: `not_playing_cancel_${todayStr}_${targetId}`,
            targetUserIds: scopedTargetUserIds,
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
            targetUserIds: scopedTargetUserIds,
          },
          'message'
        );

        const buildAbsentLog = (group?: GamingGroup): DiscordNotificationLog => ({
          id: `log-not-playing-${Date.now()}${group ? `-${group.id}` : ''}`,
          eventType: 'checkin_update',
          groupId: group?.id,
          groupName: group?.name,
          content: `🏳️ **Baja Confirmada:** <@${targetPlayer.discordId}> (${targetPlayer.displayName}) avisó que hoy no juega.`,
          embed: {
            title: '🏳️ Aviso de Ausencia Anticipado',
            description: `${targetPlayer.displayName} avisó con antelación que no podrá estar hoy. Se liberó su cupo sin restar karma.`,
            color: 0x64748b,
            fields: [
              ...(group ? [{ name: '👥 Grupo', value: group.name, inline: true }] : []),
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
        });

        if (targetGroups.length > 0) {
          for (const grp of targetGroups) {
            dispatchDiscordPipeline(buildAbsentLog(grp), grp.id);
          }
        } else {
          dispatchDiscordPipeline(buildAbsentLog());
        }
      }
    },
    [
      currentUserId,
      currentUser,
      players,
      groups,
      setDailyOverride,
      triggerNotificationPipeline,
      dispatchDiscordPipeline,
    ]
  );

  const updateCategoryPreferences = useCallback(
    (prefs: Record<string, CategoryPreferenceLevel>, userId?: string) => {
      const targetId = userId || currentUserId;
      let targetUpdated: PlayerProfile | undefined;

      setPlayers((prevPlayers) => {
        const updatedPlayers = prevPlayers.map((p) => {
          if (p.id === targetId) {
            const intermediate = { ...p, categoryPreferences: prefs };
            const updatedTaste = recomputeTasteProfileForPlayer(intermediate, preferences, games);
            targetUpdated = { ...intermediate, tasteProfile: updatedTaste };
            return targetUpdated;
          }
          return p;
        });

        if (targetUpdated) {
          syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: updatedPlayers });
          dbUpsertProfile(targetUpdated).catch(console.warn);
        }

        return updatedPlayers;
      });
    },
    [currentUserId, preferences, games, syncChannel]
  );

  // 2. Games & Preferences (1-5★)
  const updateGamePreference = useCallback(
    (
      gameId: string,
      plays: boolean,
      rating: GameRating,
      hoursPlayed?: number,
      recentHoursPlayed?: number
    ) => {
      const existingPref = preferences.find(
        (p) => p.userId === currentUserId && p.gameId === gameId
      );
      const resolvedHoursPlayed = hoursPlayed ?? existingPref?.hoursPlayed;
      const resolvedRecentHoursPlayed =
        recentHoursPlayed ?? existingPref?.recentHoursPlayed;

      const targetCatGame = games.find((g) => g.id === gameId);
      const targetNormName = targetCatGame ? normalizeGameName(targetCatGame.name) : '';
      const targetSteamTag = targetCatGame?.tags.find((t) => t.startsWith('steam:'));
      const parsedTargetAppId = targetSteamTag ? Number(targetSteamTag.slice(6)) : undefined;
      const targetSteamAppId =
        parsedTargetAppId !== undefined && Number.isFinite(parsedTargetAppId)
          ? parsedTargetAppId
          : undefined;

      const nextPref: UserGamePreference = {
        userId: currentUserId,
        gameId,
        plays,
        rating,
        ...(resolvedHoursPlayed !== undefined ? { hoursPlayed: resolvedHoursPlayed } : {}),
        ...(resolvedRecentHoursPlayed !== undefined
          ? { recentHoursPlayed: resolvedRecentHoursPlayed }
          : {}),
      };
      const filtered = preferences.filter(
        (p) => !(p.userId === currentUserId && p.gameId === gameId)
      );
      const updatedPrefs: UserGamePreference[] = [...filtered, nextPref];

      setPreferences(updatedPrefs);
      syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: updatedPrefs });
      dbUpsertPreference({ userId: currentUserId, gameId, plays, rating }).catch(console.warn);

      // Keep taste profile featureVector & PVJ-6D fresh, and sync hours across catalog/Steam/external/podium
      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== currentUserId) return p;
          const baseTaste: PlayerTasteProfile = p.tasteProfile || {
            topMultiplayerGames: [],
            topSingleplayerGames: [],
            externalGames: [],
            updatedAt: new Date().toISOString(),
          };
          const prevCatalogHours = baseTaste.catalogGameHours || {};
          const nextCatalogHours =
            resolvedHoursPlayed !== undefined || resolvedRecentHoursPlayed !== undefined
              ? {
                  ...prevCatalogHours,
                  [gameId]: {
                    hoursPlayed:
                      resolvedHoursPlayed ?? prevCatalogHours[gameId]?.hoursPlayed ?? 0,
                    ...(resolvedRecentHoursPlayed !== undefined ||
                    prevCatalogHours[gameId]?.recentHoursPlayed !== undefined
                      ? {
                          recentHoursPlayed:
                            resolvedRecentHoursPlayed ??
                            prevCatalogHours[gameId]?.recentHoursPlayed ??
                            0,
                        }
                      : {}),
                  },
                }
              : prevCatalogHours;

          const hasHourPatch =
            resolvedHoursPlayed !== undefined || resolvedRecentHoursPlayed !== undefined;

          const matchesTarget = (name: string, appId?: number): boolean => {
            if (targetSteamAppId !== undefined && appId === targetSteamAppId) return true;
            return Boolean(targetNormName && normalizeGameName(name) === targetNormName);
          };

          const nextSteamProfile =
            hasHourPatch && targetCatGame && p.steamProfile
              ? {
                  ...p.steamProfile,
                  ownedGames: p.steamProfile.ownedGames.map((og) => {
                    if (!matchesTarget(og.name, og.appId)) return og;
                    return {
                      ...og,
                      ...(resolvedHoursPlayed !== undefined
                        ? { manualHoursOverride: resolvedHoursPlayed }
                        : {}),
                      ...(resolvedRecentHoursPlayed !== undefined
                        ? { manualRecentHoursOverride: resolvedRecentHoursPlayed }
                        : {}),
                    };
                  }),
                }
              : p.steamProfile;

          const nextExternalGames =
            hasHourPatch && targetCatGame
              ? (baseTaste.externalGames || []).map((ext) => {
                  if (!matchesTarget(ext.name, ext.steamAppId)) return ext;
                  return {
                    ...ext,
                    ...(resolvedHoursPlayed !== undefined
                      ? { hoursPlayedEstimate: resolvedHoursPlayed }
                      : {}),
                    ...(resolvedRecentHoursPlayed !== undefined
                      ? { recentHoursPlayed: resolvedRecentHoursPlayed }
                      : {}),
                  };
                })
              : baseTaste.externalGames || [];

          const syncPodiumHours = (entries: typeof baseTaste.topMultiplayerGames) =>
            hasHourPatch && targetCatGame
              ? entries.map((pe) => {
                  if (!matchesTarget(pe.name, pe.steamAppId)) return pe;
                  return {
                    ...pe,
                    ...(resolvedHoursPlayed !== undefined
                      ? { hoursPlayed: resolvedHoursPlayed }
                      : {}),
                    ...(resolvedRecentHoursPlayed !== undefined
                      ? { recentHoursPlayed: resolvedRecentHoursPlayed }
                      : {}),
                  };
                })
              : entries;

          const intermediatePlayer: PlayerProfile = {
            ...p,
            steamProfile: nextSteamProfile,
            tasteProfile: {
              ...baseTaste,
              topMultiplayerGames: syncPodiumHours(baseTaste.topMultiplayerGames || []),
              topSingleplayerGames: syncPodiumHours(baseTaste.topSingleplayerGames || []),
              externalGames: nextExternalGames,
              catalogGameHours: nextCatalogHours,
            },
          };
          const updatedTaste = recomputeTasteProfileForPlayer(
            intermediatePlayer,
            updatedPrefs,
            games
          );
          const updatedP = { ...intermediatePlayer, tasteProfile: updatedTaste };
          dbUpsertProfile(updatedP).catch(console.warn);
          return updatedP;
        });
        syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        return nextPlayers;
      });
    },
    [currentUserId, games, preferences, syncChannel]
  );

  const addGame = useCallback(
    (gameData: Omit<Game, 'id' | 'addedBy'>): Game => {
      const newGame: Game = {
        ...gameData,
        id: `game-${Date.now()}`,
        addedBy: currentUserId,
      };

      const nextGamesSnapshot = [...games, newGame];
      setGames((prev) => {
        const updated = [...prev, newGame];
        syncChannel?.postMessage({ type: 'SYNC_ALL', payload: { games: updated } });
        return updated;
      });
      dbInsertGame(newGame).catch(console.warn);

      const defaultPref: UserGamePreference = {
        userId: currentUserId,
        gameId: newGame.id,
        plays: true,
        rating: 4 as GameRating,
      };
      const nextPrefsSnapshot = [...preferences, defaultPref];
      // Add default preference for current user
      setPreferences((prev) => {
        const updated = [...prev, defaultPref];
        syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: updated });
        return updated;
      });
      dbUpsertPreference(defaultPref).catch(console.warn);

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== currentUserId) return p;
          const updatedTaste = recomputeTasteProfileForPlayer(
            p,
            nextPrefsSnapshot,
            nextGamesSnapshot
          );
          const updatedP = { ...p, tasteProfile: updatedTaste };
          dbUpsertProfile(updatedP).catch(console.warn);
          return updatedP;
        });
        syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        return nextPlayers;
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

      return newGame;
    },
    [currentUser, currentUserId, games, players, preferences, syncChannel, triggerNotificationPipeline]
  );

  const addAndLinkGameToGroup = useCallback(
    (groupId: string, gameData: Omit<Game, 'id' | 'addedBy'>): Game => {
      const normalizedTarget = normalizeGameName(gameData.name);
      const existing = games.find((g) => normalizeGameName(g.name) === normalizedTarget);
      const resolved = existing ?? addGame(gameData);
      addGameToGroup(groupId, resolved.id);
      return resolved;
    },
    [games, addGame, addGameToGroup]
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
      invitedUserIds?: string[];
      groupId?: string;
    }): GamingSession => {
      const targetGroupId =
        params.groupId || resolvedActiveGroupId || userGroups[0]?.id || 'group-boludos-og';

      let targetGroup = groups.find((g) => g.id === targetGroupId);
      let autoCreatedGroup: GamingGroup | undefined;

      if (!targetGroup) {
        autoCreatedGroup = {
          id: targetGroupId,
          name: 'Mi Grupo',
          description: 'Grupo privado para coordinar sesiones, horarios y alertas de Discord.',
          inviteCode: generateUniqueInviteCode(groups),
          createdBy: currentUserId,
          memberIds: [currentUserId],
          adminIds: [currentUserId],
          gameIds: [],
          discordConfig: {
            enabled: discordConfig.enabled,
            webhookUrl: discordConfig.webhookUrl,
            channelName: discordConfig.channelName,
            guildName: discordConfig.guildName,
            mentionRoleId: discordConfig.mentionRoleId,
            useEveryoneMention: discordConfig.useEveryoneMention,
          },
          recommendationVotes: {},
          createdAt: new Date().toISOString(),
        };
        targetGroup = autoCreatedGroup;

        setGroups((prev) => {
          if (prev.some((g) => g.id === autoCreatedGroup!.id)) return prev;
          const nextGroups = [autoCreatedGroup!, ...prev];
          syncChannel?.postMessage({ type: 'SYNC_GROUPS', payload: nextGroups });
          return nextGroups;
        });
        setActiveGroupIdState(targetGroupId);
      }

      const resolvedTargetGroup = targetGroup!;
      const groupMemberIds = Array.from(new Set([...resolvedTargetGroup.memberIds, currentUserId]));
      const groupPlayers = players.filter((p) => groupMemberIds.includes(p.id));

      const invitedUserIds =
        params.invitedUserIds && params.invitedUserIds.length > 0
          ? Array.from(
              new Set([
                ...params.invitedUserIds.filter((id) => groupMemberIds.includes(id)),
                currentUserId,
              ])
            )
          : undefined;

      const baseSession: GamingSession = {
        id: `session-${Date.now()}`,
        groupId: targetGroupId,
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
        invitedUserIds,
        callouts: [],
      };

      // Automatically enroll only group members (and optional invites) with compatible schedules
      const reconciled = reconcileAutoParticipantsForSession(
        baseSession,
        groupPlayers,
        undefined,
        groupMemberIds
      );
      const autoParticipants = [...reconciled.participants];

      // Ensure session creator's custom schedule parameters are preserved with 100% confirmed status
      const creatorIndex = autoParticipants.findIndex((p) => p.userId === currentUserId);
      const creatorParticipant: SessionParticipant = {
        userId: currentUserId,
        joinedAt: new Date().toISOString(),
        availableFrom: params.availableFrom,
        availableUntil: params.availableUntil,
        precisionMinutes: params.precisionMinutes,
        attendanceStatus: 'pending',
        isAutoEnrolled: false,
        confirmationStatus: 'confirmed',
        confidencePercentage: 100,
      };

      if (creatorIndex >= 0) {
        autoParticipants[creatorIndex] = creatorParticipant;
      } else {
        autoParticipants.unshift(creatorParticipant);
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

      if (autoCreatedGroup) {
        dbUpsertGroup(autoCreatedGroup)
          .then(() => dbCreateSession(newSession))
          .catch(console.warn);
      } else {
        dbCreateSession(newSession).catch(console.warn);
      }
      setActiveSessionIdState(newSession.id);

      // Discord Rich Embed & Webhook
      const mentionRole = resolvedTargetGroup.discordConfig.useEveryoneMention
        ? '@everyone'
        : resolvedTargetGroup.discordConfig.mentionRoleId || discordConfig.mentionRoleId || '@everyone';
      const discordLog = buildSessionCreatedLog(newSession, currentUser, mentionRole, resolvedTargetGroup);
      dispatchDiscordPipeline(discordLog, targetGroupId);

      // Push Notification scoped to group members
      triggerNotificationPipeline(
        {
          title: `🎮 Nueva Sesión en ${resolvedTargetGroup.name}`,
          body: `${currentUser.displayName} convocó a "${params.title}" para las ${params.availableFrom} (±${params.precisionMinutes}m). Hay ${autoParticipants.length} jugadores convocados.`,
          tag: `session_${newSession.id}`,
          sessionId: newSession.id,
          targetUserIds: groupMemberIds,
        },
        'ping'
      );

      return newSession;
    },
    [
      currentUserId,
      currentUser,
      groups,
      resolvedActiveGroupId,
      userGroups,
      discordConfig,
      players,
      syncChannel,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  const createInstantSession = useCallback(
    (params: { groupId?: string; title?: string; startsInMinutes?: number }): GamingSession => {
      const targetGroupId =
        params.groupId || resolvedActiveGroupId || userGroups[0]?.id || 'group-instant';

      const existingInstant = sessions.find(
        (s) =>
          s.groupId === targetGroupId &&
          s.sessionKind === 'instant' &&
          s.status !== 'finished'
      );
      if (existingInstant) {
        setActiveSessionIdState(existingInstant.id);
        return existingInstant;
      }

      const targetGroup = groups.find((g) => g.id === targetGroupId);
      const now = new Date();
      const delayMins = Math.min(60, Math.max(0, Math.round(params.startsInMinutes ?? 0)));
      const startAt = new Date(now.getTime() + delayMins * 60_000);
      const pad2 = (n: number) => String(n).padStart(2, '0');
      const todayStr = `${startAt.getFullYear()}-${pad2(startAt.getMonth() + 1)}-${pad2(startAt.getDate())}`;
      const timeLabel = `${pad2(startAt.getHours())}:${pad2(startAt.getMinutes())}`;
      const resolvedTitle =
        params.title?.trim() ||
        (delayMins > 0
          ? `⚡ Convocatoria en ${delayMins}m (${timeLabel})`
          : `⚡ Convocatoria Instantánea (${timeLabel})`);

      const newSession: GamingSession = {
        id: `session-instant-${Date.now()}`,
        groupId: targetGroupId,
        title: resolvedTitle,
        date: todayStr,
        sessionKind: 'instant',
        instantRsvps: [],
        mode: 'random',
        status: 'open',
        createdBy: currentUserId,
        createdAt: now.toISOString(),
        allowSplitLobbies: false,
        participants: [],
        attendanceVotes: [],
        callouts: [],
      };

      setSessions((prev) => {
        const next = [newSession, ...prev];
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: next });
        return next;
      });
      setActiveSessionIdState(newSession.id);
      dbCreateSession(newSession).catch(console.warn);

      if (targetGroup) {
        const mentionRole = targetGroup.discordConfig.useEveryoneMention
          ? '@everyone'
          : targetGroup.discordConfig.mentionRoleId || discordConfig.mentionRoleId || '@everyone';
        const discordLog = buildSessionCreatedLog(newSession, currentUser, mentionRole, targetGroup);
        dispatchDiscordPipeline(discordLog, targetGroupId);

        triggerNotificationPipeline(
          {
            title:
              delayMins > 0
                ? `⚡ ¡Convocatoria en ${delayMins}m (${timeLabel}) en ${targetGroup.name}!`
                : `⚡ ¡Convocatoria Ahora en ${targetGroup.name}!`,
            body: `${currentUser.displayName} convocó a jugar ${delayMins > 0 ? `a las ${timeLabel}` : 'ahora'}. Entrá para avisar si estás y en cuánto tiempo llegás.`,
            tag: `instant_${newSession.id}`,
            sessionId: newSession.id,
            targetUserIds: targetGroup.memberIds,
          },
          'ping'
        );
      }

      return newSession;
    },
    [
      resolvedActiveGroupId,
      userGroups,
      sessions,
      groups,
      currentUserId,
      currentUser,
      discordConfig,
      syncChannel,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  const respondToInstantSession = useCallback(
    (
      sessionId: string,
      params: {
        status: 'going' | 'declined';
        etaMinutes?: number;
        durationMinutes?: number;
        userId?: string;
      }
    ) => {
      const targetUserId = params.userId || currentUserId;
      if (!targetUserId) return;

      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const eta = Math.max(0, Math.round(params.etaMinutes ?? 0));
      const fromMins = nowMins + eta;
      const dur = params.durationMinutes && params.durationMinutes > 0
        ? Math.round(params.durationMinutes)
        : 180; // default 3h window on timeline when duration is omitted
      const untilMins = fromMins + dur;

      const availableFrom = formatMinutesToTime(fromMins);
      const availableUntil = formatMinutesToTime(untilMins);
      const etaLabel = eta === 0 ? 'Ya estoy' : `En ${eta}m`;
      const durLabel =
        params.durationMinutes && params.durationMinutes > 0
          ? `${Math.round((params.durationMinutes / 60) * 10) / 10}h`
          : 'Sin límite';

      const newRsvp: InstantSessionRsvp = {
        userId: targetUserId,
        status: params.status,
        etaMinutes: params.status === 'going' ? eta : undefined,
        durationMinutes: params.status === 'going' ? params.durationMinutes : undefined,
        respondedAt: now.toISOString(),
      };

      const targetSession = sessions.find((s) => s.id === sessionId);
      const existingPart = targetSession?.participants.find(
        (p) => p.userId === targetUserId
      );
      const participantData: SessionParticipant | null =
        params.status === 'declined'
          ? null
          : {
              userId: targetUserId,
              joinedAt: existingPart?.joinedAt || now.toISOString(),
              availableFrom,
              availableUntil,
              precisionMinutes: 5,
              attendanceStatus: existingPart?.attendanceStatus || 'pending',
              checkedInAt: existingPart?.checkedInAt,
              note: `${etaLabel} · ${durLabel}`,
              isAutoEnrolled: false,
              confirmationStatus: 'confirmed',
              confidencePercentage: 100,
            };

      setSessions((prev) => {
        const updated = prev.map((sess) => {
          if (sess.id !== sessionId) return sess;

          const sessRsvps = sess.instantRsvps || [];
          const mergedRsvps = [
            ...sessRsvps.filter((r) => r.userId !== targetUserId),
            newRsvp,
          ];

          if (params.status === 'declined') {
            return {
              ...sess,
              instantRsvps: mergedRsvps,
              participants: sess.participants.filter((p) => p.userId !== targetUserId),
            };
          }

          const sessPart = sess.participants.find((p) => p.userId === targetUserId);
          const nextParticipants = sessPart
            ? sess.participants.map((p) => (p.userId === targetUserId ? participantData! : p))
            : [...sess.participants, participantData!];

          return {
            ...sess,
            instantRsvps: mergedRsvps,
            participants: nextParticipants,
          };
        });

        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });

      void (async () => {
        try {
          if (params.status === 'declined') {
            await dbDeleteParticipant(sessionId, targetUserId);
          } else if (participantData) {
            await dbUpsertParticipant(sessionId, participantData);
          }
          await dbUpsertInstantRsvp(sessionId, newRsvp);
        } catch (err) {
          console.warn('Error persisting instant RSVP:', err);
        }
      })();
    },
    [currentUserId, sessions, syncChannel]
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
        confirmAttendance?: boolean;
      }
    ) => {
      const targetUserId = params.userId || currentUserId;
      const targetPlayer = players.find((p) => p.id === targetUserId) || currentUser;
      const isConfirmed = params.confirmAttendance !== false;
      const sessionSnapshot = sessions.find((s) => s.id === sessionId);
      const snapshotGroup = sessionSnapshot
        ? groups.find((g) => g.id === sessionSnapshot.groupId)
        : undefined;

      setSessions((prev) => {
        const updated = prev.map((sess) => {
          if (sess.id !== sessionId) return sess;

          const existingIndex = sess.participants.findIndex((p) => p.userId === targetUserId);
          const participantData: SessionParticipant = {
            userId: targetUserId,
            joinedAt:
              existingIndex >= 0
                ? sess.participants[existingIndex].joinedAt
                : new Date().toISOString(),
            availableFrom: params.availableFrom,
            availableUntil: params.availableUntil,
            precisionMinutes: params.precisionMinutes,
            attendanceStatus:
              existingIndex >= 0
                ? sess.participants[existingIndex].attendanceStatus
                : ('pending' as const),
            checkedInAt:
              existingIndex >= 0 ? sess.participants[existingIndex].checkedInAt : undefined,
            note: params.note,
            isAutoEnrolled: false,
            confirmationStatus: isConfirmed ? 'confirmed' : 'probable',
            confidencePercentage: isConfirmed ? 100 : 75,
          };

          const newParticipants =
            existingIndex >= 0
              ? sess.participants.map((p, idx) => (idx === existingIndex ? participantData : p))
              : [...sess.participants, participantData];

          const updatedSession = { ...sess, participants: newParticipants };
          dbUpsertParticipant(sessionId, participantData).catch(console.warn);

          const targetGroup = groups.find((g) => g.id === updatedSession.groupId);
          const log = buildPlayerJoinedLog(
            updatedSession,
            targetPlayer,
            params.precisionMinutes,
            params.availableFrom,
            targetGroup
          );
          dispatchDiscordPipeline(log, updatedSession.groupId);

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
          targetUserIds: snapshotGroup ? snapshotGroup.memberIds : players.map((p) => p.id),
        },
        'ping'
      );
    },
    [
      currentUserId,
      currentUser,
      players,
      sessions,
      groups,
      syncChannel,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  const confirmSessionAttendance = useCallback(
    (sessionId: string, userId?: string) => {
      const targetUserId = userId || currentUserId;
      const targetPlayer = players.find((p) => p.id === targetUserId) || currentUser;
      const sessionSnapshot = sessions.find((s) => s.id === sessionId);
      const snapshotGroup = sessionSnapshot
        ? groups.find((g) => g.id === sessionSnapshot.groupId)
        : undefined;

      setSessions((prev) => {
        let updatedParticipant: SessionParticipant | undefined;

        const updated = prev.map((sess) => {
          if (sess.id !== sessionId) return sess;

          const existingIndex = sess.participants.findIndex((p) => p.userId === targetUserId);
          if (existingIndex >= 0) {
            const existing = sess.participants[existingIndex];
            updatedParticipant = {
              ...existing,
              isAutoEnrolled: false,
              confirmationStatus: 'confirmed',
              confidencePercentage: 100,
              note: existing.note ? `${existing.note} · Confirmado 100% ✅` : 'Confirmado 100% ✅',
            };
            const newParticipants = sess.participants.map((p, idx) =>
              idx === existingIndex ? updatedParticipant! : p
            );
            return { ...sess, participants: newParticipants };
          } else {
            // Player was not in participants yet; add them using their effective schedule
            const eff = getEffectiveDailySchedule(targetPlayer, sess.date);
            updatedParticipant = {
              userId: targetUserId,
              joinedAt: new Date().toISOString(),
              availableFrom: eff.availableFrom,
              availableUntil: eff.availableUntil,
              precisionMinutes: eff.precisionMinutes,
              attendanceStatus: 'pending' as const,
              isAutoEnrolled: false,
              confirmationStatus: 'confirmed',
              confidencePercentage: 100,
              note: 'Confirmado 100% ✅',
            };
            return {
              ...sess,
              participants: [...sess.participants, updatedParticipant],
            };
          }
        });

        if (updatedParticipant) {
          dbUpsertParticipant(sessionId, updatedParticipant).catch(console.warn);
          const targetSession = updated.find((s) => s.id === sessionId);
          if (targetSession) {
            const targetGroup = groups.find((g) => g.id === targetSession.groupId);
            const log = buildPlayerJoinedLog(
              targetSession,
              targetPlayer,
              updatedParticipant.precisionMinutes,
              updatedParticipant.availableFrom,
              targetGroup
            );
            dispatchDiscordPipeline(log, targetSession.groupId);
          }
        }

        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });

      triggerNotificationPipeline(
        {
          title: '✅ Asistencia Confirmada 100%',
          body: `${targetPlayer.displayName} confirmó asistencia al 100% para la sesión.`,
          tag: `session_confirm_${sessionId}`,
          sessionId,
          targetUserIds: snapshotGroup ? snapshotGroup.memberIds : players.map((p) => p.id),
        },
        'ping'
      );
    },
    [
      currentUserId,
      currentUser,
      players,
      sessions,
      groups,
      syncChannel,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  const sendSessionCallout = useCallback(
    async (
      sessionId: string,
      customMessage?: string
    ): Promise<{ notifiedUsers: PlayerProfile[] }> => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) {
        return { notifiedUsers: [] };
      }

      const targetGroup = groups.find((g) => g.id === session.groupId);
      const groupMemberIds = targetGroup?.memberIds;
      const groupPlayers = targetGroup
        ? players.filter((p) => targetGroup.memberIds.includes(p.id))
        : players;

      // Find probable available players strictly within this session's group
      const probableData = getProbableAvailablePlayersForSession(
        session,
        groupPlayers,
        groupMemberIds
      );
      const probableMap = new Map<string, { player: PlayerProfile; confidencePercentage: number }>();

      for (const item of probableData) {
        if (item.player.id !== currentUserId) {
          probableMap.set(item.player.id, {
            player: item.player,
            confidencePercentage: item.effective.confidencePercentage,
          });
        }
      }

      // Plus any group participant in session.participants whose confirmationStatus !== 'confirmed'
      for (const p of session.participants) {
        if (p.userId !== currentUserId && p.confirmationStatus !== 'confirmed') {
          const foundPlayer = groupPlayers.find((pl) => pl.id === p.userId);
          if (foundPlayer && !probableMap.has(p.userId)) {
            probableMap.set(p.userId, {
              player: foundPlayer,
              confidencePercentage: p.confidencePercentage ?? 75,
            });
          }
        }
      }

      const probableList = Array.from(probableMap.values());
      const notifiedUsers = probableList.map((item) => item.player);

      const calloutRecord: SessionCalloutRecord = {
        id: `callout-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        triggeredBy: currentUserId,
        triggeredAt: new Date().toISOString(),
        message: customMessage,
        notifiedUserIds: notifiedUsers.map((u) => u.id),
      };

      const updatedCallouts = [...(session.callouts || []), calloutRecord];
      const updatedSession: GamingSession = {
        ...session,
        callouts: updatedCallouts,
      };

      setSessions((prev) => {
        const updated = prev.map((s) => (s.id === sessionId ? updatedSession : s));
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });

      dbUpdateSessionInvitesAndCallouts(
        sessionId,
        session.invitedUserIds,
        updatedCallouts
      ).catch(console.warn);

      // Discord Rich Embed & Webhook
      const discordLog = buildSessionCalloutDiscordPayload(
        updatedSession,
        currentUser,
        probableList,
        customMessage,
        discordConfig,
        targetGroup
      );
      dispatchDiscordPipeline(discordLog, session.groupId);

      // Push Notification
      triggerNotificationPipeline(
        {
          title: `📣 ¡Llamado a Sesión: ${session.title}!`,
          body: customMessage
            ? `${currentUser.displayName}: "${customMessage}" — ¡Confirmá tu asistencia al 100%!`
            : `${currentUser.displayName} te está llamando a confirmar tu presencia para jugar hoy. ¡Entrá y confirmá al 100%!`,
          tag: `callout_${sessionId}`,
          sessionId,
          targetUserIds: notifiedUsers.map((u) => u.id),
        },
        'ping'
      );

      return { notifiedUsers };
    },
    [
      sessions,
      players,
      groups,
      currentUserId,
      currentUser,
      discordConfig,
      syncChannel,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  const updateSessionInvites = useCallback(
    (sessionId: string, invitedUserIds?: string[]) => {
      setSessions((prev) => {
        const updated = prev.map((sess) => {
          if (sess.id !== sessionId) return sess;

          const targetGroup = groups.find((g) => g.id === sess.groupId);
          const groupMemberIds = targetGroup?.memberIds;
          const groupPlayers = targetGroup
            ? players.filter((p) => targetGroup.memberIds.includes(p.id))
            : players;

          const cleanedInvites =
            invitedUserIds && invitedUserIds.length > 0
              ? Array.from(
                  new Set([
                    ...(groupMemberIds
                      ? invitedUserIds.filter((id) => groupMemberIds.includes(id))
                      : invitedUserIds),
                    sess.createdBy,
                  ])
                )
              : undefined;

          const withUpdatedInvites: GamingSession = {
            ...sess,
            invitedUserIds: cleanedInvites,
          };

          const reconciled = reconcileAutoParticipantsForSession(
            withUpdatedInvites,
            groupPlayers,
            undefined,
            groupMemberIds
          );

          // Delete any participants that were removed
          const currentIds = new Set(reconciled.participants.map((p) => p.userId));
          for (const oldP of sess.participants) {
            if (!currentIds.has(oldP.userId)) {
              dbDeleteParticipant(sessionId, oldP.userId).catch(console.warn);
            }
          }

          // Upsert all reconciled participants
          for (const p of reconciled.participants) {
            dbUpsertParticipant(sessionId, p).catch(console.warn);
          }

          dbUpdateSessionInvitesAndCallouts(sessionId, cleanedInvites, sess.callouts).catch(
            console.warn
          );

          return reconciled;
        });

        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });
    },
    [players, groups, syncChannel]
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

  const deleteSession = useCallback(
    (sessionId: string) => {
      const targetSession = sessions.find((s) => s.id === sessionId);
      if (!targetSession) return;

      const targetGroup = groups.find((g) => g.id === targetSession.groupId);
      const isAllowed =
        targetSession.createdBy === currentUserId ||
        targetGroup?.createdBy === currentUserId ||
        Boolean(targetGroup?.adminIds.includes(currentUserId));

      if (!isAllowed) return;

      setSessions((prev) => {
        const updated = prev.filter((s) => s.id !== sessionId);
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });

      setActiveSessionIdState((prevActive) =>
        prevActive === sessionId ? '' : prevActive
      );

      dbDeleteSession(sessionId).catch(console.warn);
    },
    [sessions, groups, currentUserId, syncChannel]
  );

  const spinSessionRoulette = useCallback(
    (sessionId: string, options?: { onlyLocked?: boolean }): Game | null => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return null;

      const targetGroup = groups.find((g) => g.id === session.groupId);
      const groupPlayers = targetGroup
        ? players.filter((p) => targetGroup.memberIds.includes(p.id))
        : players;
      const groupGames = targetGroup
        ? games.filter((g) => targetGroup.gameIds.includes(g.id))
        : games;

      const synchronyResults = calculateGameSynchrony(
        groupGames,
        preferences,
        session.participants,
        groupPlayers,
        session.allowSplitLobbies
      );

      const lockedIds =
        session.selectedGameIds && session.selectedGameIds.length > 0
          ? session.selectedGameIds
          : session.selectedGameId
            ? [session.selectedGameId]
            : [];

      let winningGame: Game | null = null;
      if (options?.onlyLocked && lockedIds.length > 0) {
        const lockedSyncResults = synchronyResults.filter((r) =>
          lockedIds.includes(r.game.id)
        );
        winningGame = spinWeightedRoulette(lockedSyncResults);
        if (!winningGame) {
          const lockedPool = lockedIds
            .map((id) => games.find((g) => g.id === id))
            .filter((g): g is Game => Boolean(g));
          if (lockedPool.length > 0) {
            winningGame = lockedPool[Math.floor(Math.random() * lockedPool.length)];
          }
        }
      } else {
        winningGame = spinWeightedRoulette(synchronyResults);
      }

      if (!winningGame) return null;

      const winningResult = synchronyResults.find((r) => r.game.id === winningGame.id);
      const synchronyScore = winningResult ? winningResult.synchronyScore : 80;

      setSessions((prev) => {
        const updated = prev.map((s) => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            rouletteWinnerGameId: winningGame.id,
          };
        });
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });
      dbUpdateSessionGame(
        sessionId,
        lockedIds[0] ?? null,
        true,
        lockedIds,
        winningGame.id
      ).catch(console.warn);

      // Discord Rich Embed & Webhook
      const discordLog = buildRouletteWinnerLog(
        session,
        winningGame,
        synchronyScore,
        session.participants.length,
        targetGroup
      );
      dispatchDiscordPipeline(discordLog, session.groupId);

      // Push Notification with fanfare scoped to group members
      triggerNotificationPipeline(
        {
          title: `🎉 ¡Ganó ${winningGame.name}!`,
          body: `La ruleta ponderada eligió ${winningGame.name} con ${synchronyScore}% de sincronía grupal.`,
          tag: `roulette_${sessionId}`,
          sessionId,
          targetUserIds: targetGroup
            ? targetGroup.memberIds
            : session.participants.map((p) => p.userId),
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
      groups,
      syncChannel,
      dispatchDiscordPipeline,
      triggerNotificationPipeline,
    ]
  );

  const lockSessionGame = useCallback(
    (sessionId: string, gameId: string) => {
      const currentSession = sessions.find((s) => s.id === sessionId);
      const currentIds =
        currentSession?.selectedGameIds ??
        (currentSession?.selectedGameId ? [currentSession.selectedGameId] : []);
      const isAlreadyLocked = currentIds.includes(gameId);
      const nextIds = isAlreadyLocked
        ? currentIds.filter((id) => id !== gameId)
        : [...currentIds, gameId];
      const nextPrimaryId = nextIds[0] ?? null;

      setSessions((prev) => {
        const updated = prev.map((s) => {
          if (s.id !== sessionId) return s;
          const prevIds = s.selectedGameIds ?? (s.selectedGameId ? [s.selectedGameId] : []);
          const exists = prevIds.includes(gameId);
          const updatedIds = exists
            ? prevIds.filter((id) => id !== gameId)
            : [...prevIds, gameId];
          return {
            ...s,
            selectedGameIds: updatedIds,
            selectedGameId: updatedIds[0],
          };
        });
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });
      dbUpdateSessionGame(sessionId, nextPrimaryId, false, nextIds).catch(console.warn);
    },
    [sessions, syncChannel]
  );

  const selectSessionGame = useCallback(
    (sessionId: string, gameId: string) => {
      const currentSession = sessions.find((s) => s.id === sessionId);
      const currentIds =
        currentSession?.selectedGameIds ??
        (currentSession?.selectedGameId ? [currentSession.selectedGameId] : []);
      const nextIds = [gameId, ...currentIds.filter((id) => id !== gameId)];

      setSessions((prev) => {
        const updated = prev.map((s) => {
          if (s.id !== sessionId) return s;
          const prevIds = s.selectedGameIds ?? (s.selectedGameId ? [s.selectedGameId] : []);
          const updatedIds = [gameId, ...prevIds.filter((id) => id !== gameId)];
          return {
            ...s,
            selectedGameIds: updatedIds,
            selectedGameId: gameId,
            rouletteWinnerGameId: undefined,
          };
        });
        syncChannel?.postMessage({ type: 'SYNC_SESSIONS', payload: updated });
        return updated;
      });
      dbUpdateSessionGame(sessionId, gameId, false, nextIds, null).catch(console.warn);
    },
    [sessions, syncChannel]
  );

  // 4. Attendance, Check-in & Tribunal del Humo
  const checkInToSession = useCallback(
    (sessionId: string, simulatedTime?: string, userId?: string) => {
      const targetUserId = userId || currentUserId;
      const targetPlayer = players.find((p) => p.id === targetUserId) || currentUser;
      const sessionSnapshot = sessions.find((s) => s.id === sessionId);
      const snapshotGroup = sessionSnapshot
        ? groups.find((g) => g.id === sessionSnapshot.groupId)
        : undefined;

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
        const targetGroup = groups.find((g) => g.id === targetSession.groupId);

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
              groupId: targetSession.groupId,
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
              newKarma,
              targetGroup
            );
            dispatchDiscordPipeline(discordLog, targetSession.groupId);

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
          targetUserIds: snapshotGroup ? snapshotGroup.memberIds : players.map((p) => p.id),
        },
        'ping'
      );
    },
    [
      currentUserId,
      currentUser,
      players,
      sessions,
      groups,
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

      const targetGroup = session ? groups.find((g) => g.id === session.groupId) : undefined;
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
        groupId: session?.groupId,
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
      const discordLog = buildSanctionIssuedLog(
        sanctionRecord,
        targetPlayer,
        newKarma,
        newTitle,
        targetGroup
      );
      dispatchDiscordPipeline(discordLog, session?.groupId);

      // Push notification with gavel thud sound
      triggerNotificationPipeline(
        {
          title: `⚖️ Sanción Tribunal del Humo: ${targetPlayer.displayName}`,
          body: reason,
          tag: `sanction_${targetUserId}`,
          sessionId,
          targetUserIds: targetGroup ? targetGroup.memberIds : players.map((p) => p.id),
        },
        'sanction'
      );
    },
    [
      players,
      sessions,
      groups,
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

      const targetGroup = groups.find((g) => g.id === session.groupId);
      const discordLog = buildLatePingLog(
        session,
        targetPlayer,
        currentUser,
        minutesLate,
        targetGroup
      );
      await dispatchDiscordPipeline(discordLog, session.groupId);

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
      groups,
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

      const linkedSession = params.linkedSessionId
        ? sessions.find((s) => s.id === params.linkedSessionId)
        : undefined;
      const chatGroupId = linkedSession?.groupId || resolvedActiveGroupId || undefined;
      const chatGroup = chatGroupId ? groups.find((g) => g.id === chatGroupId) : undefined;

      const newMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        groupId: chatGroupId,
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
        const log = buildChatBroadcastLog(newMessage, currentUser, linkedSession, chatGroup);
        dispatchDiscordPipeline(log, chatGroupId);
      }

      // Local push alert scoped to chat group members
      const scopedTargetIds = (
        chatGroup ? players.filter((p) => chatGroup.memberIds.includes(p.id)) : players
      )
        .filter((p) => p.id !== currentUserId)
        .map((p) => p.id);

      triggerNotificationPipeline(
        {
          title: `💬 ${currentUser.displayName} en Chat`,
          body: params.content,
          tag: `chat_${newMessage.id}`,
          sessionId: params.linkedSessionId,
          targetUserIds: scopedTargetIds,
        },
        'message'
      );
    },
    [
      currentUserId,
      currentUser,
      discordConfig.events.chat_broadcast,
      sessions,
      groups,
      resolvedActiveGroupId,
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

  // 7.1 Steam Library Import & 32D Taste Profile Engine
  const importSteamProfile = useCallback(
    async (
      steamUrlOrId: string,
      customApiKey?: string,
      userId?: string
    ): Promise<{ ok: boolean; message: string; profile?: PlayerSteamProfile }> => {
      const targetUserId = userId || currentUserId;
      const effectiveApiKey = customApiKey || discordConfig.steamApiKey;

      const res = await fetchSteamProfileLibrary(steamUrlOrId, effectiveApiKey, {
        igdbClientId: discordConfig.igdbClientId,
        igdbClientSecret: discordConfig.igdbClientSecret,
      });

      if (customApiKey && customApiKey !== discordConfig.steamApiKey) {
        updateDiscordConfig({ steamApiKey: customApiKey });
      }

      if (!res.ok || !res.profile) {
        return res;
      }

      const fetchedProfile = res.profile;
      const existingTargetPlayer = players.find((p) => p.id === targetUserId);
      const existingOwned = existingTargetPlayer?.steamProfile?.ownedGames || [];
      const existingMap = new Map<number, (typeof existingOwned)[0]>();
      for (const og of existingOwned) {
        existingMap.set(og.appId, og);
      }

      const baseOwnedGames = fetchedProfile.ownedGames
        .filter((g) => !isNonGameSteamApp(g))
        .map((g) => {
          const prev = existingMap.get(g.appId);
          if (!prev) return g;
          return {
            ...g,
            userRating: prev.userRating ?? g.userRating,
            playsOverride: prev.playsOverride,
            burnedOut: prev.burnedOut ?? g.burnedOut,
            selectedForCatalog: prev.selectedForCatalog ?? g.selectedForCatalog,
            manualHoursOverride: prev.manualHoursOverride,
            manualRecentHoursOverride: prev.manualRecentHoursOverride,
            tagVotes: g.tagVotes ?? prev.tagVotes,
          };
        });

      const top10SteamAppIds = new Set<number>(
        [...baseOwnedGames]
          .filter((sg) => {
            const effectiveHours = sg.manualHoursOverride ?? sg.playtimeHours ?? 0;
            const effectiveRecent = sg.manualRecentHoursOverride ?? sg.playtimeRecentHours ?? 0;
            return !sg.burnedOut && (effectiveHours >= 2 || effectiveRecent > 0);
          })
          .sort((a, b) => {
            const ha = a.manualHoursOverride ?? a.playtimeHours ?? 0;
            const hb = b.manualHoursOverride ?? b.playtimeHours ?? 0;
            if (hb !== ha) return hb - ha;
            const ra = a.manualRecentHoursOverride ?? a.playtimeRecentHours ?? 0;
            const rb = b.manualRecentHoursOverride ?? b.playtimeRecentHours ?? 0;
            return rb - ra;
          })
          .slice(0, MAX_AUTO_SELECTED_STEAM_GAMES)
          .map((sg) => sg.appId)
      );

      const mergedOwnedGames = baseOwnedGames.map((sg) => ({
        ...sg,
        playsOverride:
          sg.playsOverride !== undefined
            ? sg.playsOverride
            : top10SteamAppIds.has(sg.appId),
      }));

      const cleanTotalHours =
        Math.round(mergedOwnedGames.reduce((acc, g) => acc + (g.playtimeHours || 0), 0) * 10) / 10;
      const cleanConsiderableCount = mergedOwnedGames.filter((g, idx) =>
        isConsiderableSteamGame(g, idx)
      ).length;

      const mergedSteamProfile: PlayerSteamProfile = {
        ...fetchedProfile,
        totalHours: cleanTotalHours,
        considerableGamesCount: cleanConsiderableCount,
        ownedGames: mergedOwnedGames,
      };

      // Auto-mark matching Club Catalog games ONLY for the top 10 qualifying Steam games
      const autoCatalogPrefs: UserGamePreference[] = [];
      mergedOwnedGames.forEach((sg) => {
        if (!top10SteamAppIds.has(sg.appId)) return;
        const catalogMatch = games.find(
          (cg) =>
            cg.tags.includes(`steam:${sg.appId}`) ||
            normalizeGameName(cg.name) === normalizeGameName(sg.name)
        );
        if (catalogMatch) {
          const steamHours = sg.manualHoursOverride ?? sg.playtimeHours;
          const steamRecent = sg.manualRecentHoursOverride ?? sg.playtimeRecentHours;
          autoCatalogPrefs.push({
            userId: targetUserId,
            gameId: catalogMatch.id,
            plays: !sg.burnedOut,
            rating: sg.userRating ?? sg.suggestedRating ?? 3,
            ...(steamHours && steamHours > 0 ? { hoursPlayed: steamHours } : {}),
            ...(steamRecent && steamRecent > 0 ? { recentHoursPlayed: steamRecent } : {}),
          });
        }
      });

      let updatedPrefsForTaste = preferences;
      if (autoCatalogPrefs.length > 0) {
        const nextPrefs = [...preferences];
        for (const np of autoCatalogPrefs) {
          const existingIdx = nextPrefs.findIndex(
            (p) => p.userId === np.userId && p.gameId === np.gameId
          );
          if (existingIdx >= 0) {
            const resolvedH = np.hoursPlayed ?? nextPrefs[existingIdx].hoursPlayed;
            const resolvedR =
              np.recentHoursPlayed ?? nextPrefs[existingIdx].recentHoursPlayed;
            nextPrefs[existingIdx] = {
              ...nextPrefs[existingIdx],
              plays: np.plays,
              rating: nextPrefs[existingIdx].rating || np.rating,
              ...(resolvedH !== undefined ? { hoursPlayed: resolvedH } : {}),
              ...(resolvedR !== undefined ? { recentHoursPlayed: resolvedR } : {}),
            };
          } else {
            nextPrefs.push(np);
          }
          dbUpsertPreference(nextPrefs[existingIdx >= 0 ? existingIdx : nextPrefs.length - 1]).catch(console.warn);
        }
        updatedPrefsForTaste = nextPrefs;
        setPreferences(nextPrefs);
        syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: nextPrefs });
      }

      let targetUpdated: PlayerProfile | undefined;

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== targetUserId) return p;

          const intermediatePlayer: PlayerProfile = {
            ...p,
            steamProfile: mergedSteamProfile,
          };

          const updatedTaste = recomputeTasteProfileForPlayer(
            intermediatePlayer,
            updatedPrefsForTaste,
            games
          );

          targetUpdated = {
            ...intermediatePlayer,
            tasteProfile: updatedTaste,
          };

          return targetUpdated;
        });

        if (targetUpdated) {
          dbUpsertProfile(targetUpdated).catch(console.warn);
          syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        }

        return nextPlayers;
      });

      return {
        ok: true,
        message: res.message,
        profile: targetUpdated?.steamProfile || mergedSteamProfile,
      };
    },
    [
      currentUserId,
      discordConfig.steamApiKey,
      discordConfig.igdbClientId,
      discordConfig.igdbClientSecret,
      updateDiscordConfig,
      players,
      preferences,
      games,
      syncChannel,
    ]
  );

  const updateSteamGameFeedback = useCallback(
    (
      appId: number,
      patch: {
        userRating?: GameRating;
        burnedOut?: boolean;
        selectedForCatalog?: boolean;
        manualHoursOverride?: number;
        manualRecentHoursOverride?: number;
      },
      userId?: string
    ) => {
      const targetUserId = userId || currentUserId;
      let targetUpdated: PlayerProfile | undefined;

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== targetUserId || !p.steamProfile) return p;

          const nextOwnedGames = p.steamProfile.ownedGames.map((g) => {
            if (g.appId !== appId) return g;
            return {
              ...g,
              ...(patch.userRating !== undefined ? { userRating: patch.userRating } : {}),
              ...(patch.burnedOut !== undefined ? { burnedOut: patch.burnedOut } : {}),
              ...(patch.selectedForCatalog !== undefined
                ? { selectedForCatalog: patch.selectedForCatalog }
                : {}),
              ...(patch.manualHoursOverride !== undefined
                ? { manualHoursOverride: patch.manualHoursOverride }
                : {}),
              ...(patch.manualRecentHoursOverride !== undefined
                ? { manualRecentHoursOverride: patch.manualRecentHoursOverride }
                : {}),
            };
          });

          const intermediatePlayer: PlayerProfile = {
            ...p,
            steamProfile: {
              ...p.steamProfile,
              ownedGames: nextOwnedGames,
            },
          };

          const updatedTaste = recomputeTasteProfileForPlayer(
            intermediatePlayer,
            preferences,
            games
          );

          targetUpdated = {
            ...intermediatePlayer,
            tasteProfile: updatedTaste,
          };

          return targetUpdated;
        });

        if (targetUpdated) {
          dbUpsertProfile(targetUpdated).catch(console.warn);
          syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        }

        return nextPlayers;
      });

      // Also sync rating if a matching game exists in games + preferences
      if (patch.userRating !== undefined) {
        const matchingGame = games.find(
          (g) =>
            g.tags.some((t) => t === `steam:${appId}` || t === `${appId}`) ||
            targetUpdated?.steamProfile?.ownedGames.find((og) => og.appId === appId)?.name.toLowerCase() === g.name.toLowerCase()
        );

        if (matchingGame) {
          const nextPref: UserGamePreference = {
            userId: targetUserId,
            gameId: matchingGame.id,
            plays: true,
            rating: patch.userRating,
          };

          setPreferences((prev) => {
            const filtered = prev.filter(
              (p) => !(p.userId === targetUserId && p.gameId === matchingGame.id)
            );
            const updated = [...filtered, nextPref];
            syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: updated });
            return updated;
          });

          dbUpsertPreference(nextPref).catch(console.warn);
        }
      }
    },
    [currentUserId, games, preferences, syncChannel]
  );

  const updatePlayerTasteProfile = useCallback(
    (patch: Partial<PlayerTasteProfile>, userId?: string) => {
      const targetUserId = userId || currentUserId;
      let targetUpdated: PlayerProfile | undefined;

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== targetUserId) return p;

          const baseTaste: PlayerTasteProfile = p.tasteProfile || {
            topMultiplayerGames: [],
            topSingleplayerGames: [],
            externalGames: [],
            updatedAt: new Date().toISOString(),
          };

          const mergedTaste: PlayerTasteProfile = {
            ...baseTaste,
            ...patch,
            updatedAt: new Date().toISOString(),
          };

          const intermediatePlayer: PlayerProfile = {
            ...p,
            tasteProfile: mergedTaste,
          };

          const recomputedTaste = recomputeTasteProfileForPlayer(
            intermediatePlayer,
            preferences,
            games
          );

          targetUpdated = {
            ...intermediatePlayer,
            tasteProfile: recomputedTaste,
          };

          return targetUpdated;
        });

        if (targetUpdated) {
          dbUpsertProfile(targetUpdated).catch(console.warn);
          syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        }

        return nextPlayers;
      });
    },
    [currentUserId, preferences, games, syncChannel]
  );

  const syncSteamGamesToCatalog = useCallback(
    (appIds: number[], userId?: string) => {
      const targetUserId = userId || currentUserId;
      const targetPlayer = players.find((p) => p.id === targetUserId);
      if (!targetPlayer?.steamProfile) return;

      const appIdSet = new Set(appIds);
      const steamGamesToSync = targetPlayer.steamProfile.ownedGames.filter((g) =>
        appIdSet.has(g.appId)
      );

      if (steamGamesToSync.length === 0) return;

      const newGamesToAdd: Game[] = [];
      const newPreferencesToAdd: UserGamePreference[] = [];

      setGames((prevGames) => {
        const updatedGames = [...prevGames];

        for (const sg of steamGamesToSync) {
          let existing = updatedGames.find(
            (g) =>
              g.tags.includes(`steam:${sg.appId}`) ||
              g.name.trim().toLowerCase() === sg.name.trim().toLowerCase()
          );

          if (!existing) {
            const newGame: Game = {
              id: `game-steam-${sg.appId}`,
              name: sg.name,
              description: `Importado de Steam Library. Min: ${sg.minPlayers}, Max: ${sg.maxPlayers}.`,
              coverUrl: sg.headerImageUrl,
              minPlayers: sg.minPlayers || 1,
              maxPlayers: sg.maxPlayers || 4,
              category: sg.genres[0] || 'Co-op Acción',
              tags: Array.from(new Set([...sg.tags, ...sg.genres, `steam:${sg.appId}`])),
              averageDurationMins: 60,
              addedBy: targetUserId,
            };
            updatedGames.push(newGame);
            newGamesToAdd.push(newGame);
            existing = newGame;
          }

          const rating: GameRating = sg.userRating || sg.suggestedRating || 3;
          const steamHours = sg.manualHoursOverride ?? sg.playtimeHours;
          const steamRecent = sg.manualRecentHoursOverride ?? sg.playtimeRecentHours;
          newPreferencesToAdd.push({
            userId: targetUserId,
            gameId: existing.id,
            plays: true,
            rating,
            ...(steamHours && steamHours > 0 ? { hoursPlayed: steamHours } : {}),
            ...(steamRecent && steamRecent > 0 ? { recentHoursPlayed: steamRecent } : {}),
          });
        }

        for (const g of newGamesToAdd) {
          dbInsertGame(g).catch(console.warn);
        }

        syncChannel?.postMessage({ type: 'SYNC_ALL', payload: { games: updatedGames } });
        return updatedGames;
      });

      if (newPreferencesToAdd.length > 0) {
        setPreferences((prevPrefs) => {
          const nextPrefs = [...prevPrefs];
          for (const np of newPreferencesToAdd) {
            const idx = nextPrefs.findIndex(
              (p) => p.userId === np.userId && p.gameId === np.gameId
            );
            if (idx >= 0) {
              nextPrefs[idx] = np;
            } else {
              nextPrefs.push(np);
            }
            dbUpsertPreference(np).catch(console.warn);
          }
          syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: nextPrefs });
          return nextPrefs;
        });
      }

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== targetUserId || !p.steamProfile) return p;

          const nextOwned = p.steamProfile.ownedGames.map((og) => {
            if (appIdSet.has(og.appId)) {
              return { ...og, selectedForCatalog: true };
            }
            return og;
          });

          const intermediatePlayer: PlayerProfile = {
            ...p,
            steamProfile: {
              ...p.steamProfile,
              ownedGames: nextOwned,
            },
          };

          const updatedTaste = recomputeTasteProfileForPlayer(
            intermediatePlayer,
            preferences,
            games
          );

          const updatedPlayer = {
            ...intermediatePlayer,
            tasteProfile: updatedTaste,
          };

          dbUpsertProfile(updatedPlayer).catch(console.warn);
          return updatedPlayer;
        });

        syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        return nextPlayers;
      });
    },
    [currentUserId, players, preferences, games, syncChannel]
  );

  const setUnifiedGameFeedback = useCallback(
    (
      game: UnifiedSelectorGame,
      patch: {
        plays?: boolean;
        rating?: GameRating;
        burnedOut?: boolean;
        platform?: ExternalGamePlatform;
        hoursPlayed?: number;
        recentHoursPlayed?: number;
      },
      userId?: string
    ) => {
      const targetUserId = userId || currentUserId;
      const normName = normalizeGameName(game.name);
      const nextRating: GameRating = patch.rating ?? game.effectiveRating ?? 4;

      // 1. Sync matching Club Catalog preference if game exists in catalog
      const matchingCatalogGame =
        (game.catalogGameId
          ? games.find((g) => g.id === game.catalogGameId)
          : undefined) ||
        games.find(
          (g) =>
            (game.steamAppId !== undefined && g.tags.includes(`steam:${game.steamAppId}`)) ||
            normalizeGameName(g.name) === normName
        );

      const existingMatchingPref = matchingCatalogGame
        ? preferences.find(
            (p) => p.userId === targetUserId && p.gameId === matchingCatalogGame.id
          )
        : undefined;
      const fallbackGameHours = game.playtimeHours > 0 ? game.playtimeHours : undefined;
      const fallbackGameRecent =
        game.playtimeRecentHours > 0 ? game.playtimeRecentHours : undefined;
      const resolvedHoursPlayed =
        patch.hoursPlayed ?? existingMatchingPref?.hoursPlayed ?? fallbackGameHours;
      const resolvedRecentHoursPlayed =
        patch.recentHoursPlayed ??
        existingMatchingPref?.recentHoursPlayed ??
        fallbackGameRecent;

      let nextPrefsSnapshot = preferences;
      if (matchingCatalogGame) {
        const resolvedPlays =
          patch.burnedOut === true
            ? false
            : patch.plays !== undefined
            ? patch.plays
            : patch.rating !== undefined
            ? true
            : existingMatchingPref?.plays ?? true;
        const resolvedRating = patch.rating ?? existingMatchingPref?.rating ?? nextRating;
        const resolvedPref: UserGamePreference = {
          userId: targetUserId,
          gameId: matchingCatalogGame.id,
          plays: resolvedPlays,
          rating: resolvedRating,
          ...(resolvedHoursPlayed !== undefined ? { hoursPlayed: resolvedHoursPlayed } : {}),
          ...(resolvedRecentHoursPlayed !== undefined
            ? { recentHoursPlayed: resolvedRecentHoursPlayed }
            : {}),
        };
        const filtered = preferences.filter(
          (p) => !(p.userId === targetUserId && p.gameId === matchingCatalogGame.id)
        );
        nextPrefsSnapshot = [...filtered, resolvedPref];
        setPreferences(nextPrefsSnapshot);
        syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: nextPrefsSnapshot });
        dbUpsertPreference({
          userId: targetUserId,
          gameId: matchingCatalogGame.id,
          plays: resolvedPlays,
          rating: resolvedRating,
        }).catch(console.warn);
      }

      // 2. Persist onto Steam profile (if owned on Steam) OR externalGames list (uniformly)
      let targetUpdated: PlayerProfile | undefined;

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== targetUserId) return p;

          let nextSteamProfile = p.steamProfile;
          const baseTaste: PlayerTasteProfile = p.tasteProfile || {
            topMultiplayerGames: [],
            topSingleplayerGames: [],
            externalGames: [],
            updatedAt: new Date().toISOString(),
          };
          let nextExternalGames = [...(baseTaste.externalGames || [])];

          if (game.ownedOnSteam && game.steamAppId && p.steamProfile) {
            nextSteamProfile = {
              ...p.steamProfile,
              ownedGames: p.steamProfile.ownedGames.map((og) => {
                if (og.appId !== game.steamAppId) return og;
                const clearRatingOnUnmark =
                  patch.plays === false && patch.rating === undefined;
                const nextPlaysOverride =
                  patch.burnedOut === true
                    ? false
                    : patch.plays !== undefined
                    ? patch.plays
                    : patch.rating !== undefined ||
                      patch.hoursPlayed !== undefined ||
                      patch.recentHoursPlayed !== undefined
                    ? true
                    : og.playsOverride;
                return {
                  ...og,
                  userRating: clearRatingOnUnmark
                    ? undefined
                    : patch.rating !== undefined
                    ? patch.rating
                    : patch.plays === true && og.userRating === undefined
                    ? nextRating
                    : og.userRating,
                  ...(nextPlaysOverride !== undefined
                    ? { playsOverride: nextPlaysOverride }
                    : {}),
                  burnedOut:
                    patch.burnedOut !== undefined
                      ? patch.burnedOut
                      : og.burnedOut,
                  ...(patch.hoursPlayed !== undefined
                    ? { manualHoursOverride: patch.hoursPlayed }
                    : {}),
                  ...(patch.recentHoursPlayed !== undefined
                    ? { manualRecentHoursOverride: patch.recentHoursPlayed }
                    : {}),
                };
              }),
            };
          } else {
            const existingExtIndex = nextExternalGames.findIndex(
              (ext) =>
                (game.externalGameId && ext.gameId === game.externalGameId) ||
                normalizeGameName(ext.name) === normName
            );

            if (
              patch.plays === false &&
              patch.rating === undefined &&
              patch.burnedOut === undefined &&
              patch.hoursPlayed === undefined &&
              patch.recentHoursPlayed === undefined
            ) {
              if (existingExtIndex >= 0) {
                nextExternalGames.splice(existingExtIndex, 1);
              }
            } else {
              const resolvedPlatform: ExternalGamePlatform =
                patch.platform ||
                (existingExtIndex >= 0
                  ? nextExternalGames[existingExtIndex].platform
                  : (['Steam (Otra cuenta / Verde)', 'Riot Games', 'Epic Games', 'Battle.net', 'EA App', 'Xbox Game Pass', 'Otro Launcher'].includes(
                      game.platform
                    )
                      ? (game.platform as ExternalGamePlatform)
                      : 'Otro Launcher'));

              const prevExt = existingExtIndex >= 0 ? nextExternalGames[existingExtIndex] : undefined;
              const updatedExternalEntry: ExternalRatedGame = {
                gameId:
                  prevExt?.gameId ||
                  game.externalGameId ||
                  (game.igdbId
                    ? `igdb-${game.igdbId}`
                    : game.steamAppId
                    ? `steam-ext-${game.steamAppId}`
                    : `ext-${normName}`),
                steamAppId: game.steamAppId,
                igdbId: game.igdbId,
                name: game.name,
                platform: resolvedPlatform,
                coverUrl: game.coverUrl,
                category: game.category,
                tags: game.tags,
                ...(game.tagVotes || prevExt?.tagVotes
                  ? { tagVotes: game.tagVotes ?? prevExt?.tagVotes }
                  : {}),
                minPlayers: game.minPlayers,
                maxPlayers: game.maxPlayers,
                isMultiplayer: game.isMultiplayer,
                rating: patch.rating ?? prevExt?.rating ?? nextRating,
                ...(patch.hoursPlayed !== undefined || prevExt?.hoursPlayedEstimate !== undefined
                  ? {
                      hoursPlayedEstimate:
                        patch.hoursPlayed !== undefined
                          ? patch.hoursPlayed
                          : prevExt?.hoursPlayedEstimate,
                    }
                  : {}),
                ...(patch.recentHoursPlayed !== undefined ||
                prevExt?.recentHoursPlayed !== undefined
                  ? {
                      recentHoursPlayed:
                        patch.recentHoursPlayed ?? prevExt?.recentHoursPlayed,
                    }
                  : {}),
                burnedOut:
                  patch.burnedOut !== undefined
                    ? patch.burnedOut
                    : prevExt?.burnedOut ?? false,
                source:
                  game.source === 'igdb_discovery' || game.igdbId
                    ? 'igdb'
                    : game.steamAppId
                    ? 'steam'
                    : 'curated',
              };

              if (existingExtIndex >= 0) {
                nextExternalGames[existingExtIndex] = updatedExternalEntry;
              } else {
                nextExternalGames = [updatedExternalEntry, ...nextExternalGames];
              }
            }
          }

          // Mirror hours into catalogGameHours & any matching Podium Top 3 slots
          const prevCatalogHours = baseTaste.catalogGameHours || {};
          const nextCatalogHours =
            matchingCatalogGame &&
            (resolvedHoursPlayed !== undefined || resolvedRecentHoursPlayed !== undefined)
              ? {
                  ...prevCatalogHours,
                  [matchingCatalogGame.id]: {
                    hoursPlayed:
                      resolvedHoursPlayed ??
                      prevCatalogHours[matchingCatalogGame.id]?.hoursPlayed ??
                      0,
                    ...(resolvedRecentHoursPlayed !== undefined ||
                    prevCatalogHours[matchingCatalogGame.id]?.recentHoursPlayed !== undefined
                      ? {
                          recentHoursPlayed:
                            resolvedRecentHoursPlayed ??
                            prevCatalogHours[matchingCatalogGame.id]?.recentHoursPlayed ??
                            0,
                        }
                      : {}),
                  },
                }
              : prevCatalogHours;

          const syncPodiumHours = (entries: typeof baseTaste.topMultiplayerGames) =>
            patch.hoursPlayed !== undefined || patch.recentHoursPlayed !== undefined
              ? entries.map((pe) => {
                  const matchesPodium =
                    (game.steamAppId !== undefined && pe.steamAppId === game.steamAppId) ||
                    normalizeGameName(pe.name) === normName;
                  if (!matchesPodium) return pe;
                  return {
                    ...pe,
                    ...(patch.hoursPlayed !== undefined
                      ? { hoursPlayed: patch.hoursPlayed }
                      : {}),
                    ...(patch.recentHoursPlayed !== undefined
                      ? { recentHoursPlayed: patch.recentHoursPlayed }
                      : {}),
                  };
                })
              : entries;

          const intermediatePlayer: PlayerProfile = {
            ...p,
            steamProfile: nextSteamProfile,
            tasteProfile: {
              ...baseTaste,
              topMultiplayerGames: syncPodiumHours(baseTaste.topMultiplayerGames || []),
              topSingleplayerGames: syncPodiumHours(baseTaste.topSingleplayerGames || []),
              externalGames: nextExternalGames,
              catalogGameHours: nextCatalogHours,
              updatedAt: new Date().toISOString(),
            },
          };

          const recomputedTaste = recomputeTasteProfileForPlayer(
            intermediatePlayer,
            nextPrefsSnapshot,
            games
          );

          targetUpdated = {
            ...intermediatePlayer,
            tasteProfile: recomputedTaste,
          };

          return targetUpdated;
        });

        if (targetUpdated) {
          dbUpsertProfile(targetUpdated).catch(console.warn);
          syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        }

        return nextPlayers;
      });
    },
    [currentUserId, games, preferences, syncChannel]
  );

  const syncUnifiedGameToCatalog = useCallback(
    (game: UnifiedSelectorGame, userId?: string): Game | null => {
      const targetUserId = userId || currentUserId;
      const normName = normalizeGameName(game.name);

      let resolvedCatalogGame =
        (game.catalogGameId
          ? games.find((g) => g.id === game.catalogGameId)
          : undefined) ||
        games.find(
          (g) =>
            (game.steamAppId !== undefined && g.tags.includes(`steam:${game.steamAppId}`)) ||
            normalizeGameName(g.name) === normName
        ) ||
        null;

      if (!resolvedCatalogGame) {
        const tagSet = new Set<string>(game.tags || []);
        if (game.steamAppId) tagSet.add(`steam:${game.steamAppId}`);
        if (game.platform && !game.platform.includes('/')) {
          tagSet.add(game.platform);
        }

        const newGame: Game = {
          id: game.steamAppId
            ? `game-steam-${game.steamAppId}`
            : game.igdbId
            ? `game-igdb-${game.igdbId}`
            : `game-${normName.replace(/[^a-z0-9]/g, '') || Date.now()}-${Date.now()}`,
          name: game.name,
          description: `Agregado desde ${game.platform}. Cupo: ${game.minPlayers}-${game.maxPlayers} jug.`,
          coverUrl:
            game.coverUrl ||
            'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
          minPlayers: Math.max(1, game.minPlayers || 1),
          maxPlayers: Math.max(1, game.maxPlayers || 4),
          category: game.category || 'Co-op Acción',
          tags: Array.from(tagSet).slice(0, 8),
          averageDurationMins: 50,
          addedBy: targetUserId,
        };

        resolvedCatalogGame = newGame;
        setGames((prevGames) => {
          if (prevGames.some((g) => normalizeGameName(g.name) === normName)) {
            return prevGames;
          }
          const updatedGames = [...prevGames, newGame];
          syncChannel?.postMessage({ type: 'SYNC_ALL', payload: { games: updatedGames } });
          return updatedGames;
        });
        dbInsertGame(newGame).catch(console.warn);
      }

      if (resolvedCatalogGame) {
        const nextPref: UserGamePreference = {
          userId: targetUserId,
          gameId: resolvedCatalogGame.id,
          plays: !game.burnedOut,
          rating: game.effectiveRating || 4,
          ...(game.playtimeHours > 0 ? { hoursPlayed: game.playtimeHours } : {}),
          ...(game.playtimeRecentHours > 0 ? { recentHoursPlayed: game.playtimeRecentHours } : {}),
        };

        setPreferences((prevPrefs) => {
          const filtered = prevPrefs.filter(
            (p) => !(p.userId === targetUserId && p.gameId === resolvedCatalogGame!.id)
          );
          const updatedPrefs = [...filtered, nextPref];
          syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: updatedPrefs });
          return updatedPrefs;
        });
        dbUpsertPreference(nextPref).catch(console.warn);

        if (game.playtimeHours > 0 || game.playtimeRecentHours > 0) {
          const syncedCatalogId = resolvedCatalogGame.id;
          setPlayers((prevPlayers) => {
            let targetUpdated: PlayerProfile | undefined;
            const nextPlayers = prevPlayers.map((p) => {
              if (p.id !== targetUserId) return p;
              const baseTaste: PlayerTasteProfile = p.tasteProfile || {
                topMultiplayerGames: [],
                topSingleplayerGames: [],
                externalGames: [],
                updatedAt: new Date().toISOString(),
              };
              const prevCatalogHours = baseTaste.catalogGameHours || {};
              targetUpdated = {
                ...p,
                tasteProfile: {
                  ...baseTaste,
                  catalogGameHours: {
                    ...prevCatalogHours,
                    [syncedCatalogId]: {
                      hoursPlayed:
                        game.playtimeHours > 0
                          ? game.playtimeHours
                          : prevCatalogHours[syncedCatalogId]?.hoursPlayed ?? 0,
                      ...(game.playtimeRecentHours > 0 ||
                      prevCatalogHours[syncedCatalogId]?.recentHoursPlayed !== undefined
                        ? {
                            recentHoursPlayed:
                              game.playtimeRecentHours > 0
                                ? game.playtimeRecentHours
                                : prevCatalogHours[syncedCatalogId]?.recentHoursPlayed ?? 0,
                          }
                        : {}),
                    },
                  },
                  updatedAt: new Date().toISOString(),
                },
              };
              return targetUpdated;
            });
            if (targetUpdated) {
              dbUpsertProfile(targetUpdated).catch(console.warn);
              syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
            }
            return nextPlayers;
          });
        }
      }

      if (game.ownedOnSteam && game.steamAppId) {
        updateSteamGameFeedback(
          game.steamAppId,
          { selectedForCatalog: true },
          targetUserId
        );
      }

      return resolvedCatalogGame;
    },
    [currentUserId, games, syncChannel, updateSteamGameFeedback]
  );

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
      createAndLoginProfile,
      logout,
      loginWithDiscord,
      updateUserProfile,
      completeOnboarding,
      isSupabaseConnected: isSupabaseConfigured(),

      groups,
      userGroups,
      activeGroupId: resolvedActiveGroupId,
      activeGroup,
      pendingInviteCode,
      pendingInviteGroup,
      setActiveGroupId,
      createGroup,
      updateGroup,
      deleteGroup,
      joinGroupByInviteCode,
      addMemberToGroup,
      removeMemberFromGroup,
      addGameToGroup,
      removeGameFromGroup,
      addAndLinkGameToGroup,
      testGroupDiscordWebhook,
      getGroupInviteLink,
      voteGroupRecommendation,

      updateWeeklySchedule,
      setDailyOverride,
      toggleTodayNotPlaying,
      updateCategoryPreferences,

      games,
      preferences: visiblePreferences,
      updateGamePreference,
      addGame,

      importSteamProfile,
      updateSteamGameFeedback,
      updatePlayerTasteProfile,
      syncSteamGamesToCatalog,
      setUnifiedGameFeedback,
      syncUnifiedGameToCatalog,

      sessions: visibleSessions,
      activeSessionId,
      setActiveSessionId,
      createSession,
      createInstantSession,
      deleteSession,
      respondToInstantSession,
      joinOrUpdateSessionSchedule,
      confirmSessionAttendance,
      sendSessionCallout,
      updateSessionInvites,
      leaveSession,
      spinSessionRoulette,
      lockSessionGame,
      selectSessionGame,

      sanctions: visibleSanctions,
      checkInToSession,
      castAttendanceVote,
      issueDirectSanction,
      pingLatePlayer,

      chatMessages: visibleChatMessages,
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
      visiblePlayers,
      isAuthenticated,
      showOnboardingModal,
      showWeeklyScheduleModal,
      createAndLoginProfile,
      logout,
      loginWithDiscord,
      updateUserProfile,
      completeOnboarding,
      groups,
      userGroups,
      resolvedActiveGroupId,
      activeGroup,
      pendingInviteCode,
      pendingInviteGroup,
      setActiveGroupId,
      createGroup,
      updateGroup,
      deleteGroup,
      joinGroupByInviteCode,
      addMemberToGroup,
      removeMemberFromGroup,
      addGameToGroup,
      removeGameFromGroup,
      addAndLinkGameToGroup,
      testGroupDiscordWebhook,
      getGroupInviteLink,
      voteGroupRecommendation,
      updateWeeklySchedule,
      setDailyOverride,
      toggleTodayNotPlaying,
      updateCategoryPreferences,
      games,
      visiblePreferences,
      updateGamePreference,
      addGame,
      importSteamProfile,
      updateSteamGameFeedback,
      updatePlayerTasteProfile,
      syncSteamGamesToCatalog,
      setUnifiedGameFeedback,
      syncUnifiedGameToCatalog,
      visibleSessions,
      activeSessionId,
      setActiveSessionId,
      createSession,
      createInstantSession,
      deleteSession,
      respondToInstantSession,
      joinOrUpdateSessionSchedule,
      confirmSessionAttendance,
      sendSessionCallout,
      updateSessionInvites,
      leaveSession,
      spinSessionRoulette,
      lockSessionGame,
      selectSessionGame,
      visibleSanctions,
      checkInToSession,
      castAttendanceVote,
      issueDirectSanction,
      pingLatePlayer,
      visibleChatMessages,
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
