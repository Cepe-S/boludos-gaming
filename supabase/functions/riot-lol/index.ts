// ==============================================================================
// BOLUDOS GAMING — LEAGUE OF LEGENDS RIOT API EDGE FUNCTION
// ==============================================================================
// Proxies Riot Games API (Account-v1, Summoner-v4, League-v4 by-puuid, Match-v5),
// computes BG-PERF v2 performance scores, caches matches in Supabase, and keeps
// player & group histories synced within Riot API rate limits.
// ==============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  buildMatchSummaryFromRiotMatch,
  getRegionalClusterForPlatform,
  isValidLolPlatform,
  type LolAccount,
  type LolMatchSummary,
  type LolPlatform,
  type LolRankedEntry,
  type LolRegionalCluster,
  type RiotMatchV5,
} from './performanceEngine.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_DDRAGON_VERSION = '15.22.1';
const MATCH_BATCH_SIZE = 4;
const MATCH_BATCH_DELAY_MS = 250;
const MAX_RATE_LIMIT_RETRIES = 2;

// ------------------------------------------------------------------------------
// PAYLOAD & RIOT DTO TYPES
// ------------------------------------------------------------------------------

interface StatusPayload {
  action: 'status';
}

interface LinkAndSyncPayload {
  action: 'link_and_sync';
  userId: string;
  gameName: string;
  tagLine: string;
  platform: string;
  isPrimary?: boolean;
  matchCount?: number;
  queueId?: number;
}

interface SetPrimaryAccountPayload {
  action: 'set_primary_account';
  userId: string;
  puuid: string;
}

interface SyncPlayerPayload {
  action: 'sync_player';
  userId: string;
  matchCount?: number;
  queueId?: number;
}

interface SyncGroupPayload {
  action: 'sync_group';
  userIds: string[];
  matchCount?: number;
  queueId?: number;
}

interface UnlinkAccountPayload {
  action: 'unlink_account';
  userId: string;
  puuid?: string;
}

type RiotLolRequestPayload =
  | StatusPayload
  | LinkAndSyncPayload
  | SetPrimaryAccountPayload
  | SyncPlayerPayload
  | SyncGroupPayload
  | UnlinkAccountPayload;

interface RiotAccountV1Dto {
  puuid: string;
  gameName?: string;
  tagLine?: string;
}

interface RiotSummonerV4Dto {
  id?: string;
  accountId?: string;
  puuid: string;
  profileIconId: number;
  revisionDate?: number;
  summonerLevel: number;
}

interface RiotLeagueEntryV4Dto {
  leagueId?: string;
  puuid?: string;
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak?: boolean;
  veteran?: boolean;
  freshBlood?: boolean;
  inactive?: boolean;
}

interface LolAccountDbRow {
  user_id: string;
  puuid: string;
  is_primary: boolean;
  game_name: string;
  tag_line: string;
  platform: string;
  regional_cluster: string;
  summoner_level: number;
  profile_icon_id: number;
  ranked_solo: LolRankedEntry | null;
  ranked_flex: LolRankedEntry | null;
  ddragon_version: string | null;
  last_synced_at: string | null;
}

class RiotApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'RiotApiError';
    this.status = status;
    this.code = code;
  }
}

// ------------------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------------------

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveRiotApiKey(): string {
  return (Deno.env.get('RIOT_API_KEY') ?? '').trim();
}

function createAdminSupabaseClient(): SupabaseClient {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new RiotApiError(
      500,
      'SUPABASE_CONFIG_ERROR',
      'Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en la Edge Function.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapRiotStatusError(status: number, contextHint: string): RiotApiError {
  if (status === 401 || status === 403) {
    return new RiotApiError(
      status,
      'INVALID_OR_EXPIRED_API_KEY',
      'La Riot API Key es inválida o expiró. Recordá que las Development Keys vencen cada 24 horas.'
    );
  }
  if (status === 404) {
    return new RiotApiError(
      404,
      'RIOT_NOT_FOUND',
      contextHint || 'No se encontró la cuenta o recurso en Riot Games para ese cluster/servidor.'
    );
  }
  if (status === 429) {
    return new RiotApiError(
      429,
      'RATE_LIMIT_EXCEEDED',
      'Riot API alcanzó el límite de peticiones (429). Esperá unos segundos y volvé a intentar.'
    );
  }
  return new RiotApiError(
    status >= 400 && status < 600 ? status : 502,
    'RIOT_API_ERROR',
    `Error al consultar Riot API (HTTP ${status}).`
  );
}

async function riotFetchJson<T>(
  url: string,
  apiKey: string,
  notFoundHint = ''
): Promise<T> {
  let attempt = 0;

  while (true) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Riot-Token': apiKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryHeader = response.headers.get('Retry-After');
      const retrySeconds = retryHeader ? Number(retryHeader) : 2;
      const waitMs =
        (Number.isFinite(retrySeconds) && retrySeconds > 0
          ? Math.min(15, retrySeconds)
          : 2) *
          1000 +
        150;
      attempt += 1;
      await sleep(waitMs);
      continue;
    }

    throw mapRiotStatusError(response.status, notFoundHint);
  }
}

async function fetchLatestDdragonVersion(): Promise<string> {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return DEFAULT_DDRAGON_VERSION;
    const versions = (await res.json()) as unknown;
    if (Array.isArray(versions) && typeof versions[0] === 'string' && versions[0].trim()) {
      return versions[0].trim();
    }
    return DEFAULT_DDRAGON_VERSION;
  } catch {
    return DEFAULT_DDRAGON_VERSION;
  }
}

function parseRankedEntries(entries: RiotLeagueEntryV4Dto[]): {
  rankedSolo: LolRankedEntry | null;
  rankedFlex: LolRankedEntry | null;
} {
  let rankedSolo: LolRankedEntry | null = null;
  let rankedFlex: LolRankedEntry | null = null;

  for (const entry of entries) {
    const normalized: LolRankedEntry = {
      queueType: entry.queueType,
      tier: entry.tier,
      rank: entry.rank,
      leaguePoints: entry.leaguePoints,
      wins: entry.wins,
      losses: entry.losses,
      hotStreak: entry.hotStreak,
      veteran: entry.veteran,
      freshBlood: entry.freshBlood,
    };
    if (entry.queueType === 'RANKED_SOLO_5x5') {
      rankedSolo = normalized;
    } else if (entry.queueType === 'RANKED_FLEX_SR') {
      rankedFlex = normalized;
    }
  }

  return { rankedSolo, rankedFlex };
}

async function fetchMatchIdsForPuuid(params: {
  cluster: LolRegionalCluster;
  puuid: string;
  matchCount: number;
  queueId?: number;
  apiKey: string;
}): Promise<string[]> {
  const { cluster, puuid, matchCount, queueId, apiKey } = params;
  const targetCount = Math.min(200, Math.max(1, Math.floor(matchCount || 20)));
  const collected: string[] = [];
  let start = 0;

  while (collected.length < targetCount) {
    const batchCount = Math.min(100, targetCount - collected.length);
    const query = new URLSearchParams({
      start: String(start),
      count: String(batchCount),
    });
    if (typeof queueId === 'number' && Number.isFinite(queueId) && queueId > 0) {
      query.set('queue', String(Math.floor(queueId)));
    }

    const url = `https://${cluster}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(
      puuid
    )}/ids?${query.toString()}`;
    const pageIds = await riotFetchJson<string[]>(
      url,
      apiKey,
      'No se pudieron obtener partidas para este PUUID en Match-v5.'
    );

    if (!Array.isArray(pageIds) || pageIds.length === 0) {
      break;
    }

    collected.push(...pageIds);
    if (pageIds.length < batchCount) {
      break;
    }
    start += pageIds.length;
  }

  return Array.from(new Set(collected));
}

async function persistMatchesBatch(
  supabase: SupabaseClient,
  summaries: LolMatchSummary[]
): Promise<void> {
  if (summaries.length === 0) return;
  const nowIso = new Date().toISOString();

  const matchRows = summaries.map((m) => ({
    match_id: m.matchId,
    platform_id: m.platformId,
    regional_cluster: m.regionalCluster,
    queue_id: m.queueId,
    game_mode: m.gameMode,
    game_type: m.gameType,
    game_version: m.gameVersion,
    map_id: m.mapId,
    game_creation: m.gameCreation,
    game_start_timestamp: m.gameStartTimestamp,
    game_end_timestamp: m.gameEndTimestamp,
    game_duration: m.gameDuration,
    end_of_game_result: m.endOfGameResult,
    participant_puuids: m.participantPuuids,
    teams: m.teams,
    raw_match: m.rawMatch ?? null,
    fetched_at: nowIso,
  }));

  const { error: matchUpsertError } = await supabase
    .from('lol_matches')
    .upsert(matchRows, { onConflict: 'match_id' });

  if (matchUpsertError) {
    throw new RiotApiError(
      500,
      'DB_MATCH_UPSERT_ERROR',
      `Error guardando partidas en Supabase: ${matchUpsertError.message}`
    );
  }

  const participantRows = summaries.flatMap((m) =>
    m.participants.map((p) => ({
      match_id: p.matchId,
      puuid: p.puuid,
      participant_id: p.participantId,
      team_id: p.teamId,
      riot_id_game_name: p.riotIdGameName,
      riot_id_tag_line: p.riotIdTagLine,
      summoner_name: p.summonerName,
      champion_id: p.championId,
      champion_name: p.championName,
      champ_level: p.champLevel,
      team_position: p.teamPosition,
      individual_position: p.individualPosition,
      win: p.win,
      game_ended_in_surrender: p.gameEndedInSurrender,
      game_ended_in_early_surrender: p.gameEndedInEarlySurrender,
      team_early_surrendered: p.teamEarlySurrendered,
      outcome: p.outcome,
      enemy_surrendered: p.enemySurrendered,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      kda: p.kda,
      cs: p.cs,
      cs_per_min: p.csPerMin,
      gold_earned: p.goldEarned,
      damage_to_champions: p.damageToChampions,
      damage_taken: p.damageTaken,
      damage_to_objectives: p.damageToObjectives,
      damage_to_turrets: p.damageToTurrets,
      vision_score: p.visionScore,
      kill_participation: p.killParticipation,
      summoner1_id: p.summoner1Id,
      summoner2_id: p.summoner2Id,
      primary_rune_id: p.primaryRuneId,
      primary_style_id: p.primaryStyleId,
      sub_style_id: p.subStyleId,
      items: p.items,
      performance_score: p.performanceScore,
      performance_grade: p.performanceGrade,
      performance_breakdown: p.performanceBreakdown,
      match_rank: p.matchRank,
      is_mvp: p.isMvp,
      is_ace: p.isAce,
      highlights: p.highlights,
      raw_participant: p.rawParticipant ?? null,
    }))
  );

  if (participantRows.length > 0) {
    const { error: partUpsertError } = await supabase
      .from('lol_match_participants')
      .upsert(participantRows, { onConflict: 'match_id,puuid' });

    if (partUpsertError) {
      throw new RiotApiError(
        500,
        'DB_PARTICIPANT_UPSERT_ERROR',
        `Error guardando participantes de LoL en Supabase: ${partUpsertError.message}`
      );
    }
  }
}

async function syncSingleAccount(params: {
  supabase: SupabaseClient;
  apiKey: string;
  ddragonVersion: string;
  userId: string;
  platform: LolPlatform;
  puuid: string;
  isPrimary: boolean;
  gameName: string;
  tagLine: string;
  matchCount: number;
  queueId?: number;
  sessionFetchedMatchIds?: Set<string>;
}): Promise<{
  account: LolAccount;
  syncedMatchIds: string[];
  newlyFetchedCount: number;
  cachedCount: number;
}> {
  const {
    supabase,
    apiKey,
    ddragonVersion,
    userId,
    platform,
    puuid,
    isPrimary,
    gameName,
    tagLine,
    matchCount,
    queueId,
    sessionFetchedMatchIds,
  } = params;

  const cluster = getRegionalClusterForPlatform(platform);

  // Fetch Summoner-v4 & League-v4 (by-puuid!) in parallel
  const [summoner, leagueEntries] = await Promise.all([
    riotFetchJson<RiotSummonerV4Dto>(
      `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(
        puuid
      )}`,
      apiKey,
      `No se encontró el invocador de LoL en el servidor ${platform.toUpperCase()}.`
    ),
    riotFetchJson<RiotLeagueEntryV4Dto[]>(
      `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(
        puuid
      )}`,
      apiKey,
      `No se pudieron obtener las ligas ranked en ${platform.toUpperCase()}.`
    ),
  ]);

  const { rankedSolo, rankedFlex } = parseRankedEntries(
    Array.isArray(leagueEntries) ? leagueEntries : []
  );

  const matchIds = await fetchMatchIdsForPuuid({
    cluster,
    puuid,
    matchCount,
    queueId,
    apiKey,
  });

  // Filter out matches already cached in lol_matches or already fetched in this sync_group call
  const cachedMatchIdSet = new Set<string>(sessionFetchedMatchIds ?? []);
  if (matchIds.length > 0) {
    const { data: existingRows, error: cacheReadError } = await supabase
      .from('lol_matches')
      .select('match_id')
      .in('match_id', matchIds);

    if (cacheReadError) {
      throw new RiotApiError(
        500,
        'DB_CACHE_READ_ERROR',
        `Error consultando caché de partidas en Supabase: ${cacheReadError.message}`
      );
    }

    for (const row of existingRows ?? []) {
      const typedRow = row as { match_id?: string };
      if (typedRow.match_id) {
        cachedMatchIdSet.add(typedRow.match_id);
      }
    }
  }

  const missingMatchIds = matchIds.filter((id) => !cachedMatchIdSet.has(id));
  const newlyBuiltSummaries: LolMatchSummary[] = [];

  for (let i = 0; i < missingMatchIds.length; i += MATCH_BATCH_SIZE) {
    const batch = missingMatchIds.slice(i, i + MATCH_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (matchId): Promise<LolMatchSummary | null> => {
        try {
          const rawMatch = await riotFetchJson<RiotMatchV5>(
            `https://${cluster}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(
              matchId
            )}`,
            apiKey,
            `Partida ${matchId} no encontrada.`
          );
          return buildMatchSummaryFromRiotMatch(rawMatch, true);
        } catch (err: unknown) {
          if (err instanceof RiotApiError && err.status === 404) {
            return null;
          }
          throw err;
        }
      })
    );

    for (const summary of batchResults) {
      if (summary) {
        newlyBuiltSummaries.push(summary);
        sessionFetchedMatchIds?.add(summary.matchId);
      }
    }

    if (i + MATCH_BATCH_SIZE < missingMatchIds.length) {
      await sleep(MATCH_BATCH_DELAY_MS);
    }
  }

  if (newlyBuiltSummaries.length > 0) {
    await persistMatchesBatch(supabase, newlyBuiltSummaries);
  }

  const nowIso = new Date().toISOString();
  const accountRecord: LolAccountDbRow = {
    user_id: userId,
    puuid,
    is_primary: isPrimary,
    game_name: gameName,
    tag_line: tagLine,
    platform,
    regional_cluster: cluster,
    summoner_level: summoner.summonerLevel ?? 1,
    profile_icon_id: summoner.profileIconId ?? 0,
    ranked_solo: rankedSolo,
    ranked_flex: rankedFlex,
    ddragon_version: ddragonVersion,
    last_synced_at: nowIso,
  };

  const { error: accountUpsertError } = await supabase
    .from('lol_accounts')
    .upsert(
      {
        ...accountRecord,
        updated_at: nowIso,
      },
      { onConflict: 'puuid' }
    );

  if (accountUpsertError) {
    throw new RiotApiError(
      500,
      'DB_ACCOUNT_UPSERT_ERROR',
      `Error guardando la cuenta de LoL en Supabase: ${accountUpsertError.message}`
    );
  }

  const account: LolAccount = {
    userId,
    puuid,
    isPrimary,
    gameName,
    tagLine,
    platform,
    regionalCluster: cluster,
    summonerLevel: accountRecord.summoner_level,
    profileIconId: accountRecord.profile_icon_id,
    rankedSolo,
    rankedFlex,
    ddragonVersion,
    lastSyncedAt: nowIso,
  };

  return {
    account,
    syncedMatchIds: matchIds,
    newlyFetchedCount: newlyBuiltSummaries.length,
    cachedCount: matchIds.length - missingMatchIds.length,
  };
}

// ------------------------------------------------------------------------------
// EDGE FUNCTION ENTRYPOINT
// ------------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método no permitido. Use POST.' }, 405);
  }

  let body: RiotLolRequestPayload;
  try {
    const parsed = (await req.json()) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return jsonResponse({ ok: false, error: 'Cuerpo JSON inválido.' }, 400);
    }
    body = parsed as RiotLolRequestPayload;
  } catch {
    return jsonResponse({ ok: false, error: 'Cuerpo JSON inválido.' }, 400);
  }

  const rawAction = String((body as { action?: unknown }).action ?? '');

  try {
    // 1. STATUS
    if (body.action === 'status') {
      const envKey = resolveRiotApiKey();
      return jsonResponse(
        {
          ok: true,
          hasServerKey: Boolean(envKey),
          keySource: envKey ? 'env' : null,
          updatedAt: null,
        },
        200
      );
    }

    // 3. UNLINK ACCOUNT (specific puuid or all accounts for userId)
    if (body.action === 'unlink_account') {
      const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
      const targetPuuid = typeof body.puuid === 'string' ? body.puuid.trim() : '';
      if (!userId) {
        return jsonResponse(
          { ok: false, code: 'INVALID_PAYLOAD', error: 'Falta userId para desvincular.' },
          400
        );
      }

      const supabase = createAdminSupabaseClient();

      if (targetPuuid) {
        const { data: existingRow } = await supabase
          .from('lol_accounts')
          .select('puuid, is_primary')
          .eq('user_id', userId)
          .eq('puuid', targetPuuid)
          .maybeSingle();

        const { error } = await supabase
          .from('lol_accounts')
          .delete()
          .eq('user_id', userId)
          .eq('puuid', targetPuuid);

        if (error) {
          return jsonResponse(
            {
              ok: false,
              code: 'DB_DELETE_ERROR',
              error: `Error al desvincular la cuenta de LoL: ${error.message}`,
            },
            500
          );
        }

        // If we removed the primary account, promote the oldest remaining account to primary
        if ((existingRow as { is_primary?: boolean } | null)?.is_primary) {
          const { data: remaining } = await supabase
            .from('lol_accounts')
            .select('puuid')
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
            .limit(1);

          const nextPrimary = (remaining?.[0] as { puuid?: string } | undefined)?.puuid;
          if (nextPrimary) {
            await supabase
              .from('lol_accounts')
              .update({ is_primary: true, updated_at: new Date().toISOString() })
              .eq('user_id', userId)
              .eq('puuid', nextPrimary);
          }
        }

        return jsonResponse({ ok: true, userId, puuid: targetPuuid }, 200);
      }

      const { error } = await supabase.from('lol_accounts').delete().eq('user_id', userId);
      if (error) {
        return jsonResponse(
          {
            ok: false,
            code: 'DB_DELETE_ERROR',
            error: `Error al desvincular la cuenta de LoL: ${error.message}`,
          },
          500
        );
      }

      return jsonResponse({ ok: true, userId }, 200);
    }

    // 3b. SET PRIMARY ACCOUNT
    if (body.action === 'set_primary_account') {
      const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
      const targetPuuid = typeof body.puuid === 'string' ? body.puuid.trim() : '';
      if (!userId || !targetPuuid) {
        return jsonResponse(
          {
            ok: false,
            code: 'INVALID_PAYLOAD',
            error: 'Faltan userId o puuid para cambiar la cuenta principal.',
          },
          400
        );
      }

      const supabase = createAdminSupabaseClient();
      const { data: targetRow, error: checkErr } = await supabase
        .from('lol_accounts')
        .select('puuid')
        .eq('user_id', userId)
        .eq('puuid', targetPuuid)
        .maybeSingle();

      if (checkErr || !targetRow) {
        return jsonResponse(
          {
            ok: false,
            code: 'ACCOUNT_NOT_FOUND',
            error: 'No se encontró esa cuenta vinculada al jugador.',
          },
          404
        );
      }

      const nowIso = new Date().toISOString();
      const { error: demoteErr } = await supabase
        .from('lol_accounts')
        .update({ is_primary: false, updated_at: nowIso })
        .eq('user_id', userId)
        .neq('puuid', targetPuuid);

      if (demoteErr) {
        return jsonResponse(
          {
            ok: false,
            code: 'DB_UPDATE_ERROR',
            error: `Error actualizando cuentas del jugador: ${demoteErr.message}`,
          },
          500
        );
      }

      const { error: promoteErr } = await supabase
        .from('lol_accounts')
        .update({ is_primary: true, updated_at: nowIso })
        .eq('user_id', userId)
        .eq('puuid', targetPuuid);

      if (promoteErr) {
        return jsonResponse(
          {
            ok: false,
            code: 'DB_UPDATE_ERROR',
            error: `Error marcando cuenta principal: ${promoteErr.message}`,
          },
          500
        );
      }

      return jsonResponse({ ok: true, userId, puuid: targetPuuid }, 200);
    }

    // Remaining actions require Riot API Key
    const supabase = createAdminSupabaseClient();
    const apiKey = resolveRiotApiKey();
    if (!apiKey) {
      return jsonResponse(
        {
          ok: false,
          code: 'MISSING_API_KEY',
          error:
            'Falta configurar el secreto RIOT_API_KEY en las Edge Functions de Supabase.',
        },
        400
      );
    }

    // 3. LINK AND SYNC
    if (body.action === 'link_and_sync') {
      const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
      const gameName = typeof body.gameName === 'string' ? body.gameName.trim() : '';
      const tagLine =
        typeof body.tagLine === 'string' ? body.tagLine.trim().replace(/^#/, '') : '';
      const rawPlatform =
        typeof body.platform === 'string' ? body.platform.toLowerCase().trim() : '';

      if (!userId || !gameName || !tagLine || !isValidLolPlatform(rawPlatform)) {
        return jsonResponse(
          {
            ok: false,
            code: 'INVALID_PAYLOAD',
            error:
              'Datos incompletos o servidor inválido. Enviá userId, gameName, tagLine y un platform válido (ej: la2, la1, br1, na1, euw1).',
          },
          400
        );
      }

      const platform: LolPlatform = rawPlatform;
      const cluster = getRegionalClusterForPlatform(platform);

      const [accountDto, ddragonVersion, existingUserAccountsRes] = await Promise.all([
        riotFetchJson<RiotAccountV1Dto>(
          `https://${cluster}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
            gameName
          )}/${encodeURIComponent(tagLine)}`,
          apiKey,
          `No se encontró el Riot ID "${gameName}#${tagLine}" en el cluster ${cluster.toUpperCase()} (${platform.toUpperCase()}). Verificá nombre, tag y servidor.`
        ),
        fetchLatestDdragonVersion(),
        supabase
          .from('lol_accounts')
          .select('puuid, is_primary')
          .eq('user_id', userId),
      ]);

      // Prevent stealing a Riot account already linked to a different user
      const { data: existingOwner } = await supabase
        .from('lol_accounts')
        .select('user_id, is_primary')
        .eq('puuid', accountDto.puuid)
        .maybeSingle();

      const ownerRow = existingOwner as { user_id?: string; is_primary?: boolean } | null;
      if (ownerRow && ownerRow.user_id && ownerRow.user_id !== userId) {
        return jsonResponse(
          {
            ok: false,
            code: 'ACCOUNT_ALREADY_LINKED',
            error: 'Esa cuenta de Riot ya está vinculada a otro miembro del grupo.',
          },
          409
        );
      }

      const userAccounts = (existingUserAccountsRes.data ?? []) as Array<{
        puuid: string;
        is_primary: boolean;
      }>;
      const otherAccounts = userAccounts.filter((a) => a.puuid !== accountDto.puuid);
      const resolvedIsPrimary =
        otherAccounts.length === 0
          ? true
          : typeof body.isPrimary === 'boolean'
            ? body.isPrimary
            : ownerRow?.is_primary ?? false;

      if (resolvedIsPrimary && otherAccounts.length > 0) {
        await supabase
          .from('lol_accounts')
          .update({ is_primary: false, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .neq('puuid', accountDto.puuid);
      }

      const syncResult = await syncSingleAccount({
        supabase,
        apiKey,
        ddragonVersion,
        userId,
        platform,
        puuid: accountDto.puuid,
        isPrimary: resolvedIsPrimary,
        gameName: accountDto.gameName || gameName,
        tagLine: accountDto.tagLine || tagLine,
        matchCount: body.matchCount ?? 20,
        queueId: body.queueId,
      });

      return jsonResponse(
        {
          ok: true,
          ddragonVersion,
          ...syncResult,
        },
        200
      );
    }

    // 4. SYNC PLAYER (syncs primary + all secondary accounts of userId)
    if (body.action === 'sync_player') {
      const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
      if (!userId) {
        return jsonResponse(
          { ok: false, code: 'INVALID_PAYLOAD', error: 'Falta userId para sincronizar.' },
          400
        );
      }

      const { data: rowsData, error: fetchAccountError } = await supabase
        .from('lol_accounts')
        .select('*')
        .eq('user_id', userId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (fetchAccountError) {
        return jsonResponse(
          {
            ok: false,
            code: 'DB_READ_ERROR',
            error: `Error leyendo cuentas de LoL en Supabase: ${fetchAccountError.message}`,
          },
          500
        );
      }

      const rows = (rowsData ?? []) as LolAccountDbRow[];
      if (rows.length === 0) {
        return jsonResponse(
          {
            ok: false,
            code: 'ACCOUNT_NOT_LINKED',
            error: 'El jugador no tiene cuentas de League of Legends vinculadas.',
          },
          404
        );
      }

      const ddragonVersion = await fetchLatestDdragonVersion();
      const sessionFetchedMatchIds = new Set<string>();
      const syncedAccounts: LolAccount[] = [];
      let totalNewlyFetched = 0;
      let totalCached = 0;

      for (const row of rows) {
        if (!isValidLolPlatform(row.platform)) continue;
        const platform: LolPlatform = row.platform;
        const cluster = getRegionalClusterForPlatform(platform);

        const refreshedAccountDto = await riotFetchJson<RiotAccountV1Dto>(
          `https://${cluster}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${encodeURIComponent(
            row.puuid
          )}`,
          apiKey,
          `No se encontró el PUUID en Riot Account-v1 (${cluster.toUpperCase()}).`
        ).catch((err: unknown) => {
          if (err instanceof RiotApiError && (err.status === 401 || err.status === 403 || err.status === 429)) {
            throw err;
          }
          return null;
        });

        const syncResult = await syncSingleAccount({
          supabase,
          apiKey,
          ddragonVersion,
          userId,
          platform,
          puuid: row.puuid,
          isPrimary: row.is_primary !== false,
          gameName: refreshedAccountDto?.gameName || row.game_name,
          tagLine: refreshedAccountDto?.tagLine || row.tag_line,
          matchCount: body.matchCount ?? 20,
          queueId: body.queueId,
          sessionFetchedMatchIds,
        });

        syncedAccounts.push(syncResult.account);
        totalNewlyFetched += syncResult.newlyFetchedCount;
        totalCached += syncResult.cachedCount;
      }

      return jsonResponse(
        {
          ok: true,
          ddragonVersion,
          account: syncedAccounts[0],
          accounts: syncedAccounts,
          newlyFetchedCount: totalNewlyFetched,
          cachedCount: totalCached,
        },
        200
      );
    }

    // 5. SYNC GROUP (Sequential to respect Riot dev key limits + shared match cache)
    if (body.action === 'sync_group') {
      const userIds = Array.isArray(body.userIds)
        ? Array.from(
            new Set(
              body.userIds
                .filter((id): id is string => typeof id === 'string')
                .map((id) => id.trim())
                .filter(Boolean)
            )
          )
        : [];

      if (userIds.length === 0) {
        return jsonResponse(
          { ok: false, code: 'INVALID_PAYLOAD', error: 'Enviá al menos un userId en userIds.' },
          400
        );
      }

      const { data: rowsData, error: fetchGroupError } = await supabase
        .from('lol_accounts')
        .select('*')
        .in('user_id', userIds);

      if (fetchGroupError) {
        return jsonResponse(
          {
            ok: false,
            code: 'DB_READ_ERROR',
            error: `Error leyendo cuentas del grupo: ${fetchGroupError.message}`,
          },
          500
        );
      }

      const rows = (rowsData ?? []) as LolAccountDbRow[];
      const ddragonVersion = await fetchLatestDdragonVersion();
      const sessionFetchedMatchIds = new Set<string>();
      const results: Array<{
        userId: string;
        ok: boolean;
        account?: LolAccount;
        newlyFetchedCount: number;
        cachedCount: number;
        totalMatchesChecked: number;
        error?: string;
      }> = [];

      let totalNewlyFetched = 0;

      for (const row of rows) {
        if (!isValidLolPlatform(row.platform)) {
          results.push({
            userId: row.user_id,
            ok: false,
            newlyFetchedCount: 0,
            cachedCount: 0,
            totalMatchesChecked: 0,
            error: `Plataforma inválida (${row.platform}).`,
          });
          continue;
        }

        try {
          const syncRes = await syncSingleAccount({
            supabase,
            apiKey,
            ddragonVersion,
            userId: row.user_id,
            platform: row.platform,
            puuid: row.puuid,
            isPrimary: row.is_primary !== false,
            gameName: row.game_name,
            tagLine: row.tag_line,
            matchCount: body.matchCount ?? 20,
            queueId: body.queueId,
            sessionFetchedMatchIds,
          });

          totalNewlyFetched += syncRes.newlyFetchedCount;
          results.push({
            userId: row.user_id,
            ok: true,
            account: syncRes.account,
            newlyFetchedCount: syncRes.newlyFetchedCount,
            cachedCount: syncRes.cachedCount,
            totalMatchesChecked: syncRes.syncedMatchIds.length,
          });
        } catch (err: unknown) {
          if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) {
            throw err;
          }
          results.push({
            userId: row.user_id,
            ok: false,
            newlyFetchedCount: 0,
            cachedCount: 0,
            totalMatchesChecked: 0,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return jsonResponse(
        {
          ok: true,
          ddragonVersion,
          totalNewlyFetched,
          results,
        },
        200
      );
    }

    return jsonResponse(
      { ok: false, code: 'UNKNOWN_ACTION', error: `Acción no soportada: ${rawAction}` },
      400
    );
  } catch (err: unknown) {
    if (err instanceof RiotApiError) {
      return jsonResponse(
        { ok: false, code: err.code, error: err.message },
        err.status
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      {
        ok: false,
        code: 'INTERNAL_ERROR',
        error: `Error inesperado en la función riot-lol: ${message}`,
      },
      500
    );
  }
});
