import React, { useCallback, useMemo } from 'react';
import {
  ChatMessage,
  DiscordIntegrationConfig,
  GamingGroup,
  GamingSession,
  PlayerProfile,
} from '../../types/domain';
import { buildChatBroadcastLog } from '../../lib/discordService';
import { playNotificationSound } from '../../lib/pushService';
import { dbInsertChatMessage, dbUpdateChatReactions } from '../../lib/supabaseSync';
import {
  DispatchDiscordPipeline,
  TriggerNotificationPipeline,
} from './useNotificationsAndDiscord';

export interface UseChatActionsParams {
  currentUserId: string;
  currentUser: PlayerProfile;
  discordConfig: DiscordIntegrationConfig;
  sessions: GamingSession[];
  groups: GamingGroup[];
  resolvedActiveGroupId: string | null;
  players: PlayerProfile[];
  syncChannel: BroadcastChannel | null;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  dispatchDiscordPipeline: DispatchDiscordPipeline;
  triggerNotificationPipeline: TriggerNotificationPipeline;
}

export function useChatActions({
  currentUserId,
  currentUser,
  discordConfig,
  sessions,
  groups,
  resolvedActiveGroupId,
  players,
  syncChannel,
  setChatMessages,
  dispatchDiscordPipeline,
  triggerNotificationPipeline,
}: UseChatActionsParams) {
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
        mentions:
          params.content.includes('@todos') || params.content.includes('@everyone')
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
      setChatMessages,
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
    [currentUserId, syncChannel, setChatMessages]
  );

  return useMemo(
    () => ({
      sendChatMessage,
      toggleMessageReaction,
    }),
    [sendChatMessage, toggleMessageReaction]
  );
}
