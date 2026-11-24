// ==============================================================================
// BOLUDOS GAMING — LEAGUE OF LEGENDS PERFORMANCE ENGINE (BG-PERF v2)
// ==============================================================================
// Barrel re-exporting the modular LoL performance engine under `src/lib/lol/`.
// ==============================================================================

export {
  DEFAULT_LOL_QUEUE_FILTERS,
  DEFAULT_LOL_TIME_RANGE,
  RIFT_ROLE_KEYS,
  ROLE_WEIGHT_MATRIX,
  TIME_RANGE_DAYS,
  LOL_MACRO_DURATION_RANGES,
} from './lol/constants';

export {
  getRegionalClusterForPlatform,
  getQueueCategory,
  filterMatchesGlobally,
  resolveParticipantRole,
  classifyMatchOutcome,
  getGradeFromScore,
  computeDurationBuckets,
  type LolUserAccountGroup,
  normalizePuuidSet,
  buildPuuidToUserIdMap,
  groupAccountsByUser,
  getUserAccounts,
  resolveUserPrimaryAccount,
  getUserPuuids,
  countGroupMembersInMatch,
  isGroupMatch,
  type LolGroupMatchOutcomeResolution,
  resolveGroupMatchOutcome,
} from './lol/helpers';

export {
  scoreMatchParticipants,
  buildMatchSummaryFromRiotMatch,
} from './lol/scoring';

export {
  computePlayerAggregates,
  computePlayerChampionDetail,
} from './lol/playerAggregates';

export {
  computeGroupLeaderboard,
  computeGroupLeaderboardByRole,
  computeGroupAggregateStats,
} from './lol/groupLeaderboard';

export {
  computeGroupRecords,
  computePersonalRecords,
} from './lol/records';

export { computeGroupPicks } from './lol/groupPicks';

export {
  resolveMacroDurationRange,
  allocateLargestRemainder,
  computeMacroDurationRangeStats,
  buildOutcomeCurveModel,
  estimateOutcomeAtMinute,
  computeOutcomeMinuteCurve,
  computeOutcomeChartDomain,
} from './lol/outcomeCurves';
