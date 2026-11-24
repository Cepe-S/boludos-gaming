import type {
  LolDurationBucketKey,
  LolMacroDurationRangeDef,
  LolPerformancePillarScores,
  LolPlatform,
  LolRegionalCluster,
  LolRiftRoleKey,
  LolRoleKey,
  LolSpecificQueueCategory,
  LolTimeRangeFilter,
} from '../../types/lol';

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


export const PLATFORM_TO_CLUSTER: Record<LolPlatform, LolRegionalCluster> = {
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

export const RIFT_ROLES = new Set<LolRoleKey>(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

export const TIME_RANGE_DAYS: Record<Exclude<LolTimeRangeFilter, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};


export const DURATION_BUCKET_DEFINITIONS: Array<{
  key: LolDurationBucketKey;
  label: string;
  matches: (durationSeconds: number) => boolean;
}> = [
  { key: '0-5', label: '0-5 min', matches: (s) => s <= 300 },
  { key: '0-20', label: '0-20 min', matches: (s) => s <= 1200 },
  { key: '20-30', label: '20-30 min', matches: (s) => s > 1200 && s <= 1800 },
  { key: '30+', label: '30+ min', matches: (s) => s > 1800 },
];

export const LOL_MACRO_DURATION_RANGES: LolMacroDurationRangeDef[] = [
  { key: '0-10', label: '0–10 min', startSec: 0, endSec: 600 },
  { key: '10-20', label: '10–20 min', startSec: 600, endSec: 1200 },
  { key: '20-30', label: '20–30 min', startSec: 1200, endSec: 1800 },
  { key: '30-40', label: '30–40 min', startSec: 1800, endSec: 2400 },
  { key: '40+', label: '40+ min', startSec: 2400, endSec: null },
];


export const CURVE_MIN_BANDWIDTH_MIN = 2.5;
export const CURVE_MAX_BANDWIDTH_MIN = 6;
export const CURVE_MAX_LOCAL_BANDWIDTH_MIN = 9;
export const CURVE_FALLBACK_SPREAD_MIN = 6;
export const CURVE_PRIOR_STRENGTH = 2;
export const CURVE_DOMAIN_PAD_MIN = 2;
export const CURVE_DOMAIN_MIN_SPAN_MIN = 8;
export const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);
