import type {
  LolAccount,
  LolGroupRecordEntry,
  LolMatchParticipantSummary,
  LolMatchSummary,
  LolPerformanceGrade,
  LolQueueCategory,
  LolRecordEntry,
} from '../../types/lol';
import {
  buildPuuidToUserIdMap,
  filterMatchesByQueue,
  formatMatchDateLabel,
  formatSecondsCompact,
  getMatchTimestamp,
  groupAccountsByUser,
  isGroupMatch,
  round1,
} from './helpers';
import type { PlayerMatchSample } from './playerAggregates';

export function computeGroupRecords(params: {
  matches: LolMatchSummary[];
  accounts: LolAccount[];
  playerProfiles: Array<{ id: string; displayName: string; avatarUrl: string }>;
  queueFilter?: LolQueueCategory;
  scope?: 'group' | 'all';
}): LolGroupRecordEntry[] {
  const {
    matches,
    accounts,
    playerProfiles,
    queueFilter = 'all',
    scope = 'group',
  } = params;

  const groupMemberPuuids = new Set(accounts.map((a) => a.puuid));
  const puuidToUserId = buildPuuidToUserIdMap(accounts);
  const userGroups = groupAccountsByUser(accounts);
  const profileById = new Map(playerProfiles.map((p) => [p.id, p]));
  const filteredMatches = filterMatchesByQueue(matches, queueFilter);
  const scopedMatches =
    scope === 'group'
      ? filteredMatches.filter((m) => isGroupMatch(m, groupMemberPuuids, puuidToUserId))
      : filteredMatches;

  interface RecordCandidate {
    account: LolAccount;
    displayName: string;
    avatarUrl: string;
    games: number;
    wins: number;
    ffs: number;
    ffRate: number;
    killsTotal: number;
    deathsTotal: number;
    assistsTotal: number;
    maxKills: number;
    maxDeaths: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    avgKda: number;
    avgKp: number;
    avgDpm: number;
    avgCsPerMin: number;
    avgCs: number;
    avgVisionPerMin: number;
    avgDeadSeconds: number;
    deadTimePct: number;
    totalDeadSeconds: number;
    avgMiaPings: number;
    totalMiaPings: number;
  }

  const candidates: RecordCandidate[] = [];
  let bestSingle: {
    account: LolAccount;
    displayName: string;
    avatarUrl: string;
    score: number;
    grade: LolPerformanceGrade;
    championName: string;
    kills: number;
    deaths: number;
    assists: number;
    matchId: string;
    gamesCount: number;
  } | null = null;

  for (const { primaryAccount: account, puuids } of userGroups) {
    const profile = profileById.get(account.userId);
    const displayName = profile?.displayName ?? account.gameName;
    const avatarUrl = profile?.avatarUrl ?? '';

    const samples: PlayerMatchSample[] = [];
    for (const match of scopedMatches) {
      const p = match.participants.find((part) => puuids.has(part.puuid));
      if (!p || p.outcome === 'remake') continue;
      samples.push({ match, participant: p });
    }

    if (samples.length === 0) continue;

    let wins = 0;
    let ffs = 0;
    let killsTotal = 0;
    let deathsTotal = 0;
    let assistsTotal = 0;
    let maxKills = 0;
    let maxDeaths = 0;
    let kdaSum = 0;
    let kpSum = 0;
    let dpmSum = 0;
    let csMinSum = 0;
    let csSum = 0;
    let visMinSum = 0;
    let deadSecSum = 0;
    let durationSum = 0;
    let miaSum = 0;

    for (const { match, participant: p } of samples) {
      const mins = Math.max(1, match.gameDuration / 60);
      const deadSec = p.totalTimeSpentDead ?? p.rawParticipant?.totalTimeSpentDead ?? 0;
      const miaPings = p.enemyMissingPings ?? p.rawParticipant?.enemyMissingPings ?? 0;

      if (p.outcome === 'win') wins += 1;
      if (p.outcome === 'ff') ffs += 1;
      killsTotal += p.kills;
      deathsTotal += p.deaths;
      assistsTotal += p.assists;
      if (p.kills > maxKills) maxKills = p.kills;
      if (p.deaths > maxDeaths) maxDeaths = p.deaths;

      kdaSum += p.kda;
      kpSum += p.killParticipation;
      dpmSum += p.damageToChampions / mins;
      csMinSum += p.csPerMin;
      csSum += p.cs;
      visMinSum += p.visionScore / mins;
      deadSecSum += deadSec;
      durationSum += Math.max(1, match.gameDuration);
      miaSum += miaPings;

      if (!bestSingle || p.performanceScore > bestSingle.score) {
        bestSingle = {
          account,
          displayName,
          avatarUrl,
          score: p.performanceScore,
          grade: p.performanceGrade,
          championName: p.championName,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          matchId: match.matchId,
          gamesCount: samples.length,
        };
      }
    }

    const n = samples.length;
    candidates.push({
      account,
      displayName,
      avatarUrl,
      games: n,
      wins,
      ffs,
      ffRate: round1((ffs / n) * 100),
      killsTotal,
      deathsTotal,
      assistsTotal,
      maxKills,
      maxDeaths,
      avgKills: killsTotal / n,
      avgDeaths: deathsTotal / n,
      avgAssists: assistsTotal / n,
      avgKda: kdaSum / n,
      avgKp: kpSum / n,
      avgDpm: dpmSum / n,
      avgCsPerMin: csMinSum / n,
      avgCs: csSum / n,
      avgVisionPerMin: visMinSum / n,
      avgDeadSeconds: deadSecSum / n,
      deadTimePct: durationSum > 0 ? (deadSecSum / durationSum) * 100 : 0,
      totalDeadSeconds: deadSecSum,
      avgMiaPings: miaSum / n,
      totalMiaPings: miaSum,
    });
  }

  if (candidates.length === 0) return [];

  const pickBest = (
    cmp: (a: RecordCandidate, b: RecordCandidate) => number
  ): RecordCandidate => [...candidates].sort(cmp)[0];

  const records: LolGroupRecordEntry[] = [];

  // 1. Most time dead
  const deadWinner = pickBest((a, b) => b.avgDeadSeconds - a.avgDeadSeconds);
  if (deadWinner.totalDeadSeconds > 0) {
    records.push({
      id: 'most_time_dead',
      title: 'Más Tiempo Muerto',
      description: 'Mayor promedio de segundos mirando la pantalla gris por partida.',
      tone: 'bad',
      valueLabel: `${formatSecondsCompact(deadWinner.avgDeadSeconds)}/g`,
      subLabel: `${Math.round(deadWinner.deadTimePct)}% del game muerto · ${deadWinner.games}G`,
      userId: deadWinner.account.userId,
      displayName: deadWinner.displayName,
      avatarUrl: deadWinner.avatarUrl,
      gameName: deadWinner.account.gameName,
      gamesSample: deadWinner.games,
    });
  }

  // 2. Highest Kill Participation
  const kpWinner = pickBest((a, b) => b.avgKp - a.avgKp || b.games - a.games);
  records.push({
    id: 'highest_kp',
    title: 'Mayor KP%',
    description: 'Mayor porcentaje promedio de participación en las bajas del equipo.',
    tone: 'good',
    valueLabel: `${Math.round(kpWinner.avgKp * 100)}%`,
    subLabel: `Participación en ${kpWinner.games}G`,
    userId: kpWinner.account.userId,
    displayName: kpWinner.displayName,
    avatarUrl: kpWinner.avatarUrl,
    gameName: kpWinner.account.gameName,
    gamesSample: kpWinner.games,
  });

  // 3. Most kills per game
  const mostKillsWinner = pickBest(
    (a, b) => b.avgKills - a.avgKills || b.maxKills - a.maxKills
  );
  records.push({
    id: 'most_kills',
    title: 'Más Kills',
    description: 'Mayor promedio de asesinatos por partida.',
    tone: 'good',
    valueLabel: `${mostKillsWinner.avgKills.toFixed(1)}/g`,
    subLabel: `Pico ${mostKillsWinner.maxKills} · ${mostKillsWinner.killsTotal} en ${mostKillsWinner.games}G`,
    userId: mostKillsWinner.account.userId,
    displayName: mostKillsWinner.displayName,
    avatarUrl: mostKillsWinner.avatarUrl,
    gameName: mostKillsWinner.account.gameName,
    gamesSample: mostKillsWinner.games,
  });

  // 4. Least kills per game
  const leastKillsWinner = pickBest(
    (a, b) => a.avgKills - b.avgKills || b.games - a.games
  );
  records.push({
    id: 'least_kills',
    title: 'Menos Kills',
    description: 'Menor promedio de asesinatos por partida (pacifista del grupo).',
    tone: 'fun',
    valueLabel: `${leastKillsWinner.avgKills.toFixed(1)}/g`,
    subLabel: `${leastKillsWinner.killsTotal} kills en ${leastKillsWinner.games}G`,
    userId: leastKillsWinner.account.userId,
    displayName: leastKillsWinner.displayName,
    avatarUrl: leastKillsWinner.avatarUrl,
    gameName: leastKillsWinner.account.gameName,
    gamesSample: leastKillsWinner.games,
  });

  // 5. Best KDA
  const bestKdaWinner = pickBest((a, b) => b.avgKda - a.avgKda || b.games - a.games);
  records.push({
    id: 'best_kda',
    title: 'Mejor KDA',
    description: 'Mayor promedio de (Kills + Asistencias) / Muertes.',
    tone: 'good',
    valueLabel: bestKdaWinner.avgKda.toFixed(2),
    subLabel: `${bestKdaWinner.avgKills.toFixed(1)}/${bestKdaWinner.avgDeaths.toFixed(1)}/${bestKdaWinner.avgAssists.toFixed(1)} · ${bestKdaWinner.games}G`,
    userId: bestKdaWinner.account.userId,
    displayName: bestKdaWinner.displayName,
    avatarUrl: bestKdaWinner.avatarUrl,
    gameName: bestKdaWinner.account.gameName,
    gamesSample: bestKdaWinner.games,
  });

  // 6. Most deaths
  const mostDeathsWinner = pickBest(
    (a, b) => b.avgDeaths - a.avgDeaths || b.maxDeaths - a.maxDeaths
  );
  records.push({
    id: 'most_deaths',
    title: 'Más Muertes',
    description: 'Mayor promedio de muertes por partida.',
    tone: 'bad',
    valueLabel: `${mostDeathsWinner.avgDeaths.toFixed(1)}/g`,
    subLabel: `Pico ${mostDeathsWinner.maxDeaths} · ${mostDeathsWinner.deathsTotal} en ${mostDeathsWinner.games}G`,
    userId: mostDeathsWinner.account.userId,
    displayName: mostDeathsWinner.displayName,
    avatarUrl: mostDeathsWinner.avatarUrl,
    gameName: mostDeathsWinner.account.gameName,
    gamesSample: mostDeathsWinner.games,
  });

  // 7. Highest DPM
  const dpmWinner = pickBest((a, b) => b.avgDpm - a.avgDpm || b.games - a.games);
  records.push({
    id: 'highest_dpm',
    title: 'Mayor Daño (DPM)',
    description: 'Mayor daño promedio a campeones por minuto.',
    tone: 'good',
    valueLabel: `${Math.round(dpmWinner.avgDpm)}/m`,
    subLabel: `${dpmWinner.games}G analizadas`,
    userId: dpmWinner.account.userId,
    displayName: dpmWinner.displayName,
    avatarUrl: dpmWinner.avatarUrl,
    gameName: dpmWinner.account.gameName,
    gamesSample: dpmWinner.games,
  });

  // 8. Highest CS/min
  const csWinner = pickBest((a, b) => b.avgCsPerMin - a.avgCsPerMin || b.games - a.games);
  records.push({
    id: 'highest_cs_min',
    title: 'Rey del Farm',
    description: 'Mayor promedio de súbditos + monstruos por minuto (CS/m).',
    tone: 'good',
    valueLabel: `${csWinner.avgCsPerMin.toFixed(1)} CS/m`,
    subLabel: `${Math.round(csWinner.avgCs)} CS/g · ${csWinner.games}G`,
    userId: csWinner.account.userId,
    displayName: csWinner.displayName,
    avatarUrl: csWinner.avatarUrl,
    gameName: csWinner.account.gameName,
    gamesSample: csWinner.games,
  });

  // 9. Highest Vision/min
  const visionWinner = pickBest(
    (a, b) => b.avgVisionPerMin - a.avgVisionPerMin || b.games - a.games
  );
  records.push({
    id: 'highest_vision',
    title: 'Rey de la Visión',
    description: 'Mayor puntuación promedio de visión por minuto.',
    tone: 'good',
    valueLabel: `${visionWinner.avgVisionPerMin.toFixed(2)}/m`,
    subLabel: `Control de mapa · ${visionWinner.games}G`,
    userId: visionWinner.account.userId,
    displayName: visionWinner.displayName,
    avatarUrl: visionWinner.avatarUrl,
    gameName: visionWinner.account.gameName,
    gamesSample: visionWinner.games,
  });

  // 10. Highest FF rate (only if at least 1 FF occurred)
  const ffWinner = pickBest((a, b) => b.ffRate - a.ffRate || b.ffs - a.ffs);
  if (ffWinner.ffs > 0) {
    records.push({
      id: 'highest_ff_rate',
      title: 'Rey del FF',
      description: 'Mayor porcentaje de partidas terminadas por rendición propia.',
      tone: 'ff',
      valueLabel: `${ffWinner.ffRate}%`,
      subLabel: `${ffWinner.ffs} FF en ${ffWinner.games}G`,
      userId: ffWinner.account.userId,
      displayName: ffWinner.displayName,
      avatarUrl: ffWinner.avatarUrl,
      gameName: ffWinner.account.gameName,
      gamesSample: ffWinner.games,
    });
  }

  // 11. Most MIA (?) pings
  const miaWinner = pickBest((a, b) => b.avgMiaPings - a.avgMiaPings || b.totalMiaPings - a.totalMiaPings);
  if (miaWinner.totalMiaPings > 0) {
    records.push({
      id: 'most_mia_pings',
      title: 'Rey del Ping ?',
      description: 'Quien más veces pingueó "¿Falta enemigo?" por partida.',
      tone: 'fun',
      valueLabel: `${miaWinner.avgMiaPings.toFixed(1)}/g`,
      subLabel: `${miaWinner.totalMiaPings} pings · ${miaWinner.games}G`,
      userId: miaWinner.account.userId,
      displayName: miaWinner.displayName,
      avatarUrl: miaWinner.avatarUrl,
      gameName: miaWinner.account.gameName,
      gamesSample: miaWinner.games,
    });
  }

  // 12. Best single game
  if (bestSingle) {
    records.push({
      id: 'best_single_game',
      title: 'Mejor Partida',
      description: 'Mayor puntaje BG-PERF individual en una sola partida.',
      tone: 'good',
      valueLabel: `${bestSingle.score.toFixed(1)} ${bestSingle.grade}`,
      subLabel: `${bestSingle.championName} · ${bestSingle.kills}/${bestSingle.deaths}/${bestSingle.assists}`,
      userId: bestSingle.account.userId,
      displayName: bestSingle.displayName,
      avatarUrl: bestSingle.avatarUrl,
      gameName: bestSingle.account.gameName,
      gamesSample: bestSingle.gamesCount,
      championName: bestSingle.championName,
      matchId: bestSingle.matchId,
    });
  }

  return records;
}


export function pickBestSample<T>(items: T[], cmp: (a: T, b: T) => number): T {
  let best = items[0];
  for (let i = 1; i < items.length; i++) {
    if (cmp(items[i], best) > 0) {
      best = items[i];
    }
  }
  return best;
}

export function computePersonalRecords(params: {
  matches: LolMatchSummary[];
  account: LolAccount;
  puuids?: ReadonlySet<string>;
  displayName: string;
  avatarUrl: string;
  queueFilter?: LolQueueCategory;
}): LolRecordEntry[] {
  const { matches, account, puuids, displayName, avatarUrl, queueFilter = 'all' } = params;
  const targetPuuids = puuids && puuids.size > 0 ? puuids : new Set([account.puuid]);
  const filteredMatches = filterMatchesByQueue(matches, queueFilter);

  interface EnrichedPersonalSample {
    match: LolMatchSummary;
    p: LolMatchParticipantSummary;
    dpm: number;
    visionPerMin: number;
    deadSeconds: number;
    miaPings: number;
    ts: number;
    dateLabel: string | undefined;
  }

  const samples: EnrichedPersonalSample[] = [];
  for (const match of filteredMatches) {
    const p = match.participants.find((part) => targetPuuids.has(part.puuid));
    if (!p || p.outcome === 'remake') continue;

    const mins = Math.max(1, match.gameDuration / 60);
    samples.push({
      match,
      p,
      dpm: p.damageToChampions / mins,
      visionPerMin: p.visionScore / mins,
      deadSeconds: p.totalTimeSpentDead ?? p.rawParticipant?.totalTimeSpentDead ?? 0,
      miaPings: p.enemyMissingPings ?? p.rawParticipant?.enemyMissingPings ?? 0,
      ts: getMatchTimestamp(match),
      dateLabel: formatMatchDateLabel(match),
    });
  }

  if (samples.length === 0) return [];

  const gamesSample = samples.length;
  const baseIdentity = {
    userId: account.userId,
    displayName,
    avatarUrl,
    gameName: account.gameName,
    gamesSample,
  };

  const singleMeta = (s: EnrichedPersonalSample) => ({
    championName: s.p.championName,
    matchId: s.match.matchId,
    dateLabel: s.dateLabel,
  });

  const records: LolRecordEntry[] = [];

  // 1. best_single_game
  const bestPerf = pickBestSample(
    samples,
    (a, b) => a.p.performanceScore - b.p.performanceScore || a.p.kda - b.p.kda || a.ts - b.ts
  );
  records.push({
    id: 'best_single_game',
    title: 'Mejor Partida',
    description: 'Mayor puntaje BG-PERF individual en una sola partida.',
    tone: 'good',
    valueLabel: `${bestPerf.p.performanceScore.toFixed(1)} ${bestPerf.p.performanceGrade}`,
    subLabel: `${bestPerf.p.championName} · ${bestPerf.p.kills}/${bestPerf.p.deaths}/${bestPerf.p.assists}`,
    ...baseIdentity,
    ...singleMeta(bestPerf),
  });

  // 2. most_kills
  const mostKills = pickBestSample(
    samples,
    (a, b) => a.p.kills - b.p.kills || a.p.performanceScore - b.p.performanceScore || a.ts - b.ts
  );
  records.push({
    id: 'most_kills',
    title: 'Récord de Kills',
    description: 'Mayor cantidad de asesinatos en una sola partida.',
    tone: 'good',
    valueLabel: `${mostKills.p.kills} kills`,
    subLabel: `${mostKills.p.championName} · ${mostKills.p.kills}/${mostKills.p.deaths}/${mostKills.p.assists}`,
    ...baseIdentity,
    ...singleMeta(mostKills),
  });

  // 3. best_kda
  const bestKda = pickBestSample(
    samples,
    (a, b) =>
      a.p.kda - b.p.kda ||
      a.p.kills + a.p.assists - (b.p.kills + b.p.assists) ||
      a.p.performanceScore - b.p.performanceScore
  );
  records.push({
    id: 'best_kda',
    title: 'Mejor KDA',
    description: 'Mayor KDA alcanzado en una sola partida.',
    tone: 'good',
    valueLabel: bestKda.p.kda.toFixed(2),
    subLabel: `${bestKda.p.championName} · ${bestKda.p.kills}/${bestKda.p.deaths}/${bestKda.p.assists}`,
    ...baseIdentity,
    ...singleMeta(bestKda),
  });

  // 4. highest_kp
  const bestKp = pickBestSample(
    samples,
    (a, b) =>
      a.p.killParticipation - b.p.killParticipation ||
      a.p.kills + a.p.assists - (b.p.kills + b.p.assists) ||
      a.p.performanceScore - b.p.performanceScore
  );
  records.push({
    id: 'highest_kp',
    title: 'Mayor KP%',
    description: 'Mayor participación en las bajas del equipo en una partida.',
    tone: 'good',
    valueLabel: `${Math.round(bestKp.p.killParticipation * 100)}%`,
    subLabel: `${bestKp.p.championName} · ${bestKp.p.kills}/${bestKp.p.deaths}/${bestKp.p.assists}`,
    ...baseIdentity,
    ...singleMeta(bestKp),
  });

  // 5. highest_dpm
  const bestDpm = pickBestSample(
    samples,
    (a, b) =>
      a.dpm - b.dpm ||
      a.p.damageToChampions - b.p.damageToChampions ||
      a.p.performanceScore - b.p.performanceScore
  );
  records.push({
    id: 'highest_dpm',
    title: 'Récord de Daño',
    description: 'Mayor daño a campeones por minuto (DPM) en una partida.',
    tone: 'good',
    valueLabel: `${Math.round(bestDpm.dpm)}/m`,
    subLabel: `${bestDpm.p.championName} · ${round1(bestDpm.p.damageToChampions / 1000)}k dmg`,
    ...baseIdentity,
    ...singleMeta(bestDpm),
  });

  // 6. highest_cs_min
  const bestCs = pickBestSample(
    samples,
    (a, b) => a.p.csPerMin - b.p.csPerMin || a.p.cs - b.p.cs || a.ts - b.ts
  );
  records.push({
    id: 'highest_cs_min',
    title: 'Récord de Farm',
    description: 'Mayor promedio de súbditos por minuto (CS/m) en una partida.',
    tone: 'good',
    valueLabel: `${bestCs.p.csPerMin.toFixed(1)} CS/m`,
    subLabel: `${bestCs.p.championName} · ${bestCs.p.cs} CS`,
    ...baseIdentity,
    ...singleMeta(bestCs),
  });

  // 7. highest_vision
  const bestVision = pickBestSample(
    samples,
    (a, b) =>
      a.visionPerMin - b.visionPerMin || a.p.visionScore - b.p.visionScore || a.ts - b.ts
  );
  records.push({
    id: 'highest_vision',
    title: 'Récord de Visión',
    description: 'Mayor puntuación de visión por minuto en una partida.',
    tone: 'good',
    valueLabel: `${bestVision.visionPerMin.toFixed(2)}/m`,
    subLabel: `${bestVision.p.championName} · ${bestVision.p.visionScore} vis`,
    ...baseIdentity,
    ...singleMeta(bestVision),
  });

  // 8. best_win_streak (chronological order)
  const chronological = [...samples].sort((a, b) => a.ts - b.ts);
  let curWin = 0;
  let bestWin = 0;
  let curLoss = 0;
  let worstLoss = 0;
  for (const s of chronological) {
    if (s.p.outcome === 'win') {
      curWin += 1;
      curLoss = 0;
      if (curWin > bestWin) bestWin = curWin;
    } else {
      curLoss += 1;
      curWin = 0;
      if (curLoss > worstLoss) worstLoss = curLoss;
    }
  }
  records.push({
    id: 'best_win_streak',
    title: 'Mejor Racha',
    description: 'Mayor racha consecutiva de victorias en orden cronológico.',
    tone: 'good',
    valueLabel: `${bestWin}V`,
    subLabel: `Peor racha: ${worstLoss}D · ${gamesSample}G`,
    ...baseIdentity,
  });

  // 9. most_deaths
  const mostDeaths = pickBestSample(
    samples,
    (a, b) =>
      a.p.deaths - b.p.deaths ||
      a.deadSeconds - b.deadSeconds ||
      b.p.performanceScore - a.p.performanceScore
  );
  records.push({
    id: 'most_deaths',
    title: 'Más Muertes',
    description: 'Mayor cantidad de muertes en una sola partida.',
    tone: 'bad',
    valueLabel: `${mostDeaths.p.deaths} muertes`,
    subLabel: `${mostDeaths.p.championName} · ${mostDeaths.p.kills}/${mostDeaths.p.deaths}/${mostDeaths.p.assists}`,
    ...baseIdentity,
    ...singleMeta(mostDeaths),
  });

  // 10. most_time_dead (only if > 0)
  const mostDead = pickBestSample(
    samples,
    (a, b) => a.deadSeconds - b.deadSeconds || a.p.deaths - b.p.deaths || a.ts - b.ts
  );
  if (mostDead.deadSeconds > 0) {
    records.push({
      id: 'most_time_dead',
      title: 'Más Tiempo Muerto',
      description: 'Mayor tiempo mirando la pantalla gris en una sola partida.',
      tone: 'bad',
      valueLabel: formatSecondsCompact(mostDead.deadSeconds),
      subLabel: `${mostDead.p.championName} · ${mostDead.p.deaths} muertes`,
      ...baseIdentity,
      ...singleMeta(mostDead),
    });
  }

  // 11. most_mia_pings (or fallback most_assists if 0)
  const mostMia = pickBestSample(
    samples,
    (a, b) => a.miaPings - b.miaPings || a.p.performanceScore - b.p.performanceScore
  );
  if (mostMia.miaPings > 0) {
    records.push({
      id: 'most_mia_pings',
      title: 'Más Pings ?',
      description: 'Mayor cantidad de pings "¿Falta enemigo?" en una partida.',
      tone: 'fun',
      valueLabel: `${mostMia.miaPings} pings`,
      subLabel: `${mostMia.p.championName} · ${mostMia.p.kills}/${mostMia.p.deaths}/${mostMia.p.assists}`,
      ...baseIdentity,
      ...singleMeta(mostMia),
    });
  } else {
    const mostAssists = pickBestSample(
      samples,
      (a, b) => a.p.assists - b.p.assists || a.p.kda - b.p.kda || a.ts - b.ts
    );
    records.push({
      id: 'most_assists',
      title: 'Récord de Asistencias',
      description: 'Mayor cantidad de asistencias en una sola partida.',
      tone: 'good',
      valueLabel: `${mostAssists.p.assists} asist.`,
      subLabel: `${mostAssists.p.championName} · ${mostAssists.p.kills}/${mostAssists.p.deaths}/${mostAssists.p.assists}`,
      ...baseIdentity,
      ...singleMeta(mostAssists),
    });
  }

  // 12. fastest_ff (or fallback longest_game if 0 FFs)
  const ffSamples = samples.filter((s) => s.p.outcome === 'ff');
  if (ffSamples.length > 0) {
    const fastestFf = pickBestSample(
      ffSamples,
      (a, b) => b.match.gameDuration - a.match.gameDuration || a.ts - b.ts
    );
    records.push({
      id: 'fastest_ff',
      title: 'FF Más Rápido',
      description: 'Rendición propia más temprana registrada.',
      tone: 'ff',
      valueLabel: formatSecondsCompact(fastestFf.match.gameDuration),
      subLabel: `${fastestFf.p.championName} · ${fastestFf.p.kills}/${fastestFf.p.deaths}/${fastestFf.p.assists}`,
      ...baseIdentity,
      ...singleMeta(fastestFf),
    });
  } else {
    const longest = pickBestSample(
      samples,
      (a, b) => a.match.gameDuration - b.match.gameDuration || a.ts - b.ts
    );
    records.push({
      id: 'longest_game',
      title: 'Partida Más Larga',
      description: 'Partida de mayor duración registrada.',
      tone: 'fun',
      valueLabel: formatSecondsCompact(longest.match.gameDuration),
      subLabel: `${longest.p.championName} · ${longest.p.outcome === 'win' ? 'Victoria' : 'Derrota'}`,
      ...baseIdentity,
      ...singleMeta(longest),
    });
  }

  return records;
}
