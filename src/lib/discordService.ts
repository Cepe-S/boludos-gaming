import {
  ChatMessage,
  DiscordButtonAction,
  DiscordEventType,
  DiscordNotificationLog,
  Game,
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
} as const;

/**
 * Generates a unique ID for a discord notification log.
 */
function generateId(prefix = 'disc'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Builds a Discord Rich Embed log for `session_created`.
 */
export function buildSessionCreatedLog(
  session: GamingSession,
  creator: PlayerProfile,
  mentionRole = '@everyone'
): DiscordNotificationLog {
  const content = `🎮 **¡Nueva Sesión Creada!** ${mentionRole} Organizada por <@${creator.discordId}> (${creator.displayName})`;

  return {
    id: generateId('sess'),
    eventType: 'session_created',
    content,
    embed: {
      title: `🎮 Sesión: ${session.title}`,
      description: `Se abrió una nueva convocatoria de juego. ¡Entrá a la app o usá los botones para sumarte con tu ventana de horario!`,
      color: DISCORD_EMBED_COLORS.session_created,
      fields: [
        { name: '📅 Fecha', value: session.date, inline: true },
        { name: '🎲 Modo', value: session.mode === 'random' ? 'Ruleta Ponderada' : 'Juego Fijo', inline: true },
        { name: '🔀 Sub-Lobbies', value: session.allowSplitLobbies ? 'Permitidos' : 'Lobby Único', inline: true },
        { name: '👑 Creador', value: creator.displayName, inline: true },
        { name: '👥 Jugadores Actuales', value: `${session.participants.length} inscriptos`, inline: true },
      ],
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
  availableFrom: string
): DiscordNotificationLog {
  const content = `🙋‍♂️ **Nuevo Jugador Inscripto:** <@${player.discordId}> se sumó a **${session.title}**`;

  return {
    id: generateId('join'),
    eventType: 'player_joined',
    content,
    embed: {
      title: `🙋‍♂️ ${player.displayName} se unió a la sesión`,
      description: `Declaró disponibilidad desde las **${availableFrom}** con margen de **±${precisionMinutes}m**.`,
      color: DISCORD_EMBED_COLORS.player_joined,
      fields: [
        { name: '🕒 Horario Prometido', value: `${availableFrom} (±${precisionMinutes}m)`, inline: true },
        { name: '⭐ Karma del Jugador', value: `${player.karmaScore} pts (${player.activeTitle})`, inline: true },
        { name: '👥 Total en Sesión', value: `${session.participants.length} jugadores`, inline: true },
      ],
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
  participantsCount: number
): DiscordNotificationLog {
  const content = `🎉🎲 **¡HABEMUS JUEGO GANADOR!** La Ruleta Ponderada de Boludos Gaming ha hablado para **${session.title}**`;

  return {
    id: generateId('roul'),
    eventType: 'roulette_winner',
    content,
    embed: {
      title: `🏆 Juego Seleccionado: ${winningGame.name}`,
      description: `El algoritmo ponderado eligió **${winningGame.name}** en base a las preferencias y ratings (1-5★) de los ${participantsCount} jugadores presentes.`,
      color: DISCORD_EMBED_COLORS.roulette_winner,
      thumbnail: winningGame.coverUrl ? { url: winningGame.coverUrl } : undefined,
      fields: [
        { name: '🎮 Categoría', value: winningGame.category, inline: true },
        { name: '⚡ Sincronía Grupal', value: `${synchronyScore}%`, inline: true },
        { name: '👥 Capacidad', value: `${winningGame.minPlayers} - ${winningGame.maxPlayers} jugadores`, inline: true },
        { name: '⏳ Duración Estimada', value: `~${winningGame.averageDurationMins} mins`, inline: true },
      ],
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
  minutesLate: number
): DiscordNotificationLog {
  const content = `🚨⏰ **¡RECLAMO DE PUNTUALIDAD!** <@${targetPlayer.discordId}> te están esperando en Discord para **${session.title}**. ¡Aparecé o hay Tribunal!`;

  return {
    id: generateId('ping'),
    eventType: 'late_ping',
    content,
    embed: {
      title: `⏱️ Intimación de Presencia: ${targetPlayer.displayName}`,
      description: `<@${pinger.discordId}> (${pinger.displayName}) te mandó un ping de reclamo. Estás **${minutesLate} minutos demorado** respecto a tu margen límite de asistencia.`,
      color: DISCORD_EMBED_COLORS.late_ping,
      fields: [
        { name: '🎯 Sesión', value: session.title, inline: true },
        { name: '⚠️ Minutos Pasados', value: `+${minutesLate} min`, inline: true },
        { name: '⚖️ Riesgo de Sanción', value: '-10 Karma por Humo', inline: true },
      ],
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
  newTitle: string
): DiscordNotificationLog {
  const isFantasma = sanction.type === 'no_show';
  const prefix = isFantasma ? '👻' : '💨';
  const titleText = isFantasma ? 'FANTASMA CONFIRMADO' : 'HUMO OFICIAL REGISTRADO';

  const content = `⚖️🚨 **${prefix} TRIBUNAL DEL HUMO: ${titleText}** para <@${targetPlayer.discordId}> (${targetPlayer.displayName})`;

  return {
    id: generateId('sanc'),
    eventType: 'sanction_issued',
    content,
    embed: {
      title: `⚖️ Sentencia Firme: ${targetPlayer.displayName}`,
      description: sanction.description,
      color: DISCORD_EMBED_COLORS.sanction_issued,
      fields: [
        { name: '🚨 Tipo de Infracción', value: isFantasma ? 'No-Show / Fantasma Total' : 'Llegada Tarde Injustificada', inline: true },
        { name: '📉 Descuento Aplicado', value: `${sanction.karmaDelta} Karma`, inline: true },
        { name: '⭐ Nuevo Puntaje', value: `${newKarma}/100`, inline: true },
        { name: '🎖️ Título Actualizado', value: newTitle, inline: true },
      ],
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
  session?: GamingSession
): DiscordNotificationLog {
  const content = `💬 **Mensaje de <@${author.discordId}> en el chat grupal:** "${message.content}"`;

  return {
    id: generateId('chat'),
    eventType: 'chat_broadcast',
    content,
    embed: {
      title: `💬 Chat Boludos Gaming: ${author.displayName}`,
      description: message.content,
      color: DISCORD_EMBED_COLORS.chat_broadcast,
      fields: session
        ? [{ name: '🎮 Sesión Vinculada', value: session.title, inline: true }]
        : [],
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
  newKarma: number
): DiscordNotificationLog {
  const isOnTime = status === 'on_time';
  const prefix = isOnTime ? '⌚' : '🐢';
  const color = isOnTime
    ? DISCORD_EMBED_COLORS.checkin_update_on_time
    : DISCORD_EMBED_COLORS.checkin_update_late;

  const content = isOnTime
    ? `${prefix} **Check-in Puntual:** <@${player.discordId}> (${player.displayName}) se presentó a tiempo a las ${actualTime}. ¡Suma +${karmaDelta} Karma!`
    : `${prefix} **Check-in Tardío:** <@${player.discordId}> (${player.displayName}) llegó demorado a las ${actualTime}. Penalización de ${karmaDelta} Karma.`;

  return {
    id: generateId('chkn'),
    eventType: 'checkin_update',
    content,
    embed: {
      title: `${prefix} Check-in de ${player.displayName}: ${isOnTime ? 'Puntual' : 'Demorado'}`,
      description: isOnTime
        ? `¡Felicitaciones! Asistió en el horario acordado y sumó confiabilidad.`
        : `Llegó fuera del margen de tolerancia declarado.`,
      color,
      fields: [
        { name: '⏰ Hora Registro', value: actualTime, inline: true },
        { name: '📈 Variación Karma', value: `${karmaDelta > 0 ? '+' : ''}${karmaDelta} pts`, inline: true },
        { name: '⭐ Karma Actual', value: `${newKarma}/100`, inline: true },
      ],
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
