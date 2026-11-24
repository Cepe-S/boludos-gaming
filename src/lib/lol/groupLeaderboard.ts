import type {
  LolAccount,
  LolGroupAggregateStats,
  LolGroupLeaderboardEntry,
  LolMatchOutcome,
  LolMatchSummary,
  LolPlayerAggregateStats,
  LolQueueCategory,
  LolRoleLeaderboardByLane,
  LolRoleLeaderboardEntry,
} from '../../types/lol';
import { RIFT_ROLE_KEYS } from './constants';
import {
  buildPuuidToUserIdMap,
  clamp,
  computeDurationBuckets,
  countGroupMembersInMatch,
  filterMatchesByQueue,
  groupAccountsByUser,
  isGroupMatch,
  resolveGroupMatchOutcome,
  round1,
  round2,
} from './helpers';
import {
  buildTopChampions,
  computeCoreParticipantAverages,
  computePlayerAggregates,
  type PlayerMatchSample,
} from './playerAggregates';

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
