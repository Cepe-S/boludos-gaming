import React, { useCallback, useMemo } from 'react';
import {
  AttendanceVote,
  GamingGroup,
  GamingSession,
  PlayerProfile,
  SanctionRecord,
} from '../../types/domain';
import {
  calculateTitleForPlayer,
  evaluateCheckInStatus,
  formatMinutesToTime,
  parseTimeMinutes,
} from '../../lib/matchmakingEngine';
import {
  buildCheckinUpdateLog,
  buildLatePingLog,
  buildSanctionIssuedLog,
} from '../../lib/discordService';
import {
  dbInsertSanction,
  dbUpsertAttendanceVote,
  dbUpsertParticipant,
} from '../../lib/supabaseSync';
import {
  DispatchDiscordPipeline,
  TriggerNotificationPipeline,
} from './useNotificationsAndDiscord';

export interface UseAttendanceTribunalActionsParams {
  currentUserId: string;
  currentUser: PlayerProfile;
  players: PlayerProfile[];
  sessions: GamingSession[];
  groups: GamingGroup[];
  syncChannel: BroadcastChannel | null;
  setSessions: React.Dispatch<React.SetStateAction<GamingSession[]>>;
  setPlayers: React.Dispatch<React.SetStateAction<PlayerProfile[]>>;
  setSanctions: React.Dispatch<React.SetStateAction<SanctionRecord[]>>;
  dispatchDiscordPipeline: DispatchDiscordPipeline;
  triggerNotificationPipeline: TriggerNotificationPipeline;
}

export function useAttendanceTribunalActions({
  currentUserId,
  currentUser,
  players,
  sessions,
  groups,
  syncChannel,
  setSessions,
  setPlayers,
  setSanctions,
  dispatchDiscordPipeline,
  triggerNotificationPipeline,
}: UseAttendanceTribunalActionsParams) {
  const checkInToSession = useCallback(
    (sessionId: string, simulatedTime?: string, userId?: string) => {
      const targetUserId = userId || currentUserId;
      const targetPlayer = players.find((p) => p.id === targetUserId) || currentUser;
      const sessionSnapshot = sessions.find((s) => s.id === sessionId);
      const snapshotGroup = sessionSnapshot
        ? groups.find((g) => g.id === sessionSnapshot.groupId)
        : undefined;

      const currentTime =
        simulatedTime ||
        formatMinutesToTime(new Date().getHours() * 60 + new Date().getMinutes());

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
            const newOnTime =
              evaluation.status === 'on_time' ? player.onTimeCount + 1 : player.onTimeCount;
            const newLate =
              evaluation.status === 'late' ? player.lateCount + 1 : player.lateCount;
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
      setSessions,
      setPlayers,
      setSanctions,
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
      setSanctions,
      setPlayers,
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
    [currentUserId, syncChannel, issueDirectSanction, setSessions]
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

  return useMemo(
    () => ({
      checkInToSession,
      issueDirectSanction,
      castAttendanceVote,
      pingLatePlayer,
    }),
    [checkInToSession, issueDirectSanction, castAttendanceVote, pingLatePlayer]
  );
}
