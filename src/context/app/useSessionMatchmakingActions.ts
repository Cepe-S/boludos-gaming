import React, { useCallback, useMemo } from 'react';
import {
  DiscordIntegrationConfig,
  Game,
  GamingGroup,
  GamingSession,
  PlayerProfile,
  PrecisionMinutes,
  SessionCalloutRecord,
  SessionParticipant,
  UserGamePreference,
} from '../../types/domain';
import {
  calculateGameSynchrony,
  getEffectiveDailySchedule,
  getProbableAvailablePlayersForSession,
  spinWeightedRoulette,
} from '../../lib/matchmakingEngine';
import {
  buildPlayerJoinedLog,
  buildRouletteWinnerLog,
  buildSessionCalloutDiscordPayload,
} from '../../lib/discordService';
import {
  dbUpdateSessionGame,
  dbUpdateSessionInvitesAndCallouts,
  dbUpsertParticipant,
} from '../../lib/supabaseSync';
import {
  DispatchDiscordPipeline,
  TriggerNotificationPipeline,
} from './useNotificationsAndDiscord';

export interface UseSessionMatchmakingActionsParams {
  currentUserId: string;
  currentUser: PlayerProfile;
  players: PlayerProfile[];
  sessions: GamingSession[];
  groups: GamingGroup[];
  games: Game[];
  preferences: UserGamePreference[];
  discordConfig: DiscordIntegrationConfig;
  syncChannel: BroadcastChannel | null;
  setSessions: React.Dispatch<React.SetStateAction<GamingSession[]>>;
  dispatchDiscordPipeline: DispatchDiscordPipeline;
  triggerNotificationPipeline: TriggerNotificationPipeline;
}

export function useSessionMatchmakingActions({
  currentUserId,
  currentUser,
  players,
  sessions,
  groups,
  games,
  preferences,
  discordConfig,
  syncChannel,
  setSessions,
  dispatchDiscordPipeline,
  triggerNotificationPipeline,
}: UseSessionMatchmakingActionsParams) {
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
      setSessions,
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
              note: existing.note
                ? `${existing.note} · Confirmado 100% ✅`
                : 'Confirmado 100% ✅',
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
      setSessions,
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
      setSessions,
    ]
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
        const lockedSyncResults = synchronyResults.filter((r) => lockedIds.includes(r.game.id));
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
      setSessions,
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
    [sessions, syncChannel, setSessions]
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
    [sessions, syncChannel, setSessions]
  );

  return useMemo(
    () => ({
      joinOrUpdateSessionSchedule,
      confirmSessionAttendance,
      sendSessionCallout,
      spinSessionRoulette,
      lockSessionGame,
      selectSessionGame,
    }),
    [
      joinOrUpdateSessionSchedule,
      confirmSessionAttendance,
      sendSessionCallout,
      spinSessionRoulette,
      lockSessionGame,
      selectSessionGame,
    ]
  );
}
