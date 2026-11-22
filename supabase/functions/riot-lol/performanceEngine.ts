// ==============================================================================
// BOLUDOS GAMING — DENO EDGE FUNCTION PERFORMANCE ENGINE (BG-PERF v2)
// ==============================================================================
// Self-contained Deno-compatible mirror of the BG-PERF v2 scoring engine and
// Riot Match-v5 DTO interfaces for `supabase/functions/riot-lol/index.ts`.
// Zero external imports.
// ==============================================================================

export type LolPlatform =
  | 'la2'
  | 'la1'
  | 'br1'
  | 'na1'
  | 'euw1'
  | 'eun1'
  | 'kr'
  | 'jp1'
  | 'oc1'
  | 'tr1'
  | 'ru'
  | 'ph2'
  | 'sg2'
  | 'th2'
  | 'tw2'
  | 'vn2';

export type LolRegionalCluster = 'americas' | 'europe' | 'asia' | 'sea';

export interface LolRankedEntry {
  queueType: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR' | (string & {});
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak?: boolean;
  veteran?: boolean;
  freshBlood?: boolean;
}

export interface LolAccount {
  userId: string;
  puuid: string;
  isPrimary?: boolean;
  gameName: string;
  tagLine: string;
  platform: LolPlatform;
  regionalCluster: LolRegionalCluster;
  summonerLevel: number;
  profileIconId: number;
  rankedSolo: LolRankedEntry | null;
  rankedFlex: LolRankedEntry | null;
  ddragonVersion: string | null;
  lastSyncedAt: string | null;
}

export type LolMatchOutcome = 'win' | 'loss' | 'ff' | 'remake';

export type LolQueueCategory =
  | 'all'
  | 'ranked_solo'
  | 'ranked_flex'
  | 'normal'
  | 'aram'
  | 'arena'
  | 'other';

export type LolRoleKey =
  | 'TOP'
  | 'JUNGLE'
  | 'MIDDLE'
  | 'BOTTOM'
  | 'UTILITY'
  | 'ARAM'
  | 'ARENA';

export type LolPerformanceGrade = 'S+' | 'S' | 'A+' | 'A' | 'B' | 'C' | 'D';

export interface LolPerformancePillarScores {
  combat: number;
  impact: number;
  economy: number;
  objectives: number;
  vision: number;
  dominance: number;
}

export type LolPerformanceLaneDiff = {
  opponentChampionName: string;
  csDiff: number;
  goldDiff: number;
  damageDiff: number;
  visionDiff: number;
  kdaDiff: number;
  levelDiff: number;
} | null;

export interface LolPerformanceBreakdown {
  pillars: LolPerformancePillarScores;
  weights: LolPerformancePillarScores;
  role: LolRoleKey;
  queueCategory: Exclude<LolQueueCategory, 'all'>;
  isRemake: boolean;
  laneDiff: LolPerformanceLaneDiff;
  outcomeAdjustment: number;
  mechanicsBonus: number;
  drivers: string[];
}

export interface RiotMatchV5Metadata {
  dataVersion: string;
  matchId: string;
  participants: string[];
}

export interface RiotMatchV5PerkSelection {
  perk: number;
  var1: number;
  var2: number;
  var3: number;
}

export interface RiotMatchV5PerkStyle {
  description: 'primaryStyle' | 'subStyle' | (string & {});
  selections: RiotMatchV5PerkSelection[];
  style: number;
}

export interface RiotMatchV5Perks {
  statPerks: {
    defense: number;
    flex: number;
    offense: number;
  };
  styles: RiotMatchV5PerkStyle[];
}

export interface RiotMatchV5TeamObjective {
  first: boolean;
  kills: number;
}

export interface RiotMatchV5TeamBan {
  championId: number;
  pickTurn: number;
}

export interface RiotMatchV5Team {
  teamId: number;
  win: boolean;
  bans: RiotMatchV5TeamBan[];
  objectives: {
    baron?: RiotMatchV5TeamObjective;
    champion?: RiotMatchV5TeamObjective;
    dragon?: RiotMatchV5TeamObjective;
    horde?: RiotMatchV5TeamObjective;
    inhibitor?: RiotMatchV5TeamObjective;
    riftHerald?: RiotMatchV5TeamObjective;
    tower?: RiotMatchV5TeamObjective;
    atakhan?: RiotMatchV5TeamObjective;
  };
}

export interface RiotMatchV5Challenges {
  kda?: number;
  killParticipation?: number;
  damagePerMinute?: number;
  goldPerMinute?: number;
  teamDamagePercentage?: number;
  damageTakenOnTeamPercentage?: number;
  visionScorePerMinute?: number;
  visionScoreAdvantageLaneOpponent?: number;
  laneMinionsFirst10Minutes?: number;
  maxCSAdvantageOnLaneOpponent?: number;
  maxLevelLeadLaneOpponent?: number;
  laningPhaseGoldAdvantagePerXMinutes?: number;
  turretPlatesTaken?: number;
  turretTakedowns?: number;
  soloKills?: number;
  skillshotsDodged?: number;
  skillshotsHit?: number;
  survivedSingleDigitHpCount?: number;
  flawlessAces?: number;
  objectivesStolen?: number;
  objectivesStolenAssists?: number;
  controlWardsPlaced?: number;
  controlWardTimeCoverageInRiverOrEnemyHalf?: number;
  effectiveHealAndShielding?: number;
  saveAllyFromDeath?: number;
  immobilizeAndKillWithAlly?: number;
  scuttleCrabKills?: number;
  junglerKillsEarlyJungle?: number;
  dragonTakedowns?: number;
  baronTakedowns?: number;
  riftHeraldTakedowns?: number;
  voidMonsterKills?: number;
  epicMonsterSteals?: number;
  bountyGold?: number;
  highestChampionDamage?: number | boolean;
  highestCrowdControlScore?: number | boolean;
  highestWardKills?: number | boolean;
  [key: string]: number | boolean | string | undefined;
}

export interface RiotMatchV5Participant {
  puuid: string;
  participantId: number;
  teamId: number;
  riotIdGameName?: string;
  riotIdTagline?: string;
  riotIdTagLine?: string;
  summonerName?: string;
  summonerId?: string;
  profileIcon?: number;
  summonerLevel?: number;
  championId: number;
  championName: string;
  champLevel: number;
  champExperience?: number;
  teamPosition?: string;
  individualPosition?: string;
  lane?: string;
  role?: string;
  win: boolean;
  gameEndedInSurrender?: boolean;
  gameEndedInEarlySurrender?: boolean;
  teamEarlySurrendered?: boolean;
  kills: number;
  deaths: number;
  assists: number;
  doubleKills?: number;
  tripleKills?: number;
  quadraKills?: number;
  pentaKills?: number;
  unrealKills?: number;
  killingSprees?: number;
  largestKillingSpree?: number;
  largestMultiKill?: number;
  firstBloodKill?: boolean;
  firstBloodAssist?: boolean;
  firstTowerKill?: boolean;
  firstTowerAssist?: boolean;
  longestTimeSpentLiving?: number;
  totalTimeSpentDead?: number;
  largestCriticalStrike?: number;
  totalDamageDealt?: number;
  physicalDamageDealt?: number;
  magicDamageDealt?: number;
  trueDamageDealt?: number;
  totalDamageDealtToChampions: number;
  physicalDamageDealtToChampions?: number;
  magicDamageDealtToChampions?: number;
  trueDamageDealtToChampions?: number;
  totalDamageTaken: number;
  physicalDamageTaken?: number;
  magicDamageTaken?: number;
  trueDamageTaken?: number;
  damageSelfMitigated?: number;
  damageDealtToBuildings?: number;
  damageDealtToObjectives?: number;
  damageDealtToTurrets?: number;
  totalHeal?: number;
  totalHealsOnTeammates?: number;
  totalUnitsHealed?: number;
  totalDamageShieldedOnTeammates?: number;
  timeCCingOthers?: number;
  totalTimeCCDealt?: number;
  goldEarned: number;
  goldSpent?: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  totalAllyJungleMinionsKilled?: number;
  totalEnemyJungleMinionsKilled?: number;
  consumablesPurchased?: number;
  itemsPurchased?: number;
  sightWardsBoughtInGame?: number;
  visionWardsBoughtInGame?: number;
  bountyLevel?: number;
  visionScore: number;
  wardsPlaced?: number;
  wardsKilled?: number;
  detectorWardsPlaced?: number;
  baronKills?: number;
  dragonKills?: number;
  inhibitorKills?: number;
  inhibitorTakedowns?: number;
  inhibitorsLost?: number;
  nexusKills?: number;
  nexusTakedowns?: number;
  nexusLost?: number;
  objectivesStolen?: number;
  objectivesStolenAssists?: number;
  turretKills?: number;
  turretTakedowns?: number;
  turretsLost?: number;
  summoner1Id: number;
  summoner2Id: number;
  summoner1Casts?: number;
  summoner2Casts?: number;
  spell1Casts?: number;
  spell2Casts?: number;
  spell3Casts?: number;
  spell4Casts?: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  perks?: RiotMatchV5Perks;
  allInPings?: number;
  assistMePings?: number;
  basicPings?: number;
  commandPings?: number;
  dangerPings?: number;
  enemyMissingPings?: number;
  enemyVisionPings?: number;
  getBackPings?: number;
  holdPings?: number;
  needVisionPings?: number;
  onMyWayPings?: number;
  pushPings?: number;
  retreatPings?: number;
  visionClearedPings?: number;
  placement?: number;
  playerSubteamId?: number;
  subteamPlacement?: number;
  playerAugment1?: number;
  playerAugment2?: number;
  playerAugment3?: number;
  playerAugment4?: number;
  playerAugment5?: number;
  playerAugment6?: number;
  eligibleForProgression?: boolean;
  challenges?: RiotMatchV5Challenges;
  [extra: string]: unknown;
}

export interface RiotMatchV5Info {
  endOfGameResult?: string;
  gameCreation: number;
  gameDuration: number;
  gameEndTimestamp?: number;
  gameId: number;
  gameMode: string;
  gameName?: string;
  gameStartTimestamp: number;
  gameType: string;
  gameVersion: string;
  mapId: number;
  participants: RiotMatchV5Participant[];
  platformId: string;
  queueId: number;
  teams: RiotMatchV5Team[];
  tournamentCode?: string;
}

export interface RiotMatchV5 {
  metadata: RiotMatchV5Metadata;
  info: RiotMatchV5Info;
}

export interface LolMatchTeamSummary {
  teamId: number;
  win: boolean;
  bans: RiotMatchV5TeamBan[];
  objectives: RiotMatchV5Team['objectives'];
  totalKills: number;
  totalDamageToChampions: number;
  totalGold: number;
}

export interface LolMatchParticipantSummary {
  matchId: string;
  puuid: string;
  participantId: number;
  teamId: number;
  riotIdGameName: string;
  riotIdTagLine: string;
  summonerName: string;
  championId: number;
  championName: string;
  champLevel: number;
  teamPosition: string;
  individualPosition: string;
  win: boolean;
  gameEndedInSurrender: boolean;
  gameEndedInEarlySurrender: boolean;
  teamEarlySurrendered: boolean;
  outcome: LolMatchOutcome;
  enemySurrendered: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  cs: number;
  csPerMin: number;
  goldEarned: number;
  damageToChampions: number;
  damageTaken: number;
  damageToObjectives: number;
  damageToTurrets: number;
  visionScore: number;
  killParticipation: number;
  summoner1Id: number;
  summoner2Id: number;
  primaryRuneId: number | null;
  primaryStyleId: number | null;
  subStyleId: number | null;
  items: number[];
  performanceScore: number;
  performanceGrade: LolPerformanceGrade;
  performanceBreakdown: LolPerformanceBreakdown;
  matchRank: number;
  isMvp: boolean;
  isAce: boolean;
  highlights: string[];
  rawParticipant?: RiotMatchV5Participant;
}

export interface LolMatchSummary {
  matchId: string;
  platformId: string;
  regionalCluster: LolRegionalCluster;
  queueId: number;
  queueCategory: Exclude<LolQueueCategory, 'all'>;
  gameMode: string;
  gameType: string;
  gameVersion: string;
  mapId: number;
  gameCreation: number;
  gameStartTimestamp: number;
  gameEndTimestamp: number | null;
  gameDuration: number;
  endOfGameResult: string | null;
  participantPuuids: string[];
  teams: LolMatchTeamSummary[];
  participants: LolMatchParticipantSummary[];
  fetchedAt?: string;
  rawMatch?: RiotMatchV5;
}

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

export function isValidLolPlatform(value: string): value is LolPlatform {
  return Object.prototype.hasOwnProperty.call(PLATFORM_TO_CLUSTER, value);
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
  if (queueId === 450 || queueId === 720 || queueId === 930 || gameMode === 'ARAM') {
    return 'aram';
  }
  if (queueId === 1700 || queueId === 1710 || gameMode === 'CHERRY') {
    return 'arena';
  }
  return 'other';
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
  _mins: number,
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
  allContexts: ParticipantContext[]
): { laneDiff: LolPerformanceLaneDiff; dominance: number } {
  const { participant: p, role, normalizedTeamPos } = ctx;

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
    {
      key: 'economy',
      label:
        role === 'UTILITY' || role === 'ARENA'
          ? 'Buena eficiencia de oro'
          : `Economía (${round1(csPerMin)} CS/m)`,
    },
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
      return {
        ctx,
        pillars: { combat: 0, impact: 0, economy: 0, objectives: 0, vision: 0, dominance: 0 },
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
    const { laneDiff, dominance } = computeLaneDiffAndDominance(ctx, contexts);

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
