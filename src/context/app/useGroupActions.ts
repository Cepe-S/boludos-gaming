import React, { useCallback, useEffect, useMemo } from 'react';
import {
  DiscordNotificationLog,
  GamingGroup,
  GamingSession,
  GroupDiscordConfig,
  PlayerProfile,
  RecommendationVoteValue,
} from '../../types/domain';
import {
  reconcileAutoParticipantsForSession,
  reconcileSessionParticipantsWithSchedules,
} from '../../lib/matchmakingEngine';
import { buildGroupWebhookTestLog, dispatchDiscordWebhook } from '../../lib/discordService';
import {
  dbAddGameToGroup,
  dbAddMemberToGroup,
  dbCastGroupRecommendationVote,
  dbDeleteGroup,
  dbDeleteParticipant,
  dbRemoveGameFromGroup,
  dbRemoveMemberFromGroup,
  dbUpsertGroup,
  dbUpsertParticipant,
} from '../../lib/supabaseSync';
import {
  STORAGE_KEYS,
  extractInviteCodeFromInput,
  generateUniqueInviteCode,
} from './storageAndHelpers';
import { TriggerNotificationPipeline } from './useNotificationsAndDiscord';

export interface UseGroupActionsParams {
  currentUserId: string;
  currentUser: PlayerProfile;
  isAuthenticated: boolean;
  groups: GamingGroup[];
  players: PlayerProfile[];
  pendingInviteCode: string | null;
  syncChannel: BroadcastChannel | null;
  setGroups: React.Dispatch<React.SetStateAction<GamingGroup[]>>;
  setSessions: React.Dispatch<React.SetStateAction<GamingSession[]>>;
  setActiveGroupIdState: React.Dispatch<React.SetStateAction<string | null>>;
  setPendingInviteCode: React.Dispatch<React.SetStateAction<string | null>>;
  setDiscordLogs: React.Dispatch<React.SetStateAction<DiscordNotificationLog[]>>;
  triggerNotificationPipeline: TriggerNotificationPipeline;
}

export function useGroupActions({
  currentUserId,
  currentUser,
  isAuthenticated,
  groups,
  players,
  pendingInviteCode,
  syncChannel,
  setGroups,
  setSessions,
  setActiveGroupIdState,
  setPendingInviteCode,
  setDiscordLogs,
  triggerNotificationPipeline,
}: UseGroupActionsParams) {
  // Reconcile open sessions strictly scoped to their group members
  const reconcileGroupOpenSessions = useCallback(
    (group: GamingGroup, currentPlayers: PlayerProfile[]) => {
      const memberSet = new Set(group.memberIds);
      const groupPlayers = currentPlayers.filter((p) => memberSet.has(p.id));

      setSessions((prevSessions) => {
        const updatedSessions = prevSessions.map((sess) => {
          if (
            sess.groupId !== group.id ||
            sess.status === 'finished' ||
            sess.sessionKind === 'instant'
          ) {
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
    [syncChannel, setSessions]
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
    [groups, syncChannel, setSessions]
  );

  // Gaming Groups & Unified App+Group Invites
  const setActiveGroupId = useCallback(
    (groupId: string | null) => {
      setActiveGroupIdState(groupId);
    },
    [setActiveGroupIdState]
  );

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
    [currentUserId, groups, syncChannel, setGroups, setActiveGroupIdState]
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
    [groups, players, syncChannel, reconcileGroupOpenSessions, setGroups]
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
    [groups, syncChannel, setGroups, setSessions, setActiveGroupIdState]
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
      setGroups,
      setActiveGroupIdState,
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
    [groups, players, syncChannel, reconcileGroupOpenSessions, setGroups]
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
    [groups, players, syncChannel, reconcileGroupOpenSessions, setGroups]
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
    [syncChannel, setGroups]
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
    [syncChannel, setGroups]
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
    [currentUserId, syncChannel, setGroups]
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
    [groups, currentUser, syncChannel, setDiscordLogs]
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
  }, [
    isAuthenticated,
    currentUserId,
    pendingInviteCode,
    groups,
    joinGroupByInviteCode,
    setPendingInviteCode,
  ]);

  const publicActions = useMemo(
    () => ({
      setActiveGroupId,
      getGroupInviteLink,
      createGroup,
      updateGroup,
      deleteGroup,
      joinGroupByInviteCode,
      addMemberToGroup,
      removeMemberFromGroup,
      addGameToGroup,
      removeGameFromGroup,
      voteGroupRecommendation,
      testGroupDiscordWebhook,
    }),
    [
      setActiveGroupId,
      getGroupInviteLink,
      createGroup,
      updateGroup,
      deleteGroup,
      joinGroupByInviteCode,
      addMemberToGroup,
      removeMemberFromGroup,
      addGameToGroup,
      removeGameFromGroup,
      voteGroupRecommendation,
      testGroupDiscordWebhook,
    ]
  );

  return {
    reconcileGroupOpenSessions,
    reconcileSessionsScopedToGroups,
    publicActions,
  };
}
