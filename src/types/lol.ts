// ==============================================================================
// BOLUDOS GAMING — LEAGUE OF LEGENDS DOMAIN & RIOT API v5 TYPES
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
  | 'mode_5v5'
  | 'aram'
  | 'arena'
  | 'other';

export type LolSpecificQueueCategory = Exclude<LolQueueCategory, 'all'>;

export type LolTimeRangeFilter = '7d' | '30d' | '90d' | 'all';

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

// ------------------------------------------------------------------------------
// RIOT MATCH-v5 DTO INTERFACES
// ------------------------------------------------------------------------------

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
  takedowns?: number;
  multikills?: number;
  killingSprees?: number;
  jungleCsBefore10Minutes?: number;
  wardTakedowns?: number;
  wardTakedownsBefore20M?: number;
  gameLength?: number;
  [key: string]: number | boolean | string | undefined;
}

export interface RiotMatchV5Participant {
  // Identity
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

  // Champion & lane
  championId: number;
  championName: string;
  champLevel: number;
  champExperience?: number;
  teamPosition?: string;
  individualPosition?: string;
  lane?: string;
  role?: string;

  // Outcome flags
  win: boolean;
  gameEndedInSurrender?: boolean;
  gameEndedInEarlySurrender?: boolean;
  teamEarlySurrendered?: boolean;

  // KDA & combat
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

  // Damage
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

  // Heal, shield & CC
  totalHeal?: number;
  totalHealsOnTeammates?: number;
  totalUnitsHealed?: number;
  totalDamageShieldedOnTeammates?: number;
  timeCCingOthers?: number;
  totalTimeCCDealt?: number;

  // Economy & farm
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

  // Vision
  visionScore: number;
  wardsPlaced?: number;
  wardsKilled?: number;
  detectorWardsPlaced?: number;

  // Objectives
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

  // Spells, items & runes
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

  // Pings (all 14 Riot Match-v5 ping fields)
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

  // Arena & misc
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

// ------------------------------------------------------------------------------
// SUMMARY & ANALYTICS TYPES
// ------------------------------------------------------------------------------

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
  totalTimeSpentDead?: number;
  enemyMissingPings?: number;
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

export type LolDurationBucketKey = '0-5' | '0-20' | '20-30' | '30+';

export interface LolDurationBucketStats {
  key: LolDurationBucketKey;
  label: string;
  total: number;
  wins: number;
  losses: number;
  ffs: number;
  remakes: number;
  winRate: number;
  ffRate: number;
  lossRate: number;
}

export interface LolChampionSummary {
  championName: string;
  championId: number;
  games: number;
  wins: number;
  losses: number;
  ffs: number;
  winRate: number;
  avgPerformance: number;
  avgKda: number;
  avgCsPerMin: number;
}

export interface LolPlayerAggregateStats {
  totalGames: number;
  scoredGames: number;
  wins: number;
  losses: number;
  ffs: number;
  remakes: number;
  winRate: number;
  ffRate: number;
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
  topChampions: LolChampionSummary[];
  durationBuckets: LolDurationBucketStats[];
}

export interface LolPersonalVsGroupStats {
  personal: LolPlayerAggregateStats;
  inGroup: LolPlayerAggregateStats;
  soloOnly: LolPlayerAggregateStats;
  deltas: {
    winRateDelta: number;
    performanceDelta: number;
    kdaDelta: number;
    ffRateDelta: number;
  };
}

export interface LolGroupLeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl: string;
  account: LolAccount;
  groupRankScore: number;
  groupPerformanceAvg: number;
  groupGamesTotal: number;
  groupGamesScored: number;
  groupWins: number;
  groupLosses: number;
  groupFfs: number;
  groupRemakes: number;
  groupWinRate: number;
  groupKdaAvg: number;
  groupMvpCount: number;
  groupAceCount: number;
  personalPerformanceAvg: number;
  personalGamesTotal: number;
  personalWinRate: number;
  topGroupChampion: LolChampionSummary | null;
  topDuoPartner: {
    userId: string;
    displayName: string;
    gameName: string;
    gamesTogether: number;
    winRateTogether: number;
  } | null;
}

export type LolRiftRoleKey = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY';

export interface LolRoleLeaderboardEntry {
  role: LolRiftRoleKey;
  userId: string;
  displayName: string;
  avatarUrl: string;
  account: LolAccount;
  roleRankScore: number;
  avgPerformance: number;
  games: number;
  wins: number;
  losses: number;
  ffs: number;
  winRate: number;
  avgKda: number;
  mvpCount: number;
  topChampion: LolChampionSummary | null;
}

export type LolRoleLeaderboardByLane = Record<LolRiftRoleKey, LolRoleLeaderboardEntry[]>;

export type LolGroupRecordTone = 'good' | 'bad' | 'ff' | 'fun';

export type LolGroupRecordId =
  | 'most_time_dead'
  | 'highest_kp'
  | 'most_kills'
  | 'least_kills'
  | 'best_kda'
  | 'most_deaths'
  | 'highest_dpm'
  | 'highest_cs_min'
  | 'highest_vision'
  | 'highest_ff_rate'
  | 'most_mia_pings'
  | 'best_single_game';

export interface LolGroupRecordEntry {
  id: LolGroupRecordId;
  title: string;
  description: string;
  tone: LolGroupRecordTone;
  valueLabel: string;
  subLabel: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  gameName: string;
  gamesSample: number;
  championName?: string;
  matchId?: string;
}
