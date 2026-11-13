import {
  AttendanceVote,
  CategoryPreferenceLevel,
  ChatMessage,
  DailyScheduleOverride,
  DiscordEventType,
  DiscordIntegrationConfig,
  DiscordNotificationLog,
  Game,
  GameRating,
  GamingSession,
  PlayerProfile,
  PrecisionMinutes,
  PushNotificationAlert,
  SanctionRecord,
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
  switchActivePlayer: (userId: string) => void;
  loginAsProfile: (userId: string) => void;
  createAndLoginProfile: (params: {
    displayName: string;
    discordUsername: string;
    discordId?: string;
    avatarUrl?: string;
  }) => PlayerProfile;
  logout: () => void;
  loginWithDiscord: () => Promise<void>;
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
  updateGamePreference: (gameId: string, plays: boolean, rating: GameRating) => void;
  addGame: (game: Omit<Game, 'id' | 'addedBy'>) => Game;

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
  }) => GamingSession;
  joinOrUpdateSessionSchedule: (
    sessionId: string,
    params: {
      availableFrom: string;
      availableUntil: string;
      precisionMinutes: PrecisionMinutes;
      note?: string;
      userId?: string;
    }
  ) => void;
  leaveSession: (sessionId: string, userId?: string) => void;
  spinSessionRoulette: (sessionId: string) => Game | null;
  lockSessionGame: (sessionId: string, gameId: string) => void;

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
