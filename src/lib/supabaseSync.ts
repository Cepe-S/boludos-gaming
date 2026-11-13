import {
  AttendanceVote,
  CategoryPreferenceLevel,
  ChatMessage,
  DailyScheduleOverride,
  DiscordIntegrationConfig,
  Game,
  GameRating,
  GamingSession,
  ParticipantConfirmationStatus,
  PlayerProfile,
  PrecisionMinutes,
  SanctionRecord,
  SessionCalloutRecord,
  SessionParticipant,
  UserGamePreference,
  WeeklySchedule,
} from '../types/domain';
import { supabase } from './supabaseClient';

export interface SupabaseHydratedState {
  players: PlayerProfile[];
  games: Game[];
  preferences: UserGamePreference[];
  sessions: GamingSession[];
  sanctions: SanctionRecord[];
  chatMessages: ChatMessage[];
  discordConfig: DiscordIntegrationConfig | null;
}

function mapProfileRow(row: Record<string, unknown>): PlayerProfile {
  return {
    id: String(row.id),
    discordId: String(row.discord_id || ''),
    discordUsername: String(row.discord_username || ''),
    displayName: String(row.display_name || 'Jugador'),
    avatarUrl: String(
      row.avatar_url ||
        'https://api.dicebear.com/9.x/adventurer/svg?seed=Gamer&backgroundColor=4f46e5'
    ),
    karmaScore: Number(row.karma_score ?? 80),
    sessionsPlayed: Number(row.sessions_played ?? 0),
    hoursPlayed: Number(row.hours_played ?? 0),
    onTimeCount: Number(row.on_time_count ?? 0),
    lateCount: Number(row.late_count ?? 0),
    noShowCount: Number(row.no_show_count ?? 0),
    currentStreak: Number(row.current_streak ?? 0),
    activeTitle: String(row.active_title || 'Puntual en Práctica'),
    isOnline: true,
    pushEnabled: Boolean(row.push_subscription),
    onboardingCompleted: Boolean(row.onboarding_completed),
    weeklySchedule: (row.weekly_schedule as WeeklySchedule) || undefined,
    dailyOverrides: (row.daily_overrides as Record<string, DailyScheduleOverride>) || {},
    categoryPreferences: (row.category_preferences as Record<string, CategoryPreferenceLevel>) || {},
  };
}

function mapGameRow(row: Record<string, unknown>): Game {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description || ''),
    coverUrl: String(row.cover_url),
    minPlayers: Number(row.min_players ?? 1),
    maxPlayers: Number(row.max_players ?? 5),
    category: String(row.category || 'Otro'),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    averageDurationMins: Number(row.average_duration_mins ?? 60),
    addedBy: String(row.added_by || 'system'),
  };
}

function mapPreferenceRow(row: Record<string, unknown>): UserGamePreference {
  const rawRating = Number(row.rating ?? 3);
  const clampedRating = Math.min(5, Math.max(1, rawRating)) as GameRating;
  return {
    userId: String(row.user_id),
    gameId: String(row.game_id),
    plays: Boolean(row.plays),
    rating: clampedRating,
  };
}

function mapParticipantRow(row: Record<string, unknown>): SessionParticipant {
  const precisionRaw = Number(row.precision_minutes ?? 15);
  const precisionMinutes = ([5, 15, 30, 60].includes(precisionRaw)
    ? precisionRaw
    : 15) as PrecisionMinutes;
  const isAutoEnrolled = Boolean(row.is_auto_enrolled);
  const confirmationStatus =
    (row.confirmation_status as ParticipantConfirmationStatus) ||
    (isAutoEnrolled ? 'probable' : 'confirmed');
  const rawConf = Number(
    row.confidence_percentage ?? (confirmationStatus === 'confirmed' ? 100 : 75)
  );
  const confidencePercentage =
    confirmationStatus === 'confirmed'
      ? 100
      : Math.min(95, Math.max(10, isNaN(rawConf) ? 75 : rawConf));

  return {
    userId: String(row.user_id),
    joinedAt: String(row.joined_at || new Date().toISOString()),
    availableFrom: String(row.available_from || '22:00'),
    availableUntil: String(row.available_until || '01:30'),
    precisionMinutes,
    checkedInAt: row.checked_in_at ? String(row.checked_in_at) : undefined,
    attendanceStatus: (row.attendance_status as SessionParticipant['attendanceStatus']) || 'pending',
    note: row.note ? String(row.note) : undefined,
    isAutoEnrolled,
    confidencePercentage,
    confirmationStatus,
  };
}

function mapVoteRow(row: Record<string, unknown>): AttendanceVote {
  return {
    voterId: String(row.voter_id),
    targetUserId: String(row.target_user_id),
    vote: row.vote as AttendanceVote['vote'],
    reason: row.reason ? String(row.reason) : undefined,
    timestamp: String(row.created_at || new Date().toISOString()),
  };
}

function mapSanctionRow(row: Record<string, unknown>): SanctionRecord {
  const precisionRaw = Number(row.precision_minutes ?? 15);
  const precisionMinutes = ([5, 15, 30, 60].includes(precisionRaw)
    ? precisionRaw
    : 15) as PrecisionMinutes;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    sessionId: String(row.session_id),
    sessionTitle: String(row.session_title),
    date: String(row.created_at || new Date().toISOString()).split('T')[0],
    type: row.type as SanctionRecord['type'],
    promisedTime: String(row.promised_time || '22:00'),
    precisionMinutes,
    actualTime: row.actual_time ? String(row.actual_time) : undefined,
    karmaDelta: Number(row.karma_delta ?? 0),
    description: String(row.description || ''),
  };
}

function mapChatRow(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    content: String(row.content),
    mentions: Array.isArray(row.mentions) ? row.mentions.map(String) : [],
    replyToId: row.reply_to_id ? String(row.reply_to_id) : undefined,
    linkedSessionId: row.linked_session_id ? String(row.linked_session_id) : undefined,
    reactions: Array.isArray(row.reactions) ? (row.reactions as ChatMessage['reactions']) : [],
    forwardedToDiscord: Boolean(row.forwarded_to_discord),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function fetchAllSupabaseData(): Promise<SupabaseHydratedState | null> {
  if (!supabase) return null;

  const [
    profilesRes,
    gamesRes,
    prefsRes,
    sessionsRes,
    participantsRes,
    votesRes,
    sanctionsRes,
    chatRes,
    discordRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('karma_score', { ascending: false }),
    supabase.from('games').select('*').order('name', { ascending: true }),
    supabase.from('user_game_preferences').select('*'),
    supabase.from('sessions').select('*').order('created_at', { ascending: false }),
    supabase.from('session_participants').select('*'),
    supabase.from('attendance_votes').select('*'),
    supabase.from('sanctions').select('*').order('created_at', { ascending: false }),
    supabase.from('chat_messages').select('*').order('created_at', { ascending: true }).limit(100),
    supabase.from('discord_config').select('*').eq('id', 'default').maybeSingle(),
  ]);

  if (profilesRes.error || gamesRes.error || sessionsRes.error) {
    console.warn('Supabase fetch error:', {
      profiles: profilesRes.error,
      games: gamesRes.error,
      sessions: sessionsRes.error,
    });
    return null;
  }

  const participantsBySession = new Map<string, SessionParticipant[]>();
  for (const row of participantsRes.data || []) {
    const sid = String(row.session_id);
    const list = participantsBySession.get(sid) || [];
    list.push(mapParticipantRow(row));
    participantsBySession.set(sid, list);
  }

  const votesBySession = new Map<string, AttendanceVote[]>();
  for (const row of votesRes.data || []) {
    const sid = String(row.session_id);
    const list = votesBySession.get(sid) || [];
    list.push(mapVoteRow(row));
    votesBySession.set(sid, list);
  }

  const sessions: GamingSession[] = (sessionsRes.data || []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    date: String(row.scheduled_date),
    mode: row.mode as GamingSession['mode'],
    selectedGameId: row.selected_game_id ? String(row.selected_game_id) : undefined,
    rouletteWinnerGameId: row.roulette_winner_game_id
      ? String(row.roulette_winner_game_id)
      : undefined,
    status: row.status as GamingSession['status'],
    createdBy: String(row.created_by || 'player-santi'),
    createdAt: String(row.created_at || new Date().toISOString()),
    allowSplitLobbies: Boolean(row.allow_split_lobbies),
    discordMessageId: row.discord_message_id ? String(row.discord_message_id) : undefined,
    invitedUserIds: Array.isArray(row.invited_user_ids)
      ? row.invited_user_ids.map(String)
      : undefined,
    callouts: Array.isArray(row.callouts)
      ? (row.callouts as SessionCalloutRecord[])
      : [],
    participants: participantsBySession.get(String(row.id)) || [],
    attendanceVotes: votesBySession.get(String(row.id)) || [],
  }));

  let discordConfig: DiscordIntegrationConfig | null = null;
  if (discordRes.data) {
    const dc = discordRes.data;
    discordConfig = {
      enabled: Boolean(dc.enabled),
      webhookUrl: String(dc.webhook_url || ''),
      channelName: String(dc.channel_name || 'vicio-general'),
      guildName: String(dc.guild_name || 'Boludos Gaming Server'),
      mentionRoleId: String(dc.mention_role_id || ''),
      useEveryoneMention: Boolean(dc.use_everyone_mention),
      events: (dc.events as DiscordIntegrationConfig['events']) || {
        session_created: true,
        player_joined: true,
        roulette_winner: true,
        late_ping: true,
        sanction_issued: true,
        chat_broadcast: true,
        checkin_update: true,
        session_callout: true,
      },
    };
  }

  return {
    players: (profilesRes.data || []).map(mapProfileRow),
    games: (gamesRes.data || []).map(mapGameRow),
    preferences: (prefsRes.data || []).map(mapPreferenceRow),
    sessions,
    sanctions: (sanctionsRes.data || []).map(mapSanctionRow),
    chatMessages: (chatRes.data || []).map(mapChatRow),
    discordConfig,
  };
}

export async function dbUpsertPreference(pref: UserGamePreference) {
  if (!supabase) return;
  await supabase.from('user_game_preferences').upsert(
    {
      user_id: pref.userId,
      game_id: pref.gameId,
      plays: pref.plays,
      rating: pref.rating,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,game_id' }
  );
}

export async function dbUpsertProfile(player: PlayerProfile): Promise<void> {
  if (!supabase) return;
  await supabase.from('profiles').upsert(
    {
      id: player.id,
      discord_id: player.discordId,
      discord_username: player.discordUsername,
      display_name: player.displayName,
      avatar_url: player.avatarUrl,
      karma_score: player.karmaScore,
      sessions_played: player.sessionsPlayed,
      hours_played: player.hoursPlayed,
      on_time_count: player.onTimeCount,
      late_count: player.lateCount,
      no_show_count: player.noShowCount,
      current_streak: player.currentStreak,
      active_title: player.activeTitle,
      onboarding_completed: Boolean(player.onboardingCompleted),
      weekly_schedule: player.weeklySchedule || null,
      daily_overrides: player.dailyOverrides || {},
      category_preferences: player.categoryPreferences || {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
}

export async function dbInsertGame(game: Game) {
  if (!supabase) return;
  await supabase.from('games').upsert({
    id: game.id,
    name: game.name,
    description: game.description || '',
    cover_url: game.coverUrl,
    min_players: game.minPlayers,
    max_players: game.maxPlayers,
    category: game.category,
    tags: game.tags,
    average_duration_mins: game.averageDurationMins,
    added_by: game.addedBy,
  });
}

export async function dbCreateSession(session: GamingSession) {
  if (!supabase) return;
  await supabase.from('sessions').insert({
    id: session.id,
    title: session.title,
    scheduled_date: session.date,
    mode: session.mode,
    selected_game_id: session.selectedGameId || null,
    roulette_winner_game_id: session.rouletteWinnerGameId || null,
    status: session.status,
    allow_split_lobbies: session.allowSplitLobbies,
    created_by: session.createdBy,
    invited_user_ids:
      session.invitedUserIds && session.invitedUserIds.length > 0
        ? session.invitedUserIds
        : null,
    callouts: session.callouts || [],
  });

  for (const p of session.participants) {
    await dbUpsertParticipant(session.id, p);
  }
}

export async function dbUpsertParticipant(sessionId: string, p: SessionParticipant) {
  if (!supabase) return;
  const isConfirmed = p.confirmationStatus === 'confirmed';
  const confidence = isConfirmed
    ? 100
    : Math.min(95, Math.max(10, p.confidencePercentage ?? 75));

  await supabase.from('session_participants').upsert(
    {
      session_id: sessionId,
      user_id: p.userId,
      available_from: p.availableFrom,
      available_until: p.availableUntil,
      precision_minutes: p.precisionMinutes,
      checked_in_at: p.checkedInAt || null,
      attendance_status: p.attendanceStatus,
      note: p.note || null,
      is_auto_enrolled: Boolean(p.isAutoEnrolled),
      confidence_percentage: confidence,
      confirmation_status: p.confirmationStatus || (p.isAutoEnrolled ? 'probable' : 'confirmed'),
    },
    { onConflict: 'session_id,user_id' }
  );
}

export async function dbUpdateSessionInvitesAndCallouts(
  sessionId: string,
  invitedUserIds?: string[],
  callouts?: SessionCalloutRecord[]
) {
  if (!supabase) return;
  const payload: Record<string, unknown> = {};
  if (invitedUserIds !== undefined) {
    payload.invited_user_ids = invitedUserIds.length > 0 ? invitedUserIds : null;
  }
  if (callouts !== undefined) {
    payload.callouts = callouts;
  }
  if (Object.keys(payload).length > 0) {
    await supabase.from('sessions').update(payload).eq('id', sessionId);
  }
}

export async function dbDeleteParticipant(sessionId: string, userId: string) {
  if (!supabase) return;
  await supabase
    .from('session_participants')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId);
}

export async function dbUpdateSessionGame(
  sessionId: string,
  selectedGameId: string,
  isRouletteWinner: boolean
) {
  if (!supabase) return;
  await supabase
    .from('sessions')
    .update(
      isRouletteWinner
        ? { selected_game_id: selectedGameId, roulette_winner_game_id: selectedGameId }
        : { selected_game_id: selectedGameId }
    )
    .eq('id', sessionId);
}

export async function dbInsertSanction(sanction: SanctionRecord) {
  if (!supabase) return;
  await supabase.from('sanctions').insert({
    id: sanction.id,
    user_id: sanction.userId,
    session_id: sanction.sessionId,
    session_title: sanction.sessionTitle,
    type: sanction.type,
    promised_time: sanction.promisedTime,
    precision_minutes: sanction.precisionMinutes,
    actual_time: sanction.actualTime || null,
    karma_delta: sanction.karmaDelta,
    description: sanction.description,
  });
}

export async function dbUpsertAttendanceVote(sessionId: string, vote: AttendanceVote) {
  if (!supabase) return;
  await supabase.from('attendance_votes').upsert(
    {
      session_id: sessionId,
      voter_id: vote.voterId,
      target_user_id: vote.targetUserId,
      vote: vote.vote,
      reason: vote.reason || null,
    },
    { onConflict: 'session_id,voter_id,target_user_id' }
  );
}

export async function dbInsertChatMessage(msg: ChatMessage) {
  if (!supabase) return;
  await supabase.from('chat_messages').insert({
    id: msg.id,
    user_id: msg.userId,
    content: msg.content,
    mentions: msg.mentions,
    reply_to_id: msg.replyToId || null,
    linked_session_id: msg.linkedSessionId || null,
    reactions: msg.reactions,
    forwarded_to_discord: msg.forwardedToDiscord,
  });
}

export async function dbUpdateChatReactions(messageId: string, reactions: ChatMessage['reactions']) {
  if (!supabase) return;
  await supabase.from('chat_messages').update({ reactions }).eq('id', messageId);
}

export async function dbUpdateDiscordConfig(config: DiscordIntegrationConfig) {
  if (!supabase) return;
  await supabase.from('discord_config').upsert({
    id: 'default',
    enabled: config.enabled,
    webhook_url: config.webhookUrl,
    channel_name: config.channelName,
    guild_name: config.guildName,
    mention_role_id: config.mentionRoleId,
    use_everyone_mention: config.useEveryoneMention,
    events: config.events,
    updated_at: new Date().toISOString(),
  });
}
