import React, { useCallback, useMemo } from 'react';
import {
  CategoryPreferenceLevel,
  DailyScheduleOverride,
  DiscordNotificationLog,
  Game,
  GamingGroup,
  PlayerProfile,
  UserGamePreference,
  WeeklySchedule,
} from '../../types/domain';
import { createDefaultWeeklySchedule } from '../../lib/matchmakingEngine';
import { isDiscordOAuthProviderEnabled, supabase } from '../../lib/supabaseClient';
import { dbUpsertProfile } from '../../lib/supabaseSync';
import { recomputeTasteProfileForPlayer } from './playerSanitizers';
import {
  DispatchDiscordPipeline,
  TriggerNotificationPipeline,
} from './useNotificationsAndDiscord';
import { ActiveSessionUserState } from './useSupabaseAuthSync';

export interface UseAuthAndScheduleActionsParams {
  currentUserId: string;
  currentUser: PlayerProfile;
  players: PlayerProfile[];
  groups: GamingGroup[];
  preferences: UserGamePreference[];
  games: Game[];
  pendingInviteCode: string | null;
  syncChannel: BroadcastChannel | null;
  activeSessionUserRef: React.MutableRefObject<ActiveSessionUserState>;
  setPlayers: React.Dispatch<React.SetStateAction<PlayerProfile[]>>;
  setCurrentUserId: React.Dispatch<React.SetStateAction<string>>;
  setIsAuthenticated: React.Dispatch<React.SetStateAction<boolean>>;
  setShowOnboardingModal: React.Dispatch<React.SetStateAction<boolean>>;
  reconcileSessionsScopedToGroups: (updatedPlayers: PlayerProfile[], filterDate?: string) => void;
  triggerNotificationPipeline: TriggerNotificationPipeline;
  dispatchDiscordPipeline: DispatchDiscordPipeline;
}

export function useAuthAndScheduleActions({
  currentUserId,
  currentUser,
  players,
  groups,
  preferences,
  games,
  pendingInviteCode,
  syncChannel,
  activeSessionUserRef,
  setPlayers,
  setCurrentUserId,
  setIsAuthenticated,
  setShowOnboardingModal,
  reconcileSessionsScopedToGroups,
  triggerNotificationPipeline,
  dispatchDiscordPipeline,
}: UseAuthAndScheduleActionsParams) {
  // Current User, Welcome Screen & Auth
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
    [
      players,
      reconcileSessionsScopedToGroups,
      activeSessionUserRef,
      setPlayers,
      syncChannel,
      setCurrentUserId,
      setIsAuthenticated,
      setShowOnboardingModal,
    ]
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
  }, [setIsAuthenticated]);

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
      patch: Partial<
        Pick<PlayerProfile, 'displayName' | 'discordUsername' | 'avatarUrl' | 'birthDate' | 'bio'>
      >,
      userId?: string
    ) => {
      const targetUserId = userId || currentUserId;
      let updatedProfile: PlayerProfile | undefined;

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== targetUserId) return p;
          updatedProfile = {
            ...p,
            ...(patch.displayName !== undefined
              ? { displayName: patch.displayName.trim() || p.displayName }
              : {}),
            ...(patch.discordUsername !== undefined
              ? { discordUsername: patch.discordUsername.trim() }
              : {}),
            ...(patch.avatarUrl !== undefined
              ? { avatarUrl: patch.avatarUrl.trim() || p.avatarUrl }
              : {}),
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
    [currentUserId, syncChannel, setPlayers]
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
  }, [
    currentUser,
    players,
    reconcileSessionsScopedToGroups,
    setPlayers,
    syncChannel,
    setShowOnboardingModal,
  ]);

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
    [currentUserId, players, syncChannel, reconcileSessionsScopedToGroups, setPlayers]
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
    [currentUserId, players, syncChannel, reconcileSessionsScopedToGroups, setPlayers]
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
    [currentUserId, preferences, games, syncChannel, setPlayers]
  );

  return useMemo(
    () => ({
      createAndLoginProfile,
      logout,
      loginWithDiscord,
      updateUserProfile,
      completeOnboarding,
      updateWeeklySchedule,
      setDailyOverride,
      toggleTodayNotPlaying,
      updateCategoryPreferences,
    }),
    [
      createAndLoginProfile,
      logout,
      loginWithDiscord,
      updateUserProfile,
      completeOnboarding,
      updateWeeklySchedule,
      setDailyOverride,
      toggleTodayNotPlaying,
      updateCategoryPreferences,
    ]
  );
}
