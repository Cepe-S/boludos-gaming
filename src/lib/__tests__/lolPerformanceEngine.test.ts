import { describe, it, expect } from 'vitest';
import {
  allocateLargestRemainder,
  buildMatchSummaryFromRiotMatch,
  buildOutcomeCurveModel,
  buildPuuidToUserIdMap,
  classifyMatchOutcome,
  computeDurationBuckets,
  computeGroupAggregateStats,
  computeGroupLeaderboard,
  computeGroupLeaderboardByRole,
  computeGroupPicks,
  computeGroupRecords,
  computeMacroDurationRangeStats,
  computeOutcomeChartDomain,
  computeOutcomeMinuteCurve,
  computePersonalRecords,
  computePlayerAggregates,
  computePlayerChampionDetail,
  countGroupMembersInMatch,
  DEFAULT_LOL_QUEUE_FILTERS,
  DEFAULT_LOL_TIME_RANGE,
  estimateOutcomeAtMinute,
  filterMatchesGlobally,
  getGradeFromScore,
  getQueueCategory,
  getRegionalClusterForPlatform,
  getUserAccounts,
  getUserPuuids,
  groupAccountsByUser,
  isGroupMatch,
  resolveGroupMatchOutcome,
  resolveMacroDurationRange,
  resolveParticipantRole,
  resolveUserPrimaryAccount,
  ROLE_WEIGHT_MATRIX,
  scoreMatchParticipants,
} from '../lolPerformanceEngine';
import { getChampionSplashUrl } from '../lolDdragon';
import { buildDemoLolDataset } from '../lolDemoData';
import type {
  LolAccount,
  LolMatchSummary,
  LolOutcomeCurveSample,
  LolRoleKey,
  RiotMatchV5,
  RiotMatchV5Participant,
} from '../../types/lol';

function makeParticipant(
  overrides: Partial<RiotMatchV5Participant> = {}
): RiotMatchV5Participant {
  return {
    puuid: 'puuid-default',
    participantId: 1,
    teamId: 100,
    riotIdGameName: 'Boludo',
    riotIdTagline: 'LAS',
    summonerName: 'Boludo',
    championId: 222,
    championName: 'Jinx',
    champLevel: 15,
    teamPosition: 'BOTTOM',
    individualPosition: 'BOTTOM',
    win: true,
    gameEndedInSurrender: false,
    gameEndedInEarlySurrender: false,
    teamEarlySurrendered: false,
    kills: 6,
    deaths: 3,
    assists: 7,
    doubleKills: 1,
    tripleKills: 0,
    quadraKills: 0,
    pentaKills: 0,
    largestKillingSpree: 3,
    firstBloodKill: false,
    firstBloodAssist: false,
    firstTowerKill: false,
    firstTowerAssist: false,
    totalTimeSpentDead: 75,
    totalDamageDealtToChampions: 22000,
    totalDamageTaken: 16000,
    damageSelfMitigated: 9000,
    damageDealtToObjectives: 7500,
    damageDealtToTurrets: 4200,
    totalHealsOnTeammates: 0,
    totalDamageShieldedOnTeammates: 0,
    timeCCingOthers: 14,
    goldEarned: 13200,
    goldSpent: 12400,
    totalMinionsKilled: 205,
    neutralMinionsKilled: 12,
    visionWardsBoughtInGame: 2,
    visionScore: 26,
    wardsPlaced: 11,
    wardsKilled: 3,
    detectorWardsPlaced: 2,
    baronKills: 0,
    dragonKills: 0,
    turretTakedowns: 3,
    inhibitorTakedowns: 1,
    objectivesStolen: 0,
    objectivesStolenAssists: 0,
    summoner1Id: 4,
    summoner2Id: 7,
    item0: 3031,
    item1: 3085,
    item2: 3006,
    item3: 3036,
    item4: 3072,
    item5: 0,
    item6: 3363,
    perks: {
      statPerks: { defense: 5001, flex: 5008, offense: 5005 },
      styles: [
        {
          description: 'primaryStyle',
          style: 8000,
          selections: [{ perk: 8008, var1: 100, var2: 0, var3: 0 }],
        },
        {
          description: 'subStyle',
          style: 8300,
          selections: [{ perk: 8304, var1: 1, var2: 0, var3: 0 }],
        },
      ],
    },
    ...overrides,
  };
}

function makeStandard5v5Match(params: {
  matchId?: string;
  queueId?: number;
  gameMode?: string;
  gameDuration?: number;
  winningTeamId?: 100 | 200;
  gameEndedInSurrender?: boolean;
  gameEndedInEarlySurrender?: boolean;
  participantOverrides?: Array<Partial<RiotMatchV5Participant>>;
}): RiotMatchV5 {
  const {
    matchId = 'LA2_100001',
    queueId = 420,
    gameMode = 'CLASSIC',
    gameDuration = 1800,
    winningTeamId = 100,
    gameEndedInSurrender = false,
    gameEndedInEarlySurrender = false,
    participantOverrides = [],
  } = params;

  const roles: Array<{
    pos: string;
    champId: number;
    champName: string;
  }> = [
    { pos: 'TOP', champId: 86, champName: 'Garen' },
    { pos: 'JUNGLE', champId: 64, champName: 'LeeSin' },
    { pos: 'MIDDLE', champId: 103, champName: 'Ahri' },
    { pos: 'BOTTOM', champId: 222, champName: 'Jinx' },
    { pos: 'UTILITY', champId: 412, champName: 'Thresh' },
  ];

  const participants: RiotMatchV5Participant[] = [];
  for (let teamIdx = 0; teamIdx < 2; teamIdx++) {
    const teamId = teamIdx === 0 ? 100 : 200;
    const isWin = teamId === winningTeamId;
    for (let roleIdx = 0; roleIdx < 5; roleIdx++) {
      const idx = teamIdx * 5 + roleIdx;
      const roleSpec = roles[roleIdx];
      const base = makeParticipant({
        puuid: `puuid-t${teamId}-${roleSpec.pos.toLowerCase()}`,
        participantId: idx + 1,
        teamId,
        riotIdGameName: `Player${idx + 1}`,
        riotIdTagline: 'LAS',
        championId: roleSpec.champId + teamIdx * 1000,
        championName: teamIdx === 0 ? roleSpec.champName : `Opp${roleSpec.champName}`,
        teamPosition: roleSpec.pos,
        individualPosition: roleSpec.pos,
        win: isWin,
        gameEndedInSurrender,
        gameEndedInEarlySurrender,
        teamEarlySurrendered: !isWin && gameEndedInEarlySurrender,
        kills: isWin ? 6 : 4,
        deaths: isWin ? 3 : 6,
        assists: isWin ? 8 : 5,
        totalDamageDealtToChampions: roleSpec.pos === 'UTILITY' ? 8500 : 21000,
        goldEarned: roleSpec.pos === 'UTILITY' ? 8800 : 12800,
        totalMinionsKilled: roleSpec.pos === 'UTILITY' ? 28 : roleSpec.pos === 'JUNGLE' ? 22 : 195,
        neutralMinionsKilled: roleSpec.pos === 'JUNGLE' ? 145 : 8,
        visionScore: roleSpec.pos === 'UTILITY' ? 58 : roleSpec.pos === 'JUNGLE' ? 32 : 22,
        ...(participantOverrides[idx] ?? {}),
      });
      participants.push(base);
    }
  }

  return {
    metadata: {
      dataVersion: '2',
      matchId,
      participants: participants.map((p) => p.puuid),
    },
    info: {
      endOfGameResult: 'GameComplete',
      gameCreation: 1730000000000,
      gameDuration,
      gameEndTimestamp: 1730000000000 + gameDuration * 1000,
      gameId: 100001,
      gameMode,
      gameStartTimestamp: 1730000000000,
      gameType: 'MATCHED_GAME',
      gameVersion: '15.22.1',
      mapId: queueId === 450 ? 12 : queueId === 1700 ? 30 : 11,
      participants,
      platformId: 'LA2',
      queueId,
      teams: [
        { teamId: 100, win: winningTeamId === 100, bans: [], objectives: {} },
        { teamId: 200, win: winningTeamId === 200, bans: [], objectives: {} },
      ],
    },
  };
}

function makeAccount(overrides: Partial<LolAccount> = {}): LolAccount {
  return {
    userId: 'user-1',
    puuid: 'puuid-1',
    gameName: 'Santi',
    tagLine: 'LAS',
    platform: 'la2',
    regionalCluster: 'americas',
    summonerLevel: 250,
    profileIconId: 5001,
    rankedSolo: null,
    rankedFlex: null,
    ddragonVersion: '15.22.1',
    lastSyncedAt: '2026-11-20T00:00:00.000Z',
    ...overrides,
  };
}

function buildSyntheticSummary(params: {
  matchId: string;
  puuids: string[];
  queueId?: number;
  gameDuration?: number;
  gameCreation?: number;
  playerSpecs: Array<{
    puuid: string;
    teamId?: number;
    championId?: number;
    championName?: string;
    role?: LolRoleKey;
    win: boolean;
    surrender?: boolean;
    earlySurrender?: boolean;
    kills?: number;
    deaths?: number;
    assists?: number;
    cs?: number;
    csPerMin?: number;
    goldEarned?: number;
    damageToChampions?: number;
    damageTaken?: number;
    visionScore?: number;
    killParticipation?: number;
    totalTimeSpentDead?: number;
    enemyMissingPings?: number;
    summoner1Id?: number;
    summoner2Id?: number;
    primaryRuneId?: number | null;
    subStyleId?: number | null;
    items?: number[];
    score: number;
    matchRank?: number;
    isMvp?: boolean;
    isAce?: boolean;
  }>;
}): LolMatchSummary {
  const {
    matchId,
    puuids,
    queueId = 420,
    gameDuration = 1800,
    gameCreation = 1730000000000,
    playerSpecs,
  } = params;
  const participants = playerSpecs.map((spec, idx) => {
    const { outcome, enemySurrendered } = classifyMatchOutcome(
      {
        win: spec.win,
        gameEndedInSurrender: Boolean(spec.surrender),
        gameEndedInEarlySurrender: Boolean(spec.earlySurrender),
      },
      gameDuration
    );
    const kills = spec.kills ?? 5;
    const deaths = spec.deaths ?? 2;
    const assists = spec.assists ?? 6;
    const isRemake = outcome === 'remake';
    const role = spec.role ?? 'MIDDLE';
    return {
      matchId,
      puuid: spec.puuid,
      participantId: idx + 1,
      teamId: spec.teamId ?? 100,
      riotIdGameName: spec.puuid,
      riotIdTagLine: 'LAS',
      summonerName: spec.puuid,
      championId: spec.championId ?? 103,
      championName: spec.championName ?? 'Ahri',
      champLevel: 16,
      teamPosition: role,
      individualPosition: role,
      win: spec.win,
      gameEndedInSurrender: Boolean(spec.surrender),
      gameEndedInEarlySurrender: Boolean(spec.earlySurrender),
      teamEarlySurrendered: !spec.win && Boolean(spec.earlySurrender),
      outcome,
      enemySurrendered,
      kills,
      deaths,
      assists,
      kda: deaths === 0 ? kills + assists : Math.round(((kills + assists) / deaths) * 100) / 100,
      cs: spec.cs ?? 210,
      csPerMin: spec.csPerMin ?? 7,
      goldEarned: spec.goldEarned ?? 13500,
      damageToChampions: spec.damageToChampions ?? 24000,
      damageTaken: spec.damageTaken ?? 15000,
      damageToObjectives: 6000,
      damageToTurrets: 4000,
      visionScore: spec.visionScore ?? 25,
      killParticipation: spec.killParticipation ?? 0.65,
      summoner1Id: spec.summoner1Id ?? 4,
      summoner2Id: spec.summoner2Id ?? 14,
      primaryRuneId: spec.primaryRuneId !== undefined ? spec.primaryRuneId : 8112,
      primaryStyleId: 8100,
      subStyleId: spec.subStyleId !== undefined ? spec.subStyleId : 8200,
      items: spec.items ?? [3157, 3020, 6655, 3089, 3135, 0, 3363],
      performanceScore: isRemake ? 0 : spec.score,
      performanceGrade: isRemake ? ('C' as const) : getGradeFromScore(spec.score),
      performanceBreakdown: {
        pillars: isRemake
          ? { combat: 0, impact: 0, economy: 0, objectives: 0, vision: 0, dominance: 0 }
          : {
              combat: spec.score,
              impact: spec.score,
              economy: spec.score,
              objectives: spec.score,
              vision: spec.score,
              dominance: spec.score,
            },
        weights: ROLE_WEIGHT_MATRIX[role],
        role,
        queueCategory: getQueueCategory(queueId),
        isRemake,
        laneDiff: null,
        outcomeAdjustment: spec.win ? 3 : -2,
        mechanicsBonus: 1,
        drivers: [],
      },
      matchRank: isRemake ? 0 : (spec.matchRank ?? 5),
      isMvp: isRemake ? false : Boolean(spec.isMvp),
      isAce: isRemake ? false : Boolean(spec.isAce),
      highlights: isRemake ? ['Remake'] : [],
      totalTimeSpentDead: spec.totalTimeSpentDead ?? 0,
      enemyMissingPings: spec.enemyMissingPings ?? 0,
    };
  });

  return {
    matchId,
    platformId: 'LA2',
    regionalCluster: 'americas',
    queueId,
    queueCategory: getQueueCategory(queueId),
    gameMode: queueId === 450 ? 'ARAM' : 'CLASSIC',
    gameType: 'MATCHED_GAME',
    gameVersion: '15.22.1',
    mapId: queueId === 450 ? 12 : 11,
    gameCreation,
    gameStartTimestamp: gameCreation,
    gameEndTimestamp: gameCreation + gameDuration * 1000,
    gameDuration,
    endOfGameResult: 'GameComplete',
    participantPuuids: puuids,
    teams: [],
    participants,
  };
}

describe('BG-PERF v2 LoL Performance Engine', () => {
  describe('Platform, queue, role and grade helpers', () => {
    it('maps platforms to regional clusters accurately', () => {
      expect(getRegionalClusterForPlatform('la2')).toBe('americas');
      expect(getRegionalClusterForPlatform('na1')).toBe('americas');
      expect(getRegionalClusterForPlatform('euw1')).toBe('europe');
      expect(getRegionalClusterForPlatform('tr1')).toBe('europe');
      expect(getRegionalClusterForPlatform('kr')).toBe('asia');
      expect(getRegionalClusterForPlatform('jp1')).toBe('asia');
      expect(getRegionalClusterForPlatform('oc1')).toBe('sea');
      expect(getRegionalClusterForPlatform('sg2')).toBe('sea');
    });

    it('classifies queue categories accurately', () => {
      expect(getQueueCategory(420)).toBe('ranked_solo');
      expect(getQueueCategory(440)).toBe('ranked_flex');
      expect(getQueueCategory(400)).toBe('normal');
      expect(getQueueCategory(490)).toBe('normal');
      expect(getQueueCategory(710)).toBe('mode_5v5');
      expect(getQueueCategory(700)).toBe('mode_5v5');
      expect(getQueueCategory(450)).toBe('aram');
      expect(getQueueCategory(1700)).toBe('arena');
      expect(getQueueCategory(1750, 'CHERRY')).toBe('arena');
      expect(getQueueCategory(900, 'URF')).toBe('other');
    });

    it('filters matches globally with default 30d + Normal/Flex/5v5 filters', () => {
      const now = 1_760_000_000_000;
      const dayMs = 24 * 60 * 60 * 1000;

      const makeTimedMatch = (matchId: string, queueId: number, daysAgo: number, gameMode = 'CLASSIC'): LolMatchSummary => ({
        matchId,
        platformId: 'LA2',
        regionalCluster: 'americas',
        queueId,
        queueCategory: getQueueCategory(queueId, gameMode),
        gameMode,
        gameType: 'MATCHED_GAME',
        gameVersion: '16.23.1',
        mapId: queueId === 450 ? 12 : 11,
        gameCreation: now - daysAgo * dayMs,
        gameStartTimestamp: now - daysAgo * dayMs,
        gameEndTimestamp: now - daysAgo * dayMs + 1800_000,
        gameDuration: 1800,
        endOfGameResult: 'GameComplete',
        participantPuuids: [],
        teams: [],
        participants: [],
      });

      const pool = [
        makeTimedMatch('m-normal-recent', 400, 5),
        makeTimedMatch('m-flex-recent', 440, 15),
        makeTimedMatch('m-5v5-recent', 710, 29),
        makeTimedMatch('m-soloq-recent', 420, 2),
        makeTimedMatch('m-aram-recent', 450, 3, 'ARAM'),
        makeTimedMatch('m-arena-recent', 1750, 1, 'CHERRY'),
        makeTimedMatch('m-flex-old', 440, 35),
      ];

      expect(DEFAULT_LOL_TIME_RANGE).toBe('30d');
      expect(DEFAULT_LOL_QUEUE_FILTERS).toEqual(['normal', 'ranked_flex', 'mode_5v5']);

      const filtered = filterMatchesGlobally(
        pool,
        DEFAULT_LOL_QUEUE_FILTERS,
        DEFAULT_LOL_TIME_RANGE,
        now
      );
      expect(filtered.map((m) => m.matchId)).toEqual([
        'm-normal-recent',
        'm-flex-recent',
        'm-5v5-recent',
      ]);

      // Clearing queues + 'all' time returns everything
      expect(filterMatchesGlobally(pool, [], 'all', now)).toHaveLength(7);
    });

    it('resolves participant roles including ARAM, ARENA, and blank fallback', () => {
      expect(resolveParticipantRole(makeParticipant({ teamPosition: 'TOP' }), 420)).toBe('TOP');
      expect(resolveParticipantRole(makeParticipant({ teamPosition: '', individualPosition: 'JUNGLE' }), 420)).toBe('JUNGLE');
      expect(resolveParticipantRole(makeParticipant({ teamPosition: '', individualPosition: '' }), 420)).toBe('MIDDLE');
      expect(resolveParticipantRole(makeParticipant({ teamPosition: 'TOP' }), 450, 'ARAM')).toBe('ARAM');
      expect(resolveParticipantRole(makeParticipant({ teamPosition: 'BOTTOM' }), 1700, 'CHERRY')).toBe('ARENA');
    });

    it('maps performance scores to exact letter grades', () => {
      expect(getGradeFromScore(95)).toBe('S+');
      expect(getGradeFromScore(90)).toBe('S+');
      expect(getGradeFromScore(82)).toBe('S');
      expect(getGradeFromScore(74)).toBe('A+');
      expect(getGradeFromScore(66)).toBe('A');
      expect(getGradeFromScore(56)).toBe('B');
      expect(getGradeFromScore(45)).toBe('C');
      expect(getGradeFromScore(44.9)).toBe('D');
    });
  });

  describe('classifyMatchOutcome (Critical Riot API surrender rules)', () => {
    it('classifies normal win and loss', () => {
      expect(
        classifyMatchOutcome({ win: true, gameEndedInSurrender: false, gameEndedInEarlySurrender: false }, 1800)
      ).toEqual({ outcome: 'win', enemySurrendered: false });

      expect(
        classifyMatchOutcome({ win: false, gameEndedInSurrender: false, gameEndedInEarlySurrender: false }, 1800)
      ).toEqual({ outcome: 'loss', enemySurrendered: false });
    });

    it('treats win: true with gameEndedInSurrender: true as WIN with enemySurrendered: true (never FF)', () => {
      expect(
        classifyMatchOutcome({ win: true, gameEndedInSurrender: true, gameEndedInEarlySurrender: false }, 1250)
      ).toEqual({ outcome: 'win', enemySurrendered: true });

      expect(
        classifyMatchOutcome({ win: true, gameEndedInSurrender: true, gameEndedInEarlySurrender: true }, 180)
      ).toEqual({ outcome: 'win', enemySurrendered: true });
    });

    it('classifies losing surrender as ff and early surrender or <240s loss as remake', () => {
      expect(
        classifyMatchOutcome({ win: false, gameEndedInSurrender: true, gameEndedInEarlySurrender: false }, 1200)
      ).toEqual({ outcome: 'ff', enemySurrendered: false });

      expect(
        classifyMatchOutcome({ win: false, gameEndedInSurrender: true, gameEndedInEarlySurrender: true }, 195)
      ).toEqual({ outcome: 'remake', enemySurrendered: false });

      expect(
        classifyMatchOutcome({ win: false, gameEndedInSurrender: false, gameEndedInEarlySurrender: false }, 239)
      ).toEqual({ outcome: 'remake', enemySurrendered: false });
    });
  });

  describe('scoreMatchParticipants & buildMatchSummaryFromRiotMatch', () => {
    it('verifies role weight matrix sums to 1.00 for every role', () => {
      for (const [role, weights] of Object.entries(ROLE_WEIGHT_MATRIX)) {
        const sum =
          weights.combat +
          weights.impact +
          weights.economy +
          weights.objectives +
          weights.vision +
          weights.dominance;
        expect(sum, `Weights for ${role} must sum to 1`).toBeCloseTo(1, 6);
      }
    });

    it('awards ACE to a hard carry on losing team and outscores a weak player on winning team', () => {
      const match = makeStandard5v5Match({
        gameDuration: 1920, // 32 min
        winningTeamId: 100,
        participantOverrides: [
          // Team 100 (Winners): index 0 TOP is getting carried hard (0/10/2, awful farm/damage)
          {
            kills: 0,
            deaths: 10,
            assists: 2,
            totalDamageDealtToChampions: 6200,
            goldEarned: 8100,
            totalMinionsKilled: 95,
            neutralMinionsKilled: 0,
            visionScore: 7,
            totalTimeSpentDead: 390,
            damageDealtToTurrets: 200,
            damageDealtToObjectives: 500,
            turretTakedowns: 0,
          },
          // index 1 JUNGLE (solid)
          { kills: 7, deaths: 3, assists: 11, dragonKills: 3, baronKills: 1 },
          // index 2 MID (MVP candidate on winning team)
          {
            kills: 14,
            deaths: 2,
            assists: 10,
            doubleKills: 2,
            tripleKills: 1,
            firstBloodKill: true,
            totalDamageDealtToChampions: 38500,
            goldEarned: 16800,
            totalMinionsKilled: 245,
            visionScore: 34,
            visionWardsBoughtInGame: 4,
            damageDealtToTurrets: 6800,
            damageDealtToObjectives: 12000,
            turretTakedowns: 5,
            challenges: {
              killParticipation: 0.78,
              soloKills: 3,
              skillshotsDodged: 42,
              skillshotsHit: 55,
              survivedSingleDigitHpCount: 1,
            },
          },
          {},
          {},
          // Team 200 (Losers): index 5..9 -> index 8 BOTTOM is hyper-carrying losing team
          {},
          {},
          {},
          {
            kills: 16,
            deaths: 1,
            assists: 7,
            doubleKills: 2,
            quadraKills: 1,
            largestKillingSpree: 8,
            totalDamageDealtToChampions: 46000,
            goldEarned: 18200,
            totalMinionsKilled: 280,
            neutralMinionsKilled: 18,
            visionScore: 30,
            visionWardsBoughtInGame: 3,
            damageDealtToTurrets: 5200,
            damageDealtToObjectives: 14500,
            turretTakedowns: 4,
            challenges: {
              killParticipation: 0.85,
              soloKills: 2,
              teamDamagePercentage: 0.44,
              skillshotsDodged: 45,
              skillshotsHit: 60,
              flawlessAces: 1,
            },
          },
          {},
        ],
      });

      const scored = scoreMatchParticipants(match);
      expect(scored).toHaveLength(10);

      const weakWinner = scored[0];
      const winningMvp = scored[2];
      const losingAce = scored[8];

      expect(winningMvp.isMvp).toBe(true);
      expect(winningMvp.isAce).toBe(false);
      expect(losingAce.isAce).toBe(true);
      expect(losingAce.isMvp).toBe(false);

      // Losing carry must vastly outperform weak winning teammate
      expect(losingAce.performanceScore).toBeGreaterThan(78);
      expect(losingAce.performanceScore).toBeGreaterThan(weakWinner.performanceScore + 25);

      // Exactly 1 MVP and 1 ACE
      expect(scored.filter((p) => p.isMvp)).toHaveLength(1);
      expect(scored.filter((p) => p.isAce)).toHaveLength(1);

      // Ranks 1..10 assigned properly and ordered descending with performanceScore
      const ranks = scored.map((p) => p.matchRank).sort((a, b) => a - b);
      expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const byRank = [...scored].sort((a, b) => a.matchRank - b.matchRank);
      for (let i = 1; i < byRank.length; i++) {
        expect(byRank[i - 1].performanceScore).toBeGreaterThanOrEqual(byRank[i].performanceScore);
      }

      // Lane diff computed cleanly for unique roles
      expect(winningMvp.performanceBreakdown.laneDiff).not.toBeNull();
      expect(winningMvp.performanceBreakdown.laneDiff?.opponentChampionName).toBe('OppAhri');
      expect(winningMvp.performanceBreakdown.mechanicsBonus).toBeGreaterThan(0);
      expect(winningMvp.performanceBreakdown.mechanicsBonus).toBeLessThanOrEqual(4);
    });

    it('scores UTILITY supports fairly using vision, peel, heals/shields and gold efficiency without CS penalty', () => {
      const match = makeStandard5v5Match({
        gameDuration: 1800,
        winningTeamId: 100,
        participantOverrides: [
          {},
          {},
          {},
          {},
          // index 4: UTILITY support with low CS (22) but huge vision & ally utility
          {
            kills: 1,
            deaths: 2,
            assists: 21,
            totalDamageDealtToChampions: 9500,
            goldEarned: 10400,
            goldSpent: 10100,
            totalMinionsKilled: 22,
            neutralMinionsKilled: 0,
            visionScore: 72, // 2.4 / min
            visionWardsBoughtInGame: 7,
            wardsKilled: 14,
            totalHealsOnTeammates: 6500,
            totalDamageShieldedOnTeammates: 8500,
            timeCCingOthers: 68,
            challenges: {
              killParticipation: 0.80,
              effectiveHealAndShielding: 15000,
              saveAllyFromDeath: 2,
              controlWardTimeCoverageInRiverOrEnemyHalf: 0.72,
              visionScoreAdvantageLaneOpponent: 0.45,
            },
          },
        ],
      });

      const scored = scoreMatchParticipants(match);
      const support = scored[4];
      expect(support.performanceBreakdown.role).toBe('UTILITY');
      expect(support.performanceBreakdown.pillars.vision).toBeGreaterThan(80);
      expect(support.performanceBreakdown.pillars.economy).toBeGreaterThan(60);
      expect(support.performanceBreakdown.pillars.impact).toBeGreaterThan(65);
      expect(support.performanceScore).toBeGreaterThan(72);
    });

    it('handles ARAM, ARENA, remakes, 0 deaths, missing challenges, and gameDuration=0 safely', () => {
      // 1. ARAM
      const aramMatch = makeStandard5v5Match({
        queueId: 450,
        gameMode: 'ARAM',
        gameDuration: 1140,
      });
      const aramScored = scoreMatchParticipants(aramMatch);
      expect(aramScored[0].performanceBreakdown.role).toBe('ARAM');
      expect(aramScored[0].performanceBreakdown.weights.vision).toBe(0);
      expect(aramScored[0].performanceBreakdown.pillars.vision).toBe(0);
      expect(aramScored[0].performanceBreakdown.laneDiff).toBeNull();

      // 2. ARENA
      const arenaMatch = makeStandard5v5Match({
        queueId: 1700,
        gameMode: 'CHERRY',
        gameDuration: 960,
      });
      const arenaScored = scoreMatchParticipants(arenaMatch);
      expect(arenaScored[0].performanceBreakdown.role).toBe('ARENA');
      expect(arenaScored[0].performanceBreakdown.weights.objectives).toBe(0);
      expect(arenaScored[0].performanceBreakdown.weights.vision).toBe(0);

      // 3. REMAKE
      const remakeMatch = makeStandard5v5Match({
        gameDuration: 185,
        winningTeamId: 100,
        gameEndedInSurrender: true,
        gameEndedInEarlySurrender: true,
      });
      const remakeScored = scoreMatchParticipants(remakeMatch);
      for (const p of remakeScored) {
        if (!p.win) {
          expect(p.outcome).toBe('remake');
          expect(p.performanceScore).toBe(0);
          expect(p.performanceGrade).toBe('C');
          expect(p.performanceBreakdown.isRemake).toBe(true);
          expect(p.isMvp).toBe(false);
          expect(p.isAce).toBe(false);
          expect(p.highlights).toEqual(['Remake']);
          expect(p.matchRank).toBe(0);
        } else {
          // Winning team in an early surrender still has win: true, enemySurrendered: true
          expect(p.outcome).toBe('win');
          expect(p.enemySurrendered).toBe(true);
        }
      }

      // 4. Edge case: 0 duration + 0 deaths + missing challenges -> no NaN/Infinity
      const zeroDurationMatch = makeStandard5v5Match({
        gameDuration: 0,
        winningTeamId: 100,
        participantOverrides: [{ kills: 5, deaths: 0, assists: 4, challenges: undefined }],
      });
      const zeroSummary = buildMatchSummaryFromRiotMatch(zeroDurationMatch);
      expect(zeroSummary.participants[0].kda).toBe(9);
      expect(Number.isFinite(zeroSummary.participants[0].performanceScore)).toBe(true);
    });

    it('applies differentiated FF penalty (-3.5 bottom half vs -2.0 top half) on surrendered losses', () => {
      const ffMatch = makeStandard5v5Match({
        gameDuration: 1260, // 21 min
        winningTeamId: 100,
        gameEndedInSurrender: true,
        participantOverrides: [
          {},
          {},
          {},
          {},
          {},
          // Team 200 surrendered: index 5 carried, index 9 inted
          { kills: 10, deaths: 1, assists: 4, totalDamageDealtToChampions: 28000, goldEarned: 13500 },
          { kills: 5, deaths: 3, assists: 5, totalDamageDealtToChampions: 18000, goldEarned: 11000 },
          { kills: 3, deaths: 5, assists: 4, totalDamageDealtToChampions: 14000, goldEarned: 9500 },
          { kills: 1, deaths: 9, assists: 2, totalDamageDealtToChampions: 8000, goldEarned: 7200 },
          { kills: 0, deaths: 11, assists: 3, totalDamageDealtToChampions: 4000, goldEarned: 6000 },
        ],
      });

      const scored = scoreMatchParticipants(ffMatch);
      expect(scored[5].outcome).toBe('ff');
      expect(scored[5].performanceBreakdown.outcomeAdjustment).toBe(-2.0);
      expect(scored[9].outcome).toBe('ff');
      expect(scored[9].performanceBreakdown.outcomeAdjustment).toBe(-3.5);
    });
  });

  describe('computeDurationBuckets', () => {
    it('bins exact boundaries and includes 0-5 matches inside 0-20, counting remakes in ffs and remakes', () => {
      const buckets = computeDurationBuckets([
        { durationSeconds: 180, outcome: 'remake' }, // <=300 (0-5 & 0-20)
        { durationSeconds: 300, outcome: 'win' }, // exact 300s boundary (0-5 & 0-20)
        { durationSeconds: 301, outcome: 'ff' }, // 0-20 only
        { durationSeconds: 1200, outcome: 'loss' }, // exact 1200s boundary (0-20 only)
        { durationSeconds: 1201, outcome: 'win' }, // 20-30
        { durationSeconds: 1800, outcome: 'ff' }, // exact 1800s boundary (20-30)
        { durationSeconds: 1801, outcome: 'loss' }, // 30+
      ]);

      expect(buckets.map((b) => b.key)).toEqual(['0-5', '0-20', '20-30', '30+']);

      // 0-5: 180s (remake) + 300s (win) => total 2, wins 1, ffs 1, remakes 1
      expect(buckets[0]).toEqual({
        key: '0-5',
        label: '0-5 min',
        total: 2,
        wins: 1,
        losses: 0,
        ffs: 1,
        remakes: 1,
        winRate: 50,
        ffRate: 50,
        lossRate: 0,
      });

      // 0-20: includes 180s, 300s, 301s, 1200s => total 4, wins 1, losses 1, ffs 2 (ff+remake), remakes 1
      expect(buckets[1]).toEqual({
        key: '0-20',
        label: '0-20 min',
        total: 4,
        wins: 1,
        losses: 1,
        ffs: 2,
        remakes: 1,
        winRate: 25,
        ffRate: 50,
        lossRate: 25,
      });

      // 20-30: 1201s (win), 1800s (ff) => total 2, wins 1, ffs 1
      expect(buckets[2]).toEqual({
        key: '20-30',
        label: '20-30 min',
        total: 2,
        wins: 1,
        losses: 0,
        ffs: 1,
        remakes: 0,
        winRate: 50,
        ffRate: 50,
        lossRate: 0,
      });

      // 30+: 1801s (loss)
      expect(buckets[3]).toEqual({
        key: '30+',
        label: '30+ min',
        total: 1,
        wins: 0,
        losses: 1,
        ffs: 0,
        remakes: 0,
        winRate: 0,
        ffRate: 0,
        lossRate: 100,
      });
    });
  });

  describe('computePlayerAggregates & computeGroupLeaderboard', () => {
    it('enforces >=2 group members in participantPuuids and excludes remakes from averages', () => {
      const groupPuuids = new Set(['p1', 'p2', 'p3']);

      const soloMatch = buildSyntheticSummary({
        matchId: 'm-solo',
        puuids: ['p1', 'random-a', 'random-b'],
        playerSpecs: [{ puuid: 'p1', win: false, score: 50 }],
      });

      const groupWin = buildSyntheticSummary({
        matchId: 'm-group-win',
        puuids: ['p1', 'p2', 'random-a'],
        playerSpecs: [
          { puuid: 'p1', win: true, score: 86, isMvp: true },
          { puuid: 'p2', win: true, score: 74 },
        ],
      });

      const groupRemake = buildSyntheticSummary({
        matchId: 'm-group-remake',
        puuids: ['p1', 'p2', 'p3'],
        gameDuration: 185,
        playerSpecs: [
          { puuid: 'p1', win: false, earlySurrender: true, score: 99 },
          { puuid: 'p2', win: false, earlySurrender: true, score: 99 },
        ],
      });

      expect(countGroupMembersInMatch(soloMatch, groupPuuids)).toBe(1);
      expect(isGroupMatch(soloMatch, groupPuuids)).toBe(false);
      expect(countGroupMembersInMatch(groupWin, groupPuuids)).toBe(2);
      expect(isGroupMatch(groupWin, groupPuuids)).toBe(true);

      const agg = computePlayerAggregates(
        [soloMatch, groupWin, groupRemake],
        'p1',
        groupPuuids
      );

      // Personal: 3 total (1 solo loss, 1 group win, 1 group remake) -> 2 scored
      expect(agg.personal.totalGames).toBe(3);
      expect(agg.personal.scoredGames).toBe(2);
      expect(agg.personal.remakes).toBe(1);
      expect(agg.personal.wins).toBe(1);
      expect(agg.personal.winRate).toBe(50);
      expect(agg.personal.avgPerformance).toBe(68); // (50 + 86) / 2, remake excluded!

      // InGroup: only groupWin and groupRemake (soloMatch excluded!)
      expect(agg.inGroup.totalGames).toBe(2);
      expect(agg.inGroup.scoredGames).toBe(1);
      expect(agg.inGroup.remakes).toBe(1);
      expect(agg.inGroup.winRate).toBe(100);
      expect(agg.inGroup.avgPerformance).toBe(86);

      // SoloOnly: only soloMatch
      expect(agg.soloOnly.totalGames).toBe(1);
      expect(agg.soloOnly.scoredGames).toBe(1);
      expect(agg.soloOnly.winRate).toBe(0);
      expect(agg.soloOnly.avgPerformance).toBe(50);

      // Deltas compare inGroup vs soloOnly
      expect(agg.deltas.winRateDelta).toBe(100);
      expect(agg.deltas.performanceDelta).toBe(36);
    });

    it('ranks group leaderboard using Bayesian shrinkage + volume bonus and tracks topDuoPartner', () => {
      const accounts: LolAccount[] = [
        makeAccount({ userId: 'u1', puuid: 'p1', gameName: 'Santi' }),
        makeAccount({ userId: 'u2', puuid: 'p2', gameName: 'Fede' }),
        makeAccount({ userId: 'u3', puuid: 'p3', gameName: 'Lucho' }),
        makeAccount({ userId: 'u4', puuid: 'p4', gameName: 'Tincho' }),
      ];

      const profiles = [
        { id: 'u1', displayName: 'Santi', avatarUrl: '' },
        { id: 'u2', displayName: 'Fede', avatarUrl: '' },
        { id: 'u3', displayName: 'Lucho', avatarUrl: '' },
        { id: 'u4', displayName: 'Tincho', avatarUrl: '' },
      ];

      const matches: LolMatchSummary[] = [];

      // u1 & u2 play 15 group games together with solid 80 avg score (10 wins, 5 losses)
      for (let i = 0; i < 15; i++) {
        const win = i < 10;
        matches.push(
          buildSyntheticSummary({
            matchId: `grp-12-${i}`,
            puuids: ['p1', 'p2'],
            queueId: 420,
            playerSpecs: [
              { puuid: 'p1', win, score: 80, championId: 103, championName: 'Ahri', isMvp: win },
              { puuid: 'p2', win, score: 70, championId: 222, championName: 'Jinx' },
            ],
          })
        );
      }

      // u3 plays only 1 lucky group game with p2 (score 92, win) -> Bayesian k=5 + activity pulls u3 below u1
      matches.push(
        buildSyntheticSummary({
          matchId: 'grp-23-0',
          puuids: ['p2', 'p3'],
          queueId: 420,
          playerSpecs: [
            { puuid: 'p2', win: true, score: 72, championId: 222, championName: 'Jinx' },
            { puuid: 'p3', win: true, score: 92, championId: 86, championName: 'Garen' },
          ],
        })
      );

      // u4 plays only a solo game (never group) and a group remake -> 0 scored group games -> rank score 0
      matches.push(
        buildSyntheticSummary({
          matchId: 'solo-4',
          puuids: ['p4', 'ext-1'],
          queueId: 420,
          playerSpecs: [{ puuid: 'p4', win: true, score: 95 }],
        }),
        buildSyntheticSummary({
          matchId: 'grp-remake-4',
          puuids: ['p1', 'p4'],
          queueId: 420,
          gameDuration: 180,
          playerSpecs: [
            { puuid: 'p1', win: false, earlySurrender: true, score: 80 },
            { puuid: 'p4', win: false, earlySurrender: true, score: 80 },
          ],
        })
      );

      const leaderboard = computeGroupLeaderboard({
        matches,
        accounts,
        playerProfiles: profiles,
      });

      expect(leaderboard).toHaveLength(4);
      // u1 (80 avg over 15 games) beats u3 (92 avg over 1 game) due to Bayesian shrinkage + activity bonus
      expect(leaderboard[0].userId).toBe('u1');
      expect(leaderboard[0].groupGamesScored).toBe(15);
      expect(leaderboard[0].groupGamesTotal).toBe(16); // includes 1 group remake
      expect(leaderboard[0].groupRemakes).toBe(1);
      expect(leaderboard[0].topDuoPartner?.userId).toBe('u2');
      expect(leaderboard[0].topDuoPartner?.gamesTogether).toBe(15);
      expect(leaderboard[0].topDuoPartner?.winRateTogether).toBe(66.7);
      expect(leaderboard[0].topGroupChampion?.championName).toBe('Ahri');

      const u3Entry = leaderboard.find((e) => e.userId === 'u3')!;
      expect(leaderboard[0].groupRankScore).toBeGreaterThan(u3Entry.groupRankScore);

      // u4 has 0 scored group games (solo game ignored, remake excluded)
      const u4Entry = leaderboard.find((e) => e.userId === 'u4')!;
      expect(u4Entry.groupGamesScored).toBe(0);
      expect(u4Entry.groupGamesTotal).toBe(1);
      expect(u4Entry.groupRankScore).toBe(0);
      expect(u4Entry.personalGamesTotal).toBe(2);
    });

    it('computes role leaderboard by lane (TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY) excluding remakes and non-group matches', () => {
      const accounts: LolAccount[] = [
        makeAccount({ userId: 'u1', puuid: 'p1', gameName: 'Santi' }),
        makeAccount({ userId: 'u2', puuid: 'p2', gameName: 'Fede' }),
        makeAccount({ userId: 'u3', puuid: 'p3', gameName: 'Tincho' }),
      ];

      const profiles = [
        { id: 'u1', displayName: 'Santi', avatarUrl: '' },
        { id: 'u2', displayName: 'Fede', avatarUrl: '' },
        { id: 'u3', displayName: 'Tincho', avatarUrl: '' },
      ];

      const mGroup1 = buildSyntheticSummary({
        matchId: 'lane-grp-1',
        puuids: ['p1', 'p2', 'p3'],
        playerSpecs: [
          { puuid: 'p1', win: true, score: 85, championName: 'Ahri' },
          { puuid: 'p2', win: true, score: 78, championName: 'LeeSin' },
          { puuid: 'p3', win: true, score: 72, championName: 'Jinx' },
        ],
      });
      mGroup1.participants[0].performanceBreakdown.role = 'MIDDLE';
      mGroup1.participants[1].performanceBreakdown.role = 'JUNGLE';
      mGroup1.participants[2].performanceBreakdown.role = 'BOTTOM';

      // u2 plays stronger MID in one group game than u1 does in another, or u1 plays 4 MID games and wins
      const mGroup2 = buildSyntheticSummary({
        matchId: 'lane-grp-2',
        puuids: ['p1', 'p2'],
        playerSpecs: [
          { puuid: 'p1', win: true, score: 88, championName: 'Sylas' },
          { puuid: 'p2', win: true, score: 65, championName: 'Darius' },
        ],
      });
      mGroup2.participants[0].performanceBreakdown.role = 'MIDDLE';
      mGroup2.participants[1].performanceBreakdown.role = 'TOP';

      // Solo match on JUNGLE by u3 should NOT appear in >=2 group role leaderboard
      const mSolo = buildSyntheticSummary({
        matchId: 'lane-solo-1',
        puuids: ['p3', 'random'],
        playerSpecs: [{ puuid: 'p3', win: true, score: 99, championName: 'Garen' }],
      });
      mSolo.participants[0].performanceBreakdown.role = 'TOP';

      // ARAM group match should NOT pollute Rift lanes
      const mAram = buildSyntheticSummary({
        matchId: 'lane-aram-1',
        puuids: ['p1', 'p2'],
        queueId: 450,
        playerSpecs: [
          { puuid: 'p1', win: true, score: 90 },
          { puuid: 'p2', win: true, score: 80 },
        ],
      });
      mAram.participants[0].performanceBreakdown.role = 'ARAM';
      mAram.participants[1].performanceBreakdown.role = 'ARAM';

      const byRole = computeGroupLeaderboardByRole({
        matches: [mGroup1, mGroup2, mSolo, mAram],
        accounts,
        playerProfiles: profiles,
      });

      expect(byRole.MIDDLE).toHaveLength(1);
      expect(byRole.MIDDLE[0].userId).toBe('u1');
      expect(byRole.MIDDLE[0].games).toBe(2);
      expect(byRole.JUNGLE).toHaveLength(1);
      expect(byRole.JUNGLE[0].userId).toBe('u2');
      expect(byRole.TOP).toHaveLength(1);
      expect(byRole.TOP[0].userId).toBe('u2'); // u3 solo TOP excluded
      expect(byRole.BOTTOM).toHaveLength(1);
      expect(byRole.BOTTOM[0].userId).toBe('u3');
      expect(byRole.UTILITY).toHaveLength(0);
    });

    it('computes group records (most_time_dead, highest_kp, most_kills, least_kills, best_kda, highest_ff_rate, most_mia_pings, best_single_game)', () => {
      const accounts: LolAccount[] = [
        makeAccount({ userId: 'u1', puuid: 'p1', gameName: 'Carry' }),
        makeAccount({ userId: 'u2', puuid: 'p2', gameName: 'Supp' }),
        makeAccount({ userId: 'u3', puuid: 'p3', gameName: 'Feeder' }),
      ];

      const profiles = [
        { id: 'u1', displayName: 'Carry', avatarUrl: '' },
        { id: 'u2', displayName: 'Supp', avatarUrl: '' },
        { id: 'u3', displayName: 'Feeder', avatarUrl: '' },
      ];

      const m1 = buildSyntheticSummary({
        matchId: 'rec-grp-1',
        puuids: ['p1', 'p2', 'p3'],
        gameDuration: 1800,
        playerSpecs: [
          { puuid: 'p1', win: false, surrender: true, kills: 14, deaths: 2, assists: 8, score: 91, championName: 'Jinx' },
          { puuid: 'p2', win: false, surrender: true, kills: 1, deaths: 2, assists: 21, score: 80, championName: 'Thresh' },
          { puuid: 'p3', win: false, surrender: true, kills: 2, deaths: 11, assists: 3, score: 34, championName: 'Yasuo' },
        ],
      });
      // Carry: KDA 11, KP 0.65, low dead time
      m1.participants[0].killParticipation = 0.72;
      m1.participants[0].totalTimeSpentDead = 45;
      m1.participants[0].enemyMissingPings = 3;
      // Supp: KP 0.90, highest vision
      m1.participants[1].killParticipation = 0.9;
      m1.participants[1].visionScore = 75;
      m1.participants[1].totalTimeSpentDead = 50;
      m1.participants[1].enemyMissingPings = 1;
      // Feeder: highest dead time & MIA pings
      m1.participants[2].killParticipation = 0.25;
      m1.participants[2].totalTimeSpentDead = 420;
      m1.participants[2].enemyMissingPings = 18;

      const records = computeGroupRecords({
        matches: [m1],
        accounts,
        playerProfiles: profiles,
        scope: 'group',
      });

      const byId = new Map(records.map((r) => [r.id, r]));
      expect(byId.get('most_time_dead')?.userId).toBe('u3');
      expect(byId.get('most_time_dead')?.valueLabel).toBe('7m 00s/g');
      expect(byId.get('highest_kp')?.userId).toBe('u2');
      expect(byId.get('highest_kp')?.valueLabel).toBe('90%');
      expect(byId.get('most_kills')?.userId).toBe('u1');
      expect(byId.get('least_kills')?.userId).toBe('u2');
      expect(byId.get('best_kda')?.userId).toBe('u1'); // (14+8)/2 = 11 == (1+21)/2 = 11, u1 first
      expect(byId.get('most_deaths')?.userId).toBe('u3');
      expect(byId.get('highest_vision')?.userId).toBe('u2');
      expect(byId.get('highest_ff_rate')?.tone).toBe('ff');
      expect(byId.get('most_mia_pings')?.userId).toBe('u3');
      expect(byId.get('best_single_game')?.userId).toBe('u1');
      expect(byId.get('best_single_game')?.matchId).toBe('rec-grp-1');
    });
  });

  describe('LoL Wave 1 Analytics: Splash URLs, Group Outcome, Personal Records, Group Aggregates, Group Picks & Champion Detail', () => {
    it('builds Data Dragon champion splash URLs using normalized champion keys', () => {
      expect(getChampionSplashUrl('Ahri')).toBe(
        'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg'
      );
      expect(getChampionSplashUrl('Wukong')).toBe(
        'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/MonkeyKing_0.jpg'
      );
      expect(getChampionSplashUrl('FiddleSticks')).toBe(
        'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Fiddlesticks_0.jpg'
      );
      expect(getChampionSplashUrl("Kai'Sa")).toBe(
        'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Kaisa_0.jpg'
      );
    });

    it('enriches LolChampionSummary with primaryRole, avgDpm, avgVisionPerMin, avgKp, mvpCount, and aceCount', () => {
      const m1 = buildSyntheticSummary({
        matchId: 'tc-1',
        puuids: ['p1', 'ext'],
        gameDuration: 1800, // 30m
        playerSpecs: [
          {
            puuid: 'p1',
            championId: 103,
            championName: 'Ahri',
            role: 'MIDDLE',
            win: true,
            score: 85,
            damageToChampions: 27000, // 900 dpm
            visionScore: 30, // 1.0 vis/m
            killParticipation: 0.7,
            isMvp: true,
          },
        ],
      });
      const m2 = buildSyntheticSummary({
        matchId: 'tc-2',
        puuids: ['p1', 'ext'],
        gameDuration: 1200, // 20m
        playerSpecs: [
          {
            puuid: 'p1',
            championId: 103,
            championName: 'Ahri',
            role: 'MIDDLE',
            win: false,
            score: 65,
            damageToChampions: 14000, // 700 dpm
            visionScore: 10, // 0.5 vis/m
            killParticipation: 0.5,
            isAce: true,
          },
        ],
      });
      const m3 = buildSyntheticSummary({
        matchId: 'tc-3',
        puuids: ['p1', 'ext'],
        gameDuration: 1800,
        playerSpecs: [
          {
            puuid: 'p1',
            championId: 103,
            championName: 'Ahri',
            role: 'TOP',
            win: true,
            score: 75,
            damageToChampions: 18000, // 600 dpm
            visionScore: 27, // 0.9 vis/m
            killParticipation: 0.6,
          },
        ],
      });

      const agg = computePlayerAggregates([m1, m2, m3], 'p1', new Set(['p1', 'p2']));
      expect(agg.personal.topChampions).toHaveLength(1);
      const ahri = agg.personal.topChampions[0];
      expect(ahri.primaryRole).toBe('MIDDLE');
      expect(ahri.avgDpm).toBe(733.3);
      expect(ahri.avgVisionPerMin).toBe(0.8);
      expect(ahri.avgKp).toBe(0.6);
      expect(ahri.mvpCount).toBe(1);
      expect(ahri.aceCount).toBe(1);
    });

    it('resolves group match outcomes across wins, enemy FFs, own FFs, losses, remakes, and split squads', () => {
      const groupPuuids = new Set(['p1', 'p2', 'p3']);

      const enemyFf = buildSyntheticSummary({
        matchId: 'grp-enemy-ff',
        puuids: ['p1', 'p2'],
        gameDuration: 1080,
        playerSpecs: [
          { puuid: 'p1', win: true, surrender: true, score: 78 },
          { puuid: 'p2', win: true, surrender: true, score: 84 },
        ],
      });
      const resEnemyFf = resolveGroupMatchOutcome(enemyFf, groupPuuids);
      expect(resEnemyFf.outcome).toBe('win');
      expect(resEnemyFf.enemySurrendered).toBe(true);
      expect(resEnemyFf.avgPerformance).toBe(81);
      expect(resEnemyFf.representative?.puuid).toBe('p2');

      const ownFf = buildSyntheticSummary({
        matchId: 'grp-own-ff',
        puuids: ['p1', 'p2', 'p3'],
        gameDuration: 960,
        playerSpecs: [
          { puuid: 'p1', win: false, surrender: true, score: 54 },
          { puuid: 'p2', win: false, surrender: true, score: 41 },
          { puuid: 'p3', win: false, surrender: true, score: 49 },
        ],
      });
      const resOwnFf = resolveGroupMatchOutcome(ownFf, groupPuuids);
      expect(resOwnFf.outcome).toBe('ff');
      expect(resOwnFf.enemySurrendered).toBe(false);
      expect(resOwnFf.avgPerformance).toBe(48);
      expect(resOwnFf.representative?.puuid).toBe('p1');

      const remake = buildSyntheticSummary({
        matchId: 'grp-remake',
        puuids: ['p1', 'p2'],
        gameDuration: 190,
        playerSpecs: [
          { puuid: 'p1', win: false, earlySurrender: true, score: 70 },
          { puuid: 'p2', win: false, earlySurrender: true, score: 65 },
        ],
      });
      const resRemake = resolveGroupMatchOutcome(remake, groupPuuids);
      expect(resRemake.outcome).toBe('remake');
      expect(resRemake.avgPerformance).toBe(0);
      expect(resRemake.representative?.puuid).toBe('p1');

      // Early surrender win (<240s) stays 'win' with enemySurrendered: true
      const earlyEnemyFfWin = buildSyntheticSummary({
        matchId: 'grp-early-win',
        puuids: ['p1', 'p2'],
        gameDuration: 185,
        playerSpecs: [
          { puuid: 'p1', win: true, earlySurrender: true, score: 72 },
          { puuid: 'p2', win: true, earlySurrender: true, score: 68 },
        ],
      });
      const resEarlyWin = resolveGroupMatchOutcome(earlyEnemyFfWin, groupPuuids);
      expect(resEarlyWin.outcome).toBe('win');
      expect(resEarlyWin.enemySurrendered).toBe(true);

      // No group participants -> representative null, remake
      const emptyRes = resolveGroupMatchOutcome(ownFf, new Set(['unknown']));
      expect(emptyRes.groupParticipants).toHaveLength(0);
      expect(emptyRes.representative).toBeNull();
      expect(emptyRes.outcome).toBe('remake');
    });

    it('computes personal records with chronological streaks, single-match metadata, and fallbacks', () => {
      const account = makeAccount({ userId: 'u1', puuid: 'p1', gameName: 'Santi' });
      const dayMs = 24 * 60 * 60 * 1000;
      const baseTs = new Date(2026, 10, 10, 15, 0, 0).getTime();

      // Intentionally supply matches out of chronological order
      // Chronological sequence: W (d1), L (d2), W (d3), W (d4), W (d5), FF (d6) => best win streak 3, worst loss streak 1
      const m1 = buildSyntheticSummary({
        matchId: 'pr-1',
        puuids: ['p1', 'ext'],
        queueId: 440,
        gameDuration: 1800,
        gameCreation: baseTs + 0 * dayMs,
        playerSpecs: [
          {
            puuid: 'p1',
            championId: 103,
            championName: 'Ahri',
            win: true,
            kills: 15,
            deaths: 1,
            assists: 8,
            cs: 240,
            csPerMin: 8.0,
            damageToChampions: 36000,
            visionScore: 30,
            killParticipation: 0.72,
            totalTimeSpentDead: 25,
            enemyMissingPings: 4,
            score: 91,
          },
        ],
      });
      const m2 = buildSyntheticSummary({
        matchId: 'pr-2',
        puuids: ['p1', 'ext'],
        queueId: 440,
        gameDuration: 1800,
        gameCreation: baseTs + 1 * dayMs,
        playerSpecs: [
          {
            puuid: 'p1',
            championId: 517,
            championName: 'Sylas',
            win: false,
            kills: 2,
            deaths: 11,
            assists: 3,
            cs: 150,
            csPerMin: 5.0,
            damageToChampions: 14000,
            visionScore: 15,
            killParticipation: 0.35,
            totalTimeSpentDead: 380,
            enemyMissingPings: 16,
            score: 36,
          },
        ],
      });
      const m3 = buildSyntheticSummary({
        matchId: 'pr-3',
        puuids: ['p1', 'ext'],
        queueId: 440,
        gameDuration: 1500,
        gameCreation: baseTs + 2 * dayMs,
        playerSpecs: [
          {
            puuid: 'p1',
            championId: 61,
            championName: 'Orianna',
            win: true,
            kills: 10,
            deaths: 0,
            assists: 15,
            cs: 250,
            csPerMin: 10.0,
            damageToChampions: 28000,
            visionScore: 45, // 1.8/m
            killParticipation: 0.88,
            totalTimeSpentDead: 0,
            enemyMissingPings: 2,
            score: 89,
          },
        ],
      });
      const m4 = buildSyntheticSummary({
        matchId: 'pr-4',
        puuids: ['p1', 'ext'],
        queueId: 440,
        gameDuration: 1600,
        gameCreation: baseTs + 3 * dayMs,
        playerSpecs: [{ puuid: 'p1', win: true, score: 75 }],
      });
      const m5 = buildSyntheticSummary({
        matchId: 'pr-5',
        puuids: ['p1', 'ext'],
        queueId: 440,
        gameDuration: 1700,
        gameCreation: baseTs + 4 * dayMs,
        playerSpecs: [{ puuid: 'p1', win: true, score: 77 }],
      });
      const m6Ff = buildSyntheticSummary({
        matchId: 'pr-6',
        puuids: ['p1', 'ext'],
        queueId: 440,
        gameDuration: 930, // 15m 30s fastest FF
        gameCreation: baseTs + 5 * dayMs,
        playerSpecs: [
          { puuid: 'p1', championName: 'LeeSin', win: false, surrender: true, kills: 1, deaths: 5, assists: 2, damageToChampions: 9000, score: 42 },
        ],
      });
      const mRemake = buildSyntheticSummary({
        matchId: 'pr-remake',
        puuids: ['p1', 'ext'],
        queueId: 440,
        gameDuration: 190,
        gameCreation: baseTs + 6 * dayMs,
        playerSpecs: [
          { puuid: 'p1', win: false, earlySurrender: true, kills: 99, score: 99 },
        ],
      });

      const records = computePersonalRecords({
        matches: [m5, m2, mRemake, m6Ff, m1, m4, m3],
        account,
        displayName: 'Santi',
        avatarUrl: '',
        queueFilter: 'ranked_flex',
      });

      expect(records).toHaveLength(12);
      const byId = new Map(records.map((r) => [r.id, r]));
      expect(byId.get('best_single_game')?.matchId).toBe('pr-1');
      expect(byId.get('best_single_game')?.championName).toBe('Ahri');
      expect(byId.get('best_single_game')?.dateLabel).toBe('10/11');
      expect(byId.get('most_kills')?.matchId).toBe('pr-1');
      expect(byId.get('best_kda')?.matchId).toBe('pr-3'); // 25.00 KDA > 23.00 KDA in pr-1
      expect(byId.get('highest_kp')?.matchId).toBe('pr-3'); // 88%
      expect(byId.get('highest_dpm')?.matchId).toBe('pr-1'); // 1200/m
      expect(byId.get('highest_cs_min')?.matchId).toBe('pr-3'); // 10.0 CS/m
      expect(byId.get('highest_vision')?.matchId).toBe('pr-3'); // 1.80/m
      expect(byId.get('best_win_streak')?.valueLabel).toBe('3V');
      expect(byId.get('best_win_streak')?.subLabel).toContain('1D');
      expect(byId.get('best_win_streak')?.subLabel).toContain('6G');
      expect(byId.get('most_deaths')?.matchId).toBe('pr-2');
      expect(byId.get('most_deaths')?.tone).toBe('bad');
      expect(byId.get('most_time_dead')?.matchId).toBe('pr-2');
      expect(byId.get('most_time_dead')?.valueLabel).toBe('6m 20s');
      expect(byId.get('most_mia_pings')?.matchId).toBe('pr-2');
      expect(byId.get('most_mia_pings')?.tone).toBe('fun');
      expect(byId.get('fastest_ff')?.matchId).toBe('pr-6');
      expect(byId.get('fastest_ff')?.valueLabel).toBe('15m 30s');
      expect(byId.get('fastest_ff')?.tone).toBe('ff');

      // Fallbacks when 0 MIA pings, 0 FFs, 0 dead time
      const fallbackMatch = buildSyntheticSummary({
        matchId: 'pr-fallback',
        puuids: ['p1', 'ext'],
        queueId: 420,
        gameDuration: 2460, // 41m 00s
        playerSpecs: [
          {
            puuid: 'p1',
            championName: 'Thresh',
            win: true,
            kills: 1,
            deaths: 0,
            assists: 19,
            totalTimeSpentDead: 0,
            enemyMissingPings: 0,
            score: 84,
          },
        ],
      });
      const fallbackRecords = computePersonalRecords({
        matches: [fallbackMatch],
        account,
        displayName: 'Santi',
        avatarUrl: '',
      });
      const fbById = new Map(fallbackRecords.map((r) => [r.id, r]));
      expect(fbById.has('most_time_dead')).toBe(false);
      expect(fbById.has('most_mia_pings')).toBe(false);
      expect(fbById.get('most_assists')?.valueLabel).toBe('19 asist.');
      expect(fbById.get('most_assists')?.tone).toBe('good');
      expect(fbById.has('fastest_ff')).toBe(false);
      expect(fbById.get('longest_game')?.valueLabel).toBe('41m 00s');
      expect(fbById.get('longest_game')?.tone).toBe('fun');

      // Empty when no valid non-remake matches
      expect(
        computePersonalRecords({
          matches: [mRemake],
          account,
          displayName: 'Santi',
          avatarUrl: '',
        })
      ).toEqual([]);
    });

    it('computes group aggregate stats per unique group match and averages participant KPIs', () => {
      const accounts: LolAccount[] = [
        makeAccount({ userId: 'u1', puuid: 'p1', gameName: 'P1' }),
        makeAccount({ userId: 'u2', puuid: 'p2', gameName: 'P2' }),
        makeAccount({ userId: 'u3', puuid: 'p3', gameName: 'P3' }),
      ];

      // 3-stack win (30m)
      const g1 = buildSyntheticSummary({
        matchId: 'ga-1',
        puuids: ['p1', 'p2', 'p3', 'ext1', 'ext2'],
        queueId: 440,
        gameDuration: 1800,
        playerSpecs: [
          { puuid: 'p1', win: true, score: 90, kills: 10, deaths: 2, assists: 8, isMvp: true },
          { puuid: 'p2', win: true, score: 80, kills: 6, deaths: 4, assists: 10 },
          { puuid: 'p3', win: true, score: 70, kills: 2, deaths: 3, assists: 15 },
        ],
      });
      // 2-stack FF (16m)
      const g2 = buildSyntheticSummary({
        matchId: 'ga-2',
        puuids: ['p1', 'p2', 'ext1'],
        queueId: 440,
        gameDuration: 960,
        playerSpecs: [
          { puuid: 'p1', win: false, surrender: true, score: 60, kills: 3, deaths: 5, assists: 4, isAce: true },
          { puuid: 'p2', win: false, surrender: true, score: 40, kills: 1, deaths: 6, assists: 3 },
        ],
      });
      // 2-stack Remake (3m)
      const g3 = buildSyntheticSummary({
        matchId: 'ga-3',
        puuids: ['p1', 'p3'],
        queueId: 440,
        gameDuration: 180,
        playerSpecs: [
          { puuid: 'p1', win: false, earlySurrender: true, score: 99 },
          { puuid: 'p3', win: false, earlySurrender: true, score: 99 },
        ],
      });
      // Solo match must be ignored
      const solo = buildSyntheticSummary({
        matchId: 'ga-solo',
        puuids: ['p1', 'ext1'],
        queueId: 440,
        gameDuration: 1800,
        playerSpecs: [{ puuid: 'p1', win: true, score: 99 }],
      });

      const stats = computeGroupAggregateStats({
        matches: [g1, g2, g3, solo],
        accounts,
        queueFilter: 'ranked_flex',
      });

      expect(stats.totalMatches).toBe(3);
      expect(stats.scoredMatches).toBe(2);
      expect(stats.wins).toBe(1);
      expect(stats.losses).toBe(0);
      expect(stats.ffs).toBe(1);
      expect(stats.remakes).toBe(1);
      expect(stats.winRate).toBe(50);
      expect(stats.ffRate).toBe(50);
      // Squad sizes: 3, 2, 2 => avg 2.3
      expect(stats.avgSquadSize).toBe(2.3);
      // Non-remake group participant scores: 90, 80, 70, 60, 40 => avg 68.0
      expect(stats.avgPerformance).toBe(68);
      expect(stats.mvpCount).toBe(1);
      expect(stats.aceCount).toBe(1);
      expect(stats.durationBuckets.find((b) => b.key === '0-20')?.total).toBe(2); // g2 + g3
      expect(stats.durationBuckets.find((b) => b.key === '20-30')?.total).toBe(1); // g1
    });

    it('computes group picks with strict >=3G threshold, symmetric Bayesian pickScore, and non-overlapping best/worst splits', () => {
      const accounts: LolAccount[] = [
        makeAccount({ userId: 'u1', puuid: 'p1', gameName: 'Santi' }),
        makeAccount({ userId: 'u2', puuid: 'p2', gameName: 'Tincho' }),
        makeAccount({ userId: 'u3', puuid: 'p3', gameName: 'Fede' }),
      ];
      const profiles = [
        { id: 'u1', displayName: 'Santi', avatarUrl: '' },
        { id: 'u2', displayName: 'Tincho', avatarUrl: '' },
        { id: 'u3', displayName: 'Fede', avatarUrl: '' },
      ];

      const matches: LolMatchSummary[] = [];
      // u1 Ahri: 6 group games, score 84, win -> strong volume pick
      for (let i = 0; i < 6; i++) {
        matches.push(
          buildSyntheticSummary({
            matchId: `gp-a-${i}`,
            puuids: ['p1', 'p2'],
            queueId: 440,
            playerSpecs: [
              { puuid: 'p1', championId: 103, championName: 'Ahri', role: 'MIDDLE', win: true, score: 84, isMvp: i < 2 },
              { puuid: 'p2', championId: 222, championName: 'Jinx', role: 'BOTTOM', win: true, score: 66 },
            ],
          })
        );
      }
      // u3 Yasuo: 3 group games, score 38, ff -> weak pick; plus 1 remake & 2 solo games that must NOT count
      for (let i = 0; i < 3; i++) {
        matches.push(
          buildSyntheticSummary({
            matchId: `gp-b-${i}`,
            puuids: ['p2', 'p3'],
            queueId: 440,
            playerSpecs: [
              { puuid: 'p2', championId: 145, championName: 'Kaisa', role: 'BOTTOM', win: false, surrender: true, score: 54 },
              { puuid: 'p3', championId: 157, championName: 'Yasuo', role: 'MIDDLE', win: false, surrender: true, score: 38, isAce: i === 0 },
            ],
          })
        );
      }
      // u3 Garen: only 2 group games + 2 solo games -> <3 group games so excluded!
      for (let i = 0; i < 2; i++) {
        matches.push(
          buildSyntheticSummary({
            matchId: `gp-c-grp-${i}`,
            puuids: ['p1', 'p3'],
            queueId: 440,
            playerSpecs: [
              { puuid: 'p1', championId: 517, championName: 'Sylas', role: 'MIDDLE', win: true, score: 88 },
              { puuid: 'p3', championId: 86, championName: 'Garen', role: 'TOP', win: true, score: 90 },
            ],
          }),
          buildSyntheticSummary({
            matchId: `gp-c-solo-${i}`,
            puuids: ['p3', 'ext'],
            queueId: 440,
            playerSpecs: [
              { puuid: 'p3', championId: 86, championName: 'Garen', role: 'TOP', win: true, score: 95 },
            ],
          })
        );
      }
      // Group remake on Sylas -> must NOT push Sylas from 2G to 3G
      matches.push(
        buildSyntheticSummary({
          matchId: 'gp-remake',
          puuids: ['p1', 'p3'],
          queueId: 440,
          gameDuration: 185,
          playerSpecs: [
            { puuid: 'p1', championId: 517, championName: 'Sylas', win: false, earlySurrender: true, score: 99 },
            { puuid: 'p3', championId: 86, championName: 'Garen', win: false, earlySurrender: true, score: 99 },
          ],
        })
      );

      const picks = computeGroupPicks({
        matches,
        accounts,
        playerProfiles: profiles,
        queueFilter: 'ranked_flex',
      });

      // Qualified >= 3G: u1 Ahri (6G), u2 Jinx (6G), u2 Kaisa (3G), u3 Yasuo (3G) => 4 picks
      expect(picks.minGames).toBe(3);
      expect(picks.allPicks).toHaveLength(4);
      expect(picks.allPicks.some((p) => p.championName === 'Garen')).toBe(false);
      expect(picks.allPicks.some((p) => p.championName === 'Sylas')).toBe(false);

      expect(picks.allPicks[0].championName).toBe('Ahri');
      expect(picks.allPicks[0].games).toBe(6);
      expect(picks.allPicks[0].primaryRole).toBe('MIDDLE');
      expect(picks.allPicks[0].mvpCount).toBe(2);

      // 4 picks => best 2, worst 2, zero overlap
      expect(picks.bestPicks).toHaveLength(2);
      expect(picks.worstPicks).toHaveLength(2);
      const bestKeys = new Set(picks.bestPicks.map((p) => p.pickKey));
      expect(picks.worstPicks.every((p) => !bestKeys.has(p.pickKey))).toBe(true);
      expect(picks.worstPicks[0].championName).toBe('Yasuo');
      expect(picks.worstPicks[0].aceCount).toBe(1);

      // Edge cases: 0 picks, 1 pick, 3 picks (odd count)
      expect(
        computeGroupPicks({ matches: [], accounts, playerProfiles: profiles })
      ).toEqual({ minGames: 3, allPicks: [], bestPicks: [], worstPicks: [] });

      const singleQualifiedMatches = [0, 1, 2].map((i) =>
        buildSyntheticSummary({
          matchId: `one-${i}`,
          puuids: ['p1', 'p2'],
          playerSpecs: [
            { puuid: 'p1', championId: 103, championName: 'Ahri', win: true, score: 80 },
            { puuid: 'p2', championId: 200 + i, championName: `Champ${i}`, win: true, score: 70 },
          ],
        })
      );
      const singleRes = computeGroupPicks({
        matches: singleQualifiedMatches,
        accounts: accounts.slice(0, 2),
        playerProfiles: profiles,
      });
      expect(singleRes.allPicks).toHaveLength(1);
      expect(singleRes.bestPicks).toHaveLength(1);
      expect(singleRes.worstPicks).toHaveLength(0);

      // 3 picks => best 2 (ceil(3/2)), worst 1 (floor(3/2)), zero overlap
      const withoutKaisa = matches.filter(
        (m) => m.matchId.startsWith('gp-a-') || (m.matchId.startsWith('gp-b-') && m.matchId !== 'gp-b-2')
      );
      withoutKaisa.push(
        buildSyntheticSummary({
          matchId: 'gp-yas-3',
          puuids: ['p1', 'p3'],
          queueId: 440,
          playerSpecs: [
            { puuid: 'p1', championId: 103, championName: 'Ahri', win: false, score: 76 },
            { puuid: 'p3', championId: 157, championName: 'Yasuo', win: false, score: 42 },
          ],
        })
      );
      const oddThree = computeGroupPicks({
        matches: withoutKaisa,
        accounts,
        playerProfiles: profiles,
      });
      expect(oddThree.allPicks).toHaveLength(3);
      expect(oddThree.bestPicks).toHaveLength(2);
      expect(oddThree.worstPicks).toHaveLength(1);
      expect(
        oddThree.bestPicks.some((b) => b.pickKey === oddThree.worstPicks[0].pickKey)
      ).toBe(false);

      // Symmetric Bayesian shrinkage: higher game count amplifies distance from baseline for both best & worst
      const symMatches: LolMatchSummary[] = [];
      for (let i = 0; i < 6; i++) {
        symMatches.push(
          buildSyntheticSummary({
            matchId: `sym-hi6-${i}`,
            puuids: ['p1', 'p2'],
            playerSpecs: [
              { puuid: 'p1', championId: 103, championName: 'Ahri', win: true, score: 80, matchRank: 2 },
              { puuid: 'p2', championId: 157, championName: 'Yasuo', win: false, score: 40, matchRank: 9 },
            ],
          })
        );
      }
      for (let i = 0; i < 3; i++) {
        symMatches.push(
          buildSyntheticSummary({
            matchId: `sym-hi3-${i}`,
            puuids: ['p1', 'p3'],
            playerSpecs: [
              { puuid: 'p1', championId: 61, championName: 'Orianna', win: true, score: 80, matchRank: 2 },
              { puuid: 'p3', championId: 122, championName: 'Darius', win: false, score: 40, matchRank: 9 },
            ],
          })
        );
      }
      const symPicks = computeGroupPicks({
        matches: symMatches,
        accounts,
        playerProfiles: profiles,
      });
      // 6G @ 100% WR / 80 Perf > 3G @ 100% WR / 80 Perf
      // 6G @ 0% WR / 40 Perf < 3G @ 0% WR / 40 Perf
      expect(symPicks.bestPicks[0].championName).toBe('Ahri');
      expect(symPicks.bestPicks[1].championName).toBe('Orianna');
      expect(symPicks.bestPicks[0].pickScore).toBeGreaterThan(symPicks.bestPicks[1].pickScore);
      expect(symPicks.worstPicks[0].championName).toBe('Yasuo');
      expect(symPicks.worstPicks[1].championName).toBe('Darius');
      expect(symPicks.worstPicks[0].pickScore).toBeLessThan(symPicks.worstPicks[1].pickScore);
    });

    it('ranks winning team-enabling picks clearly above inflated-perf high-FF losing picks', () => {
      const accounts: LolAccount[] = [
        makeAccount({ userId: 'u1', puuid: 'p1', gameName: 'NachoSupp' }),
        makeAccount({ userId: 'u2', puuid: 'p2', gameName: 'CarryFF' }),
        makeAccount({ userId: 'u3', puuid: 'p3', gameName: 'ZeroWin' }),
        makeAccount({ userId: 'u4', puuid: 'p4', gameName: 'AllyMid' }),
      ];
      const profiles = [
        { id: 'u1', displayName: 'Nacho', avatarUrl: '' },
        { id: 'u2', displayName: 'CarryFF', avatarUrl: '' },
        { id: 'u3', displayName: 'ZeroWin', avatarUrl: '' },
        { id: 'u4', displayName: 'AllyMid', avatarUrl: '' },
      ];

      const matches: LolMatchSummary[] = [];

      // Pick A: Nacho Thresh (6G: 5W 1L 0FF = 83.3% WR, 69 Perf, allies perform well)
      for (let i = 0; i < 6; i++) {
        const win = i < 5;
        matches.push(
          buildSyntheticSummary({
            matchId: `coh-a-${i}`,
            puuids: ['p1', 'p4'],
            queueId: 440,
            playerSpecs: [
              {
                puuid: 'p1',
                championId: 412,
                championName: 'Thresh',
                role: 'UTILITY',
                win,
                score: 69,
                matchRank: 4,
                killParticipation: 0.72,
              },
              {
                puuid: 'p4',
                championId: 103,
                championName: 'Ahri',
                role: 'MIDDLE',
                win,
                score: 72,
                matchRank: 3,
              },
            ],
          })
        );
      }

      // Pick B: CarryFF Zed (7G: 3W 0L 4FF = 42.9% WR, 78 Perf, 57.1% FF, volatile)
      const zedScores = [92, 62, 90, 64, 88, 66, 84]; // avg = 78.0, high variance
      for (let i = 0; i < 7; i++) {
        const win = i < 3;
        matches.push(
          buildSyntheticSummary({
            matchId: `coh-b-${i}`,
            puuids: ['p2', 'p4'],
            queueId: 440,
            playerSpecs: [
              {
                puuid: 'p2',
                championId: 238,
                championName: 'Zed',
                role: 'MIDDLE',
                win,
                surrender: !win,
                score: zedScores[i],
                matchRank: 3,
                isMvp: i === 0,
                isAce: i === 3 || i === 4,
              },
              {
                puuid: 'p4',
                championId: 61,
                championName: 'Orianna',
                role: 'BOTTOM',
                win,
                surrender: !win,
                score: 54,
                matchRank: 7,
              },
            ],
          })
        );
      }

      // Pick C: ZeroWin Yasuo (5G: 0W 2L 3FF = 0% WR, 60% FF, 46 Perf) -> dead bottom
      for (let i = 0; i < 5; i++) {
        matches.push(
          buildSyntheticSummary({
            matchId: `coh-c-${i}`,
            puuids: ['p3', 'p4'],
            queueId: 440,
            playerSpecs: [
              {
                puuid: 'p3',
                championId: 157,
                championName: 'Yasuo',
                role: 'TOP',
                win: false,
                surrender: i < 3,
                score: 46,
                matchRank: 9,
              },
              {
                puuid: 'p4',
                championId: 222,
                championName: 'Jinx',
                role: 'BOTTOM',
                win: false,
                surrender: i < 3,
                score: 52,
                matchRank: 8,
              },
            ],
          })
        );
      }

      const result = computeGroupPicks({
        matches,
        accounts,
        playerProfiles: profiles,
      });

      const thresh = result.allPicks.find((p) => p.championName === 'Thresh');
      const zed = result.allPicks.find((p) => p.championName === 'Zed');
      const yasuo = result.allPicks.find((p) => p.championName === 'Yasuo');

      expect(thresh).toBeDefined();
      expect(zed).toBeDefined();
      expect(yasuo).toBeDefined();

      // Winning 83.3% WR support MUST clearly outscore 42.9% WR / 57% FF carry
      expect(thresh!.pickScore).toBeGreaterThan(zed!.pickScore + 10);
      expect(result.bestPicks.some((p) => p.championName === 'Thresh')).toBe(true);
      expect(result.worstPicks.some((p) => p.championName === 'Thresh')).toBe(false);

      // 0% WR + 60% FF must be dead last in worstPicks
      expect(result.worstPicks[0].championName).toBe('Yasuo');
      expect(yasuo!.ffRate).toBe(60);
      expect(yasuo!.pickBreakdown.highFfPenalty).toBeGreaterThan(0);

      // Explainability metadata populated properly
      expect(thresh!.ffRate).toBe(0);
      expect(thresh!.wrDeltaVsGroup).toBeGreaterThan(20);
      expect(thresh!.teammatePerfDelta).toBeGreaterThan(0);
      expect(thresh!.pickDrivers.length).toBeGreaterThanOrEqual(2);
      expect(thresh!.pickDrivers.length).toBeLessThanOrEqual(3);
      expect(zed!.ffRate).toBe(57.1);
      expect(zed!.pickDrivers.some((d) => d.includes('FF'))).toBe(true);
    });

    it('enforces symmetric volume scaling: 10G good > 5G/3G good, and 10G bad < 5G/3G bad', () => {
      const accounts: LolAccount[] = [
        makeAccount({ userId: 'u1', puuid: 'p1', gameName: 'Good10' }),
        makeAccount({ userId: 'u2', puuid: 'p2', gameName: 'Good5' }),
        makeAccount({ userId: 'u3', puuid: 'p3', gameName: 'Bad10' }),
        makeAccount({ userId: 'u4', puuid: 'p4', gameName: 'Bad5' }),
        makeAccount({ userId: 'u5', puuid: 'p5', gameName: 'NeutralAlly' }),
      ];
      const profiles = accounts.map((a) => ({ id: a.userId, displayName: a.gameName, avatarUrl: '' }));

      const matches: LolMatchSummary[] = [];
      // Good10: 10G @ 80% WR (8W 2L 0FF), 78 Perf, rank 2, ally 68
      for (let i = 0; i < 10; i++) {
        const win = i < 8;
        matches.push(
          buildSyntheticSummary({
            matchId: `vol-g10-${i}`,
            puuids: ['p1', 'p5'],
            playerSpecs: [
              { puuid: 'p1', championId: 103, championName: 'Ahri', win, score: 78, matchRank: 2 },
              { puuid: 'p5', championId: 412, championName: 'Thresh', win, score: 68, matchRank: 4 },
            ],
          })
        );
      }
      // Good5: 5G @ 80% WR (4W 1L 0FF), 78 Perf, rank 2, ally 68
      for (let i = 0; i < 5; i++) {
        const win = i < 4;
        matches.push(
          buildSyntheticSummary({
            matchId: `vol-g5-${i}`,
            puuids: ['p2', 'p5'],
            playerSpecs: [
              { puuid: 'p2', championId: 61, championName: 'Orianna', win, score: 78, matchRank: 2 },
              { puuid: 'p5', championId: 111, championName: 'Nautilus', win, score: 68, matchRank: 4 },
            ],
          })
        );
      }
      // Bad10: 10G @ 20% WR (2W 8L 0FF), 48 Perf, rank 8, ally 52
      for (let i = 0; i < 10; i++) {
        const win = i < 2;
        matches.push(
          buildSyntheticSummary({
            matchId: `vol-b10-${i}`,
            puuids: ['p3', 'p5'],
            playerSpecs: [
              { puuid: 'p3', championId: 157, championName: 'Yasuo', win, score: 48, matchRank: 8 },
              { puuid: 'p5', championId: 89, championName: 'Leona', win, score: 52, matchRank: 7 },
            ],
          })
        );
      }
      // Bad5: 5G @ 20% WR (1W 4L 0FF), 48 Perf, rank 8, ally 52
      for (let i = 0; i < 5; i++) {
        const win = i < 1;
        matches.push(
          buildSyntheticSummary({
            matchId: `vol-b5-${i}`,
            puuids: ['p4', 'p5'],
            playerSpecs: [
              { puuid: 'p4', championId: 777, championName: 'Yone', win, score: 48, matchRank: 8 },
              { puuid: 'p5', championId: 99, championName: 'Lux', win, score: 52, matchRank: 7 },
            ],
          })
        );
      }

      const res = computeGroupPicks({ matches, accounts, playerProfiles: profiles });
      const ahri10 = res.allPicks.find((p) => p.championName === 'Ahri')!;
      const ori5 = res.allPicks.find((p) => p.championName === 'Orianna')!;
      const yas10 = res.allPicks.find((p) => p.championName === 'Yasuo')!;
      const yone5 = res.allPicks.find((p) => p.championName === 'Yone')!;

      expect(ahri10.winRate).toBe(80);
      expect(ori5.winRate).toBe(80);
      expect(ahri10.pickScore).toBeGreaterThan(ori5.pickScore);

      expect(yas10.winRate).toBe(20);
      expect(yone5.winRate).toBe(20);
      expect(yas10.pickScore).toBeLessThan(yone5.pickScore);
    });

    it('differentiates picks with equal WR and Perf via ally synergy, FF penalty, enemy FF bonus, and consistency', () => {
      const accounts: LolAccount[] = [
        makeAccount({ userId: 'u1', puuid: 'p1', gameName: 'Enabler' }),
        makeAccount({ userId: 'u2', puuid: 'p2', gameName: 'TiltFF' }),
        makeAccount({ userId: 'u3', puuid: 'p3', gameName: 'Volatile' }),
        makeAccount({ userId: 'u4', puuid: 'p4', gameName: 'StompEnemyFF' }),
        makeAccount({ userId: 'u5', puuid: 'p5', gameName: 'Partner' }),
      ];
      const profiles = accounts.map((a) => ({ id: a.userId, displayName: a.gameName, avatarUrl: '' }));

      // All 4 picks have exact same 5G, 60% WR (3W 2L), avgPerf 70, matchRank 4
      const matches: LolMatchSummary[] = [];

      // 1. Enabler (Braum): consistent 70 Perf, 0 FF, allies crush with 82 Perf
      for (let i = 0; i < 5; i++) {
        const win = i < 3;
        matches.push(
          buildSyntheticSummary({
            matchId: `diff-enabler-${i}`,
            puuids: ['p1', 'p5'],
            playerSpecs: [
              { puuid: 'p1', championId: 201, championName: 'Braum', role: 'UTILITY', win, score: 70, matchRank: 4 },
              { puuid: 'p5', championId: 222, championName: 'Jinx', role: 'BOTTOM', win, score: 82, matchRank: 2 },
            ],
          })
        );
      }

      // 2. TiltFF (Riven): consistent 70 Perf, BOTH losses are FF (40% FF), allies struggle at 56 Perf
      for (let i = 0; i < 5; i++) {
        const win = i < 3;
        matches.push(
          buildSyntheticSummary({
            matchId: `diff-ff-${i}`,
            puuids: ['p2', 'p5'],
            playerSpecs: [
              { puuid: 'p2', championId: 92, championName: 'Riven', role: 'TOP', win, surrender: !win, score: 70, matchRank: 4 },
              { puuid: 'p5', championId: 64, championName: 'LeeSin', role: 'JUNGLE', win, surrender: !win, score: 56, matchRank: 6 },
            ],
          })
        );
      }

      // 3. Volatile (Draven): same 70 avg Perf, 0 FF, neutral allies (69 Perf), wild score swings [95, 45, 95, 45, 70]
      const dravenScores = [95, 45, 95, 45, 70];
      for (let i = 0; i < 5; i++) {
        const win = i < 3;
        matches.push(
          buildSyntheticSummary({
            matchId: `diff-vol-${i}`,
            puuids: ['p3', 'p5'],
            playerSpecs: [
              { puuid: 'p3', championId: 119, championName: 'Draven', role: 'BOTTOM', win, score: dravenScores[i], matchRank: 4 },
              { puuid: 'p5', championId: 412, championName: 'Thresh', role: 'UTILITY', win, score: 69, matchRank: 4 },
            ],
          })
        );
      }

      // 4. StompEnemyFF (Darius): consistent 70 Perf, 0 own FF, all 3 wins are enemy FFs, neutral allies (69 Perf)
      for (let i = 0; i < 5; i++) {
        const win = i < 3;
        matches.push(
          buildSyntheticSummary({
            matchId: `diff-enemyff-${i}`,
            puuids: ['p4', 'p5'],
            playerSpecs: [
              { puuid: 'p4', championId: 122, championName: 'Darius', role: 'TOP', win, surrender: win, score: 70, matchRank: 4 },
              { puuid: 'p5', championId: 103, championName: 'Ahri', role: 'MIDDLE', win, surrender: win, score: 69, matchRank: 4 },
            ],
          })
        );
      }

      const res = computeGroupPicks({ matches, accounts, playerProfiles: profiles });
      const braum = res.allPicks.find((p) => p.championName === 'Braum')!;
      const riven = res.allPicks.find((p) => p.championName === 'Riven')!;
      const draven = res.allPicks.find((p) => p.championName === 'Draven')!;
      const darius = res.allPicks.find((p) => p.championName === 'Darius')!;

      // All have exact same 60% WR & 70.0 avgPerf
      expect(braum.winRate).toBe(60);
      expect(riven.winRate).toBe(60);
      expect(draven.winRate).toBe(60);
      expect(darius.winRate).toBe(60);
      expect(braum.avgPerformance).toBe(70);
      expect(riven.avgPerformance).toBe(70);
      expect(draven.avgPerformance).toBe(70);
      expect(darius.avgPerformance).toBe(70);

      // Ally synergy lifts Braum clearly above Riven (and above volatile Draven)
      expect(braum.teammatePerfDelta).toBeGreaterThan(riven.teammatePerfDelta);
      expect(braum.pickScore).toBeGreaterThan(riven.pickScore + 5);
      expect(braum.pickScore).toBeGreaterThan(draven.pickScore);

      // Enemy FF wins + consistency lift Darius clearly above Volatile Draven & TiltFF Riven
      expect(darius.enemyFfWins).toBe(3);
      expect(darius.consistency).toBeGreaterThan(draven.consistency);
      expect(darius.pickScore).toBeGreaterThan(draven.pickScore);
      expect(draven.pickScore).toBeGreaterThan(riven.pickScore);
    });

    it('generates coherent >=3G best vs worst picks in Demo Mode default filters (high-impact carries beat carried high-WR passengers)', () => {
      const demo = buildDemoLolDataset([]);
      const filtered = filterMatchesGlobally(
        demo.matches,
        DEFAULT_LOL_QUEUE_FILTERS,
        DEFAULT_LOL_TIME_RANGE
      );
      const picks = computeGroupPicks({
        matches: filtered,
        accounts: demo.accounts,
        playerProfiles: demo.members,
        queueFilter: 'all',
      });

      expect(picks.allPicks.length).toBeGreaterThanOrEqual(8);
      expect(picks.bestPicks.length).toBeGreaterThanOrEqual(3);
      expect(picks.worstPicks.length).toBeGreaterThanOrEqual(3);

      const avgBestWr =
        picks.bestPicks.reduce((sum, p) => sum + p.winRate, 0) / picks.bestPicks.length;
      const avgWorstWr =
        picks.worstPicks.reduce((sum, p) => sum + p.winRate, 0) / picks.worstPicks.length;

      expect(avgBestWr).toBeGreaterThan(avgWorstWr + 10);
      expect(picks.bestPicks[0].pickScore).toBeGreaterThan(picks.worstPicks[0].pickScore + 10);

      const hasLosingPicks = picks.allPicks.some((p) => p.winRate < 50);
      if (hasLosingPicks) {
        // Non-passenger >70% WR picks (with positive relative impact) must never fall into worstPicks
        expect(
          picks.worstPicks.some(
            (p) => p.winRate > 70 && p.passengerWins === 0 && p.impactVsTeamDelta >= 0
          )
        ).toBe(false);
      }

      // High-impact Thresh (62.5% WR, positive vsTeam & vsOpp) must outscore low-impact carried Nautilus (83.3% WR, 5 passenger wins)
      const thresh = picks.allPicks.find((p) => p.championName === 'Thresh');
      const nautilus = picks.allPicks.find((p) => p.championName === 'Nautilus');
      if (thresh && nautilus) {
        expect(thresh.pickScore).toBeGreaterThan(nautilus.pickScore + 10);
        expect(nautilus.passengerWins).toBeGreaterThanOrEqual(3);
      }

      // Every pick has full explainability metadata
      for (const p of picks.allPicks) {
        expect(p.pickScore).toBeGreaterThanOrEqual(0);
        expect(p.pickScore).toBeLessThanOrEqual(100);
        expect(p.bayesWinRate).toBeGreaterThanOrEqual(0);
        expect(p.bayesWinRate).toBeLessThanOrEqual(100);
        expect(p.impactWinRate).toBeGreaterThanOrEqual(0);
        expect(p.impactWinRate).toBeLessThanOrEqual(100);
        expect(p.avgDifficulty).toBeGreaterThanOrEqual(15);
        expect(p.avgDifficulty).toBeLessThanOrEqual(95);
        expect(p.consistency).toBeGreaterThanOrEqual(0);
        expect(p.consistency).toBeLessThanOrEqual(100);
        expect(p.pickDrivers.length).toBeGreaterThanOrEqual(2);
        expect(p.pickDrivers.length).toBeLessThanOrEqual(3);
      }
    });

    it('demotes a 100% WR low-impact carried passenger below a 60% WR high-impact carry and weights rival difficulty', () => {
      const accounts: LolAccount[] = [
        makeAccount({ userId: 'u1', puuid: 'p1', gameName: 'TrueCarry' }),
        makeAccount({ userId: 'u2', puuid: 'p2', gameName: 'LuckyPassenger' }),
        makeAccount({ userId: 'u3', puuid: 'p3', gameName: 'HardRivalsCarry' }),
        makeAccount({ userId: 'u4', puuid: 'p4', gameName: 'EasyRivalsFollower' }),
        makeAccount({ userId: 'u5', puuid: 'p5', gameName: 'SquadAnchor' }),
      ];
      const profiles = accounts.map((a) => ({
        id: a.userId,
        displayName: a.gameName,
        avatarUrl: '',
      }));

      const matches: LolMatchSummary[] = [];

      // 1. LuckyPassenger (Malphite, 4G: 4W 0L = 100% WR), but in every game:
      //    scores 55 (5th on team, matchRank 7), carried by teammates (84, 82, 80, 78) against weak enemies (46),
      //    and loses direct lane duel to enemy TOP (60)
      for (let i = 0; i < 4; i++) {
        matches.push(
          buildSyntheticSummary({
            matchId: `pass-win-${i}`,
            puuids: ['p2', 'p5', 'a3', 'a4', 'a5', 'e1', 'e2', 'e3', 'e4', 'e5'],
            playerSpecs: [
              { puuid: 'p2', teamId: 100, championId: 54, championName: 'Malphite', role: 'TOP', win: true, score: 55, matchRank: 7, killParticipation: 0.34 },
              { puuid: 'p5', teamId: 100, championId: 103, championName: 'Ahri', role: 'MIDDLE', win: true, score: 86, matchRank: 1, isMvp: true },
              { puuid: 'a3', teamId: 100, championId: 64, championName: 'LeeSin', role: 'JUNGLE', win: true, score: 82, matchRank: 2 },
              { puuid: 'a4', teamId: 100, championId: 222, championName: 'Jinx', role: 'BOTTOM', win: true, score: 80, matchRank: 3 },
              { puuid: 'a5', teamId: 100, championId: 412, championName: 'Thresh', role: 'UTILITY', win: true, score: 78, matchRank: 4 },
              // Enemy team: enemy TOP (60) outplayed Malphite (55) despite losing the match
              { puuid: 'e1', teamId: 200, championId: 122, championName: 'Darius', role: 'TOP', win: false, score: 60, matchRank: 5 },
              { puuid: 'e2', teamId: 200, championId: 121, championName: 'Khazix', role: 'JUNGLE', win: false, score: 45, matchRank: 8 },
              { puuid: 'e3', teamId: 200, championId: 112, championName: 'Viktor', role: 'MIDDLE', win: false, score: 44, matchRank: 9 },
              { puuid: 'e4', teamId: 200, championId: 51, championName: 'Caitlyn', role: 'BOTTOM', win: false, score: 42, matchRank: 10 },
              { puuid: 'e5', teamId: 200, championId: 497, championName: 'Rakan', role: 'UTILITY', win: false, score: 56, matchRank: 6 },
            ],
          })
        );
      }

      // 2. TrueCarry (Sylas, 5G: 3W 2L = 60% WR), carries his team in wins (84 vs 64 teammates)
      //    and plays 1v9 ACE in 2 tough losses (78 vs 46 teammates against 74 enemy team)
      for (let i = 0; i < 5; i++) {
        const win = i < 3;
        matches.push(
          buildSyntheticSummary({
            matchId: `carry-game-${i}`,
            puuids: ['p1', 'p5', 'a3', 'a4', 'a5', 'e1', 'e2', 'e3', 'e4', 'e5'],
            playerSpecs: [
              {
                puuid: 'p1',
                teamId: 100,
                championId: 517,
                championName: 'Sylas',
                role: 'MIDDLE',
                win,
                score: win ? 84 : 78,
                matchRank: win ? 1 : 2,
                isMvp: win,
                isAce: !win,
                killParticipation: 0.76,
              },
              { puuid: 'p5', teamId: 100, championId: 86, championName: 'Garen', role: 'TOP', win, score: win ? 64 : 46, matchRank: win ? 4 : 8 },
              { puuid: 'a3', teamId: 100, championId: 64, championName: 'LeeSin', role: 'JUNGLE', win, score: win ? 65 : 45, matchRank: win ? 3 : 9 },
              { puuid: 'a4', teamId: 100, championId: 222, championName: 'Jinx', role: 'BOTTOM', win, score: win ? 63 : 44, matchRank: win ? 5 : 10 },
              { puuid: 'a5', teamId: 100, championId: 412, championName: 'Thresh', role: 'UTILITY', win, score: win ? 62 : 48, matchRank: win ? 6 : 7 },
              { puuid: 'e1', teamId: 200, championId: 122, championName: 'Darius', role: 'TOP', win: !win, score: win ? 58 : 76, matchRank: win ? 7 : 1 },
              { puuid: 'e2', teamId: 200, championId: 121, championName: 'Khazix', role: 'JUNGLE', win: !win, score: win ? 56 : 74, matchRank: win ? 8 : 3 },
              { puuid: 'e3', teamId: 200, championId: 112, championName: 'Viktor', role: 'MIDDLE', win: !win, score: win ? 60 : 66, matchRank: win ? 2 : 5 },
              { puuid: 'e4', teamId: 200, championId: 51, championName: 'Caitlyn', role: 'BOTTOM', win: !win, score: win ? 54 : 72, matchRank: win ? 9 : 4 },
              { puuid: 'e5', teamId: 200, championId: 497, championName: 'Rakan', role: 'UTILITY', win: !win, score: win ? 52 : 70, matchRank: win ? 10 : 6 },
            ],
          })
        );
      }

      // 3. HardRivalsCarry (Viego, 4G: 3W 1L = 75% WR, 74 Perf) against fierce rivals (66 Perf) while teammates struggled (60)
      for (let i = 0; i < 4; i++) {
        const win = i < 3;
        matches.push(
          buildSyntheticSummary({
            matchId: `hard-rival-${i}`,
            puuids: ['p3', 'p5', 'a3', 'a4', 'a5', 'e1', 'e2', 'e3', 'e4', 'e5'],
            gameDuration: 2100,
            playerSpecs: [
              { puuid: 'p3', teamId: 100, championId: 234, championName: 'Viego', role: 'JUNGLE', win, score: 74, matchRank: 2, killParticipation: 0.72 },
              { puuid: 'p5', teamId: 100, championId: 86, championName: 'Garen', role: 'TOP', win, score: 60, matchRank: 6 },
              { puuid: 'a3', teamId: 100, championId: 103, championName: 'Ahri', role: 'MIDDLE', win, score: 61, matchRank: 5 },
              { puuid: 'a4', teamId: 100, championId: 222, championName: 'Jinx', role: 'BOTTOM', win, score: 59, matchRank: 7 },
              { puuid: 'a5', teamId: 100, championId: 412, championName: 'Thresh', role: 'UTILITY', win, score: 60, matchRank: 8 },
              { puuid: 'e1', teamId: 200, championId: 122, championName: 'Darius', role: 'TOP', win: !win, score: 66, matchRank: 3 },
              { puuid: 'e2', teamId: 200, championId: 64, championName: 'LeeSin', role: 'JUNGLE', win: !win, score: 65, matchRank: 4 },
              { puuid: 'e3', teamId: 200, championId: 112, championName: 'Viktor', role: 'MIDDLE', win: !win, score: 68, matchRank: 1 },
              { puuid: 'e4', teamId: 200, championId: 51, championName: 'Caitlyn', role: 'BOTTOM', win: !win, score: 62, matchRank: 9 },
              { puuid: 'e5', teamId: 200, championId: 497, championName: 'Rakan', role: 'UTILITY', win: !win, score: 61, matchRank: 10 },
            ],
          })
        );
      }

      // 4. EasyRivalsFollower (Ezreal, 4G: 3W 1L = 75% WR, 74 Perf) against collapsing rivals (42 Perf) while teammates stomped (82)
      for (let i = 0; i < 4; i++) {
        const win = i < 3;
        matches.push(
          buildSyntheticSummary({
            matchId: `easy-rival-${i}`,
            puuids: ['p4', 'p5', 'a3', 'a4', 'a5', 'e1', 'e2', 'e3', 'e4', 'e5'],
            gameDuration: 1020,
            playerSpecs: [
              { puuid: 'p4', teamId: 100, championId: 81, championName: 'Ezreal', role: 'BOTTOM', win, score: 74, matchRank: 5, killParticipation: 0.45 },
              { puuid: 'p5', teamId: 100, championId: 86, championName: 'Garen', role: 'TOP', win, score: 83, matchRank: 1 },
              { puuid: 'a3', teamId: 100, championId: 103, championName: 'Ahri', role: 'MIDDLE', win, score: 82, matchRank: 2 },
              { puuid: 'a4', teamId: 100, championId: 64, championName: 'LeeSin', role: 'JUNGLE', win, score: 81, matchRank: 3 },
              { puuid: 'a5', teamId: 100, championId: 412, championName: 'Thresh', role: 'UTILITY', win, score: 80, matchRank: 4 },
              { puuid: 'e1', teamId: 200, championId: 122, championName: 'Darius', role: 'TOP', win: !win, score: 42, matchRank: 7 },
              { puuid: 'e2', teamId: 200, championId: 121, championName: 'Khazix', role: 'JUNGLE', win: !win, score: 40, matchRank: 9 },
              { puuid: 'e3', teamId: 200, championId: 112, championName: 'Viktor', role: 'MIDDLE', win: !win, score: 41, matchRank: 8 },
              { puuid: 'e4', teamId: 200, championId: 51, championName: 'Caitlyn', role: 'BOTTOM', win: !win, score: 45, matchRank: 6 },
              { puuid: 'e5', teamId: 200, championId: 497, championName: 'Rakan', role: 'UTILITY', win: !win, score: 39, matchRank: 10 },
            ],
          })
        );
      }

      const res = computeGroupPicks({
        matches,
        accounts,
        playerProfiles: profiles,
      });

      const malphite = res.allPicks.find((p) => p.championName === 'Malphite')!;
      const sylas = res.allPicks.find((p) => p.championName === 'Sylas')!;
      const viegoHard = res.allPicks.find((p) => p.championName === 'Viego')!;
      const ezrealEasy = res.allPicks.find((p) => p.championName === 'Ezreal')!;

      // 1. 60% WR TrueCarry (Sylas) must decisively outscore 100% WR LuckyPassenger (Malphite)
      expect(malphite.winRate).toBe(100);
      expect(sylas.winRate).toBe(60);
      expect(malphite.passengerWins).toBe(4);
      expect(malphite.impactWinRate).toBeLessThan(65);
      expect(malphite.impactVsTeamDelta).toBeLessThan(-15);
      expect(malphite.vsOpponentDelta).toBeLessThan(0);
      expect(malphite.pickBreakdown.passengerPenalty).toBeGreaterThan(5);
      expect(sylas.pickScore).toBeGreaterThan(malphite.pickScore + 25);

      // 2. HardRivalsCarry (Viego, 75% WR, 74 Perf vs tough rivals) must outscore EasyRivalsFollower (Ezreal, 75% WR, 74 Perf vs weak rivals)
      expect(viegoHard.winRate).toBe(75);
      expect(ezrealEasy.winRate).toBe(75);
      expect(viegoHard.avgPerformance).toBe(74);
      expect(ezrealEasy.avgPerformance).toBe(74);
      expect(viegoHard.avgDifficulty).toBeGreaterThan(ezrealEasy.avgDifficulty + 20);
      expect(viegoHard.pickBreakdown.difficultyBonus).toBeGreaterThan(
        ezrealEasy.pickBreakdown.difficultyBonus
      );
      expect(viegoHard.pickScore).toBeGreaterThan(ezrealEasy.pickScore + 12);
    });

    it('computes player x champion deep detail isolated between personal and group scopes', () => {
      const account = makeAccount({ userId: 'u1', puuid: 'p1', gameName: 'Santi' });
      const groupPuuids = new Set(['p1', 'p2']);

      const mSoloBest = buildSyntheticSummary({
        matchId: 'cd-solo-best',
        puuids: ['p1', 'ext'],
        gameDuration: 1800,
        gameCreation: 1_760_003_000_000,
        playerSpecs: [
          {
            puuid: 'p1',
            championId: 103,
            championName: 'Ahri',
            role: 'MIDDLE',
            win: true,
            score: 94,
            kills: 12,
            deaths: 1,
            assists: 10,
            summoner1Id: 14,
            summoner2Id: 4, // reversed order vs [4, 14]
            primaryRuneId: 8112,
            subStyleId: 8200,
            items: [6655, 3157, 3020, 3089, 3135, 3157, 3363], // duplicate 3157 in slot 5 + trinket 3363 in slot 6
          },
        ],
      });

      const mGroupWin = buildSyntheticSummary({
        matchId: 'cd-grp-win',
        puuids: ['p1', 'p2'],
        gameDuration: 1500,
        gameCreation: 1_760_002_000_000,
        playerSpecs: [
          {
            puuid: 'p1',
            championId: 103,
            championName: 'Ahri',
            role: 'MIDDLE',
            win: true,
            score: 82,
            summoner1Id: 4,
            summoner2Id: 14,
            primaryRuneId: 8112,
            subStyleId: 8200,
            items: [6655, 3157, 3020, 0, 0, 0, 3340],
            isMvp: true,
          },
        ],
      });

      const mGroupLoss = buildSyntheticSummary({
        matchId: 'cd-grp-loss',
        puuids: ['p1', 'p2'],
        gameDuration: 1200,
        gameCreation: 1_760_001_000_000,
        playerSpecs: [
          {
            puuid: 'p1',
            championId: 103,
            championName: 'Ahri',
            role: 'TOP',
            win: false,
            surrender: true,
            score: 45,
            summoner1Id: 4,
            summoner2Id: 12,
            primaryRuneId: 8010,
            subStyleId: 8400,
            items: [6655, 3020, 0, 0, 0, 0, 3340],
            totalTimeSpentDead: 140,
          },
        ],
      });

      const mGroupRemake = buildSyntheticSummary({
        matchId: 'cd-grp-remake',
        puuids: ['p1', 'p2'],
        gameDuration: 185,
        gameCreation: 1_760_004_000_000,
        playerSpecs: [
          {
            puuid: 'p1',
            championId: 103,
            championName: 'Ahri',
            win: false,
            earlySurrender: true,
            score: 99,
          },
        ],
      });

      const allMatches = [mGroupLoss, mGroupWin, mSoloBest, mGroupRemake];

      const personalDetail = computePlayerChampionDetail({
        matches: allMatches,
        account,
        displayName: 'Santi',
        avatarUrl: '',
        championName: '  ahri  ',
        scope: 'personal',
        groupMemberPuuids: groupPuuids,
      });

      expect(personalDetail.championName).toBe('Ahri');
      expect(personalDetail.championId).toBe(103);
      expect(personalDetail.totalGames).toBe(4);
      expect(personalDetail.scoredGames).toBe(3);
      expect(personalDetail.remakes).toBe(1);
      expect(personalDetail.wins).toBe(2);
      expect(personalDetail.ffs).toBe(1);
      expect(personalDetail.bestMatch?.match.matchId).toBe('cd-solo-best');
      expect(personalDetail.worstMatch?.match.matchId).toBe('cd-grp-loss');
      // Newest first order
      expect(personalDetail.matches.map((m) => m.match.matchId)).toEqual([
        'cd-grp-remake',
        'cd-solo-best',
        'cd-grp-win',
        'cd-grp-loss',
      ]);
      // Normalized spells: [14, 4] and [4, 14] merge into { summoner1Id: 4, summoner2Id: 14, games: 2 }
      expect(personalDetail.topSpells[0]).toEqual({
        summoner1Id: 4,
        summoner2Id: 14,
        games: 2,
        winRate: 100,
      });
      // Items: 6655 and 3020 appear in all 3 scored games (100% pickRate); trinket 3363/3340 excluded; duplicate 3157 deduplicated
      expect(personalDetail.topItems.some((i) => i.itemId === 3363 || i.itemId === 3340)).toBe(false);
      const zhonya = personalDetail.topItems.find((i) => i.itemId === 3157);
      expect(zhonya?.games).toBe(2);
      expect(zhonya?.pickRate).toBe(66.7);

      const groupDetail = computePlayerChampionDetail({
        matches: allMatches,
        account,
        displayName: 'Santi',
        avatarUrl: '',
        championName: 'Ahri',
        scope: 'group',
        groupMemberPuuids: groupPuuids,
      });

      expect(groupDetail.totalGames).toBe(3); // excludes mSoloBest
      expect(groupDetail.scoredGames).toBe(2);
      expect(groupDetail.wins).toBe(1);
      expect(groupDetail.ffs).toBe(1);
      expect(groupDetail.bestMatch?.match.matchId).toBe('cd-grp-win');
      expect(groupDetail.worstMatch?.match.matchId).toBe('cd-grp-loss');
      expect(groupDetail.roleDistribution).toHaveLength(2);
      expect(groupDetail.topRunes).toHaveLength(2);

      // Single scored game -> worstMatch is null so it doesn't duplicate bestMatch
      const singleDetail = computePlayerChampionDetail({
        matches: [mSoloBest],
        account,
        displayName: 'Santi',
        avatarUrl: '',
        championName: 'Ahri',
        scope: 'personal',
      });
      expect(singleDetail.bestMatch?.match.matchId).toBe('cd-solo-best');
      expect(singleDetail.worstMatch).toBeNull();

      // Empty match list
      const emptyDetail = computePlayerChampionDetail({
        matches: [],
        account,
        displayName: 'Santi',
        avatarUrl: '',
        championName: 'Ahri',
        scope: 'personal',
      });
      expect(emptyDetail.totalGames).toBe(0);
      expect(emptyDetail.bestMatch).toBeNull();
      expect(emptyDetail.worstMatch).toBeNull();
      expect(emptyDetail.topItems).toEqual([]);
    });
  });

  // ===========================================================================
  // OUTCOME × DURATION MINUTE-BY-MINUTE CURVE & MACRO RANGES (0-10 / 10-20 / 20-30 / 30-40 / 40+)
  // ===========================================================================
  describe('outcome × duration small-sample curve & macro duration ranges', () => {
    it('classifies exact macro range boundaries: 0–10, 10–20, 20–30, 30–40, 40+', () => {
      expect(resolveMacroDurationRange(0)).toBe('0-10');
      expect(resolveMacroDurationRange(420)).toBe('0-10');
      expect(resolveMacroDurationRange(600)).toBe('0-10');

      expect(resolveMacroDurationRange(601)).toBe('10-20');
      expect(resolveMacroDurationRange(950)).toBe('10-20');
      expect(resolveMacroDurationRange(1200)).toBe('10-20');

      expect(resolveMacroDurationRange(1201)).toBe('20-30');
      expect(resolveMacroDurationRange(1500)).toBe('20-30');
      expect(resolveMacroDurationRange(1800)).toBe('20-30');

      expect(resolveMacroDurationRange(1801)).toBe('30-40');
      expect(resolveMacroDurationRange(2100)).toBe('30-40');
      expect(resolveMacroDurationRange(2400)).toBe('30-40');

      expect(resolveMacroDurationRange(2401)).toBe('40+');
      expect(resolveMacroDurationRange(2700)).toBe('40+');
    });

    it('aggregates exact macro range counts, excludes remakes, and sums integer % to 100', () => {
      const samples: LolOutcomeCurveSample[] = [
        { durationSeconds: 200, outcome: 'remake' },
        { durationSeconds: 580, outcome: 'ff' },
        { durationSeconds: 900, outcome: 'ff' },
        { durationSeconds: 1000, outcome: 'win' },
        { durationSeconds: 1150, outcome: 'loss' },
        { durationSeconds: 1300, outcome: 'win' },
        { durationSeconds: 1600, outcome: 'win' },
        { durationSeconds: 1800, outcome: 'loss' },
        { durationSeconds: 1801, outcome: 'win' },
        { durationSeconds: 2100, outcome: 'win' },
        { durationSeconds: 2400, outcome: 'loss' },
        { durationSeconds: 2401, outcome: 'win' },
        { durationSeconds: 2700, outcome: 'loss' },
      ];

      const ranges = computeMacroDurationRangeStats(samples);
      expect(ranges.map((r) => r.key)).toEqual(['0-10', '10-20', '20-30', '30-40', '40+']);
      expect(ranges.map((r) => r.label)).toEqual([
        '0–10 min',
        '10–20 min',
        '20–30 min',
        '30–40 min',
        '40+ min',
      ]);

      // 0-10: 1 FF (remake excluded)
      expect(ranges[0]).toMatchObject({ total: 1, wins: 0, losses: 0, ffs: 1, winPct: 0, lossPct: 0, ffPct: 100 });
      // 10-20: 1V 1D 1FF -> largest remainder sums to 100 exactly
      expect(ranges[1]).toMatchObject({ total: 3, wins: 1, losses: 1, ffs: 1 });
      expect(ranges[1].winPct + ranges[1].lossPct + ranges[1].ffPct).toBe(100);
      // 20-30: 2V 1D 0FF
      expect(ranges[2]).toMatchObject({ total: 3, wins: 2, losses: 1, ffs: 0, winPct: 67, lossPct: 33, ffPct: 0 });
      // 30-40: 2V 1D 0FF
      expect(ranges[3]).toMatchObject({ total: 3, wins: 2, losses: 1, ffs: 0, winPct: 67, lossPct: 33, ffPct: 0 });
      // 40+: 1V 1D 0FF
      expect(ranges[4]).toMatchObject({ total: 2, wins: 1, losses: 1, ffs: 0, winPct: 50, lossPct: 50, ffPct: 0 });
    });

    it('allocateLargestRemainder preserves zeros and exact target sum', () => {
      expect(allocateLargestRemainder([1, 1, 1], 100)).toEqual([34, 33, 33]);
      expect(allocateLargestRemainder([2, 0, 1], 100)).toEqual([67, 0, 33]);
      expect(allocateLargestRemainder([0, 0, 0], 100)).toEqual([0, 0, 0]);
    });

    it('handles edge cases N=0, remakes-only, N=1, and N=2 cleanly', () => {
      // N = 0
      expect(computeOutcomeMinuteCurve([])).toEqual({ model: null, points: [] });

      // Remakes only
      expect(
        computeOutcomeMinuteCurve([
          { durationSeconds: 180, outcome: 'remake' },
          { durationSeconds: 210, outcome: 'remake' },
        ])
      ).toEqual({ model: null, points: [] });

      // N = 1 (single win at 24m)
      const oneCurve = computeOutcomeMinuteCurve(
        [{ durationSeconds: 24 * 60, outcome: 'win' }],
        { startMin: 20, endMin: 28, stepMin: 1 }
      );
      expect(oneCurve.model?.sampleSize).toBe(1);
      expect(oneCurve.points).toHaveLength(9);
      for (const pt of oneCurve.points) {
        expect(pt.winRate).toBe(100);
        expect(pt.lossRate).toBe(0);
        expect(pt.ffRate).toBe(0);
      }

      // N = 2 (1 FF at 16m, 1 Win at 32m) -> smooth transition, exact 100% sum, 0% losses
      const twoCurve = computeOutcomeMinuteCurve(
        [
          { durationSeconds: 16 * 60, outcome: 'ff' },
          { durationSeconds: 32 * 60, outcome: 'win' },
        ],
        { startMin: 14, endMin: 34, stepMin: 1 }
      );
      expect(twoCurve.model?.sampleSize).toBe(2);
      for (const pt of twoCurve.points) {
        const bpSum = Math.round((pt.winRate + pt.lossRate + pt.ffRate) * 100);
        expect(bpSum).toBe(10000);
        expect(pt.lossRate).toBe(0);
      }
      const at16 = twoCurve.points.find((p) => p.minute === 16)!;
      const at32 = twoCurve.points.find((p) => p.minute === 32)!;
      expect(at16.ffRate).toBeGreaterThan(at16.winRate);
      expect(at32.winRate).toBeGreaterThan(at32.ffRate);
    });

    it('guarantees exact 100% sum, smoothness in N<30, and fidelity to FF peak (15–20m) & late-game wins (30m+)', () => {
      // Realistic N = 20 dataset: FF spike in 15–20m, balanced mid-game 21–29m, strong wins in 30–38m
      const samples: LolOutcomeCurveSample[] = [
        // 15–20m: mostly FFs (5 FF, 1 loss)
        { durationSeconds: 15 * 60 + 20, outcome: 'ff' },
        { durationSeconds: 16 * 60 + 10, outcome: 'ff' },
        { durationSeconds: 16 * 60 + 45, outcome: 'ff' },
        { durationSeconds: 17 * 60 + 30, outcome: 'ff' },
        { durationSeconds: 18 * 60 + 15, outcome: 'loss' },
        { durationSeconds: 19 * 60 + 10, outcome: 'ff' },
        // 21–29m: mixed wins & losses (3W, 4L)
        { durationSeconds: 21 * 60 + 40, outcome: 'loss' },
        { durationSeconds: 22 * 60 + 50, outcome: 'win' },
        { durationSeconds: 24 * 60 + 10, outcome: 'loss' },
        { durationSeconds: 25 * 60 + 30, outcome: 'win' },
        { durationSeconds: 26 * 60 + 20, outcome: 'loss' },
        { durationSeconds: 27 * 60 + 45, outcome: 'win' },
        { durationSeconds: 28 * 60 + 55, outcome: 'loss' },
        // 30–39m: strong late-game wins (6W, 1L)
        { durationSeconds: 31 * 60 + 10, outcome: 'win' },
        { durationSeconds: 32 * 60 + 40, outcome: 'win' },
        { durationSeconds: 33 * 60 + 50, outcome: 'win' },
        { durationSeconds: 35 * 60 + 15, outcome: 'loss' },
        { durationSeconds: 36 * 60 + 5, outcome: 'win' },
        { durationSeconds: 37 * 60 + 30, outcome: 'win' },
        { durationSeconds: 38 * 60 + 45, outcome: 'win' },
      ];

      const domain = computeOutcomeChartDomain(samples.map((s) => s.durationSeconds));
      expect(domain.startMin).toBe(13); // No dead 0–10m gap
      expect(domain.endMin).toBe(40); // Capped at 30–40m upper bound so 40+ isn't opened empty

      const { model, points } = computeOutcomeMinuteCurve(samples, {
        startMin: domain.startMin,
        endMin: domain.endMin,
        stepMin: 1,
      });

      expect(model).not.toBeNull();
      expect(points).toHaveLength(domain.endMin - domain.startMin + 1);

      // 1. Exact sum = 100.00% at every minute and all rates in [0, 100]
      for (const pt of points) {
        const bpSum = Math.round((pt.winRate + pt.lossRate + pt.ffRate) * 100);
        expect(bpSum).toBe(10000);
        expect(pt.winRate).toBeGreaterThanOrEqual(0);
        expect(pt.lossRate).toBeGreaterThanOrEqual(0);
        expect(pt.ffRate).toBeGreaterThanOrEqual(0);
        expect(pt.effectiveGames).toBeGreaterThan(0);
      }

      // 2. Smoothness: no violent 0%↔100% minute-to-minute jumps
      for (let i = 1; i < points.length; i++) {
        expect(Math.abs(points[i].winRate - points[i - 1].winRate)).toBeLessThan(12);
        expect(Math.abs(points[i].lossRate - points[i - 1].lossRate)).toBeLessThan(12);
        expect(Math.abs(points[i].ffRate - points[i - 1].ffRate)).toBeLessThan(12);
      }

      // 3. Trend fidelity: FF peak in 15–20m, late-game Win dominance in 30m+
      const at17 = points.find((p) => p.minute === 17)!;
      const at25 = points.find((p) => p.minute === 25)!;
      const at35 = points.find((p) => p.minute === 35)!;

      expect(at17.ffRate).toBeGreaterThan(50);
      expect(at17.ffRate).toBeGreaterThan(at35.ffRate + 35);
      expect(at35.winRate).toBeGreaterThan(60);
      expect(at35.winRate).toBeGreaterThan(at17.winRate + 35);
      expect(at25.lossRate).toBeGreaterThan(at17.lossRate);
    });

    it('shrinks gently toward global prior in sparse tails and keeps zero classes at 0%', () => {
      const noFfSamples: LolOutcomeCurveSample[] = [
        { durationSeconds: 20 * 60, outcome: 'win' },
        { durationSeconds: 22 * 60, outcome: 'loss' },
        { durationSeconds: 24 * 60, outcome: 'win' },
        { durationSeconds: 26 * 60, outcome: 'loss' },
        { durationSeconds: 28 * 60, outcome: 'win' },
        { durationSeconds: 45 * 60, outcome: 'loss' }, // lone outlier at 45m
      ];
      const model = buildOutcomeCurveModel(noFfSamples)!;
      expect(model.prior.ff).toBe(0);

      // Even at the lone 45m loss outlier, adaptive bandwidth + prior prevents 100% loss spike
      const at45 = estimateOutcomeAtMinute(model, 45);
      expect(at45.ffRate).toBe(0);
      expect(at45.lossRate).toBeLessThan(90);
      expect(at45.winRate).toBeGreaterThan(10);
      expect(Math.round((at45.winRate + at45.lossRate + at45.ffRate) * 100)).toBe(10000);
    });

    it('computes smart X domain: omits empty 0–10m, includes full 0–10m when present, enforces min span', () => {
      // No <10m game -> starts near shortest game, not at 0
      expect(computeOutcomeChartDomain([15 * 60, 34 * 60])).toEqual({
        startMin: 13,
        endMin: 36,
      });

      // Has a <10m game -> includes full 0–10m range
      expect(computeOutcomeChartDomain([8 * 60 + 20, 27 * 60])).toEqual({
        startMin: 0,
        endMin: 29,
      });

      // All games in 20–30m -> respects 20 and 30 caps cleanly
      expect(computeOutcomeChartDomain([21 * 60, 28 * 60 + 30])).toEqual({
        startMin: 20,
        endMin: 30,
      });

      // Single game -> guarantees minimum 8-minute span
      const singleDomain = computeOutcomeChartDomain([25 * 60]);
      expect(singleDomain.endMin - singleDomain.startMin).toBeGreaterThanOrEqual(8);

      // Large N=60 dataset runs cleanly and stays bounded
      const largeSamples: LolOutcomeCurveSample[] = Array.from({ length: 60 }, (_, i) => ({
        durationSeconds: (14 + (i % 28)) * 60 + (i * 17) % 60,
        outcome: i % 5 === 0 ? 'ff' : i % 2 === 0 ? 'win' : 'loss',
      }));
      const largeCurve = computeOutcomeMinuteCurve(largeSamples);
      expect(largeCurve.model?.sampleSize).toBe(60);
      expect(largeCurve.points.length).toBeGreaterThan(20);
      for (const pt of largeCurve.points) {
        expect(Math.round((pt.winRate + pt.lossRate + pt.ffRate) * 100)).toBe(10000);
      }
    });
  });

  // ===========================================================================
  // MULTI-ACCOUNT SUPPORT (primary + secondary accounts merged per userId)
  // ===========================================================================
  describe('multi-account aggregation (primary + secondary accounts per user)', () => {
    const accounts: LolAccount[] = [
      {
        userId: 'u-santi',
        puuid: 'puuid-santi-main',
        isPrimary: true,
        gameName: 'SantiMain',
        tagLine: 'LAS',
        platform: 'la2',
        regionalCluster: 'americas',
        summonerLevel: 210,
        profileIconId: 29,
        rankedSolo: null,
        rankedFlex: null,
        ddragonVersion: '15.22.1',
        lastSyncedAt: null,
      },
      {
        userId: 'u-santi',
        puuid: 'puuid-santi-smurf',
        isPrimary: false,
        gameName: 'SantiSmurf',
        tagLine: 'LAS',
        platform: 'la2',
        regionalCluster: 'americas',
        summonerLevel: 42,
        profileIconId: 7,
        rankedSolo: null,
        rankedFlex: null,
        ddragonVersion: '15.22.1',
        lastSyncedAt: null,
      },
      {
        userId: 'u-mateo',
        puuid: 'puuid-mateo-main',
        isPrimary: true,
        gameName: 'MateoMain',
        tagLine: 'LAS',
        platform: 'la2',
        regionalCluster: 'americas',
        summonerLevel: 150,
        profileIconId: 12,
        rankedSolo: null,
        rankedFlex: null,
        ddragonVersion: '15.22.1',
        lastSyncedAt: null,
      },
    ];

    const profiles = [
      { id: 'u-santi', displayName: 'Santi', avatarUrl: 's.png' },
      { id: 'u-mateo', displayName: 'Mateo', avatarUrl: 'm.png' },
    ];

    const makeMultiMatch = (
      matchId: string,
      p1: { puuid: string; championId: number; championName: string; kills: number; win: boolean },
      p2?: { puuid: string; championId: number; championName: string; kills: number; win: boolean }
    ): LolMatchSummary => {
      const overrides: Array<Partial<RiotMatchV5Participant>> = [
        {},
        p2
          ? {
              puuid: p2.puuid,
              championId: p2.championId,
              championName: p2.championName,
              kills: p2.kills,
              deaths: 3,
              assists: 7,
            }
          : {},
        {
          puuid: p1.puuid,
          championId: p1.championId,
          championName: p1.championName,
          kills: p1.kills,
          deaths: 2,
          assists: 8,
        },
      ];
      return buildMatchSummaryFromRiotMatch(
        makeStandard5v5Match({
          matchId,
          gameDuration: 1800,
          winningTeamId: p1.win ? 100 : 200,
          participantOverrides: overrides,
        })
      );
    };

    const matches: LolMatchSummary[] = [
      // Match 1: Santi Main + Mateo (group win, Ahri)
      makeMultiMatch(
        'M-1',
        { puuid: 'puuid-santi-main', championId: 103, championName: 'Ahri', kills: 12, win: true },
        { puuid: 'puuid-mateo-main', championId: 64, championName: 'LeeSin', kills: 8, win: true }
      ),
      // Match 2: Santi Smurf + Mateo (group win, Ahri)
      makeMultiMatch(
        'M-2',
        { puuid: 'puuid-santi-smurf', championId: 103, championName: 'Ahri', kills: 14, win: true },
        { puuid: 'puuid-mateo-main', championId: 64, championName: 'LeeSin', kills: 6, win: true }
      ),
      // Match 3: Santi Smurf + Mateo (group loss, Ahri)
      makeMultiMatch(
        'M-3',
        { puuid: 'puuid-santi-smurf', championId: 103, championName: 'Ahri', kills: 4, win: false },
        { puuid: 'puuid-mateo-main', championId: 64, championName: 'LeeSin', kills: 3, win: false }
      ),
      // Match 4: Santi Smurf SOLO (not group, Yasuo)
      makeMultiMatch('M-4', {
        puuid: 'puuid-santi-smurf',
        championId: 157,
        championName: 'Yasuo',
        kills: 9,
        win: true,
      }),
    ];

    it('groups accounts by userId, resolves primary account, and prevents same-user double-counting in group detection', () => {
      const groups = groupAccountsByUser(accounts);
      expect(groups).toHaveLength(2);
      expect(resolveUserPrimaryAccount(accounts, 'u-santi')?.puuid).toBe('puuid-santi-main');
      expect(getUserAccounts(accounts, 'u-santi').map((a) => a.puuid)).toEqual([
        'puuid-santi-main',
        'puuid-santi-smurf',
      ]);
      expect(Array.from(getUserPuuids(accounts, 'u-santi')).sort()).toEqual([
        'puuid-santi-main',
        'puuid-santi-smurf',
      ]);

      const groupPuuids = new Set(accounts.map((a) => a.puuid));
      const puuidToUserId = buildPuuidToUserIdMap(accounts);
      // Edge case: if two accounts of the same user appeared in a match, count = 1 (not a group match)
      const sameUserFakeMatch = { participantPuuids: ['puuid-santi-main', 'puuid-santi-smurf'] };
      expect(countGroupMembersInMatch(sameUserFakeMatch, groupPuuids, puuidToUserId)).toBe(1);
      expect(isGroupMatch(sameUserFakeMatch, groupPuuids, puuidToUserId)).toBe(false);
    });

    it('merges primary + secondary matches across personal stats, leaderboard, picks, records, and champion detail', () => {
      const groupPuuids = new Set(accounts.map((a) => a.puuid));
      const puuidToUserId = buildPuuidToUserIdMap(accounts);
      const santiPuuids = getUserPuuids(accounts, 'u-santi');
      const santiMain = resolveUserPrimaryAccount(accounts, 'u-santi')!;

      // 1. Personal & In-Group aggregates
      const agg = computePlayerAggregates(matches, santiPuuids, groupPuuids, 'all', puuidToUserId);
      expect(agg.personal.totalGames).toBe(4); // 1 main + 3 smurf
      expect(agg.personal.wins).toBe(3);
      expect(agg.inGroup.totalGames).toBe(3); // M-1 (main) + M-2, M-3 (smurf)
      expect(agg.soloOnly.totalGames).toBe(1); // M-4 (smurf)

      // 2. Group Leaderboard -> ONE entry per user (2 total, not 3), combining main + smurf + duo partner
      const leaderboard = computeGroupLeaderboard({
        matches,
        accounts,
        playerProfiles: profiles,
      });
      expect(leaderboard).toHaveLength(2);
      const santiRow = leaderboard.find((e) => e.userId === 'u-santi')!;
      expect(santiRow.account.puuid).toBe('puuid-santi-main');
      expect(santiRow.groupGamesTotal).toBe(3);
      expect(santiRow.personalGamesTotal).toBe(4);
      expect(santiRow.topDuoPartner?.userId).toBe('u-mateo');
      expect(santiRow.topDuoPartner?.gamesTogether).toBe(3);

      // 3. Role Leaderboard -> ONE entry for Santi in MIDDLE with 3 games
      const roleBoard = computeGroupLeaderboardByRole({
        matches,
        accounts,
        playerProfiles: profiles,
      });
      expect(roleBoard.MIDDLE).toHaveLength(1);
      expect(roleBoard.MIDDLE[0].userId).toBe('u-santi');
      expect(roleBoard.MIDDLE[0].games).toBe(3);

      // 4. Group Picks -> Ahri across main (1G) + smurf (2G) qualifies for minGames=3 as 1 entry
      const picks = computeGroupPicks({
        matches,
        accounts,
        playerProfiles: profiles,
        minGames: 3,
      });
      const santiAhri = picks.allPicks.find(
        (p) => p.userId === 'u-santi' && p.championName === 'Ahri'
      );
      expect(santiAhri).toBeDefined();
      expect(santiAhri?.games).toBe(3);
      expect(santiAhri?.wins).toBe(2);
      expect(santiAhri?.account.puuid).toBe('puuid-santi-main');

      // 5. Personal Records -> sees 14 kills peak achieved on secondary account
      const pRecords = computePersonalRecords({
        matches,
        account: santiMain,
        puuids: santiPuuids,
        displayName: 'Santi',
        avatarUrl: 's.png',
      });
      const killsRec = pRecords.find((r) => r.id === 'most_kills');
      expect(killsRec?.valueLabel).toBe('14 kills');
      expect(killsRec?.matchId).toBe('M-2');

      // 6. Group Records -> combines all 3 group games for Santi
      const gRecords = computeGroupRecords({
        matches,
        accounts,
        playerProfiles: profiles,
        scope: 'group',
      });
      const gKillsRec = gRecords.find((r) => r.id === 'most_kills');
      expect(gKillsRec?.userId).toBe('u-santi');
      expect(gKillsRec?.gamesSample).toBe(3);

      // 7. Champion Detail -> merges Ahri across main + smurf (3G total)
      const ahriDetail = computePlayerChampionDetail({
        matches,
        account: santiMain,
        puuids: santiPuuids,
        displayName: 'Santi',
        avatarUrl: 's.png',
        championName: 'Ahri',
        scope: 'personal',
        groupMemberPuuids: groupPuuids,
        puuidToUserId,
      });
      expect(ahriDetail.totalGames).toBe(3);
      expect(ahriDetail.wins).toBe(2);
    });
  });
});
