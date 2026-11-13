export type PrecisionMinutes = 5 | 15 | 30 | 60;

export type AttendanceStatus = 'pending' | 'on_time' | 'late' | 'no_show';

export type SessionMode = 'fixed' | 'random';

export type SessionStatus = 'open' | 'in_progress' | 'finished';

export type GameRating = 1 | 2 | 3 | 4 | 5;

export type CategoryPreferenceLevel = 'like' | 'neutral' | 'dislike';

export type DayOfWeekKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface GameCategoryInfo {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

export const GAME_CATEGORIES: GameCategoryInfo[] = [
  {
    id: 'Shooter Táctico',
    label: 'Shooter Táctico / FPS',
    emoji: '🎯',
    description: 'Juegos de disparos competitivos por rondas o equipos (CS2, Valorant).',
  },
  {
    id: 'MOBA',
    label: 'MOBA',
    emoji: '⚔️',
    description: 'Batallas estratégicas 5v5 por líneas y objetivos (LoL, Dota 2).',
  },
  {
    id: 'Co-op Horror',
    label: 'Co-op Horror & Risas',
    emoji: '👻',
    description: 'Terror cooperativo caótico con chat de proximidad (Lethal Company, Phasmophobia).',
  },
  {
    id: 'Co-op Acción',
    label: 'Co-op Acción / Supervivencia',
    emoji: '🔥',
    description: 'Misiones cooperativas intensas o aventuras en equipo (Helldivers 2, Peak).',
  },
  {
    id: 'Survival Sandbox',
    label: 'Survival / Mundo Abierto',
    emoji: '🧟',
    description: 'Supervivencia, crafteo, bases y exploración grupal (Project Zomboid, Rust, Minecraft).',
  },
  {
    id: 'RTS',
    label: 'RTS / Estrategia',
    emoji: '🏰',
    description: 'Estrategia en tiempo real, imperios y batallas masivas (Age of Empires II).',
  },
  {
    id: 'Party Casual',
    label: 'Party / Deducción Social',
    emoji: '🎉',
    description: 'Juegos casuales para grupos grandes y risas aseguradas (Among Us, Golf With Your Friends).',
  },
  {
    id: 'Deportes / Autos',
    label: 'Deportes & Racing',
    emoji: '⚽',
    description: 'Fútbol, autos y competencia arcade rápida (Rocket League, EA Sports FC).',
  },
  {
    id: 'RPG / Aventura',
    label: 'RPG / Campaña Co-op',
    emoji: '🐉',
    description: 'Historias largas, rol y campañas cooperativas (Baldur\'s Gate 3).',
  },
];

export const DAYS_OF_WEEK: Array<{ key: DayOfWeekKey; label: string; shortLabel: string; jsDay: number }> = [
  { key: 'mon', label: 'Lunes', shortLabel: 'Lun', jsDay: 1 },
  { key: 'tue', label: 'Martes', shortLabel: 'Mar', jsDay: 2 },
  { key: 'wed', label: 'Miércoles', shortLabel: 'Mié', jsDay: 3 },
  { key: 'thu', label: 'Jueves', shortLabel: 'Jue', jsDay: 4 },
  { key: 'fri', label: 'Viernes', shortLabel: 'Vie', jsDay: 5 },
  { key: 'sat', label: 'Sábado', shortLabel: 'Sáb', jsDay: 6 },
  { key: 'sun', label: 'Domingo', shortLabel: 'Dom', jsDay: 0 },
];

export interface DayScheduleConfig {
  enabled: boolean; // false = Ese día no juega por defecto
  availableFrom: string; // "22:00"
  availableUntil: string; // "01:30"
  precisionMinutes: PrecisionMinutes;
}

export type WeeklySchedule = Record<DayOfWeekKey, DayScheduleConfig>;

export interface DailyScheduleOverride {
  date: string; // "YYYY-MM-DD"
  status: 'playing' | 'not_playing';
  availableFrom?: string;
  availableUntil?: string;
  precisionMinutes?: PrecisionMinutes;
  reason?: string;
  updatedAt: string;
}

export interface EffectiveDailySchedule {
  plays: boolean;
  source: 'override' | 'weekly';
  dayKey: DayOfWeekKey;
  availableFrom: string;
  availableUntil: string;
  precisionMinutes: PrecisionMinutes;
  reason?: string;
}

export interface PlayerProfile {
  id: string;
  discordId: string;
  discordUsername: string;
  displayName: string;
  avatarUrl: string;
  karmaScore: number; // 0 to 100
  sessionsPlayed: number;
  hoursPlayed: number;
  onTimeCount: number;
  lateCount: number;
  noShowCount: number;
  currentStreak: number;
  activeTitle: string;
  isOnline?: boolean;
  pushEnabled?: boolean;
  onboardingCompleted?: boolean;
  weeklySchedule?: WeeklySchedule;
  dailyOverrides?: Record<string, DailyScheduleOverride>; // keyed by YYYY-MM-DD
  categoryPreferences?: Record<string, CategoryPreferenceLevel>; // keyed by category id
}

export interface Game {
  id: string;
  name: string;
  description?: string;
  coverUrl: string;
  minPlayers: number;
  maxPlayers: number;
  category: string;
  tags: string[];
  averageDurationMins: number;
  addedBy: string;
}

export interface UserGamePreference {
  userId: string;
  gameId: string;
  plays: boolean;
  rating: GameRating; // 1 = Solo si obligan, 2 = Zafa, 3 = Me copa, 4 = Juegazo, 5 = Vicio Total
}

export interface AttendanceVote {
  voterId: string;
  targetUserId: string;
  vote: 'on_time' | 'late' | 'no_show';
  reason?: string;
  timestamp: string;
}

export interface SessionParticipant {
  userId: string;
  joinedAt: string;
  availableFrom: string; // "HH:mm" e.g. "22:00"
  availableUntil: string; // "HH:mm" e.g. "01:30"
  precisionMinutes: PrecisionMinutes; // ±5, ±15, ±30, ±60
  checkedInAt?: string; // "HH:mm" or ISO string
  attendanceStatus: AttendanceStatus;
  note?: string;
  isAutoEnrolled?: boolean;
}

export interface GamingSession {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  mode: SessionMode;
  selectedGameId?: string;
  rouletteWinnerGameId?: string;
  status: SessionStatus;
  createdBy: string;
  createdAt: string;
  participants: SessionParticipant[];
  attendanceVotes: AttendanceVote[];
  allowSplitLobbies: boolean;
  discordMessageId?: string;
}

export type LobbyCompatibilityStatus =
  | 'perfect_fit'
  | 'split_required'
  | 'needs_more_players'
  | 'missing_owners';

export interface PlayerGameBreakdown {
  userId: string;
  displayName: string;
  avatarUrl: string;
  plays: boolean;
  rating: GameRating;
  karmaScore: number;
}

export interface SubLobbyAssignment {
  lobbyName: string;
  players: PlayerProfile[];
  isWaitlist?: boolean;
}

export interface GameSynchronyResult {
  game: Game;
  status: LobbyCompatibilityStatus;
  synchronyScore: number; // 0 to 100
  averageRating: number; // 1.0 to 5.0
  rouletteWeight: number;
  playersWhoPlayCount: number;
  totalParticipants: number;
  dislikeCount: number; // count of 1★
  lovedCount: number; // count of 4★ or 5★
  playerBreakdowns: PlayerGameBreakdown[];
  suggestedSubLobbies?: SubLobbyAssignment[];
}

export interface ParticipantScheduleTimeline {
  userId: string;
  displayName: string;
  avatarUrl: string;
  karmaScore: number;
  availableFrom: string;
  availableUntil: string;
  precisionMinutes: PrecisionMinutes;
  startMinutesFromBase: number;
  endMinutesFromBase: number;
  earliestStartMinutes: number;
  strictDeadlineMinutes: number;
  strictDeadlineFormatted: string; // e.g. "22:15"
  earliestStartFormatted: string; // e.g. "21:45"
  attendanceStatus: AttendanceStatus;
  checkedInAt?: string;
}

export interface ScheduleOverlapSummary {
  probableStartFormatted: string;
  guaranteedStartFormatted: string;
  guaranteedEndFormatted: string;
  probableEndFormatted: string;
  overlapDurationMinutes: number;
  guaranteedOverlapMinutes: number;
  hasValidOverlap: boolean;
  participantTimelines: ParticipantScheduleTimeline[];
}

export interface SanctionRecord {
  id: string;
  userId: string;
  sessionId: string;
  sessionTitle: string;
  date: string;
  type: 'late' | 'no_show' | 'on_time_bonus';
  promisedTime: string;
  precisionMinutes: PrecisionMinutes;
  actualTime?: string;
  karmaDelta: number;
  description: string;
}

export interface ChatReaction {
  emoji: string;
  userIds: string[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  content: string;
  mentions: string[]; // userIds or 'everyone'
  replyToId?: string;
  linkedSessionId?: string;
  reactions: ChatReaction[];
  forwardedToDiscord: boolean;
  createdAt: string;
}

export type DiscordEventType =
  | 'session_created'
  | 'player_joined'
  | 'roulette_winner'
  | 'late_ping'
  | 'sanction_issued'
  | 'chat_broadcast'
  | 'checkin_update';

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbedPayload {
  title: string;
  description: string;
  color: number;
  fields: DiscordEmbedField[];
  footer?: { text: string };
  thumbnail?: { url: string };
  timestamp?: string;
}

export interface DiscordButtonAction {
  label: string;
  actionType: 'join_session' | 'checkin_session' | 'spin_roulette' | 'open_app';
  sessionId?: string;
  style: 'primary' | 'success' | 'secondary' | 'danger';
}

export interface DiscordNotificationLog {
  id: string;
  eventType: DiscordEventType;
  content: string; // includes <@discord_id> mentions
  embed: DiscordEmbedPayload;
  buttons: DiscordButtonAction[];
  createdAt: string;
  deliveredToWebhook: boolean;
  webhookError?: string;
}

export interface DiscordIntegrationConfig {
  enabled: boolean;
  webhookUrl: string;
  botToken?: string;
  applicationId?: string;
  publicKey?: string;
  channelName: string;
  guildName: string;
  mentionRoleId: string; // e.g. @BoludosGaming or @here
  useEveryoneMention: boolean;
  events: Record<DiscordEventType, boolean>;
}

export interface PushNotificationAlert {
  id: string;
  title: string;
  body: string;
  tag: string;
  createdAt: string;
  targetUserIds: string[];
  sessionId?: string;
}
