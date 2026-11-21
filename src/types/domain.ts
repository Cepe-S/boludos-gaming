export type PrecisionMinutes = 5 | 15 | 30 | 60;

export type AttendanceStatus = 'pending' | 'on_time' | 'late' | 'no_show';

export type SessionMode = 'fixed' | 'random';

export type SessionStatus = 'open' | 'in_progress' | 'finished';

export type GameRating = 1 | 2 | 3 | 4 | 5;

export type CategoryPreferenceLevel = 'like' | 'neutral' | 'dislike';

export type DayOfWeekKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type ParticipantConfirmationStatus = 'probable' | 'confirmed';

export interface TimeSlotBlock {
  id: string;
  from: string; // "HH:mm" e.g. "21:30"
  until: string; // "HH:mm" e.g. "01:00"
  confidencePercentage: number; // 10 to 95 (NEVER 100 in default mode)
  precisionMinutes: PrecisionMinutes;
}

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
  availableFrom: string; // "22:00" (primary/legacy slot start)
  availableUntil: string; // "01:30" (primary/legacy slot end)
  precisionMinutes: PrecisionMinutes;
  confidencePercentage?: number; // 10 to 95 (default 75%)
  slots?: TimeSlotBlock[]; // Multi-slot probabilistic bars per day
}

export type WeeklySchedule = Record<DayOfWeekKey, DayScheduleConfig>;

export interface DailyScheduleOverride {
  date: string; // "YYYY-MM-DD"
  status: 'playing' | 'not_playing';
  availableFrom?: string;
  availableUntil?: string;
  precisionMinutes?: PrecisionMinutes;
  confidencePercentage?: number; // 10 to 95 (unless confirmed on a session)
  slots?: TimeSlotBlock[];
  cancelledSlotIds?: string[]; // Specific weekly slot IDs cancelled for this date
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
  confidencePercentage: number; // < 100 in default mode (e.g. 25, 50, 75, 90)
  slots: TimeSlotBlock[];
  cancelledSlotIds?: string[];
  reason?: string;
}

export interface PlayerProfile {
  id: string;
  discordId: string;
  discordUsername: string;
  displayName: string;
  avatarUrl: string;
  birthDate?: string;
  bio?: string;
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
  steamProfile?: PlayerSteamProfile;
  tasteProfile?: PlayerTasteProfile;
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
  hoursPlayed?: number;
  recentHoursPlayed?: number;
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
  confidencePercentage?: number; // < 100 when auto-enrolled/probable; 100 ONLY when confirmed
  confirmationStatus?: ParticipantConfirmationStatus; // 'probable' | 'confirmed'
}

export interface SessionCalloutRecord {
  id: string;
  triggeredBy: string;
  triggeredAt: string;
  message?: string;
  notifiedUserIds: string[];
}

export interface GroupDiscordConfig {
  enabled: boolean;
  webhookUrl: string;
  channelName: string;
  guildName: string;
  mentionRoleId: string;
  useEveryoneMention: boolean;
}

export type RecommendationVoteValue = 'up' | 'down';

export type GroupRecommendationVotesMap = Record<string, Record<string, RecommendationVoteValue>>;

export interface GamingGroup {
  id: string;
  name: string;
  description: string;
  avatarUrl?: string;
  inviteCode: string;
  createdBy: string;
  memberIds: string[];
  adminIds: string[];
  gameIds: string[];
  discordConfig: GroupDiscordConfig;
  recommendationVotes?: GroupRecommendationVotesMap;
  createdAt: string;
  updatedAt?: string;
}

export type SessionKind = 'scheduled' | 'instant';

export interface InstantSessionRsvp {
  userId: string;
  status: 'going' | 'declined';
  etaMinutes?: number;
  durationMinutes?: number;
  respondedAt: string;
}

export interface GamingSession {
  id: string;
  groupId: string;
  title: string;
  date: string; // YYYY-MM-DD
  sessionKind?: SessionKind;
  instantRsvps?: InstantSessionRsvp[];
  mode: SessionMode;
  selectedGameId?: string;
  selectedGameIds?: string[];
  rouletteWinnerGameId?: string;
  status: SessionStatus;
  createdBy: string;
  createdAt: string;
  participants: SessionParticipant[];
  attendanceVotes: AttendanceVote[];
  allowSplitLobbies: boolean;
  discordMessageId?: string;
  invitedUserIds?: string[]; // undefined or empty = everyone invited; array of userIds = selective invite
  callouts?: SessionCalloutRecord[];
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
  confidencePercentage: number; // <100 when probable, 100 when confirmed
  confirmationStatus: ParticipantConfirmationStatus;
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
  groupId?: string;
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
  groupId?: string;
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
  | 'checkin_update'
  | 'session_callout';

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
  groupId?: string;
  groupName?: string;
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
  steamApiKey?: string;
  igdbClientId?: string;
  igdbClientSecret?: string;
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

export type TasteDimensionKey =
  | 'tactical_shooter'
  | 'arena_hero_shooter'
  | 'battle_royale'
  | 'moba'
  | 'rts_strategy'
  | 'survival_craft'
  | 'coop_horror'
  | 'coop_pve_action'
  | 'rpg_narrative'
  | 'party_social'
  | 'sports_racing'
  | 'roguelike_deckbuilder'
  | 'intensity_high'
  | 'chill_relaxed'
  | 'tactical_depth'
  | 'mechanical_skill'
  | 'short_session'
  | 'long_campaign'
  | 'pvp_competitive'
  | 'pve_cooperative'
  | 'social_deduction_chaos'
  | 'squad_coordination'
  | 'asymmetric_roles'
  | 'sandbox_freedom'
  | 'dark_gritty'
  | 'scifi_futuristic'
  | 'fantasy_medieval'
  | 'realistic_military'
  | 'stylized_colorful'
  | 'horror_tension'
  | 'open_world_exploration'
  | 'progression_loot';

export interface SteamOwnedGame {
  appId: number;
  igdbId?: number;
  name: string;
  playtimeHours: number;
  playtimeRecentHours: number;
  manualHoursOverride?: number;
  manualRecentHoursOverride?: number;
  headerImageUrl: string;
  iconUrl?: string;
  lastPlayedAt?: string;
  genres: string[];
  tags: string[];
  tagVotes?: Record<string, number>;
  isMultiplayer: boolean;
  minPlayers: number;
  maxPlayers: number;
  suggestedRating: GameRating;
  userRating?: GameRating;
  playsOverride?: boolean;
  burnedOut?: boolean;
  selectedForCatalog?: boolean;
  source?: 'igdb' | 'steam' | 'curated';
}

export interface PlayerSteamProfile {
  steamId64: string;
  profileUrl: string;
  personaName: string;
  avatarUrl: string;
  lastSyncedAt: string;
  totalHours: number;
  considerableGamesCount: number;
  ownedGames: SteamOwnedGame[];
}

export interface PodiumGameEntry {
  rank: 1 | 2 | 3;
  gameId: string;
  steamAppId?: number;
  name: string;
  coverUrl: string;
  category: string;
  tags: string[];
  minPlayers: number;
  maxPlayers: number;
  isMultiplayer: boolean;
  source: 'steam' | 'catalog' | 'external';
  hoursPlayed?: number;
  recentHoursPlayed?: number;
}

export type ExternalGamePlatform =
  | 'Steam (Otra cuenta / Verde)'
  | 'Riot Games'
  | 'Epic Games'
  | 'Battle.net'
  | 'EA App'
  | 'Xbox Game Pass'
  | 'Otro Launcher';

export interface ExternalRatedGame {
  gameId: string;
  steamAppId?: number;
  igdbId?: number;
  name: string;
  platform: ExternalGamePlatform;
  coverUrl: string;
  category: string;
  tags: string[];
  tagVotes?: Record<string, number>;
  minPlayers: number;
  maxPlayers: number;
  isMultiplayer: boolean;
  rating: GameRating;
  hoursPlayedEstimate?: number;
  recentHoursPlayed?: number;
  burnedOut?: boolean;
  source?: 'igdb' | 'steam' | 'curated';
}

// ============================================================================
// PVJ-6D: MODELO DE PERFILADO VECTORIAL DE JUGADORES EN 6 DIMENSIONES
// ============================================================================

export type PvjDimensionKey =
  | 'D1_agonia'
  | 'D2_ingenio'
  | 'D3_expresion'
  | 'D4_narrativa'
  | 'D5_acumulacion'
  | 'D6_sinergia';

export type PvjClassificationType = 'PURE' | 'COMPOUND' | 'POLYMATH';

export type PvjVector6D = Record<PvjDimensionKey, number>;

export interface PvjTopInfluencingGame {
  app_id: number;
  name: string;
  hours: number;
  recent_hours?: number;
  specificity_omega: number;
  effective_weight_W: number;
  dominant_dimension: PvjDimensionKey;
  dominant_dimension_label?: string;
  vector_g?: PvjVector6D;
}

export interface PvjPlayerCategorizationResult {
  steam_id: string;
  valid_games_analyzed: number;
  total_hours_analyzed: number;
  pending_hours_games_count?: number;
  vectors: {
    relative_distribution_P: PvjVector6D;
    radar_scores_S: PvjVector6D;
  };
  classification: {
    type: PvjClassificationType;
    primary_dimension: PvjDimensionKey;
    secondary_dimension: PvjDimensionKey | null;
    archetype_name: string;
    confidence_score: number;
    archetype_emoji?: string;
    archetype_description?: string;
  };
  top_influencing_games: PvjTopInfluencingGame[];
}

export interface PlayerTasteProfile {
  topMultiplayerGames: PodiumGameEntry[];
  topSingleplayerGames: PodiumGameEntry[];
  externalGames: ExternalRatedGame[];
  catalogGameHours?: Record<string, { hoursPlayed: number; recentHoursPlayed?: number }>;
  featureVector?: Partial<Record<TasteDimensionKey, number>>;
  topDimensions?: Array<{ key: TasteDimensionKey; label: string; score: number }>;
  pvjProfile?: PvjPlayerCategorizationResult;
  updatedAt: string;
}

export interface PlayerAffinityBreakdown {
  userId: string;
  displayName: string;
  avatarUrl: string;
  affinityScore: number; // 0 to 100
  matchingReasons: string[];
  ownsOrPlays: boolean;
  burnedOut: boolean;
}

export interface GroupGameRecommendation {
  id: string;
  recKey?: string;
  steamAppId?: number;
  igdbId?: number;
  releaseYear?: number;
  isNewRelease?: boolean;
  name: string;
  coverUrl: string;
  category: string;
  description: string;
  tags: string[];
  minPlayers: number;
  maxPlayers: number;
  groupArithmeticScore: number; // Equal-weight arithmetic mean across all target players
  groupConsensusScore?: number;
  approvalCount?: number;
  ownedByCount?: number;
  recommendationType: 'ready_to_play' | 'discovery';
  catalogGameId?: string;
  sharedDimensions: string[];
  explanation: string;
  playerBreakdowns: PlayerAffinityBreakdown[];
}

export type UnifiedSelectorSource =
  | 'steam_owned'
  | 'external_rated'
  | 'catalog'
  | 'igdb_discovery'
  | 'knowledge_base'
  | 'live_search';

export interface UnifiedSelectorGame {
  key: string;
  name: string;
  coverUrl: string;
  category: string;
  tags: string[];
  tagVotes?: Record<string, number>;
  genres: string[];
  minPlayers: number;
  maxPlayers: number;
  isMultiplayer: boolean;
  platform: string;
  source: UnifiedSelectorSource;
  steamAppId?: number;
  igdbId?: number;
  catalogGameId?: string;
  externalGameId?: string;
  ownedOnSteam: boolean;
  playtimeHours: number;
  playtimeRecentHours: number;
  isPlayedOrRatedByUser: boolean;
  effectiveRating: GameRating;
  hasExplicitUserRating: boolean;
  burnedOut: boolean;
  inClubCatalog: boolean;
  tasteAffinityPct: number;
  likelihoodScore: number;
  likelihoodBadge: string;
  needsHoursInput?: boolean;
}
