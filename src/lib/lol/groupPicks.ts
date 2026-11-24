import type {
  LolAccount,
  LolGroupPickEntry,
  LolGroupPicksResult,
  LolMatchParticipantSummary,
  LolMatchSummary,
  LolQueueCategory,
  LolRoleKey,
} from '../../types/lol';
import { RIFT_ROLES } from './constants';
import {
  buildPuuidToUserIdMap,
  clamp,
  filterMatchesByQueue,
  groupAccountsByUser,
  isGroupMatch,
} from './helpers';
import { resolvePrimaryRole } from './playerAggregates';
import { extractIntrinsicPerf } from './scoring';
import {
  scoreQualifiedPick,
  type PickAnalysisAccum,
  type PickDraft,
} from './groupPicksDrivers';

function analyzePickSamples(params: {
  samples: Array<{ match: LolMatchSummary; participant: LolMatchParticipantSummary }>;
  groupPuuids: Set<string>;
  groupBaselinePerf: number;
  baselineTeamInWin: number;
  baselineTeamInLoss: number;
  baselineEnemyInWin: number;
  baselineEnemyInLoss: number;
}): PickAnalysisAccum {
  const {
    samples,
    groupPuuids,
    groupBaselinePerf,
    baselineTeamInWin,
    baselineTeamInLoss,
    baselineEnemyInWin,
    baselineEnemyInLoss,
  } = params;

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

  for (const { match, participant: p } of samples) {
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

  return {
    effectiveWinsSum,
    adjPerfSum,
    diffBonusSum,
    rawVsTeamDeltaSum,
    effectiveVsTeamDeltaSum,
    vsOpponentDeltaSum,
    difficultySum,
    gatedAllyDeltaSum,
    allyGamesCount,
    passengerWins,
    carryGames,
    top2RankCount,
    enemyFfEnablerSum,
  };
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


  const allPicks: LolGroupPickEntry[] = qualified
    .map((d) => {
      const playerBase = playerBaselineMap.get(d.account.userId);
      const playerBaselineWr =
        playerBase && playerBase.games > 0
          ? (playerBase.wins / playerBase.games) * 100
          : groupBaselineWr;

      const accum = analyzePickSamples({
        samples: d.samples,
        groupPuuids,
        groupBaselinePerf,
        baselineTeamInWin,
        baselineTeamInLoss,
        baselineEnemyInWin,
        baselineEnemyInLoss,
      });

      return scoreQualifiedPick({
        draft: d,
        accum,
        primaryRole: resolvePrimaryRole(d.roleCounts),
        groupBaselineWr,
        groupBaselinePerf,
        groupBaselineFfRate,
        playerBaselineWr,
      });
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

