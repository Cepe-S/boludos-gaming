import type {
  LolAccount,
  LolGroupPickBreakdown,
  LolGroupPickEntry,
  LolMatchParticipantSummary,
  LolMatchSummary,
  LolPerformanceLaneDiff,
  LolPerformancePillarScores,
  LolRoleKey,
  RiotMatchV5Participant,
} from '../../types/lol';
import { clamp, round1, round2, round3 } from './helpers';

export function buildDrivers(params: {
  p: RiotMatchV5Participant;
  pillars: LolPerformancePillarScores;
  weights: LolPerformancePillarScores;
  laneDiff: LolPerformanceLaneDiff;
  csPerMin: number;
  maxDamage: number;
  maxVision: number;
  role: LolRoleKey;
}): string[] {
  const { p, pillars, weights, laneDiff, csPerMin, maxDamage, maxVision, role } = params;
  const drivers: string[] = [];

  const pillarLabels: Array<{ key: keyof LolPerformancePillarScores; label: string }> = [
    { key: 'combat', label: `Combate (${p.kills}/${p.deaths}/${p.assists})` },
    { key: 'impact', label: 'Alto impacto en daño/peel' },
    { key: 'economy', label: role === 'UTILITY' || role === 'ARENA' ? 'Buena eficiencia de oro' : `Economía (${round1(csPerMin)} CS/m)` },
    { key: 'objectives', label: 'Presión en objetivos y torres' },
    { key: 'vision', label: 'Control de visión' },
    { key: 'dominance', label: 'Dominio general de partida' },
  ];

  const rankedPillars = pillarLabels
    .filter((item) => weights[item.key] > 0)
    .sort((a, b) => pillars[b.key] - pillars[a.key]);

  for (const item of rankedPillars.slice(0, 2)) {
    if (pillars[item.key] >= 65) {
      drivers.push(item.label);
    }
  }

  if ((p.totalDamageDealtToChampions ?? 0) === maxDamage && maxDamage > 0) {
    drivers.push('Top daño de la partida');
  }
  if (role !== 'ARAM' && role !== 'ARENA' && (p.visionScore ?? 0) === maxVision && maxVision > 0) {
    drivers.push('Top visión de la partida');
  }
  if (p.deaths === 0 && p.kills + p.assists >= 4) {
    drivers.push('Partida sin muertes');
  }
  if (laneDiff && laneDiff.goldDiff >= 1200) {
    drivers.push(`+${laneDiff.goldDiff} oro vs ${laneDiff.opponentChampionName}`);
  }
  if (drivers.length === 0 && rankedPillars.length > 0) {
    drivers.push(rankedPillars[0].label);
  }

  return drivers.slice(0, 4);
}

export function buildPickDrivers(params: {
  games: number;
  winRate: number;
  impactWinRate: number;
  wrDeltaVsGroup: number;
  wrDeltaVsPlayer: number;
  avgPerformance: number;
  groupBaselinePerf: number;
  teammatePerfDelta: number;
  impactVsTeamDelta: number;
  vsOpponentDelta: number;
  avgDifficulty: number;
  passengerWins: number;
  ffRate: number;
  ffs: number;
  enemyFfWins: number;
  avgMatchRank: number;
  consistency: number;
  mvpCount: number;
}): string[] {
  const {
    games,
    winRate,
    impactWinRate,
    wrDeltaVsGroup,
    wrDeltaVsPlayer,
    avgPerformance,
    groupBaselinePerf,
    teammatePerfDelta,
    impactVsTeamDelta,
    vsOpponentDelta,
    avgDifficulty,
    passengerWins,
    ffRate,
    ffs,
    enemyFfWins,
    avgMatchRank,
    consistency,
    mvpCount,
  } = params;

  const candidates: Array<{ label: string; strength: number }> = [];

  if (passengerWins >= 2 || (passengerWins >= 1 && passengerWins / Math.max(1, games) >= 0.34)) {
    candidates.push({
      label: `${passengerWins}W carreado`,
      strength: (passengerWins / Math.max(1, games)) * 46,
    });
  }

  if (impactVsTeamDelta >= 4.5) {
    candidates.push({
      label: `Carry +${impactVsTeamDelta.toFixed(1)} vs equipo`,
      strength: impactVsTeamDelta * 2.4,
    });
  } else if (impactVsTeamDelta <= -4.5) {
    candidates.push({
      label: `${impactVsTeamDelta.toFixed(1)} vs equipo`,
      strength: Math.abs(impactVsTeamDelta) * 2.4,
    });
  }

  if (vsOpponentDelta >= 5.0) {
    candidates.push({
      label: `+${vsOpponentDelta.toFixed(1)} vs rival`,
      strength: vsOpponentDelta * 2.1,
    });
  } else if (vsOpponentDelta <= -5.0) {
    candidates.push({
      label: `${vsOpponentDelta.toFixed(1)} vs rival`,
      strength: Math.abs(vsOpponentDelta) * 2.1,
    });
  }

  if (avgDifficulty >= 57 && avgPerformance >= groupBaselinePerf - 2) {
    candidates.push({
      label: `Rivales duros (${Math.round(avgDifficulty)})`,
      strength: (avgDifficulty - 50) * 2.1,
    });
  } else if (avgDifficulty <= 42 && avgPerformance < groupBaselinePerf) {
    candidates.push({
      label: `Partidas fáciles (${Math.round(avgDifficulty)})`,
      strength: (50 - avgDifficulty) * 1.7,
    });
  }

  if (wrDeltaVsGroup >= 8 && passengerWins === 0) {
    candidates.push({
      label: `+${Math.round(wrDeltaVsGroup)}% WR vs grupo`,
      strength: Math.abs(wrDeltaVsGroup) * 1.35,
    });
  } else if (wrDeltaVsGroup <= -8) {
    candidates.push({
      label: `${Math.round(wrDeltaVsGroup)}% WR vs grupo`,
      strength: Math.abs(wrDeltaVsGroup) * 1.35,
    });
  }

  if (ffRate >= 30) {
    candidates.push({
      label: `${Math.round(ffRate)}% FF`,
      strength: ffRate * 0.95,
    });
  } else if (ffs === 0 && games >= 3 && passengerWins === 0) {
    candidates.push({
      label: 'Sin FF',
      strength: 18 + Math.min(10, games),
    });
  }

  const enemyFfRate = games > 0 ? (enemyFfWins / games) * 100 : 0;
  if ((enemyFfWins >= 2 || (enemyFfWins >= 1 && enemyFfRate >= 25)) && passengerWins === 0) {
    candidates.push({
      label: `${enemyFfWins} Enemy FF`,
      strength: enemyFfRate * 0.7,
    });
  }

  if (teammatePerfDelta >= 2.0) {
    candidates.push({
      label: `Aliados +${teammatePerfDelta.toFixed(1)} Perf`,
      strength: teammatePerfDelta * 5.0,
    });
  } else if (teammatePerfDelta <= -2.0) {
    candidates.push({
      label: `Aliados ${teammatePerfDelta.toFixed(1)} Perf`,
      strength: Math.abs(teammatePerfDelta) * 5.0,
    });
  }

  if (wrDeltaVsPlayer >= 10 && passengerWins === 0) {
    candidates.push({
      label: `+${Math.round(wrDeltaVsPlayer)}% vs su pool`,
      strength: wrDeltaVsPlayer * 0.85,
    });
  } else if (wrDeltaVsPlayer <= -10) {
    candidates.push({
      label: `${Math.round(wrDeltaVsPlayer)}% vs su pool`,
      strength: Math.abs(wrDeltaVsPlayer) * 0.85,
    });
  }

  if (mvpCount >= 2 || (games > 0 && mvpCount / games >= 0.34)) {
    candidates.push({
      label: `${mvpCount} MVP`,
      strength: (mvpCount / Math.max(1, games)) * 42,
    });
  } else if (avgMatchRank > 0 && avgMatchRank <= 3.2) {
    candidates.push({
      label: `Rank #${avgMatchRank.toFixed(1)}`,
      strength: (5 - avgMatchRank) * 10,
    });
  } else if (avgMatchRank >= 7.0) {
    candidates.push({
      label: `Rank #${avgMatchRank.toFixed(1)}`,
      strength: (avgMatchRank - 5) * 10,
    });
  }

  if (consistency <= 62) {
    candidates.push({
      label: 'Volátil',
      strength: (72 - consistency) * 1.1,
    });
  } else if (consistency >= 84 && avgPerformance >= groupBaselinePerf) {
    candidates.push({
      label: 'Muy consistente',
      strength: 19,
    });
  }

  const perfDelta = avgPerformance - groupBaselinePerf;
  if (perfDelta >= 5) {
    candidates.push({
      label: `BG-PERF +${round1(perfDelta)}`,
      strength: perfDelta * 1.5,
    });
  } else if (perfDelta <= -5) {
    candidates.push({
      label: `BG-PERF ${round1(perfDelta)}`,
      strength: Math.abs(perfDelta) * 1.5,
    });
  }

  candidates.sort((a, b) => b.strength - a.strength);

  const selected: string[] = [];
  for (const c of candidates) {
    if (!selected.includes(c.label)) {
      selected.push(c.label);
    }
    if (selected.length >= 3) break;
  }

  if (selected.length < 2) {
    const wrFallback = `${Math.round(impactWinRate !== winRate ? impactWinRate : winRate)}% WR (${games}G)`;
    if (!selected.includes(wrFallback)) selected.push(wrFallback);
  }
  if (selected.length < 2) {
    const perfFallback = `BG-PERF ${avgPerformance.toFixed(1)}`;
    if (!selected.includes(perfFallback)) selected.push(perfFallback);
  }

  return selected.slice(0, 3);
}

export interface PickDraft {
  pickKey: string;
  account: LolAccount;
  displayName: string;
  avatarUrl: string;
  championId: number;
  championName: string;
  roleCounts: Map<LolRoleKey, number>;
  samples: Array<{ match: LolMatchSummary; participant: LolMatchParticipantSummary }>;
  games: number;
  wins: number;
  losses: number;
  ffs: number;
  enemyFfWins: number;
  perfSum: number;
  perfScores: number[];
  rankSum: number;
  rankCount: number;
  kdaSum: number;
  killsSum: number;
  deathsSum: number;
  assistsSum: number;
  csPerMinSum: number;
  dpmSum: number;
  kpSum: number;
  mvpCount: number;
  aceCount: number;
}

export interface PickAnalysisAccum {
  effectiveWinsSum: number;
  adjPerfSum: number;
  diffBonusSum: number;
  rawVsTeamDeltaSum: number;
  effectiveVsTeamDeltaSum: number;
  vsOpponentDeltaSum: number;
  difficultySum: number;
  gatedAllyDeltaSum: number;
  allyGamesCount: number;
  passengerWins: number;
  carryGames: number;
  top2RankCount: number;
  enemyFfEnablerSum: number;
}

export function scoreQualifiedPick(params: {
  draft: PickDraft;
  accum: PickAnalysisAccum;
  primaryRole: LolRoleKey;
  groupBaselineWr: number;
  groupBaselinePerf: number;
  groupBaselineFfRate: number;
  playerBaselineWr: number;
}): LolGroupPickEntry {
  const {
    draft: d,
    accum: {
      effectiveWinsSum,
      adjPerfSum,
      diffBonusSum,
      rawVsTeamDeltaSum,
      effectiveVsTeamDeltaSum,
      vsOpponentDeltaSum,
      difficultySum,
      gatedAllyDeltaSum,
      allyGamesCount,
      passengerWins,
      carryGames,
      top2RankCount,
      enemyFfEnablerSum,
    },
    primaryRole,
    groupBaselineWr,
    groupBaselinePerf,
    groupBaselineFfRate,
    playerBaselineWr,
  } = params;

  const K_WR = 4;
  const K_PERF = 3;
  const K_VOL = 4;
  const K_AUX = 3;
  const CLUTCH_PRIOR = 0.165;
  const KP_PRIOR = 0.55;

  const n = d.games;
  const winRateRaw = (d.wins / n) * 100;
  const winRate = round1(winRateRaw);
  const ffRateRaw = (d.ffs / n) * 100;
  const ffRate = round1(ffRateRaw);
  const avgPerfRaw = d.perfSum / n;
  const avgPerformance = round1(avgPerfRaw);
  const avgKpRaw = d.kpSum / n;

  const avgAdjPerfRaw = adjPerfSum / n;
  const avgDiffBonus = round1(diffBonusSum / n);
  const avgRawVsTeamDelta = rawVsTeamDeltaSum / n;
  const avgEffectiveVsTeamDelta = effectiveVsTeamDeltaSum / n;
  const impactVsTeamDelta = round1(avgEffectiveVsTeamDelta);
  const avgVsOpponentDelta = vsOpponentDeltaSum / n;
  const vsOpponentDelta = round1(avgVsOpponentDelta);
  const avgDifficultyRaw = difficultySum / n;
  const avgDifficulty = round1(avgDifficultyRaw);
  const carryRateRaw = carryGames / n;
  const carryRate = round1(carryRateRaw * 100);
  const passengerWinShare = passengerWins / n;

  // Pillar 1 (30%): Impact & Difficulty-Adjusted Win Effectiveness
  const bayesWinRateRaw = clamp(
    ((d.wins + K_WR * (groupBaselineWr / 100)) / (n + K_WR)) * 100,
    0,
    100
  );
  const bayesWinRate = round1(bayesWinRateRaw);

  const impactWinRateRaw = clamp((effectiveWinsSum / n) * 100, 0, 100);
  const impactWinRate = round1(impactWinRateRaw);
  const impactWinRateScoreRaw = clamp(
    ((effectiveWinsSum + K_WR * (groupBaselineWr / 100)) / (n + K_WR)) * 100,
    0,
    100
  );
  const winRateScore = clamp(
    bayesWinRateRaw * 0.35 + impactWinRateScoreRaw * 0.65,
    0,
    100
  );

  // Pillar 2 (28%): Difficulty-Adjusted Bayesian Performance (BG-PERF)
  const bayesAdjPerf =
    (n * avgAdjPerfRaw + K_PERF * groupBaselinePerf) / (n + K_PERF);
  const performanceScore = clamp(
    groupBaselinePerf + (bayesAdjPerf - groupBaselinePerf) * 1.15,
    0,
    100
  );

  // Pillar 3 (24%): Per-Match Relative Impact, Rival Duel & True Team Synergy
  const wrDeltaVsGroupRaw = winRateRaw - groupBaselineWr;
  const wrDeltaVsGroup = round1(wrDeltaVsGroupRaw);
  const wrDeltaVsPlayerRaw = winRateRaw - playerBaselineWr;
  const wrDeltaVsPlayer = round1(wrDeltaVsPlayerRaw);

  const volConf = n / (n + K_VOL);
  const auxConf = n / (n + K_AUX);

  const relativeImpactScore = clamp(
    50 +
      avgEffectiveVsTeamDelta * auxConf * 2.2 +
      (carryRateRaw - 0.20) * auxConf * 14,
    0,
    100
  );

  const rivalDuelScore = clamp(
    50 +
      avgVsOpponentDelta * auxConf * 2.1 +
      (avgDifficultyRaw - 50) * auxConf * 0.75,
    0,
    100
  );

  const rawAllyDelta =
    allyGamesCount > 0 ? gatedAllyDeltaSum / allyGamesCount : 0;
  const allyConf = allyGamesCount / (allyGamesCount + K_AUX);
  const teammatePerfDeltaRaw = rawAllyDelta * allyConf;
  const teammatePerfDelta = round1(teammatePerfDeltaRaw);
  const allySynergyScore = clamp(50 + teammatePerfDeltaRaw * 3.2, 0, 100);

  const avgMatchRankRaw = d.rankCount > 0 ? d.rankSum / d.rankCount : 5.5;
  const avgMatchRank = d.rankCount > 0 ? round1(avgMatchRankRaw) : 0;
  const rawRankScore = clamp(((10 - avgMatchRankRaw) / 9) * 100, 0, 100);
  const lobbyDominanceScore = 50 + (rawRankScore - 50) * auxConf;

  const effectiveWrDeltaVsGroup = impactWinRateRaw - groupBaselineWr;
  const wrGroupLiftScore = clamp(
    50 + effectiveWrDeltaVsGroup * volConf * 1.1,
    0,
    100
  );
  const wrPlayerLiftScore = clamp(
    50 + (impactWinRateRaw - playerBaselineWr) * volConf * 0.9,
    0,
    100
  );

  const teamImpactScore = clamp(
    relativeImpactScore * 0.26 +
      rivalDuelScore * 0.22 +
      allySynergyScore * 0.24 +
      lobbyDominanceScore * 0.12 +
      wrGroupLiftScore * 0.10 +
      wrPlayerLiftScore * 0.06,
    0,
    100
  );

  // Pillar 4 (10%): Consistency, Floor & Clutch
  const perfVariance =
    d.perfScores.reduce((acc, s) => acc + (s - avgPerfRaw) ** 2, 0) / n;
  const perfStdDev = Math.sqrt(Math.max(0, perfVariance));
  const consistency = round1(clamp(100 - perfStdDev * 2.2, 0, 100));

  const floorSignal = clamp(avgAdjPerfRaw - perfStdDev * 0.85, 0, 100);
  const floorPrior = clamp(groupBaselinePerf - 8, 25, 75);
  const reliabilityScore = clamp(
    (n * floorSignal + K_AUX * floorPrior) / (n + K_AUX),
    0,
    100
  );

  const rawClutch = (d.mvpCount + d.aceCount * 0.65 + top2RankCount * 0.20) / n;
  const bayesClutch = (n * rawClutch + K_AUX * CLUTCH_PRIOR) / (n + K_AUX);
  const clutchScore = clamp(50 + (bayesClutch - CLUTCH_PRIOR) * 125, 15, 100);

  const bayesKp = (n * avgKpRaw + K_AUX * KP_PRIOR) / (n + K_AUX);
  const kpScore = clamp(50 + (bayesKp - KP_PRIOR) * 140, 10, 100);

  const consistencyClutchScore = clamp(
    reliabilityScore * 0.45 + clutchScore * 0.35 + kpScore * 0.20,
    0,
    100
  );

  // Pillar 5 (8% + Guardrails): Mental / FF & Anti-Passenger Guardrail
  const ffVolConf = n / (n + K_AUX);
  const excessFf = Math.max(0, ffRateRaw - groupBaselineFfRate);
  const ownFfPenalty =
    ffRateRaw * 0.85 * ffVolConf + excessFf * 0.55 * ffVolConf;
  const cleanMentalBonus = d.ffs === 0 ? 8 * ffVolConf : 0;
  const effectiveEnemyFfRate = (enemyFfEnablerSum / n) * 100;
  const enemyFfBonus = Math.min(20, effectiveEnemyFfRate * 0.45 * ffVolConf);
  const mentalFfScore = clamp(
    72 + cleanMentalBonus + enemyFfBonus - ownFfPenalty,
    0,
    100
  );

  const highFfPenalty =
    ffRateRaw >= 40
      ? clamp((2.5 + ((ffRateRaw - 40) / 60) * 7.5) * ffVolConf, 0, 10)
      : 0;

  // Anti-passenger penalty specifically targets inflated-WR picks where the player won by getting carried
  const wrExcess = clamp((winRateRaw - 48) / 52, 0, 1);
  const teamLagPen =
    passengerWins > 0 || avgEffectiveVsTeamDelta <= -8.0
      ? Math.max(0, -avgEffectiveVsTeamDelta - 3.5) * 0.80 * wrExcess
      : 0;
  const passengerWinSharePen = passengerWinShare * 12.0 * wrExcess;
  const rankLagPen =
    winRateRaw >= 55 && avgMatchRankRaw >= 6.5
      ? (avgMatchRankRaw - 6.0) * 2.5 * wrExcess
      : 0;
  const passengerPenalty = clamp(
    (teamLagPen + passengerWinSharePen + rankLagPen) * (n / (n + 2)),
    0,
    14
  );

  const rawPickScore =
    winRateScore * 0.30 +
    performanceScore * 0.28 +
    teamImpactScore * 0.24 +
    consistencyClutchScore * 0.10 +
    mentalFfScore * 0.08 -
    highFfPenalty -
    passengerPenalty;

  const pickScore = round1(clamp(rawPickScore, 0, 100));

  const pickBreakdown: LolGroupPickBreakdown = {
    winRateScore: round1(winRateScore),
    impactWinRateScore: round1(impactWinRateScoreRaw),
    performanceScore: round1(performanceScore),
    teamImpactScore: round1(teamImpactScore),
    relativeImpactScore: round1(relativeImpactScore),
    rivalDuelScore: round1(rivalDuelScore),
    consistencyClutchScore: round1(consistencyClutchScore),
    mentalFfScore: round1(mentalFfScore),
    highFfPenalty: round1(highFfPenalty),
    passengerPenalty: round1(passengerPenalty),
    difficultyBonus: avgDiffBonus,
    wrDeltaVsPlayer,
  };

  const pickDrivers = buildPickDrivers({
    games: n,
    winRate,
    impactWinRate,
    wrDeltaVsGroup,
    wrDeltaVsPlayer,
    avgPerformance,
    groupBaselinePerf,
    teammatePerfDelta,
    impactVsTeamDelta,
    vsOpponentDelta,
    avgDifficulty,
    passengerWins,
    ffRate,
    ffs: d.ffs,
    enemyFfWins: d.enemyFfWins,
    avgMatchRank,
    consistency,
    mvpCount: d.mvpCount,
  });

  void avgRawVsTeamDelta;

  return {
    pickKey: d.pickKey,
    userId: d.account.userId,
    puuid: d.account.puuid,
    displayName: d.displayName,
    avatarUrl: d.avatarUrl,
    account: d.account,
    championId: d.championId,
    championName: d.championName,
    primaryRole,
    games: n,
    wins: d.wins,
    losses: d.losses,
    ffs: d.ffs,
    winRate,
    ffRate,
    bayesWinRate,
    impactWinRate,
    wrDeltaVsGroup,
    teammatePerfDelta,
    impactVsTeamDelta,
    vsOpponentDelta,
    avgDifficulty,
    carryRate,
    passengerWins,
    avgMatchRank,
    consistency,
    enemyFfWins: d.enemyFfWins,
    pickDrivers,
    pickBreakdown,
    avgPerformance,
    pickScore,
    avgKda: round2(d.kdaSum / n),
    avgKills: round1(d.killsSum / n),
    avgDeaths: round1(d.deathsSum / n),
    avgAssists: round1(d.assistsSum / n),
    avgCsPerMin: round2(d.csPerMinSum / n),
    avgDpm: round1(d.dpmSum / n),
    avgKp: round3(avgKpRaw),
    mvpCount: d.mvpCount,
    aceCount: d.aceCount,
  };
}
