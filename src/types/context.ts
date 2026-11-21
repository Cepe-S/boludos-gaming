import {
  AttendanceVote,
  CategoryPreferenceLevel,
  ChatMessage,
  DailyScheduleOverride,
  DiscordEventType,
  DiscordIntegrationConfig,
  DiscordNotificationLog,
  ExternalGamePlatform,
  Game,
  GameRating,
  GamingGroup,
  GamingSession,
  GroupDiscordConfig,
  PlayerProfile,
  PlayerSteamProfile,
  PlayerTasteProfile,
  PrecisionMinutes,
  PushNotificationAlert,
  RecommendationVoteValue,
  SanctionRecord,
  UnifiedSelectorGame,
  UserGamePreference,
  WeeklySchedule,
} from './domain';

export interface AppContextValue {
  // Current User, Welcome Screen & Auth
  currentUser: PlayerProfile;
  players: PlayerProfile[];
  isAuthenticated: boolean;
  showOnboardingModal: boolean;
  setShowOnboardingModal: (open: boolean) => void;
  showWeeklyScheduleModal: boolean;
  setShowWeeklyScheduleModal: (open: boolean) => void;
  createAndLoginProfile: (params: {
    displayName: string;
    discordUsername?: string;
    discordId?: string;
    avatarUrl?: string;
  }) => PlayerProfile;
  logout: () => void;
  loginWithDiscord: () => Promise<void>;
  updateUserProfile: (
    patch: Partial<Pick<PlayerProfile, 'displayName' | 'discordUsername' | 'avatarUrl' | 'birthDate' | 'bio'>>,
    userId?: string
  ) => void;
  completeOnboarding: () => void;
  isSupabaseConnected: boolean;

  // Weekly Default Schedule, Daily Overrides & "Hoy No Juego"
  updateWeeklySchedule: (schedule: WeeklySchedule, userId?: string) => void;
  setDailyOverride: (
    date: string,
    override: Omit<DailyScheduleOverride, 'date' | 'updatedAt'> | null,
    userId?: string
  ) => void;
  toggleTodayNotPlaying: (reason?: string, userId?: string) => void;
  updateCategoryPreferences: (
    prefs: Record<string, CategoryPreferenceLevel>,
    userId?: string
  ) => void;

  // Games & Preferences (1-5 stars)
  games: Game[];
  preferences: UserGamePreference[];
  updateGamePreference: (
    gameId: string,
    plays: boolean,
    rating: GameRating,
    hoursPlayed?: number,
    recentHoursPlayed?: number
  ) => void;
  addGame: (game: Omit<Game, 'id' | 'addedBy'>) => Game;

  // Steam Library Import & 32D Taste Profile Engine
  importSteamProfile: (
    steamUrlOrId: string,
    customApiKey?: string,
    userId?: string
  ) => Promise<{ ok: boolean; message: string; profile?: PlayerSteamProfile }>;
  updateSteamGameFeedback: (
    appId: number,
    patch: {
      userRating?: GameRating;
      burnedOut?: boolean;
      selectedForCatalog?: boolean;
      manualHoursOverride?: number;
      manualRecentHoursOverride?: number;
    },
    userId?: string
  ) => void;
  updatePlayerTasteProfile: (patch: Partial<PlayerTasteProfile>, userId?: string) => void;
  syncSteamGamesToCatalog: (appIds: number[], userId?: string) => void;
  setUnifiedGameFeedback: (
    game: UnifiedSelectorGame,
    patch: {
      plays?: boolean;
      rating?: GameRating;
      burnedOut?: boolean;
      platform?: ExternalGamePlatform;
      hoursPlayed?: number;
      recentHoursPlayed?: number;
    },
    userId?: string
  ) => void;
  syncUnifiedGameToCatalog: (game: UnifiedSelectorGame, userId?: string) => Game | null;

  // Gaming Groups & Unified Invites
  groups: GamingGroup[];
  userGroups: GamingGroup[];
  activeGroupId: string | null;
  activeGroup: GamingGroup | null;
  pendingInviteCode: string | null;
  pendingInviteGroup: GamingGroup | null;
  setActiveGroupId: (groupId: string | null) => void;
  createGroup: (params: {
    name: string;
    description?: string;
    avatarUrl?: string;
    memberIds?: string[];
    discordConfig?: Partial<GroupDiscordConfig>;
  }) => GamingGroup;
  updateGroup: (
    groupId: string,
    patch: Partial<Omit<GamingGroup, 'id' | 'createdAt'>>
  ) => void;
  deleteGroup: (groupId: string) => void;
  joinGroupByInviteCode: (
    inviteCode: string,
    userId?: string
  ) => { ok: boolean; group?: GamingGroup; error?: string };
  addMemberToGroup: (groupId: string, userId: string) => void;
  removeMemberFromGroup: (groupId: string, userId: string) => void;
  addGameToGroup: (groupId: string, gameId: string) => void;
  removeGameFromGroup: (groupId: string, gameId: string) => void;
  addAndLinkGameToGroup: (groupId: string, game: Omit<Game, 'id' | 'addedBy'>) => Game;
  testGroupDiscordWebhook: (groupId: string) => Promise<{ ok: boolean; error?: string }>;
  getGroupInviteLink: (inviteCode: string) => string;
  voteGroupRecommendation: (
    groupId: string,
    recKey: string,
    vote: RecommendationVoteValue | null,
    gameName?: string
  ) => void;

  // Sessions & Schedule Precision (±5, ±15, ±30, ±60 min)
  sessions: GamingSession[];
  activeSessionId: string;
  setActiveSessionId: (sessionId: string) => void;
  createSession: (params: {
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
  }) => GamingSession;
  createInstantSession: (params: {
    groupId?: string;
    title?: string;
    startsInMinutes?: number;
  }) => GamingSession;
  deleteSession: (sessionId: string) => void;
  respondToInstantSession: (
    sessionId: string,
    params: {
      status: 'going' | 'declined';
      etaMinutes?: number;
      durationMinutes?: number;
      userId?: string;
    }
  ) => void;
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
  confirmSessionAttendance: (sessionId: string, userId?: string) => void;
  sendSessionCallout: (
    sessionId: string,
    customMessage?: string
  ) => Promise<{ notifiedUsers: PlayerProfile[] }>;
  updateSessionInvites: (sessionId: string, invitedUserIds?: string[]) => void;
  leaveSession: (sessionId: string, userId?: string) => void;
  spinSessionRoulette: (sessionId: string, options?: { onlyLocked?: boolean }) => Game | null;
  lockSessionGame: (sessionId: string, gameId: string) => void;
  selectSessionGame: (sessionId: string, gameId: string) => void;

  // Attendance, Check-in & Tribunal del Humo Sanctions
  sanctions: SanctionRecord[];
  checkInToSession: (sessionId: string, simulatedTime?: string, userId?: string) => void;
  castAttendanceVote: (
    sessionId: string,
    targetUserId: string,
    vote: AttendanceVote['vote'],
    reason?: string
  ) => void;
  issueDirectSanction: (
    sessionId: string,
    targetUserId: string,
    type: 'late' | 'no_show',
    reason: string
  ) => void;
  pingLatePlayer: (sessionId: string, targetUserId: string) => Promise<void>;

  // Global Chat
  chatMessages: ChatMessage[];
  sendChatMessage: (params: {
    content: string;
    replyToId?: string;
    linkedSessionId?: string;
    forwardToDiscord?: boolean;
  }) => void;
  toggleMessageReaction: (messageId: string, emoji: string) => void;

  // Discord Bot & Webhook Integration
  discordConfig: DiscordIntegrationConfig;
  discordLogs: DiscordNotificationLog[];
  updateDiscordConfig: (patch: Partial<DiscordIntegrationConfig>) => void;
  toggleDiscordEvent: (eventType: DiscordEventType, enabled: boolean) => void;
  sendTestDiscordNotification: () => Promise<{ ok: boolean; message: string }>;
  triggerDiscordButtonInteraction: (
    actionType: 'join_session' | 'checkin_session' | 'spin_roulette',
    sessionId: string,
    simulatedDiscordUserId?: string
  ) => void;

  // Mobile & Browser Push Notifications
  pushAlerts: PushNotificationAlert[];
  notificationPermission: NotificationPermission | 'unsupported';
  requestPushPermission: () => Promise<NotificationPermission | 'unsupported'>;
  sendTestPushNotification: () => Promise<void>;

  // Demo Utilities
  resetDemoData: () => void;
}
