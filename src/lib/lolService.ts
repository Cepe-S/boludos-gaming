import {
  LolAccount,
  LolMatchOutcome,
  LolMatchParticipantSummary,
  LolMatchSummary,
  LolMatchTeamSummary,
  LolPerformanceBreakdown,
  LolPerformanceGrade,
  LolPlatform,
  LolRankedEntry,
  LolRegionalCluster,
  RiotMatchV5,
} from '../types/lol';
import { getQueueCategory, getRegionalClusterForPlatform } from './lolPerformanceEngine';
import { supabase, supabaseAnonKey, supabaseUrl } from './supabaseClient';
import {
  fetchWithClientCache,
  invalidateClientCache,
  invalidateClientCachePrefix,
  readClientCache,
} from './clientCache';

const LOCAL_RIOT_KEY_STORAGE = 'bg_lol_riot_api_key_v1';
const LOL_GROUP_FRESH_TTL_MS = 3 * 60 * 1000;
const LOL_GROUP_STALE_TTL_MS = 60 * 60 * 1000;
const LOL_EDGE_STATUS_TTL_MS = 10 * 60 * 1000;
const LOL_EDGE_STATUS_KEY = 'lol:edge-status';

const fullMatchCache = new Map<string, RiotMatchV5>();
const fullMatchInFlight = new Map<string, Promise<RiotMatchV5 | null>>();

export interface GroupLolDataResult {
  accounts: LolAccount[];
  matches: LolMatchSummary[];
  error?: string;
}

export interface RiotEdgeStatusResult {
  ok: boolean;
  hasServerKey: boolean;
  keySource: 'env' | 'db' | null;
  updatedAt: string | null;
  error?: string;
}

function getLolGroupCacheKey(memberIds: string[]): string {
  return `lol:group:${Array.from(new Set(memberIds)).sort().join(',')}`;
}

export function getCachedGroupLolData(
  memberIds: string[]
): { accounts: LolAccount[]; matches: LolMatchSummary[]; isFresh: boolean } | null {
  if (memberIds.length === 0) return null;
  const hit = readClientCache<GroupLolDataResult>(getLolGroupCacheKey(memberIds), {
    ttlMs: LOL_GROUP_FRESH_TTL_MS,
    staleTtlMs: LOL_GROUP_STALE_TTL_MS,
    storage: 'local',
  });
  if (!hit) return null;
  return {
    accounts: hit.data.accounts,
    matches: hit.data.matches,
    isFresh: hit.isFresh,
  };
}

export function invalidateGroupLolCache(): void {
  invalidateClientCachePrefix('lol:group:');
}

export function getCachedRiotEdgeStatus(): RiotEdgeStatusResult | null {
  const hit = readClientCache<RiotEdgeStatusResult>(LOL_EDGE_STATUS_KEY, {
    ttlMs: LOL_EDGE_STATUS_TTL_MS,
    staleTtlMs: LOL_EDGE_STATUS_TTL_MS * 3,
    storage: 'session',
  });
  return hit?.data ?? null;
}

export function getLocalRiotApiKey(): string {
  try {
    return window.localStorage.getItem(LOCAL_RIOT_KEY_STORAGE)?.trim() || '';
  } catch {
    return '';
  }
}

export function setLocalRiotApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (!trimmed) {
      window.localStorage.removeItem(LOCAL_RIOT_KEY_STORAGE);
    } else {
      window.localStorage.setItem(LOCAL_RIOT_KEY_STORAGE, trimmed);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export interface RiotEdgeResponse<T = Record<string, unknown>> {
  ok: boolean;
  code?: string;
  error?: string;
  message?: string;
  hasServerKey?: boolean;
  keySource?: 'env' | 'db' | null;
  updatedAt?: string | null;
  data?: T;
}

async function callRiotEdgeFunction<T = Record<string, unknown>>(
  body: Record<string, unknown>
): Promise<RiotEdgeResponse<T> & Record<string, unknown>> {
  const endpoint = `${supabaseUrl}/functions/v1/riot-lol`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => null)) as
      | (RiotEdgeResponse<T> & Record<string, unknown>)
      | null;

    if (!res.ok || !json?.ok) {
      return {
        ...(json || {}),
        ok: false,
        error:
          json?.error ||
          `Error en el servicio Riot LoL (HTTP ${res.status}).`,
      };
    }

    return json;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `No se pudo conectar con la Edge Function riot-lol: ${message}`,
    };
  }
}

export async function getRiotEdgeStatus(options?: {
  forceRefresh?: boolean;
}): Promise<RiotEdgeStatusResult> {
  return fetchWithClientCache<RiotEdgeStatusResult>(
    LOL_EDGE_STATUS_KEY,
    async () => {
      const res = await callRiotEdgeFunction({ action: 'status' });
      const keySource =
        res.keySource === 'db' || res.keySource === 'env' ? res.keySource : null;
      return {
        ok: Boolean(res.ok),
        hasServerKey: Boolean(res.hasServerKey),
        keySource,
        updatedAt: typeof res.updatedAt === 'string' ? res.updatedAt : null,
        error: res.error,
      };
    },
    {
      ttlMs: LOL_EDGE_STATUS_TTL_MS,
      storage: 'session',
      forceRefresh: options?.forceRefresh,
      shouldCache: (value) => value.ok,
    }
  );
}

export async function saveServerRiotApiKey(riotApiKey: string): Promise<{
  ok: boolean;
  hasServerKey?: boolean;
  updatedAt?: string | null;
  error?: string;
}> {
  const res = await callRiotEdgeFunction({
    action: 'set_server_api_key',
    riotApiKey: riotApiKey.trim(),
  });
  if (res.ok) {
    invalidateClientCache(LOL_EDGE_STATUS_KEY);
  }
  return {
    ok: Boolean(res.ok),
    hasServerKey: Boolean(res.hasServerKey),
    updatedAt: typeof res.updatedAt === 'string' ? res.updatedAt : null,
    error: res.error,
  };
}

function mapAccountRow(row: Record<string, unknown>): LolAccount {
  const platform = String(row.platform || 'la2') as LolPlatform;
  const cluster = (row.regional_cluster
    ? String(row.regional_cluster)
    : getRegionalClusterForPlatform(platform)) as LolRegionalCluster;

  return {
    userId: String(row.user_id),
    puuid: String(row.puuid),
    isPrimary: row.is_primary !== false,
    gameName: String(row.game_name || ''),
    tagLine: String(row.tag_line || ''),
    platform,
    regionalCluster: cluster,
    summonerLevel: Number(row.summoner_level ?? 0),
    profileIconId: Number(row.profile_icon_id ?? 29),
    rankedSolo: (row.ranked_solo as LolRankedEntry | null) ?? null,
    rankedFlex: (row.ranked_flex as LolRankedEntry | null) ?? null,
    ddragonVersion: row.ddragon_version ? String(row.ddragon_version) : null,
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
  };
}

function mapParticipantRow(row: Record<string, unknown>): LolMatchParticipantSummary {
  const breakdown = (row.performance_breakdown &&
  typeof row.performance_breakdown === 'object'
    ? row.performance_breakdown
    : {
        pillars: {
          combat: 50,
          impact: 50,
          economy: 50,
          objectives: 50,
          vision: 50,
          dominance: 50,
        },
        weights: {
          combat: 0.22,
          impact: 0.24,
          economy: 0.2,
          objectives: 0.14,
          vision: 0.1,
          dominance: 0.1,
        },
        role: 'MIDDLE',
        queueCategory: 'other',
        isRemake: false,
        laneDiff: null,
        outcomeAdjustment: 0,
        mechanicsBonus: 0,
        drivers: [],
      }) as LolPerformanceBreakdown;

  const rawPrimaryRune = row.primary_rune_id !== null && row.primary_rune_id !== undefined
    ? Number(row.primary_rune_id)
    : 0;
  const rawPrimaryStyle = row.primary_style_id !== null && row.primary_style_id !== undefined
    ? Number(row.primary_style_id)
    : 0;
  const rawSubStyle = row.sub_style_id !== null && row.sub_style_id !== undefined
    ? Number(row.sub_style_id)
    : 0;

  return {
    matchId: String(row.match_id),
    puuid: String(row.puuid),
    participantId: Number(row.participant_id ?? 0),
    teamId: Number(row.team_id ?? 100),
    riotIdGameName: String(row.riot_id_game_name || ''),
    riotIdTagLine: String(row.riot_id_tag_line || ''),
    summonerName: String(row.summoner_name || ''),
    championId: Number(row.champion_id ?? 0),
    championName: String(row.champion_name || 'Unknown'),
    champLevel: Number(row.champ_level ?? 1),
    teamPosition: String(row.team_position || ''),
    individualPosition: String(row.individual_position || ''),
    win: Boolean(row.win),
    gameEndedInSurrender: Boolean(row.game_ended_in_surrender),
    gameEndedInEarlySurrender: Boolean(row.game_ended_in_early_surrender),
    teamEarlySurrendered: Boolean(row.team_early_surrendered),
    outcome: (row.outcome as LolMatchOutcome) || 'loss',
    enemySurrendered: Boolean(row.enemy_surrendered),
    kills: Number(row.kills ?? 0),
    deaths: Number(row.deaths ?? 0),
    assists: Number(row.assists ?? 0),
    kda: Number(row.kda ?? 0),
    cs: Number(row.cs ?? 0),
    csPerMin: Number(row.cs_per_min ?? 0),
    goldEarned: Number(row.gold_earned ?? 0),
    damageToChampions: Number(row.damage_to_champions ?? 0),
    damageTaken: Number(row.damage_taken ?? 0),
    damageToObjectives: Number(row.damage_to_objectives ?? 0),
    damageToTurrets: Number(row.damage_to_turrets ?? 0),
    visionScore: Number(row.vision_score ?? 0),
    killParticipation: Number(row.kill_participation ?? 0),
    summoner1Id: Number(row.summoner1_id ?? 4),
    summoner2Id: Number(row.summoner2_id ?? 14),
    primaryRuneId: rawPrimaryRune > 0 ? rawPrimaryRune : null,
    primaryStyleId: rawPrimaryStyle > 0 ? rawPrimaryStyle : null,
    subStyleId: rawSubStyle > 0 ? rawSubStyle : null,
    items: Array.isArray(row.items) ? row.items.map(Number) : [0, 0, 0, 0, 0, 0, 0],
    performanceScore: Number(row.performance_score ?? 0),
    performanceGrade: (String(row.performance_grade || 'C') as LolPerformanceGrade),
    performanceBreakdown: breakdown,
    matchRank: Number(row.match_rank ?? 5),
    isMvp: Boolean(row.is_mvp),
    isAce: Boolean(row.is_ace),
    highlights: Array.isArray(row.highlights) ? row.highlights.map(String) : [],
    totalTimeSpentDead: Number(row.total_time_spent_dead ?? 0),
    enemyMissingPings: Number(row.enemy_missing_pings ?? 0),
  };
}

export async function fetchGroupLolData(
  memberIds: string[],
  options?: { forceRefresh?: boolean }
): Promise<GroupLolDataResult> {
  if (!supabase || memberIds.length === 0) {
    return { accounts: [], matches: [] };
  }

  const cacheKey = getLolGroupCacheKey(memberIds);
  return fetchWithClientCache<GroupLolDataResult>(
    cacheKey,
    () => fetchGroupLolDataUncached(memberIds),
    {
      ttlMs: LOL_GROUP_FRESH_TTL_MS,
      storage: 'local',
      forceRefresh: options?.forceRefresh,
      shouldCache: (res) => !res.error,
    }
  );
}

async function fetchGroupLolDataUncached(
  memberIds: string[]
): Promise<GroupLolDataResult> {
  if (!supabase || memberIds.length === 0) {
    return { accounts: [], matches: [] };
  }

  const { data: accountRows, error: accountsError } = await supabase
    .from('lol_accounts')
    .select('*')
    .in('user_id', memberIds)
    .order('created_at', { ascending: true });

  if (accountsError) {
    return {
      accounts: [],
      matches: [],
      error: accountsError.message,
    };
  }

  const accounts = (accountRows || [])
    .map((row) => mapAccountRow(row as Record<string, unknown>))
    .sort((a, b) => Number(b.isPrimary !== false) - Number(a.isPrimary !== false));

  const puuids = Array.from(new Set(accounts.map((a) => a.puuid).filter(Boolean)));
  if (puuids.length === 0) {
    return { accounts, matches: [] };
  }

  const { data: matchRows, error: matchesError } = await supabase
    .from('lol_matches')
    .select(
      'match_id, platform_id, regional_cluster, queue_id, game_mode, game_type, game_version, map_id, game_creation, game_start_timestamp, game_end_timestamp, game_duration, end_of_game_result, participant_puuids, teams, fetched_at'
    )
    .overlaps('participant_puuids', puuids)
    .order('game_creation', { ascending: false })
    .limit(200);

  if (matchesError) {
    return {
      accounts,
      matches: [],
      error: matchesError.message,
    };
  }

  const rawMatches = (matchRows || []) as Array<Record<string, unknown>>;
  if (rawMatches.length === 0) {
    return { accounts, matches: [] };
  }

  const matchIds = rawMatches.map((m) => String(m.match_id));

  const { data: participantRows, error: partError } = await supabase
    .from('lol_match_participants')
    .select(
      'match_id, puuid, participant_id, team_id, riot_id_game_name, riot_id_tag_line, summoner_name, champion_id, champion_name, champ_level, team_position, individual_position, win, game_ended_in_surrender, game_ended_in_early_surrender, team_early_surrendered, outcome, enemy_surrendered, kills, deaths, assists, kda, cs, cs_per_min, gold_earned, damage_to_champions, damage_taken, damage_to_objectives, damage_to_turrets, vision_score, kill_participation, summoner1_id, summoner2_id, primary_rune_id, primary_style_id, sub_style_id, items, performance_score, performance_grade, performance_breakdown, match_rank, is_mvp, is_ace, highlights, total_time_spent_dead:raw_participant->>totalTimeSpentDead, enemy_missing_pings:raw_participant->>enemyMissingPings'
    )
    .in('match_id', matchIds);

  if (partError) {
    return {
      accounts,
      matches: [],
      error: partError.message,
    };
  }

  const participantsByMatch = new Map<string, LolMatchParticipantSummary[]>();
  for (const row of (participantRows || []) as Array<Record<string, unknown>>) {
    const mapped = mapParticipantRow(row);
    const list = participantsByMatch.get(mapped.matchId) || [];
    list.push(mapped);
    participantsByMatch.set(mapped.matchId, list);
  }

  const matches: LolMatchSummary[] = rawMatches.map((row) => {
    const matchId = String(row.match_id);
    const queueId = Number(row.queue_id ?? 0);
    const gameMode = String(row.game_mode || '');
    const participants = (participantsByMatch.get(matchId) || []).sort(
      (a, b) => a.participantId - b.participantId
    );
    const endTs = row.game_end_timestamp !== null && row.game_end_timestamp !== undefined
      ? Number(row.game_end_timestamp)
      : null;

    return {
      matchId,
      platformId: String(row.platform_id || 'LA2'),
      regionalCluster: String(row.regional_cluster || 'americas') as LolRegionalCluster,
      queueId,
      queueCategory: getQueueCategory(queueId, gameMode),
      gameMode,
      gameType: String(row.game_type || ''),
      gameVersion: String(row.game_version || ''),
      mapId: Number(row.map_id ?? 11),
      gameCreation: Number(row.game_creation ?? 0),
      gameStartTimestamp: Number(row.game_start_timestamp ?? 0),
      gameEndTimestamp: endTs,
      gameDuration: Number(row.game_duration ?? 0),
      endOfGameResult: row.end_of_game_result ? String(row.end_of_game_result) : null,
      participantPuuids: Array.isArray(row.participant_puuids)
        ? row.participant_puuids.map(String)
        : [],
      teams: Array.isArray(row.teams) ? (row.teams as LolMatchTeamSummary[]) : [],
      participants,
      fetchedAt: row.fetched_at ? String(row.fetched_at) : undefined,
    };
  });

  return { accounts, matches };
}

export async function fetchFullLolMatch(matchId: string): Promise<RiotMatchV5 | null> {
  const cached = fullMatchCache.get(matchId);
  if (cached) return cached;
  if (!supabase) return null;

  const existingPromise = fullMatchInFlight.get(matchId);
  if (existingPromise) return existingPromise;

  const client = supabase;
  const promise = (async () => {
    const { data, error } = await client
      .from('lol_matches')
      .select('raw_match')
      .eq('match_id', matchId)
      .maybeSingle();

    if (error || !data?.raw_match) {
      return null;
    }

    const rawMatch = data.raw_match as RiotMatchV5;
    fullMatchCache.set(matchId, rawMatch);
    return rawMatch;
  })().finally(() => {
    fullMatchInFlight.delete(matchId);
  });

  fullMatchInFlight.set(matchId, promise);
  return promise;
}

export function prefetchFullLolMatch(matchId: string): void {
  if (!matchId || fullMatchCache.has(matchId) || fullMatchInFlight.has(matchId)) return;
  void fetchFullLolMatch(matchId);
}

export async function linkAndSyncRiotAccount(params: {
  userId: string;
  gameName: string;
  tagLine: string;
  platform: LolPlatform;
  isPrimary?: boolean;
  matchCount?: number;
  riotApiKey?: string;
}): Promise<{
  ok: boolean;
  code?: string;
  error?: string;
  account?: LolAccount;
  fetchedMatches?: number;
  cachedMatches?: number;
}> {
  const apiKey = params.riotApiKey?.trim() || getLocalRiotApiKey() || undefined;
  const res = await callRiotEdgeFunction({
    action: 'link_and_sync',
    userId: params.userId,
    gameName: params.gameName.trim(),
    tagLine: params.tagLine.trim().replace(/^#/, ''),
    platform: params.platform,
    isPrimary: params.isPrimary,
    matchCount: params.matchCount ?? 25,
    riotApiKey: apiKey,
  });

  if (res.ok) invalidateGroupLolCache();

  return {
    ok: res.ok,
    code: res.code,
    error: res.error,
    account: res.account as LolAccount | undefined,
    fetchedMatches:
      typeof res.newlyFetchedCount === 'number'
        ? res.newlyFetchedCount
        : typeof res.fetchedMatches === 'number'
          ? res.fetchedMatches
          : undefined,
    cachedMatches:
      typeof res.cachedCount === 'number'
        ? res.cachedCount
        : typeof res.cachedMatches === 'number'
          ? res.cachedMatches
          : undefined,
  };
}

export async function syncRiotPlayer(params: {
  userId: string;
  matchCount?: number;
  riotApiKey?: string;
}): Promise<{
  ok: boolean;
  code?: string;
  error?: string;
  fetchedMatches?: number;
  cachedMatches?: number;
}> {
  const apiKey = params.riotApiKey?.trim() || getLocalRiotApiKey() || undefined;
  const res = await callRiotEdgeFunction({
    action: 'sync_player',
    userId: params.userId,
    matchCount: params.matchCount ?? 25,
    riotApiKey: apiKey,
  });

  if (res.ok) invalidateGroupLolCache();

  return {
    ok: res.ok,
    code: res.code,
    error: res.error,
    fetchedMatches:
      typeof res.newlyFetchedCount === 'number'
        ? res.newlyFetchedCount
        : typeof res.fetchedMatches === 'number'
          ? res.fetchedMatches
          : undefined,
    cachedMatches:
      typeof res.cachedCount === 'number'
        ? res.cachedCount
        : typeof res.cachedMatches === 'number'
          ? res.cachedMatches
          : undefined,
  };
}

export async function syncRiotGroup(params: {
  userIds: string[];
  matchCount?: number;
  riotApiKey?: string;
}): Promise<{
  ok: boolean;
  code?: string;
  error?: string;
  syncedCount?: number;
  fetchedMatches?: number;
}> {
  const apiKey = params.riotApiKey?.trim() || getLocalRiotApiKey() || undefined;
  const res = await callRiotEdgeFunction({
    action: 'sync_group',
    userIds: params.userIds,
    matchCount: params.matchCount ?? 20,
    riotApiKey: apiKey,
  });

  if (res.ok) invalidateGroupLolCache();

  const results = Array.isArray(res.results)
    ? (res.results as Array<{ ok?: boolean }>)
    : null;
  const computedSyncedCount = results
    ? results.filter((r) => Boolean(r.ok)).length
    : typeof res.syncedCount === 'number'
      ? res.syncedCount
      : undefined;

  return {
    ok: res.ok,
    code: res.code,
    error: res.error,
    syncedCount: computedSyncedCount,
    fetchedMatches:
      typeof res.totalNewlyFetched === 'number'
        ? res.totalNewlyFetched
        : typeof res.fetchedMatches === 'number'
          ? res.fetchedMatches
          : undefined,
  };
}

export async function unlinkRiotAccount(
  userId: string,
  puuid?: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await callRiotEdgeFunction({
    action: 'unlink_account',
    userId,
    puuid,
  });
  if (res.ok) invalidateGroupLolCache();
  return {
    ok: res.ok,
    error: res.error,
  };
}

export async function setPrimaryRiotAccount(
  userId: string,
  puuid: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await callRiotEdgeFunction({
    action: 'set_primary_account',
    userId,
    puuid,
  });
  if (res.ok) invalidateGroupLolCache();
  return {
    ok: res.ok,
    error: res.error,
  };
}
