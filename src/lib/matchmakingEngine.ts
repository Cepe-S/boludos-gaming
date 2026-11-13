import {
  Game,
  GameRating,
  GameSynchronyResult,
  LobbyCompatibilityStatus,
  ParticipantScheduleTimeline,
  PlayerGameBreakdown,
  PlayerProfile,
  PrecisionMinutes,
  ScheduleOverlapSummary,
  SessionParticipant,
  SubLobbyAssignment,
  UserGamePreference,
} from '../types/domain';

/**
 * Parses "HH:mm" formatted time string into minutes from 00:00.
 * Handles evening/midnight crossovers: if isEnd is true and endMins <= startMins,
 * adds 1440 (24h) so the range remains strictly forward-moving.
 */
export function parseTimeMinutes(timeStr: string, isEnd = false, startMins?: number): number {
  if (!timeStr || !timeStr.includes(':')) {
    return 0;
  }
  const [hStr, mStr] = timeStr.split(':');
  const hours = parseInt(hStr, 10) || 0;
  const minutes = parseInt(mStr, 10) || 0;
  let total = hours * 60 + minutes;

  if (isEnd && startMins !== undefined && total <= startMins) {
    total += 1440; // 24 hours crossover
  }
  return total;
}

/**
 * Formats minute count back to a clean 24h "HH:mm" string.
 * Normalizes values >= 1440 or negative minutes via modulo 1440.
 */
export function formatMinutesToTime(totalMins: number): string {
  const normalized = ((totalMins % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Calculates synchrony metrics for all games given the current session participants,
 * their 1-5 star ratings, and player limits.
 *
 * Synchrony Algorithm:
 * - Base score: Math.round(averageRating * 20)
 * - Penalty: -15 points per participant who rated 1-star (clamped to min 0)
 * - Bonus: +5 points if all participants rated >= 4
 * - Roulette Weight: Math.max(1, synchronyScore ** 2)
 */
export function calculateGameSynchrony(
  games: Game[],
  preferences: UserGamePreference[],
  participants: SessionParticipant[],
  players: PlayerProfile[],
  allowSplitLobbies = false
): GameSynchronyResult[] {
  const participantIds = new Set(participants.map((p) => p.userId));
  const playerMap = new Map<string, PlayerProfile>(players.map((p) => [p.id, p]));

  // Index user preferences: `userId_gameId` -> preference
  const prefMap = new Map<string, UserGamePreference>();
  for (const pref of preferences) {
    prefMap.set(`${pref.userId}_${pref.gameId}`, pref);
  }

  const results: GameSynchronyResult[] = [];

  for (const game of games) {
    const breakdowns: PlayerGameBreakdown[] = [];
    let playsCount = 0;
    let ratingSum = 0;
    let dislikeCount = 0;
    let lovedCount = 0;

    for (const participant of participants) {
      const player = playerMap.get(participant.userId);
      const pref = prefMap.get(`${participant.userId}_${game.id}`);

      const plays = pref ? pref.plays : false;
      const rating = (pref ? pref.rating : 1) as GameRating;

      if (plays) {
        playsCount++;
        ratingSum += rating;
      }
      if (rating === 1) {
        dislikeCount++;
      }
      if (rating >= 4) {
        lovedCount++;
      }

      breakdowns.push({
        userId: participant.userId,
        displayName: player?.displayName || 'Desconocido',
        avatarUrl: player?.avatarUrl || '',
        plays,
        rating,
        karmaScore: player?.karmaScore ?? 50,
      });
    }

    const totalParticipants = participants.length;
    const allPlay = totalParticipants > 0 && playsCount === totalParticipants;

    // Lobby status determination
    let status: LobbyCompatibilityStatus;
    if (totalParticipants === 0) {
      status = 'needs_more_players';
    } else if (!allPlay) {
      status = 'missing_owners';
    } else if (totalParticipants < game.minPlayers) {
      status = 'needs_more_players';
    } else if (totalParticipants > game.maxPlayers) {
      status = 'split_required';
    } else {
      status = 'perfect_fit';
    }

    // Average rating and synchrony score calculation
    let averageRating = 1.0;
    let synchronyScore = 0;

    if (playsCount > 0) {
      averageRating = Number((ratingSum / playsCount).toFixed(2));
      let rawScore = Math.round(averageRating * 20);

      // -15 penalty per 1-star rating
      rawScore -= dislikeCount * 15;

      // +5 bonus if all participants rated >= 4
      if (lovedCount === totalParticipants && totalParticipants > 0) {
        rawScore += 5;
      }

      synchronyScore = Math.min(100, Math.max(0, rawScore));
    }

    // Weight for weighted random roulette: quadratic curve so high synchrony has high odds
    const rouletteWeight = Math.max(1, synchronyScore ** 2);

    // Suggested sub-lobbies calculation when over player capacity
    let suggestedSubLobbies: SubLobbyAssignment[] | undefined;

    if (totalParticipants > 0) {
      const sortedProfiles = sortPlayersByLobbyPriority(participants, players);

      if (status === 'split_required') {
        const half = Math.floor(totalParticipants / 2);
        // If splitting evenly into 2 lobbies satisfies minPlayers and maxPlayers for both
        if (
          allowSplitLobbies &&
          half >= game.minPlayers &&
          Math.ceil(totalParticipants / 2) <= game.maxPlayers
        ) {
          const splitPoint = Math.ceil(totalParticipants / 2);
          suggestedSubLobbies = [
            {
              lobbyName: 'Lobby Alfa (Titulares 1)',
              players: sortedProfiles.slice(0, splitPoint),
              isWaitlist: false,
            },
            {
              lobbyName: 'Lobby Bravo (Titulares 2)',
              players: sortedProfiles.slice(splitPoint),
              isWaitlist: false,
            },
          ];
        } else {
          // Standard main lobby + waitlist
          suggestedSubLobbies = [
            {
              lobbyName: `Lobby Principal (Titulares - Cupo ${game.maxPlayers})`,
              players: sortedProfiles.slice(0, game.maxPlayers),
              isWaitlist: false,
            },
            {
              lobbyName: `Sub-Lobby / Suplentes por Humo (${totalParticipants - game.maxPlayers})`,
              players: sortedProfiles.slice(game.maxPlayers),
              isWaitlist: true,
            },
          ];
        }
      } else if (status === 'perfect_fit') {
        suggestedSubLobbies = [
          {
            lobbyName: 'Lobby Principal (Titulares)',
            players: sortedProfiles,
            isWaitlist: false,
          },
        ];
      }
    }

    results.push({
      game,
      status,
      synchronyScore,
      averageRating,
      rouletteWeight,
      playersWhoPlayCount: playsCount,
      totalParticipants,
      dislikeCount,
      lovedCount,
      playerBreakdowns: breakdowns,
      suggestedSubLobbies,
    });
  }

  // Sort results: perfect_fit first, then highest synchronyScore
  return results.sort((a, b) => {
    if (a.status === 'perfect_fit' && b.status !== 'perfect_fit') return -1;
    if (b.status === 'perfect_fit' && a.status !== 'perfect_fit') return 1;
    return b.synchronyScore - a.synchronyScore;
  });
}

/**
 * Selects a winning game using weighted random selection based on rouletteWeight.
 * Only games that fit the lobby (or split if allowed) enter the roulette.
 */
export function spinWeightedRoulette(
  compatibleResults: GameSynchronyResult[],
  randomFn: () => number = Math.random
): Game | null {
  if (!compatibleResults || compatibleResults.length === 0) {
    return null;
  }

  const eligible = compatibleResults.filter(
    (res) => res.status === 'perfect_fit' || res.status === 'split_required'
  );

  if (eligible.length === 0) {
    return null;
  }

  const totalWeight = eligible.reduce((acc, curr) => acc + curr.rouletteWeight, 0);
  if (totalWeight <= 0) {
    return eligible[0].game;
  }

  const randomValue = randomFn() * totalWeight;
  let runningSum = 0;

  for (const item of eligible) {
    runningSum += item.rouletteWeight;
    if (randomValue <= runningSum) {
      return item.game;
    }
  }

  return eligible[eligible.length - 1].game;
}

/**
 * Calculates schedule timelines and group overlap for a gaming session.
 * Computes exact earliestStart and strictDeadline for each participant,
 * plus group probable & guaranteed windows.
 */
export function calculateScheduleOverlap(
  participants: SessionParticipant[],
  players: PlayerProfile[]
): ScheduleOverlapSummary {
  if (!participants || participants.length === 0) {
    return {
      probableStartFormatted: '--:--',
      guaranteedStartFormatted: '--:--',
      guaranteedEndFormatted: '--:--',
      probableEndFormatted: '--:--',
      overlapDurationMinutes: 0,
      guaranteedOverlapMinutes: 0,
      hasValidOverlap: false,
      participantTimelines: [],
    };
  }

  const playerMap = new Map<string, PlayerProfile>(players.map((p) => [p.id, p]));

  const participantTimelines: ParticipantScheduleTimeline[] = participants.map((p) => {
    const player = playerMap.get(p.userId);
    const startMins = parseTimeMinutes(p.availableFrom);
    const endMins = parseTimeMinutes(p.availableUntil, true, startMins);
    const earliestStartMinutes = startMins - p.precisionMinutes;
    const strictDeadlineMinutes = startMins + p.precisionMinutes;

    return {
      userId: p.userId,
      displayName: player?.displayName || 'Jugador',
      avatarUrl: player?.avatarUrl || '',
      karmaScore: player?.karmaScore ?? 50,
      availableFrom: p.availableFrom,
      availableUntil: p.availableUntil,
      precisionMinutes: p.precisionMinutes,
      startMinutesFromBase: startMins,
      endMinutesFromBase: endMins,
      earliestStartMinutes,
      strictDeadlineMinutes,
      earliestStartFormatted: formatMinutesToTime(earliestStartMinutes),
      strictDeadlineFormatted: formatMinutesToTime(strictDeadlineMinutes),
      attendanceStatus: p.attendanceStatus,
      checkedInAt: p.checkedInAt,
    };
  });

  // Group Probable Start: max of nominal availableFrom
  const probableStart = Math.max(...participantTimelines.map((t) => t.startMinutesFromBase));

  // Group Guaranteed Start: max of strict deadlines (everyone is guaranteed present)
  const guaranteedStart = Math.max(...participantTimelines.map((t) => t.strictDeadlineMinutes));

  // Group Probable End: min of nominal availableUntil
  const probableEnd = Math.min(...participantTimelines.map((t) => t.endMinutesFromBase));

  // Group Guaranteed End: min of (availableUntil - precision)
  const guaranteedEnd = Math.min(
    ...participantTimelines.map((t) => t.endMinutesFromBase - t.precisionMinutes)
  );

  const overlapDurationMinutes = Math.max(0, probableEnd - probableStart);
  const guaranteedOverlapMinutes = Math.max(0, guaranteedEnd - guaranteedStart);
  const hasValidOverlap = overlapDurationMinutes >= 30;

  return {
    probableStartFormatted: formatMinutesToTime(probableStart),
    guaranteedStartFormatted: formatMinutesToTime(guaranteedStart),
    guaranteedEndFormatted: formatMinutesToTime(guaranteedEnd),
    probableEndFormatted: formatMinutesToTime(probableEnd),
    overlapDurationMinutes,
    guaranteedOverlapMinutes,
    hasValidOverlap,
    participantTimelines,
  };
}

/**
 * Evaluates whether a player's check-in was on-time or late relative to their
 * declared start time and precision margin (±5, ±15, ±30, ±60 min).
 */
export function evaluateCheckInStatus(
  promisedTime: string,
  precisionMinutes: PrecisionMinutes,
  actualCheckInTime: string
): { status: 'on_time' | 'late'; minutesDiff: number; karmaDelta: number } {
  const promisedMins = parseTimeMinutes(promisedTime);
  const deadlineMins = promisedMins + precisionMinutes;
  let actualMins = parseTimeMinutes(actualCheckInTime);

  // If check-in happened after midnight while promised was late evening
  if (actualMins < promisedMins - 180) {
    actualMins += 1440;
  }

  if (actualMins <= deadlineMins) {
    const diff = Math.max(0, actualMins - promisedMins);
    return {
      status: 'on_time',
      minutesDiff: diff,
      karmaDelta: 5, // Reward for punctuality
    };
  } else {
    const diff = actualMins - deadlineMins;
    return {
      status: 'late',
      minutesDiff: diff,
      karmaDelta: -10, // Sanction for being past deadline
    };
  }
}

/**
 * Computes the official dynamic Argentine gamer title / badge based on
 * Karma Score (0..100) and punctuality history.
 */
export function calculateTitleForPlayer(
  karmaScore: number,
  onTimeCount: number,
  lateCount: number,
  noShowCount: number
): string {
  if (karmaScore < 30 || noShowCount >= 4) {
    return '👻 Fantasma Supremo (Sin Prioridad de Cupo)';
  }
  if (karmaScore < 50 || noShowCount >= 2) {
    return '💨 Humero Oficial';
  }
  if (karmaScore >= 50 && lateCount >= 3 && karmaScore < 75) {
    return '🐢 Rey del ±15m Mentiroso';
  }
  if (karmaScore >= 90 && onTimeCount >= 5) {
    return '⌚ Reloj Suizo';
  }
  if (karmaScore >= 75) {
    return '🫡 Soldado Fiel';
  }
  return '🎮 Jugador Promedio';
}

/**
 * Sorts session participants to assign slots in sub-lobbies (Titulares vs Suplentes).
 * Priority:
 * 1. Attendance: 'on_time' first, then 'pending', then 'late', then 'no_show'
 * 2. Higher karmaScore (reliability)
 * 3. Earlier joinedAt timestamp
 */
export function sortPlayersByLobbyPriority(
  participants: SessionParticipant[],
  players: PlayerProfile[]
): PlayerProfile[] {
  const playerMap = new Map<string, PlayerProfile>(players.map((p) => [p.id, p]));

  const statusWeight: Record<string, number> = {
    on_time: 4,
    pending: 3,
    late: 2,
    no_show: 1,
  };

  const participantDataMap = new Map<string, SessionParticipant>(
    participants.map((p) => [p.userId, p])
  );

  const matchedPlayers = participants
    .map((p) => playerMap.get(p.userId))
    .filter((p): p is PlayerProfile => p !== undefined);

  return matchedPlayers.sort((a, b) => {
    const partA = participantDataMap.get(a.id);
    const partB = participantDataMap.get(b.id);

    const weightA = partA ? statusWeight[partA.attendanceStatus] ?? 0 : 0;
    const weightB = partB ? statusWeight[partB.attendanceStatus] ?? 0 : 0;

    // 1. Attendance status
    if (weightA !== weightB) {
      return weightB - weightA;
    }

    // 2. Karma score
    if (a.karmaScore !== b.karmaScore) {
      return b.karmaScore - a.karmaScore;
    }

    // 3. Early signup timestamp
    const joinTimeA = partA?.joinedAt ? new Date(partA.joinedAt).getTime() : 0;
    const joinTimeB = partB?.joinedAt ? new Date(partB.joinedAt).getTime() : 0;
    return joinTimeA - joinTimeB;
  });
}
