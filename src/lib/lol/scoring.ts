import type {
  LolMatchOutcome,
  LolMatchParticipantSummary,
  LolMatchSummary,
  LolMatchTeamSummary,
  LolPerformanceBreakdown,
  LolPerformanceGrade,
  LolPerformanceLaneDiff,
  LolPerformancePillarScores,
  LolPlatform,
  LolRegionalCluster,
  LolRoleKey,
  RiotMatchV5,
  RiotMatchV5Participant,
} from '../../types/lol';
import { PLATFORM_TO_CLUSTER, RIFT_ROLES, ROLE_WEIGHT_MATRIX } from './constants';
import {
  clamp,
  classifyMatchOutcome,
  getGradeFromScore,
  getQueueCategory,
  normalizeRiftRoleToken,
  resolveParticipantRole,
  round1,
  round2,
  round3,
} from './helpers';
import { buildDrivers } from './groupPicksDrivers';

/**
 * Smooth monotonic calibration curve:
 *  - value = 0        -> 0
 *  - value = avgRef   -> 60
 *  - value = eliteRef -> 90
 *  - value -> +inf    -> approaches 100 asymptotically
 */
export function normCurve(value: number, avgRef: number, eliteRef: number): number {
  const safeVal = Math.max(0, Number.isFinite(value) ? value : 0);
  const safeAvg = Math.max(0.0001, avgRef);
  const safeElite = Math.max(safeAvg + 0.0001, eliteRef);

  if (safeVal <= safeAvg) {
    return clamp(60 * (safeVal / safeAvg), 0, 60);
  }

  const halfStep = (safeElite - safeAvg) / 2;
  const excess = safeVal - safeAvg;
  const tail = 40 * (1 - Math.pow(0.5, excess / halfStep));
  return clamp(60 + tail, 60, 100);
}

export function safePlatformToCluster(platformId: string): LolRegionalCluster {
  const normalized = platformId.toLowerCase().trim() as LolPlatform;
  return PLATFORM_TO_CLUSTER[normalized] ?? 'americas';
}

export interface TeamTotals {
  kills: number;
  damageToChampions: number;
  damageTaken: number;
  gold: number;
}

export interface ParticipantContext {
  participant: RiotMatchV5Participant;
  role: LolRoleKey;
  normalizedTeamPos: LolRoleKey | null;
  outcome: LolMatchOutcome;
  enemySurrendered: boolean;
  kda: number;
  rawKda: number;
  kp: number;
  cs: number;
  csPerMin: number;
  dpm: number;
  gpm: number;
  visionPerMin: number;
  rawCompositeIndex: number;
}

export function computeCombatPillar(
  p: RiotMatchV5Participant,
  role: LolRoleKey,
  mins: number,
  durationSeconds: number,
  rawKda: number,
  kp: number
): number {
  const ch = p.challenges;
  const kdaAvg = role === 'ARAM' ? 3.2 : 2.5;
  const kdaElite = role === 'ARAM' ? 6.5 : 5.5;
  const kdaScore = normCurve(rawKda, kdaAvg, kdaElite);

  const kpAvg = role === 'ARAM' ? 0.68 : role === 'JUNGLE' || role === 'UTILITY' ? 0.58 : 0.48;
  const kpElite = role === 'ARAM' ? 0.85 : 0.76;
  const kpScore = normCurve(kp, kpAvg, kpElite);

  const soloKills = ch?.soloKills ?? 0;
  const multikillBonus = clamp(
    (p.doubleKills ?? 0) * 1.5 +
      (p.tripleKills ?? 0) * 3.5 +
      (p.quadraKills ?? 0) * 6 +
      (p.pentaKills ?? 0) * 9,
    0,
    10
  );
  const soloKillBonus = clamp(soloKills * 2, 0, 6);
  const firstBloodBonus = p.firstBloodKill ? 3 : p.firstBloodAssist ? 1.5 : 0;
  const spree = p.largestKillingSpree ?? 0;
  const spreeBonus = spree >= 3 ? clamp((spree - 2) * 1.0, 0, 4) : 0;
  const zeroDeathBonus =
    p.deaths === 0
      ? p.kills + p.assists >= 5
        ? 6
        : p.kills + p.assists >= 1
          ? 3
          : 0
      : 0;

  const playmakingBonus = clamp(
    multikillBonus + soloKillBonus + firstBloodBonus + spreeBonus + zeroDeathBonus,
    0,
    20
  );

  const deathsPerMin = (p.deaths ?? 0) / mins;
  const deadTimeRatio = (p.totalTimeSpentDead ?? 0) / Math.max(1, durationSeconds);
  const deathRatePenalty = Math.max(0, (deathsPerMin - (role === 'ARAM' ? 0.35 : 0.18)) * 32);
  const deadTimePenalty = Math.max(0, (deadTimeRatio - 0.1) * 45);
  const deathPenalty = clamp(deathRatePenalty + deadTimePenalty, 0, 26);

  return round1(clamp(kdaScore * 0.55 + kpScore * 0.40 + playmakingBonus * 0.85 - deathPenalty, 0, 100));
}

export function computeImpactPillar(
  p: RiotMatchV5Participant,
  role: LolRoleKey,
  mins: number,
  teamTotals: TeamTotals
): number {
  const ch = p.challenges;
  const dmg = p.totalDamageDealtToChampions ?? 0;
  const gold = Math.max(1, p.goldEarned ?? 1);
  const dpm = ch?.damagePerMinute ?? dmg / mins;

  let dpmAvg = 560;
  let dpmElite = 960;
  if (role === 'BOTTOM') {
    dpmAvg = 620;
    dpmElite = 1050;
  } else if (role === 'MIDDLE') {
    dpmAvg = 600;
    dpmElite = 1000;
  } else if (role === 'TOP') {
    dpmAvg = 520;
    dpmElite = 900;
  } else if (role === 'JUNGLE') {
    dpmAvg = 460;
    dpmElite = 820;
  } else if (role === 'UTILITY') {
    dpmAvg = 260;
    dpmElite = 520;
  } else if (role === 'ARAM') {
    dpmAvg = 1150;
    dpmElite = 1950;
  } else if (role === 'ARENA') {
    dpmAvg = 950;
    dpmElite = 1700;
  }

  const teamDmgPct =
    ch?.teamDamagePercentage ?? (teamTotals.damageToChampions > 0 ? dmg / teamTotals.damageToChampions : 0);
  const shareAvg =
    role === 'UTILITY' ? 0.12 : role === 'ARAM' ? 0.22 : role === 'ARENA' ? 0.50 : 0.22;
  const dmgPerGold = dmg / gold;

  const dpmScore = normCurve(dpm, dpmAvg, dpmElite);
  const dmgShareScore = normCurve(teamDmgPct, shareAvg, shareAvg * 1.55);
  const dpgScore = normCurve(dmgPerGold, role === 'UTILITY' ? 0.95 : 1.45, role === 'UTILITY' ? 1.65 : 2.35);
  const damageSubScore = dpmScore * 0.48 + dmgShareScore * 0.34 + dpgScore * 0.18;

  const mitigatedPerMin = ((p.totalDamageTaken ?? 0) + (p.damageSelfMitigated ?? 0) * 0.65) / mins;
  const dmgTakenPct =
    ch?.damageTakenOnTeamPercentage ??
    (teamTotals.damageTaken > 0 ? (p.totalDamageTaken ?? 0) / teamTotals.damageTaken : 0);
  const frontlineScore =
    normCurve(mitigatedPerMin, role === 'ARAM' ? 1600 : 1050, role === 'ARAM' ? 3000 : 2100) * 0.65 +
    normCurve(dmgTakenPct, role === 'ARENA' ? 0.50 : 0.22, role === 'ARENA' ? 0.72 : 0.36) * 0.35;

  const rawAllyHealShield = (p.totalHealsOnTeammates ?? 0) + (p.totalDamageShieldedOnTeammates ?? 0);
  const effectiveAllyUtility = Math.max(rawAllyHealShield, ch?.effectiveHealAndShielding ?? 0);
  const healShieldPerMin = effectiveAllyUtility / mins;
  const ccPerMin = (p.timeCCingOthers ?? 0) / mins;
  const peelBonus = clamp(
    (ch?.saveAllyFromDeath ?? 0) * 6 + (ch?.immobilizeAndKillWithAlly ?? 0) * 1.5,
    0,
    18
  );
  const utilitySubScore = clamp(
    normCurve(healShieldPerMin, 150, 480) * 0.50 + normCurve(ccPerMin, 1.0, 2.4) * 0.50 + peelBonus,
    0,
    100
  );

  const secondaryImpact =
    0.65 * Math.max(frontlineScore, utilitySubScore) +
    0.35 * Math.min(frontlineScore, utilitySubScore);

  let combined: number;
  if (role === 'UTILITY') {
    combined = Math.max(
      utilitySubScore * 0.62 + damageSubScore * 0.23 + frontlineScore * 0.15,
      damageSubScore * 0.55 + utilitySubScore * 0.45
    );
  } else if (role === 'TOP' || role === 'JUNGLE') {
    combined = Math.max(
      damageSubScore * 0.72 + secondaryImpact * 0.28,
      frontlineScore * 0.55 + damageSubScore * 0.30 + utilitySubScore * 0.15
    );
  } else {
    combined = Math.max(
      damageSubScore * 0.85 + secondaryImpact * 0.15,
      damageSubScore * 0.70 + utilitySubScore * 0.30
    );
  }

  return round1(clamp(combined, 0, 100));
}

export function computeEconomyPillar(
  p: RiotMatchV5Participant,
  role: LolRoleKey,
  mins: number,
  csPerMin: number,
  gpm: number,
  teamTotals: TeamTotals
): number {
  const ch = p.challenges;
  const goldEarned = Math.max(0, p.goldEarned ?? 0);
  const goldShare =
    teamTotals.gold > 0 ? goldEarned / teamTotals.gold : role === 'ARENA' ? 0.5 : 0.2;
  const spendEfficiency =
    goldEarned > 0 ? clamp((p.goldSpent ?? goldEarned * 0.9) / goldEarned, 0, 1) : 0;

  let earlyBonus = 0;
  if (role === 'JUNGLE') {
    earlyBonus = clamp(
      (ch?.scuttleCrabKills ?? 0) * 1.4 +
        (ch?.junglerKillsEarlyJungle ?? 0) * 2.5 +
        clamp(ch?.maxCSAdvantageOnLaneOpponent ?? 0, 0, 40) * 0.1 +
        clamp(ch?.maxLevelLeadLaneOpponent ?? 0, 0, 4) * 1.0,
      0,
      12
    );
  } else if (role !== 'ARAM' && role !== 'ARENA') {
    const lane10 = ch?.laneMinionsFirst10Minutes ?? 0;
    const lane10Bonus = lane10 >= 55 ? clamp((lane10 - 50) * 0.15, 0, 4.5) : 0;
    const csAdvBonus = clamp((ch?.maxCSAdvantageOnLaneOpponent ?? 0) * 0.12, 0, 3.5);
    const lvlLeadBonus = clamp((ch?.maxLevelLeadLaneOpponent ?? 0) * 1.2, 0, 3.0);
    const earlyGoldLead = clamp((ch?.laningPhaseGoldAdvantagePerXMinutes ?? 0) * 0.01, 0, 3.0);
    const plateBonus = clamp((ch?.turretPlatesTaken ?? 0) * 1.2, 0, 4.0);
    earlyBonus = clamp(lane10Bonus + csAdvBonus + lvlLeadBonus + earlyGoldLead + plateBonus, 0, 12);
  }

  if (role === 'UTILITY' || role === 'ARENA') {
    const gpmScore = normCurve(gpm, role === 'ARENA' ? 500 : 300, role === 'ARENA' ? 750 : 430);
    const shareScore = normCurve(goldShare, role === 'ARENA' ? 0.48 : 0.14, role === 'ARENA' ? 0.62 : 0.19);
    const spendScore = normCurve(spendEfficiency, 0.85, 0.97);
    return round1(clamp(gpmScore * 0.56 + shareScore * 0.24 + spendScore * 0.20 + earlyBonus * 0.6, 0, 100));
  }

  let csAvg = 6.2;
  let csElite = 8.0;
  let gpmAvg = 410;
  let gpmElite = 560;
  if (role === 'BOTTOM') {
    csAvg = 6.6;
    csElite = 8.5;
    gpmAvg = 430;
    gpmElite = 580;
  } else if (role === 'JUNGLE') {
    csAvg = 5.0;
    csElite = 6.5;
    gpmAvg = 400;
    gpmElite = 540;
  } else if (role === 'ARAM') {
    csAvg = 3.5;
    csElite = 6.0;
    gpmAvg = 620;
    gpmElite = 850;
  }

  const csScore = normCurve(csPerMin, csAvg, csElite);
  const gpmScore = normCurve(gpm, gpmAvg, gpmElite);
  const shareScore = normCurve(goldShare, 0.20, 0.27);
  const spendScore = normCurve(spendEfficiency, 0.85, 0.97);

  return round1(
    clamp(
      csScore * 0.40 + gpmScore * 0.34 + shareScore * 0.14 + spendScore * 0.12 + earlyBonus,
      0,
      100
    )
  );
}

export function computeObjectivesPillar(
  p: RiotMatchV5Participant,
  role: LolRoleKey,
  mins: number
): number {
  if (role === 'ARENA') return 0;

  const ch = p.challenges;
  const turretDmgPerMin = (p.damageDealtToTurrets ?? 0) / mins;
  const objDmgPerMin = (p.damageDealtToObjectives ?? 0) / mins;
  const turretTakedowns = p.turretTakedowns ?? ch?.turretTakedowns ?? p.turretKills ?? 0;
  const inhibTakedowns = p.inhibitorTakedowns ?? p.inhibitorKills ?? 0;
  const firstTowerBonus = p.firstTowerKill ? 6 : p.firstTowerAssist ? 3 : 0;

  if (role === 'ARAM') {
    const turretDmgScore = normCurve(turretDmgPerMin, 140, 340);
    const turretTakedownScore = normCurve(turretTakedowns, 2, 4);
    const inhibScore = normCurve(inhibTakedowns, 0.8, 2);
    return round1(
      clamp(turretDmgScore * 0.45 + turretTakedownScore * 0.35 + inhibScore * 0.20 + firstTowerBonus, 0, 100)
    );
  }

  const dragonTakedowns = ch?.dragonTakedowns ?? p.dragonKills ?? 0;
  const baronTakedowns = ch?.baronTakedowns ?? p.baronKills ?? 0;
  const heraldTakedowns = ch?.riftHeraldTakedowns ?? 0;
  const voidKills = ch?.voidMonsterKills ?? 0;
  const epicTakedowns =
    dragonTakedowns + baronTakedowns * 1.5 + heraldTakedowns + voidKills * 0.4;

  const steals =
    (p.objectivesStolen ?? ch?.objectivesStolen ?? 0) +
    0.5 * (p.objectivesStolenAssists ?? ch?.objectivesStolenAssists ?? 0);
  const stealBonus = clamp(steals * 10, 0, 15);

  const turretTarget = role === 'BOTTOM' || role === 'TOP' ? 140 : role === 'JUNGLE' ? 75 : 110;
  const objTarget = role === 'JUNGLE' ? 420 : 180;
  const epicTarget = role === 'JUNGLE' ? 3.4 : 1.8;

  const turretDmgScore = normCurve(turretDmgPerMin, turretTarget, turretTarget * 2.1);
  const objDmgScore = normCurve(objDmgPerMin, objTarget, objTarget * 2.0);
  const structureCountScore = normCurve(turretTakedowns + inhibTakedowns * 1.5, 2.2, 5.0);
  const epicScore = normCurve(epicTakedowns, epicTarget, epicTarget * 1.9);

  if (role === 'JUNGLE') {
    return round1(
      clamp(
        epicScore * 0.42 +
          objDmgScore * 0.28 +
          turretDmgScore * 0.14 +
          structureCountScore * 0.16 +
          firstTowerBonus +
          stealBonus,
        0,
        100
      )
    );
  }

  return round1(
    clamp(
      turretDmgScore * 0.32 +
        structureCountScore * 0.26 +
        objDmgScore * 0.20 +
        epicScore * 0.22 +
        firstTowerBonus +
        stealBonus,
      0,
      100
    )
  );
}

export function computeVisionPillar(
  p: RiotMatchV5Participant,
  role: LolRoleKey,
  mins: number,
  visionPerMin: number
): number {
  if (role === 'ARAM' || role === 'ARENA') return 0;

  const ch = p.challenges;
  const target = role === 'UTILITY' ? 2.0 : role === 'JUNGLE' ? 1.15 : 0.85;
  const visionRateScore = normCurve(visionPerMin, target * 0.72, target * 1.15);

  const controlWards = Math.max(
    p.visionWardsBoughtInGame ?? 0,
    p.detectorWardsPlaced ?? 0,
    ch?.controlWardsPlaced ?? 0
  );
  const controlTarget = role === 'UTILITY' ? 5 : role === 'JUNGLE' ? 3 : 2;
  const controlScore = normCurve(controlWards, controlTarget * 0.6, controlTarget * 1.4);

  const wardsKilledPerMin = (p.wardsKilled ?? 0) / mins;
  const clearScore = normCurve(
    wardsKilledPerMin,
    role === 'UTILITY' ? 0.25 : 0.10,
    role === 'UTILITY' ? 0.55 : 0.28
  );

  const riverCoverage = clamp(ch?.controlWardTimeCoverageInRiverOrEnemyHalf ?? 0, 0, 1);
  const coverageBonus = riverCoverage * 10;
  const visionAdv = clamp((ch?.visionScoreAdvantageLaneOpponent ?? 0) * 10, -5, 8);

  return round1(
    clamp(visionRateScore * 0.56 + controlScore * 0.20 + clearScore * 0.18 + coverageBonus + visionAdv, 0, 100)
  );
}

export function computeLaneDiffAndDominance(
  ctx: ParticipantContext,
  allContexts: ParticipantContext[],
  mins: number
): { laneDiff: LolPerformanceLaneDiff; dominance: number } {
  const { participant: p, role, normalizedTeamPos } = ctx;

  // Match-wide percentile based on composite output across all participants
  const sortedComposites = allContexts
    .map((c) => c.rawCompositeIndex)
    .sort((a, b) => a - b);
  let belowCount = 0;
  let equalCount = 0;
  for (const val of sortedComposites) {
    if (val < ctx.rawCompositeIndex) belowCount += 1;
    else if (val === ctx.rawCompositeIndex) equalCount += 1;
  }
  const denom = Math.max(1, sortedComposites.length - 1);
  const matchPercentile =
    sortedComposites.length <= 1
      ? 50
      : ((belowCount + Math.max(0, equalCount - 1) * 0.5) / denom) * 100;

  let laneDiff: LolPerformanceLaneDiff = null;
  let laneDominanceScore = matchPercentile;

  if (normalizedTeamPos && RIFT_ROLES.has(role)) {
    const sameTeamSamePos = allContexts.filter(
      (c) => c.participant.teamId === p.teamId && c.normalizedTeamPos === normalizedTeamPos
    );
    const oppSamePos = allContexts.filter(
      (c) => c.participant.teamId !== p.teamId && c.normalizedTeamPos === normalizedTeamPos
    );

    if (sameTeamSamePos.length === 1 && oppSamePos.length === 1) {
      const oppCtx = oppSamePos[0];
      const opp = oppCtx.participant;

      laneDiff = {
        opponentChampionName: opp.championName,
        csDiff: Math.round(ctx.cs - oppCtx.cs),
        goldDiff: Math.round((p.goldEarned ?? 0) - (opp.goldEarned ?? 0)),
        damageDiff: Math.round(
          (p.totalDamageDealtToChampions ?? 0) - (opp.totalDamageDealtToChampions ?? 0)
        ),
        visionDiff: Math.round((p.visionScore ?? 0) - (opp.visionScore ?? 0)),
        kdaDiff: round2(ctx.kda - oppCtx.kda),
        levelDiff: Math.round((p.champLevel ?? 0) - (opp.champLevel ?? 0)),
      };

      const gpmSignal = 50 + clamp((ctx.gpm - oppCtx.gpm) / 140, -1, 1) * 42;
      const dpmSignal = 50 + clamp((ctx.dpm - oppCtx.dpm) / 320, -1, 1) * 42;
      const csmSignal = 50 + clamp((ctx.csPerMin - oppCtx.csPerMin) / 2.2, -1, 1) * 42;
      const vpmSignal = 50 + clamp((ctx.visionPerMin - oppCtx.visionPerMin) / 0.8, -1, 1) * 42;
      const kdaSignal = 50 + clamp((ctx.rawKda - oppCtx.rawKda) / 3.5, -1, 1) * 42;
      const lvlSignal = 50 + clamp(((p.champLevel ?? 0) - (opp.champLevel ?? 0)) / 2.5, -1, 1) * 42;

      if (role === 'UTILITY') {
        laneDominanceScore =
          gpmSignal * 0.22 +
          dpmSignal * 0.20 +
          vpmSignal * 0.26 +
          kdaSignal * 0.20 +
          lvlSignal * 0.12;
      } else {
        laneDominanceScore =
          gpmSignal * 0.28 +
          dpmSignal * 0.26 +
          csmSignal * 0.16 +
          vpmSignal * 0.08 +
          kdaSignal * 0.14 +
          lvlSignal * 0.08;
      }

      void mins; // mins already reflected in per-minute differentials
    }
  }

  const dominance = laneDiff
    ? round1(clamp(laneDominanceScore * 0.55 + matchPercentile * 0.45, 0, 100))
    : round1(clamp(matchPercentile, 0, 100));

  return { laneDiff, dominance };
}

export function computeMechanicsBonus(p: RiotMatchV5Participant, mins: number): number {
  const ch = p.challenges;
  const dodged = ((ch?.skillshotsDodged ?? 0) / mins) * 0.6;
  const hit = ((ch?.skillshotsHit ?? 0) / mins) * 0.4;
  const clutch = (ch?.survivedSingleDigitHpCount ?? 0) * 0.4;
  const flawless = (ch?.flawlessAces ?? 0) * 0.5;
  const steal = (p.objectivesStolen ?? ch?.objectivesStolen ?? 0) * 1.0;

  const raw =
    clamp(dodged, 0, 1.5) +
    clamp(hit, 0, 1.2) +
    clamp(clutch, 0, 0.8) +
    clamp(flawless, 0, 0.8) +
    clamp(steal, 0, 1.0);

  return round1(clamp(raw, 0, 4));
}

export function buildHighlights(params: {
  p: RiotMatchV5Participant;
  role: LolRoleKey;
  isMvp: boolean;
  isAce: boolean;
  performanceScore: number;
  maxDamage: number;
  maxVision: number;
}): string[] {
  const { p, role, isMvp, isAce, performanceScore, maxDamage, maxVision } = params;
  const highlights: string[] = [];

  if (isMvp) highlights.push('MVP');
  if (isAce) highlights.push('ACE');

  if ((p.pentaKills ?? 0) > 0) highlights.push('Penta');
  else if ((p.quadraKills ?? 0) > 0) highlights.push('Quadra');
  else if ((p.tripleKills ?? 0) > 0) highlights.push('Triple');

  if (p.deaths === 0 && p.kills + p.assists >= 4) {
    highlights.push('0 Muertes');
  }
  if ((p.objectivesStolen ?? p.challenges?.objectivesStolen ?? 0) > 0) {
    highlights.push('Robo Obj');
  }
  if ((p.totalDamageDealtToChampions ?? 0) === maxDamage && maxDamage > 0) {
    highlights.push('Top DMG');
  }
  if (role !== 'ARAM' && role !== 'ARENA' && (p.visionScore ?? 0) === maxVision && maxVision > 0) {
    highlights.push('Top Visión');
  }
  if (p.firstBloodKill) {
    highlights.push('1st Blood');
  }
  if (performanceScore >= 82 && !isMvp && !isAce) {
    highlights.push('Carry');
  }

  return Array.from(new Set(highlights)).slice(0, 4);
}

export function scoreMatchParticipants(
  match: RiotMatchV5,
  includeRaw = false
): LolMatchParticipantSummary[] {
  const { info, metadata } = match;
  const durationSeconds = Math.max(0, info.gameDuration || 0);
  const mins = Math.max(1, durationSeconds / 60);
  const queueCategory = getQueueCategory(info.queueId, info.gameMode);

  const teamTotalsMap = new Map<number, TeamTotals>();
  let maxDamage = 0;
  let maxVision = 0;

  for (const p of info.participants) {
    const curr = teamTotalsMap.get(p.teamId) ?? {
      kills: 0,
      damageToChampions: 0,
      damageTaken: 0,
      gold: 0,
    };
    curr.kills += p.kills ?? 0;
    curr.damageToChampions += p.totalDamageDealtToChampions ?? 0;
    curr.damageTaken += p.totalDamageTaken ?? 0;
    curr.gold += p.goldEarned ?? 0;
    teamTotalsMap.set(p.teamId, curr);

    if ((p.totalDamageDealtToChampions ?? 0) > maxDamage) {
      maxDamage = p.totalDamageDealtToChampions ?? 0;
    }
    if ((p.visionScore ?? 0) > maxVision) {
      maxVision = p.visionScore ?? 0;
    }
  }

  const contexts: ParticipantContext[] = info.participants.map((p) => {
    const teamTotals = teamTotalsMap.get(p.teamId) ?? {
      kills: 0,
      damageToChampions: 0,
      damageTaken: 0,
      gold: 0,
    };
    const role = resolveParticipantRole(p, info.queueId, info.gameMode);
    const normalizedTeamPos = normalizeRiftRoleToken(p.teamPosition);
    const { outcome, enemySurrendered } = classifyMatchOutcome(p, durationSeconds);

    const kills = p.kills ?? 0;
    const deaths = p.deaths ?? 0;
    const assists = p.assists ?? 0;
    const rawKda = (kills + assists) / Math.max(1, deaths);
    const kda = deaths === 0 ? kills + assists : round2((kills + assists) / deaths);

    const rawKp =
      p.challenges?.killParticipation ??
      (teamTotals.kills > 0 ? (kills + assists) / teamTotals.kills : 0);
    const kp = clamp(rawKp, 0, 1);

    const cs = (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0);
    const csPerMin = round2(cs / mins);
    const dpm = p.challenges?.damagePerMinute ?? (p.totalDamageDealtToChampions ?? 0) / mins;
    const gpm = p.challenges?.goldPerMinute ?? (p.goldEarned ?? 0) / mins;
    const visionPerMin = p.challenges?.visionScorePerMinute ?? (p.visionScore ?? 0) / mins;

    const rawCompositeIndex =
      normCurve(gpm, 420, 620) * 0.30 +
      normCurve(dpm, 560, 1000) * 0.34 +
      normCurve(rawKda, 2.5, 5.5) * 0.24 +
      normCurve(visionPerMin, 0.9, 1.9) * 0.12;

    return {
      participant: p,
      role,
      normalizedTeamPos,
      outcome,
      enemySurrendered,
      kda,
      rawKda,
      kp,
      cs,
      csPerMin,
      dpm,
      gpm,
      visionPerMin,
      rawCompositeIndex,
    };
  });

  interface ScoredDraft {
    ctx: ParticipantContext;
    pillars: LolPerformancePillarScores;
    weights: LolPerformancePillarScores;
    laneDiff: LolPerformanceLaneDiff;
    mechanicsBonus: number;
    baseScore: number;
    outcomeAdjustment: number;
    performanceScore: number;
    performanceGrade: LolPerformanceGrade;
    isRemake: boolean;
    drivers: string[];
  }

  const drafts: ScoredDraft[] = contexts.map((ctx) => {
    const { participant: p, role, outcome } = ctx;
    const weights = ROLE_WEIGHT_MATRIX[role];

    if (outcome === 'remake') {
      const zeroPillars: LolPerformancePillarScores = {
        combat: 0,
        impact: 0,
        economy: 0,
        objectives: 0,
        vision: 0,
        dominance: 0,
      };
      return {
        ctx,
        pillars: zeroPillars,
        weights,
        laneDiff: null,
        mechanicsBonus: 0,
        baseScore: 0,
        outcomeAdjustment: 0,
        performanceScore: 0,
        performanceGrade: 'C',
        isRemake: true,
        drivers: ['Partida terminada en remake'],
      };
    }

    const teamTotals = teamTotalsMap.get(p.teamId) ?? {
      kills: 0,
      damageToChampions: 0,
      damageTaken: 0,
      gold: 0,
    };

    const combat = computeCombatPillar(p, role, mins, durationSeconds, ctx.rawKda, ctx.kp);
    const impact = computeImpactPillar(p, role, mins, teamTotals);
    const economy = computeEconomyPillar(p, role, mins, ctx.csPerMin, ctx.gpm, teamTotals);
    const objectives = computeObjectivesPillar(p, role, mins);
    const vision = computeVisionPillar(p, role, mins, ctx.visionPerMin);
    const { laneDiff, dominance } = computeLaneDiffAndDominance(ctx, contexts, mins);

    const pillars: LolPerformancePillarScores = {
      combat,
      impact,
      economy,
      objectives,
      vision,
      dominance,
    };

    const weightedSum =
      pillars.combat * weights.combat +
      pillars.impact * weights.impact +
      pillars.economy * weights.economy +
      pillars.objectives * weights.objectives +
      pillars.vision * weights.vision +
      pillars.dominance * weights.dominance;

    const mechanicsBonus = computeMechanicsBonus(p, mins);
    const baseScore = weightedSum + mechanicsBonus;

    return {
      ctx,
      pillars,
      weights,
      laneDiff,
      mechanicsBonus,
      baseScore,
      outcomeAdjustment: 0,
      performanceScore: 0,
      performanceGrade: 'B',
      isRemake: false,
      drivers: buildDrivers({
        p,
        pillars,
        weights,
        laneDiff,
        csPerMin: ctx.csPerMin,
        maxDamage,
        maxVision,
        role,
      }),
    };
  });

  // Compute median baseScore per team for FF penalty differentiation
  const teamBaseScores = new Map<number, number[]>();
  for (const d of drafts) {
    if (d.isRemake) continue;
    const arr = teamBaseScores.get(d.ctx.participant.teamId) ?? [];
    arr.push(d.baseScore);
    teamBaseScores.set(d.ctx.participant.teamId, arr);
  }
  const teamMedianMap = new Map<number, number>();
  for (const [teamId, scores] of teamBaseScores.entries()) {
    const sorted = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length === 0
        ? 0
        : sorted.length % 2 === 1
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;
    teamMedianMap.set(teamId, median);
  }

  for (const d of drafts) {
    if (d.isRemake) continue;
    const outcome = d.ctx.outcome;
    let adjustment = 0;
    if (outcome === 'win') {
      adjustment = 3.0;
    } else if (outcome === 'loss') {
      adjustment = -2.0;
    } else if (outcome === 'ff') {
      const teamMedian = teamMedianMap.get(d.ctx.participant.teamId) ?? d.baseScore;
      adjustment = d.baseScore < teamMedian ? -3.5 : -2.0;
    }

    d.outcomeAdjustment = adjustment;
    d.performanceScore = round1(clamp(d.baseScore + adjustment, 0, 100));
    d.performanceGrade = getGradeFromScore(d.performanceScore);
  }

  // Assign match ranks #1..#N across all non-remake participants
  const nonRemakeSorted = drafts
    .filter((d) => !d.isRemake)
    .sort((a, b) => {
      if (b.performanceScore !== a.performanceScore) {
        return b.performanceScore - a.performanceScore;
      }
      if (b.baseScore !== a.baseScore) {
        return b.baseScore - a.baseScore;
      }
      return a.ctx.participant.participantId - b.ctx.participant.participantId;
    });

  const rankByParticipantId = new Map<number, number>();
  nonRemakeSorted.forEach((d, idx) => {
    rankByParticipantId.set(d.ctx.participant.participantId, idx + 1);
  });

  const winningTop = nonRemakeSorted.find((d) => d.ctx.participant.win === true);
  const losingTop = nonRemakeSorted.find((d) => d.ctx.participant.win === false);
  const mvpParticipantId = winningTop?.ctx.participant.participantId ?? -1;
  const aceParticipantId = losingTop?.ctx.participant.participantId ?? -1;

  return drafts.map((d) => {
    const p = d.ctx.participant;
    const isMvp = !d.isRemake && p.participantId === mvpParticipantId;
    const isAce = !d.isRemake && p.participantId === aceParticipantId;
    const matchRank = d.isRemake ? 0 : (rankByParticipantId.get(p.participantId) ?? 0);

    const primaryStyle =
      p.perks?.styles?.find((s) => s.description === 'primaryStyle') ?? p.perks?.styles?.[0];
    const subStyle =
      p.perks?.styles?.find((s) => s.description === 'subStyle') ?? p.perks?.styles?.[1];

    const breakdown: LolPerformanceBreakdown = {
      pillars: d.pillars,
      weights: d.weights,
      role: d.ctx.role,
      queueCategory,
      isRemake: d.isRemake,
      laneDiff: d.laneDiff,
      outcomeAdjustment: d.outcomeAdjustment,
      mechanicsBonus: d.mechanicsBonus,
      drivers: d.drivers,
    };

    const highlights = d.isRemake
      ? ['Remake']
      : buildHighlights({
          p,
          role: d.ctx.role,
          isMvp,
          isAce,
          performanceScore: d.performanceScore,
          maxDamage,
          maxVision,
        });

    const summary: LolMatchParticipantSummary = {
      matchId: metadata.matchId,
      puuid: p.puuid,
      participantId: p.participantId,
      teamId: p.teamId,
      riotIdGameName: p.riotIdGameName || p.summonerName || 'Jugador',
      riotIdTagLine: p.riotIdTagLine ?? p.riotIdTagline ?? '',
      summonerName: p.summonerName || p.riotIdGameName || '',
      championId: p.championId,
      championName: p.championName,
      champLevel: p.champLevel ?? 1,
      teamPosition: p.teamPosition ?? '',
      individualPosition: p.individualPosition ?? '',
      win: Boolean(p.win),
      gameEndedInSurrender: Boolean(p.gameEndedInSurrender),
      gameEndedInEarlySurrender: Boolean(p.gameEndedInEarlySurrender),
      teamEarlySurrendered: Boolean(p.teamEarlySurrendered),
      outcome: d.ctx.outcome,
      enemySurrendered: d.ctx.enemySurrendered,
      kills: p.kills ?? 0,
      deaths: p.deaths ?? 0,
      assists: p.assists ?? 0,
      kda: d.ctx.kda,
      cs: d.ctx.cs,
      csPerMin: d.ctx.csPerMin,
      goldEarned: p.goldEarned ?? 0,
      damageToChampions: p.totalDamageDealtToChampions ?? 0,
      damageTaken: p.totalDamageTaken ?? 0,
      damageToObjectives: p.damageDealtToObjectives ?? 0,
      damageToTurrets: p.damageDealtToTurrets ?? 0,
      visionScore: p.visionScore ?? 0,
      killParticipation: round3(d.ctx.kp),
      summoner1Id: p.summoner1Id ?? 0,
      summoner2Id: p.summoner2Id ?? 0,
      primaryRuneId: primaryStyle?.selections?.[0]?.perk ?? null,
      primaryStyleId: primaryStyle?.style ?? null,
      subStyleId: subStyle?.style ?? null,
      items: [
        p.item0 ?? 0,
        p.item1 ?? 0,
        p.item2 ?? 0,
        p.item3 ?? 0,
        p.item4 ?? 0,
        p.item5 ?? 0,
        p.item6 ?? 0,
      ],
      performanceScore: d.performanceScore,
      performanceGrade: d.performanceGrade,
      performanceBreakdown: breakdown,
      matchRank,
      isMvp,
      isAce,
      highlights,
      totalTimeSpentDead: p.totalTimeSpentDead ?? 0,
      enemyMissingPings: p.enemyMissingPings ?? 0,
    };

    if (includeRaw) {
      summary.rawParticipant = p;
    }

    return summary;
  });
}

export function buildMatchSummaryFromRiotMatch(
  match: RiotMatchV5,
  includeRaw = false
): LolMatchSummary {
  const { metadata, info } = match;
  const participants = scoreMatchParticipants(match, includeRaw);

  const teamStatsMap = new Map<
    number,
    { totalKills: number; totalDamageToChampions: number; totalGold: number }
  >();
  for (const p of participants) {
    const acc = teamStatsMap.get(p.teamId) ?? {
      totalKills: 0,
      totalDamageToChampions: 0,
      totalGold: 0,
    };
    acc.totalKills += p.kills;
    acc.totalDamageToChampions += p.damageToChampions;
    acc.totalGold += p.goldEarned;
    teamStatsMap.set(p.teamId, acc);
  }

  const teams: LolMatchTeamSummary[] = (info.teams ?? []).map((t) => {
    const totals = teamStatsMap.get(t.teamId) ?? {
      totalKills: 0,
      totalDamageToChampions: 0,
      totalGold: 0,
    };
    return {
      teamId: t.teamId,
      win: t.win,
      bans: t.bans ?? [],
      objectives: t.objectives ?? {},
      totalKills: totals.totalKills,
      totalDamageToChampions: totals.totalDamageToChampions,
      totalGold: totals.totalGold,
    };
  });

  const participantPuuids =
    metadata.participants && metadata.participants.length > 0
      ? [...metadata.participants]
      : participants.map((p) => p.puuid);

  const summary: LolMatchSummary = {
    matchId: metadata.matchId,
    platformId: info.platformId,
    regionalCluster: safePlatformToCluster(info.platformId),
    queueId: info.queueId,
    queueCategory: getQueueCategory(info.queueId, info.gameMode),
    gameMode: info.gameMode,
    gameType: info.gameType,
    gameVersion: info.gameVersion,
    mapId: info.mapId,
    gameCreation: info.gameCreation,
    gameStartTimestamp: info.gameStartTimestamp,
    gameEndTimestamp: info.gameEndTimestamp ?? null,
    gameDuration: info.gameDuration,
    endOfGameResult: info.endOfGameResult ?? null,
    participantPuuids,
    teams,
    participants,
  };

  if (includeRaw) {
    summary.rawMatch = match;
  }

  return summary;
}


export function extractIntrinsicPerf(part: LolMatchParticipantSummary): number {
  const adj =
    part.performanceBreakdown?.outcomeAdjustment ??
    (part.outcome === 'win' ? 3 : part.outcome === 'ff' ? -2.5 : -2);
  return clamp(part.performanceScore - adj, 0, 100);
}
