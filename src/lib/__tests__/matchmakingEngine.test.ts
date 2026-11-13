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
  createDefaultWeeklySchedule,
  getDayOfWeekKey,
  getEffectiveScheduleForDate,
  reconcileSessionParticipantsWithSchedules,
  clampDefaultConfidence,
  normalizeDaySlots,
  isPlayerInvitedToSession,
  getProbableAvailablePlayersForSession,
  getEffectiveDailySchedule,
  reconcileAutoParticipantsForSession,
} from '../matchmakingEngine';
import {
  Game,
  PlayerProfile,
  SessionParticipant,
  UserGamePreference,
  GameSynchronyResult,
  GamingSession,
  WeeklySchedule,
  DailyScheduleOverride,
  DayScheduleConfig,
  TimeSlotBlock,
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

const createTestSession = (overrides: Partial<GamingSession> = {}): GamingSession => ({
  id: 'session-1',
  title: 'Sesión Nocturna Boludos',
  date: '2026-11-13',
  mode: 'random',
  status: 'open',
  createdBy: 'player-1',
  createdAt: '2026-11-13T18:00:00.000Z',
  participants: [],
  attendanceVotes: [],
  allowSplitLobbies: true,
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

    it('accurately resolves confirmationStatus and confidencePercentage on participant timelines', () => {
      const playerConfirmed = createTestPlayer({ id: 'p-conf', displayName: 'Confirmed Player' });
      const playerProbable = createTestPlayer({ id: 'p-prob', displayName: 'Probable Player' });
      const playerAuto = createTestPlayer({ id: 'p-auto', displayName: 'Auto Player' });

      const participants: SessionParticipant[] = [
        createTestParticipant({
          userId: 'p-conf',
          confirmationStatus: 'confirmed',
          confidencePercentage: 100,
          isAutoEnrolled: false,
        }),
        createTestParticipant({
          userId: 'p-prob',
          confirmationStatus: 'probable',
          confidencePercentage: 80,
          isAutoEnrolled: true,
        }),
        createTestParticipant({
          userId: 'p-auto',
          // No explicit confirmationStatus, auto-enrolled should resolve to probable and clamped confidence
          isAutoEnrolled: true,
          confidencePercentage: 100, // Should be clamped to 95 because it is probable
        }),
      ];

      const summary = calculateScheduleOverlap(participants, [playerConfirmed, playerProbable, playerAuto]);
      const timelines = summary.participantTimelines;

      const tConf = timelines.find((t) => t.userId === 'p-conf')!;
      expect(tConf.confirmationStatus).toBe('confirmed');
      expect(tConf.confidencePercentage).toBe(100);

      const tProb = timelines.find((t) => t.userId === 'p-prob')!;
      expect(tProb.confirmationStatus).toBe('probable');
      expect(tProb.confidencePercentage).toBe(80);

      const tAuto = timelines.find((t) => t.userId === 'p-auto')!;
      expect(tAuto.confirmationStatus).toBe('probable');
      // Even if participant had confidencePercentage: 100, probable participants are clamped <= 95
      expect(tAuto.confidencePercentage).toBe(95);
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

  describe('Automatic Weekly Schedule & Daily Overrides Engine', () => {
    describe('createDefaultWeeklySchedule & getDayOfWeekKey', () => {
      it('creates default weekly schedule for all 7 days with enabled: true', () => {
        const schedule = createDefaultWeeklySchedule();
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

        days.forEach((day) => {
          expect(schedule[day]).toBeDefined();
          expect(schedule[day].enabled).toBe(true);
          expect(schedule[day].precisionMinutes).toBe(15);
        });

        // Check specific standard hours: weekday 22:00-01:00 vs weekend 22:30-02:30
        expect(schedule.mon.availableFrom).toBe('22:00');
        expect(schedule.mon.availableUntil).toBe('01:00');
        expect(schedule.fri.availableFrom).toBe('22:30');
        expect(schedule.fri.availableUntil).toBe('02:30');
        expect(schedule.sat.availableFrom).toBe('22:30');
        expect(schedule.sat.availableUntil).toBe('02:30');
        expect(schedule.sun.availableFrom).toBe('22:00');
      });

      it('maps Monday through Sunday accurately for known dates with getDayOfWeekKey', () => {
        // Known calendar dates for November 2026:
        // 2026-11-09: Monday ('mon')
        // 2026-11-10: Tuesday ('tue')
        // 2026-11-11: Wednesday ('wed')
        // 2026-11-12: Thursday ('thu')
        // 2026-11-13: Friday ('fri')
        // 2026-11-14: Saturday ('sat')
        // 2026-11-15: Sunday ('sun')
        expect(getDayOfWeekKey('2026-11-09')).toBe('mon');
        expect(getDayOfWeekKey('2026-11-10')).toBe('tue');
        expect(getDayOfWeekKey('2026-11-11')).toBe('wed');
        expect(getDayOfWeekKey('2026-11-12')).toBe('thu');
        expect(getDayOfWeekKey('2026-11-13')).toBe('fri');
        expect(getDayOfWeekKey('2026-11-14')).toBe('sat');
        expect(getDayOfWeekKey('2026-11-15')).toBe('sun');
      });
    });

    describe('getEffectiveScheduleForDate', () => {
      it("returns the player's weekly schedule for that weekday when no daily override exists (source: 'weekly', plays: true)", () => {
        const player = createTestPlayer({
          id: 'p-weekly',
          weeklySchedule: createDefaultWeeklySchedule(),
        });

        // 2026-11-13 is Friday
        const effectiveFri = getEffectiveScheduleForDate(player, '2026-11-13');
        expect(effectiveFri.plays).toBe(true);
        expect(effectiveFri.source).toBe('weekly');
        expect(effectiveFri.dayKey).toBe('fri');
        expect(effectiveFri.availableFrom).toBe('22:30');
        expect(effectiveFri.availableUntil).toBe('02:30');
        expect(effectiveFri.precisionMinutes).toBe(15);

        // 2026-11-12 is Thursday
        const effectiveThu = getEffectiveScheduleForDate(player, '2026-11-12');
        expect(effectiveThu.plays).toBe(true);
        expect(effectiveThu.source).toBe('weekly');
        expect(effectiveThu.dayKey).toBe('thu');
        expect(effectiveThu.availableFrom).toBe('22:00');
        expect(effectiveThu.availableUntil).toBe('01:00');
      });

      it('falls back to default schedule when player has no weeklySchedule configured', () => {
        const player = createTestPlayer({ id: 'p-no-sched', weeklySchedule: undefined });
        const effective = getEffectiveScheduleForDate(player, '2026-11-13');
        expect(effective.plays).toBe(true);
        expect(effective.source).toBe('weekly');
        expect(effective.dayKey).toBe('fri');
        expect(effective.availableFrom).toBe('22:30');
      });

      it('returns plays: false when that weekday has enabled: false in weeklySchedule', () => {
        const customWeekly = createDefaultWeeklySchedule();
        customWeekly.thu.enabled = false; // Player does not play on Thursdays

        const player = createTestPlayer({
          id: 'p-no-thu',
          weeklySchedule: customWeekly,
        });

        // 2026-11-12 is Thursday
        const effectiveThu = getEffectiveScheduleForDate(player, '2026-11-12');
        expect(effectiveThu.plays).toBe(false);
        expect(effectiveThu.source).toBe('weekly');
        expect(effectiveThu.dayKey).toBe('thu');

        // Friday is still enabled
        const effectiveFri = getEffectiveScheduleForDate(player, '2026-11-13');
        expect(effectiveFri.plays).toBe(true);
      });

      it('returns plays: false (source: "override") when player set "🚫 Hoy no juego" (status: "not_playing"), even if weekday is enabled in weeklySchedule', () => {
        const player = createTestPlayer({
          id: 'p-hoy-no-juego',
          weeklySchedule: createDefaultWeeklySchedule(), // Fridays are enabled
          dailyOverrides: {
            '2026-11-13': {
              date: '2026-11-13',
              status: 'not_playing',
              reason: 'Cena familiar de cumpleaños',
              updatedAt: '2026-11-13T15:00:00Z',
            },
          },
        });

        // 2026-11-13 is Friday
        const effectiveFri = getEffectiveScheduleForDate(player, '2026-11-13');
        expect(effectiveFri.plays).toBe(false);
        expect(effectiveFri.source).toBe('override');
        expect(effectiveFri.dayKey).toBe('fri');
        expect(effectiveFri.reason).toBe('Cena familiar de cumpleaños');

        // Other days (e.g. Saturday 2026-11-14) remain unaffected
        const effectiveSat = getEffectiveScheduleForDate(player, '2026-11-14');
        expect(effectiveSat.plays).toBe(true);
        expect(effectiveSat.source).toBe('weekly');
      });

      it('returns custom hours (source: "override", plays: true) when the player overrode just that specific day hours', () => {
        const player = createTestPlayer({
          id: 'p-custom-hours',
          weeklySchedule: createDefaultWeeklySchedule(),
          dailyOverrides: {
            '2026-11-13': {
              date: '2026-11-13',
              status: 'playing',
              availableFrom: '23:30',
              availableUntil: '02:00',
              precisionMinutes: 30,
              reason: 'Llego tarde de la facultad',
              updatedAt: '2026-11-13T17:00:00Z',
            },
          },
        });

        const effective = getEffectiveScheduleForDate(player, '2026-11-13');
        expect(effective.plays).toBe(true);
        expect(effective.source).toBe('override');
        expect(effective.dayKey).toBe('fri');
        expect(effective.availableFrom).toBe('23:30');
        expect(effective.availableUntil).toBe('02:00');
        expect(effective.precisionMinutes).toBe(30);
        expect(effective.reason).toBe('Llego tarde de la facultad');
      });
    });

    describe('reconcileSessionParticipantsWithSchedules', () => {
      it('automatically enrolls all players whose effective schedule for session.date has plays: true, without requiring manual signup', () => {
        const player1 = createTestPlayer({ id: 'p1', displayName: 'Player 1' });
        const player2 = createTestPlayer({ id: 'p2', displayName: 'Player 2' });
        const player3 = createTestPlayer({ id: 'p3', displayName: 'Player 3' });

        const session = createTestSession({
          date: '2026-11-13', // Friday
          participants: [], // Initially empty session!
        });

        const enrolled = reconcileSessionParticipantsWithSchedules(session, [
          player1,
          player2,
          player3,
        ]);

        expect(enrolled).toHaveLength(3);
        expect(enrolled.map((p) => p.userId)).toEqual(['p1', 'p2', 'p3']);
        enrolled.forEach((p) => {
          expect(p.isAutoEnrolled).toBe(true);
          expect(p.availableFrom).toBe('22:30'); // Friday default start
          expect(p.availableUntil).toBe('02:30'); // Friday default end
          expect(p.precisionMinutes).toBe(15);
          expect(p.attendanceStatus).toBe('pending');
        });
      });

      it('automatically removes a player from session.participants when they set "Hoy no juego" (status: "not_playing") for session.date', () => {
        const playerPlaying = createTestPlayer({ id: 'p-playing', displayName: 'Playing Player' });
        const playerBailing = createTestPlayer({
          id: 'p-bailing',
          displayName: 'Bailing Player',
          dailyOverrides: {
            '2026-11-13': {
              date: '2026-11-13',
              status: 'not_playing',
              reason: 'Me quedé sin internet',
              updatedAt: '2026-11-13T20:00:00Z',
            },
          },
        });

        // The session previously contained both participants
        const session = createTestSession({
          date: '2026-11-13',
          participants: [
            createTestParticipant({ userId: 'p-playing' }),
            createTestParticipant({ userId: 'p-bailing' }),
          ],
        });

        const updatedParticipants = reconcileSessionParticipantsWithSchedules(session, [
          playerPlaying,
          playerBailing,
        ]);

        expect(updatedParticipants).toHaveLength(1);
        expect(updatedParticipants[0].userId).toBe('p-playing');
        expect(updatedParticipants.find((p) => p.userId === 'p-bailing')).toBeUndefined();
      });

      it('automatically excludes a player when their weeklySchedule has enabled: false for the session weekday', () => {
        const customWeekly = createDefaultWeeklySchedule();
        customWeekly.fri.enabled = false; // Doesn't play on Fridays

        const playerFriOff = createTestPlayer({
          id: 'p-fri-off',
          weeklySchedule: customWeekly,
        });
        const playerNormal = createTestPlayer({ id: 'p-normal' });

        const session = createTestSession({
          date: '2026-11-13', // Friday
          participants: [],
        });

        const participants = reconcileSessionParticipantsWithSchedules(session, [
          playerFriOff,
          playerNormal,
        ]);

        expect(participants).toHaveLength(1);
        expect(participants[0].userId).toBe('p-normal');
      });

      it('preserves checkedInAt and attendanceStatus for already checked-in participants', () => {
        const checkedInPlayer = createTestPlayer({ id: 'p-checked-in', displayName: 'Puntual' });
        const pendingPlayer = createTestPlayer({ id: 'p-pending', displayName: 'Dormilón' });

        const existingCheckedIn = createTestParticipant({
          userId: 'p-checked-in',
          attendanceStatus: 'on_time',
          checkedInAt: '22:25',
          joinedAt: '2026-11-13T18:00:00Z',
        });

        const existingPending = createTestParticipant({
          userId: 'p-pending',
          attendanceStatus: 'pending',
          checkedInAt: undefined,
          joinedAt: '2026-11-13T19:00:00Z',
        });

        const session = createTestSession({
          date: '2026-11-13',
          participants: [existingCheckedIn, existingPending],
        });

        const reconciled = reconcileSessionParticipantsWithSchedules(session, [
          checkedInPlayer,
          pendingPlayer,
        ]);

        expect(reconciled).toHaveLength(2);

        const reconciledCheckedIn = reconciled.find((p) => p.userId === 'p-checked-in')!;
        expect(reconciledCheckedIn.attendanceStatus).toBe('on_time');
        expect(reconciledCheckedIn.checkedInAt).toBe('22:25');
        expect(reconciledCheckedIn.joinedAt).toBe('2026-11-13T18:00:00Z');

        const reconciledPending = reconciled.find((p) => p.userId === 'p-pending')!;
        expect(reconciledPending.attendanceStatus).toBe('pending');
        expect(reconciledPending.checkedInAt).toBeUndefined();
      });

      it('preserves manual session edits when isAutoEnrolled is false and no daily override is present', () => {
        const manualPlayer = createTestPlayer({ id: 'p-manual' });
        const customParticipant = createTestParticipant({
          userId: 'p-manual',
          availableFrom: '23:45',
          availableUntil: '03:15',
          precisionMinutes: 30,
          isAutoEnrolled: false, // Player edited session time manually in modal
          note: 'Ajuste manual para esta sesión',
        });

        const session = createTestSession({
          date: '2026-11-13',
          participants: [customParticipant],
        });

        const reconciled = reconcileSessionParticipantsWithSchedules(session, [manualPlayer]);
        expect(reconciled).toHaveLength(1);
        expect(reconciled[0].availableFrom).toBe('23:45');
        expect(reconciled[0].availableUntil).toBe('03:15');
        expect(reconciled[0].precisionMinutes).toBe(30);
        expect(reconciled[0].isAutoEnrolled).toBe(false);
      });
    });

    describe('clampDefaultConfidence', () => {
      it('clamps confidence to the 10..95 range (never 100 in default mode)', () => {
        // Passing 100 clamps to 95 — 100% is only valid when confirmationStatus === 'confirmed'
        expect(clampDefaultConfidence(100)).toBe(95);
        expect(clampDefaultConfidence(105)).toBe(95);
        expect(clampDefaultConfidence(96)).toBe(95);
        expect(clampDefaultConfidence(95)).toBe(95);

        // Within 10..95 range
        expect(clampDefaultConfidence(90)).toBe(90);
        expect(clampDefaultConfidence(75)).toBe(75);
        expect(clampDefaultConfidence(50)).toBe(50);
        expect(clampDefaultConfidence(10)).toBe(10);

        // Below 10 clamps to 10
        expect(clampDefaultConfidence(9)).toBe(10);
        expect(clampDefaultConfidence(0)).toBe(10);
        expect(clampDefaultConfidence(-15)).toBe(10);

        // Fallback for undefined/null/NaN defaults to 75
        expect(clampDefaultConfidence(undefined)).toBe(75);
        expect(clampDefaultConfidence(null as unknown as number)).toBe(75);
        expect(clampDefaultConfidence(NaN)).toBe(75);

        // Floating point values are rounded cleanly
        expect(clampDefaultConfidence(82.6)).toBe(83);
        expect(clampDefaultConfidence(82.4)).toBe(82);
      });
    });

    describe('createDefaultWeeklySchedule probabilistic confidence & slots', () => {
      it('creates default weekly schedule with confidencePercentage <= 95 and slot blocks', () => {
        const schedule = createDefaultWeeklySchedule();
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

        days.forEach((day) => {
          expect(schedule[day].confidencePercentage).toBeDefined();
          expect(schedule[day].confidencePercentage!).toBeLessThanOrEqual(95);
          expect(schedule[day].confidencePercentage!).toBeGreaterThanOrEqual(10);
          expect(schedule[day].slots).toBeDefined();
          expect(schedule[day].slots!.length).toBeGreaterThan(0);
          expect(schedule[day].slots![0].confidencePercentage).toBeLessThanOrEqual(95);
        });
      });

      it('clamps custom confidencePercentage to <= 95 even when 100 is passed', () => {
        const schedule = createDefaultWeeklySchedule('22:00', '01:00', 15, 100);
        expect(schedule.mon.confidencePercentage).toBe(95);
        expect(schedule.fri.confidencePercentage).toBe(95);
        expect(schedule.mon.slots![0].confidencePercentage).toBe(95);
      });
    });

    describe('normalizeDaySlots', () => {
      it('returns empty array if dayConfig.enabled is false', () => {
        const config: DayScheduleConfig = {
          enabled: false,
          availableFrom: '22:00',
          availableUntil: '01:00',
          precisionMinutes: 15,
        };
        expect(normalizeDaySlots(config, 'mon')).toEqual([]);
      });

      it('normalizes multi-slot DayScheduleConfig clamping slot confidence percentages to <= 95%', () => {
        const config: DayScheduleConfig = {
          enabled: true,
          availableFrom: '19:00',
          availableUntil: '02:00',
          precisionMinutes: 15,
          confidencePercentage: 80,
          slots: [
            {
              id: 'slot-1',
              from: '19:00',
              until: '21:00',
              confidencePercentage: 60,
              precisionMinutes: 15,
            },
            {
              id: 'slot-2',
              from: '22:30',
              until: '02:00',
              confidencePercentage: 100, // Should be clamped to 95
              precisionMinutes: 30,
            },
          ],
        };

        const normalized = normalizeDaySlots(config, 'fri');
        expect(normalized).toHaveLength(2);
        expect(normalized[0].confidencePercentage).toBe(60);
        expect(normalized[1].confidencePercentage).toBe(95);
      });

      it('generates fallback single slot when slots array is omitted or empty', () => {
        const config: DayScheduleConfig = {
          enabled: true,
          availableFrom: '21:00',
          availableUntil: '00:30',
          precisionMinutes: 30,
          confidencePercentage: 85,
        };

        const normalized = normalizeDaySlots(config, 'tue');
        expect(normalized).toHaveLength(1);
        expect(normalized[0]).toEqual({
          id: 'slot-tue-1',
          from: '21:00',
          until: '00:30',
          confidencePercentage: 85,
          precisionMinutes: 30,
        });
      });
    });

    describe('isPlayerInvitedToSession', () => {
      const baseSession: Pick<GamingSession, 'createdBy' | 'invitedUserIds'> = {
        createdBy: 'host-user',
        invitedUserIds: undefined,
      };

      it('returns true when invitedUserIds is undefined or empty (all group members invited)', () => {
        expect(isPlayerInvitedToSession({ ...baseSession, invitedUserIds: undefined }, 'any-user')).toBe(true);
        expect(isPlayerInvitedToSession({ ...baseSession, invitedUserIds: [] }, 'any-user')).toBe(true);
      });

      it('always returns true for the session creator, even if invitedUserIds does not explicitly list them', () => {
        const selectiveSession = {
          createdBy: 'host-user',
          invitedUserIds: ['guest-1', 'guest-2'],
        };
        expect(isPlayerInvitedToSession(selectiveSession, 'host-user')).toBe(true);
      });

      it('returns true when player is included in invitedUserIds', () => {
        const selectiveSession = {
          createdBy: 'host-user',
          invitedUserIds: ['guest-1', 'guest-2'],
        };
        expect(isPlayerInvitedToSession(selectiveSession, 'guest-1')).toBe(true);
        expect(isPlayerInvitedToSession(selectiveSession, 'guest-2')).toBe(true);
      });

      it('returns false when player is not in invitedUserIds and is not creator', () => {
        const selectiveSession = {
          createdBy: 'host-user',
          invitedUserIds: ['guest-1', 'guest-2'],
        };
        expect(isPlayerInvitedToSession(selectiveSession, 'uninvited-user')).toBe(false);
      });
    });

    describe('getEffectiveDailySchedule multi-slot & probabilistic resolution', () => {
      it('resolves multi-slot weekly configuration with correct availableFrom, availableUntil, and max confidence', () => {
        const customWeekly = createDefaultWeeklySchedule();
        customWeekly.fri = {
          enabled: true,
          availableFrom: '20:00',
          availableUntil: '02:00',
          precisionMinutes: 15,
          confidencePercentage: 80,
          slots: [
            {
              id: 'slot-early',
              from: '20:00',
              until: '22:00',
              confidencePercentage: 50,
              precisionMinutes: 15,
            },
            {
              id: 'slot-late',
              from: '23:00',
              until: '02:00',
              confidencePercentage: 90,
              precisionMinutes: 15,
            },
          ],
        };

        const player = createTestPlayer({ id: 'p-multi', weeklySchedule: customWeekly });
        // 2026-11-13 is Friday
        const effective = getEffectiveDailySchedule(player, '2026-11-13');

        expect(effective.plays).toBe(true);
        expect(effective.source).toBe('weekly');
        expect(effective.dayKey).toBe('fri');
        expect(effective.availableFrom).toBe('20:00'); // First slot start
        expect(effective.availableUntil).toBe('02:00'); // Last slot end
        expect(effective.confidencePercentage).toBe(90); // Max confidence of slots (< 100%)
        expect(effective.slots).toHaveLength(2);
      });

      it('resolves multi-slot daily override with precedence over weekly schedule', () => {
        const player = createTestPlayer({
          id: 'p-override-slots',
          weeklySchedule: createDefaultWeeklySchedule(),
          dailyOverrides: {
            '2026-11-13': {
              date: '2026-11-13',
              status: 'playing',
              slots: [
                {
                  id: 'over-1',
                  from: '21:00',
                  until: '23:00',
                  confidencePercentage: 60,
                  precisionMinutes: 15,
                },
                {
                  id: 'over-2',
                  from: '23:30',
                  until: '01:30',
                  confidencePercentage: 100, // Clamps to 95
                  precisionMinutes: 30,
                },
              ],
              reason: 'Horario especial de fin de semana',
              updatedAt: '2026-11-13T10:00:00Z',
            },
          },
        });

        const effective = getEffectiveDailySchedule(player, '2026-11-13');
        expect(effective.plays).toBe(true);
        expect(effective.source).toBe('override');
        expect(effective.availableFrom).toBe('21:00');
        expect(effective.availableUntil).toBe('01:30');
        expect(effective.confidencePercentage).toBe(95); // 100 clamped to 95
        expect(effective.slots).toHaveLength(2);
        expect(effective.slots[1].confidencePercentage).toBe(95);
        expect(effective.reason).toBe('Horario especial de fin de semana');
      });

      it('returns plays: false, confidencePercentage: 0, and empty slots when override is not_playing', () => {
        const player = createTestPlayer({
          id: 'p-not-playing',
          dailyOverrides: {
            '2026-11-13': {
              date: '2026-11-13',
              status: 'not_playing',
              reason: 'Examen mañana',
              updatedAt: '2026-11-13T10:00:00Z',
            },
          },
        });

        const effective = getEffectiveDailySchedule(player, '2026-11-13');
        expect(effective.plays).toBe(false);
        expect(effective.source).toBe('override');
        expect(effective.confidencePercentage).toBe(0);
        expect(effective.slots).toEqual([]);
      });
    });

    describe('reconcileAutoParticipantsForSession', () => {
      it('respects selective invitedUserIds: only invited players are auto-enrolled', () => {
        const creator = createTestPlayer({ id: 'creator-1', displayName: 'Creator' });
        const invitedPlayer = createTestPlayer({ id: 'invited-1', displayName: 'Invited' });
        const uninvitedPlayer = createTestPlayer({ id: 'uninvited-1', displayName: 'Uninvited' });

        const session = createTestSession({
          createdBy: 'creator-1',
          date: '2026-11-13', // Friday
          invitedUserIds: ['invited-1'], // Only invited-1 (creator is also implicitly allowed)
          participants: [],
        });

        const updatedSession = reconcileAutoParticipantsForSession(session, [
          creator,
          invitedPlayer,
          uninvitedPlayer,
        ]);

        const participantIds = updatedSession.participants.map((p) => p.userId);
        expect(participantIds).toContain('creator-1');
        expect(participantIds).toContain('invited-1');
        expect(participantIds).not.toContain('uninvited-1');
      });

      it('prunes previously auto-enrolled participants if they are removed from invitedUserIds', () => {
        const creator = createTestPlayer({ id: 'creator-1' });
        const previouslyInvited = createTestPlayer({ id: 'p-removed' });

        // Session previously had p-removed as auto-enrolled participant
        const session = createTestSession({
          createdBy: 'creator-1',
          date: '2026-11-13',
          invitedUserIds: ['creator-1'], // p-removed was excluded from invite list!
          participants: [
            createTestParticipant({
              userId: 'p-removed',
              isAutoEnrolled: true,
              confirmationStatus: 'probable',
            }),
          ],
        });

        const updatedSession = reconcileAutoParticipantsForSession(session, [
          creator,
          previouslyInvited,
        ]);

        const participantIds = updatedSession.participants.map((p) => p.userId);
        expect(participantIds).not.toContain('p-removed');
      });

      it('sets isAutoEnrolled: true, confirmationStatus: "probable", and confidencePercentage < 100 for auto-enrolled participants', () => {
        const player = createTestPlayer({ id: 'p-auto-check' });
        const session = createTestSession({
          createdBy: 'p-auto-check',
          date: '2026-11-13',
          participants: [],
        });

        const updatedSession = reconcileAutoParticipantsForSession(session, [player]);
        expect(updatedSession.participants).toHaveLength(1);

        const participant = updatedSession.participants[0];
        expect(participant.isAutoEnrolled).toBe(true);
        expect(participant.confirmationStatus).toBe('probable');
        expect(participant.confidencePercentage).toBeLessThan(100);
        expect(participant.confidencePercentage).toBeGreaterThanOrEqual(10);
        expect(participant.note).toContain('Probable');
      });

      it('preserves confirmationStatus: "confirmed" and guarantees confidencePercentage: 100 for confirmed participants', () => {
        const player = createTestPlayer({ id: 'p-confirmed-check' });
        const confirmedParticipant = createTestParticipant({
          userId: 'p-confirmed-check',
          confirmationStatus: 'confirmed',
          confidencePercentage: 100,
          isAutoEnrolled: false,
        });

        const session = createTestSession({
          createdBy: 'p-confirmed-check',
          date: '2026-11-13',
          participants: [confirmedParticipant],
        });

        const updatedSession = reconcileAutoParticipantsForSession(session, [player]);
        const participant = updatedSession.participants.find((p) => p.userId === 'p-confirmed-check')!;

        expect(participant.confirmationStatus).toBe('confirmed');
        expect(participant.confidencePercentage).toBe(100);
      });

      it('removes confirmed player if they explicitly set daily override to "not_playing"', () => {
        const player = createTestPlayer({
          id: 'p-bailing-confirmed',
          dailyOverrides: {
            '2026-11-13': {
              date: '2026-11-13',
              status: 'not_playing',
              reason: 'Fuerza mayor',
              updatedAt: '2026-11-13T12:00:00Z',
            },
          },
        });

        const session = createTestSession({
          createdBy: 'host',
          date: '2026-11-13',
          participants: [
            createTestParticipant({
              userId: 'p-bailing-confirmed',
              confirmationStatus: 'confirmed',
            }),
          ],
        });

        const updatedSession = reconcileAutoParticipantsForSession(session, [player]);
        expect(updatedSession.participants.find((p) => p.userId === 'p-bailing-confirmed')).toBeUndefined();
      });
    });

    describe('getProbableAvailablePlayersForSession', () => {
      it('returns invited players with probable schedules who have NOT yet confirmed 100%', () => {
        const playerConfirmed = createTestPlayer({ id: 'p-conf', displayName: 'Confirmed' });
        const playerProbableEnrolled = createTestPlayer({ id: 'p-prob', displayName: 'Probable' });
        const playerNotEnrolledYet = createTestPlayer({ id: 'p-not-yet', displayName: 'Not Yet Enrolled' });
        const playerNotPlaying = createTestPlayer({
          id: 'p-no-play',
          displayName: 'No Play',
          dailyOverrides: {
            '2026-11-13': {
              date: '2026-11-13',
              status: 'not_playing',
              updatedAt: '2026-11-13T12:00:00Z',
            },
          },
        });
        const playerUninvited = createTestPlayer({ id: 'p-uninvited', displayName: 'Uninvited' });

        const session = createTestSession({
          createdBy: 'p-conf',
          date: '2026-11-13',
          invitedUserIds: ['p-conf', 'p-prob', 'p-not-yet', 'p-no-play'], // p-uninvited is not invited
          participants: [
            createTestParticipant({
              userId: 'p-conf',
              confirmationStatus: 'confirmed',
              confidencePercentage: 100,
            }),
            createTestParticipant({
              userId: 'p-prob',
              confirmationStatus: 'probable',
              confidencePercentage: 75,
            }),
          ],
        });

        const probables = getProbableAvailablePlayersForSession(session, [
          playerConfirmed,
          playerProbableEnrolled,
          playerNotEnrolledYet,
          playerNotPlaying,
          playerUninvited,
        ]);

        const probableIds = probables.map((res) => res.player.id);

        // Confirmed player is excluded because they already confirmed 100%
        expect(probableIds).not.toContain('p-conf');
        // Probable enrolled player IS returned
        expect(probableIds).toContain('p-prob');
        // Player not enrolled yet but with plays: true IS returned
        expect(probableIds).toContain('p-not-yet');
        // Player with not_playing is excluded
        expect(probableIds).not.toContain('p-no-play');
        // Uninvited player is excluded
        expect(probableIds).not.toContain('p-uninvited');

        // Check matchedSlot structure
        const probItem = probables.find((r) => r.player.id === 'p-prob')!;
        expect(probItem.matchedSlot).toBeDefined();
        expect(probItem.matchedSlot.confidencePercentage).toBeLessThan(100);
      });
    });
  });
});
