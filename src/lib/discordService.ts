import {
  ChatMessage,
  DiscordButtonAction,
  DiscordEventType,
  DiscordIntegrationConfig,
  DiscordNotificationLog,
  Game,
  GamingGroup,
  GamingSession,
  PlayerProfile,
  PrecisionMinutes,
  SanctionRecord,
} from '../types/domain';

export const DISCORD_EMBED_COLORS = {
  session_created: 0x6366f1, // Indigo
  player_joined: 0x8b5cf6, // Purple
  roulette_winner: 0x10b981, // Emerald
  late_ping: 0xf59e0b, // Amber
  sanction_issued: 0xef4444, // Red
  chat_broadcast: 0x38bdf8, // Sky
  checkin_update_on_time: 0x10b981, // Emerald
  checkin_update_late: 0xf59e0b, // Amber
  session_callout: 0xec4899, // Fuchsia/Pink
} as const;

/**
 * Generates a unique ID for a discord notification log.
 */
function generateId(prefix = 'disc'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Formats group or integration role mention strings safely.
 */
function formatRoleMention(mentionRoleId?: string, useEveryoneMention?: boolean): string {
  const parts: string[] = [];
  if (useEveryoneMention) {
    parts.push('@everyone');
  }
  const trimmedRole = mentionRoleId?.trim();
  if (trimmedRole) {
    if (/^\d{15,22}$/.test(trimmedRole)) {
      parts.push(`<@&${trimmedRole}>`);
    } else if (trimmedRole !== '@everyone' || !useEveryoneMention) {
      parts.push(trimmedRole);
    }
  }
  return parts.join(' ').trim();
}

/**
 * Builds a Discord Rich Embed log for `session_created`.
 */
export function buildSessionCreatedLog(
  session: GamingSession,
  creator: PlayerProfile,
  mentionRole = '@everyone',
  group?: GamingGroup
): DiscordNotificationLog {
  const content = `🎮 **¡Nueva Sesión Creada!** ${mentionRole} Organizada por <@${creator.discordId}> (${creator.displayName})`;

  const fields = [
    { name: '📅 Fecha', value: session.date, inline: true },
    { name: '🎲 Modo', value: session.mode === 'random' ? 'Ruleta Ponderada' : 'Juego Fijo', inline: true },
    { name: '🔀 Sub-Lobbies', value: session.allowSplitLobbies ? 'Permitidos' : 'Lobby Único', inline: true },
    { name: '👑 Creador', value: creator.displayName, inline: true },
    { name: '👥 Jugadores Actuales', value: `${session.participants.length} inscriptos`, inline: true },
  ];

  if (group) {
    fields.push({ name: '👥 Grupo', value: group.name, inline: true });
  }

  return {
    id: generateId('sess'),
    eventType: 'session_created',
    ...(group ? { groupId: group.id, groupName: group.name } : {}),
    content,
    embed: {
      title: `🎮 Sesión: ${session.title}`,
      description: `Se abrió una nueva convocatoria de juego. ¡Entrá a la app o usá los botones para sumarte con tu ventana de horario!`,
      color: DISCORD_EMBED_COLORS.session_created,
      fields,
      footer: { text: 'Boludos Gaming • Matchmaking Anti-Humo' },
      timestamp: new Date().toISOString(),
    },
    buttons: [
      { label: 'Unirme ±15m', actionType: 'join_session', sessionId: session.id, style: 'primary' },
      { label: 'Check-in', actionType: 'checkin_session', sessionId: session.id, style: 'success' },
      { label: 'Girar Ruleta', actionType: 'spin_roulette', sessionId: session.id, style: 'secondary' },
    ],
    createdAt: new Date().toISOString(),
    deliveredToWebhook: false,
  };
}

/**
 * Builds a Discord Rich Embed log for `player_joined`.
 */
export function buildPlayerJoinedLog(
  session: GamingSession,
  player: PlayerProfile,
  precisionMinutes: PrecisionMinutes,
  availableFrom: string,
  group?: GamingGroup
): DiscordNotificationLog {
  const content = `🙋‍♂️ **Nuevo Jugador Inscripto:** <@${player.discordId}> se sumó a **${session.title}**`;

  const fields = [
    { name: '🕒 Horario Prometido', value: `${availableFrom} (±${precisionMinutes}m)`, inline: true },
    { name: '⭐ Karma del Jugador', value: `${player.karmaScore} pts (${player.activeTitle})`, inline: true },
    { name: '👥 Total en Sesión', value: `${session.participants.length} jugadores`, inline: true },
  ];

  if (group) {
    fields.push({ name: '👥 Grupo', value: group.name, inline: true });
  }

  return {
    id: generateId('join'),
    eventType: 'player_joined',
    ...(group ? { groupId: group.id, groupName: group.name } : {}),
    content,
    embed: {
      title: `🙋‍♂️ ${player.displayName} se unió a la sesión`,
      description: `Declaró disponibilidad desde las **${availableFrom}** con margen de **±${precisionMinutes}m**.`,
      color: DISCORD_EMBED_COLORS.player_joined,
      fields,
      footer: { text: 'Boludos Gaming • Matchmaking & Presencia' },
      timestamp: new Date().toISOString(),
    },
    buttons: [
      { label: 'Ver Sesión', actionType: 'open_app', sessionId: session.id, style: 'primary' },
      { label: 'Hacer Check-in', actionType: 'checkin_session', sessionId: session.id, style: 'success' },
    ],
    createdAt: new Date().toISOString(),
    deliveredToWebhook: false,
  };
}

/**
 * Builds a Discord Rich Embed log for `roulette_winner`.
 */
export function buildRouletteWinnerLog(
  session: GamingSession,
  winningGame: Game,
  synchronyScore: number,
  participantsCount: number,
  group?: GamingGroup
): DiscordNotificationLog {
  const content = `🎉🎲 **¡HABEMUS JUEGO GANADOR!** La Ruleta Ponderada de Boludos Gaming ha hablado para **${session.title}**`;

  const fields = [
    { name: '🎮 Categoría', value: winningGame.category, inline: true },
    { name: '⚡ Sincronía Grupal', value: `${synchronyScore}%`, inline: true },
    { name: '👥 Capacidad', value: `${winningGame.minPlayers} - ${winningGame.maxPlayers} jugadores`, inline: true },
    { name: '⏳ Duración Estimada', value: `~${winningGame.averageDurationMins} mins`, inline: true },
  ];

  if (group) {
    fields.push({ name: '👥 Grupo', value: group.name, inline: true });
  }

  return {
    id: generateId('roul'),
    eventType: 'roulette_winner',
    ...(group ? { groupId: group.id, groupName: group.name } : {}),
    content,
    embed: {
      title: `🏆 Juego Seleccionado: ${winningGame.name}`,
      description: `El algoritmo ponderado eligió **${winningGame.name}** en base a las preferencias y ratings (1-5★) de los ${participantsCount} jugadores presentes.`,
      color: DISCORD_EMBED_COLORS.roulette_winner,
      thumbnail: winningGame.coverUrl ? { url: winningGame.coverUrl } : undefined,
      fields,
      footer: { text: 'Boludos Gaming • Ruleta Ponderada Imparcial' },
      timestamp: new Date().toISOString(),
    },
    buttons: [
      { label: 'Entrar a Jugar', actionType: 'open_app', sessionId: session.id, style: 'success' },
      { label: 'Check-in Ahora', actionType: 'checkin_session', sessionId: session.id, style: 'primary' },
    ],
    createdAt: new Date().toISOString(),
    deliveredToWebhook: false,
  };
}

/**
 * Builds a Discord Rich Embed log for `late_ping`.
 */
export function buildLatePingLog(
  session: GamingSession,
  targetPlayer: PlayerProfile,
  pinger: PlayerProfile,
  minutesLate: number,
  group?: GamingGroup
): DiscordNotificationLog {
  const content = `🚨⏰ **¡RECLAMO DE PUNTUALIDAD!** <@${targetPlayer.discordId}> te están esperando en Discord para **${session.title}**. ¡Aparecé o hay Tribunal!`;

  const fields = [
    { name: '🎯 Sesión', value: session.title, inline: true },
    { name: '⚠️ Minutos Pasados', value: `+${minutesLate} min`, inline: true },
    { name: '⚖️ Riesgo de Sanción', value: '-10 Karma por Humo', inline: true },
  ];

  if (group) {
    fields.push({ name: '👥 Grupo', value: group.name, inline: true });
  }

  return {
    id: generateId('ping'),
    eventType: 'late_ping',
    ...(group ? { groupId: group.id, groupName: group.name } : {}),
    content,
    embed: {
      title: `⏱️ Intimación de Presencia: ${targetPlayer.displayName}`,
      description: `<@${pinger.discordId}> (${pinger.displayName}) te mandó un ping de reclamo. Estás **${minutesLate} minutos demorado** respecto a tu margen límite de asistencia.`,
      color: DISCORD_EMBED_COLORS.late_ping,
      fields,
      footer: { text: 'Tribunal del Humo • Sistema de Alertas Rápidas' },
      timestamp: new Date().toISOString(),
    },
    buttons: [
      { label: '¡Ya Entro! (Check-in)', actionType: 'checkin_session', sessionId: session.id, style: 'danger' },
    ],
    createdAt: new Date().toISOString(),
    deliveredToWebhook: false,
  };
}

/**
 * Builds a Discord Rich Embed log for `sanction_issued`.
 */
export function buildSanctionIssuedLog(
  sanction: SanctionRecord,
  targetPlayer: PlayerProfile,
  newKarma: number,
  newTitle: string,
  group?: GamingGroup
): DiscordNotificationLog {
  const isFantasma = sanction.type === 'no_show';
  const prefix = isFantasma ? '👻' : '💨';
  const titleText = isFantasma ? 'FANTASMA CONFIRMADO' : 'HUMO OFICIAL REGISTRADO';

  const content = `⚖️🚨 **${prefix} TRIBUNAL DEL HUMO: ${titleText}** para <@${targetPlayer.discordId}> (${targetPlayer.displayName})`;

  const fields = [
    { name: '🚨 Tipo de Infracción', value: isFantasma ? 'No-Show / Fantasma Total' : 'Llegada Tarde Injustificada', inline: true },
    { name: '📉 Descuento Aplicado', value: `${sanction.karmaDelta} Karma`, inline: true },
    { name: '⭐ Nuevo Puntaje', value: `${newKarma}/100`, inline: true },
    { name: '🎖️ Título Actualizado', value: newTitle, inline: true },
  ];

  if (group) {
    fields.push({ name: '👥 Grupo', value: group.name, inline: true });
  }

  return {
    id: generateId('sanc'),
    eventType: 'sanction_issued',
    ...(group ? { groupId: group.id, groupName: group.name } : {}),
    content,
    embed: {
      title: `⚖️ Sentencia Firme: ${targetPlayer.displayName}`,
      description: sanction.description,
      color: DISCORD_EMBED_COLORS.sanction_issued,
      fields,
      footer: { text: 'Tribunal del Humo • La verdad no se mancha' },
      timestamp: new Date().toISOString(),
    },
    buttons: [
      { label: 'Ver Tribunal del Humo', actionType: 'open_app', style: 'danger' },
    ],
    createdAt: new Date().toISOString(),
    deliveredToWebhook: false,
  };
}

/**
 * Builds a Discord Rich Embed log for `chat_broadcast`.
 */
export function buildChatBroadcastLog(
  message: ChatMessage,
  author: PlayerProfile,
  session?: GamingSession,
  group?: GamingGroup
): DiscordNotificationLog {
  const content = `💬 **Mensaje de <@${author.discordId}> en el chat grupal:** "${message.content}"`;

  const fields = session
    ? [{ name: '🎮 Sesión Vinculada', value: session.title, inline: true }]
    : [];

  if (group) {
    fields.push({ name: '👥 Grupo', value: group.name, inline: true });
  }

  return {
    id: generateId('chat'),
    eventType: 'chat_broadcast',
    ...(group ? { groupId: group.id, groupName: group.name } : {}),
    content,
    embed: {
      title: `💬 Chat Boludos Gaming: ${author.displayName}`,
      description: message.content,
      color: DISCORD_EMBED_COLORS.chat_broadcast,
      fields,
      footer: { text: 'Boludos Gaming • Chat en Vivo' },
      timestamp: new Date().toISOString(),
    },
    buttons: [
      { label: 'Abrir Chat', actionType: 'open_app', sessionId: session?.id, style: 'secondary' },
    ],
    createdAt: new Date().toISOString(),
    deliveredToWebhook: false,
  };
}

/**
 * Builds a Discord Rich Embed log for `checkin_update`.
 */
export function buildCheckinUpdateLog(
  session: GamingSession,
  player: PlayerProfile,
  status: 'on_time' | 'late',
  actualTime: string,
  karmaDelta: number,
  newKarma: number,
  group?: GamingGroup
): DiscordNotificationLog {
  const isOnTime = status === 'on_time';
  const prefix = isOnTime ? '⌚' : '🐢';
  const color = isOnTime
    ? DISCORD_EMBED_COLORS.checkin_update_on_time
    : DISCORD_EMBED_COLORS.checkin_update_late;

  const content = isOnTime
    ? `${prefix} **Check-in Puntual:** <@${player.discordId}> (${player.displayName}) se presentó a tiempo a las ${actualTime}. ¡Suma +${karmaDelta} Karma!`
    : `${prefix} **Check-in Tardío:** <@${player.discordId}> (${player.displayName}) llegó demorado a las ${actualTime}. Penalización de ${karmaDelta} Karma.`;

  const fields = [
    { name: '⏰ Hora Registro', value: actualTime, inline: true },
    { name: '📈 Variación Karma', value: `${karmaDelta > 0 ? '+' : ''}${karmaDelta} pts`, inline: true },
    { name: '⭐ Karma Actual', value: `${newKarma}/100`, inline: true },
  ];

  if (group) {
    fields.push({ name: '👥 Grupo', value: group.name, inline: true });
  }

  return {
    id: generateId('chkn'),
    eventType: 'checkin_update',
    ...(group ? { groupId: group.id, groupName: group.name } : {}),
    content,
    embed: {
      title: `${prefix} Check-in de ${player.displayName}: ${isOnTime ? 'Puntual' : 'Demorado'}`,
      description: isOnTime
        ? `¡Felicitaciones! Asistió en el horario acordado y sumó confiabilidad.`
        : `Llegó fuera del margen de tolerancia declarado.`,
      color,
      fields,
      footer: { text: 'Boludos Gaming • Verificación de Presencia' },
      timestamp: new Date().toISOString(),
    },
    buttons: [
      { label: 'Ver Sesión', actionType: 'open_app', sessionId: session.id, style: 'primary' },
    ],
    createdAt: new Date().toISOString(),
    deliveredToWebhook: false,
  };
}

/**
 * Builds a Discord Rich Embed log for `session_callout`.
 * Mentions all probable players so Discord pings them on their devices to confirm 100% attendance.
 */
export function buildSessionCalloutDiscordPayload(
  session: GamingSession,
  caller: PlayerProfile,
  probablePlayers: Array<{ player: PlayerProfile; confidencePercentage: number }>,
  customMessage?: string,
  config?: DiscordIntegrationConfig,
  group?: GamingGroup
): DiscordNotificationLog {
  const mentionsList = probablePlayers
    .map((p) => `<@${p.player.discordId}>`)
    .filter(Boolean);

  const groupMention = group
    ? formatRoleMention(group.discordConfig.mentionRoleId, group.discordConfig.useEveryoneMention)
    : '';

  const mentionText = group
    ? [groupMention, ...mentionsList].filter(Boolean).join(' ') ||
      (config?.useEveryoneMention ? '@everyone' : config?.mentionRoleId || '@everyone')
    : mentionsList.length > 0
    ? mentionsList.join(' ')
    : '@everyone';

  const content = `📣🚨 **¡LLAMADO A SESIÓN!** ${mentionText}\n<@${caller.discordId}> (${caller.displayName}) está convocando a confirmar presencia para **${session.title}**!`;

  const playerLines =
    probablePlayers.length > 0
      ? probablePlayers
          .map(
            (p) =>
              `• **${p.player.displayName}** (<@${p.player.discordId}>) — **${p.confidencePercentage}% probable** según su horario habitual`
          )
          .join('\n')
      : 'No hay jugadores con horario probable pendiente de confirmación.';

  const description = customMessage
    ? `💬 *"${customMessage}"*\n\n**Jugadores convocados por compatibilidad de horario:**\n${playerLines}\n\n👉 *¡Entrá y confirmá tu asistencia al 100% para arrancar puntual!*`
    : `Se activó un llamado de presencia grupal. Según los horarios declarados, los siguientes jugadores tienen alta probabilidad de estar disponibles:\n\n${playerLines}\n\n👉 *¡Entrá y confirmá tu asistencia al 100% para arrancar puntual!*`;

  const fields = [
    { name: '📅 Fecha', value: session.date, inline: true },
    { name: '👑 Invocador', value: caller.displayName, inline: true },
    {
      name: '🎯 Modo',
      value: session.mode === 'random' ? '🎲 Ruleta Ponderada' : '🎯 Juego Fijo',
      inline: true,
    },
    {
      name: '👥 Convocados Probables',
      value: `${probablePlayers.length} jugadores`,
      inline: true,
    },
    {
      name: '✅ Confirmados Actuales',
      value: `${session.participants.filter((p) => p.confirmationStatus === 'confirmed').length} listos`,
      inline: true,
    },
  ];

  if (group) {
    fields.push({ name: '👥 Grupo', value: group.name, inline: true });
  }

  return {
    id: generateId('call'),
    eventType: 'session_callout',
    ...(group ? { groupId: group.id, groupName: group.name } : {}),
    content,
    embed: {
      title: `📣 ¡LLAMADO A SESIÓN! — ${session.title}`,
      description,
      color: DISCORD_EMBED_COLORS.session_callout,
      fields,
      footer: { text: 'Boludos Gaming • Llamado a Sesión & Confirmación Anti-Humo' },
      timestamp: new Date().toISOString(),
    },
    buttons: [
      {
        label: 'Confirmar Asistencia 100% ✅',
        actionType: 'join_session',
        sessionId: session.id,
        style: 'success',
      },
      {
        label: 'Abrir App 🚀',
        actionType: 'open_app',
        sessionId: session.id,
        style: 'primary',
      },
    ],
    createdAt: new Date().toISOString(),
    deliveredToWebhook: false,
  };
}

/**
 * Builds a Discord Rich Embed test log verifying webhook connectivity for a specific GamingGroup.
 */
export function buildGroupWebhookTestLog(
  group: GamingGroup,
  tester: PlayerProfile
): DiscordNotificationLog {
  const mention = formatRoleMention(
    group.discordConfig.mentionRoleId,
    group.discordConfig.useEveryoneMention
  );
  const contentPrefix = mention ? `${mention} ` : '';
  const testerMention = tester.discordId ? `<@${tester.discordId}>` : tester.displayName;

  return {
    id: generateId('grptest'),
    eventType: 'chat_broadcast',
    groupId: group.id,
    groupName: group.name,
    content: `${contentPrefix}✅ **Test de Webhook para ${group.name}** ejecutado por ${testerMention} (${tester.displayName})`,
    embed: {
      title: `✅ Conexión Exitosa: ${group.name}`,
      description: `Este mensaje confirma que el canal de Discord del grupo **${group.name}** está correctamente enlazado con Boludos Gaming.`,
      color: 0x10b981,
      fields: [
        { name: '👥 Grupo', value: group.name, inline: true },
        {
          name: '📺 Canal',
          value: group.discordConfig.channelName || '#general-gaming',
          inline: true,
        },
        {
          name: '🧑‍🤝‍🧑 Integrantes',
          value: `${group.memberIds.length} miembro${group.memberIds.length === 1 ? '' : 's'}`,
          inline: true,
        },
        { name: '🔑 Código de Invitación', value: group.inviteCode, inline: true },
        { name: '👑 Ejecutado por', value: tester.displayName, inline: true },
      ],
      footer: { text: `Boludos Gaming • Webhook del Grupo ${group.name}` },
      timestamp: new Date().toISOString(),
    },
    buttons: [
      { label: 'Abrir Grupo en App', actionType: 'open_app', style: 'primary' },
    ],
    createdAt: new Date().toISOString(),
    deliveredToWebhook: false,
  };
}

/**
 * Sends a real HTTP POST request to the configured Discord Webhook URL.
 * Handles Discord payload structuring, headers, and catches errors gracefully.
 */
export async function dispatchDiscordWebhook(
  webhookUrl: string,
  log: DiscordNotificationLog
): Promise<{ ok: boolean; error?: string }> {
  if (!webhookUrl || !webhookUrl.trim()) {
    return { ok: false, error: 'No se configuró una URL de Webhook de Discord' };
  }

  const trimmedUrl = webhookUrl.trim();
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return { ok: false, error: 'La URL del Webhook debe comenzar con https://' };
  }

  const payload = {
    username: 'Boludos Gaming Bot 🎮',
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=BoludosBot&backgroundColor=6366f1',
    content: log.content,
    embeds: [
      {
        title: log.embed.title,
        description: log.embed.description,
        color: log.embed.color,
        fields: log.embed.fields,
        footer: log.embed.footer,
        thumbnail: log.embed.thumbnail,
        timestamp: log.embed.timestamp || log.createdAt,
      },
    ],
  };

  try {
    const response = await fetch(trimmedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok || response.status === 204) {
      return { ok: true };
    }

    const errorText = await response.text().catch(() => 'Error al leer respuesta');
    return {
      ok: false,
      error: `Discord respondió con estado ${response.status}: ${errorText}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Note: If blocked by browser CORS policy when calling Discord directly, report clearly
    if (message.includes('Failed to fetch') || message.includes('CORS') || message.includes('NetworkError')) {
      return {
        ok: false,
        error: `Bloqueado por política de red o CORS del navegador. (Para envío en servidor, configurar Supabase Edge Function). Detalle: ${message}`,
      };
    }
    return { ok: false, error: message };
  }
}
