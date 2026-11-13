import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DISCORD_EMBED_COLORS,
  buildSessionCreatedLog,
  buildPlayerJoinedLog,
  buildRouletteWinnerLog,
  buildLatePingLog,
  buildSanctionIssuedLog,
  buildChatBroadcastLog,
  buildCheckinUpdateLog,
  dispatchDiscordWebhook,
} from '../discordService';
import {
  ChatMessage,
  Game,
  GamingSession,
  PlayerProfile,
  SanctionRecord,
} from '../../types/domain';

const mockCreator: PlayerProfile = {
  id: 'user-santi',
  discordId: '184920194810294112',
  discordUsername: 'santi_suizo',
  displayName: 'Santi',
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=SantiSuizo',
  karmaScore: 96,
  sessionsPlayed: 32,
  hoursPlayed: 85,
  onTimeCount: 30,
  lateCount: 2,
  noShowCount: 0,
  currentStreak: 12,
  activeTitle: '⌚ Reloj Suizo',
};

const mockTargetPlayer: PlayerProfile = {
  id: 'user-nacho',
  discordId: '471928374619283445',
  discordUsername: 'nacho_15m',
  displayName: 'Nacho',
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=NachoTurtle',
  karmaScore: 62,
  sessionsPlayed: 22,
  hoursPlayed: 50,
  onTimeCount: 11,
  lateCount: 9,
  noShowCount: 2,
  currentStreak: 0,
  activeTitle: '🐢 Rey del ±15m Mentiroso',
};

const mockGhostPlayer: PlayerProfile = {
  id: 'user-gonza',
  discordId: '693820192837461667',
  discordUsername: 'gonza_ghost',
  displayName: 'Gonza',
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=GonzaGhost',
  karmaScore: 28,
  sessionsPlayed: 14,
  hoursPlayed: 26,
  onTimeCount: 3,
  lateCount: 6,
  noShowCount: 5,
  currentStreak: 0,
  activeTitle: '👻 Fantasma Supremo (Sin Prioridad de Cupo)',
};

const mockSession: GamingSession = {
  id: 'sess-101',
  title: 'Viernes de CS2 y Birra',
  date: '2026-11-13',
  mode: 'random',
  status: 'open',
  createdBy: 'user-santi',
  createdAt: '2026-11-13T18:00:00.000Z',
  allowSplitLobbies: true,
  participants: [
    {
      userId: 'user-santi',
      joinedAt: '2026-11-13T18:00:00.000Z',
      availableFrom: '22:00',
      availableUntil: '01:30',
      precisionMinutes: 5,
      attendanceStatus: 'on_time',
      checkedInAt: '22:01',
    },
  ],
  attendanceVotes: [],
};

const mockGame: Game = {
  id: 'game-cs2',
  name: 'Counter-Strike 2',
  coverUrl: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/header.jpg',
  minPlayers: 1,
  maxPlayers: 5,
  category: 'Shooter Táctico',
  tags: ['FPS', 'Competitivo'],
  averageDurationMins: 45,
  addedBy: 'user-santi',
};

describe('Discord Service & Rich Embeds (discordService)', () => {
  describe('DISCORD_EMBED_COLORS', () => {
    it('defines distinct standard gaming theme hex colors for all event types', () => {
      expect(DISCORD_EMBED_COLORS.session_created).toBe(0x6366f1);
      expect(DISCORD_EMBED_COLORS.player_joined).toBe(0x8b5cf6);
      expect(DISCORD_EMBED_COLORS.roulette_winner).toBe(0x10b981);
      expect(DISCORD_EMBED_COLORS.late_ping).toBe(0xf59e0b);
      expect(DISCORD_EMBED_COLORS.sanction_issued).toBe(0xef4444);
      expect(DISCORD_EMBED_COLORS.chat_broadcast).toBe(0x38bdf8);
      expect(DISCORD_EMBED_COLORS.checkin_update_on_time).toBe(0x10b981);
      expect(DISCORD_EMBED_COLORS.checkin_update_late).toBe(0xf59e0b);
    });
  });

  describe('buildSessionCreatedLog', () => {
    it('builds a rich embed notification when a session is created', () => {
      const log = buildSessionCreatedLog(mockSession, mockCreator, '@BoludosGaming');

      expect(log.eventType).toBe('session_created');
      expect(log.deliveredToWebhook).toBe(false);
      expect(log.id).toMatch(/^sess-/);

      // Verify content contains role mention and creator Discord mention <@id>
      expect(log.content).toContain('@BoludosGaming');
      expect(log.content).toContain(`<@${mockCreator.discordId}>`);
      expect(log.content).toContain(mockCreator.displayName);

      // Verify Embed properties
      expect(log.embed.title).toBe(`🎮 Sesión: ${mockSession.title}`);
      expect(log.embed.color).toBe(DISCORD_EMBED_COLORS.session_created);
      expect(log.embed.footer?.text).toContain('Boludos Gaming');
      expect(log.embed.timestamp).toBeDefined();

      // Verify Embed fields
      const fieldNames = log.embed.fields.map((f) => f.name);
      expect(fieldNames).toContain('📅 Fecha');
      expect(fieldNames).toContain('🎲 Modo');
      expect(fieldNames).toContain('🔀 Sub-Lobbies');
      expect(fieldNames).toContain('👑 Creador');
      expect(fieldNames).toContain('👥 Jugadores Actuales');

      const modeField = log.embed.fields.find((f) => f.name === '🎲 Modo');
      expect(modeField?.value).toBe('Ruleta Ponderada');

      const splitField = log.embed.fields.find((f) => f.name === '🔀 Sub-Lobbies');
      expect(splitField?.value).toBe('Permitidos');

      // Verify Action Buttons
      expect(log.buttons).toHaveLength(3);
      expect(log.buttons[0]).toEqual({
        label: 'Unirme ±15m',
        actionType: 'join_session',
        sessionId: mockSession.id,
        style: 'primary',
      });
      expect(log.buttons[1]).toEqual({
        label: 'Check-in',
        actionType: 'checkin_session',
        sessionId: mockSession.id,
        style: 'success',
      });
      expect(log.buttons[2]).toEqual({
        label: 'Girar Ruleta',
        actionType: 'spin_roulette',
        sessionId: mockSession.id,
        style: 'secondary',
      });
    });

    it('defaults mention role to @everyone when not specified', () => {
      const log = buildSessionCreatedLog(mockSession, mockCreator);
      expect(log.content).toContain('@everyone');
    });

    it('correctly sets mode field to "Juego Fijo" when mode is fixed', () => {
      const fixedSession: GamingSession = { ...mockSession, mode: 'fixed', allowSplitLobbies: false };
      const log = buildSessionCreatedLog(fixedSession, mockCreator);

      const modeField = log.embed.fields.find((f) => f.name === '🎲 Modo');
      expect(modeField?.value).toBe('Juego Fijo');

      const splitField = log.embed.fields.find((f) => f.name === '🔀 Sub-Lobbies');
      expect(splitField?.value).toBe('Lobby Único');
    });
  });

  describe('buildPlayerJoinedLog', () => {
    it('builds an embed when a player joins with ±15m precision', () => {
      const sessionWithTwo: GamingSession = {
        ...mockSession,
        participants: [
          ...mockSession.participants,
          {
            userId: mockTargetPlayer.id,
            joinedAt: new Date().toISOString(),
            availableFrom: '22:15',
            availableUntil: '01:00',
            precisionMinutes: 15,
            attendanceStatus: 'pending',
          },
        ],
      };

      const log = buildPlayerJoinedLog(sessionWithTwo, mockTargetPlayer, 15, '22:15');

      expect(log.eventType).toBe('player_joined');
      expect(log.id).toMatch(/^join-/);

      // Mentions user with <@discord_id>
      expect(log.content).toContain(`<@${mockTargetPlayer.discordId}>`);
      expect(log.content).toContain(sessionWithTwo.title);

      // Embed properties
      expect(log.embed.title).toContain(mockTargetPlayer.displayName);
      expect(log.embed.description).toContain('22:15');
      expect(log.embed.description).toContain('±15m');
      expect(log.embed.color).toBe(DISCORD_EMBED_COLORS.player_joined);

      // Fields
      const promisedField = log.embed.fields.find((f) => f.name === '🕒 Horario Prometido');
      expect(promisedField?.value).toBe('22:15 (±15m)');

      const karmaField = log.embed.fields.find((f) => f.name === '⭐ Karma del Jugador');
      expect(karmaField?.value).toContain(`${mockTargetPlayer.karmaScore} pts`);
      expect(karmaField?.value).toContain(mockTargetPlayer.activeTitle);

      const totalField = log.embed.fields.find((f) => f.name === '👥 Total en Sesión');
      expect(totalField?.value).toBe('2 jugadores');

      // Buttons
      expect(log.buttons).toEqual([
        { label: 'Ver Sesión', actionType: 'open_app', sessionId: sessionWithTwo.id, style: 'primary' },
        { label: 'Hacer Check-in', actionType: 'checkin_session', sessionId: sessionWithTwo.id, style: 'success' },
      ]);
    });
  });

  describe('buildRouletteWinnerLog', () => {
    it('builds an embed for the winning game chosen by weighted roulette', () => {
      const log = buildRouletteWinnerLog(mockSession, mockGame, 92, 5);

      expect(log.eventType).toBe('roulette_winner');
      expect(log.id).toMatch(/^roul-/);
      expect(log.content).toContain('¡HABEMUS JUEGO GANADOR!');
      expect(log.content).toContain(mockSession.title);

      expect(log.embed.title).toBe(`🏆 Juego Seleccionado: ${mockGame.name}`);
      expect(log.embed.description).toContain(mockGame.name);
      expect(log.embed.description).toContain('5 jugadores presentes');
      expect(log.embed.color).toBe(DISCORD_EMBED_COLORS.roulette_winner);
      expect(log.embed.thumbnail?.url).toBe(mockGame.coverUrl);

      // Fields
      const synchronyField = log.embed.fields.find((f) => f.name === '⚡ Sincronía Grupal');
      expect(synchronyField?.value).toBe('92%');

      const capacityField = log.embed.fields.find((f) => f.name === '👥 Capacidad');
      expect(capacityField?.value).toBe('1 - 5 jugadores');

      const durationField = log.embed.fields.find((f) => f.name === '⏳ Duración Estimada');
      expect(durationField?.value).toBe('~45 mins');

      // Buttons
      expect(log.buttons[0].actionType).toBe('open_app');
      expect(log.buttons[1].actionType).toBe('checkin_session');
    });

    it('omits thumbnail when coverUrl is empty', () => {
      const noCoverGame: Game = { ...mockGame, coverUrl: '' };
      const log = buildRouletteWinnerLog(mockSession, noCoverGame, 80, 4);
      expect(log.embed.thumbnail).toBeUndefined();
    });
  });

  describe('buildLatePingLog', () => {
    it('builds an intimidation/ping embed mentioning late player <@discord_id>', () => {
      const minutesLate = 18;
      const log = buildLatePingLog(mockSession, mockTargetPlayer, mockCreator, minutesLate);

      expect(log.eventType).toBe('late_ping');
      expect(log.id).toMatch(/^ping-/);

      // Content must ping target with <@discord_id>
      expect(log.content).toContain(`<@${mockTargetPlayer.discordId}>`);
      expect(log.content).toContain(mockSession.title);
      expect(log.content).toContain('¡Aparecé o hay Tribunal!');

      // Description must mention pinger and exact minutes late
      expect(log.embed.title).toContain(mockTargetPlayer.displayName);
      expect(log.embed.description).toContain(`<@${mockCreator.discordId}>`);
      expect(log.embed.description).toContain(`${minutesLate} minutos demorado`);
      expect(log.embed.color).toBe(DISCORD_EMBED_COLORS.late_ping);

      // Fields
      const sessionField = log.embed.fields.find((f) => f.name === '🎯 Sesión');
      expect(sessionField?.value).toBe(mockSession.title);

      const lateField = log.embed.fields.find((f) => f.name === '⚠️ Minutos Pasados');
      expect(lateField?.value).toBe('+18 min');

      const sanctionField = log.embed.fields.find((f) => f.name === '⚖️ Riesgo de Sanción');
      expect(sanctionField?.value).toBe('-10 Karma por Humo');

      // Fast check-in button
      expect(log.buttons).toHaveLength(1);
      expect(log.buttons[0]).toEqual({
        label: '¡Ya Entro! (Check-in)',
        actionType: 'checkin_session',
        sessionId: mockSession.id,
        style: 'danger',
      });
    });
  });

  describe('buildSanctionIssuedLog', () => {
    it('builds an embed for late arrival sanction (Humo Oficial)', () => {
      const lateSanction: SanctionRecord = {
        id: 'sanc-late-01',
        userId: mockTargetPlayer.id,
        sessionId: mockSession.id,
        sessionTitle: mockSession.title,
        date: '2026-11-13',
        type: 'late',
        promisedTime: '22:15',
        precisionMinutes: 15,
        actualTime: '22:45',
        karmaDelta: -10,
        description: 'Llegó 15m tarde después del margen. Se comió una amonestación.',
      };

      const log = buildSanctionIssuedLog(
        lateSanction,
        mockTargetPlayer,
        52,
        '🐢 Rey del ±15m Mentiroso'
      );

      expect(log.eventType).toBe('sanction_issued');
      expect(log.content).toContain('💨 TRIBUNAL DEL HUMO: HUMO OFICIAL REGISTRADO');
      expect(log.content).toContain(`<@${mockTargetPlayer.discordId}>`);
      expect(log.embed.color).toBe(DISCORD_EMBED_COLORS.sanction_issued);

      const typeField = log.embed.fields.find((f) => f.name === '🚨 Tipo de Infracción');
      expect(typeField?.value).toBe('Llegada Tarde Injustificada');

      const deltaField = log.embed.fields.find((f) => f.name === '📉 Descuento Aplicado');
      expect(deltaField?.value).toBe('-10 Karma');

      const scoreField = log.embed.fields.find((f) => f.name === '⭐ Nuevo Puntaje');
      expect(scoreField?.value).toBe('52/100');

      const titleField = log.embed.fields.find((f) => f.name === '🎖️ Título Actualizado');
      expect(titleField?.value).toBe('🐢 Rey del ±15m Mentiroso');
    });

    it('builds an embed for no_show sanction (Fantasma Confirmado)', () => {
      const ghostSanction: SanctionRecord = {
        id: 'sanc-ghost-01',
        userId: mockGhostPlayer.id,
        sessionId: mockSession.id,
        sessionTitle: mockSession.title,
        date: '2026-11-13',
        type: 'no_show',
        promisedTime: '22:00',
        precisionMinutes: 30,
        karmaDelta: -25,
        description: 'No se conectó en toda la noche ni avisó por WhatsApp.',
      };

      const log = buildSanctionIssuedLog(
        ghostSanction,
        mockGhostPlayer,
        3,
        '👻 Fantasma Supremo (Sin Prioridad de Cupo)'
      );

      expect(log.content).toContain('👻 TRIBUNAL DEL HUMO: FANTASMA CONFIRMADO');
      expect(log.content).toContain(`<@${mockGhostPlayer.discordId}>`);

      const typeField = log.embed.fields.find((f) => f.name === '🚨 Tipo de Infracción');
      expect(typeField?.value).toBe('No-Show / Fantasma Total');

      const deltaField = log.embed.fields.find((f) => f.name === '📉 Descuento Aplicado');
      expect(deltaField?.value).toBe('-25 Karma');
    });
  });

  describe('buildChatBroadcastLog & buildCheckinUpdateLog', () => {
    it('builds chat broadcast embed with linked session when available', () => {
      const chatMsg: ChatMessage = {
        id: 'msg-01',
        userId: mockCreator.id,
        content: '¿Quién para un CS2 rápido?',
        mentions: ['everyone'],
        reactions: [],
        forwardedToDiscord: true,
        createdAt: '2026-11-13T21:00:00Z',
      };

      const log = buildChatBroadcastLog(chatMsg, mockCreator, mockSession);

      expect(log.eventType).toBe('chat_broadcast');
      expect(log.content).toContain(`<@${mockCreator.discordId}>`);
      expect(log.content).toContain(chatMsg.content);
      expect(log.embed.color).toBe(DISCORD_EMBED_COLORS.chat_broadcast);
      expect(log.embed.fields).toHaveLength(1);
      expect(log.embed.fields[0].value).toBe(mockSession.title);
    });

    it('builds check-in update embed with on_time color and positive delta', () => {
      const log = buildCheckinUpdateLog(mockSession, mockCreator, 'on_time', '22:01', 5, 96);

      expect(log.eventType).toBe('checkin_update');
      expect(log.content).toContain('⌚ **Check-in Puntual:**');
      expect(log.content).toContain(`+5 Karma!`);
      expect(log.embed.color).toBe(DISCORD_EMBED_COLORS.checkin_update_on_time);
    });

    it('builds check-in update embed with late color and negative delta', () => {
      const log = buildCheckinUpdateLog(mockSession, mockTargetPlayer, 'late', '22:40', -10, 52);

      expect(log.eventType).toBe('checkin_update');
      expect(log.content).toContain('🐢 **Check-in Tardío:**');
      expect(log.content).toContain(`-10 Karma.`);
      expect(log.embed.color).toBe(DISCORD_EMBED_COLORS.checkin_update_late);
    });
  });

  describe('dispatchDiscordWebhook', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns error when webhook URL is missing or empty', async () => {
      const log = buildSessionCreatedLog(mockSession, mockCreator);
      const res = await dispatchDiscordWebhook('', log);
      expect(res.ok).toBe(false);
      expect(res.error).toBe('No se configuró una URL de Webhook de Discord');
    });

    it('returns error when webhook URL does not begin with http:// or https://', async () => {
      const log = buildSessionCreatedLog(mockSession, mockCreator);
      const res = await dispatchDiscordWebhook('ftp://discord.com/webhook', log);
      expect(res.ok).toBe(false);
      expect(res.error).toBe('La URL del Webhook debe comenzar con https://');
    });

    it('dispatches valid payload via HTTP POST and returns ok on 204 No Content', async () => {
      const log = buildSessionCreatedLog(mockSession, mockCreator);
      let capturedUrl = '';
      let capturedOptions: RequestInit | undefined;

      vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
        capturedUrl = url;
        capturedOptions = options;
        return {
          ok: true,
          status: 204,
        } as unknown as Response;
      }));

      const webhookUrl = 'https://discord.com/api/webhooks/123/token_abc';
      const result = await dispatchDiscordWebhook(webhookUrl, log);

      expect(result.ok).toBe(true);
      expect(result.error).toBeUndefined();
      expect(capturedUrl).toBe(webhookUrl);
      expect(capturedOptions?.method).toBe('POST');

      // Verify payload structure matches Discord Webhook specifications
      const payload = JSON.parse(capturedOptions?.body as string);
      expect(payload.username).toBe('Boludos Gaming Bot 🎮');
      expect(payload.avatar_url).toBeDefined();
      expect(payload.content).toBe(log.content);
      expect(payload.embeds).toHaveLength(1);
      expect(payload.embeds[0].title).toBe(log.embed.title);
      expect(payload.embeds[0].color).toBe(log.embed.color);
    });

    it('returns formatted error when Discord responds with an HTTP error status', async () => {
      const log = buildSessionCreatedLog(mockSession, mockCreator);

      vi.stubGlobal('fetch', vi.fn(async () => {
        return {
          ok: false,
          status: 400,
          text: async () => '{"message": "Invalid Webhook Token", "code": 50027}',
        } as unknown as Response;
      }));

      const result = await dispatchDiscordWebhook('https://discord.com/api/webhooks/123/bad', log);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Discord respondió con estado 400');
      expect(result.error).toContain('Invalid Webhook Token');
    });

    it('handles network or CORS fetch rejection gracefully', async () => {
      const log = buildSessionCreatedLog(mockSession, mockCreator);

      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }));

      const result = await dispatchDiscordWebhook('https://discord.com/api/webhooks/123/network_error', log);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Bloqueado por política de red o CORS del navegador');
    });
  });
});
