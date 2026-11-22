import React, { useCallback, useMemo } from 'react';
import {
  ExternalGamePlatform,
  ExternalRatedGame,
  Game,
  GameRating,
  PlayerProfile,
  PlayerTasteProfile,
  UnifiedSelectorGame,
  UserGamePreference,
} from '../../types/domain';
import { normalizeGameName } from '../../lib/tasteProfileEngine';
import { dbInsertGame, dbUpsertPreference, dbUpsertProfile } from '../../lib/supabaseSync';
import { recomputeTasteProfileForPlayer } from './playerSanitizers';

export interface UseUnifiedTasteActionsParams {
  currentUserId: string;
  games: Game[];
  preferences: UserGamePreference[];
  syncChannel: BroadcastChannel | null;
  setGames: React.Dispatch<React.SetStateAction<Game[]>>;
  setPreferences: React.Dispatch<React.SetStateAction<UserGamePreference[]>>;
  setPlayers: React.Dispatch<React.SetStateAction<PlayerProfile[]>>;
  updateSteamGameFeedback: (
    appId: number,
    patch: {
      userRating?: GameRating;
      burnedOut?: boolean;
      selectedForCatalog?: boolean;
      manualHoursOverride?: number;
      manualRecentHoursOverride?: number;
    },
    userId?: string
  ) => void;
}

export function useUnifiedTasteActions({
  currentUserId,
  games,
  preferences,
  syncChannel,
  setGames,
  setPreferences,
  setPlayers,
  updateSteamGameFeedback,
}: UseUnifiedTasteActionsParams) {
  const setUnifiedGameFeedback = useCallback(
    (
      game: UnifiedSelectorGame,
      patch: {
        plays?: boolean;
        rating?: GameRating;
        burnedOut?: boolean;
        platform?: ExternalGamePlatform;
        hoursPlayed?: number;
        recentHoursPlayed?: number;
      },
      userId?: string
    ) => {
      const targetUserId = userId || currentUserId;
      const normName = normalizeGameName(game.name);
      const nextRating: GameRating = patch.rating ?? game.effectiveRating ?? 4;

      // 1. Sync matching Club Catalog preference if game exists in catalog
      const matchingCatalogGame =
        (game.catalogGameId
          ? games.find((g) => g.id === game.catalogGameId)
          : undefined) ||
        games.find(
          (g) =>
            (game.steamAppId !== undefined && g.tags.includes(`steam:${game.steamAppId}`)) ||
            normalizeGameName(g.name) === normName
        );

      const existingMatchingPref = matchingCatalogGame
        ? preferences.find(
            (p) => p.userId === targetUserId && p.gameId === matchingCatalogGame.id
          )
        : undefined;
      const fallbackGameHours = game.playtimeHours > 0 ? game.playtimeHours : undefined;
      const fallbackGameRecent =
        game.playtimeRecentHours > 0 ? game.playtimeRecentHours : undefined;
      const resolvedHoursPlayed =
        patch.hoursPlayed ?? existingMatchingPref?.hoursPlayed ?? fallbackGameHours;
      const resolvedRecentHoursPlayed =
        patch.recentHoursPlayed ??
        existingMatchingPref?.recentHoursPlayed ??
        fallbackGameRecent;

      let nextPrefsSnapshot = preferences;
      if (matchingCatalogGame) {
        const resolvedPlays =
          patch.burnedOut === true
            ? false
            : patch.plays !== undefined
              ? patch.plays
              : patch.rating !== undefined
                ? true
                : existingMatchingPref?.plays ?? true;
        const resolvedRating = patch.rating ?? existingMatchingPref?.rating ?? nextRating;
        const resolvedPref: UserGamePreference = {
          userId: targetUserId,
          gameId: matchingCatalogGame.id,
          plays: resolvedPlays,
          rating: resolvedRating,
          ...(resolvedHoursPlayed !== undefined ? { hoursPlayed: resolvedHoursPlayed } : {}),
          ...(resolvedRecentHoursPlayed !== undefined
            ? { recentHoursPlayed: resolvedRecentHoursPlayed }
            : {}),
        };
        const filtered = preferences.filter(
          (p) => !(p.userId === targetUserId && p.gameId === matchingCatalogGame.id)
        );
        nextPrefsSnapshot = [...filtered, resolvedPref];
        setPreferences(nextPrefsSnapshot);
        syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: nextPrefsSnapshot });
        dbUpsertPreference({
          userId: targetUserId,
          gameId: matchingCatalogGame.id,
          plays: resolvedPlays,
          rating: resolvedRating,
        }).catch(console.warn);
      }

      // 2. Persist onto Steam profile (if owned on Steam) OR externalGames list (uniformly)
      let targetUpdated: PlayerProfile | undefined;

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== targetUserId) return p;

          let nextSteamProfile = p.steamProfile;
          const baseTaste: PlayerTasteProfile = p.tasteProfile || {
            topMultiplayerGames: [],
            topSingleplayerGames: [],
            externalGames: [],
            updatedAt: new Date().toISOString(),
          };
          let nextExternalGames = [...(baseTaste.externalGames || [])];

          if (game.ownedOnSteam && game.steamAppId && p.steamProfile) {
            nextSteamProfile = {
              ...p.steamProfile,
              ownedGames: p.steamProfile.ownedGames.map((og) => {
                if (og.appId !== game.steamAppId) return og;
                const clearRatingOnUnmark =
                  patch.plays === false && patch.rating === undefined;
                const nextPlaysOverride =
                  patch.burnedOut === true
                    ? false
                    : patch.plays !== undefined
                      ? patch.plays
                      : patch.rating !== undefined ||
                          patch.hoursPlayed !== undefined ||
                          patch.recentHoursPlayed !== undefined
                        ? true
                        : og.playsOverride;
                return {
                  ...og,
                  userRating: clearRatingOnUnmark
                    ? undefined
                    : patch.rating !== undefined
                      ? patch.rating
                      : patch.plays === true && og.userRating === undefined
                        ? nextRating
                        : og.userRating,
                  ...(nextPlaysOverride !== undefined
                    ? { playsOverride: nextPlaysOverride }
                    : {}),
                  burnedOut:
                    patch.burnedOut !== undefined ? patch.burnedOut : og.burnedOut,
                  ...(patch.hoursPlayed !== undefined
                    ? { manualHoursOverride: patch.hoursPlayed }
                    : {}),
                  ...(patch.recentHoursPlayed !== undefined
                    ? { manualRecentHoursOverride: patch.recentHoursPlayed }
                    : {}),
                };
              }),
            };
          } else {
            const existingExtIndex = nextExternalGames.findIndex(
              (ext) =>
                (game.externalGameId && ext.gameId === game.externalGameId) ||
                normalizeGameName(ext.name) === normName
            );

            if (
              patch.plays === false &&
              patch.rating === undefined &&
              patch.burnedOut === undefined &&
              patch.hoursPlayed === undefined &&
              patch.recentHoursPlayed === undefined
            ) {
              if (existingExtIndex >= 0) {
                nextExternalGames.splice(existingExtIndex, 1);
              }
            } else {
              const resolvedPlatform: ExternalGamePlatform =
                patch.platform ||
                (existingExtIndex >= 0
                  ? nextExternalGames[existingExtIndex].platform
                  : [
                        'Steam (Otra cuenta / Verde)',
                        'Riot Games',
                        'Epic Games',
                        'Battle.net',
                        'EA App',
                        'Xbox Game Pass',
                        'Otro Launcher',
                      ].includes(game.platform)
                    ? (game.platform as ExternalGamePlatform)
                    : 'Otro Launcher');

              const prevExt =
                existingExtIndex >= 0 ? nextExternalGames[existingExtIndex] : undefined;
              const updatedExternalEntry: ExternalRatedGame = {
                gameId:
                  prevExt?.gameId ||
                  game.externalGameId ||
                  (game.igdbId
                    ? `igdb-${game.igdbId}`
                    : game.steamAppId
                      ? `steam-ext-${game.steamAppId}`
                      : `ext-${normName}`),
                steamAppId: game.steamAppId,
                igdbId: game.igdbId,
                name: game.name,
                platform: resolvedPlatform,
                coverUrl: game.coverUrl,
                category: game.category,
                tags: game.tags,
                ...(game.tagVotes || prevExt?.tagVotes
                  ? { tagVotes: game.tagVotes ?? prevExt?.tagVotes }
                  : {}),
                minPlayers: game.minPlayers,
                maxPlayers: game.maxPlayers,
                isMultiplayer: game.isMultiplayer,
                rating: patch.rating ?? prevExt?.rating ?? nextRating,
                ...(patch.hoursPlayed !== undefined ||
                prevExt?.hoursPlayedEstimate !== undefined
                  ? {
                      hoursPlayedEstimate:
                        patch.hoursPlayed !== undefined
                          ? patch.hoursPlayed
                          : prevExt?.hoursPlayedEstimate,
                    }
                  : {}),
                ...(patch.recentHoursPlayed !== undefined ||
                prevExt?.recentHoursPlayed !== undefined
                  ? {
                      recentHoursPlayed:
                        patch.recentHoursPlayed ?? prevExt?.recentHoursPlayed,
                    }
                  : {}),
                burnedOut:
                  patch.burnedOut !== undefined
                    ? patch.burnedOut
                    : prevExt?.burnedOut ?? false,
                source:
                  game.source === 'igdb_discovery' || game.igdbId
                    ? 'igdb'
                    : game.steamAppId
                      ? 'steam'
                      : 'curated',
              };

              if (existingExtIndex >= 0) {
                nextExternalGames[existingExtIndex] = updatedExternalEntry;
              } else {
                nextExternalGames = [updatedExternalEntry, ...nextExternalGames];
              }
            }
          }

          // Mirror hours into catalogGameHours & any matching Podium Top 3 slots
          const prevCatalogHours = baseTaste.catalogGameHours || {};
          const nextCatalogHours =
            matchingCatalogGame &&
            (resolvedHoursPlayed !== undefined || resolvedRecentHoursPlayed !== undefined)
              ? {
                  ...prevCatalogHours,
                  [matchingCatalogGame.id]: {
                    hoursPlayed:
                      resolvedHoursPlayed ??
                      prevCatalogHours[matchingCatalogGame.id]?.hoursPlayed ??
                      0,
                    ...(resolvedRecentHoursPlayed !== undefined ||
                    prevCatalogHours[matchingCatalogGame.id]?.recentHoursPlayed !== undefined
                      ? {
                          recentHoursPlayed:
                            resolvedRecentHoursPlayed ??
                            prevCatalogHours[matchingCatalogGame.id]?.recentHoursPlayed ??
                            0,
                        }
                      : {}),
                  },
                }
              : prevCatalogHours;

          const syncPodiumHours = (entries: typeof baseTaste.topMultiplayerGames) =>
            patch.hoursPlayed !== undefined || patch.recentHoursPlayed !== undefined
              ? entries.map((pe) => {
                  const matchesPodium =
                    (game.steamAppId !== undefined && pe.steamAppId === game.steamAppId) ||
                    normalizeGameName(pe.name) === normName;
                  if (!matchesPodium) return pe;
                  return {
                    ...pe,
                    ...(patch.hoursPlayed !== undefined
                      ? { hoursPlayed: patch.hoursPlayed }
                      : {}),
                    ...(patch.recentHoursPlayed !== undefined
                      ? { recentHoursPlayed: patch.recentHoursPlayed }
                      : {}),
                  };
                })
              : entries;

          const intermediatePlayer: PlayerProfile = {
            ...p,
            steamProfile: nextSteamProfile,
            tasteProfile: {
              ...baseTaste,
              topMultiplayerGames: syncPodiumHours(baseTaste.topMultiplayerGames || []),
              topSingleplayerGames: syncPodiumHours(baseTaste.topSingleplayerGames || []),
              externalGames: nextExternalGames,
              catalogGameHours: nextCatalogHours,
              updatedAt: new Date().toISOString(),
            },
          };

          const recomputedTaste = recomputeTasteProfileForPlayer(
            intermediatePlayer,
            nextPrefsSnapshot,
            games
          );

          targetUpdated = {
            ...intermediatePlayer,
            tasteProfile: recomputedTaste,
          };

          return targetUpdated;
        });

        if (targetUpdated) {
          dbUpsertProfile(targetUpdated).catch(console.warn);
          syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        }

        return nextPlayers;
      });
    },
    [currentUserId, games, preferences, syncChannel, setPreferences, setPlayers]
  );

  const syncUnifiedGameToCatalog = useCallback(
    (game: UnifiedSelectorGame, userId?: string): Game | null => {
      const targetUserId = userId || currentUserId;
      const normName = normalizeGameName(game.name);

      let resolvedCatalogGame =
        (game.catalogGameId
          ? games.find((g) => g.id === game.catalogGameId)
          : undefined) ||
        games.find(
          (g) =>
            (game.steamAppId !== undefined && g.tags.includes(`steam:${game.steamAppId}`)) ||
            normalizeGameName(g.name) === normName
        ) ||
        null;

      if (!resolvedCatalogGame) {
        const tagSet = new Set<string>(game.tags || []);
        if (game.steamAppId) tagSet.add(`steam:${game.steamAppId}`);
        if (game.platform && !game.platform.includes('/')) {
          tagSet.add(game.platform);
        }

        const newGame: Game = {
          id: game.steamAppId
            ? `game-steam-${game.steamAppId}`
            : game.igdbId
              ? `game-igdb-${game.igdbId}`
              : `game-${normName.replace(/[^a-z0-9]/g, '') || Date.now()}-${Date.now()}`,
          name: game.name,
          description: `Agregado desde ${game.platform}. Cupo: ${game.minPlayers}-${game.maxPlayers} jug.`,
          coverUrl:
            game.coverUrl ||
            'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
          minPlayers: Math.max(1, game.minPlayers || 1),
          maxPlayers: Math.max(1, game.maxPlayers || 4),
          category: game.category || 'Co-op Acción',
          tags: Array.from(tagSet).slice(0, 8),
          averageDurationMins: 50,
          addedBy: targetUserId,
        };

        resolvedCatalogGame = newGame;
        setGames((prevGames) => {
          if (prevGames.some((g) => normalizeGameName(g.name) === normName)) {
            return prevGames;
          }
          const updatedGames = [...prevGames, newGame];
          syncChannel?.postMessage({ type: 'SYNC_ALL', payload: { games: updatedGames } });
          return updatedGames;
        });
        dbInsertGame(newGame).catch(console.warn);
      }

      if (resolvedCatalogGame) {
        const nextPref: UserGamePreference = {
          userId: targetUserId,
          gameId: resolvedCatalogGame.id,
          plays: !game.burnedOut,
          rating: game.effectiveRating || 4,
          ...(game.playtimeHours > 0 ? { hoursPlayed: game.playtimeHours } : {}),
          ...(game.playtimeRecentHours > 0
            ? { recentHoursPlayed: game.playtimeRecentHours }
            : {}),
        };

        setPreferences((prevPrefs) => {
          const filtered = prevPrefs.filter(
            (p) => !(p.userId === targetUserId && p.gameId === resolvedCatalogGame!.id)
          );
          const updatedPrefs = [...filtered, nextPref];
          syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: updatedPrefs });
          return updatedPrefs;
        });
        dbUpsertPreference(nextPref).catch(console.warn);

        if (game.playtimeHours > 0 || game.playtimeRecentHours > 0) {
          const syncedCatalogId = resolvedCatalogGame.id;
          setPlayers((prevPlayers) => {
            let targetUpdated: PlayerProfile | undefined;
            const nextPlayers = prevPlayers.map((p) => {
              if (p.id !== targetUserId) return p;
              const baseTaste: PlayerTasteProfile = p.tasteProfile || {
                topMultiplayerGames: [],
                topSingleplayerGames: [],
                externalGames: [],
                updatedAt: new Date().toISOString(),
              };
              const prevCatalogHours = baseTaste.catalogGameHours || {};
              targetUpdated = {
                ...p,
                tasteProfile: {
                  ...baseTaste,
                  catalogGameHours: {
                    ...prevCatalogHours,
                    [syncedCatalogId]: {
                      hoursPlayed:
                        game.playtimeHours > 0
                          ? game.playtimeHours
                          : prevCatalogHours[syncedCatalogId]?.hoursPlayed ?? 0,
                      ...(game.playtimeRecentHours > 0 ||
                      prevCatalogHours[syncedCatalogId]?.recentHoursPlayed !== undefined
                        ? {
                            recentHoursPlayed:
                              game.playtimeRecentHours > 0
                                ? game.playtimeRecentHours
                                : prevCatalogHours[syncedCatalogId]?.recentHoursPlayed ?? 0,
                          }
                        : {}),
                    },
                  },
                  updatedAt: new Date().toISOString(),
                },
              };
              return targetUpdated;
            });
            if (targetUpdated) {
              dbUpsertProfile(targetUpdated).catch(console.warn);
              syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
            }
            return nextPlayers;
          });
        }
      }

      if (game.ownedOnSteam && game.steamAppId) {
        updateSteamGameFeedback(
          game.steamAppId,
          { selectedForCatalog: true },
          targetUserId
        );
      }

      return resolvedCatalogGame;
    },
    [
      currentUserId,
      games,
      syncChannel,
      updateSteamGameFeedback,
      setGames,
      setPreferences,
      setPlayers,
    ]
  );

  return useMemo(
    () => ({
      setUnifiedGameFeedback,
      syncUnifiedGameToCatalog,
    }),
    [setUnifiedGameFeedback, syncUnifiedGameToCatalog]
  );
}
