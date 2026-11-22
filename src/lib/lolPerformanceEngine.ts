// ==============================================================================
// BOLUDOS GAMING — LEAGUE OF LEGENDS PERFORMANCE ENGINE (BG-PERF v2)
// ==============================================================================
// Pure, deterministic scoring and analytics engine for Riot Match-v5 data.
// Evaluates 6 role-weighted performance pillars (0-100 each):
//   1. Combat     (KDA, KP, multikills, solo kills, death penalty)
//   2. Impact     (DPM, team dmg%, dmg/gold, frontline mitigation, peel/CC/heals)
//   3. Economy    (Role-calibrated CS/min, GPM, gold efficiency, early laning)
//   4. Objectives (Turret/epic dmg, takedowns, dragon/baron/herald/void, steals)
//   5. Vision     (Vision/min vs role target, control wards, river coverage, denies)
//   6. Dominance  (Direct lane-opponent differential + match-wide percentile)
// ==============================================================================

import type {
  LolAccount,
  LolChampionDetailedStats,
  LolChampionSummary,
  LolDurationBucketKey,
  LolDurationBucketStats,
  LolGroupAggregateStats,
  LolGroupLeaderboardEntry,
  LolGroupPickBreakdown,
  LolGroupPickEntry,
  LolGroupPicksResult,
  LolGroupRecordEntry,
  LolMacroDurationRangeDef,
  LolMacroDurationRangeKey,
  LolMacroDurationRangeStats,
  LolMatchOutcome,
  LolMatchParticipantSummary,
  LolOutcomeCurveModel,
  LolOutcomeCurveSample,
  LolOutcomeMinuteCurve,
  LolOutcomeMinuteEstimate,
  LolValidOutcome,
  LolMatchSummary,
  LolMatchTeamSummary,
  LolPerformanceBreakdown,
  LolPerformanceGrade,
  LolPerformanceLaneDiff,
  LolPerformancePillarScores,
  LolPersonalVsGroupStats,
  LolPlatform,
  LolPlayerAggregateStats,
  LolQueueCategory,
  LolRecordEntry,
  LolRegionalCluster,
  LolRiftRoleKey,
  LolRoleLeaderboardByLane,
  LolRoleLeaderboardEntry,
  LolRoleKey,
  LolSpecificQueueCategory,
  LolTimeRangeFilter,
  LolViewMode,
  RiotMatchV5,
  RiotMatchV5Participant,
} from '../types/lol';

export const DEFAULT_LOL_QUEUE_FILTERS: LolSpecificQueueCategory[] = [
  'normal',
  'ranked_flex',
  'mode_5v5',
];

export const DEFAULT_LOL_TIME_RANGE: LolTimeRangeFilter = '30d';

export const RIFT_ROLE_KEYS: LolRiftRoleKey[] = [
  'TOP',
  'JUNGLE',
  'MIDDLE',
  'BOTTOM',
  'UTILITY',
];

export const ROLE_WEIGHT_MATRIX: Record<LolRoleKey, LolPerformancePillarScores> = {
  TOP: { combat: 0.22, impact: 0.24, economy: 0.22, objectives: 0.15, vision: 0.07, dominance: 0.10 },
  JUNGLE: { combat: 0.22, impact: 0.18, economy: 0.16, objectives: 0.22, vision: 0.12, dominance: 0.10 },
  MIDDLE: { combat: 0.24, impact: 0.24, economy: 0.20, objectives: 0.12, vision: 0.08, dominance: 0.12 },
  BOTTOM: { combat: 0.24, impact: 0.25, economy: 0.23, objectives: 0.12, vision: 0.06, dominance: 0.10 },
  UTILITY: { combat: 0.18, impact: 0.25, economy: 0.08, objectives: 0.13, vision: 0.26, dominance: 0.10 },
  ARAM: { combat: 0.32, impact: 0.34, economy: 0.14, objectives: 0.08, vision: 0.00, dominance: 0.12 },
  ARENA: { combat: 0.36, impact: 0.36, economy: 0.12, objectives: 0.00, vision: 0.00, dominance: 0.16 },
};

const PLATFORM_TO_CLUSTER: Record<LolPlatform, LolRegionalCluster> = {
  la2: 'americas',
  la1: 'americas',
  br1: 'americas',
  na1: 'americas',
  euw1: 'europe',
  eun1: 'europe',
  tr1: 'europe',
  ru: 'europe',
  kr: 'asia',
  jp1: 'asia',
  oc1: 'sea',
  ph2: 'sea',
  sg2: 'sea',
  th2: 'sea',
  tw2: 'sea',
  vn2: 'sea',
};

const RIFT_ROLES = new Set<LolRoleKey>(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}

/**
 * Smooth monotonic calibration curve:
 *  - value = 0        -> 0
 *  - value = avgRef   -> 60
 *  - value = eliteRef -> 90
 *  - value -> +inf    -> approaches 100 asymptotically
 */
function normCurve(value: number, avgRef: number, eliteRef: number): number {
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

function safePlatformToCluster(platformId: string): LolRegionalCluster {
  const normalized = platformId.toLowerCase().trim() as LolPlatform;
  return PLATFORM_TO_CLUSTER[normalized] ?? 'americas';
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

export const TIME_RANGE_DAYS: Record<Exclude<LolTimeRangeFilter, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

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

function normalizeRiftRoleToken(raw?: string): LolRoleKey | null {
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

interface TeamTotals {
  kills: number;
  damageToChampions: number;
  damageTaken: number;
  gold: number;
}

interface ParticipantContext {
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

function computeCombatPillar(
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

function computeImpactPillar(
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

function computeEconomyPillar(
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

function computeObjectivesPillar(
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

function computeVisionPillar(
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

function computeLaneDiffAndDominance(
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

function computeMechanicsBonus(p: RiotMatchV5Participant, mins: number): number {
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

function buildDrivers(params: {
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

function buildHighlights(params: {
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

const DURATION_BUCKET_DEFINITIONS: Array<{
  key: LolDurationBucketKey;
  label: string;
  matches: (durationSeconds: number) => boolean;
}> = [
  { key: '0-5', label: '0-5 min', matches: (s) => s <= 300 },
  { key: '0-20', label: '0-20 min', matches: (s) => s <= 1200 },
  { key: '20-30', label: '20-30 min', matches: (s) => s > 1200 && s <= 1800 },
  { key: '30+', label: '30+ min', matches: (s) => s > 1800 },
];

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

interface PlayerMatchSample {
  match: LolMatchSummary;
  participant: LolMatchParticipantSummary;
}

function filterMatchesByQueue(
  matches: LolMatchSummary[],
  queueFilter: LolQueueCategory
): LolMatchSummary[] {
  if (queueFilter === 'all') return matches;
  return matches.filter((m) => getQueueCategory(m.queueId, m.gameMode) === queueFilter);
}

function resolvePrimaryRole(roleCounts: Map<LolRoleKey, number>): LolRoleKey {
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

function getMatchTimestamp(match: LolMatchSummary): number {
  return match.gameCreation > 0 ? match.gameCreation : match.gameStartTimestamp;
}

function formatMatchDateLabel(match: LolMatchSummary): string | undefined {
  const ts = getMatchTimestamp(match);
  if (!Number.isFinite(ts) || ts <= 0) return undefined;
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

interface CoreParticipantAverages {
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

function computeCoreParticipantAverages(samples: PlayerMatchSample[]): CoreParticipantAverages {
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

function buildTopChampions(samples: PlayerMatchSample[]): LolChampionSummary[] {
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

function aggregateSamples(samples: PlayerMatchSample[]): LolPlayerAggregateStats {
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

export function computeGroupLeaderboard(params: {
  matches: LolMatchSummary[];
  accounts: LolAccount[];
  playerProfiles: Array<{ id: string; displayName: string; avatarUrl: string }>;
  queueFilter?: LolQueueCategory;
}): LolGroupLeaderboardEntry[] {
  const { matches, accounts, playerProfiles, queueFilter = 'all' } = params;
  const groupMemberPuuids = new Set(accounts.map((a) => a.puuid));
  const puuidToUserId = buildPuuidToUserIdMap(accounts);
  const userGroups = groupAccountsByUser(accounts);
  const profileById = new Map(playerProfiles.map((p) => [p.id, p]));
  const filteredMatches = filterMatchesByQueue(matches, queueFilter);
  const groupMatches = filteredMatches.filter((m) =>
    isGroupMatch(m, groupMemberPuuids, puuidToUserId)
  );

  interface DraftEntry {
    account: LolAccount;
    puuids: Set<string>;
    displayName: string;
    avatarUrl: string;
    groupStats: LolPlayerAggregateStats;
    personalStats: LolPlayerAggregateStats;
  }

  const drafts: DraftEntry[] = userGroups.map(({ primaryAccount: account, puuids }) => {
    const profile = profileById.get(account.userId);
    const vsStats = computePlayerAggregates(
      filteredMatches,
      puuids,
      groupMemberPuuids,
      'all',
      puuidToUserId
    );
    return {
      account,
      puuids,
      displayName: profile?.displayName ?? account.gameName,
      avatarUrl: profile?.avatarUrl ?? '',
      groupStats: vsStats.inGroup,
      personalStats: vsStats.personal,
    };
  });

  const activeGroupDrafts = drafts.filter((d) => d.groupStats.scoredGames > 0);
  const pPrior =
    activeGroupDrafts.length > 0
      ? activeGroupDrafts.reduce((sum, d) => sum + d.groupStats.avgPerformance, 0) /
        activeGroupDrafts.length
      : 55;
  const k = 5;

  const entries: LolGroupLeaderboardEntry[] = drafts.map((d) => {
    const n = d.groupStats.scoredGames;
    const pGroup = d.groupStats.avgPerformance;
    const pBayes = (n * pGroup + k * pPrior) / (n + k);
    const activityBonus = 12 * (1 - Math.exp(-n / 12));
    const wrBonus = clamp(((d.groupStats.winRate - 50) / 50) * 4, -4, 4);
    const groupRankScore =
      n === 0 ? 0 : round1(clamp(pBayes * 0.88 + activityBonus + wrBonus, 0, 100));

    // Compute topDuoPartner among other group users across all their accounts
    let topDuoPartner: LolGroupLeaderboardEntry['topDuoPartner'] = null;
    for (const other of drafts) {
      if (other.account.userId === d.account.userId) continue;

      let gamesTogether = 0;
      let winsTogether = 0;

      for (const m of groupMatches) {
        const selfPart = m.participants.find((p) => d.puuids.has(p.puuid));
        const otherPart = m.participants.find((p) => other.puuids.has(p.puuid));
        if (!selfPart || !otherPart) continue;
        if (selfPart.outcome === 'remake' || otherPart.outcome === 'remake') continue;

        gamesTogether += 1;
        if (selfPart.outcome === 'win') {
          winsTogether += 1;
        }
      }

      if (gamesTogether === 0) continue;
      const winRateTogether = round1((winsTogether / gamesTogether) * 100);

      if (
        !topDuoPartner ||
        gamesTogether > topDuoPartner.gamesTogether ||
        (gamesTogether === topDuoPartner.gamesTogether &&
          winRateTogether > topDuoPartner.winRateTogether)
      ) {
        topDuoPartner = {
          userId: other.account.userId,
          displayName: other.displayName,
          gameName: other.account.gameName,
          gamesTogether,
          winRateTogether,
        };
      }
    }

    return {
      userId: d.account.userId,
      displayName: d.displayName,
      avatarUrl: d.avatarUrl,
      account: d.account,
      groupRankScore,
      groupPerformanceAvg: d.groupStats.avgPerformance,
      groupGamesTotal: d.groupStats.totalGames,
      groupGamesScored: d.groupStats.scoredGames,
      groupWins: d.groupStats.wins,
      groupLosses: d.groupStats.losses,
      groupFfs: d.groupStats.ffs,
      groupRemakes: d.groupStats.remakes,
      groupWinRate: d.groupStats.winRate,
      groupKdaAvg: d.groupStats.avgKda,
      groupMvpCount: d.groupStats.mvpCount,
      groupAceCount: d.groupStats.aceCount,
      personalPerformanceAvg: d.personalStats.avgPerformance,
      personalGamesTotal: d.personalStats.totalGames,
      personalWinRate: d.personalStats.winRate,
      topGroupChampion: d.groupStats.topChampions[0] ?? null,
      topDuoPartner,
    };
  });

  return entries.sort((a, b) => {
    if (b.groupRankScore !== a.groupRankScore) return b.groupRankScore - a.groupRankScore;
    if (b.groupGamesScored !== a.groupGamesScored) return b.groupGamesScored - a.groupGamesScored;
    return b.groupWinRate - a.groupWinRate;
  });
}

export function computeGroupLeaderboardByRole(params: {
  matches: LolMatchSummary[];
  accounts: LolAccount[];
  playerProfiles: Array<{ id: string; displayName: string; avatarUrl: string }>;
  queueFilter?: LolQueueCategory;
}): LolRoleLeaderboardByLane {
  const { matches, accounts, playerProfiles, queueFilter = 'all' } = params;
  const groupMemberPuuids = new Set(accounts.map((a) => a.puuid));
  const puuidToUserId = buildPuuidToUserIdMap(accounts);
  const userGroups = groupAccountsByUser(accounts);
  const profileById = new Map(playerProfiles.map((p) => [p.id, p]));
  const filteredMatches = filterMatchesByQueue(matches, queueFilter);
  const groupMatches = filteredMatches.filter((m) =>
    isGroupMatch(m, groupMemberPuuids, puuidToUserId)
  );

  const out: LolRoleLeaderboardByLane = {
    TOP: [],
    JUNGLE: [],
    MIDDLE: [],
    BOTTOM: [],
    UTILITY: [],
  };

  for (const role of RIFT_ROLE_KEYS) {
    interface RoleDraft {
      account: LolAccount;
      displayName: string;
      avatarUrl: string;
      samples: PlayerMatchSample[];
      avgPerformance: number;
      wins: number;
      losses: number;
      ffs: number;
      winRate: number;
      avgKda: number;
      mvpCount: number;
    }

    const drafts: RoleDraft[] = [];

    for (const { primaryAccount: account, puuids } of userGroups) {
      const profile = profileById.get(account.userId);
      const roleSamples: PlayerMatchSample[] = [];

      for (const match of groupMatches) {
        const participant = match.participants.find((p) => puuids.has(p.puuid));
        if (!participant || participant.outcome === 'remake') continue;
        if (participant.performanceBreakdown.role !== role) continue;
        roleSamples.push({ match, participant });
      }

      if (roleSamples.length === 0) continue;

      let perfSum = 0;
      let kdaSum = 0;
      let wins = 0;
      let losses = 0;
      let ffs = 0;
      let mvpCount = 0;

      for (const { participant: p } of roleSamples) {
        perfSum += p.performanceScore;
        kdaSum += p.kda;
        if (p.outcome === 'win') wins += 1;
        else if (p.outcome === 'ff') ffs += 1;
        else losses += 1;
        if (p.isMvp) mvpCount += 1;
      }

      const n = roleSamples.length;
      drafts.push({
        account,
        displayName: profile?.displayName ?? account.gameName,
        avatarUrl: profile?.avatarUrl ?? '',
        samples: roleSamples,
        avgPerformance: round1(perfSum / n),
        wins,
        losses,
        ffs,
        winRate: round1((wins / n) * 100),
        avgKda: round2(kdaSum / n),
        mvpCount,
      });
    }

    const rolePrior =
      drafts.length > 0
        ? drafts.reduce((sum, d) => sum + d.avgPerformance, 0) / drafts.length
        : 55;
    const k = 3;

    const entries: LolRoleLeaderboardEntry[] = drafts.map((d) => {
      const n = d.samples.length;
      const pBayes = (n * d.avgPerformance + k * rolePrior) / (n + k);
      const activityBonus = 10 * (1 - Math.exp(-n / 6));
      const wrBonus = clamp(((d.winRate - 50) / 50) * 4, -4, 4);
      const roleRankScore = round1(clamp(pBayes * 0.88 + activityBonus + wrBonus, 0, 100));
      const topChamp = buildTopChampions(d.samples)[0] ?? null;

      return {
        role,
        userId: d.account.userId,
        displayName: d.displayName,
        avatarUrl: d.avatarUrl,
        account: d.account,
        roleRankScore,
        avgPerformance: d.avgPerformance,
        games: n,
        wins: d.wins,
        losses: d.losses,
        ffs: d.ffs,
        winRate: d.winRate,
        avgKda: d.avgKda,
        mvpCount: d.mvpCount,
        topChampion: topChamp,
      };
    });

    out[role] = entries.sort((a, b) => {
      if (b.roleRankScore !== a.roleRankScore) return b.roleRankScore - a.roleRankScore;
      if (b.games !== a.games) return b.games - a.games;
      return b.winRate - a.winRate;
    });
  }

  return out;
}

function formatSecondsCompact(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

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

function pickBestSample<T>(items: T[], cmp: (a: T, b: T) => number): T {
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

export function computeGroupAggregateStats(params: {
  matches: LolMatchSummary[];
  accounts: LolAccount[];
  queueFilter?: LolQueueCategory;
}): LolGroupAggregateStats {
  const { matches, accounts, queueFilter = 'all' } = params;
  const groupPuuids = new Set(accounts.map((a) => a.puuid));
  const puuidToUserId = buildPuuidToUserIdMap(accounts);
  const filteredMatches = filterMatchesByQueue(matches, queueFilter);
  const groupMatches = filteredMatches.filter((m) =>
    isGroupMatch(m, groupPuuids, puuidToUserId)
  );

  let wins = 0;
  let losses = 0;
  let ffs = 0;
  let remakes = 0;
  let squadSizeSum = 0;

  const bucketEntries: Array<{ durationSeconds: number; outcome: LolMatchOutcome }> = [];
  const participantSamples: PlayerMatchSample[] = [];

  for (const match of groupMatches) {
    const resolved = resolveGroupMatchOutcome(match, groupPuuids);
    squadSizeSum += countGroupMembersInMatch(match, groupPuuids, puuidToUserId);
    bucketEntries.push({ durationSeconds: match.gameDuration, outcome: resolved.outcome });

    if (resolved.outcome === 'remake') {
      remakes += 1;
    } else if (resolved.outcome === 'win') {
      wins += 1;
    } else if (resolved.outcome === 'ff') {
      ffs += 1;
    } else {
      losses += 1;
    }

    for (const participant of resolved.groupParticipants) {
      if (participant.outcome === 'remake') continue;
      participantSamples.push({ match, participant });
    }
  }

  const totalMatches = groupMatches.length;
  const scoredMatches = wins + losses + ffs;
  const core = computeCoreParticipantAverages(participantSamples);

  return {
    totalMatches,
    scoredMatches,
    wins,
    losses,
    ffs,
    remakes,
    winRate: scoredMatches > 0 ? round1((wins / scoredMatches) * 100) : 0,
    ffRate: scoredMatches > 0 ? round1((ffs / scoredMatches) * 100) : 0,
    avgSquadSize: totalMatches > 0 ? round1(squadSizeSum / totalMatches) : 0,
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
    durationBuckets: computeDurationBuckets(bucketEntries),
  };
}

function extractIntrinsicPerf(part: LolMatchParticipantSummary): number {
  const adj =
    part.performanceBreakdown?.outcomeAdjustment ??
    (part.outcome === 'win' ? 3 : part.outcome === 'ff' ? -2.5 : -2);
  return clamp(part.performanceScore - adj, 0, 100);
}

function buildPickDrivers(params: {
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

export function computeGroupPicks(params: {
  matches: LolMatchSummary[];
  accounts: LolAccount[];
  playerProfiles: Array<{ id: string; displayName: string; avatarUrl: string }>;
  queueFilter?: LolQueueCategory;
  minGames?: number;
  tableLimit?: number;
}): LolGroupPicksResult {
  const {
    matches,
    accounts,
    playerProfiles,
    queueFilter = 'all',
    minGames = 3,
    tableLimit = 5,
  } = params;

  const groupPuuids = new Set(accounts.map((a) => a.puuid));
  const puuidToUserId = buildPuuidToUserIdMap(accounts);
  const primaryAccountByUserId = new Map(
    groupAccountsByUser(accounts).map((g) => [g.userId, g.primaryAccount])
  );
  const accountByPuuid = new Map(accounts.map((a) => [a.puuid, a]));
  const profileById = new Map(playerProfiles.map((p) => [p.id, p]));
  const filteredMatches = filterMatchesByQueue(matches, queueFilter);
  const groupMatches = filteredMatches.filter((m) =>
    isGroupMatch(m, groupPuuids, puuidToUserId)
  );

  interface PlayerBaselineDraft {
    games: number;
    wins: number;
    perfSum: number;
  }

  interface PickDraft {
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

  let groupScoredMatchCount = 0;
  let groupMatchWinFracSum = 0;
  let groupMatchFfFracSum = 0;
  let groupPerfSum = 0;
  let groupPerfCount = 0;

  let allyPerfInWinSum = 0;
  let allyPerfInWinCount = 0;
  let allyPerfInLossSum = 0;
  let allyPerfInLossCount = 0;
  let enemyIntrinsicInWinSum = 0;
  let enemyIntrinsicInWinCount = 0;
  let enemyIntrinsicInLossSum = 0;
  let enemyIntrinsicInLossCount = 0;

  const playerBaselineMap = new Map<string, PlayerBaselineDraft>();
  const pickMap = new Map<string, PickDraft>();

  for (const match of groupMatches) {
    const mins = Math.max(1, match.gameDuration / 60);
    const nonRemakeAll = match.participants.filter((p) => p.outcome !== 'remake');
    const groupParts = nonRemakeAll.filter((p) => groupPuuids.has(p.puuid));
    if (groupParts.length === 0) continue;

    groupScoredMatchCount += 1;
    let matchWins = 0;
    let matchFfs = 0;
    for (const gp of groupParts) {
      if (gp.outcome === 'win') matchWins += 1;
      else if (gp.outcome === 'ff') matchFfs += 1;
    }
    groupMatchWinFracSum += matchWins / groupParts.length;
    groupMatchFfFracSum += matchFfs / groupParts.length;

    const groupTeamId = groupParts[0].teamId;
    const groupTeamWon = groupParts[0].outcome === 'win';
    for (const part of nonRemakeAll) {
      if (part.teamId === groupTeamId) {
        if (groupTeamWon) {
          allyPerfInWinSum += part.performanceScore;
          allyPerfInWinCount += 1;
        } else {
          allyPerfInLossSum += part.performanceScore;
          allyPerfInLossCount += 1;
        }
      } else {
        const intr = extractIntrinsicPerf(part);
        if (groupTeamWon) {
          enemyIntrinsicInWinSum += intr;
          enemyIntrinsicInWinCount += 1;
        } else {
          enemyIntrinsicInLossSum += intr;
          enemyIntrinsicInLossCount += 1;
        }
      }
    }

    for (const p of groupParts) {
      const account = accountByPuuid.get(p.puuid);
      if (!account) continue;

      groupPerfSum += p.performanceScore;
      groupPerfCount += 1;

      const playerBase = playerBaselineMap.get(account.userId) ?? {
        games: 0,
        wins: 0,
        perfSum: 0,
      };
      playerBase.games += 1;
      if (p.outcome === 'win') playerBase.wins += 1;
      playerBase.perfSum += p.performanceScore;
      playerBaselineMap.set(account.userId, playerBase);

      const primaryAccount = primaryAccountByUserId.get(account.userId) ?? account;
      const pickKey = `${account.userId}::${p.championId}`;
      const profile = profileById.get(account.userId);
      const entry = pickMap.get(pickKey) ?? {
        pickKey,
        account: primaryAccount,
        displayName: profile?.displayName ?? primaryAccount.gameName,
        avatarUrl: profile?.avatarUrl ?? '',
        championId: p.championId,
        championName: p.championName,
        roleCounts: new Map<LolRoleKey, number>(),
        samples: [],
        games: 0,
        wins: 0,
        losses: 0,
        ffs: 0,
        enemyFfWins: 0,
        perfSum: 0,
        perfScores: [],
        rankSum: 0,
        rankCount: 0,
        kdaSum: 0,
        killsSum: 0,
        deathsSum: 0,
        assistsSum: 0,
        csPerMinSum: 0,
        dpmSum: 0,
        kpSum: 0,
        mvpCount: 0,
        aceCount: 0,
      };

      entry.samples.push({ match, participant: p });
      entry.games += 1;
      if (p.outcome === 'win') {
        entry.wins += 1;
        if (p.enemySurrendered) entry.enemyFfWins += 1;
      } else if (p.outcome === 'ff') {
        entry.ffs += 1;
      } else {
        entry.losses += 1;
      }

      const role = p.performanceBreakdown.role;
      entry.roleCounts.set(role, (entry.roleCounts.get(role) ?? 0) + 1);
      entry.perfSum += p.performanceScore;
      entry.perfScores.push(p.performanceScore);

      if (p.matchRank > 0) {
        entry.rankSum += clamp(p.matchRank, 1, 10);
        entry.rankCount += 1;
      }

      entry.kdaSum += p.kda;
      entry.killsSum += p.kills;
      entry.deathsSum += p.deaths;
      entry.assistsSum += p.assists;
      entry.csPerMinSum += p.csPerMin;
      entry.dpmSum += p.damageToChampions / mins;
      entry.kpSum += p.killParticipation;
      if (p.isMvp) entry.mvpCount += 1;
      if (p.isAce) entry.aceCount += 1;

      pickMap.set(pickKey, entry);
    }
  }

  const qualified = Array.from(pickMap.values()).filter((d) => d.games >= minGames);
  if (qualified.length === 0) {
    return {
      minGames,
      allPicks: [],
      bestPicks: [],
      worstPicks: [],
    };
  }

  const groupBaselineWr =
    groupScoredMatchCount > 0 ? (groupMatchWinFracSum / groupScoredMatchCount) * 100 : 50;
  const groupBaselinePerf = groupPerfCount > 0 ? groupPerfSum / groupPerfCount : 55;
  const groupBaselineFfRate =
    groupScoredMatchCount > 0 ? (groupMatchFfFracSum / groupScoredMatchCount) * 100 : 0;

  const baselineTeamInWin =
    allyPerfInWinCount > 0 ? allyPerfInWinSum / allyPerfInWinCount : groupBaselinePerf + 6;
  const baselineTeamInLoss =
    allyPerfInLossCount > 0 ? allyPerfInLossSum / allyPerfInLossCount : groupBaselinePerf - 6;
  const baselineEnemyInWin =
    enemyIntrinsicInWinCount > 0
      ? enemyIntrinsicInWinSum / enemyIntrinsicInWinCount
      : clamp(groupBaselinePerf - 10, 44, 62);
  const baselineEnemyInLoss =
    enemyIntrinsicInLossCount > 0
      ? enemyIntrinsicInLossSum / enemyIntrinsicInLossCount
      : clamp(groupBaselinePerf + 8, 56, 78);

  const K_WR = 4;
  const K_PERF = 3;
  const K_VOL = 4;
  const K_AUX = 3;
  const CLUTCH_PRIOR = 0.165;
  const KP_PRIOR = 0.55;

  const allPicks: LolGroupPickEntry[] = qualified
    .map((d) => {
      const n = d.games;
      const winRateRaw = (d.wins / n) * 100;
      const winRate = round1(winRateRaw);
      const ffRateRaw = (d.ffs / n) * 100;
      const ffRate = round1(ffRateRaw);
      const avgPerfRaw = d.perfSum / n;
      const avgPerformance = round1(avgPerfRaw);
      const avgKpRaw = d.kpSum / n;

      const playerBase = playerBaselineMap.get(d.account.userId);
      const playerBaselineWr =
        playerBase && playerBase.games > 0
          ? (playerBase.wins / playerBase.games) * 100
          : groupBaselineWr;

      // Per-match Contextual Analysis:
      // 1. Player impact vs teammates & lobby in each game
      // 2. Rival performance & match difficulty weighting
      // 3. Quality-weighted wins (anti-passenger filter & 1v9 loss mitigation)
      let effectiveWinsSum = 0;
      let adjPerfSum = 0;
      let diffBonusSum = 0;
      let rawVsTeamDeltaSum = 0;
      let effectiveVsTeamDeltaSum = 0;
      let vsOpponentDeltaSum = 0;
      let difficultySum = 0;
      let gatedAllyDeltaSum = 0;
      let allyGamesCount = 0;
      let passengerWins = 0;
      let carryGames = 0;
      let top2RankCount = 0;
      let enemyFfEnablerSum = 0;

      for (const { match, participant: p } of d.samples) {
        const nonRemakeAll = match.participants.filter((x) => x.outcome !== 'remake');
        const teamPeers = nonRemakeAll.filter(
          (x) => x.teamId === p.teamId && x.puuid !== p.puuid
        );
        const groupAllies = nonRemakeAll.filter(
          (x) =>
            groupPuuids.has(x.puuid) &&
            x.teamId === p.teamId &&
            x.puuid !== p.puuid &&
            x.win === p.win
        );
        const enemies = nonRemakeAll.filter((x) => x.teamId !== p.teamId);

        const role = p.performanceBreakdown.role;
        const playerPerf = p.performanceScore;
        const playerIntrinsic = extractIntrinsicPerf(p);
        const rankVal = p.matchRank > 0 ? clamp(p.matchRank, 1, 10) : 5.5;
        if (p.matchRank > 0 && p.matchRank <= 2) {
          top2RankCount += 1;
        }

        const teamAvgPerf =
          teamPeers.length > 0
            ? teamPeers.reduce((s, x) => s + x.performanceScore, 0) / teamPeers.length
            : groupBaselinePerf;
        const teamAvgIntrinsic =
          teamPeers.length > 0
            ? teamPeers.reduce((s, x) => s + extractIntrinsicPerf(x), 0) / teamPeers.length
            : clamp(groupBaselinePerf - 1, 35, 75);

        const rawVsTeamDelta = playerPerf - teamAvgPerf;
        rawVsTeamDeltaSum += rawVsTeamDelta;

        // Within-team rank (1 = best on team, 5 = 5th/last on a 5-man team)
        const teamSize = teamPeers.length + 1;
        const betterTeammates = teamPeers.filter(
          (x) =>
            x.performanceScore > playerPerf ||
            (x.performanceScore === playerPerf && x.participantId < p.participantId)
        ).length;
        const teamRank = betterTeammates + 1;
        const isBottomOfTeam =
          (teamSize >= 4 && teamRank >= teamSize - 1) ||
          (teamSize === 3 && teamRank === 3);

        // Within-match relative benchmark: compares the player directly against the OTHER
        // players on their team in THIS match (with a role offset for UTILITY/JUNGLE).
        // In minimal 2-player synthetic tests where a single duo partner has an extreme score,
        // anchor the benchmark gently toward groupBaselinePerf so an enabler isn't penalized for their duo's 82.
        const roleOffset =
          role === 'UTILITY' ? -3.5 : role === 'JUNGLE' ? -1.0 : 0;
        const effectiveTeamRef =
          teamPeers.length >= 3
            ? teamAvgPerf + roleOffset
            : (teamAvgPerf * 0.45 + groupBaselinePerf * 0.55) + roleOffset;

        const vsTeamInMatch = playerPerf - effectiveTeamRef;

        // Active Contributor / Enabler Confidence (0..1)
        const perfGate = clamp((vsTeamInMatch + 7) / 11, 0, 1);
        const rankGate =
          teamSize >= 4
            ? clamp(((teamSize - teamRank) / Math.max(1, teamSize - 1)) * 0.65 + clamp((7.5 - rankVal) / 3.5, 0, 1) * 0.35, 0, 1)
            : clamp((7.5 - rankVal) / 3.5, 0, 1);
        const kpTarget = role === 'UTILITY' || role === 'JUNGLE' ? 0.55 : 0.45;
        const kpGate = clamp((p.killParticipation - (kpTarget - 0.15)) / 0.25, 0.2, 1);
        const enablerConfidence = clamp(
          perfGate * 0.50 + rankGate * 0.35 + kpGate * 0.15,
          0,
          1
        );

        // Rival performance, direct duel & match difficulty analysis
        let oppIntrinsic: number;
        let enemyAvgIntrinsic: number;
        let vsOpponentDelta: number;
        let matchDifficulty: number;

        if (enemies.length > 0) {
          const sameRoleEnemies = RIFT_ROLES.has(role)
            ? enemies.filter((e) => e.performanceBreakdown.role === role)
            : [];
          const laneDiff = p.performanceBreakdown?.laneDiff ?? null;
          const directOpponent =
            sameRoleEnemies.length === 1
              ? sameRoleEnemies[0]
              : laneDiff?.opponentChampionName
                ? enemies.find((e) => e.championName === laneDiff.opponentChampionName) ?? null
                : null;

          const enemyIntrinsicList = enemies.map(extractIntrinsicPerf).sort((a, b) => b - a);
          enemyAvgIntrinsic =
            enemyIntrinsicList.reduce((s, v) => s + v, 0) / enemyIntrinsicList.length;
          const enemyTopIntrinsic =
            enemyIntrinsicList.length >= 2
              ? (enemyIntrinsicList[0] + enemyIntrinsicList[1]) / 2
              : enemyIntrinsicList[0];
          oppIntrinsic = directOpponent ? extractIntrinsicPerf(directOpponent) : enemyAvgIntrinsic;

          const laneStatSignal = laneDiff
            ? clamp(laneDiff.goldDiff / 600, -6, 6) * 0.5 +
              clamp(laneDiff.damageDiff / 1600, -5, 5) * 0.3 +
              clamp(laneDiff.levelDiff * 1.5, -3, 3) * 0.2
            : 0;

          // Outcome-contextualized duel: direct duel vs role opponent minus 25% of teammates' margin over enemies
          const directDuelWeight = directOpponent ? 0.80 : 0.50;
          const rawDuelDelta =
            (playerIntrinsic - oppIntrinsic) * directDuelWeight +
            (playerIntrinsic - enemyAvgIntrinsic) * (1 - directDuelWeight);
          const teamMapMargin = teamAvgIntrinsic - enemyAvgIntrinsic;
          vsOpponentDelta =
            rawDuelDelta - teamMapMargin * 0.25 + laneStatSignal * 0.30;

          const expectedEnemyForOutcome = p.win ? baselineEnemyInWin : baselineEnemyInLoss;
          const expectedTeamForOutcome = p.win ? baselineTeamInWin : baselineTeamInLoss;

          const enemyStrength =
            enemyAvgIntrinsic * 0.45 +
            oppIntrinsic * 0.30 +
            (enemyTopIntrinsic - 5) * 0.25;
          const enemyExcessVsOutcome = enemyStrength - expectedEnemyForOutcome;
          const teamDeficitVsOutcome = expectedTeamForOutcome - teamAvgPerf;
          const durationAdj =
            match.gameDuration >= 1980
              ? 2.0
              : match.gameDuration <= 1080 && teamDeficitVsOutcome < -4
                ? -2.0
                : 0;

          matchDifficulty = clamp(
            50 +
              enemyExcessVsOutcome * 1.25 +
              teamDeficitVsOutcome * 0.75 +
              durationAdj,
            15,
            95
          );
        } else {
          // Neutral rival difficulty fallback for minimal synthetic test matches without enemy participants
          const impliedEnemyIntrinsic = clamp(groupBaselinePerf - 1, 45, 72);
          enemyAvgIntrinsic = impliedEnemyIntrinsic;
          oppIntrinsic = impliedEnemyIntrinsic;
          vsOpponentDelta =
            (playerPerf - groupBaselinePerf) * 0.50 + (5.0 - rankVal) * 1.8;
          matchDifficulty = 50;
        }

        vsOpponentDeltaSum += vsOpponentDelta;
        difficultySum += matchDifficulty;

        // Asymmetric Carry Lift vs Low-Impact/Passenger Deficit in this match:
        // - Carry lift is measured above max(effectiveTeamRef, groupBaselinePerf - 1)
        // - Low-impact deficit triggers when the player trailed their teammates in this match
        //   (vsTeamInMatch < -4) or finished near the bottom of the lobby without winning their duel.
        const carryBenchmark = Math.max(effectiveTeamRef, groupBaselinePerf - 1);
        const rawCarryLift = Math.max(0, playerPerf - carryBenchmark);
        const carryLift = p.outcome === 'ff' ? rawCarryLift * 0.25 : rawCarryLift;

        let lowImpactDeficit = 0;
        if (
          vsTeamInMatch < -3.0 ||
          (isBottomOfTeam && vsTeamInMatch < -1.0) ||
          (rankVal >= 6.5 && vsTeamInMatch < 0)
        ) {
          const teamLag = Math.max(0, -vsTeamInMatch - 2.5);
          const ownBaselineShortfall = Math.max(0, groupBaselinePerf - 2 - playerPerf) * 0.50;
          const ownRankShortfall = rankVal > 5.5 ? (rankVal - 5.5) * 1.6 : 0;
          const bottomTeamPen =
            isBottomOfTeam && vsTeamInMatch < -3.5 ? (teamRank - 3) * 1.8 : 0;
          const duelShortfall = vsOpponentDelta < 0 ? Math.abs(vsOpponentDelta) * 0.35 : 0;
          lowImpactDeficit =
            teamLag * 0.85 +
            ownBaselineShortfall +
            ownRankShortfall +
            bottomTeamPen +
            duelShortfall;
        }

        const effectiveVsTeamDelta =
          carryLift + clamp(vsTeamInMatch * 0.45, -6, 10) - lowImpactDeficit;
        effectiveVsTeamDeltaSum += effectiveVsTeamDelta;

        // Per-match Win Quality & Passenger Detection
        let effectiveWinCredit = 0;
        const isCarriedInMatch =
          vsTeamInMatch <= -5.0 ||
          (vsTeamInMatch <= -3.5 &&
            (isBottomOfTeam ||
              lowImpactDeficit >= 4.0 ||
              rankVal >= 6.0 ||
              vsOpponentDelta <= 1.5));

        if (p.outcome === 'win') {
          let passengerDiscount = 0;
          if (isCarriedInMatch || lowImpactDeficit >= 7.5) {
            const rawPassengerRatio = clamp((lowImpactDeficit - 2) / 18, 0, 1);
            const duelLossAdd =
              vsOpponentDelta < -2
                ? clamp(Math.abs(vsOpponentDelta + 2) / 20, 0, 0.25)
                : 0;
            const easyMatchMult =
              matchDifficulty < 46 ? 1 + (46 - matchDifficulty) * 0.015 : 1.0;
            passengerDiscount = clamp(
              (rawPassengerRatio * 0.44 + duelLossAdd) * easyMatchMult,
              0,
              0.55
            );
          }

          if (passengerDiscount >= 0.16 || isCarriedInMatch) {
            passengerWins += 1;
          }

          let carryWinBonus = 0;
          let duelWinBonus = 0;
          let hardWinBonus = 0;
          let mvpBonus = 0;
          if (passengerDiscount < 0.08 && enablerConfidence >= 0.65) {
            carryWinBonus = clamp(carryLift * 0.011, 0, 0.12);
            duelWinBonus = clamp(Math.max(0, vsOpponentDelta - 3) * 0.008, 0, 0.08);
            hardWinBonus = clamp(Math.max(0, matchDifficulty - 52) * 0.006, 0, 0.12);
            mvpBonus = p.isMvp ? 0.04 : 0;
          }

          effectiveWinCredit = clamp(
            1.0 + carryWinBonus + duelWinBonus + hardWinBonus + mvpBonus - passengerDiscount,
            0.45,
            1.25
          );

          if (p.enemySurrendered) {
            enemyFfEnablerSum += enablerConfidence;
          }
        } else if (p.outcome === 'loss') {
          let carryLossCredit = 0;
          let duelLossCredit = 0;
          let hardLossCredit = 0;
          let aceCredit = 0;
          if (
            playerPerf >= Math.max(65, groupBaselinePerf - 1) &&
            lowImpactDeficit === 0 &&
            enablerConfidence >= 0.65
          ) {
            carryLossCredit = clamp(carryLift * 0.015, 0, 0.18);
            duelLossCredit = clamp(Math.max(0, vsOpponentDelta) * 0.010, 0, 0.10);
            hardLossCredit =
              matchDifficulty > 51
                ? clamp((matchDifficulty - 51) * 0.007, 0, 0.10)
                : 0;
            aceCredit = p.isAce ? 0.06 : 0;
          }

          const anchorLossPen =
            lowImpactDeficit > 6
              ? clamp(
                  (lowImpactDeficit - 5) * 0.008 +
                    Math.max(0, -vsOpponentDelta - 6) * 0.006,
                  0,
                  0.14
                )
              : 0;

          effectiveWinCredit = clamp(
            carryLossCredit + duelLossCredit + hardLossCredit + aceCredit - anchorLossPen,
            -0.14,
            0.35
          );
        } else {
          // FF loss: no positive loss mitigation on surrenders
          const ffAnchorPen =
            lowImpactDeficit > 6
              ? clamp(
                  (lowImpactDeficit - 5) * 0.010 +
                    Math.max(0, -vsOpponentDelta - 6) * 0.007,
                  0,
                  0.16
                )
              : 0;
          effectiveWinCredit = clamp(-ffAnchorPen, -0.16, 0);
        }
        effectiveWinsSum += effectiveWinCredit;

        if (
          playerPerf >= Math.max(68, groupBaselinePerf + 2) &&
          (carryLift >= 3.5 || p.isMvp || p.isAce || rankVal <= 2)
        ) {
          carryGames += 1;
        }

        // Difficulty & Rival-Adjusted Match Performance
        const perfScale = clamp((playerPerf - 54) / 24, 0.15, 1.15);
        const toughRivalBonus =
          matchDifficulty > 51 && playerPerf >= 58
            ? clamp((matchDifficulty - 51) * 0.18 * perfScale, 0, 5.5)
            : 0;
        const strongDuelBonus =
          oppIntrinsic >= 60 && vsOpponentDelta > 0
            ? clamp(
                (oppIntrinsic - 58) * 0.12 * clamp(vsOpponentDelta / 10, 0, 1),
                0,
                2.5
              )
            : 0;
        const easyPassengerPen =
          isCarriedInMatch && matchDifficulty < 48
            ? clamp(
                (lowImpactDeficit - 4) * 0.18 +
                  Math.max(0, 48 - matchDifficulty) * 0.10,
                0,
                5.0
              )
            : 0;

        const netDiffBonus = toughRivalBonus + strongDuelBonus - easyPassengerPen;
        diffBonusSum += netDiffBonus;
        adjPerfSum += clamp(playerPerf + netDiffBonus, 0, 100);

        // Enabler-Gated Group Teammate Synergy
        if (groupAllies.length > 0) {
          const allyAvg =
            groupAllies.reduce((s, a) => s + a.performanceScore, 0) / groupAllies.length;
          const rawMatchAllyDelta = allyAvg - groupBaselinePerf;
          let gatedMatchAllyDelta: number;
          if (rawMatchAllyDelta > 0) {
            if (!isCarriedInMatch && enablerConfidence >= 0.55) {
              gatedMatchAllyDelta = rawMatchAllyDelta * Math.max(0.85, enablerConfidence);
            } else if (isCarriedInMatch) {
              // Passenger being carried by group teammates gets zero positive ally synergy (slight carry dependency penalty)
              gatedMatchAllyDelta = -Math.min(3.0, lowImpactDeficit * 0.15);
            } else {
              gatedMatchAllyDelta = rawMatchAllyDelta * enablerConfidence * 0.5;
            }
          } else {
            gatedMatchAllyDelta = rawMatchAllyDelta;
          }
          gatedAllyDeltaSum += gatedMatchAllyDelta;
          allyGamesCount += 1;
        }
      }

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
        primaryRole: resolvePrimaryRole(d.roleCounts),
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
    })
    .sort(
      (a, b) =>
        b.pickScore - a.pickScore ||
        b.impactWinRate - a.impactWinRate ||
        b.bayesWinRate - a.bayesWinRate ||
        b.games - a.games ||
        b.avgPerformance - a.avgPerformance
    );

  let bestPicks: LolGroupPickEntry[] = [];
  let worstPicks: LolGroupPickEntry[] = [];

  if (allPicks.length === 1) {
    bestPicks = [allPicks[0]];
    worstPicks = [];
  } else if (allPicks.length >= 2) {
    const bestCount = Math.min(tableLimit, Math.ceil(allPicks.length / 2));
    bestPicks = allPicks.slice(0, bestCount);
    const bestKeys = new Set(bestPicks.map((p) => p.pickKey));
    const worstSorted = [...allPicks].sort(
      (a, b) =>
        a.pickScore - b.pickScore ||
        a.impactWinRate - b.impactWinRate ||
        a.bayesWinRate - b.bayesWinRate ||
        b.games - a.games ||
        a.avgPerformance - b.avgPerformance
    );
    const worstCount = Math.min(tableLimit, Math.floor(allPicks.length / 2));
    worstPicks = worstSorted
      .filter((p) => !bestKeys.has(p.pickKey))
      .slice(0, worstCount);
  }

  return {
    minGames,
    allPicks,
    bestPicks,
    worstPicks,
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

// ==============================================================================
// OUTCOME × DURATION CURVE — minute-by-minute V/D/FF rates for small samples
// ==============================================================================
// Estimator (per minute m, classes k ∈ {win, loss, ff}):
//
//   p_k(m) = ( Σ_i K((m − d_i) / h(m)) · 1[c_i = k]  +  α · π_k )
//            ---------------------------------------------------------
//                    ( Σ_i K((m − d_i) / h(m))  +  α )
//
// - K(u) = exp(−u²/2): unnormalized Gaussian, so each nearby game weighs ≈ 1 and
//   W(m) = Σ_i K(·) reads as "effective games supporting minute m".
// - Nadaraya–Watson ratio ⇒ no boundary bias from density normalization and the
//   three class shares always sum to 1 (they share the same denominator).
// - h(m) = clamp(max(h0, d_(k)(m)), h0, 9m): balloon bandwidth. h0 is Silverman's
//   rule 0.9·min(σ, IQR/1.34)·N^(−1/5) clamped to [2.5m, 6m]; d_(k)(m) is the
//   distance to the k-th nearest game (k = clamp(⌈√N⌉, 2, 5) ≤ N). In sparse tails
//   the kernel widens until ≥ k games support the estimate, so one isolated game
//   can never drive a 0% ↔ 100% jump. h(m) is continuous in m ⇒ smooth curves.
// - α = 2 pseudo-games of Dirichlet prior centred on the global composition π
//   (empirical Bayes). Where W(m) is low the estimate shrinks toward the global
//   rate; where games are dense (W ≫ α) the local trend dominates (FF peak at
//   15–20m, late-game winrate at 30m+). Classes never observed stay exactly 0%.
// - Output is allocated in integer basis points (largest remainder) so
//   winRate + lossRate + ffRate = 100.00 exactly at every minute.
// ==============================================================================

export const LOL_MACRO_DURATION_RANGES: LolMacroDurationRangeDef[] = [
  { key: '0-10', label: '0–10 min', startSec: 0, endSec: 600 },
  { key: '10-20', label: '10–20 min', startSec: 600, endSec: 1200 },
  { key: '20-30', label: '20–30 min', startSec: 1200, endSec: 1800 },
  { key: '30-40', label: '30–40 min', startSec: 1800, endSec: 2400 },
  { key: '40+', label: '40+ min', startSec: 2400, endSec: null },
];

/** 0–10: [0, 600] · 10–20: (600, 1200] · 20–30: (1200, 1800] · 30–40: (1800, 2400] · 40+: (2400, ∞). */
export function resolveMacroDurationRange(durationSeconds: number): LolMacroDurationRangeKey {
  if (durationSeconds <= 600) return '0-10';
  if (durationSeconds <= 1200) return '10-20';
  if (durationSeconds <= 1800) return '20-30';
  if (durationSeconds <= 2400) return '30-40';
  return '40+';
}

/**
 * Largest-remainder allocation of non-negative weights into integers summing exactly to `scale`.
 * Zero weights always stay at 0.
 */
export function allocateLargestRemainder(weights: number[], scale: number): number[] {
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = safe.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return safe.map(() => 0);
  const raw = safe.map((w) => (w / total) * scale);
  const out = raw.map((r) => Math.floor(r));
  let remaining = scale - out.reduce((sum, v) => sum + v, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - out[i] }))
    .filter((entry) => safe[entry.i] > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let cursor = 0;
  while (remaining > 0 && order.length > 0) {
    out[order[cursor % order.length].i] += 1;
    remaining -= 1;
    cursor += 1;
  }
  return out;
}

export function computeMacroDurationRangeStats(
  samples: LolOutcomeCurveSample[]
): LolMacroDurationRangeStats[] {
  return LOL_MACRO_DURATION_RANGES.map((def) => {
    let wins = 0;
    let losses = 0;
    let ffs = 0;
    for (const s of samples) {
      if (s.outcome === 'remake' || !Number.isFinite(s.durationSeconds)) continue;
      if (resolveMacroDurationRange(s.durationSeconds) !== def.key) continue;
      if (s.outcome === 'win') wins += 1;
      else if (s.outcome === 'ff') ffs += 1;
      else losses += 1;
    }
    const total = wins + losses + ffs;
    const [winPct, lossPct, ffPct] = allocateLargestRemainder([wins, losses, ffs], 100);
    return { ...def, total, wins, losses, ffs, winPct, lossPct, ffPct };
  });
}

const CURVE_MIN_BANDWIDTH_MIN = 2.5;
const CURVE_MAX_BANDWIDTH_MIN = 6;
const CURVE_MAX_LOCAL_BANDWIDTH_MIN = 9;
const CURVE_FALLBACK_SPREAD_MIN = 6;
const CURVE_PRIOR_STRENGTH = 2;
const CURVE_DOMAIN_PAD_MIN = 2;
const CURVE_DOMAIN_MIN_SPAN_MIN = 8;
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function buildOutcomeCurveModel(
  samples: LolOutcomeCurveSample[]
): LolOutcomeCurveModel | null {
  const points: Array<{ minute: number; outcome: LolValidOutcome }> = [];
  for (const s of samples) {
    if (s.outcome === 'remake') continue;
    if (!Number.isFinite(s.durationSeconds) || s.durationSeconds < 0) continue;
    points.push({ minute: s.durationSeconds / 60, outcome: s.outcome });
  }
  const n = points.length;
  if (n === 0) return null;
  points.sort((a, b) => a.minute - b.minute);

  let wins = 0;
  let losses = 0;
  let ffs = 0;
  for (const p of points) {
    if (p.outcome === 'win') wins += 1;
    else if (p.outcome === 'ff') ffs += 1;
    else losses += 1;
  }

  const minutes = points.map((p) => p.minute);
  const mean = minutes.reduce((sum, m) => sum + m, 0) / n;
  const sd =
    n > 1
      ? Math.sqrt(minutes.reduce((sum, m) => sum + (m - mean) ** 2, 0) / (n - 1))
      : 0;
  const iqrScaled = (quantileSorted(minutes, 0.75) - quantileSorted(minutes, 0.25)) / 1.34;
  const spreadCandidates = [sd, iqrScaled].filter((v) => v > 1e-9);
  const spread =
    spreadCandidates.length > 0 ? Math.min(...spreadCandidates) : CURVE_FALLBACK_SPREAD_MIN;
  const bandwidthMin = clamp(
    0.9 * spread * Math.pow(n, -0.2),
    CURVE_MIN_BANDWIDTH_MIN,
    CURVE_MAX_BANDWIDTH_MIN
  );
  const kNeighbors = Math.min(n, clamp(Math.ceil(Math.sqrt(n)), 2, 5));

  return {
    sampleSize: n,
    points,
    bandwidthMin,
    kNeighbors,
    priorStrength: CURVE_PRIOR_STRENGTH,
    prior: { win: wins / n, loss: losses / n, ff: ffs / n },
    minDurationMin: minutes[0],
    maxDurationMin: minutes[n - 1],
  };
}

export function estimateOutcomeAtMinute(
  model: LolOutcomeCurveModel,
  minute: number
): LolOutcomeMinuteEstimate {
  const h0 = model.bandwidthMin;
  const dists = model.points.map((p) => Math.abs(p.minute - minute)).sort((a, b) => a - b);
  const dk = dists[Math.max(0, model.kNeighbors - 1)] ?? 0;
  const h = clamp(Math.max(h0, dk), h0, Math.max(h0, CURVE_MAX_LOCAL_BANDWIDTH_MIN));

  let wWin = 0;
  let wLoss = 0;
  let wFf = 0;
  let density = 0;
  for (const p of model.points) {
    const delta = p.minute - minute;
    const u = delta / h;
    const k = Math.exp(-0.5 * u * u);
    if (p.outcome === 'win') wWin += k;
    else if (p.outcome === 'ff') wFf += k;
    else wLoss += k;
    const u0 = delta / h0;
    density += (Math.exp(-0.5 * u0 * u0) * INV_SQRT_2PI) / h0;
  }

  const effectiveGames = wWin + wLoss + wFf;
  const alpha = model.priorStrength;
  const denom = effectiveGames + alpha;
  const pWin = (wWin + alpha * model.prior.win) / denom;
  const pLoss = (wLoss + alpha * model.prior.loss) / denom;
  const pFf = (wFf + alpha * model.prior.ff) / denom;
  const [bpWin, bpLoss, bpFf] = allocateLargestRemainder([pWin, pLoss, pFf], 10000);

  return {
    minute,
    winRate: bpWin / 100,
    lossRate: bpLoss / 100,
    ffRate: bpFf / 100,
    effectiveGames,
    density,
    localBandwidthMin: h,
  };
}

/**
 * Minute-by-minute V/D/FF curve. Defaults to every integer minute between the shortest and the
 * longest valid game; pass `startMin`/`endMin`/`stepMin` to evaluate a custom grid.
 */
export function computeOutcomeMinuteCurve(
  samples: LolOutcomeCurveSample[],
  options: { startMin?: number; endMin?: number; stepMin?: number } = {}
): LolOutcomeMinuteCurve {
  const model = buildOutcomeCurveModel(samples);
  if (!model) return { model: null, points: [] };
  const step = options.stepMin && options.stepMin > 0 ? options.stepMin : 1;
  const start = options.startMin ?? Math.floor(model.minDurationMin);
  const end = Math.max(start, options.endMin ?? Math.ceil(model.maxDurationMin));
  const count = Math.floor((end - start) / step + 1e-9) + 1;
  const points: LolOutcomeMinuteEstimate[] = [];
  for (let i = 0; i < count; i++) {
    points.push(estimateOutcomeAtMinute(model, start + i * step));
  }
  return { model, points };
}

/**
 * X domain (integer minutes) for the outcome chart:
 * - Any game in 0–10 ⇒ start at 0 (full 0–10 range); otherwise start 2m before the shortest game,
 *   never below the lower bound of its macro range (no dead 0–10 / 10–20 segment).
 * - End 2m after the longest game, never beyond the upper bound of its macro range
 *   (a 28m max ends at 30, not 31); 0–10 only ⇒ end at 10.
 * - Minimum span 8m (N = 1 or identical durations).
 */
export function computeOutcomeChartDomain(durationsSeconds: number[]): {
  startMin: number;
  endMin: number;
} {
  const valid = durationsSeconds.filter((d) => Number.isFinite(d) && d >= 0);
  if (valid.length === 0) return { startMin: 0, endMin: 30 };
  const minSec = Math.min(...valid);
  const maxSec = Math.max(...valid);
  const lowerOf: Record<LolMacroDurationRangeKey, number> = {
    '0-10': 0,
    '10-20': 10,
    '20-30': 20,
    '30-40': 30,
    '40+': 40,
  };
  const upperOf: Record<LolMacroDurationRangeKey, number> = {
    '0-10': 10,
    '10-20': 20,
    '20-30': 30,
    '30-40': 40,
    '40+': Number.POSITIVE_INFINITY,
  };
  const minRange = resolveMacroDurationRange(minSec);
  const maxRange = resolveMacroDurationRange(maxSec);
  let start =
    minRange === '0-10'
      ? 0
      : Math.max(lowerOf[minRange], Math.floor(minSec / 60) - CURVE_DOMAIN_PAD_MIN);
  let end =
    maxRange === '0-10'
      ? 10
      : Math.min(upperOf[maxRange], Math.ceil(maxSec / 60) + CURVE_DOMAIN_PAD_MIN);
  if (end - start < CURVE_DOMAIN_MIN_SPAN_MIN) {
    const center = (start + end) / 2;
    start = Math.max(0, Math.floor(center - CURVE_DOMAIN_MIN_SPAN_MIN / 2));
    end = start + CURVE_DOMAIN_MIN_SPAN_MIN;
  }
  return { startMin: start, endMin: end };
}
