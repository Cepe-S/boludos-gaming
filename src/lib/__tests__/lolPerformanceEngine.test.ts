import { describe, it, expect } from 'vitest';
import {
  buildMatchSummaryFromRiotMatch,
  classifyMatchOutcome,
  computeDurationBuckets,
  computeGroupLeaderboard,
  computeGroupLeaderboardByRole,
  computeGroupRecords,
  computePlayerAggregates,
  countGroupMembersInMatch,
  getGradeFromScore,
  getQueueCategory,
  getRegionalClusterForPlatform,
  isGroupMatch,
  resolveParticipantRole,
  ROLE_WEIGHT_MATRIX,
  scoreMatchParticipants,
} from '../lolPerformanceEngine';
import type {
  LolAccount,
  LolMatchSummary,
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
      expect(getQueueCategory(450)).toBe('aram');
      expect(getQueueCategory(1700)).toBe('arena');
      expect(getQueueCategory(900, 'URF')).toBe('other');
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
    function buildSyntheticSummary(params: {
      matchId: string;
      puuids: string[];
      queueId?: number;
      gameDuration?: number;
      playerSpecs: Array<{
        puuid: string;
        teamId?: number;
        championId?: number;
        championName?: string;
        win: boolean;
        surrender?: boolean;
        earlySurrender?: boolean;
        kills?: number;
        deaths?: number;
        assists?: number;
        score: number;
        isMvp?: boolean;
        isAce?: boolean;
      }>;
    }): LolMatchSummary {
      const {
        matchId,
        puuids,
        queueId = 420,
        gameDuration = 1800,
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
          teamPosition: 'MIDDLE',
          individualPosition: 'MIDDLE',
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
          cs: 210,
          csPerMin: 7,
          goldEarned: 13500,
          damageToChampions: 24000,
          damageTaken: 15000,
          damageToObjectives: 6000,
          damageToTurrets: 4000,
          visionScore: 25,
          killParticipation: 0.65,
          summoner1Id: 4,
          summoner2Id: 14,
          primaryRuneId: 8112,
          primaryStyleId: 8100,
          subStyleId: 8200,
          items: [3157, 3020, 6655, 3089, 3135, 0, 3363],
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
            weights: ROLE_WEIGHT_MATRIX.MIDDLE,
            role: 'MIDDLE' as const,
            queueCategory: getQueueCategory(queueId),
            isRemake,
            laneDiff: null,
            outcomeAdjustment: spec.win ? 3 : -2,
            mechanicsBonus: 1,
            drivers: [],
          },
          matchRank: isRemake ? 0 : 1,
          isMvp: isRemake ? false : Boolean(spec.isMvp),
          isAce: isRemake ? false : Boolean(spec.isAce),
          highlights: isRemake ? ['Remake'] : [],
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
        gameCreation: 1730000000000,
        gameStartTimestamp: 1730000000000,
        gameEndTimestamp: 1730000000000 + gameDuration * 1000,
        gameDuration,
        endOfGameResult: 'GameComplete',
        participantPuuids: puuids,
        teams: [],
        participants,
      };
    }

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
});
