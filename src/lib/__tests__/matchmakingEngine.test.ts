import { describe, it, expect } from 'vitest';
import {
  calculateGameSynchrony,
  spinWeightedRoulette,
  calculateScheduleOverlap,
  evaluateCheckInStatus,
  calculateTitleForPlayer,
  parseTimeMinutes,
  formatMinutesToTime,
  sortPlayersByLobbyPriority,
} from '../matchmakingEngine';
import {
  Game,
  PlayerProfile,
  SessionParticipant,
  UserGamePreference,
  GameSynchronyResult,
} from '../../types/domain';

// Fixture helpers for clean test isolation
const createTestPlayer = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  id: 'player-1',
  discordId: '100000000000000001',
  discordUsername: 'test_player',
  displayName: 'Test Player',
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=test1',
  karmaScore: 80,
  sessionsPlayed: 10,
  hoursPlayed: 25,
  onTimeCount: 8,
  lateCount: 2,
  noShowCount: 0,
  currentStreak: 4,
  activeTitle: '🫡 Soldado Fiel',
  isOnline: true,
  pushEnabled: true,
  ...overrides,
});

const createTestGame = (overrides: Partial<Game> = {}): Game => ({
  id: 'game-tactical',
  name: 'Tactical Strike',
  coverUrl: 'https://example.com/cover.jpg',
  minPlayers: 2,
  maxPlayers: 5,
  category: 'Shooter',
  tags: ['FPS', 'Tactical'],
  averageDurationMins: 45,
  addedBy: 'player-1',
  ...overrides,
});

const createTestParticipant = (overrides: Partial<SessionParticipant> = {}): SessionParticipant => ({
  userId: 'player-1',
  joinedAt: '2026-11-13T20:00:00.000Z',
  availableFrom: '22:00',
  availableUntil: '01:30',
  precisionMinutes: 15,
  attendanceStatus: 'pending',
  ...overrides,
});

describe('Matchmaking & Karma Engine (matchmakingEngine)', () => {
  describe('calculateGameSynchrony', () => {
    it('verifies perfect_fit when all participants play a game and minPlayers <= count <= maxPlayers', () => {
      const game = createTestGame({ minPlayers: 2, maxPlayers: 4 });
      const players = [
        createTestPlayer({ id: 'p1', displayName: 'Player 1' }),
        createTestPlayer({ id: 'p2', displayName: 'Player 2' }),
        createTestPlayer({ id: 'p3', displayName: 'Player 3' }),
      ];
      const participants = players.map((p) =>
        createTestParticipant({ userId: p.id })
      );
      const preferences: UserGamePreference[] = [
        { userId: 'p1', gameId: game.id, plays: true, rating: 4 },
        { userId: 'p2', gameId: game.id, plays: true, rating: 5 },
        { userId: 'p3', gameId: game.id, plays: true, rating: 4 },
      ];

      const results = calculateGameSynchrony([game], preferences, participants, players);

      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res.status).toBe('perfect_fit');
      expect(res.playersWhoPlayCount).toBe(3);
      expect(res.totalParticipants).toBe(3);
      expect(res.dislikeCount).toBe(0);
      expect(res.suggestedSubLobbies).toBeDefined();
      expect(res.suggestedSubLobbies).toHaveLength(1);
      expect(res.suggestedSubLobbies![0].lobbyName).toContain('Lobby Principal');
      expect(res.suggestedSubLobbies![0].players).toHaveLength(3);
      expect(res.suggestedSubLobbies![0].isWaitlist).toBe(false);
    });

    it('verifies -15 penalty when a player rates a game 1★ ("Lo juego solo si me obligan")', () => {
      const game = createTestGame({ minPlayers: 1, maxPlayers: 5 });
      const players = [
        createTestPlayer({ id: 'p1' }),
        createTestPlayer({ id: 'p2' }),
        createTestPlayer({ id: 'p3' }),
        createTestPlayer({ id: 'p4' }),
      ];
      const participants = players.map((p) =>
        createTestParticipant({ userId: p.id })
      );

      // 4 players: ratings [1, 5, 5, 5] -> avg = 4.0
      // Base score: Math.round(4.0 * 20) = 80
      // Dislike penalty: 1 * -15 = -15 -> expected synchronyScore = 65
      const preferences: UserGamePreference[] = [
        { userId: 'p1', gameId: game.id, plays: true, rating: 1 },
        { userId: 'p2', gameId: game.id, plays: true, rating: 5 },
        { userId: 'p3', gameId: game.id, plays: true, rating: 5 },
        { userId: 'p4', gameId: game.id, plays: true, rating: 5 },
      ];

      const results = calculateGameSynchrony([game], preferences, participants, players);
      const res = results[0];

      expect(res.dislikeCount).toBe(1);
      expect(res.averageRating).toBe(4);
      // Base score 80 - 15 = 65
      expect(res.synchronyScore).toBe(65);
    });

    it('verifies +5 bonus when all participants rate >= 4★ ("Unanimously Loved")', () => {
      const game = createTestGame({ minPlayers: 1, maxPlayers: 5 });
      const players = [
        createTestPlayer({ id: 'p1' }),
        createTestPlayer({ id: 'p2' }),
        createTestPlayer({ id: 'p3' }),
      ];
      const participants = players.map((p) =>
        createTestParticipant({ userId: p.id })
      );

      // 3 players: ratings [4, 5, 5] -> avg = 4.67
      // Base score: Math.round(4.67 * 20) = 93
      // Loved bonus: +5 (all rated >= 4) -> expected synchronyScore = 98
      const preferences: UserGamePreference[] = [
        { userId: 'p1', gameId: game.id, plays: true, rating: 4 },
        { userId: 'p2', gameId: game.id, plays: true, rating: 5 },
        { userId: 'p3', gameId: game.id, plays: true, rating: 5 },
      ];

      const results = calculateGameSynchrony([game], preferences, participants, players);
      const res = results[0];

      expect(res.lovedCount).toBe(3);
      expect(res.dislikeCount).toBe(0);
      expect(res.synchronyScore).toBe(98);
      // Quadratic roulette weight: 98^2 = 9604
      expect(res.rouletteWeight).toBe(98 ** 2);
    });

    it('verifies score clamping within 0 to 100 boundaries', () => {
      const game = createTestGame({ minPlayers: 1, maxPlayers: 5 });
      const players = [createTestPlayer({ id: 'p1' }), createTestPlayer({ id: 'p2' })];
      const participants = players.map((p) => createTestParticipant({ userId: p.id }));

      // Max score clamping: 2 players rating 5★ -> base 100 + 5 bonus = 105 -> clamped to 100
      const perfectPrefs: UserGamePreference[] = [
        { userId: 'p1', gameId: game.id, plays: true, rating: 5 },
        { userId: 'p2', gameId: game.id, plays: true, rating: 5 },
      ];
      const perfectRes = calculateGameSynchrony([game], perfectPrefs, participants, players)[0];
      expect(perfectRes.synchronyScore).toBe(100);

      // Min score clamping: 2 players rating 1★ -> base 20 - (2 * 15) = -10 -> clamped to 0
      const terriblePrefs: UserGamePreference[] = [
        { userId: 'p1', gameId: game.id, plays: true, rating: 1 },
        { userId: 'p2', gameId: game.id, plays: true, rating: 1 },
      ];
      const terribleRes = calculateGameSynchrony([game], terriblePrefs, participants, players)[0];
      expect(terribleRes.synchronyScore).toBe(0);
    });

    it('verifies split_required and suggestedSubLobbies when 6 players sign up for a max 4-player game (allowSplitLobbies = false)', () => {
      const game = createTestGame({ id: 'game-lethal', name: 'Lethal 4P', minPlayers: 1, maxPlayers: 4 });

      // 6 players with varying Karma and attendance
      const playerSuizo = createTestPlayer({ id: 'p-suizo', displayName: 'Santi Suizo', karmaScore: 96 });
      const playerTincho = createTestPlayer({ id: 'p-tincho', displayName: 'Tincho', karmaScore: 90 });
      const playerLucho = createTestPlayer({ id: 'p-lucho', displayName: 'Lucho', karmaScore: 78 });
      const playerNacho = createTestPlayer({ id: 'p-nacho', displayName: 'Nacho ±15m', karmaScore: 62 });
      const playerFede = createTestPlayer({ id: 'p-fede', displayName: 'Fede Humo', karmaScore: 42 });
      const playerFantasma = createTestPlayer({ id: 'p-fantasma', displayName: 'Gonza Ghost', karmaScore: 28 });

      const players = [playerSuizo, playerTincho, playerLucho, playerNacho, playerFede, playerFantasma];

      const participants: SessionParticipant[] = [
        createTestParticipant({ userId: 'p-suizo', attendanceStatus: 'on_time', joinedAt: '2026-11-13T20:00:00.000Z' }),
        createTestParticipant({ userId: 'p-tincho', attendanceStatus: 'on_time', joinedAt: '2026-11-13T20:05:00.000Z' }),
        createTestParticipant({ userId: 'p-lucho', attendanceStatus: 'pending', joinedAt: '2026-11-13T20:10:00.000Z' }),
        createTestParticipant({ userId: 'p-nacho', attendanceStatus: 'pending', joinedAt: '2026-11-13T20:15:00.000Z' }),
        createTestParticipant({ userId: 'p-fede', attendanceStatus: 'pending', joinedAt: '2026-11-13T20:20:00.000Z' }),
        createTestParticipant({ userId: 'p-fantasma', attendanceStatus: 'pending', joinedAt: '2026-11-13T20:25:00.000Z' }),
      ];

      const preferences: UserGamePreference[] = players.map((p) => ({
        userId: p.id,
        gameId: game.id,
        plays: true,
        rating: 4,
      }));

      const results = calculateGameSynchrony([game], preferences, participants, players, false);
      const res = results[0];

      expect(res.status).toBe('split_required');
      expect(res.suggestedSubLobbies).toBeDefined();
      expect(res.suggestedSubLobbies).toHaveLength(2);

      const mainLobby = res.suggestedSubLobbies![0];
      const waitlistLobby = res.suggestedSubLobbies![1];

      // Main lobby holds maxPlayers = 4
      expect(mainLobby.isWaitlist).toBe(false);
      expect(mainLobby.players).toHaveLength(4);
      expect(mainLobby.lobbyName).toContain('Lobby Principal');

      // The top 4 players must be prioritized: Santi (on_time 96), Tincho (on_time 90), Lucho (78), Nacho (62)
      const mainPlayerIds = mainLobby.players.map((p) => p.id);
      expect(mainPlayerIds).toEqual(['p-suizo', 'p-tincho', 'p-lucho', 'p-nacho']);

      // Sub-lobby / waitlist holds the remaining 2 players with lowest reliability (Fede 42 and Gonza 28)
      expect(waitlistLobby.isWaitlist).toBe(true);
      expect(waitlistLobby.players).toHaveLength(2);
      expect(waitlistLobby.lobbyName).toContain('Suplentes');
      const waitlistPlayerIds = waitlistLobby.players.map((p) => p.id);
      expect(waitlistPlayerIds).toEqual(['p-fede', 'p-fantasma']);
    });

    it('verifies split_required with balanced sub-lobbies (Alfa and Bravo) when allowSplitLobbies = true', () => {
      const game = createTestGame({ id: 'game-coop', name: 'Coop 4P', minPlayers: 1, maxPlayers: 4 });
      const players = [
        createTestPlayer({ id: 'p1', karmaScore: 90 }),
        createTestPlayer({ id: 'p2', karmaScore: 85 }),
        createTestPlayer({ id: 'p3', karmaScore: 80 }),
        createTestPlayer({ id: 'p4', karmaScore: 75 }),
        createTestPlayer({ id: 'p5', karmaScore: 70 }),
        createTestPlayer({ id: 'p6', karmaScore: 65 }),
      ];
      const participants = players.map((p) => createTestParticipant({ userId: p.id }));
      const preferences: UserGamePreference[] = players.map((p) => ({
        userId: p.id,
        gameId: game.id,
        plays: true,
        rating: 4,
      }));

      // Splitting 6 players into 3 and 3 satisfies minPlayers (1) <= 3 <= maxPlayers (4)
      const results = calculateGameSynchrony([game], preferences, participants, players, true);
      const res = results[0];

      expect(res.status).toBe('split_required');
      expect(res.suggestedSubLobbies).toHaveLength(2);
      expect(res.suggestedSubLobbies![0].lobbyName).toContain('Lobby Alfa');
      expect(res.suggestedSubLobbies![0].players).toHaveLength(3);
      expect(res.suggestedSubLobbies![0].isWaitlist).toBe(false);

      expect(res.suggestedSubLobbies![1].lobbyName).toContain('Lobby Bravo');
      expect(res.suggestedSubLobbies![1].players).toHaveLength(3);
      expect(res.suggestedSubLobbies![1].isWaitlist).toBe(false);
    });

    it('verifies missing_owners when at least one signed-up friend has plays: false', () => {
      const game = createTestGame({ minPlayers: 1, maxPlayers: 5 });
      const players = [
        createTestPlayer({ id: 'p1' }),
        createTestPlayer({ id: 'p2' }),
        createTestPlayer({ id: 'p3' }),
      ];
      const participants = players.map((p) => createTestParticipant({ userId: p.id }));

      const preferences: UserGamePreference[] = [
        { userId: 'p1', gameId: game.id, plays: true, rating: 5 },
        { userId: 'p2', gameId: game.id, plays: true, rating: 4 },
        { userId: 'p3', gameId: game.id, plays: false, rating: 1 }, // p3 does NOT play or own it
      ];

      const results = calculateGameSynchrony([game], preferences, participants, players);
      const res = results[0];

      expect(res.status).toBe('missing_owners');
      expect(res.playersWhoPlayCount).toBe(2);
      expect(res.totalParticipants).toBe(3);
    });

    it('verifies needs_more_players when participants count is less than minPlayers', () => {
      const game = createTestGame({ minPlayers: 4, maxPlayers: 8 });
      const players = [createTestPlayer({ id: 'p1' }), createTestPlayer({ id: 'p2' })];
      const participants = players.map((p) => createTestParticipant({ userId: p.id }));

      const preferences: UserGamePreference[] = [
        { userId: 'p1', gameId: game.id, plays: true, rating: 5 },
        { userId: 'p2', gameId: game.id, plays: true, rating: 5 },
      ];

      const results = calculateGameSynchrony([game], preferences, participants, players);
      expect(results[0].status).toBe('needs_more_players');
    });

    it('sorts results prioritizing perfect_fit over other statuses, then by synchronyScore descending', () => {
      const gameFitA = createTestGame({ id: 'g-fit-a', minPlayers: 1, maxPlayers: 5 });
      const gameFitB = createTestGame({ id: 'g-fit-b', minPlayers: 1, maxPlayers: 5 });
      const gameMissing = createTestGame({ id: 'g-missing', minPlayers: 1, maxPlayers: 5 });

      const players = [createTestPlayer({ id: 'p1' }), createTestPlayer({ id: 'p2' })];
      const participants = players.map((p) => createTestParticipant({ userId: p.id }));

      const preferences: UserGamePreference[] = [
        // Fit A: avg 3.0 -> synchronyScore 60
        { userId: 'p1', gameId: 'g-fit-a', plays: true, rating: 3 },
        { userId: 'p2', gameId: 'g-fit-a', plays: true, rating: 3 },
        // Fit B: avg 5.0 -> synchronyScore 100
        { userId: 'p1', gameId: 'g-fit-b', plays: true, rating: 5 },
        { userId: 'p2', gameId: 'g-fit-b', plays: true, rating: 5 },
        // Missing: avg 5.0 but p2 plays: false
        { userId: 'p1', gameId: 'g-missing', plays: true, rating: 5 },
        { userId: 'p2', gameId: 'g-missing', plays: false, rating: 1 },
      ];

      const results = calculateGameSynchrony(
        [gameFitA, gameMissing, gameFitB],
        preferences,
        participants,
        players
      );

      expect(results[0].game.id).toBe('g-fit-b'); // perfect_fit with score 100
      expect(results[1].game.id).toBe('g-fit-a'); // perfect_fit with score 60
      expect(results[2].game.id).toBe('g-missing'); // missing_owners
    });
  });

  describe('spinWeightedRoulette', () => {
    it('verifies deterministic selection with custom randomFn', () => {
      const gameA = createTestGame({ id: 'game-a', name: 'Game A' });
      const gameB = createTestGame({ id: 'game-b', name: 'Game B' });

      // Create fake synchrony results: Game A weight 100, Game B weight 900 (total = 1000)
      const mockResults: GameSynchronyResult[] = [
        {
          game: gameA,
          status: 'perfect_fit',
          synchronyScore: 10,
          averageRating: 2.0,
          rouletteWeight: 100,
          playersWhoPlayCount: 2,
          totalParticipants: 2,
          dislikeCount: 0,
          lovedCount: 0,
          playerBreakdowns: [],
        },
        {
          game: gameB,
          status: 'perfect_fit',
          synchronyScore: 30,
          averageRating: 4.5,
          rouletteWeight: 900,
          playersWhoPlayCount: 2,
          totalParticipants: 2,
          dislikeCount: 0,
          lovedCount: 0,
          playerBreakdowns: [],
        },
      ];

      // randomFn returning 0.05 -> randomValue = 50 <= 100 -> chooses Game A
      const winnerA = spinWeightedRoulette(mockResults, () => 0.05);
      expect(winnerA?.id).toBe('game-a');

      // randomFn returning 0.50 -> randomValue = 500 > 100 and <= 1000 -> chooses Game B
      const winnerB = spinWeightedRoulette(mockResults, () => 0.5);
      expect(winnerB?.id).toBe('game-b');

      // randomFn returning 0.99 -> randomValue = 990 -> chooses Game B
      const winnerBHigh = spinWeightedRoulette(mockResults, () => 0.99);
      expect(winnerBHigh?.id).toBe('game-b');
    });

    it('filters out games that are missing_owners or needs_more_players', () => {
      const gameGood = createTestGame({ id: 'good', name: 'Good Game' });
      const gameBad = createTestGame({ id: 'bad', name: 'Bad Game' });

      const mockResults: GameSynchronyResult[] = [
        {
          game: gameBad,
          status: 'missing_owners',
          synchronyScore: 100,
          averageRating: 5.0,
          rouletteWeight: 10000,
          playersWhoPlayCount: 1,
          totalParticipants: 2,
          dislikeCount: 0,
          lovedCount: 1,
          playerBreakdowns: [],
        },
        {
          game: gameGood,
          status: 'perfect_fit',
          synchronyScore: 50,
          averageRating: 3.0,
          rouletteWeight: 2500,
          playersWhoPlayCount: 2,
          totalParticipants: 2,
          dislikeCount: 0,
          lovedCount: 0,
          playerBreakdowns: [],
        },
      ];

      const winner = spinWeightedRoulette(mockResults, () => 0.1);
      expect(winner?.id).toBe('good');
    });

    it('returns null when input is empty or no games are eligible', () => {
      expect(spinWeightedRoulette([])).toBeNull();

      const ineligible: GameSynchronyResult[] = [
        {
          game: createTestGame(),
          status: 'needs_more_players',
          synchronyScore: 50,
          averageRating: 3.0,
          rouletteWeight: 2500,
          playersWhoPlayCount: 1,
          totalParticipants: 1,
          dislikeCount: 0,
          lovedCount: 0,
          playerBreakdowns: [],
        },
      ];
      expect(spinWeightedRoulette(ineligible)).toBeNull();
    });
  });

  describe('calculateScheduleOverlap', () => {
    it('verifies midnight crossover (22:00 to 01:30) and calculates correct overlap duration', () => {
      const player = createTestPlayer({ id: 'p1' });
      const participant = createTestParticipant({
        userId: 'p1',
        availableFrom: '22:00',
        availableUntil: '01:30',
        precisionMinutes: 15,
      });

      const summary = calculateScheduleOverlap([participant], [player]);

      expect(summary.hasValidOverlap).toBe(true);
      expect(summary.probableStartFormatted).toBe('22:00');
      expect(summary.guaranteedStartFormatted).toBe('22:15');
      expect(summary.probableEndFormatted).toBe('01:30');
      expect(summary.guaranteedEndFormatted).toBe('01:15');

      // 22:00 (1320m) to 01:30 (1530m) = 210 minutes
      expect(summary.overlapDurationMinutes).toBe(210);
      // Guaranteed overlap: 01:15 (1515m) - 22:15 (1335m) = 180 minutes
      expect(summary.guaranteedOverlapMinutes).toBe(180);
    });

    it('verifies individual earliestStart and strictDeadline for ±5m, ±15m, ±30m, ±60m precision windows', () => {
      const players = [
        createTestPlayer({ id: 'p5', displayName: 'P5' }),
        createTestPlayer({ id: 'p15', displayName: 'P15' }),
        createTestPlayer({ id: 'p30', displayName: 'P30' }),
        createTestPlayer({ id: 'p60', displayName: 'P60' }),
      ];

      const participants: SessionParticipant[] = [
        createTestParticipant({ userId: 'p5', availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 5 }),
        createTestParticipant({ userId: 'p15', availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 }),
        createTestParticipant({ userId: 'p30', availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 30 }),
        createTestParticipant({ userId: 'p60', availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 60 }),
      ];

      const summary = calculateScheduleOverlap(participants, players);
      const timelines = summary.participantTimelines;

      // ±5m: 22:00 - 5 = 21:55, 22:00 + 5 = 22:05
      const t5 = timelines.find((t) => t.userId === 'p5')!;
      expect(t5.earliestStartFormatted).toBe('21:55');
      expect(t5.strictDeadlineFormatted).toBe('22:05');

      // ±15m: 22:00 - 15 = 21:45, 22:00 + 15 = 22:15
      const t15 = timelines.find((t) => t.userId === 'p15')!;
      expect(t15.earliestStartFormatted).toBe('21:45');
      expect(t15.strictDeadlineFormatted).toBe('22:15');

      // ±30m: 22:00 - 30 = 21:30, 22:00 + 30 = 22:30
      const t30 = timelines.find((t) => t.userId === 'p30')!;
      expect(t30.earliestStartFormatted).toBe('21:30');
      expect(t30.strictDeadlineFormatted).toBe('22:30');

      // ±60m: 22:00 - 60 = 21:00, 22:00 + 60 = 23:00
      const t60 = timelines.find((t) => t.userId === 'p60')!;
      expect(t60.earliestStartFormatted).toBe('21:00');
      expect(t60.strictDeadlineFormatted).toBe('23:00');

      // Group probable start is max(nominal from) = 22:00
      expect(summary.probableStartFormatted).toBe('22:00');
      // Group guaranteed start is max(strictDeadline) = 23:00 (when ±60m player is guaranteed to be there)
      expect(summary.guaranteedStartFormatted).toBe('23:00');
    });

    it('returns empty fallback summary when participants list is empty', () => {
      const summary = calculateScheduleOverlap([], []);
      expect(summary.probableStartFormatted).toBe('--:--');
      expect(summary.guaranteedStartFormatted).toBe('--:--');
      expect(summary.hasValidOverlap).toBe(false);
      expect(summary.overlapDurationMinutes).toBe(0);
      expect(summary.participantTimelines).toEqual([]);
    });
  });

  describe('evaluateCheckInStatus', () => {
    it('verifies checking in within promisedTime + precisionMinutes returns on_time and +5 karmaDelta', () => {
      // Promised 22:00 with ±15m -> strict deadline is 22:15
      const onTimeAtNominal = evaluateCheckInStatus('22:00', 15, '22:00');
      expect(onTimeAtNominal.status).toBe('on_time');
      expect(onTimeAtNominal.karmaDelta).toBe(5);
      expect(onTimeAtNominal.minutesDiff).toBe(0);

      const onTimeMidMargin = evaluateCheckInStatus('22:00', 15, '22:10');
      expect(onTimeMidMargin.status).toBe('on_time');
      expect(onTimeMidMargin.karmaDelta).toBe(5);
      expect(onTimeMidMargin.minutesDiff).toBe(10);

      // Exact boundary minute: 22:15 is still on_time
      const onTimeExactBoundary = evaluateCheckInStatus('22:00', 15, '22:15');
      expect(onTimeExactBoundary.status).toBe('on_time');
      expect(onTimeExactBoundary.karmaDelta).toBe(5);
      expect(onTimeExactBoundary.minutesDiff).toBe(15);
    });

    it('verifies checking in even 1 minute after promisedTime + precisionMinutes returns late and -10 karmaDelta', () => {
      // Promised 22:00 with ±15m -> deadline is 22:15. Checking in at 22:16 is late
      const lateBy1Min = evaluateCheckInStatus('22:00', 15, '22:16');
      expect(lateBy1Min.status).toBe('late');
      expect(lateBy1Min.karmaDelta).toBe(-10);
      expect(lateBy1Min.minutesDiff).toBe(1);

      // Late by 30 mins: 22:45 against 22:15 deadline
      const lateBy30Min = evaluateCheckInStatus('22:00', 15, '22:45');
      expect(lateBy30Min.status).toBe('late');
      expect(lateBy30Min.karmaDelta).toBe(-10);
      expect(lateBy30Min.minutesDiff).toBe(30);
    });

    it('handles midnight crossover for late evening promised times', () => {
      // Promised 23:50 with ±15m -> deadline is 00:05 the next day
      const checkInNextDayOnTime = evaluateCheckInStatus('23:50', 15, '00:04');
      expect(checkInNextDayOnTime.status).toBe('on_time');
      expect(checkInNextDayOnTime.karmaDelta).toBe(5);

      const checkInNextDayLate = evaluateCheckInStatus('23:50', 15, '00:07');
      expect(checkInNextDayLate.status).toBe('late');
      expect(checkInNextDayLate.karmaDelta).toBe(-10);
      expect(checkInNextDayLate.minutesDiff).toBe(2);
    });
  });

  describe('calculateTitleForPlayer', () => {
    it('returns "👻 Fantasma Supremo (Sin Prioridad de Cupo)" when karma < 30 or noShowCount >= 4', () => {
      expect(calculateTitleForPlayer(25, 2, 1, 0)).toBe('👻 Fantasma Supremo (Sin Prioridad de Cupo)');
      expect(calculateTitleForPlayer(85, 20, 1, 4)).toBe('👻 Fantasma Supremo (Sin Prioridad de Cupo)');
      expect(calculateTitleForPlayer(10, 0, 0, 5)).toBe('👻 Fantasma Supremo (Sin Prioridad de Cupo)');
    });

    it('returns "💨 Humero Oficial" when karma < 50 or noShowCount >= 2', () => {
      expect(calculateTitleForPlayer(42, 5, 4, 1)).toBe('💨 Humero Oficial');
      expect(calculateTitleForPlayer(68, 10, 2, 2)).toBe('💨 Humero Oficial');
      expect(calculateTitleForPlayer(35, 1, 1, 2)).toBe('💨 Humero Oficial');
    });

    it('returns "🐢 Rey del ±15m Mentiroso" when karma >= 50, lateCount >= 3, and karma < 75', () => {
      expect(calculateTitleForPlayer(62, 11, 9, 0)).toBe('🐢 Rey del ±15m Mentiroso');
      expect(calculateTitleForPlayer(50, 4, 3, 0)).toBe('🐢 Rey del ±15m Mentiroso');
      expect(calculateTitleForPlayer(74, 15, 5, 0)).toBe('🐢 Rey del ±15m Mentiroso');
    });

    it('returns "⌚ Reloj Suizo" when karma >= 90 and onTimeCount >= 5', () => {
      expect(calculateTitleForPlayer(96, 30, 2, 0)).toBe('⌚ Reloj Suizo');
      expect(calculateTitleForPlayer(90, 5, 0, 0)).toBe('⌚ Reloj Suizo');
      expect(calculateTitleForPlayer(100, 15, 0, 0)).toBe('⌚ Reloj Suizo');
    });

    it('returns "🫡 Soldado Fiel" when karma >= 75 (and not meeting Reloj Suizo threshold)', () => {
      expect(calculateTitleForPlayer(78, 19, 5, 1)).toBe('🫡 Soldado Fiel');
      expect(calculateTitleForPlayer(85, 4, 0, 0)).toBe('🫡 Soldado Fiel'); // onTimeCount < 5
      expect(calculateTitleForPlayer(75, 10, 1, 0)).toBe('🫡 Soldado Fiel');
    });

    it('returns "🎮 Jugador Promedio" as default fallback', () => {
      expect(calculateTitleForPlayer(65, 3, 1, 0)).toBe('🎮 Jugador Promedio');
      expect(calculateTitleForPlayer(55, 2, 2, 0)).toBe('🎮 Jugador Promedio');
    });
  });

  describe('sortPlayersByLobbyPriority', () => {
    it('prioritizes attendance status, then karmaScore, then early signup timestamp', () => {
      const playerA = createTestPlayer({ id: 'pA', displayName: 'Player A', karmaScore: 70 });
      const playerB = createTestPlayer({ id: 'pB', displayName: 'Player B', karmaScore: 95 });
      const playerC = createTestPlayer({ id: 'pC', displayName: 'Player C', karmaScore: 90 });
      const playerD = createTestPlayer({ id: 'pD', displayName: 'Player D', karmaScore: 90 });

      const participants: SessionParticipant[] = [
        // Player A checked in on-time -> gets #1 priority despite lower karma
        createTestParticipant({ userId: 'pA', attendanceStatus: 'on_time', joinedAt: '2026-11-13T20:30:00Z' }),
        // Player B is pending, higher karma (95) -> #2
        createTestParticipant({ userId: 'pB', attendanceStatus: 'pending', joinedAt: '2026-11-13T20:20:00Z' }),
        // Player C is pending, karma 90, joined earlier than D -> #3
        createTestParticipant({ userId: 'pC', attendanceStatus: 'pending', joinedAt: '2026-11-13T20:00:00Z' }),
        // Player D is pending, karma 90, joined later than C -> #4
        createTestParticipant({ userId: 'pD', attendanceStatus: 'pending', joinedAt: '2026-11-13T20:10:00Z' }),
      ];

      const sorted = sortPlayersByLobbyPriority(participants, [playerA, playerB, playerC, playerD]);

      expect(sorted.map((p) => p.id)).toEqual(['pA', 'pB', 'pC', 'pD']);
    });
  });

  describe('parseTimeMinutes & formatMinutesToTime helpers', () => {
    it('parses valid HH:mm into minutes from 00:00', () => {
      expect(parseTimeMinutes('00:00')).toBe(0);
      expect(parseTimeMinutes('01:30')).toBe(90);
      expect(parseTimeMinutes('22:15')).toBe(1335);
      expect(parseTimeMinutes('')).toBe(0);
      expect(parseTimeMinutes('invalid')).toBe(0);
    });

    it('adds 1440 minutes on midnight crossover when isEnd=true and end <= start', () => {
      const startMins = parseTimeMinutes('22:00'); // 1320
      const endMins = parseTimeMinutes('02:00', true, startMins); // 120 + 1440 = 1560
      expect(endMins).toBe(1560);
    });

    it('formats minute count back to clean HH:mm strings with proper wrap-around', () => {
      expect(formatMinutesToTime(0)).toBe('00:00');
      expect(formatMinutesToTime(90)).toBe('01:30');
      expect(formatMinutesToTime(1335)).toBe('22:15');
      expect(formatMinutesToTime(1440)).toBe('00:00');
      expect(formatMinutesToTime(1560)).toBe('02:00');
      expect(formatMinutesToTime(-15)).toBe('23:45');
    });
  });
});
