import type {
  LolAccount,
  LolDurationBucketStats,
  LolMatchOutcome,
  LolMatchParticipantSummary,
  LolMatchSummary,
  LolPerformanceGrade,
  LolPlatform,
  LolQueueCategory,
  LolRegionalCluster,
  LolRoleKey,
  LolSpecificQueueCategory,
  LolTimeRangeFilter,
  RiotMatchV5Participant,
} from '../../types/lol';
import {
  DURATION_BUCKET_DEFINITIONS,
  PLATFORM_TO_CLUSTER,
  TIME_RANGE_DAYS,
} from './constants';

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

export function getRegionalClusterForPlatform(platform: LolPlatform): LolRegionalCluster {
  return PLATFORM_TO_CLUSTER[platform] ?? 'americas';
}

export function getQueueCategory(
  queueId: number,
  gameMode?: string
): Exclude<LolQueueCategory, 'all'> {
  if (queueId === 420) return 'ranked_solo';
  if (queueId === 440) return 'ranked_flex';
  if (queueId === 400 || queueId === 430 || queueId === 480 || queueId === 490) {
    return 'normal';
  }
  if (queueId === 700 || queueId === 710) {
    return 'mode_5v5';
  }
  if (queueId === 450 || queueId === 720 || queueId === 930 || gameMode === 'ARAM') {
    return 'aram';
  }
  if (
    queueId === 1700 ||
    queueId === 1710 ||
    queueId === 1740 ||
    queueId === 1750 ||
    gameMode === 'CHERRY'
  ) {
    return 'arena';
  }
  return 'other';
}


export function filterMatchesGlobally(
  matches: LolMatchSummary[],
  selectedQueues: LolSpecificQueueCategory[],
  timeRange: LolTimeRangeFilter,
  nowMs: number = Date.now()
): LolMatchSummary[] {
  const cutoffMs =
    timeRange === 'all'
      ? null
      : nowMs - TIME_RANGE_DAYS[timeRange] * 24 * 60 * 60 * 1000;
  const queueSet = selectedQueues.length > 0 ? new Set(selectedQueues) : null;

  return matches.filter((m) => {
    if (cutoffMs !== null) {
      const ts = m.gameCreation > 0 ? m.gameCreation : m.gameStartTimestamp;
      if (ts > 0 && ts < cutoffMs) {
        return false;
      }
    }
    if (queueSet !== null) {
      const cat = getQueueCategory(m.queueId, m.gameMode);
      if (!queueSet.has(cat)) {
        return false;
      }
    }
    return true;
  });
}


export function normalizeRiftRoleToken(raw?: string): LolRoleKey | null {
  const token = (raw ?? '').toUpperCase().trim();
  if (!token || token === 'INVALID' || token === 'NONE') return null;
  if (token === 'TOP') return 'TOP';
  if (token === 'JUNGLE') return 'JUNGLE';
  if (token === 'MIDDLE' || token === 'MID') return 'MIDDLE';
  if (token === 'BOTTOM' || token === 'BOT' || token === 'ADC' || token === 'CARRY') {
    return 'BOTTOM';
  }
  if (token === 'UTILITY' || token === 'SUPPORT' || token === 'SUP') {
    return 'UTILITY';
  }
  return null;
}

export function resolveParticipantRole(
  p: RiotMatchV5Participant,
  queueId: number,
  gameMode?: string
): LolRoleKey {
  const category = getQueueCategory(queueId, gameMode);
  if (category === 'aram' || gameMode === 'ARAM') return 'ARAM';
  if (category === 'arena' || gameMode === 'CHERRY') return 'ARENA';

  return (
    normalizeRiftRoleToken(p.teamPosition) ??
    normalizeRiftRoleToken(p.individualPosition) ??
    'MIDDLE'
  );
}

/**
 * CRITICAL RIOT API RULE:
 * `gameEndedInSurrender` is `true` for BOTH teams when either team surrenders.
 * Always evaluate `p.win === true` BEFORE checking surrender flags.
 */
export function classifyMatchOutcome(
  p: Pick<RiotMatchV5Participant, 'win' | 'gameEndedInSurrender' | 'gameEndedInEarlySurrender'>,
  gameDurationSeconds: number
): { outcome: LolMatchOutcome; enemySurrendered: boolean } {
  if (p.win === true) {
    return {
      outcome: 'win',
      enemySurrendered: Boolean(p.gameEndedInSurrender || p.gameEndedInEarlySurrender),
    };
  }

  if (Boolean(p.gameEndedInEarlySurrender) || gameDurationSeconds < 240) {
    return {
      outcome: 'remake',
      enemySurrendered: false,
    };
  }

  if (Boolean(p.gameEndedInSurrender)) {
    return {
      outcome: 'ff',
      enemySurrendered: false,
    };
  }

  return {
    outcome: 'loss',
    enemySurrendered: false,
  };
}

export function getGradeFromScore(score: number): LolPerformanceGrade {
  if (score >= 90) return 'S+';
  if (score >= 82) return 'S';
  if (score >= 74) return 'A+';
  if (score >= 66) return 'A';
  if (score >= 56) return 'B';
  if (score >= 45) return 'C';
  return 'D';
}


export function computeDurationBuckets(
  entries: Array<{ durationSeconds: number; outcome: LolMatchOutcome }>
): LolDurationBucketStats[] {
  return DURATION_BUCKET_DEFINITIONS.map((bucket) => {
    const matched = entries.filter((e) => bucket.matches(e.durationSeconds));
    const total = matched.length;
    let wins = 0;
    let losses = 0;
    let ffs = 0;
    let remakes = 0;

    for (const entry of matched) {
      if (entry.outcome === 'win') {
        wins += 1;
      } else if (entry.outcome === 'loss') {
        losses += 1;
      } else if (entry.outcome === 'ff') {
        ffs += 1;
      } else if (entry.outcome === 'remake') {
        remakes += 1;
        ffs += 1;
      }
    }

    return {
      key: bucket.key,
      label: bucket.label,
      total,
      wins,
      losses,
      ffs,
      remakes,
      winRate: total > 0 ? round1((wins / total) * 100) : 0,
      ffRate: total > 0 ? round1((ffs / total) * 100) : 0,
      lossRate: total > 0 ? round1((losses / total) * 100) : 0,
    };
  });
}

export interface LolUserAccountGroup {
  userId: string;
  primaryAccount: LolAccount;
  accounts: LolAccount[];
  puuids: Set<string>;
}

export function normalizePuuidSet(target: string | ReadonlySet<string>): Set<string> {
  if (typeof target === 'string') {
    return target ? new Set([target]) : new Set();
  }
  return new Set(target);
}

export function buildPuuidToUserIdMap(accounts: LolAccount[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const acc of accounts) {
    if (acc.puuid) map.set(acc.puuid, acc.userId);
  }
  return map;
}

export function groupAccountsByUser(accounts: LolAccount[]): LolUserAccountGroup[] {
  const byUser = new Map<string, LolAccount[]>();
  for (const acc of accounts) {
    const list = byUser.get(acc.userId);
    if (list) list.push(acc);
    else byUser.set(acc.userId, [acc]);
  }

  const groups: LolUserAccountGroup[] = [];
  for (const [userId, userAccounts] of byUser.entries()) {
    const sorted = [...userAccounts].sort(
      (a, b) => Number(b.isPrimary !== false) - Number(a.isPrimary !== false)
    );
    groups.push({
      userId,
      primaryAccount: sorted[0],
      accounts: sorted,
      puuids: new Set(sorted.map((a) => a.puuid).filter(Boolean)),
    });
  }
  return groups;
}

export function getUserAccounts(accounts: LolAccount[], userId: string): LolAccount[] {
  return accounts
    .filter((a) => a.userId === userId)
    .sort((a, b) => Number(b.isPrimary !== false) - Number(a.isPrimary !== false));
}

export function resolveUserPrimaryAccount(
  accounts: LolAccount[],
  userId: string | null | undefined
): LolAccount | null {
  if (!userId) return null;
  const userAccounts = getUserAccounts(accounts, userId);
  return userAccounts[0] ?? null;
}

export function getUserPuuids(
  accounts: LolAccount[],
  userId: string | null | undefined
): Set<string> {
  if (!userId) return new Set();
  return new Set(
    accounts
      .filter((a) => a.userId === userId && Boolean(a.puuid))
      .map((a) => a.puuid)
  );
}

export function countGroupMembersInMatch(
  match: Pick<LolMatchSummary, 'participantPuuids'>,
  groupMemberPuuids: ReadonlySet<string>,
  puuidToUserId?: ReadonlyMap<string, string>
): number {
  const uniquePuuids = new Set(match.participantPuuids);
  if (puuidToUserId && puuidToUserId.size > 0) {
    const uniqueUsers = new Set<string>();
    for (const puuid of uniquePuuids) {
      if (groupMemberPuuids.has(puuid)) {
        uniqueUsers.add(puuidToUserId.get(puuid) ?? puuid);
      }
    }
    return uniqueUsers.size;
  }
  let count = 0;
  for (const puuid of uniquePuuids) {
    if (groupMemberPuuids.has(puuid)) {
      count += 1;
    }
  }
  return count;
}

export function isGroupMatch(
  match: Pick<LolMatchSummary, 'participantPuuids'>,
  groupMemberPuuids: ReadonlySet<string>,
  puuidToUserId?: ReadonlyMap<string, string>
): boolean {
  return countGroupMembersInMatch(match, groupMemberPuuids, puuidToUserId) >= 2;
}


export function filterMatchesByQueue(
  matches: LolMatchSummary[],
  queueFilter: LolQueueCategory
): LolMatchSummary[] {
  if (queueFilter === 'all') return matches;
  return matches.filter((m) => getQueueCategory(m.queueId, m.gameMode) === queueFilter);
}

export function getMatchTimestamp(match: LolMatchSummary): number {
  return match.gameCreation > 0 ? match.gameCreation : match.gameStartTimestamp;
}

export function formatMatchDateLabel(match: LolMatchSummary): string | undefined {
  const ts = getMatchTimestamp(match);
  if (!Number.isFinite(ts) || ts <= 0) return undefined;
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export function formatSecondsCompact(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export interface LolGroupMatchOutcomeResolution {
  outcome: LolMatchOutcome;
  enemySurrendered: boolean;
  avgPerformance: number;
  groupParticipants: LolMatchParticipantSummary[];
  representative: LolMatchParticipantSummary | null;
}

export function resolveGroupMatchOutcome(
  match: LolMatchSummary,
  groupPuuids: Set<string>
): LolGroupMatchOutcomeResolution {
  const groupParticipants = match.participants.filter((p) => groupPuuids.has(p.puuid));
  const nonRemake = groupParticipants.filter((p) => p.outcome !== 'remake');

  const isRemakeMatch =
    nonRemake.length === 0 ||
    (match.gameDuration < 240 && !nonRemake.some((p) => p.outcome === 'win'));

  let outcome: LolMatchOutcome;
  if (isRemakeMatch) {
    outcome = 'remake';
  } else {
    const wins = nonRemake.filter((p) => p.outcome === 'win').length;
    const ffs = nonRemake.filter((p) => p.outcome === 'ff').length;
    const majority = Math.ceil(nonRemake.length / 2);
    if (wins >= majority) {
      outcome = 'win';
    } else if (ffs === nonRemake.length || ffs >= majority) {
      outcome = 'ff';
    } else {
      outcome = 'loss';
    }
  }

  const enemySurrendered =
    outcome === 'win' && nonRemake.some((p) => p.enemySurrendered);

  const avgPerformance =
    outcome === 'remake' || nonRemake.length === 0
      ? 0
      : round1(nonRemake.reduce((sum, p) => sum + p.performanceScore, 0) / nonRemake.length);

  let representative: LolMatchParticipantSummary | null = null;
  if (nonRemake.length > 0 && outcome !== 'remake') {
    representative = nonRemake.reduce((best, curr) =>
      curr.performanceScore > best.performanceScore ? curr : best
    );
  } else if (groupParticipants.length > 0) {
    representative = groupParticipants[0];
  }

  return {
    outcome,
    enemySurrendered,
    avgPerformance,
    groupParticipants,
    representative,
  };
}
