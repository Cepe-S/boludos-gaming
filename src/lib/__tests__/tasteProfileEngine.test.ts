import { describe, expect, it } from 'vitest';
import {
  GLOBAL_GAMES_KNOWLEDGE_BASE,
  MAX_AUTO_SELECTED_STEAM_GAMES,
  TASTE_DIMENSIONS,
  buildPlayerTasteProfile,
  buildPlayerTasteVector,
  buildUnifiedGameSelectorList,
  computeSuggestedRatingFromHours,
  enrichAndSortSteamLibrary,
  extractTopDimensions,
  generateGroupGameRecommendations,
  inferGameMetadataAndVector,
  isConsiderableSteamGame,
  isNonGameSteamApp,
  scoreGameForPlayer,
} from '../tasteProfileEngine';
import { Game, PlayerProfile, TasteDimensionKey, UserGamePreference } from '../../types/domain';

describe('Taste Profile Engine & Group Recommendations', () => {
  // Mock Games Catalog
  const mockCatalog: Game[] = [
    {
      id: 'cat-cs2',
      name: 'Counter-Strike 2',
      category: 'Shooter Táctico',
      tags: ['FPS', 'Competitivo', 'Táctico'],
      minPlayers: 1,
      maxPlayers: 5,
      coverUrl: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/730/header.jpg',
      averageDurationMins: 45,
      addedBy: 'user-santi',
    },
    {
      id: 'cat-lethal',
      name: 'Lethal Company',
      category: 'Co-op Horror',
      tags: ['Terror', 'Co-op', 'Comedia'],
      minPlayers: 1,
      maxPlayers: 4,
      coverUrl: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1966720/header.jpg',
      averageDurationMins: 35,
      addedBy: 'user-santi',
    },
    {
      id: 'cat-helldivers2',
      name: 'Helldivers 2',
      category: 'Co-op Acción',
      tags: ['PVE', 'Tercera Persona', 'Sci-Fi'],
      minPlayers: 1,
      maxPlayers: 4,
      coverUrl: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/553850/header.jpg',
      averageDurationMins: 40,
      addedBy: 'user-tincho',
    },
    {
      id: 'cat-zomboid',
      name: 'Project Zomboid',
      category: 'Survival Sandbox',
      tags: ['Supervivencia', 'Zombies', 'Hardcore'],
      minPlayers: 1,
      maxPlayers: 16,
      coverUrl: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/108600/header.jpg',
      averageDurationMins: 60,
      addedBy: 'user-lucho',
    },
  ];

  // Helper to create a base mock player
  const createMockPlayer = (id: string, name: string): PlayerProfile => ({
    id,
    discordId: `discord-${id}`,
    discordUsername: `${name.toLowerCase()}_disc`,
    displayName: name,
    avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`,
    karmaScore: 90,
    sessionsPlayed: 10,
    hoursPlayed: 40,
    onTimeCount: 8,
    lateCount: 2,
    noShowCount: 0,
    currentStreak: 4,
    activeTitle: '🫡 Soldado Fiel',
  });

  // ==========================================================================
  // 1. TASTE DIMENSIONS & KNOWLEDGE BASE INTEGRITY
  // ==========================================================================
  describe('Dimensions & Knowledge Base Integrity', () => {
    it('defines exactly 32 dimensions across the 4 canonical groups', () => {
      expect(TASTE_DIMENSIONS).toHaveLength(32);

      const groups = new Set(TASTE_DIMENSIONS.map((d) => d.group));
      expect(groups).toEqual(new Set(['genre', 'pace', 'social', 'aesthetic']));

      const genreDims = TASTE_DIMENSIONS.filter((d) => d.group === 'genre');
      const paceDims = TASTE_DIMENSIONS.filter((d) => d.group === 'pace');
      const socialDims = TASTE_DIMENSIONS.filter((d) => d.group === 'social');
      const aestheticDims = TASTE_DIMENSIONS.filter((d) => d.group === 'aesthetic');

      expect(genreDims).toHaveLength(12);
      expect(paceDims).toHaveLength(6);
      expect(socialDims).toHaveLength(6);
      expect(aestheticDims).toHaveLength(8);

      // Verify all have descriptive Spanish labels
      for (const dim of TASTE_DIMENSIONS) {
        expect(dim.label.length).toBeGreaterThan(3);
      }
    });

    it('contains at least 75 well-known PC titles in GLOBAL_GAMES_KNOWLEDGE_BASE', () => {
      expect(GLOBAL_GAMES_KNOWLEDGE_BASE.length).toBeGreaterThanOrEqual(75);

      // Must cover Steam multiplayer, external launchers, and iconic singleplayer
      const cs2 = GLOBAL_GAMES_KNOWLEDGE_BASE.find((g) => g.steamAppId === 730);
      const val = GLOBAL_GAMES_KNOWLEDGE_BASE.find((g) => g.name === 'Valorant');
      const elden = GLOBAL_GAMES_KNOWLEDGE_BASE.find((g) => g.steamAppId === 1245620);

      expect(cs2).toBeDefined();
      expect(val).toBeDefined();
      expect(elden).toBeDefined();

      // Check weights validity
      for (const game of GLOBAL_GAMES_KNOWLEDGE_BASE) {
        expect(game.name).toBeTruthy();
        expect(game.coverUrl).toBeTruthy();
        expect(game.minPlayers).toBeGreaterThanOrEqual(1);
        expect(game.maxPlayers).toBeGreaterThanOrEqual(game.minPlayers);
        expect(Object.keys(game.weights).length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // 2. SUGGESTED RATING FROM HOURS & CONSIDERABLE GAME SORTING
  // ==========================================================================
  describe('Playtime Percentiles & Library Enrichment', () => {
    it('computes suggested rating fairly for casual players with max 35h', () => {
      const casualHours = [35, 12, 4, 1, 0];
      // Top played title in a casual library gets 5★
      expect(computeSuggestedRatingFromHours(35, casualHours)).toBe(5);
      // 12 hours gets 3★
      expect(computeSuggestedRatingFromHours(12, casualHours)).toBe(3);
      // 4 hours gets 2★
      expect(computeSuggestedRatingFromHours(4, casualHours)).toBe(2);
      // 0 hours gets 2★
      expect(computeSuggestedRatingFromHours(0, casualHours)).toBe(2);
    });

    it('computes suggested rating correctly for 2000h veterans', () => {
      const veteranHours = [2200, 850, 200, 50, 8];
      expect(computeSuggestedRatingFromHours(2200, veteranHours)).toBe(5);
      expect(computeSuggestedRatingFromHours(200, veteranHours)).toBe(5); // >= 150h
      expect(computeSuggestedRatingFromHours(50, veteranHours)).toBe(4); // >= 45h
      expect(computeSuggestedRatingFromHours(8, veteranHours)).toBe(2);
    });

    it('isConsiderableSteamGame flags games with >= 10h, recent hours, or top 25 with >= 2h', () => {
      // >= 10h is always considerable regardless of rank
      expect(isConsiderableSteamGame({ playtimeHours: 10, playtimeRecentHours: 0 }, 50)).toBe(true);
      // Any game with recent playtime > 0 is considerable
      expect(isConsiderableSteamGame({ playtimeHours: 1, playtimeRecentHours: 0.5 }, 99)).toBe(true);
      // Top 25 rank with >= 2h is considerable
      expect(isConsiderableSteamGame({ playtimeHours: 2.5, playtimeRecentHours: 0 }, 10)).toBe(true);
      // Beyond top 25 with < 10h and no recent playtime is NOT considerable
      expect(isConsiderableSteamGame({ playtimeHours: 4, playtimeRecentHours: 0 }, 30)).toBe(false);
      expect(isConsiderableSteamGame({ playtimeHours: 0.5, playtimeRecentHours: 0 }, 2)).toBe(false);
    });

    it('enrichAndSortSteamLibrary sorts considerable games first descending by score', () => {
      const rawGames = [
        {
          appId: 101,
          name: 'Tiny Game Unplayed',
          playtimeHours: 0.2,
          playtimeRecentHours: 0,
          headerImageUrl: 'https://example.com/101.jpg',
        },
        {
          appId: 102,
          name: 'Veteran FPS',
          playtimeHours: 120,
          playtimeRecentHours: 10,
          headerImageUrl: 'https://example.com/102.jpg',
        },
        {
          appId: 103,
          name: 'Recent Indie Hit',
          playtimeHours: 5,
          playtimeRecentHours: 3.5,
          headerImageUrl: 'https://example.com/103.jpg',
        },
        {
          appId: 104,
          name: 'Old Forgotten Game',
          playtimeHours: 15,
          playtimeRecentHours: 0,
          headerImageUrl: 'https://example.com/104.jpg',
        },
      ];

      const result = enrichAndSortSteamLibrary(rawGames);

      expect(result.totalHours).toBe(140.2);
      expect(result.considerableGamesCount).toBe(3); // 102, 103 (recent), 104 (>=10h)

      // First game must be Veteran FPS (highest hours + recent)
      expect(result.games[0].appId).toBe(102);
      // Unplayed game should be at the end
      expect(result.games[result.games.length - 1].appId).toBe(101);

      // Verify both games and ownedGames arrays are populated
      expect(result.games).toHaveLength(4);
      expect(result.ownedGames).toHaveLength(4);
    });
  });

  // ==========================================================================
  // 3. INFERENCE ENGINE (KB vs Unlisted Steam Games)
  // ==========================================================================
  describe('Game Feature Vector Inference', () => {
    it('retrieves pre-compiled vector for games in knowledge base', () => {
      const result = inferGameMetadataAndVector({ name: 'Counter-Strike 2', steamAppId: 730 });
      expect(result.category).toBe('Shooter Táctico');
      expect(result.vector.tactical_shooter).toBe(1.0);
      expect(result.vector.pvp_competitive).toBe(1.0);
    });

    it('infers accurate 32D features for an unlisted custom Steam game using tags and genres', () => {
      const customGame = inferGameMetadataAndVector({
        name: 'Space Station Extraction Horror',
        rawTags: ['Survival Horror', 'Co-op', 'Sci-Fi', 'FPS', 'Tactical'],
        rawGenres: ['Action', 'Indie'],
      });

      expect(customGame.vector.coop_horror).toBeGreaterThan(0.7);
      expect(customGame.vector.horror_tension).toBeGreaterThan(0.7);
      expect(customGame.vector.scifi_futuristic).toBeGreaterThan(0.7);
      expect(customGame.vector.coop_pve_action).toBeGreaterThan(0.7);
      expect(customGame.isMultiplayer).toBe(true);
    });
  });

  // ==========================================================================
  // 4. UNIT L2 NORMALIZATION & EQUALITY IN GROUP RECOMMENDATIONS
  // ==========================================================================
  describe('Mathematical Normalization & Equal-Weight Aggregation', () => {
    it('produces unit L2 norm (magnitude 1.0) for every player vector regardless of hours', () => {
      // 5000h Veteran
      const veteran = createMockPlayer('user-vet', 'VeteranGamer');
      veteran.steamProfile = {
        steamId64: '76561198000000001',
        profileUrl: 'https://steamcommunity.com/id/vet',
        personaName: 'VeteranGamer',
        avatarUrl: '',
        lastSyncedAt: new Date().toISOString(),
        totalHours: 5000,
        considerableGamesCount: 15,
        ownedGames: [
          {
            appId: 730,
            name: 'Counter-Strike 2',
            playtimeHours: 3500,
            playtimeRecentHours: 40,
            headerImageUrl: '',
            genres: ['Action'],
            tags: ['FPS', 'Competitivo'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            suggestedRating: 5,
          },
          {
            appId: 570,
            name: 'Dota 2',
            playtimeHours: 1500,
            playtimeRecentHours: 0,
            headerImageUrl: '',
            genres: ['Action'],
            tags: ['MOBA'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            suggestedRating: 5,
          },
        ],
      };

      // 15h Casual Friend
      const casual = createMockPlayer('user-cas', 'CasualFriend');
      casual.steamProfile = {
        steamId64: '76561198000000002',
        profileUrl: 'https://steamcommunity.com/id/cas',
        personaName: 'CasualFriend',
        avatarUrl: '',
        lastSyncedAt: new Date().toISOString(),
        totalHours: 15,
        considerableGamesCount: 2,
        ownedGames: [
          {
            appId: 1966720,
            name: 'Lethal Company',
            playtimeHours: 12,
            playtimeRecentHours: 4,
            headerImageUrl: '',
            genres: ['Action'],
            tags: ['Co-op', 'Terror'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 4,
            suggestedRating: 5,
          },
        ],
      };

      const vetVector = buildPlayerTasteVector(veteran, [], mockCatalog);
      const casVector = buildPlayerTasteVector(casual, [], mockCatalog);

      // Verify ||v||_2 = 1.0 (magnitude is exactly 1.0)
      const computeL2Norm = (v: Record<TasteDimensionKey, number>) => {
        let sumSq = 0;
        for (const dim of TASTE_DIMENSIONS) {
          sumSq += (v[dim.key] || 0) ** 2;
        }
        return Math.sqrt(sumSq);
      };

      expect(computeL2Norm(vetVector)).toBeCloseTo(1.0, 5);
      expect(computeL2Norm(casVector)).toBeCloseTo(1.0, 5);
    });

    it('gives 5000h veteran and 15h casual friend equal 50% weight in group recommendations', () => {
      const veteran = createMockPlayer('user-vet', 'VeteranGamer');
      veteran.categoryPreferences = { 'Shooter Táctico': 'like', 'Co-op Horror': 'dislike' };
      veteran.tasteProfile = {
        topMultiplayerGames: [
          {
            rank: 1,
            gameId: 'cat-cs2',
            name: 'Counter-Strike 2',
            steamAppId: 730,
            coverUrl: '',
            category: 'Shooter Táctico',
            tags: ['FPS', 'Competitivo'],
            minPlayers: 1,
            maxPlayers: 5,
            isMultiplayer: true,
            source: 'catalog',
          },
        ],
        topSingleplayerGames: [],
        externalGames: [],
        updatedAt: new Date().toISOString(),
      };

      const casual = createMockPlayer('user-cas', 'CasualFriend');
      casual.categoryPreferences = { 'Shooter Táctico': 'dislike', 'Co-op Horror': 'like' };
      casual.tasteProfile = {
        topMultiplayerGames: [
          {
            rank: 1,
            gameId: 'cat-lethal',
            name: 'Lethal Company',
            steamAppId: 1966720,
            coverUrl: '',
            category: 'Co-op Horror',
            tags: ['Terror', 'Co-op'],
            minPlayers: 1,
            maxPlayers: 4,
            isMultiplayer: true,
            source: 'catalog',
          },
        ],
        topSingleplayerGames: [],
        externalGames: [],
        updatedAt: new Date().toISOString(),
      };

      const targetPlayers = [veteran, casual];
      const recs = generateGroupGameRecommendations({
        targetPlayers,
        catalogGames: mockCatalog,
        preferences: [],
      });

      // Find CS2 and Lethal Company recommendations
      const cs2Rec = recs.readyToPlay.find((r) => r.name === 'Counter-Strike 2');
      const lethalRec = recs.readyToPlay.find((r) => r.name === 'Lethal Company');

      expect(cs2Rec).toBeDefined();
      expect(lethalRec).toBeDefined();

      if (cs2Rec && lethalRec) {
        // Veteran rates CS2 very high, casual rates CS2 lower
        const cs2VetBreakdown = cs2Rec.playerBreakdowns.find((b) => b.userId === veteran.id);
        const cs2CasBreakdown = cs2Rec.playerBreakdowns.find((b) => b.userId === casual.id);
        expect(cs2VetBreakdown?.affinityScore).toBeGreaterThan(85);
        expect(cs2CasBreakdown?.affinityScore).toBeLessThan(60);

        // Group score MUST be the exact arithmetic mean of the two breakdowns!
        const expectedCS2GroupScore = Math.round(
          ((cs2VetBreakdown?.affinityScore ?? 0) + (cs2CasBreakdown?.affinityScore ?? 0)) / 2
        );
        expect(cs2Rec.groupArithmeticScore).toBe(expectedCS2GroupScore);

        // Similarly for Lethal Company (casual loved it, veteran disliked it)
        const lethalVetBreakdown = lethalRec.playerBreakdowns.find((b) => b.userId === veteran.id);
        const lethalCasBreakdown = lethalRec.playerBreakdowns.find((b) => b.userId === casual.id);
        const expectedLethalGroupScore = Math.round(
          ((lethalVetBreakdown?.affinityScore ?? 0) + (lethalCasBreakdown?.affinityScore ?? 0)) / 2
        );
        expect(lethalRec.groupArithmeticScore).toBe(expectedLethalGroupScore);
      }
    });
  });

  // ==========================================================================
  // 5. PODIUM INFLUENCE: TOP 3 MULTIPLAYER & TOP 3 SINGLEPLAYER
  // ==========================================================================
  describe('Podium Rank Influence', () => {
    it('applies hierarchical weights to Top 3 Multiplayer (#1 > #2 > #3)', () => {
      const player = createMockPlayer('user-podium', 'PodiumMaster');
      player.tasteProfile = {
        topMultiplayerGames: [
          {
            rank: 1,
            gameId: 'cat-cs2',
            name: 'Counter-Strike 2',
            steamAppId: 730,
            coverUrl: '',
            category: 'Shooter Táctico',
            tags: ['FPS', 'Competitivo'],
            minPlayers: 1,
            maxPlayers: 5,
            isMultiplayer: true,
            source: 'catalog',
          },
          {
            rank: 2,
            gameId: 'cat-helldivers2',
            name: 'Helldivers 2',
            steamAppId: 553850,
            coverUrl: '',
            category: 'Co-op Acción',
            tags: ['PVE', 'Sci-Fi'],
            minPlayers: 1,
            maxPlayers: 4,
            isMultiplayer: true,
            source: 'catalog',
          },
          {
            rank: 3,
            gameId: 'cat-lethal',
            name: 'Lethal Company',
            steamAppId: 1966720,
            coverUrl: '',
            category: 'Co-op Horror',
            tags: ['Terror', 'Co-op'],
            minPlayers: 1,
            maxPlayers: 4,
            isMultiplayer: true,
            source: 'catalog',
          },
        ],
        topSingleplayerGames: [],
        externalGames: [],
        updatedAt: new Date().toISOString(),
      };

      const vector = buildPlayerTasteVector(player, [], mockCatalog);

      const score1 = scoreGameForPlayer(mockCatalog[0], player, vector, []); // CS2 (#1)
      const score2 = scoreGameForPlayer(mockCatalog[2], player, vector, []); // Helldivers 2 (#2)
      const score3 = scoreGameForPlayer(mockCatalog[1], player, vector, []); // Lethal Company (#3)

      expect(score1.affinityScore).toBeGreaterThanOrEqual(score2.affinityScore);
      expect(score2.affinityScore).toBeGreaterThanOrEqual(score3.affinityScore);
      expect(score1.matchingReasons.some((r) => r.includes('#1'))).toBe(true);
      expect(score2.matchingReasons.some((r) => r.includes('#2'))).toBe(true);
      expect(score3.matchingReasons.some((r) => r.includes('#3'))).toBe(true);
    });

    it('reflects singleplayer taste DNA in group profile', () => {
      const spPlayer = createMockPlayer('user-sp', 'StoryEnthusiast');
      spPlayer.tasteProfile = {
        topMultiplayerGames: [],
        topSingleplayerGames: [
          {
            rank: 1,
            gameId: 'sp-elden-ring',
            name: 'Elden Ring',
            steamAppId: 1245620,
            coverUrl: '',
            category: 'RPG / Aventura',
            tags: ['Souls-like', 'Fantasía Oscura', 'Mundo Abierto'],
            minPlayers: 1,
            maxPlayers: 1,
            isMultiplayer: false,
            source: 'steam',
          },
        ],
        externalGames: [],
        updatedAt: new Date().toISOString(),
      };

      const vector = buildPlayerTasteVector(spPlayer, [], mockCatalog);

      // Fantasy medieval & dark gritty dimensions should be prominent
      expect(vector.fantasy_medieval).toBeGreaterThan(0.2);
      expect(vector.dark_gritty).toBeGreaterThan(0.2);

      const topDims = extractTopDimensions(vector, 4);
      expect(topDims.some((d) => d.key === 'fantasy_medieval' || d.key === 'dark_gritty')).toBe(true);
    });
  });

  // ==========================================================================
  // 6. BURNOUT SUPPRESSION & GENRE DNA PRESERVATION
  // ==========================================================================
  describe('Burnout Detection & Suppression', () => {
    it('suppresses burnedOut games to affinity <= 15 while retaining underlying genre affinity', () => {
      const player = createMockPlayer('user-burnt', 'TiredSoldier');
      player.steamProfile = {
        steamId64: '76561198000000009',
        profileUrl: '',
        personaName: 'TiredSoldier',
        avatarUrl: '',
        lastSyncedAt: new Date().toISOString(),
        totalHours: 1200,
        considerableGamesCount: 5,
        ownedGames: [
          {
            appId: 730,
            name: 'Counter-Strike 2',
            playtimeHours: 1000,
            playtimeRecentHours: 0,
            headerImageUrl: '',
            genres: ['Action'],
            tags: ['FPS', 'Competitivo'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            suggestedRating: 5,
            burnedOut: true, // PLAYER IS TIRED OF CS2
          },
        ],
      };

      const vector = buildPlayerTasteVector(player, [], mockCatalog);

      // 1. Scoring the burned-out CS2 game directly
      const cs2Game = mockCatalog.find((g) => g.name === 'Counter-Strike 2')!;
      const breakdown = scoreGameForPlayer(cs2Game, player, vector, []);

      expect(breakdown.burnedOut).toBe(true);
      expect(breakdown.affinityScore).toBeLessThanOrEqual(15);
      expect(breakdown.matchingReasons.some((r) => r.toLowerCase().includes('burnout'))).toBe(true);

      // 2. But player should still have a small historical genre footprint preserved (capped at 0.2)
      expect(vector.tactical_shooter).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 7. DOUBLE RECOMMENDATION OUTPUT: READY TO PLAY & DISCOVERY
  // ==========================================================================
  describe('Double Recommendation Output', () => {
    it('outputs both readyToPlay (catalog) and discovery (knowledge base) recommendations', () => {
      const santi = createMockPlayer('user-santi', 'Santi');
      santi.categoryPreferences = {
        'Shooter Táctico': 'like',
        'Co-op Acción': 'like',
        'Survival Sandbox': 'like',
      };

      const tincho = createMockPlayer('user-tincho', 'Tincho');
      tincho.categoryPreferences = {
        'Shooter Táctico': 'like',
        'Co-op Acción': 'like',
      };

      const prefs: UserGamePreference[] = [
        { userId: santi.id, gameId: 'cat-cs2', plays: true, rating: 5 },
        { userId: tincho.id, gameId: 'cat-cs2', plays: true, rating: 4 },
        { userId: santi.id, gameId: 'cat-helldivers2', plays: true, rating: 5 },
        { userId: tincho.id, gameId: 'cat-helldivers2', plays: true, rating: 5 },
      ];

      const result = generateGroupGameRecommendations({
        targetPlayers: [santi, tincho],
        catalogGames: mockCatalog,
        preferences: prefs,
        maxResultsPerCategory: 5,
      });

      // Check structure
      expect(result).toHaveProperty('readyToPlay');
      expect(result).toHaveProperty('discovery');
      expect(result).toHaveProperty('all');

      // Ready to play should come strictly from mockCatalog
      expect(result.readyToPlay.length).toBeGreaterThan(0);
      for (const rec of result.readyToPlay) {
        expect(rec.recommendationType).toBe('ready_to_play');
        expect(rec.catalogGameId).toBeDefined();
        expect(mockCatalog.some((c) => c.id === rec.catalogGameId)).toBe(true);
        expect(rec.groupArithmeticScore).toBeGreaterThanOrEqual(0);
        expect(rec.groupArithmeticScore).toBeLessThanOrEqual(100);
        expect(rec.playerBreakdowns).toHaveLength(2);
      }

      // Discovery should come from knowledge base and NOT be in mockCatalog
      expect(result.discovery.length).toBeGreaterThan(0);
      const catalogNames = new Set(mockCatalog.map((c) => c.name.toLowerCase()));
      for (const rec of result.discovery) {
        expect(rec.recommendationType).toBe('discovery');
        expect(catalogNames.has(rec.name.toLowerCase())).toBe(false);
        expect(rec.maxPlayers).toBeGreaterThanOrEqual(3);
        expect(rec.groupArithmeticScore).toBeGreaterThanOrEqual(0);
        expect(rec.groupArithmeticScore).toBeLessThanOrEqual(100);
      }

      // Check sorted descending by groupArithmeticScore
      for (let i = 0; i < result.readyToPlay.length - 1; i++) {
        expect(result.readyToPlay[i].groupArithmeticScore).toBeGreaterThanOrEqual(
          result.readyToPlay[i + 1].groupArithmeticScore
        );
      }
      for (let i = 0; i < result.discovery.length - 1; i++) {
        expect(result.discovery[i].groupArithmeticScore).toBeGreaterThanOrEqual(
          result.discovery[i + 1].groupArithmeticScore
        );
      }
    });

    it('buildPlayerTasteProfile constructs full player profile with topDimensions', () => {
      const player = createMockPlayer('user-profile-test', 'GamerTest');
      player.categoryPreferences = { 'Shooter Táctico': 'like', 'MOBA': 'like' };

      const profile = buildPlayerTasteProfile(player, [], mockCatalog);

      expect(profile).toBeDefined();
      expect(profile.featureVector).toBeDefined();
      expect(profile.topDimensions).toBeDefined();
      expect(profile.topDimensions!.length).toBeGreaterThan(0);
      expect(profile.updatedAt).toBeTruthy();
    });
  });

  // ==========================================================================
  // 8. UNIFIED GAME SELECTOR: DEDUPLICATION & STEAM-DRIVEN LIKELIHOOD ORDER
  // ==========================================================================
  describe('Unified Game Selector Ranking (buildUnifiedGameSelectorList)', () => {
    it('deduplicates games across Steam, Club Catalog, KB, and IGDB live candidates', () => {
      const player = createMockPlayer('user-dedup', 'Santi');
      player.steamProfile = {
        steamId64: '76561198000000100',
        profileUrl: 'https://steamcommunity.com/id/santi',
        personaName: 'Santi',
        avatarUrl: '',
        lastSyncedAt: new Date().toISOString(),
        totalHours: 420,
        considerableGamesCount: 1,
        ownedGames: [
          {
            appId: 730,
            name: 'Counter-Strike 2',
            playtimeHours: 420,
            playtimeRecentHours: 12,
            headerImageUrl: '',
            genres: ['Action'],
            tags: ['Shooter', 'Tactical', 'FPS'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            suggestedRating: 5,
          },
        ],
      };

      const unified = buildUnifiedGameSelectorList({
        player,
        allPreferences: [],
        catalogGames: mockCatalog, // Also contains Counter-Strike 2!
        discoveryGames: [
          {
            igdbId: 1372,
            appId: 730,
            name: 'Counter-Strike 2',
            category: 'Shooter Táctico',
            genres: ['Shooter'],
            tags: ['Competitive'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            source: 'igdb',
          },
        ],
      });

      const csMatches = unified.filter(
        (g) => g.name.toLowerCase() === 'counter-strike 2'
      );
      expect(csMatches).toHaveLength(1);
      expect(csMatches[0].ownedOnSteam).toBe(true);
      expect(csMatches[0].inClubCatalog).toBe(true);
      expect(csMatches[0].catalogGameId).toBe('cat-cs2');
      expect(csMatches[0].igdbId).toBe(1372);
      expect(csMatches[0].playtimeHours).toBe(420);
    });

    it('orders Steam considerable games first, then high-affinity non-Steam ahead of unrelated 0h Steam games, and sinks burnedOut last', () => {
      const tacticalPlayer = createMockPlayer('user-tactician', 'Tactician');
      tacticalPlayer.steamProfile = {
        steamId64: '76561198000000200',
        profileUrl: 'https://steamcommunity.com/id/tactician',
        personaName: 'Tactician',
        avatarUrl: '',
        lastSyncedAt: new Date().toISOString(),
        totalHours: 1250,
        considerableGamesCount: 2,
        ownedGames: [
          {
            appId: 730,
            name: 'Counter-Strike 2',
            playtimeHours: 800,
            playtimeRecentHours: 18,
            headerImageUrl: '',
            genres: ['Action'],
            tags: ['Shooter', 'FPS', 'Tactical', 'Competitive'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            suggestedRating: 5,
          },
          {
            appId: 359550,
            name: "Tom Clancy's Rainbow Six Siege",
            playtimeHours: 450,
            playtimeRecentHours: 0,
            headerImageUrl: '',
            genres: ['Action'],
            tags: ['Shooter', 'Tactical', 'FPS', 'Competitive'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            suggestedRating: 5,
            burnedOut: true, // Burned out -> must sink to the bottom!
          },
          {
            appId: 250760,
            name: 'Farming Simulator ZeroChill Edition',
            playtimeHours: 0,
            playtimeRecentHours: 0,
            headerImageUrl: '',
            genres: ['Simulation', 'Casual'],
            tags: ['Farming', 'Relaxing', 'Singleplayer'],
            isMultiplayer: false,
            minPlayers: 1,
            maxPlayers: 1,
            suggestedRating: 2,
          },
        ],
      };

      const unified = buildUnifiedGameSelectorList({
        player: tacticalPlayer,
        allPreferences: [],
        catalogGames: [],
        discoveryGames: [
          {
            igdbId: 999901,
            name: 'Valorant',
            platform: 'Riot Games',
            category: 'Shooter Táctico',
            genres: ['Shooter'],
            tags: ['Tactical FPS', 'Competitive', 'FPS'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            source: 'igdb',
          },
        ],
      });

      const csIndex = unified.findIndex((g) => g.name === 'Counter-Strike 2');
      const valorantIndex = unified.findIndex((g) => g.name === 'Valorant');
      const zeroHoursFarmingIndex = unified.findIndex(
        (g) => g.name === 'Farming Simulator ZeroChill Edition'
      );
      const burnedOutSiegeIndex = unified.findIndex(
        (g) => g.name === "Tom Clancy's Rainbow Six Siege"
      );

      expect(csIndex).toBe(0);
      expect(valorantIndex).toBeGreaterThan(csIndex);
      expect(valorantIndex).toBeLessThan(zeroHoursFarmingIndex);
      expect(burnedOutSiegeIndex).toBeGreaterThan(zeroHoursFarmingIndex);
    });
  });

  // ==========================================================================
  // 8. NON-GAME STEAM UTILITY EXCLUSION (WALLPAPER ENGINE / SOFTWARE / UTILITIES)
  // ==========================================================================
  describe('Non-game Steam utility exclusion (Wallpaper Engine, Software, Utilities)', () => {
    it('detects Wallpaper Engine and common utilities while keeping real games', () => {
      expect(isNonGameSteamApp({ appId: 431960, name: 'Wallpaper Engine' })).toBe(true);
      expect(isNonGameSteamApp({ appId: 999999, name: 'Wallpaper Engine' })).toBe(true);
      expect(
        isNonGameSteamApp({
          name: 'Custom Live Desktop',
          genres: ['Utilities'],
          tags: ['Utilities', 'Software', 'Anime', 'Sandbox'],
          tagVotes: { Utilities: 1000, Software: 900, Anime: 800, Sandbox: 600 },
        })
      ).toBe(true);

      expect(isNonGameSteamApp({ appId: 629520, name: 'Soundpad' })).toBe(true);
      expect(isNonGameSteamApp({ appId: 1366800, name: 'Crosshair X' })).toBe(true);
      expect(isNonGameSteamApp({ appId: 993090, name: 'Lossless Scaling' })).toBe(true);
      expect(isNonGameSteamApp({ appId: 1905180, name: 'OBS Studio' })).toBe(true);
      expect(isNonGameSteamApp({ appId: 250820, name: 'SteamVR' })).toBe(true);
      expect(isNonGameSteamApp({ name: 'Counter-Strike 2 Dedicated Server' })).toBe(true);
      expect(isNonGameSteamApp({ name: 'Hollow Knight - Official Soundtrack' })).toBe(true);

      expect(
        isNonGameSteamApp({
          appId: 730,
          name: 'Counter-Strike 2',
          genres: ['Action'],
          tags: ['FPS', 'Tactical', 'Competitive', 'Shooter'],
        })
      ).toBe(false);
      expect(
        isNonGameSteamApp({
          appId: 427520,
          name: 'Factorio',
          genres: ['Indie', 'Simulation', 'Strategy'],
          tags: ['Automation', 'Base Building', 'Resource Management'],
        })
      ).toBe(false);
      expect(
        isNonGameSteamApp({
          name: 'Minecraft',
          tags: ['Sandbox', 'Survival', 'Building', 'Multiplayer'],
        })
      ).toBe(false);
      expect(
        isNonGameSteamApp({
          appId: 4000,
          name: "Garry's Mod",
          genres: ['Indie', 'Simulation'],
          tags: ['Sandbox', 'Moddable', 'Multiplayer', 'Physics'],
        })
      ).toBe(false);
      expect(
        isNonGameSteamApp({
          appId: 105600,
          name: 'Terraria',
          genres: ['Action', 'Adventure', 'Indie', 'RPG'],
          tags: ['Open World Survival Craft', 'Sandbox', '2D'],
        })
      ).toBe(false);
      expect(
        isNonGameSteamApp({
          appId: 1086940,
          name: "Baldur's Gate 3",
          genres: ['Adventure', 'RPG', 'Strategy'],
          tags: ['Story Rich', 'CRPG', 'Turn-Based Combat'],
        })
      ).toBe(false);
    });

    it('strips Wallpaper Engine and software from enrichAndSortSteamLibrary, 32D vector, and selector', () => {
      const enriched = enrichAndSortSteamLibrary([
        {
          appId: 431960,
          name: 'Wallpaper Engine',
          playtimeHours: 1500,
          playtimeRecentHours: 60,
          headerImageUrl: '',
          genres: ['Utilities'],
          tags: ['Utilities', 'Software', 'Anime', 'Sandbox'],
          isMultiplayer: false,
          minPlayers: 1,
          maxPlayers: 1,
        },
        {
          appId: 629520,
          name: 'Soundpad',
          playtimeHours: 240,
          playtimeRecentHours: 10,
          headerImageUrl: '',
          genres: ['Utilities', 'Audio Production'],
          tags: ['Utilities', 'Software'],
          isMultiplayer: false,
          minPlayers: 1,
          maxPlayers: 1,
        },
        {
          appId: 730,
          name: 'Counter-Strike 2',
          playtimeHours: 180,
          playtimeRecentHours: 15,
          headerImageUrl: '',
          genres: ['Action'],
          tags: ['Shooter', 'Tactical', 'FPS', 'Competitive'],
          isMultiplayer: true,
          minPlayers: 1,
          maxPlayers: 5,
        },
      ]);

      expect(enriched.games.map((g) => g.appId)).toEqual([730]);
      expect(enriched.totalHours).toBe(180);
      expect(enriched.considerableGamesCount).toBe(1);

      const onlyWallpaperPlayer = createMockPlayer('u-wp-only', 'OnlyWallpaper');
      onlyWallpaperPlayer.steamProfile = {
        steamId64: '76561198000000101',
        profileUrl: '',
        personaName: 'OnlyWallpaper',
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
            isMultiplayer: false,
            minPlayers: 1,
            maxPlayers: 1,
            suggestedRating: 5,
          },
        ],
      };

      const emptyPlayer = createMockPlayer('u-empty-baseline', 'EmptyBaseline');
      const emptyBaselineVector = buildPlayerTasteVector(emptyPlayer, [], []);
      const onlyWallpaperVector = buildPlayerTasteVector(onlyWallpaperPlayer, [], []);
      expect(onlyWallpaperVector).toEqual(emptyBaselineVector);

      const csOnlyPlayer = createMockPlayer('u-cs-only', 'CsOnly');
      csOnlyPlayer.steamProfile = {
        steamId64: '76561198000000102',
        profileUrl: '',
        personaName: 'CsOnly',
        avatarUrl: '',
        lastSyncedAt: new Date().toISOString(),
        totalHours: 180,
        considerableGamesCount: 1,
        ownedGames: [
          {
            appId: 730,
            name: 'Counter-Strike 2',
            playtimeHours: 180,
            playtimeRecentHours: 12,
            headerImageUrl: '',
            genres: ['Action'],
            tags: ['Shooter', 'Tactical', 'FPS', 'Competitive'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            suggestedRating: 5,
          },
        ],
      };

      const csPlusWallpaperPlayer = createMockPlayer('u-cs-wp', 'CsPlusWallpaper');
      csPlusWallpaperPlayer.steamProfile = {
        steamId64: '76561198000000103',
        profileUrl: '',
        personaName: 'CsPlusWallpaper',
        avatarUrl: '',
        lastSyncedAt: new Date().toISOString(),
        totalHours: 1680,
        considerableGamesCount: 2,
        ownedGames: [
          {
            appId: 431960,
            name: 'Wallpaper Engine',
            playtimeHours: 1500,
            playtimeRecentHours: 90,
            headerImageUrl: '',
            genres: ['Utilities'],
            tags: ['Utilities', 'Software', 'Anime', 'Sandbox'],
            isMultiplayer: false,
            minPlayers: 1,
            maxPlayers: 1,
            suggestedRating: 5,
          },
          ...csOnlyPlayer.steamProfile.ownedGames,
        ],
      };
      csPlusWallpaperPlayer.tasteProfile = {
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
            gameId: 'ext-wp',
            steamAppId: 431960,
            name: 'Wallpaper Engine',
            platform: 'Otro Launcher',
            coverUrl: '',
            category: 'Software',
            tags: ['Utilities', 'Anime', 'Sandbox'],
            minPlayers: 1,
            maxPlayers: 1,
            isMultiplayer: false,
            rating: 5,
            hoursPlayedEstimate: 1500,
          },
        ],
        updatedAt: new Date().toISOString(),
      };

      const vCs = buildPlayerTasteVector(csOnlyPlayer, [], []);
      const vCsWp = buildPlayerTasteVector(csPlusWallpaperPlayer, [], []);
      expect(vCsWp).toEqual(vCs);

      const selector = buildUnifiedGameSelectorList({
        player: csPlusWallpaperPlayer,
        allPreferences: [],
        catalogGames: [
          {
            id: 'cat-wp',
            name: 'Wallpaper Engine',
            category: 'Software',
            description: 'Live wallpapers',
            tags: ['steam:431960', 'Utilities', 'Software'],
            minPlayers: 1,
            maxPlayers: 1,
            coverUrl: '',
            averageDurationMins: 60,
            addedBy: 'system',
          },
        ],
        discoveryGames: [
          {
            steamAppId: 431960,
            name: 'Wallpaper Engine',
            platform: 'Otro Launcher',
            category: 'Utilities',
            genres: ['Utilities'],
            tags: ['Utilities', 'Software', 'Anime'],
            isMultiplayer: false,
            minPlayers: 1,
            maxPlayers: 1,
            source: 'steam',
          },
        ],
      });

      expect(selector[0].name).toBe('Counter-Strike 2');
      expect(selector.some((item) => item.name === 'Wallpaper Engine')).toBe(false);
    });
  });

  // ==========================================================================
  // 9. ENGINE AUDIT FIXES: FALLBACK HOURS, OVERRIDES, DEDUP & SP PODIUM
  // ==========================================================================
  describe('Engine Audit Fixes (Hours Fallback, Manual Overrides, Dedup, playsOverride, SP Podium)', () => {
    it('applies 25h fallback for external games with 0 or undefined hoursPlayedEstimate (Fix #1)', () => {
      const pZero = createMockPlayer('u-ext-zero', 'ExtZero');
      pZero.tasteProfile = {
        topMultiplayerGames: [],
        topSingleplayerGames: [],
        externalGames: [
          {
            gameId: 'ext-val',
            name: 'Valorant',
            platform: 'Riot Games',
            coverUrl: '',
            category: 'Shooter Táctico',
            tags: ['FPS', 'Tactical', 'Competitive'],
            minPlayers: 1,
            maxPlayers: 5,
            isMultiplayer: true,
            rating: 5,
            hoursPlayedEstimate: 0,
          },
        ],
        updatedAt: new Date().toISOString(),
      };

      const pEmpty = createMockPlayer('u-empty', 'Empty');
      const vZero = buildPlayerTasteVector(pZero, [], []);
      const vEmpty = buildPlayerTasteVector(pEmpty, [], []);

      expect(vZero).not.toEqual(vEmpty);
      expect(vZero.tactical_shooter).toBeGreaterThan(vEmpty.tactical_shooter);
    });

    it('honors manualHoursOverride and manualRecentHoursOverride on Steam games in 32D vector & selector (Fix #2)', () => {
      const player = createMockPlayer('u-manual-hours', 'ManualHours');
      player.steamProfile = {
        steamId64: '76561198000000301',
        profileUrl: '',
        personaName: 'ManualHours',
        avatarUrl: '',
        lastSyncedAt: new Date().toISOString(),
        totalHours: 0,
        considerableGamesCount: 0,
        ownedGames: [
          {
            appId: 730,
            name: 'Counter-Strike 2',
            playtimeHours: 0,
            playtimeRecentHours: 0,
            manualHoursOverride: 180,
            manualRecentHoursOverride: 12,
            headerImageUrl: '',
            genres: ['Action'],
            tags: ['FPS', 'Tactical', 'Competitive'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            suggestedRating: 5,
          },
        ],
      };

      const emptyVector = buildPlayerTasteVector(createMockPlayer('u-none', 'None'), [], mockCatalog);
      const vector = buildPlayerTasteVector(player, [], mockCatalog);
      expect(vector.tactical_shooter).toBeGreaterThan(emptyVector.tactical_shooter);

      const csBreakdown = scoreGameForPlayer(mockCatalog[0], player, vector, []);
      expect(csBreakdown.matchingReasons.some((r) => r.includes('180h en Steam'))).toBe(true);

      const selector = buildUnifiedGameSelectorList({
        player,
        allPreferences: [],
        catalogGames: [],
      });
      const csItem = selector.find((g) => g.steamAppId === 730);
      expect(csItem).toBeDefined();
      expect(csItem?.playtimeHours).toBe(180);
      expect(csItem?.playtimeRecentHours).toBe(12);
      expect(csItem?.isPlayedOrRatedByUser).toBe(true);
    });

    it('deduplicates games across Podium, Steam, External, and Catalog in buildPlayerTasteVector (Fix #3)', () => {
      const singleSourcePlayer = createMockPlayer('u-single-src', 'Single');
      singleSourcePlayer.tasteProfile = {
        topMultiplayerGames: [
          {
            rank: 1,
            gameId: 'cat-cs2',
            steamAppId: 730,
            name: 'Counter-Strike 2',
            coverUrl: '',
            category: 'Shooter Táctico',
            tags: ['FPS', 'Competitivo', 'Táctico'],
            minPlayers: 1,
            maxPlayers: 5,
            isMultiplayer: true,
            source: 'catalog',
          },
        ],
        topSingleplayerGames: [],
        externalGames: [
          {
            gameId: 'ext-civ',
            steamAppId: 289070,
            name: 'Civilization VI',
            platform: 'Epic Games',
            coverUrl: '',
            category: 'RTS',
            tags: ['Strategy', '4X', 'Turn-Based Strategy'],
            minPlayers: 1,
            maxPlayers: 8,
            isMultiplayer: true,
            rating: 5,
            hoursPlayedEstimate: 100,
          },
        ],
        updatedAt: new Date().toISOString(),
      };

      const duplicatedPlayer = createMockPlayer('u-dup-src', 'Dup');
      duplicatedPlayer.steamProfile = {
        steamId64: '76561198000000302',
        profileUrl: '',
        personaName: 'Dup',
        avatarUrl: '',
        lastSyncedAt: new Date().toISOString(),
        totalHours: 500,
        considerableGamesCount: 1,
        ownedGames: [
          {
            appId: 730,
            name: 'Counter-Strike 2',
            playtimeHours: 500,
            playtimeRecentHours: 20,
            headerImageUrl: '',
            genres: ['Action'],
            tags: ['FPS', 'Competitivo', 'Táctico'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            suggestedRating: 5,
          },
        ],
      };
      duplicatedPlayer.tasteProfile = {
        topMultiplayerGames: [...singleSourcePlayer.tasteProfile.topMultiplayerGames],
        topSingleplayerGames: [],
        externalGames: [
          {
            gameId: 'ext-cs2',
            steamAppId: 730,
            name: 'Counter-Strike 2',
            platform: 'Steam (Otra cuenta / Verde)',
            coverUrl: '',
            category: 'Shooter Táctico',
            tags: ['FPS', 'Competitivo', 'Táctico'],
            minPlayers: 1,
            maxPlayers: 5,
            isMultiplayer: true,
            rating: 5,
            hoursPlayedEstimate: 200,
          },
          ...singleSourcePlayer.tasteProfile.externalGames,
        ],
        updatedAt: new Date().toISOString(),
      };

      const dupPrefs: UserGamePreference[] = [
        { userId: duplicatedPlayer.id, gameId: 'cat-cs2', plays: true, rating: 5 },
      ];

      const vSingle = buildPlayerTasteVector(singleSourcePlayer, [], mockCatalog);
      const vDup = buildPlayerTasteVector(duplicatedPlayer, dupPrefs, mockCatalog);

      expect(vDup).toEqual(vSingle);
    });

    it('respects playsOverride: false without forcing burnedOut on Steam games >= 2h (Fix #4)', () => {
      const player = createMockPlayer('u-unmark-steam', 'UnmarkSteam');
      player.steamProfile = {
        steamId64: '76561198000000303',
        profileUrl: '',
        personaName: 'UnmarkSteam',
        avatarUrl: '',
        lastSyncedAt: new Date().toISOString(),
        totalHours: 120,
        considerableGamesCount: 1,
        ownedGames: [
          {
            appId: 730,
            name: 'Counter-Strike 2',
            playtimeHours: 120,
            playtimeRecentHours: 8,
            headerImageUrl: '',
            genres: ['Action'],
            tags: ['FPS', 'Competitivo', 'Táctico'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            suggestedRating: 5,
            playsOverride: false,
          },
        ],
      };

      const stalePrefs: UserGamePreference[] = [
        { userId: player.id, gameId: 'cat-cs2', plays: true, rating: 5 },
      ];

      const selector = buildUnifiedGameSelectorList({
        player,
        allPreferences: stalePrefs,
        catalogGames: mockCatalog,
      });
      const csItem = selector.find((g) => g.steamAppId === 730);
      expect(csItem).toBeDefined();
      expect(csItem?.isPlayedOrRatedByUser).toBe(false);
      expect(csItem?.burnedOut).toBe(false);

      const vectorWithoutPrefs = buildPlayerTasteVector(player, [], mockCatalog);
      const emptyBaseline = buildPlayerTasteVector(createMockPlayer('u-empty2', 'Empty2'), [], mockCatalog);
      expect(vectorWithoutPrefs).toEqual(emptyBaseline);

      const csScore = scoreGameForPlayer(mockCatalog[0], player, vectorWithoutPrefs, []);
      expect(csScore.ownsOrPlays).toBe(false);
      expect(csScore.burnedOut).toBe(false);
    });

    it('scores games present in topSingleplayerGames podium in scoreGameForPlayer (Fix #5)', () => {
      const spGame: Game = {
        id: 'cat-elden',
        name: 'Elden Ring',
        category: 'RPG / Aventura',
        tags: ['steam:1245620', 'Souls-like', 'Fantasy'],
        minPlayers: 1,
        maxPlayers: 1,
        coverUrl: '',
        averageDurationMins: 90,
        addedBy: 'user-sp',
      };

      const player = createMockPlayer('u-sp-podium', 'SpPodium');
      player.tasteProfile = {
        topMultiplayerGames: [],
        topSingleplayerGames: [
          {
            rank: 1,
            gameId: 'steam-1245620',
            steamAppId: 1245620,
            name: 'Elden Ring',
            coverUrl: '',
            category: 'RPG / Aventura',
            tags: ['Souls-like', 'Fantasy'],
            minPlayers: 1,
            maxPlayers: 1,
            isMultiplayer: false,
            source: 'steam',
          },
        ],
        externalGames: [],
        updatedAt: new Date().toISOString(),
      };

      const vector = buildPlayerTasteVector(player, [], [spGame]);
      const breakdown = scoreGameForPlayer(spGame, player, vector, []);

      expect(breakdown.ownsOrPlays).toBe(true);
      expect(breakdown.affinityScore).toBeGreaterThanOrEqual(96);
      expect(breakdown.matchingReasons.some((r) => r.includes('podio singleplayer'))).toBe(true);
    });

    it('preserves hours from externalGames, catalogGameHours, and Podium when merging with Club Catalog in buildUnifiedGameSelectorList', () => {
      const player = createMockPlayer('u-hours-merge', 'HoursMerge');
      player.tasteProfile = {
        topMultiplayerGames: [
          {
            rank: 1,
            gameId: 'cat-helldivers2',
            steamAppId: 553850,
            name: 'Helldivers 2',
            coverUrl: '',
            category: 'Co-op Acción',
            tags: ['PVE', 'Sci-Fi'],
            minPlayers: 1,
            maxPlayers: 4,
            isMultiplayer: true,
            source: 'catalog',
            hoursPlayed: 90,
            recentHoursPlayed: 8,
          },
        ],
        topSingleplayerGames: [],
        externalGames: [
          {
            gameId: 'ext-cs2',
            steamAppId: 730,
            name: 'Counter-Strike 2',
            platform: 'Steam (Otra cuenta / Verde)',
            coverUrl: '',
            category: 'Shooter Táctico',
            tags: ['FPS', 'Competitivo'],
            minPlayers: 1,
            maxPlayers: 5,
            isMultiplayer: true,
            rating: 5,
            hoursPlayedEstimate: 75,
            recentHoursPlayed: 6,
          },
        ],
        catalogGameHours: {
          'cat-lethal': { hoursPlayed: 40, recentHoursPlayed: 4 },
        },
        updatedAt: new Date().toISOString(),
      };

      const prefs: UserGamePreference[] = [
        { userId: player.id, gameId: 'cat-cs2', plays: true, rating: 5 },
        { userId: player.id, gameId: 'cat-lethal', plays: true, rating: 4 },
        { userId: player.id, gameId: 'cat-helldivers2', plays: true, rating: 5 },
      ];

      const selector = buildUnifiedGameSelectorList({
        player,
        allPreferences: prefs,
        catalogGames: mockCatalog,
      });

      const csItem = selector.find((g) => g.catalogGameId === 'cat-cs2');
      const lethalItem = selector.find((g) => g.catalogGameId === 'cat-lethal');
      const hdItem = selector.find((g) => g.catalogGameId === 'cat-helldivers2');

      expect(csItem?.playtimeHours).toBe(75);
      expect(csItem?.playtimeRecentHours).toBe(6);
      expect(csItem?.needsHoursInput).toBe(false);

      expect(lethalItem?.playtimeHours).toBe(40);
      expect(lethalItem?.playtimeRecentHours).toBe(4);
      expect(lethalItem?.needsHoursInput).toBe(false);

      expect(hdItem?.playtimeHours).toBe(90);
      expect(hdItem?.playtimeRecentHours).toBe(8);
      expect(hdItem?.needsHoursInput).toBe(false);
    });

    it('auto-selects strictly at most 10 played Steam games (top 10 by hours)', () => {
      const player = createMockPlayer('u-steam-cap', 'SteamCap');
      const ownedGames = Array.from({ length: 14 }, (_, idx) => ({
        appId: 9000 + idx,
        name: `Steam Hit ${idx + 1}`,
        playtimeHours: (14 - idx) * 10,
        playtimeRecentHours: idx === 0 ? 5 : 0,
        suggestedRating: 4 as const,
        genres: ['Action'],
        tags: ['Co-op'],
        isMultiplayer: true,
        minPlayers: 1,
        maxPlayers: 4,
        headerImageUrl: '',
      }));

      player.steamProfile = {
        steamId64: '76561198000000001',
        personaName: 'SteamCap',
        profileUrl: 'https://steamcommunity.com/id/steamcap',
        avatarUrl: '',
        totalHours: ownedGames.reduce((sum, g) => sum + g.playtimeHours, 0),
        considerableGamesCount: ownedGames.length,
        ownedGames,
        lastSyncedAt: new Date().toISOString(),
      };

      const selector = buildUnifiedGameSelectorList({
        player,
        allPreferences: [],
        catalogGames: [],
      });

      const autoSelected = selector.filter((g) => g.ownedOnSteam && g.isPlayedOrRatedByUser);
      expect(autoSelected).toHaveLength(MAX_AUTO_SELECTED_STEAM_GAMES);
      expect(autoSelected.map((g) => g.steamAppId)).toEqual(
        ownedGames.slice(0, 10).map((g) => g.appId)
      );
      const excluded = selector.filter((g) => g.ownedOnSteam && !g.isPlayedOrRatedByUser);
      expect(excluded).toHaveLength(4);
    });

    it('places selected games (isPlayedOrRatedByUser) ahead of unselected games while preserving canonical likelihoodScore order within each group', () => {
      const playerBefore = createMockPlayer('u-selected-first', 'SelectedFirst');
      playerBefore.steamProfile = {
        steamId64: '76561198000000002',
        personaName: 'SelectedFirst',
        profileUrl: 'https://steamcommunity.com/id/selectedfirst',
        avatarUrl: '',
        totalHours: 100,
        considerableGamesCount: 1,
        ownedGames: [
          {
            appId: 730,
            name: 'Counter-Strike 2',
            playtimeHours: 100,
            playtimeRecentHours: 10,
            suggestedRating: 5,
            genres: ['Action'],
            tags: ['FPS'],
            isMultiplayer: true,
            minPlayers: 1,
            maxPlayers: 5,
            headerImageUrl: '',
          },
        ],
        lastSyncedAt: new Date().toISOString(),
      };

      const beforeList = buildUnifiedGameSelectorList({
        player: playerBefore,
        allPreferences: [],
        catalogGames: mockCatalog,
      });
      const valorantBeforeIdx = beforeList.findIndex((g) => g.name === 'Valorant');
      // Initially CS2 (selected Steam) is at index 0, Valorant (unselected) is after it
      expect(valorantBeforeIdx).toBeGreaterThan(0);

      // Now manually mark Valorant as played & rated 5★ + put it on MP podium
      const playerAfter: PlayerProfile = {
        ...playerBefore,
        tasteProfile: {
          topMultiplayerGames: [
            {
              rank: 1,
              gameId: 'kb-valorant',
              name: 'Valorant',
              coverUrl: '',
              category: 'Shooter Táctico',
              tags: ['FPS', 'Táctico'],
              minPlayers: 1,
              maxPlayers: 5,
              isMultiplayer: true,
              source: 'catalog',
            },
          ],
          topSingleplayerGames: [],
          externalGames: [
            {
              gameId: 'kb-valorant',
              name: 'Valorant',
              platform: 'Riot Games',
              coverUrl: '',
              category: 'Shooter Táctico',
              tags: ['FPS', 'Táctico'],
              minPlayers: 1,
              maxPlayers: 5,
              isMultiplayer: true,
              rating: 5,
            },
          ],
          updatedAt: new Date().toISOString(),
        },
      };

      const afterList = buildUnifiedGameSelectorList({
        player: playerAfter,
        allPreferences: [],
        catalogGames: mockCatalog,
      });
      const cs2AfterIdx = afterList.findIndex((g) => g.name === 'Counter-Strike 2');
      const valorantAfterIdx = afterList.findIndex((g) => g.name === 'Valorant');
      const firstUnselectedIdx = afterList.findIndex((g) => !g.isPlayedOrRatedByUser);

      expect(afterList[valorantAfterIdx]?.isPlayedOrRatedByUser).toBe(true);
      // Both selected games appear before all unselected games
      expect(cs2AfterIdx).toBeLessThan(firstUnselectedIdx);
      expect(valorantAfterIdx).toBeLessThan(firstUnselectedIdx);
      // Within the selected group, CS2 (higher likelihoodScore) remains ahead of Valorant
      expect(cs2AfterIdx).toBeLessThan(valorantAfterIdx);
    });
  });
});
