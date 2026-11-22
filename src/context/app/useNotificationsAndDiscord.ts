import React, { useCallback, useMemo } from 'react';
import {
  DiscordEventType,
  DiscordIntegrationConfig,
  DiscordNotificationLog,
  Game,
  GamingGroup,
  PlayerProfile,
  PrecisionMinutes,
  PushNotificationAlert,
} from '../../types/domain';
import { dispatchDiscordWebhook } from '../../lib/discordService';
import {
  playNotificationSound,
  requestBrowserNotificationPermission,
  showNativeNotification,
} from '../../lib/pushService';
import { dbUpdateDiscordConfig } from '../../lib/supabaseSync';

export type TriggerNotificationPipeline = (
  alert: Omit<PushNotificationAlert, 'id' | 'createdAt'>,
  soundType: 'ping' | 'roulette' | 'sanction' | 'message'
) => Promise<void>;

export type DispatchDiscordPipeline = (
  log: DiscordNotificationLog,
  targetGroupId?: string
) => Promise<void>;

export interface UseNotificationsAndDiscordParams {
  groups: GamingGroup[];
  discordConfig: DiscordIntegrationConfig;
  currentUser: PlayerProfile;
  currentUserId: string;
  syncChannel: BroadcastChannel | null;
  setPushAlerts: React.Dispatch<React.SetStateAction<PushNotificationAlert[]>>;
  setDiscordLogs: React.Dispatch<React.SetStateAction<DiscordNotificationLog[]>>;
  setDiscordConfig: React.Dispatch<React.SetStateAction<DiscordIntegrationConfig>>;
  setNotificationPermission: React.Dispatch<
    React.SetStateAction<NotificationPermission | 'unsupported'>
  >;
}

export function useNotificationsAndDiscord({
  groups,
  discordConfig,
  currentUser,
  currentUserId,
  syncChannel,
  setPushAlerts,
  setDiscordLogs,
  setDiscordConfig,
  setNotificationPermission,
}: UseNotificationsAndDiscordParams) {
  // Helper to append a push alert and trigger browser/sound notification
  const triggerNotificationPipeline: TriggerNotificationPipeline = useCallback(
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
    [syncChannel, setPushAlerts]
  );

  // Helper to log and dispatch to Discord Webhook (group-scoped with optional global fallback)
  const dispatchDiscordPipeline: DispatchDiscordPipeline = useCallback(
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
    [groups, discordConfig, syncChannel, setDiscordLogs]
  );

  // Discord Bot & Webhook Settings
  const updateDiscordConfig = useCallback(
    (patch: Partial<DiscordIntegrationConfig>) => {
      setDiscordConfig((prev) => {
        const next = { ...prev, ...patch };
        dbUpdateDiscordConfig(next).catch(console.warn);
        return next;
      });
    },
    [setDiscordConfig]
  );

  const toggleDiscordEvent = useCallback(
    (eventType: DiscordEventType, enabled: boolean) => {
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
    },
    [setDiscordConfig]
  );

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
      buttons: [{ label: 'Abrir App', actionType: 'open_app', style: 'primary' }],
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
      return {
        ok: true,
        message: '¡Mensaje de prueba enviado exitosamente a tu canal de Discord!',
      };
    } else {
      return { ok: false, message: result.error || 'Error desconocido al enviar a Discord' };
    }
  }, [discordConfig, currentUser, setDiscordLogs]);

  // Push Notifications & Permissions
  const requestPushPermission = useCallback(async (): Promise<
    NotificationPermission | 'unsupported'
  > => {
    const result = await requestBrowserNotificationPermission();
    setNotificationPermission(result);
    return result;
  }, [setNotificationPermission]);

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

  return useMemo(
    () => ({
      triggerNotificationPipeline,
      dispatchDiscordPipeline,
      updateDiscordConfig,
      toggleDiscordEvent,
      sendTestDiscordNotification,
      requestPushPermission,
      sendTestPushNotification,
    }),
    [
      triggerNotificationPipeline,
      dispatchDiscordPipeline,
      updateDiscordConfig,
      toggleDiscordEvent,
      sendTestDiscordNotification,
      requestPushPermission,
      sendTestPushNotification,
    ]
  );
}

export interface UseDiscordButtonInteractionParams {
  players: PlayerProfile[];
  currentUser: PlayerProfile;
  joinOrUpdateSessionSchedule: (
    sessionId: string,
    params: {
      availableFrom: string;
      availableUntil: string;
      precisionMinutes: PrecisionMinutes;
      note?: string;
      userId?: string;
      confirmAttendance?: boolean;
    }
  ) => void;
  checkInToSession: (sessionId: string, simulatedTime?: string, userId?: string) => void;
  spinSessionRoulette: (sessionId: string, options?: { onlyLocked?: boolean }) => Game | null;
}

export function useDiscordButtonInteraction({
  players,
  currentUser,
  joinOrUpdateSessionSchedule,
  checkInToSession,
  spinSessionRoulette,
}: UseDiscordButtonInteractionParams) {
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

  return { triggerDiscordButtonInteraction };
}
