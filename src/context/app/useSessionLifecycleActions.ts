import React, { useCallback, useMemo } from 'react';
import {
  DiscordIntegrationConfig,
  GamingGroup,
  GamingSession,
  InstantSessionRsvp,
  PlayerProfile,
  PrecisionMinutes,
  SessionParticipant,
} from '../../types/domain';
import {
  formatMinutesToTime,
  reconcileAutoParticipantsForSession,
} from '../../lib/matchmakingEngine';
import { buildSessionCreatedLog } from '../../lib/discordService';
import {
  dbCreateSession,
  dbDeleteParticipant,
  dbDeleteSession,
  dbUpdateSessionInvitesAndCallouts,
  dbUpsertGroup,
  dbUpsertInstantRsvp,
  dbUpsertParticipant,
} from '../../lib/supabaseSync';
import { generateUniqueInviteCode } from './storageAndHelpers';
import {
  DispatchDiscordPipeline,
  TriggerNotificationPipeline,
} from './useNotificationsAndDiscord';

export interface UseSessionLifecycleActionsParams {
  currentUserId: string;
  currentUser: PlayerProfile;
  groups: GamingGroup[];
  resolvedActiveGroupId: string | null;
  userGroups: GamingGroup[];
  discordConfig: DiscordIntegrationConfig;
  players: PlayerProfile[];
  sessions: GamingSession[];
  syncChannel: BroadcastChannel | null;
  setGroups: React.Dispatch<React.SetStateAction<GamingGroup[]>>;
  setActiveGroupIdState: React.Dispatch<React.SetStateAction<string | null>>;
  setSessions: React.Dispatch<React.SetStateAction<GamingSession[]>>;
  setActiveSessionIdState: React.Dispatch<React.SetStateAction<string>>;
  dispatchDiscordPipeline: DispatchDiscordPipeline;
  triggerNotificationPipeline: TriggerNotificationPipeline;
}

export function useSessionLifecycleActions({
  currentUserId,
  currentUser,
  groups,
  resolvedActiveGroupId,
  userGroups,
  discordConfig,
  players,
  sessions,
  syncChannel,
  setGroups,
  setActiveGroupIdState,
  setSessions,
  setActiveSessionIdState,
  dispatchDiscordPipeline,
  triggerNotificationPipeline,
}: UseSessionLifecycleActionsParams) {
  const setActiveSessionId = useCallback(
    (sessionId: string) => {
      setActiveSessionIdState(sessionId);
    },
    [setActiveSessionIdState]
  );

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
        : resolvedTargetGroup.discordConfig.mentionRoleId ||
          discordConfig.mentionRoleId ||
          '@everyone';
      const discordLog = buildSessionCreatedLog(
        newSession,
        currentUser,
        mentionRole,
        resolvedTargetGroup
      );
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
      setGroups,
      setActiveGroupIdState,
      setSessions,
      setActiveSessionIdState,
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
          : targetGroup.discordConfig.mentionRoleId ||
            discordConfig.mentionRoleId ||
            '@everyone';
        const discordLog = buildSessionCreatedLog(
          newSession,
          currentUser,
          mentionRole,
          targetGroup
        );
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
      setSessions,
      setActiveSessionIdState,
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
      const dur =
        params.durationMinutes && params.durationMinutes > 0
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
      const existingPart = targetSession?.participants.find((p) => p.userId === targetUserId);
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
    [currentUserId, sessions, syncChannel, setSessions]
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
    [players, groups, syncChannel, setSessions]
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
    [currentUserId, syncChannel, setSessions]
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

      setActiveSessionIdState((prevActive) => (prevActive === sessionId ? '' : prevActive));

      dbDeleteSession(sessionId).catch(console.warn);
    },
    [sessions, groups, currentUserId, syncChannel, setSessions, setActiveSessionIdState]
  );

  return useMemo(
    () => ({
      setActiveSessionId,
      createSession,
      createInstantSession,
      respondToInstantSession,
      updateSessionInvites,
      leaveSession,
      deleteSession,
    }),
    [
      setActiveSessionId,
      createSession,
      createInstantSession,
      respondToInstantSession,
      updateSessionInvites,
      leaveSession,
      deleteSession,
    ]
  );
}
