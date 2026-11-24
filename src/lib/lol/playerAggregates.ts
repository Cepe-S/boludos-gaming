import type {
  LolAccount,
  LolChampionDetailedStats,
  LolChampionSummary,
  LolMatchOutcome,
  LolMatchParticipantSummary,
  LolMatchSummary,
  LolPerformancePillarScores,
  LolPersonalVsGroupStats,
  LolPlayerAggregateStats,
  LolQueueCategory,
  LolRoleKey,
  LolViewMode,
} from '../../types/lol';
import {
  computeDurationBuckets,
  filterMatchesByQueue,
  getMatchTimestamp,
  isGroupMatch,
  normalizePuuidSet,
  round1,
  round2,
  round3,
} from './helpers';

export interface PlayerMatchSample {
  match: LolMatchSummary;
  participant: LolMatchParticipantSummary;
}

export function resolvePrimaryRole(roleCounts: Map<LolRoleKey, number>): LolRoleKey {
  let bestRole: LolRoleKey = 'MIDDLE';
  let bestCount = -1;
  for (const [role, count] of roleCounts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestRole = role;
    }
  }
  return bestRole;
}

export interface CoreParticipantAverages {
  count: number;
  avgPerformance: number;
  avgPillars: LolPerformancePillarScores;
  avgKda: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgKp: number;
  avgCsPerMin: number;
  avgDpm: number;
  avgGpm: number;
  avgVisionPerMin: number;
  mvpCount: number;
  aceCount: number;
}

export function computeCoreParticipantAverages(samples: PlayerMatchSample[]): CoreParticipantAverages {
  let count = 0;
  let mvpCount = 0;
  let aceCount = 0;

  let perfSum = 0;
  let combatSum = 0;
  let impactSum = 0;
  let economySum = 0;
  let objectivesSum = 0;
  let visionSum = 0;
  let dominanceSum = 0;

  let kdaSum = 0;
  let killsSum = 0;
  let deathsSum = 0;
  let assistsSum = 0;
  let kpSum = 0;
  let csPerMinSum = 0;
  let dpmSum = 0;
  let gpmSum = 0;
  let visionPerMinSum = 0;

  for (const { match, participant: p } of samples) {
    if (p.outcome === 'remake') continue;

    count += 1;
    if (p.isMvp) mvpCount += 1;
    if (p.isAce) aceCount += 1;

    const mins = Math.max(1, match.gameDuration / 60);
    perfSum += p.performanceScore;
    combatSum += p.performanceBreakdown.pillars.combat;
    impactSum += p.performanceBreakdown.pillars.impact;
    economySum += p.performanceBreakdown.pillars.economy;
    objectivesSum += p.performanceBreakdown.pillars.objectives;
    visionSum += p.performanceBreakdown.pillars.vision;
    dominanceSum += p.performanceBreakdown.pillars.dominance;

    kdaSum += p.kda;
    killsSum += p.kills;
    deathsSum += p.deaths;
    assistsSum += p.assists;
    kpSum += p.killParticipation;
    csPerMinSum += p.csPerMin;
    dpmSum += p.damageToChampions / mins;
    gpmSum += p.goldEarned / mins;
    visionPerMinSum += p.visionScore / mins;
  }

  const denom = count > 0 ? count : 1;

  return {
    count,
    avgPerformance: count > 0 ? round1(perfSum / denom) : 0,
    avgPillars: {
      combat: count > 0 ? round1(combatSum / denom) : 0,
      impact: count > 0 ? round1(impactSum / denom) : 0,
      economy: count > 0 ? round1(economySum / denom) : 0,
      objectives: count > 0 ? round1(objectivesSum / denom) : 0,
      vision: count > 0 ? round1(visionSum / denom) : 0,
      dominance: count > 0 ? round1(dominanceSum / denom) : 0,
    },
    avgKda: count > 0 ? round2(kdaSum / denom) : 0,
    avgKills: count > 0 ? round1(killsSum / denom) : 0,
    avgDeaths: count > 0 ? round1(deathsSum / denom) : 0,
    avgAssists: count > 0 ? round1(assistsSum / denom) : 0,
    avgKp: count > 0 ? round3(kpSum / denom) : 0,
    avgCsPerMin: count > 0 ? round2(csPerMinSum / denom) : 0,
    avgDpm: count > 0 ? round1(dpmSum / denom) : 0,
    avgGpm: count > 0 ? round1(gpmSum / denom) : 0,
    avgVisionPerMin: count > 0 ? round2(visionPerMinSum / denom) : 0,
    mvpCount,
    aceCount,
  };
}

export function buildTopChampions(samples: PlayerMatchSample[]): LolChampionSummary[] {
  const champMap = new Map<
    number,
    {
      championName: string;
      championId: number;
      roleCounts: Map<LolRoleKey, number>;
      games: number;
      wins: number;
      losses: number;
      ffs: number;
      perfSum: number;
      kdaSum: number;
      csPerMinSum: number;
      dpmSum: number;
      visionPerMinSum: number;
      kpSum: number;
      mvpCount: number;
      aceCount: number;
    }
  >();

  for (const { match, participant: p } of samples) {
    if (p.outcome === 'remake') continue;
    const mins = Math.max(1, match.gameDuration / 60);
    const entry = champMap.get(p.championId) ?? {
      championName: p.championName,
      championId: p.championId,
      roleCounts: new Map<LolRoleKey, number>(),
      games: 0,
      wins: 0,
      losses: 0,
      ffs: 0,
      perfSum: 0,
      kdaSum: 0,
      csPerMinSum: 0,
      dpmSum: 0,
      visionPerMinSum: 0,
      kpSum: 0,
      mvpCount: 0,
      aceCount: 0,
    };

    entry.games += 1;
    if (p.outcome === 'win') entry.wins += 1;
    else if (p.outcome === 'ff') entry.ffs += 1;
    else if (p.outcome === 'loss') entry.losses += 1;

    const role = p.performanceBreakdown.role;
    entry.roleCounts.set(role, (entry.roleCounts.get(role) ?? 0) + 1);
    entry.perfSum += p.performanceScore;
    entry.kdaSum += p.kda;
    entry.csPerMinSum += p.csPerMin;
    entry.dpmSum += p.damageToChampions / mins;
    entry.visionPerMinSum += p.visionScore / mins;
    entry.kpSum += p.killParticipation;
    if (p.isMvp) entry.mvpCount += 1;
    if (p.isAce) entry.aceCount += 1;
    champMap.set(p.championId, entry);
  }

  return Array.from(champMap.values())
    .map((c) => ({
      championName: c.championName,
      championId: c.championId,
      primaryRole: resolvePrimaryRole(c.roleCounts),
      games: c.games,
      wins: c.wins,
      losses: c.losses,
      ffs: c.ffs,
      winRate: c.games > 0 ? round1((c.wins / c.games) * 100) : 0,
      avgPerformance: c.games > 0 ? round1(c.perfSum / c.games) : 0,
      avgKda: c.games > 0 ? round2(c.kdaSum / c.games) : 0,
      avgCsPerMin: c.games > 0 ? round2(c.csPerMinSum / c.games) : 0,
      avgDpm: c.games > 0 ? round1(c.dpmSum / c.games) : 0,
      avgVisionPerMin: c.games > 0 ? round2(c.visionPerMinSum / c.games) : 0,
      avgKp: c.games > 0 ? round3(c.kpSum / c.games) : 0,
      mvpCount: c.mvpCount,
      aceCount: c.aceCount,
    }))
    .sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.avgPerformance - a.avgPerformance;
    });
}

export function aggregateSamples(samples: PlayerMatchSample[]): LolPlayerAggregateStats {
  const totalGames = samples.length;
  let wins = 0;
  let losses = 0;
  let ffs = 0;
  let remakes = 0;

  const bucketEntries: Array<{ durationSeconds: number; outcome: LolMatchOutcome }> = [];

  for (const { match, participant: p } of samples) {
    bucketEntries.push({ durationSeconds: match.gameDuration, outcome: p.outcome });

    if (p.outcome === 'remake') {
      remakes += 1;
      continue;
    }

    if (p.outcome === 'win') wins += 1;
    else if (p.outcome === 'ff') ffs += 1;
    else losses += 1;
  }

  const core = computeCoreParticipantAverages(samples);
  const scoredGames = core.count;
  const denom = scoredGames > 0 ? scoredGames : 1;

  return {
    totalGames,
    scoredGames,
    wins,
    losses,
    ffs,
    remakes,
    winRate: scoredGames > 0 ? round1((wins / denom) * 100) : 0,
    ffRate: scoredGames > 0 ? round1((ffs / denom) * 100) : 0,
    avgPerformance: core.avgPerformance,
    avgPillars: core.avgPillars,
    avgKda: core.avgKda,
    avgKills: core.avgKills,
    avgDeaths: core.avgDeaths,
    avgAssists: core.avgAssists,
    avgKp: core.avgKp,
    avgCsPerMin: core.avgCsPerMin,
    avgDpm: core.avgDpm,
    avgGpm: core.avgGpm,
    avgVisionPerMin: core.avgVisionPerMin,
    mvpCount: core.mvpCount,
    aceCount: core.aceCount,
    topChampions: buildTopChampions(samples),
    durationBuckets: computeDurationBuckets(bucketEntries),
  };
}

export function computePlayerAggregates(
  matches: LolMatchSummary[],
  targetPuuid: string | ReadonlySet<string>,
  groupMemberPuuids: ReadonlySet<string>,
  queueFilter: LolQueueCategory = 'all',
  puuidToUserId?: ReadonlyMap<string, string>
): LolPersonalVsGroupStats {
  const targetPuuids = normalizePuuidSet(targetPuuid);
  const filteredMatches = filterMatchesByQueue(matches, queueFilter);
  const personalSamples: PlayerMatchSample[] = [];
  const inGroupSamples: PlayerMatchSample[] = [];
  const soloSamples: PlayerMatchSample[] = [];

  for (const match of filteredMatches) {
    const participant = match.participants.find((p) => targetPuuids.has(p.puuid));
    if (!participant) continue;

    const sample: PlayerMatchSample = { match, participant };
    personalSamples.push(sample);

    if (isGroupMatch(match, groupMemberPuuids, puuidToUserId)) {
      inGroupSamples.push(sample);
    } else {
      soloSamples.push(sample);
    }
  }

  const personal = aggregateSamples(personalSamples);
  const inGroup = aggregateSamples(inGroupSamples);
  const soloOnly = aggregateSamples(soloSamples);

  const baseline = soloOnly.scoredGames > 0 ? soloOnly : personal;
  const hasGroupComparison = inGroup.scoredGames > 0 && baseline.scoredGames > 0;

  return {
    personal,
    inGroup,
    soloOnly,
    deltas: {
      winRateDelta: hasGroupComparison ? round1(inGroup.winRate - baseline.winRate) : 0,
      performanceDelta: hasGroupComparison
        ? round1(inGroup.avgPerformance - baseline.avgPerformance)
        : 0,
      kdaDelta: hasGroupComparison ? round2(inGroup.avgKda - baseline.avgKda) : 0,
      ffRateDelta: hasGroupComparison ? round1(inGroup.ffRate - baseline.ffRate) : 0,
    },
  };
}


export function computePlayerChampionDetail(params: {
  matches: LolMatchSummary[];
  account: LolAccount;
  puuids?: ReadonlySet<string>;
  displayName: string;
  avatarUrl: string;
  championName: string;
  scope: LolViewMode;
  groupMemberPuuids?: ReadonlySet<string>;
  puuidToUserId?: ReadonlyMap<string, string>;
}): LolChampionDetailedStats {
  const {
    matches,
    account,
    puuids,
    displayName,
    avatarUrl,
    championName,
    scope,
    groupMemberPuuids,
    puuidToUserId,
  } = params;

  const targetPuuids = puuids && puuids.size > 0 ? puuids : new Set([account.puuid]);
  const targetChamp = championName.trim().toLowerCase();
  const scopedMatches =
    scope === 'group' && groupMemberPuuids
      ? matches.filter((m) => isGroupMatch(m, groupMemberPuuids, puuidToUserId))
      : matches;

  const matchedSamples: PlayerMatchSample[] = [];
  for (const match of scopedMatches) {
    const participant = match.participants.find(
      (p) => targetPuuids.has(p.puuid) && p.championName.trim().toLowerCase() === targetChamp
    );
    if (!participant) continue;
    matchedSamples.push({ match, participant });
  }

  matchedSamples.sort((a, b) => getMatchTimestamp(b.match) - getMatchTimestamp(a.match));

  let wins = 0;
  let losses = 0;
  let ffs = 0;
  let remakes = 0;

  let csSum = 0;
  let dmgSum = 0;
  let dmgTakenPerMinSum = 0;
  let deadSecondsSum = 0;
  let durationSum = 0;

  const bucketEntries: Array<{ durationSeconds: number; outcome: LolMatchOutcome }> = [];
  const scoredSamples: PlayerMatchSample[] = [];

  const roleMap = new Map<LolRoleKey, { role: LolRoleKey; games: number; wins: number }>();
  const runeMap = new Map<
    string,
    { primaryRuneId: number; subStyleId: number | null; games: number; wins: number }
  >();
  const spellMap = new Map<
    string,
    { summoner1Id: number; summoner2Id: number; games: number; wins: number }
  >();
  const itemMap = new Map<number, { itemId: number; games: number; wins: number }>();

  for (const sample of matchedSamples) {
    const { match, participant: p } = sample;
    bucketEntries.push({ durationSeconds: match.gameDuration, outcome: p.outcome });

    if (p.outcome === 'remake') {
      remakes += 1;
      continue;
    }

    scoredSamples.push(sample);
    const isWin = p.outcome === 'win';
    if (isWin) wins += 1;
    else if (p.outcome === 'ff') ffs += 1;
    else losses += 1;

    const mins = Math.max(1, match.gameDuration / 60);
    const deadSeconds = p.totalTimeSpentDead ?? p.rawParticipant?.totalTimeSpentDead ?? 0;

    csSum += p.cs;
    dmgSum += p.damageToChampions;
    dmgTakenPerMinSum += p.damageTaken / mins;
    deadSecondsSum += deadSeconds;
    durationSum += Math.max(0, match.gameDuration);

    // Role distribution
    const role = p.performanceBreakdown.role;
    const roleEntry = roleMap.get(role) ?? { role, games: 0, wins: 0 };
    roleEntry.games += 1;
    if (isWin) roleEntry.wins += 1;
    roleMap.set(role, roleEntry);

    // Runes
    if (p.primaryRuneId !== null && p.primaryRuneId > 0) {
      const subId = p.subStyleId ?? null;
      const runeKey = `${p.primaryRuneId}::${subId ?? 'none'}`;
      const runeEntry = runeMap.get(runeKey) ?? {
        primaryRuneId: p.primaryRuneId,
        subStyleId: subId,
        games: 0,
        wins: 0,
      };
      runeEntry.games += 1;
      if (isWin) runeEntry.wins += 1;
      runeMap.set(runeKey, runeEntry);
    }

    // Spells (normalized min/max pair)
    if (p.summoner1Id > 0 && p.summoner2Id > 0) {
      const s1 = Math.min(p.summoner1Id, p.summoner2Id);
      const s2 = Math.max(p.summoner1Id, p.summoner2Id);
      const spellKey = `${s1}::${s2}`;
      const spellEntry = spellMap.get(spellKey) ?? {
        summoner1Id: s1,
        summoner2Id: s2,
        games: 0,
        wins: 0,
      };
      spellEntry.games += 1;
      if (isWin) spellEntry.wins += 1;
      spellMap.set(spellKey, spellEntry);
    }

    // Items (slots 0..5 excluding 0, deduplicated per match)
    const uniqueItems = new Set<number>();
    for (let i = 0; i < Math.min(6, p.items.length); i++) {
      const itemId = p.items[i];
      if (itemId > 0) uniqueItems.add(itemId);
    }
    for (const itemId of uniqueItems) {
      const itemEntry = itemMap.get(itemId) ?? { itemId, games: 0, wins: 0 };
      itemEntry.games += 1;
      if (isWin) itemEntry.wins += 1;
      itemMap.set(itemId, itemEntry);
    }
  }

  const totalGames = matchedSamples.length;
  const core = computeCoreParticipantAverages(scoredSamples);
  const scoredGames = core.count;
  const denom = scoredGames > 0 ? scoredGames : 1;

  const roleDistribution = Array.from(roleMap.values())
    .map((r) => ({
      role: r.role,
      games: r.games,
      pct: scoredGames > 0 ? round1((r.games / denom) * 100) : 0,
      winRate: r.games > 0 ? round1((r.wins / r.games) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate);

  const topRunes = Array.from(runeMap.values())
    .map((r) => ({
      primaryRuneId: r.primaryRuneId,
      subStyleId: r.subStyleId,
      games: r.games,
      winRate: r.games > 0 ? round1((r.wins / r.games) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
    .slice(0, 5);

  const topSpells = Array.from(spellMap.values())
    .map((s) => ({
      summoner1Id: s.summoner1Id,
      summoner2Id: s.summoner2Id,
      games: s.games,
      winRate: s.games > 0 ? round1((s.wins / s.games) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
    .slice(0, 5);

  const topItems = Array.from(itemMap.values())
    .map((item) => ({
      itemId: item.itemId,
      games: item.games,
      pickRate: scoredGames > 0 ? round1((item.games / denom) * 100) : 0,
      winRate: item.games > 0 ? round1((item.wins / item.games) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
    .slice(0, 8);

  const byPerfDesc = [...scoredSamples].sort(
    (a, b) =>
      b.participant.performanceScore - a.participant.performanceScore ||
      (b.participant.outcome === 'win' ? 1 : 0) - (a.participant.outcome === 'win' ? 1 : 0) ||
      getMatchTimestamp(b.match) - getMatchTimestamp(a.match)
  );

  const bestMatch = byPerfDesc[0] ?? null;
  const worstMatch = byPerfDesc.length >= 2 ? byPerfDesc[byPerfDesc.length - 1] : null;

  const canonicalSample = scoredSamples[0] ?? matchedSamples[0] ?? null;

  return {
    championId: canonicalSample?.participant.championId ?? 0,
    championName: canonicalSample?.participant.championName ?? championName.trim(),
    account,
    displayName,
    avatarUrl,
    scope,
    totalGames,
    scoredGames,
    wins,
    losses,
    ffs,
    remakes,
    winRate: scoredGames > 0 ? round1((wins / denom) * 100) : 0,
    ffRate: scoredGames > 0 ? round1((ffs / denom) * 100) : 0,
    avgPerformance: core.avgPerformance,
    avgPillars: core.avgPillars,
    avgKda: core.avgKda,
    avgKills: core.avgKills,
    avgDeaths: core.avgDeaths,
    avgAssists: core.avgAssists,
    avgKp: core.avgKp,
    avgCsPerMin: core.avgCsPerMin,
    avgCs: scoredGames > 0 ? round1(csSum / denom) : 0,
    avgDpm: core.avgDpm,
    avgDamage: scoredGames > 0 ? Math.round(dmgSum / denom) : 0,
    avgGpm: core.avgGpm,
    avgVisionPerMin: core.avgVisionPerMin,
    avgDamageTakenPerMin: scoredGames > 0 ? round1(dmgTakenPerMinSum / denom) : 0,
    avgDeadSeconds: scoredGames > 0 ? round1(deadSecondsSum / denom) : 0,
    avgDurationSeconds: scoredGames > 0 ? Math.round(durationSum / denom) : 0,
    mvpCount: core.mvpCount,
    aceCount: core.aceCount,
    roleDistribution,
    topRunes,
    topSpells,
    topItems,
    durationBuckets: computeDurationBuckets(bucketEntries),
    bestMatch,
    worstMatch,
    matches: matchedSamples,
  };
}
