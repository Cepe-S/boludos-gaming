import React, { startTransition, useEffect } from 'react';
import {
  ChatMessage,
  DiscordIntegrationConfig,
  Game,
  GamingGroup,
  GamingSession,
  PlayerProfile,
  SanctionRecord,
  UserGamePreference,
} from '../../types/domain';
import { createDefaultWeeklySchedule } from '../../lib/matchmakingEngine';
import { registerServiceWorker } from '../../lib/pushService';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import {
  dbUpsertProfile,
  fetchAllSupabaseData,
  subscribeToSupabaseRealtime,
} from '../../lib/supabaseSync';
import { awaitInitialResetSignOut } from './storageAndHelpers';
import { sanitizePlayerProfileNonGames } from './playerSanitizers';

export interface ActiveSessionUserState {
  userId: string;
  isAuthenticated: boolean;
}

export interface UseSupabaseAuthSyncParams {
  players: PlayerProfile[];
  preferences: UserGamePreference[];
  games: Game[];
  syncChannel: BroadcastChannel | null;
  activeSessionUserRef: React.MutableRefObject<ActiveSessionUserState>;
  autoOpenedTourUserIdsRef: React.MutableRefObject<Set<string>>;
  setPlayers: React.Dispatch<React.SetStateAction<PlayerProfile[]>>;
  setCurrentUserId: React.Dispatch<React.SetStateAction<string>>;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  setShowOnboardingModal: React.Dispatch<React.SetStateAction<boolean>>;
  setGames: React.Dispatch<React.SetStateAction<Game[]>>;
  setPreferences: React.Dispatch<React.SetStateAction<UserGamePreference[]>>;
  setGroups: React.Dispatch<React.SetStateAction<GamingGroup[]>>;
  setSessions: React.Dispatch<React.SetStateAction<GamingSession[]>>;
  setActiveSessionIdState: React.Dispatch<React.SetStateAction<string>>;
  setSanctions: React.Dispatch<React.SetStateAction<SanctionRecord[]>>;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setDiscordConfig: React.Dispatch<React.SetStateAction<DiscordIntegrationConfig>>;
}

export function useSupabaseAuthSync({
  players,
  preferences,
  games,
  syncChannel,
  activeSessionUserRef,
  autoOpenedTourUserIdsRef,
  setPlayers,
  setCurrentUserId,
  setIsAuthenticated,
  setShowOnboardingModal,
  setGames,
  setPreferences,
  setGroups,
  setSessions,
  setActiveSessionIdState,
  setSanctions,
  setChatMessages,
  setDiscordConfig,
}: UseSupabaseAuthSyncParams): void {
  // Register Service Worker on initial mount
  useEffect(() => {
    registerServiceWorker().catch(() => {});
  }, []);

  // Hydrate and subscribe to Supabase Realtime when configured
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;

    let isMounted = true;
    let inFlight = false;
    let pendingRefresh = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const applyHydratedState = (data: NonNullable<Awaited<ReturnType<typeof fetchAllSupabaseData>>>) => {
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
            const remotePartIds = new Set(nextSession.participants.map((p) => p.userId));
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
        data.sessions.some((s) => s.id === prev) ? prev : data.sessions[0]?.id || ''
      );
      setSanctions(data.sanctions);
      setChatMessages(data.chatMessages);
      if (data.discordConfig) setDiscordConfig(data.discordConfig);
    };

    const hydrate = async (isRealtimeRefresh = false) => {
      if (inFlight) {
        pendingRefresh = true;
        return;
      }
      inFlight = true;
      try {
        const data = await fetchAllSupabaseData();
        if (!data || !isMounted) return;
        if (isRealtimeRefresh) {
          startTransition(() => applyHydratedState(data));
        } else {
          applyHydratedState(data);
        }
      } finally {
        inFlight = false;
        if (pendingRefresh && isMounted) {
          pendingRefresh = false;
          scheduleRealtimeHydrate();
        }
      }
    };

    const scheduleRealtimeHydrate = () => {
      if (!isMounted) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void hydrate(true);
      }, 450);
    };

    void hydrate(false);

    const unsubscribe = subscribeToSupabaseRealtime(() => {
      scheduleRealtimeHydrate();
    });

    return () => {
      isMounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [
    activeSessionUserRef,
    setPlayers,
    setGames,
    setPreferences,
    setGroups,
    setSessions,
    setActiveSessionIdState,
    setSanctions,
    setChatMessages,
    setDiscordConfig,
  ]);

  // Listen for Supabase Discord OAuth sessions
  useEffect(() => {
    const sbClient = supabase;
    if (!sbClient) return;

    let isCancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const attachAuthListener = async () => {
      await awaitInitialResetSignOut(() => sbClient.auth.signOut({ scope: 'local' }));

      if (isCancelled) return;

      const { data } = sbClient.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          const user = session.user;
          const userId = user.id;
          const isSameActiveUser =
            activeSessionUserRef.current.isAuthenticated &&
            activeSessionUserRef.current.userId === userId;

          // Ignore token refresh / tab-focus re-emissions when user is already active in app
          if (
            isSameActiveUser &&
            (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED')
          ) {
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
  }, [
    syncChannel,
    activeSessionUserRef,
    autoOpenedTourUserIdsRef,
    setPlayers,
    setCurrentUserId,
    setIsAuthenticated,
    setShowOnboardingModal,
  ]);

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
  }, [players, preferences, games, syncChannel, setPlayers]);
}
