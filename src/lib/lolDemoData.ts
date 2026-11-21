import { PlayerProfile } from '../types/domain';
import {
  LolAccount,
  LolMatchSummary,
  RiotMatchV5,
  RiotMatchV5Challenges,
  RiotMatchV5Participant,
  RiotMatchV5Perks,
} from '../types/lol';
import { DEFAULT_DDRAGON_VERSION } from './lolDdragon';
import { buildMatchSummaryFromRiotMatch } from './lolPerformanceEngine';

interface DemoRosterTemplate {
  puuid: string;
  gameName: string;
  tagLine: string;
  profileIconId: number;
  summonerLevel: number;
  tierSolo: string;
  rankSolo: string;
  lpSolo: number;
  tierFlex: string;
  rankFlex: string;
  lpFlex: number;
  preferredRoles: string[];
  champions: Array<{ championId: number; championName: string }>;
  skillFactor: number;
}

const DEMO_TEMPLATES: DemoRosterTemplate[] = [
  {
    puuid: 'demo-puuid-01',
    gameName: 'SantiSuizo',
    tagLine: 'LAS',
    profileIconId: 4834,
    summonerLevel: 342,
    tierSolo: 'EMERALD',
    rankSolo: 'II',
    lpSolo: 64,
    tierFlex: 'DIAMOND',
    rankFlex: 'IV',
    lpFlex: 22,
    preferredRoles: ['MIDDLE', 'JUNGLE'],
    champions: [
      { championId: 103, championName: 'Ahri' },
      { championId: 517, championName: 'Sylas' },
      { championId: 64, championName: 'LeeSin' },
      { championId: 61, championName: 'Orianna' },
    ],
    skillFactor: 1.18,
  },
  {
    puuid: 'demo-puuid-02',
    gameName: 'TinchoCarry',
    tagLine: 'LAS',
    profileIconId: 5368,
    summonerLevel: 289,
    tierSolo: 'PLATINUM',
    rankSolo: 'I',
    lpSolo: 81,
    tierFlex: 'EMERALD',
    rankFlex: 'III',
    lpFlex: 47,
    preferredRoles: ['BOTTOM', 'MIDDLE'],
    champions: [
      { championId: 222, championName: 'Jinx' },
      { championId: 145, championName: 'Kaisa' },
      { championId: 81, championName: 'Ezreal' },
      { championId: 498, championName: 'Xayah' },
    ],
    skillFactor: 1.12,
  },
  {
    puuid: 'demo-puuid-03',
    gameName: 'LuchoClutch',
    tagLine: 'ARG',
    profileIconId: 4561,
    summonerLevel: 245,
    tierSolo: 'EMERALD',
    rankSolo: 'IV',
    lpSolo: 18,
    tierFlex: 'PLATINUM',
    rankFlex: 'I',
    lpFlex: 73,
    preferredRoles: ['TOP', 'JUNGLE'],
    champions: [
      { championId: 266, championName: 'Aatrox' },
      { championId: 24, championName: 'Jax' },
      { championId: 234, championName: 'Viego' },
      { championId: 59, championName: 'JarvanIV' },
    ],
    skillFactor: 1.08,
  },
  {
    puuid: 'demo-puuid-04',
    gameName: 'NachoSupp',
    tagLine: '15M',
    profileIconId: 5022,
    summonerLevel: 198,
    tierSolo: 'GOLD',
    rankSolo: 'I',
    lpSolo: 55,
    tierFlex: 'PLATINUM',
    rankFlex: 'III',
    lpFlex: 14,
    preferredRoles: ['UTILITY', 'MIDDLE'],
    champions: [
      { championId: 412, championName: 'Thresh' },
      { championId: 111, championName: 'Nautilus' },
      { championId: 89, championName: 'Leona' },
      { championId: 99, championName: 'Lux' },
    ],
    skillFactor: 0.96,
  },
  {
    puuid: 'demo-puuid-05',
    gameName: 'FedeHumo',
    tagLine: 'FF15',
    profileIconId: 3556,
    summonerLevel: 164,
    tierSolo: 'GOLD',
    rankSolo: 'III',
    lpSolo: 32,
    tierFlex: 'GOLD',
    rankFlex: 'II',
    lpFlex: 40,
    preferredRoles: ['JUNGLE', 'TOP'],
    champions: [
      { championId: 120, championName: 'Hecarim' },
      { championId: 777, championName: 'Yone' },
      { championId: 122, championName: 'Darius' },
      { championId: 154, championName: 'Zac' },
    ],
    skillFactor: 0.86,
  },
];

const ENEMY_POOL: Array<{
  championId: number;
  championName: string;
  role: string;
  name: string;
  tag: string;
}> = [
  { championId: 122, championName: 'Darius', role: 'TOP', name: 'RivalTop', tag: 'LA2' },
  { championId: 121, championName: 'Khazix', role: 'JUNGLE', name: 'SombraJG', tag: 'LAS' },
  { championId: 112, championName: 'Viktor', role: 'MIDDLE', name: 'RayoMid', tag: 'ARG' },
  { championId: 51, championName: 'Caitlyn', role: 'BOTTOM', name: 'SniperAR', tag: 'CL' },
  { championId: 497, championName: 'Rakan', role: 'UTILITY', name: 'PeelBot', tag: 'LAS' },
  { championId: 86, championName: 'Garen', role: 'TOP', name: 'DemaciaOK', tag: 'LAS' },
  { championId: 64, championName: 'LeeSin', role: 'JUNGLE', name: 'InsecBoy', tag: 'AR2' },
  { championId: 238, championName: 'Zed', role: 'MIDDLE', name: 'Shadow99', tag: 'LAS' },
  { championId: 21, championName: 'MissFortune', role: 'BOTTOM', name: 'BulletTime', tag: 'LAS' },
  { championId: 25, championName: 'Morgana', role: 'UTILITY', name: 'BlackShield', tag: 'UY' },
];

const RUNE_SETS_BY_ROLE: Record<string, { primaryStyle: number; keystone: number; minors: number[]; subStyle: number; subs: number[] }> = {
  TOP: {
    primaryStyle: 8000,
    keystone: 8010,
    minors: [9111, 9104, 8299],
    subStyle: 8400,
    subs: [8473, 8451],
  },
  JUNGLE: {
    primaryStyle: 8000,
    keystone: 8010,
    minors: [9111, 9105, 8014],
    subStyle: 8300,
    subs: [8304, 8347],
  },
  MIDDLE: {
    primaryStyle: 8100,
    keystone: 8112,
    minors: [8143, 8138, 8135],
    subStyle: 8200,
    subs: [8226, 8236],
  },
  BOTTOM: {
    primaryStyle: 8000,
    keystone: 8008,
    minors: [9101, 9103, 8017],
    subStyle: 8300,
    subs: [8304, 8345],
  },
  UTILITY: {
    primaryStyle: 8400,
    keystone: 8439,
    minors: [8446, 8429, 8242],
    subStyle: 8300,
    subs: [8306, 8347],
  },
};

const SPELLS_BY_ROLE: Record<string, [number, number]> = {
  TOP: [4, 12],
  JUNGLE: [4, 11],
  MIDDLE: [4, 14],
  BOTTOM: [4, 7],
  UTILITY: [4, 3],
  ARAM: [4, 32],
};

const ITEMS_BY_ROLE: Record<string, number[]> = {
  TOP: [6630, 3071, 3053, 3047, 3065, 3075, 3340],
  JUNGLE: [6692, 3078, 3156, 3111, 3053, 3026, 3364],
  MIDDLE: [6655, 3089, 3157, 3020, 3135, 3102, 3340],
  BOTTOM: [3031, 3094, 3036, 3006, 3072, 3026, 3363],
  UTILITY: [3869, 3190, 3109, 3158, 3050, 2055, 3364],
  ARAM: [3089, 3157, 3116, 3020, 3135, 3165, 2052],
};

function seededFloat(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

interface ScenarioSpec {
  idSuffix: string;
  hoursAgo: number;
  queueId: number;
  gameMode: string;
  durationSec: number;
  team100Win: boolean;
  isSurrender: boolean;
  isEarlySurrender: boolean;
  groupIndices: number[]; // indices into group accounts
}

const SCENARIO_SPECS: ScenarioSpec[] = [
  // Recent match 1: 5-stack Flex Win 27m
  { idSuffix: '001', hoursAgo: 2, queueId: 440, gameMode: 'CLASSIC', durationSec: 1640, team100Win: true, isSurrender: false, isEarlySurrender: false, groupIndices: [0, 1, 2, 3, 4] },
  // 2: Trio Flex Win 34m (30+)
  { idSuffix: '002', hoursAgo: 5, queueId: 440, gameMode: 'CLASSIC', durationSec: 2050, team100Win: true, isSurrender: false, isEarlySurrender: false, groupIndices: [0, 1, 3] },
  // 3: SoloQ Loss 24m (only member 0)
  { idSuffix: '003', hoursAgo: 9, queueId: 420, gameMode: 'CLASSIC', durationSec: 1480, team100Win: false, isSurrender: false, isEarlySurrender: false, groupIndices: [0] },
  // 4: Duo SoloQ FF15 (0-20)
  { idSuffix: '004', hoursAgo: 14, queueId: 420, gameMode: 'CLASSIC', durationSec: 960, team100Win: false, isSurrender: true, isEarlySurrender: false, groupIndices: [0, 2] },
  // 5: 4-stack ARAM Win 18m (0-20)
  { idSuffix: '005', hoursAgo: 20, queueId: 450, gameMode: 'ARAM', durationSec: 1090, team100Win: true, isSurrender: false, isEarlySurrender: false, groupIndices: [0, 1, 2, 4] },
  // 6: 5-stack Normal Enemy FF Win 17m (0-20 enemySurrendered!)
  { idSuffix: '006', hoursAgo: 26, queueId: 400, gameMode: 'CLASSIC', durationSec: 1030, team100Win: true, isSurrender: true, isEarlySurrender: false, groupIndices: [0, 1, 2, 3, 4] },
  // 7: Remake 3m15s (0-5)
  { idSuffix: '007', hoursAgo: 31, queueId: 420, gameMode: 'CLASSIC', durationSec: 195, team100Win: false, isSurrender: false, isEarlySurrender: true, groupIndices: [0, 1] },
  // 8: Trio Flex Loss 38m (30+)
  { idSuffix: '008', hoursAgo: 39, queueId: 440, gameMode: 'CLASSIC', durationSec: 2290, team100Win: false, isSurrender: false, isEarlySurrender: false, groupIndices: [0, 1, 4] },
  // 9: SoloQ Win 29m (20-30)
  { idSuffix: '009', hoursAgo: 45, queueId: 420, gameMode: 'CLASSIC', durationSec: 1750, team100Win: true, isSurrender: false, isEarlySurrender: false, groupIndices: [0] },
  // 10: Duo Flex Win 23m (20-30)
  { idSuffix: '010', hoursAgo: 52, queueId: 440, gameMode: 'CLASSIC', durationSec: 1380, team100Win: true, isSurrender: false, isEarlySurrender: false, groupIndices: [0, 3] },
  // 11: 4-stack Normal FF 19m (0-20)
  { idSuffix: '011', hoursAgo: 60, queueId: 400, gameMode: 'CLASSIC', durationSec: 1140, team100Win: false, isSurrender: true, isEarlySurrender: false, groupIndices: [0, 2, 3, 4] },
  // 12: SoloQ Win 35m (30+)
  { idSuffix: '012', hoursAgo: 68, queueId: 420, gameMode: 'CLASSIC', durationSec: 2110, team100Win: true, isSurrender: false, isEarlySurrender: false, groupIndices: [0] },
  // 13: Duo Flex Loss FF 25m (20-30)
  { idSuffix: '013', hoursAgo: 74, queueId: 440, gameMode: 'CLASSIC', durationSec: 1510, team100Win: false, isSurrender: true, isEarlySurrender: false, groupIndices: [1, 3] },
  // 14: 5-stack Flex Win 31m (30+)
  { idSuffix: '014', hoursAgo: 82, queueId: 440, gameMode: 'CLASSIC', durationSec: 1890, team100Win: true, isSurrender: false, isEarlySurrender: false, groupIndices: [0, 1, 2, 3, 4] },
  // 15: ARAM Loss 21m (20-30)
  { idSuffix: '015', hoursAgo: 90, queueId: 450, gameMode: 'ARAM', durationSec: 1270, team100Win: false, isSurrender: false, isEarlySurrender: false, groupIndices: [0, 1, 2] },
  // 16: SoloQ Remake 3m40s (0-5)
  { idSuffix: '016', hoursAgo: 98, queueId: 420, gameMode: 'CLASSIC', durationSec: 220, team100Win: false, isSurrender: false, isEarlySurrender: true, groupIndices: [0] },
  // 17: Trio Flex Win 26m (20-30)
  { idSuffix: '017', hoursAgo: 106, queueId: 440, gameMode: 'CLASSIC', durationSec: 1580, team100Win: true, isSurrender: false, isEarlySurrender: false, groupIndices: [0, 1, 2] },
  // 18: Duo Normal Loss 33m (30+)
  { idSuffix: '018', hoursAgo: 114, queueId: 400, gameMode: 'CLASSIC', durationSec: 1990, team100Win: false, isSurrender: false, isEarlySurrender: false, groupIndices: [0, 4] },
  // 19: SoloQ FF 22m (20-30)
  { idSuffix: '019', hoursAgo: 122, queueId: 420, gameMode: 'CLASSIC', durationSec: 1320, team100Win: false, isSurrender: true, isEarlySurrender: false, groupIndices: [0] },
  // 20: 4-stack Flex Win 36m (30+)
  { idSuffix: '020', hoursAgo: 132, queueId: 440, gameMode: 'CLASSIC', durationSec: 2180, team100Win: true, isSurrender: false, isEarlySurrender: false, groupIndices: [0, 1, 2, 3] },
  // 21: SoloQ Win 27m (20-30)
  { idSuffix: '021', hoursAgo: 144, queueId: 420, gameMode: 'CLASSIC', durationSec: 1620, team100Win: true, isSurrender: false, isEarlySurrender: false, groupIndices: [1] },
  // 22: Duo Flex Win 41m (30+)
  { idSuffix: '022', hoursAgo: 156, queueId: 440, gameMode: 'CLASSIC', durationSec: 2460, team100Win: true, isSurrender: false, isEarlySurrender: false, groupIndices: [2, 3] },
  // 23: SoloQ Loss 28m (20-30)
  { idSuffix: '023', hoursAgo: 168, queueId: 420, gameMode: 'CLASSIC', durationSec: 1690, team100Win: false, isSurrender: false, isEarlySurrender: false, groupIndices: [0] },
  // 24: 5-stack Flex Loss FF 32m (30+)
  { idSuffix: '024', hoursAgo: 180, queueId: 440, gameMode: 'CLASSIC', durationSec: 1920, team100Win: false, isSurrender: true, isEarlySurrender: false, groupIndices: [0, 1, 2, 3, 4] },
];

function buildPerks(role: string, seed: number): RiotMatchV5Perks {
  const cfg = RUNE_SETS_BY_ROLE[role] || RUNE_SETS_BY_ROLE.MIDDLE;
  const v = (mult: number) => Math.round(seededFloat(seed + mult) * mult);
  return {
    statPerks: {
      defense: role === 'UTILITY' ? 5001 : 5002,
      flex: 5008,
      offense: role === 'BOTTOM' ? 5005 : 5008,
    },
    styles: [
      {
        description: 'primaryStyle',
        style: cfg.primaryStyle,
        selections: [
          { perk: cfg.keystone, var1: v(1850), var2: v(920), var3: v(410) },
          { perk: cfg.minors[0], var1: v(640), var2: v(280), var3: 0 },
          { perk: cfg.minors[1], var1: v(14), var2: v(35), var3: 0 },
          { perk: cfg.minors[2], var1: v(780), var2: 0, var3: 0 },
        ],
      },
      {
        description: 'subStyle',
        style: cfg.subStyle,
        selections: [
          { perk: cfg.subs[0], var1: v(420), var2: v(190), var3: 0 },
          { perk: cfg.subs[1], var1: v(18), var2: v(9), var3: 0 },
        ],
      },
    ],
  };
}

function buildDemoParticipant(params: {
  participantId: number;
  teamId: number;
  puuid: string;
  gameName: string;
  tagLine: string;
  championId: number;
  championName: string;
  role: string;
  win: boolean;
  isSurrender: boolean;
  isEarlySurrender: boolean;
  durationSec: number;
  isAram: boolean;
  skillFactor: number;
  seed: number;
  profileIconId: number;
  summonerLevel: number;
}): RiotMatchV5Participant {
  const {
    participantId,
    teamId,
    puuid,
    gameName,
    tagLine,
    championId,
    championName,
    role,
    win,
    isSurrender,
    isEarlySurrender,
    durationSec,
    isAram,
    skillFactor,
    seed,
    profileIconId,
    summonerLevel,
  } = params;

  const mins = Math.max(3, durationSec / 60);
  const rand = (offset: number) => seededFloat(seed + offset);
  const outcomeBoost = win ? 1.18 : 0.84;
  const isRemake = isEarlySurrender || durationSec < 240;

  const kills = isRemake
    ? Math.floor(rand(1) * 1.3)
    : role === 'UTILITY'
      ? Math.max(0, Math.round((1 + rand(2) * 3) * outcomeBoost * skillFactor))
      : Math.max(1, Math.round((3 + rand(3) * 8) * outcomeBoost * skillFactor * (mins / 24)));

  const deaths = isRemake
    ? Math.floor(rand(4) * 1.2)
    : Math.max(0, Math.round((2 + rand(5) * 6) * (win ? 0.72 : 1.25) / Math.max(0.75, skillFactor)));

  const assists = isRemake
    ? Math.floor(rand(6) * 1.4)
    : role === 'UTILITY'
      ? Math.max(2, Math.round((8 + rand(7) * 14) * outcomeBoost * skillFactor * (mins / 24)))
      : Math.max(1, Math.round((4 + rand(8) * 9) * outcomeBoost * (mins / 24)));

  const csPerMinBase =
    isAram
      ? 2.8
      : role === 'UTILITY'
        ? 1.2
        : role === 'JUNGLE'
          ? 6.1
          : 7.4;

  const totalMinionsKilled = isRemake
    ? Math.round(mins * 4)
    : role === 'JUNGLE'
      ? Math.round(mins * 1.2 * skillFactor)
      : Math.round(mins * csPerMinBase * skillFactor * (0.85 + rand(9) * 0.3));

  const neutralMinionsKilled = isRemake
    ? 0
    : role === 'JUNGLE'
      ? Math.round(mins * 5.2 * skillFactor)
      : Math.round(mins * 0.4 * rand(10));

  const goldEarned = isRemake
    ? 1100 + Math.round(rand(11) * 250)
    : Math.round(mins * (role === 'UTILITY' ? 320 : 415) * outcomeBoost * (0.88 + skillFactor * 0.18));

  const dmgToChamps = isRemake
    ? Math.round(450 + rand(12) * 600)
    : Math.round(
        mins *
          (role === 'UTILITY' ? 420 : isAram ? 1150 : 880) *
          outcomeBoost *
          skillFactor *
          (0.8 + rand(13) * 0.45)
      );

  const dmgTaken = isRemake
    ? Math.round(500 + rand(14) * 600)
    : Math.round(mins * (role === 'TOP' || role === 'JUNGLE' ? 980 : 620) * (0.8 + rand(15) * 0.45));

  const dmgTurrets = isRemake
    ? 0
    : Math.round(mins * (role === 'BOTTOM' || role === 'TOP' ? 190 : 95) * (win ? 1.45 : 0.45) * (0.6 + rand(16) * 0.8));

  const dmgObjectives = isRemake
    ? 0
    : Math.round(
        dmgTurrets +
          mins * (role === 'JUNGLE' ? 480 : 160) * (win ? 1.3 : 0.65) * (0.7 + rand(17) * 0.6)
      );

  const visionScore = isAram || isRemake
    ? isRemake ? 1 : Math.round(mins * 0.15)
    : Math.round(mins * (role === 'UTILITY' ? 2.1 : role === 'JUNGLE' ? 1.15 : 0.85) * skillFactor);

  const items = ITEMS_BY_ROLE[isAram ? 'ARAM' : role] || ITEMS_BY_ROLE.MIDDLE;
  const spells = SPELLS_BY_ROLE[isAram ? 'ARAM' : role] || [4, 14];
  const champLevel = isRemake ? 3 : Math.min(18, Math.max(8, Math.round(mins * 0.56 + (win ? 1 : 0))));
  const kp = isRemake ? 0.5 : Math.min(0.95, Math.max(0.28, (kills + assists) / Math.max(12, kills + assists + 8)));

  const challenges: RiotMatchV5Challenges = {
    kda: Number(((kills + assists) / Math.max(1, deaths)).toFixed(2)),
    killParticipation: Number(kp.toFixed(3)),
    damagePerMinute: Number((dmgToChamps / mins).toFixed(1)),
    goldPerMinute: Number((goldEarned / mins).toFixed(1)),
    teamDamagePercentage: Number((role === 'UTILITY' ? 0.11 : 0.24 * skillFactor).toFixed(3)),
    damageTakenOnTeamPercentage: Number((role === 'TOP' ? 0.28 : 0.18).toFixed(3)),
    visionScorePerMinute: Number((visionScore / mins).toFixed(2)),
    visionScoreAdvantageLaneOpponent: isAram ? 0 : Number(((skillFactor - 0.95) * 0.6).toFixed(2)),
    laneMinionsFirst10Minutes: isAram || role === 'JUNGLE' ? 0 : Math.round(62 * skillFactor),
    maxCSAdvantageOnLaneOpponent: isAram ? 0 : Math.round((skillFactor - 0.95) * 28),
    maxLevelLeadLaneOpponent: win ? 2 : 0,
    laningPhaseGoldAdvantagePerXMinutes: Math.round((skillFactor - 0.98) * 650),
    turretPlatesTaken: isAram ? 0 : Math.floor(rand(18) * (win ? 3.4 : 1.3)),
    turretTakedowns: isRemake ? 0 : Math.floor(rand(19) * (win ? 4.5 : 1.6)),
    soloKills: isAram || isRemake ? 0 : Math.floor(rand(20) * 2.6 * skillFactor),
    skillshotsDodged: Math.round(mins * 1.4 * skillFactor),
    skillshotsHit: Math.round(mins * 2.1 * skillFactor),
    survivedSingleDigitHpCount: rand(21) > 0.72 ? 1 : 0,
    flawlessAces: win && rand(22) > 0.75 ? 1 : 0,
    objectivesStolen: !isRemake && role === 'JUNGLE' && rand(23) > 0.85 ? 1 : 0,
    controlWardsPlaced: isAram || isRemake ? 0 : Math.max(1, Math.floor(mins / 6)),
    controlWardTimeCoverageInRiverOrEnemyHalf: isAram ? 0 : Number((0.18 * skillFactor).toFixed(2)),
    effectiveHealAndShielding: role === 'UTILITY' ? Math.round(mins * 290) : 0,
    saveAllyFromDeath: role === 'UTILITY' ? Math.floor(rand(24) * 3) : 0,
    immobilizeAndKillWithAlly: Math.floor(assists * 0.45),
    scuttleCrabKills: role === 'JUNGLE' && !isRemake ? Math.floor(2 + rand(25) * 3) : 0,
    dragonTakedowns: !isAram && !isRemake && win ? Math.floor(1 + rand(26) * 2.5) : 0,
    baronTakedowns: !isAram && !isRemake && mins > 24 && win ? 1 : 0,
    riftHeraldTakedowns: !isAram && !isRemake && mins > 14 && win ? 1 : 0,
    voidMonsterKills: !isAram && !isRemake ? Math.floor(rand(27) * 4) : 0,
    bountyGold: Math.round(rand(28) * 450),
    takedowns: kills + assists,
    wardTakedowns: isAram ? 0 : Math.floor(mins * 0.25),
    gameLength: durationSec,
  };

  const doubleKills = !isRemake && kills >= 5 && rand(29) > 0.55 ? 1 : 0;
  const tripleKills = !isRemake && kills >= 8 && rand(30) > 0.72 ? 1 : 0;

  return {
    puuid,
    participantId,
    teamId,
    riotIdGameName: gameName,
    riotIdTagline: tagLine,
    riotIdTagLine: tagLine,
    summonerName: gameName,
    profileIcon: profileIconId,
    summonerLevel,
    championId,
    championName,
    champLevel,
    champExperience: champLevel * 1240,
    teamPosition: isAram ? '' : role,
    individualPosition: isAram ? 'Invalid' : role,
    lane: role === 'BOTTOM' || role === 'UTILITY' ? 'BOTTOM' : role,
    role: role === 'UTILITY' ? 'SUPPORT' : role === 'BOTTOM' ? 'CARRY' : 'SOLO',
    win,
    gameEndedInSurrender: isSurrender,
    gameEndedInEarlySurrender: isEarlySurrender,
    teamEarlySurrendered: !win && isEarlySurrender,
    kills,
    deaths,
    assists,
    doubleKills,
    tripleKills,
    quadraKills: 0,
    pentaKills: 0,
    unrealKills: 0,
    killingSprees: kills >= 3 ? Math.floor(kills / 3) : 0,
    largestKillingSpree: kills >= 3 ? Math.min(kills, 5) : kills,
    largestMultiKill: tripleKills > 0 ? 3 : doubleKills > 0 ? 2 : kills > 0 ? 1 : 0,
    firstBloodKill: participantId === 2 && !isRemake,
    firstBloodAssist: participantId === 3 && !isRemake,
    firstTowerKill: win && participantId === 4 && !isRemake,
    firstTowerAssist: win && participantId === 5 && !isRemake,
    longestTimeSpentLiving: Math.round(durationSec * (win ? 0.52 : 0.34)),
    totalTimeSpentDead: Math.round(deaths * (12 + mins * 0.9)),
    largestCriticalStrike: role === 'BOTTOM' ? Math.round(620 + rand(31) * 340) : 0,
    totalDamageDealt: dmgToChamps * 4 + totalMinionsKilled * 450,
    physicalDamageDealt: Math.round(dmgToChamps * 2.2),
    magicDamageDealt: Math.round(dmgToChamps * 1.9),
    trueDamageDealt: Math.round(dmgToChamps * 0.35),
    totalDamageDealtToChampions: dmgToChamps,
    physicalDamageDealtToChampions: Math.round(dmgToChamps * (role === 'MIDDLE' ? 0.25 : 0.72)),
    magicDamageDealtToChampions: Math.round(dmgToChamps * (role === 'MIDDLE' ? 0.68 : 0.2)),
    trueDamageDealtToChampions: Math.round(dmgToChamps * 0.08),
    totalDamageTaken: dmgTaken,
    physicalDamageTaken: Math.round(dmgTaken * 0.56),
    magicDamageTaken: Math.round(dmgTaken * 0.38),
    trueDamageTaken: Math.round(dmgTaken * 0.06),
    damageSelfMitigated: Math.round(dmgTaken * (role === 'TOP' || role === 'UTILITY' ? 0.95 : 0.42)),
    damageDealtToBuildings: dmgTurrets,
    damageDealtToObjectives: dmgObjectives,
    damageDealtToTurrets: dmgTurrets,
    totalHeal: Math.round(mins * 180),
    totalHealsOnTeammates: role === 'UTILITY' ? Math.round(mins * 120) : 0,
    totalUnitsHealed: role === 'UTILITY' ? 4 : 1,
    totalDamageShieldedOnTeammates: role === 'UTILITY' ? Math.round(mins * 165) : 0,
    timeCCingOthers: Math.round(mins * (role === 'UTILITY' ? 1.8 : 0.85)),
    totalTimeCCDealt: Math.round(mins * 8.5),
    goldEarned,
    goldSpent: Math.max(0, goldEarned - Math.round(rand(32) * 750)),
    totalMinionsKilled,
    neutralMinionsKilled,
    totalAllyJungleMinionsKilled: Math.round(neutralMinionsKilled * 0.78),
    totalEnemyJungleMinionsKilled: Math.round(neutralMinionsKilled * 0.22),
    consumablesPurchased: isAram ? 1 : Math.max(1, Math.floor(mins / 7)),
    itemsPurchased: isRemake ? 3 : 12 + Math.floor(rand(33) * 6),
    sightWardsBoughtInGame: 0,
    visionWardsBoughtInGame: isAram || isRemake ? 0 : Math.max(1, Math.floor(mins / 6)),
    bountyLevel: kills > deaths + 2 ? 2 : 0,
    visionScore,
    wardsPlaced: isAram || isRemake ? 0 : Math.max(3, Math.floor(mins * 0.45)),
    wardsKilled: isAram || isRemake ? 0 : Math.floor(mins * 0.2),
    detectorWardsPlaced: isAram || isRemake ? 0 : Math.max(1, Math.floor(mins / 7)),
    baronKills: !isAram && !isRemake && mins > 24 && win && role === 'JUNGLE' ? 1 : 0,
    dragonKills: !isAram && !isRemake && win && role === 'JUNGLE' ? 2 : 0,
    inhibitorKills: win && !isRemake ? (rand(34) > 0.7 ? 1 : 0) : 0,
    inhibitorTakedowns: win && !isRemake ? 1 : 0,
    inhibitorsLost: win || isRemake ? 0 : 1,
    nexusKills: win && !isSurrender && !isRemake && participantId === 1 ? 1 : 0,
    nexusTakedowns: win && !isSurrender && !isRemake ? 1 : 0,
    nexusLost: win || isSurrender || isRemake ? 0 : 1,
    objectivesStolen: challenges.objectivesStolen || 0,
    objectivesStolenAssists: 0,
    turretKills: win && !isRemake ? Math.floor(rand(35) * 2.2) : 0,
    turretTakedowns: challenges.turretTakedowns || 0,
    turretsLost: win || isRemake ? 2 : 7,
    summoner1Id: spells[0],
    summoner2Id: spells[1],
    summoner1Casts: Math.max(1, Math.floor(mins / 4)),
    summoner2Casts: Math.max(1, Math.floor(mins / 3)),
    spell1Casts: Math.round(mins * 6.5),
    spell2Casts: Math.round(mins * 3.8),
    spell3Casts: Math.round(mins * 3.2),
    spell4Casts: Math.max(1, Math.round(mins * 0.9)),
    item0: isRemake ? 1056 : items[0],
    item1: isRemake ? 2003 : items[1],
    item2: isRemake ? 0 : items[2],
    item3: isRemake || mins < 18 ? 0 : items[3],
    item4: isRemake || mins < 24 ? 0 : items[4],
    item5: isRemake || mins < 29 ? 0 : items[5],
    item6: items[6],
    perks: buildPerks(isAram ? 'MIDDLE' : role, seed),
    allInPings: Math.floor(rand(40) * 5),
    assistMePings: Math.floor(rand(41) * 9),
    basicPings: Math.floor(rand(42) * 3),
    commandPings: Math.floor(rand(43) * 4),
    dangerPings: Math.floor(rand(44) * 6),
    enemyMissingPings: Math.floor(rand(45) * 14),
    enemyVisionPings: isAram ? 0 : Math.floor(rand(46) * 5),
    getBackPings: Math.floor(rand(47) * 6),
    holdPings: Math.floor(rand(48) * 2),
    needVisionPings: isAram ? 0 : Math.floor(rand(49) * 3),
    onMyWayPings: Math.floor(rand(50) * 12),
    pushPings: Math.floor(rand(51) * 4),
    retreatPings: Math.floor(rand(52) * 4),
    visionClearedPings: isAram ? 0 : Math.floor(rand(53) * 3),
    eligibleForProgression: !isRemake,
    challenges,
  };
}

export interface DemoLolMember {
  id: string;
  displayName: string;
  avatarUrl: string;
}

export function buildDemoLolDataset(groupMembers: PlayerProfile[]): {
  members: DemoLolMember[];
  accounts: LolAccount[];
  matches: LolMatchSummary[];
} {
  const usableMembers: DemoLolMember[] = groupMembers.slice(0, 5).map((m) => ({
    id: m.id,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
  }));

  while (usableMembers.length < DEMO_TEMPLATES.length) {
    const tpl = DEMO_TEMPLATES[usableMembers.length];
    usableMembers.push({
      id: `demo-member-${usableMembers.length + 1}`,
      displayName: tpl.gameName,
      avatarUrl: `https://ddragon.leagueoflegends.com/cdn/${DEFAULT_DDRAGON_VERSION}/img/profileicon/${tpl.profileIconId}.png`,
    });
  }

  const nowIso = new Date().toISOString();

  const accounts: LolAccount[] = usableMembers.map((member, idx) => {
    const tpl = DEMO_TEMPLATES[idx % DEMO_TEMPLATES.length];
    const cleanName = member.displayName.replace(/\s+/g, '');
    return {
      userId: member.id,
      puuid: `${tpl.puuid}-${member.id}`,
      gameName: cleanName || tpl.gameName,
      tagLine: tpl.tagLine,
      platform: 'la2',
      regionalCluster: 'americas',
      summonerLevel: tpl.summonerLevel,
      profileIconId: tpl.profileIconId,
      rankedSolo: {
        queueType: 'RANKED_SOLO_5x5',
        tier: tpl.tierSolo,
        rank: tpl.rankSolo,
        leaguePoints: tpl.lpSolo,
        wins: 48 - idx * 4,
        losses: 39 + idx * 2,
        hotStreak: idx === 0,
      },
      rankedFlex: {
        queueType: 'RANKED_FLEX_SR',
        tier: tpl.tierFlex,
        rank: tpl.rankFlex,
        leaguePoints: tpl.lpFlex,
        wins: 31 - idx * 2,
        losses: 19 + idx * 2,
      },
      ddragonVersion: DEFAULT_DDRAGON_VERSION,
      lastSyncedAt: nowIso,
    };
  });

  if (accounts.length === 0) {
    return { members: [], accounts: [], matches: [] };
  }

  const baseRoles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
  const nowMs = Date.now();

  const matches: LolMatchSummary[] = SCENARIO_SPECS.map((spec, mIdx) => {
    const isAram = spec.gameMode === 'ARAM';
    const gameCreation = nowMs - spec.hoursAgo * 3600 * 1000;
    const gameStartTimestamp = gameCreation + 45_000;
    const gameEndTimestamp = gameStartTimestamp + spec.durationSec * 1000;
    const matchId = `LA2_DEMO_${spec.idSuffix}`;

    const assignedRoles = new Map<string, number>(); // role -> accountIdx
    const validGroupIndices = spec.groupIndices.filter((i) => i < accounts.length);
    if (validGroupIndices.length === 0) validGroupIndices.push(0);

    // Assign each included group member to a distinct slot on team 100
    validGroupIndices.forEach((accIdx, slotPos) => {
      const tpl = DEMO_TEMPLATES[accIdx % DEMO_TEMPLATES.length];
      const preferred = tpl.preferredRoles.find((r) => !assignedRoles.has(r));
      const fallback = baseRoles.find((r) => !assignedRoles.has(r)) || baseRoles[slotPos % 5];
      assignedRoles.set(preferred || fallback, accIdx);
    });

    const participants: RiotMatchV5Participant[] = [];

    // Team 100 (Allies)
    baseRoles.forEach((role, idx) => {
      const accIdx = assignedRoles.get(role);
      const seed = (mIdx + 1) * 100 + idx * 17;
      if (accIdx !== undefined) {
        const account = accounts[accIdx];
        const tpl = DEMO_TEMPLATES[accIdx % DEMO_TEMPLATES.length];
        const champ = tpl.champions[(mIdx + idx) % tpl.champions.length];
        participants.push(
          buildDemoParticipant({
            participantId: idx + 1,
            teamId: 100,
            puuid: account.puuid,
            gameName: account.gameName,
            tagLine: account.tagLine,
            championId: champ.championId,
            championName: champ.championName,
            role,
            win: spec.team100Win,
            isSurrender: spec.isSurrender,
            isEarlySurrender: spec.isEarlySurrender,
            durationSec: spec.durationSec,
            isAram,
            skillFactor: tpl.skillFactor,
            seed,
            profileIconId: account.profileIconId,
            summonerLevel: account.summonerLevel,
          })
        );
      } else {
        const filler = ENEMY_POOL[(idx + 5 + mIdx) % ENEMY_POOL.length];
        participants.push(
          buildDemoParticipant({
            participantId: idx + 1,
            teamId: 100,
            puuid: `demo-ally-${spec.idSuffix}-${idx}`,
            gameName: `${filler.name}${mIdx}`,
            tagLine: filler.tag,
            championId: filler.championId,
            championName: filler.championName,
            role,
            win: spec.team100Win,
            isSurrender: spec.isSurrender,
            isEarlySurrender: spec.isEarlySurrender,
            durationSec: spec.durationSec,
            isAram,
            skillFactor: 0.98,
            seed,
            profileIconId: 29 + idx,
            summonerLevel: 140 + idx * 12,
          })
        );
      }
    });

    // Team 200 (Enemies)
    baseRoles.forEach((role, idx) => {
      const enemy = ENEMY_POOL[(idx + mIdx) % ENEMY_POOL.length];
      const seed = (mIdx + 1) * 100 + (idx + 5) * 19;
      participants.push(
        buildDemoParticipant({
          participantId: idx + 6,
          teamId: 200,
          puuid: `demo-enemy-${spec.idSuffix}-${idx}`,
          gameName: enemy.name,
          tagLine: enemy.tag,
          championId: enemy.championId,
          championName: enemy.championName,
          role,
          win: !spec.team100Win,
          isSurrender: spec.isSurrender,
          isEarlySurrender: spec.isEarlySurrender,
          durationSec: spec.durationSec,
          isAram,
          skillFactor: 1.0,
          seed,
          profileIconId: 500 + idx,
          summonerLevel: 160 + idx * 18,
        })
      );
    });

    const team100Kills = participants
      .filter((p) => p.teamId === 100)
      .reduce((sum, p) => sum + p.kills, 0);
    const team200Kills = participants
      .filter((p) => p.teamId === 200)
      .reduce((sum, p) => sum + p.kills, 0);

    const isRemake = spec.isEarlySurrender || spec.durationSec < 240;

    const rawMatch: RiotMatchV5 = {
      metadata: {
        dataVersion: '2',
        matchId,
        participants: participants.map((p) => p.puuid),
      },
      info: {
        endOfGameResult: 'GameComplete',
        gameCreation,
        gameDuration: spec.durationSec,
        gameEndTimestamp,
        gameId: 1580000000 + mIdx,
        gameMode: spec.gameMode,
        gameType: 'MATCHED_GAME',
        gameVersion: '15.22.641.2089',
        mapId: isAram ? 12 : 11,
        platformId: 'LA2',
        queueId: spec.queueId,
        gameStartTimestamp,
        participants,
        teams: [
          {
            teamId: 100,
            win: spec.team100Win,
            bans: isAram
              ? []
              : [
                  { championId: 238, pickTurn: 1 },
                  { championId: 157, pickTurn: 2 },
                  { championId: 777, pickTurn: 3 },
                  { championId: 84, pickTurn: 4 },
                  { championId: 555, pickTurn: 5 },
                ],
            objectives: {
              baron: {
                first: spec.team100Win && spec.durationSec > 1500,
                kills: !isAram && !isRemake && spec.durationSec > 1500 && spec.team100Win ? 1 : 0,
              },
              champion: { first: !isRemake, kills: team100Kills },
              dragon: {
                first: !isAram && !isRemake && spec.team100Win,
                kills: !isAram && !isRemake ? (spec.team100Win ? 3 : 1) : 0,
              },
              horde: {
                first: !isAram && !isRemake && spec.team100Win,
                kills: !isAram && !isRemake ? (spec.team100Win ? 4 : 2) : 0,
              },
              inhibitor: {
                first: !isRemake && spec.team100Win && !spec.isSurrender,
                kills: !isRemake && spec.team100Win && !spec.isSurrender ? 2 : 0,
              },
              riftHerald: {
                first: !isAram && !isRemake && spec.team100Win,
                kills: !isAram && !isRemake && spec.team100Win ? 1 : 0,
              },
              tower: {
                first: !isRemake && spec.team100Win,
                kills: !isRemake ? (spec.team100Win ? (spec.isSurrender ? 4 : 9) : 2) : 0,
              },
              atakhan: {
                first: !isAram && !isRemake && spec.durationSec > 1300 && spec.team100Win,
                kills: !isAram && !isRemake && spec.durationSec > 1300 && spec.team100Win ? 1 : 0,
              },
            },
          },
          {
            teamId: 200,
            win: !spec.team100Win,
            bans: isAram
              ? []
              : [
                  { championId: 103, pickTurn: 6 },
                  { championId: 222, pickTurn: 7 },
                  { championId: 64, pickTurn: 8 },
                  { championId: 412, pickTurn: 9 },
                  { championId: 266, pickTurn: 10 },
                ],
            objectives: {
              baron: {
                first: !spec.team100Win && spec.durationSec > 1500,
                kills: !isAram && !isRemake && spec.durationSec > 1500 && !spec.team100Win ? 1 : 0,
              },
              champion: { first: false, kills: team200Kills },
              dragon: {
                first: !isAram && !isRemake && !spec.team100Win,
                kills: !isAram && !isRemake ? (!spec.team100Win ? 3 : 1) : 0,
              },
              horde: {
                first: !isAram && !isRemake && !spec.team100Win,
                kills: !isAram && !isRemake ? (!spec.team100Win ? 4 : 2) : 0,
              },
              inhibitor: {
                first: !isRemake && !spec.team100Win && !spec.isSurrender,
                kills: !isRemake && !spec.team100Win && !spec.isSurrender ? 2 : 0,
              },
              riftHerald: {
                first: !isAram && !isRemake && !spec.team100Win,
                kills: !isAram && !isRemake && !spec.team100Win ? 1 : 0,
              },
              tower: {
                first: !isRemake && !spec.team100Win,
                kills: !isRemake ? (!spec.team100Win ? (spec.isSurrender ? 4 : 8) : 2) : 0,
              },
              atakhan: {
                first: !isAram && !isRemake && spec.durationSec > 1300 && !spec.team100Win,
                kills: !isAram && !isRemake && spec.durationSec > 1300 && !spec.team100Win ? 1 : 0,
              },
            },
          },
        ],
      },
    };

    return buildMatchSummaryFromRiotMatch(rawMatch, true);
  });

  return { members: usableMembers, accounts, matches };
}
