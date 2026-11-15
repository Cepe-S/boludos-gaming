import { describe, expect, it } from 'vitest';
import {
  ARCHETYPE_MATRIX_6X6,
  POLYMATH_ARCHETYPE,
  PVJ_DIMENSION_KEYS,
  buildStrictPvjContractJson,
  classifyPvjVectorP,
  computeGameSpecificityOmega,
  computeGameVector6D,
  computeLogarithmicTimeWeightW,
  computePlayerPvj6dProfile,
  getPlayerArchetypeBadge,
} from '../playerCategorizationEngine';
import {
  DayScheduleConfig,
  Game,
  PlayerProfile,
  PvjVector6D,
  SteamOwnedGame,
  UserGamePreference,
  WeeklySchedule,
} from '../../types/domain';

function makeDefaultWeeklySchedule(): WeeklySchedule {
  const day: DayScheduleConfig = {
    enabled: false,
    availableFrom: '22:00',
    availableUntil: '01:00',
    precisionMinutes: 15,
  };
  return {
    mon: { ...day },
    tue: { ...day },
    wed: { ...day },
    thu: { ...day },
    fri: { ...day },
    sat: { ...day },
    sun: { ...day },
  };
}

function makeMockSteamGame(
  overrides: Partial<SteamOwnedGame> & Pick<SteamOwnedGame, 'appId' | 'name' | 'playtimeHours'>
): SteamOwnedGame {
  return {
    playtimeRecentHours: 0,
    headerImageUrl: '',
    genres: [],
    tags: [],
    isMultiplayer: true,
    minPlayers: 1,
    maxPlayers: 5,
    suggestedRating: 3,
    ...overrides,
  };
}

function makeMockPlayer(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: 'player-1',
    discordId: '1234567890',
    discordUsername: 'tester',
    displayName: 'Tester',
    avatarUrl: 'https://example.com/avatar.png',
    karmaScore: 100,
    sessionsPlayed: 10,
    hoursPlayed: 120,
    onTimeCount: 10,
    lateCount: 0,
    noShowCount: 0,
    currentStreak: 3,
    activeTitle: 'Reloj Suizo',
    weeklySchedule: makeDefaultWeeklySchedule(),
    dailyOverrides: {},
    categoryPreferences: {},
    ...overrides,
  };
}

describe('PVJ-6D Player Categorization Engine', () => {
  describe('Step 1: Game Vectorization g_i (Matrix M + tagVotes)', () => {
    it('computes normalized 6D vectors weighted by relative tag votes and capped at [0, 1]', () => {
      const vec = computeGameVector6D({
        name: 'Custom Competitive Arena',
        tagVotes: {
          Competitive: 1000,
          Automation: 200,
        },
      });

      // raw = 1.0 * [1.0, 0.3, 0, 0, 0.1, 0.2] + 0.2 * [0, 1.0, 0.6, 0, 0.3, 0]
      //     = [1.0, 0.5, 0.12, 0, 0.16, 0.2], max = 1.0
      expect(vec.D1_agonia).toBeCloseTo(1.0, 4);
      expect(vec.D2_ingenio).toBeCloseTo(0.5, 4);
      expect(vec.D3_expresion).toBeCloseTo(0.12, 4);
      expect(vec.D4_narrativa).toBe(0);
      expect(vec.D5_acumulacion).toBeCloseTo(0.16, 4);
      expect(vec.D6_sinergia).toBeCloseTo(0.2, 4);
    });

    it('normalizes upper bound so at least one dimension equals 1.0 when matching tags exist', () => {
      const factorioVec = computeGameVector6D({
        appId: 427520,
        name: 'Factorio',
      });
      const maxVal = Math.max(...PVJ_DIMENSION_KEYS.map((k) => factorioVec[k]));
      expect(maxVal).toBeCloseTo(1.0, 5);
      expect(factorioVec.D2_ingenio).toBeCloseTo(1.0, 4);
    });
  });

  describe('Step 2: Shannon Entropy & Specificity Factor omega_i', () => {
    it('returns entropyH = 1 and specificityOmega = 0 for a perfectly uniform 6D vector', () => {
      const uniform: PvjVector6D = {
        D1_agonia: 1,
        D2_ingenio: 1,
        D3_expresion: 1,
        D4_narrativa: 1,
        D5_acumulacion: 1,
        D6_sinergia: 1,
      };
      const res = computeGameSpecificityOmega(uniform);
      expect(res.entropyH).toBeCloseTo(1, 5);
      expect(res.specificityOmega).toBeCloseTo(0, 5);
    });

    it('returns entropyH = 0 and specificityOmega = 1 for a 100% single-dimension game', () => {
      const single: PvjVector6D = {
        D1_agonia: 0,
        D2_ingenio: 1,
        D3_expresion: 0,
        D4_narrativa: 0,
        D5_acumulacion: 0,
        D6_sinergia: 0,
      };
      const res = computeGameSpecificityOmega(single);
      expect(res.entropyH).toBeCloseTo(0, 5);
      expect(res.specificityOmega).toBeCloseTo(1, 5);
      expect(res.dominantDimension).toBe('D2_ingenio');
    });

    it('assigns higher specificity omega to niche games than wildcard sandbox games', () => {
      const nicheVec = computeGameVector6D({ appId: 730, name: 'Counter-Strike 2' });
      const wildcardVec: PvjVector6D = {
        D1_agonia: 0.9,
        D2_ingenio: 0.75,
        D3_expresion: 0.95,
        D4_narrativa: 0.85,
        D5_acumulacion: 0.85,
        D6_sinergia: 0.95,
      };

      const nicheOmega = computeGameSpecificityOmega(nicheVec).specificityOmega;
      const wildcardOmega = computeGameSpecificityOmega(wildcardVec).specificityOmega;
      expect(nicheOmega).toBeGreaterThan(wildcardOmega);
      expect(wildcardOmega).toBeLessThan(0.35);
    });
  });

  describe('Step 3: Logarithmic Time Weight W_i & Modulators', () => {
    it('discards noise games under 1 hour (t_i < 60 mins)', () => {
      expect(computeLogarithmicTimeWeightW({ hours: 0 })).toBe(0);
      expect(computeLogarithmicTimeWeightW({ hours: 0.99 })).toBe(0);
      expect(computeLogarithmicTimeWeightW({ hours: 1 })).toBeGreaterThan(0);
    });

    it('matches ln(1+h) + 0.5*sqrt(h) + 1.5*ln(1+h_rec) and applies Podium/Rating/Burnout modulators', () => {
      const base = computeLogarithmicTimeWeightW({ hours: 100, recentHours: 10 });
      const expectedBase = Math.log(101) + 0.5 * Math.sqrt(100) + 1.5 * Math.log(11);
      expect(base).toBeCloseTo(expectedBase, 5);

      expect(
        computeLogarithmicTimeWeightW({ hours: 100, recentHours: 10, podiumRank: 1 })
      ).toBeCloseTo(expectedBase * 1.35, 5);
      expect(
        computeLogarithmicTimeWeightW({ hours: 100, recentHours: 10, podiumRank: 2 })
      ).toBeCloseTo(expectedBase * 1.25, 5);
      expect(
        computeLogarithmicTimeWeightW({ hours: 100, recentHours: 10, podiumRank: 3 })
      ).toBeCloseTo(expectedBase * 1.15, 5);

      expect(
        computeLogarithmicTimeWeightW({ hours: 100, recentHours: 10, rating: 5 })
      ).toBeCloseTo(expectedBase * 1.25, 5);
      expect(
        computeLogarithmicTimeWeightW({ hours: 100, recentHours: 10, rating: 1 })
      ).toBeCloseTo(expectedBase * 0.15, 5);
      expect(
        computeLogarithmicTimeWeightW({ hours: 100, recentHours: 10, burnedOut: true })
      ).toBeCloseTo(expectedBase * 0.25, 5);
    });

    it('prevents a single 2000h game from eclipsing 15 distinct 40h games', () => {
      const weight2000h = computeLogarithmicTimeWeightW({ hours: 2000 });
      const fifteen40h = 15 * computeLogarithmicTimeWeightW({ hours: 40 });
      expect(fifteen40h).toBeGreaterThan(weight2000h);
    });
  });

  describe('Steps 4–6: Full Pipeline, Bayesian Re-contextualization & Pending Hours', () => {
    it('excludes <1h chosen games into pending_hours_games_count and keeps valid outputs normalized', () => {
      const catalog: Game[] = [
        {
          id: 'cat-cs2',
          name: 'Counter-Strike 2',
          category: 'Shooter Táctico',
          tags: ['steam:730', 'FPS', 'Competitive', 'Tactical Shooter'],
          minPlayers: 1,
          maxPlayers: 5,
          coverUrl: '',
          averageDurationMins: 45,
          addedBy: 'player-1',
        },
        {
          id: 'cat-no-hours',
          name: 'Valorant',
          category: 'Shooter Táctico',
          tags: ['FPS', 'Competitive'],
          minPlayers: 1,
          maxPlayers: 5,
          coverUrl: '',
          averageDurationMins: 40,
          addedBy: 'player-1',
        },
      ];

      const prefs: UserGamePreference[] = [
        { userId: 'player-1', gameId: 'cat-cs2', plays: true, rating: 5, hoursPlayed: 320 },
        { userId: 'player-1', gameId: 'cat-no-hours', plays: true, rating: 4 }, // 0h -> pending!
      ];

      const player = makeMockPlayer({
        steamProfile: {
          steamId64: '76561198000000001',
          profileUrl: 'https://steamcommunity.com/id/tester',
          personaName: 'Tester',
          avatarUrl: '',
          lastSyncedAt: new Date().toISOString(),
          totalHours: 320.5,
          considerableGamesCount: 1,
          ownedGames: [
            makeMockSteamGame({
              appId: 730,
              name: 'Counter-Strike 2',
              playtimeHours: 320,
              playtimeRecentHours: 12,
              tags: ['FPS', 'Competitive', 'Tactical Shooter'],
              userRating: 5,
            }),
            makeMockSteamGame({
              appId: 999999,
              name: 'Trial Game',
              playtimeHours: 0.5, // < 1h noise!
              tags: ['Puzzle'],
            }),
          ],
        },
      });

      const res = computePlayerPvj6dProfile(player, prefs, catalog);

      expect(res.valid_games_analyzed).toBe(1);
      expect(res.pending_hours_games_count).toBe(1);
      expect(res.total_hours_analyzed).toBe(320);

      const sumP = PVJ_DIMENSION_KEYS.reduce(
        (acc, key) => acc + res.vectors.relative_distribution_P[key],
        0
      );
      expect(sumP).toBeCloseTo(100, 1);

      const maxS = Math.max(
        ...PVJ_DIMENSION_KEYS.map((key) => res.vectors.radar_scores_S[key])
      );
      expect(maxS).toBeCloseTo(100, 1);
      expect(res.classification.primary_dimension).toBe('D1_agonia');
    });

    it('projects wildcard low-omega games onto the player prior in Step 5', () => {
      // Two players both have 400h in a low-specificity Wildcard Sandbox game,
      // but Player A has pure niche Ingenio (Factorio) while Player B has pure niche Agonía (CS2).
      const wildcardGame: SteamOwnedGame = makeMockSteamGame({
        appId: 888881,
        name: 'Omni Sandbox',
        playtimeHours: 400,
        tagVotes: {
          Competitive: 800,
          Automation: 800,
          'Story Rich': 800,
          'Looter Shooter': 800,
          'Co-op': 800,
          Sandbox: 800,
        },
      });

      const omegaWildcard = computeGameSpecificityOmega(
        computeGameVector6D(wildcardGame)
      ).specificityOmega;
      expect(omegaWildcard).toBeLessThan(0.35);

      const makeSteam = (games: SteamOwnedGame[]) => ({
        steamId64: '76561198000000002',
        profileUrl: '',
        personaName: 'P',
        avatarUrl: '',
        lastSyncedAt: new Date().toISOString(),
        totalHours: 600,
        considerableGamesCount: games.length,
        ownedGames: games,
      });

      const playerIngenio = makeMockPlayer({
        id: 'p-ingenio',
        steamProfile: makeSteam([
          wildcardGame,
          makeMockSteamGame({
            appId: 427520,
            name: 'Factorio',
            playtimeHours: 200,
            tagVotes: { Automation: 1000, Logistics: 900, Strategy: 800 },
          }),
        ]),
      });

      const playerAgonia = makeMockPlayer({
        id: 'p-agonia',
        steamProfile: makeSteam([
          wildcardGame,
          makeMockSteamGame({
            appId: 730,
            name: 'Counter-Strike 2',
            playtimeHours: 200,
            tagVotes: { Competitive: 1000, FPS: 950, 'Arena Shooter': 900 },
          }),
        ]),
      });

      const resIngenio = computePlayerPvj6dProfile(playerIngenio, [], []);
      const resAgonia = computePlayerPvj6dProfile(playerAgonia, [], []);

      expect(resIngenio.classification.primary_dimension).toBe('D2_ingenio');
      expect(resAgonia.classification.primary_dimension).toBe('D1_agonia');
    });
  });

  describe('Section 4 & 5: Classification Thresholds, Symmetry & Strict JSON Contract', () => {
    it('detects PURE archetype when P_(1) >= 32% and (P_(1) - P_(2)) >= 10%', () => {
      const result = classifyPvjVectorP({
        D1_agonia: 42,
        D2_ingenio: 20,
        D3_expresion: 10,
        D4_narrativa: 10,
        D5_acumulacion: 9,
        D6_sinergia: 9,
      });
      expect(result.type).toBe('PURE');
      expect(result.primary_dimension).toBe('D1_agonia');
      expect(result.secondary_dimension).toBeNull();
      expect(result.archetype_name).toBe('El Gladiador Puro');
    });

    it('detects POLYMATH archetype when P_(1) < 22% and (P_(1) - P_(4)) < 8%', () => {
      const result = classifyPvjVectorP({
        D1_agonia: 19,
        D2_ingenio: 18,
        D3_expresion: 17,
        D4_narrativa: 16,
        D5_acumulacion: 15,
        D6_sinergia: 15,
      });
      expect(result.type).toBe('POLYMATH');
      expect(result.secondary_dimension).toBeNull();
      expect(result.archetype_name).toBe(POLYMATH_ARCHETYPE.name);
    });

    it('detects COMPOUND archetype and maintains full 6x6 matrix symmetry', () => {
      for (const a of PVJ_DIMENSION_KEYS) {
        for (const b of PVJ_DIMENSION_KEYS) {
          expect(ARCHETYPE_MATRIX_6X6[a][b].name).toBe(ARCHETYPE_MATRIX_6X6[b][a].name);
        }
      }

      const compound = classifyPvjVectorP({
        D1_agonia: 28,
        D2_ingenio: 12,
        D3_expresion: 10,
        D4_narrativa: 10,
        D5_acumulacion: 15,
        D6_sinergia: 25,
      });
      expect(compound.type).toBe('COMPOUND');
      expect(compound.primary_dimension).toBe('D1_agonia');
      expect(compound.secondary_dimension).toBe('D6_sinergia');
      expect(compound.archetype_name).toBe('Comandante de Escuadrón');
    });

    it('builds the strict Section 5 JSON contract and UI badge', () => {
      const player = makeMockPlayer({
        tasteProfile: {
          topMultiplayerGames: [
            {
              rank: 1,
              gameId: 'cs2',
              steamAppId: 730,
              name: 'Counter-Strike 2',
              coverUrl: '',
              category: 'Shooter Táctico',
              tags: ['Competitive', 'Tactical Shooter', 'FPS'],
              minPlayers: 1,
              maxPlayers: 5,
              isMultiplayer: true,
              source: 'catalog',
              hoursPlayed: 450,
            },
          ],
          topSingleplayerGames: [],
          externalGames: [],
          updatedAt: new Date().toISOString(),
        },
      });

      const pvj = computePlayerPvj6dProfile(player, [], []);
      const contract = buildStrictPvjContractJson(pvj);

      expect(Object.keys(contract).sort()).toEqual([
        'classification',
        'steam_id',
        'top_influencing_games',
        'total_hours_analyzed',
        'valid_games_analyzed',
        'vectors',
      ]);
      expect(contract.valid_games_analyzed).toBe(1);
      expect(contract.top_influencing_games[0]).toMatchObject({
        app_id: 730,
        name: 'Counter-Strike 2',
        hours: 450,
      });

      const badge = getPlayerArchetypeBadge(player, [], []);
      expect(badge.hasData).toBe(true);
      expect(badge.name).toBe(pvj.classification.archetype_name);
    });
  });

  describe('Non-game Steam utility exclusion in PVJ-6D (Wallpaper Engine, Software, Utilities)', () => {
    it('completely excludes Wallpaper Engine and Steam utilities from PVJ-6D profiling', () => {
      const wpOnlyPlayer = makeMockPlayer({
        steamProfile: {
          steamId64: '76561198000000201',
          profileUrl: '',
          personaName: 'WPOnly',
          avatarUrl: '',
          lastSyncedAt: new Date().toISOString(),
          totalHours: 1500,
          considerableGamesCount: 1,
          ownedGames: [
            {
              appId: 431960,
              name: 'Wallpaper Engine',
              playtimeHours: 1500,
              playtimeRecentHours: 50,
              headerImageUrl: '',
              genres: ['Utilities'],
              tags: ['Utilities', 'Software', 'Anime', 'Sandbox'],
              tagVotes: { Utilities: 1000, Software: 900, Anime: 850, Sandbox: 700 },
              isMultiplayer: false,
              minPlayers: 1,
              maxPlayers: 1,
              suggestedRating: 5,
            },
          ],
        },
      });

      const wpOnlyPvj = computePlayerPvj6dProfile(wpOnlyPlayer, [], []);
      expect(wpOnlyPvj.valid_games_analyzed).toBe(0);
      expect(wpOnlyPvj.total_hours_analyzed).toBe(0);
      expect(wpOnlyPvj.top_influencing_games).toHaveLength(0);

      const csSteamGame: SteamOwnedGame = {
        appId: 730,
        name: 'Counter-Strike 2',
        playtimeHours: 200,
        playtimeRecentHours: 12,
        headerImageUrl: '',
        genres: ['Action'],
        tags: ['FPS', 'Tactical', 'Competitive', 'Shooter'],
        tagVotes: { FPS: 900, Tactical: 800, Competitive: 750, Shooter: 700 },
        isMultiplayer: true,
        minPlayers: 1,
        maxPlayers: 5,
        suggestedRating: 5,
      };

      const controlPlayer = makeMockPlayer({
        steamProfile: {
          steamId64: '76561198000000202',
          profileUrl: '',
          personaName: 'CSControl',
          avatarUrl: '',
          lastSyncedAt: new Date().toISOString(),
          totalHours: 200,
          considerableGamesCount: 1,
          ownedGames: [csSteamGame],
        },
      });

      const contaminatedPlayer = makeMockPlayer({
        steamProfile: {
          steamId64: '76561198000000203',
          profileUrl: '',
          personaName: 'CSContaminated',
          avatarUrl: '',
          lastSyncedAt: new Date().toISOString(),
          totalHours: 1850,
          considerableGamesCount: 4,
          ownedGames: [
            {
              appId: 431960,
              name: 'Wallpaper Engine',
              playtimeHours: 1500,
              playtimeRecentHours: 80,
              headerImageUrl: '',
              genres: ['Utilities'],
              tags: ['Utilities', 'Software', 'Anime', 'Sandbox'],
              tagVotes: { Utilities: 1000, Software: 900, Anime: 850, Sandbox: 700 },
              isMultiplayer: false,
              minPlayers: 1,
              maxPlayers: 1,
              suggestedRating: 5,
            },
            {
              appId: 629520,
              name: 'Soundpad',
              playtimeHours: 120,
              playtimeRecentHours: 10,
              headerImageUrl: '',
              genres: ['Utilities'],
              tags: ['Utilities', 'Software'],
              isMultiplayer: false,
              minPlayers: 1,
              maxPlayers: 1,
              suggestedRating: 5,
            },
            {
              appId: 993090,
              name: 'Lossless Scaling',
              playtimeHours: 30,
              playtimeRecentHours: 5,
              headerImageUrl: '',
              genres: ['Utilities'],
              tags: ['Utilities', 'Software'],
              isMultiplayer: false,
              minPlayers: 1,
              maxPlayers: 1,
              suggestedRating: 5,
            },
            csSteamGame,
          ],
        },
        tasteProfile: {
          topMultiplayerGames: [],
          topSingleplayerGames: [
            {
              rank: 1,
              gameId: 'steam-431960',
              steamAppId: 431960,
              name: 'Wallpaper Engine',
              coverUrl: '',
              category: 'Software',
              tags: ['Utilities', 'Anime', 'Sandbox'],
              minPlayers: 1,
              maxPlayers: 1,
              isMultiplayer: false,
              source: 'steam',
              hoursPlayed: 1500,
            },
          ],
          externalGames: [
            {
              gameId: 'ext-ds',
              name: 'Counter-Strike 2 Dedicated Server',
              platform: 'Otro Launcher',
              coverUrl: '',
              category: 'Utilities',
              tags: ['Utilities'],
              minPlayers: 1,
              maxPlayers: 1,
              isMultiplayer: false,
              rating: 5,
              hoursPlayedEstimate: 300,
            },
          ],
          updatedAt: new Date().toISOString(),
        },
      });

      const controlPvj = computePlayerPvj6dProfile(controlPlayer, [], []);
      const contaminatedPvj = computePlayerPvj6dProfile(contaminatedPlayer, [], []);

      expect(contaminatedPvj.valid_games_analyzed).toBe(1);
      expect(contaminatedPvj.total_hours_analyzed).toBe(200);
      expect(contaminatedPvj.top_influencing_games.map((g) => g.app_id)).toEqual([730]);
      expect(contaminatedPvj.vectors).toEqual(controlPvj.vectors);
      expect(contaminatedPvj.classification.archetype_name).toBe(
        controlPvj.classification.archetype_name
      );
    });
  });

  describe('Audit Fixes: No-Steam zero-hour fallback & Steam playsOverride exclusion', () => {
    it('categorizes a player who picked Podium / external / catalog games without typing hours (Fix #1)', () => {
      const catalog: Game[] = [
        {
          id: 'cat-val',
          name: 'Valorant',
          category: 'Shooter Táctico',
          tags: ['FPS', 'Competitive', 'Tactical Shooter'],
          minPlayers: 1,
          maxPlayers: 5,
          coverUrl: '',
          averageDurationMins: 40,
          addedBy: 'player-no-steam',
        },
      ];

      const player = makeMockPlayer({
        id: 'player-no-steam',
        tasteProfile: {
          topMultiplayerGames: [
            {
              rank: 1,
              gameId: 'cat-val',
              name: 'Valorant',
              coverUrl: '',
              category: 'Shooter Táctico',
              tags: ['FPS', 'Competitive', 'Tactical Shooter'],
              minPlayers: 1,
              maxPlayers: 5,
              isMultiplayer: true,
              source: 'catalog',
            },
          ],
          topSingleplayerGames: [],
          externalGames: [
            {
              gameId: 'ext-cs2',
              steamAppId: 730,
              name: 'Counter-Strike 2',
              platform: 'Otro Launcher',
              coverUrl: '',
              category: 'Shooter Táctico',
              tags: ['FPS', 'Competitive', 'Tactical Shooter'],
              minPlayers: 1,
              maxPlayers: 5,
              isMultiplayer: true,
              rating: 5,
            },
          ],
          updatedAt: new Date().toISOString(),
        },
      });

      const prefs: UserGamePreference[] = [
        { userId: 'player-no-steam', gameId: 'cat-val', plays: true, rating: 5 },
      ];

      const pvj = computePlayerPvj6dProfile(player, prefs, catalog);

      expect(pvj.valid_games_analyzed).toBe(2);
      expect(pvj.total_hours_analyzed).toBe(85); // 60h Top #1 + 25h external without hours
      expect(pvj.classification.primary_dimension).toBe('D1_agonia');
      expect(pvj.classification.archetype_name).not.toContain('Sin Categorizar');
    });

    it('excludes Steam owned games unmarked with playsOverride: false from PVJ-6D (Fix #4)', () => {
      const player = makeMockPlayer({
        steamProfile: {
          steamId64: '76561198000000401',
          profileUrl: '',
          personaName: 'Unmarker',
          avatarUrl: '',
          lastSyncedAt: new Date().toISOString(),
          totalHours: 500,
          considerableGamesCount: 2,
          ownedGames: [
            makeMockSteamGame({
              appId: 730,
              name: 'Counter-Strike 2',
              playtimeHours: 400,
              tags: ['FPS', 'Competitive', 'Tactical Shooter'],
              playsOverride: false,
            }),
            makeMockSteamGame({
              appId: 427520,
              name: 'Factorio',
              playtimeHours: 100,
              tags: ['Automation', 'Logistics', 'Strategy'],
            }),
          ],
        },
      });

      const pvj = computePlayerPvj6dProfile(player, [], []);

      expect(pvj.valid_games_analyzed).toBe(1);
      expect(pvj.total_hours_analyzed).toBe(100);
      expect(pvj.top_influencing_games.map((g) => g.app_id)).toEqual([427520]);
      expect(pvj.classification.primary_dimension).toBe('D2_ingenio');
    });
  });
});
