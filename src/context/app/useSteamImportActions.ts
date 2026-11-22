import React, { useCallback, useMemo } from 'react';
import {
  DiscordIntegrationConfig,
  Game,
  GameRating,
  PlayerProfile,
  PlayerSteamProfile,
  PlayerTasteProfile,
  UserGamePreference,
} from '../../types/domain';
import { fetchSteamProfileLibrary } from '../../lib/steamService';
import {
  MAX_AUTO_SELECTED_STEAM_GAMES,
  isConsiderableSteamGame,
  isNonGameSteamApp,
  normalizeGameName,
} from '../../lib/tasteProfileEngine';
import { dbInsertGame, dbUpsertPreference, dbUpsertProfile } from '../../lib/supabaseSync';
import { recomputeTasteProfileForPlayer } from './playerSanitizers';

export interface UseSteamImportActionsParams {
  currentUserId: string;
  discordConfig: DiscordIntegrationConfig;
  players: PlayerProfile[];
  preferences: UserGamePreference[];
  games: Game[];
  syncChannel: BroadcastChannel | null;
  updateDiscordConfig: (patch: Partial<DiscordIntegrationConfig>) => void;
  setGames: React.Dispatch<React.SetStateAction<Game[]>>;
  setPreferences: React.Dispatch<React.SetStateAction<UserGamePreference[]>>;
  setPlayers: React.Dispatch<React.SetStateAction<PlayerProfile[]>>;
}

export function useSteamImportActions({
  currentUserId,
  discordConfig,
  players,
  preferences,
  games,
  syncChannel,
  updateDiscordConfig,
  setGames,
  setPreferences,
  setPlayers,
}: UseSteamImportActionsParams) {
  const importSteamProfile = useCallback(
    async (
      steamUrlOrId: string,
      customApiKey?: string,
      userId?: string
    ): Promise<{ ok: boolean; message: string; profile?: PlayerSteamProfile }> => {
      const targetUserId = userId || currentUserId;
      const effectiveApiKey = customApiKey || discordConfig.steamApiKey;

      const res = await fetchSteamProfileLibrary(steamUrlOrId, effectiveApiKey, {
        igdbClientId: discordConfig.igdbClientId,
        igdbClientSecret: discordConfig.igdbClientSecret,
      });

      if (customApiKey && customApiKey !== discordConfig.steamApiKey) {
        updateDiscordConfig({ steamApiKey: customApiKey });
      }

      if (!res.ok || !res.profile) {
        return res;
      }

      const fetchedProfile = res.profile;
      const existingTargetPlayer = players.find((p) => p.id === targetUserId);
      const existingOwned = existingTargetPlayer?.steamProfile?.ownedGames || [];
      const existingMap = new Map<number, (typeof existingOwned)[0]>();
      for (const og of existingOwned) {
        existingMap.set(og.appId, og);
      }

      const baseOwnedGames = fetchedProfile.ownedGames
        .filter((g) => !isNonGameSteamApp(g))
        .map((g) => {
          const prev = existingMap.get(g.appId);
          if (!prev) return g;
          return {
            ...g,
            userRating: prev.userRating ?? g.userRating,
            playsOverride: prev.playsOverride,
            burnedOut: prev.burnedOut ?? g.burnedOut,
            selectedForCatalog: prev.selectedForCatalog ?? g.selectedForCatalog,
            manualHoursOverride: prev.manualHoursOverride,
            manualRecentHoursOverride: prev.manualRecentHoursOverride,
            tagVotes: g.tagVotes ?? prev.tagVotes,
          };
        });

      const top10SteamAppIds = new Set<number>(
        [...baseOwnedGames]
          .filter((sg) => {
            const effectiveHours = sg.manualHoursOverride ?? sg.playtimeHours ?? 0;
            const effectiveRecent = sg.manualRecentHoursOverride ?? sg.playtimeRecentHours ?? 0;
            return !sg.burnedOut && (effectiveHours >= 2 || effectiveRecent > 0);
          })
          .sort((a, b) => {
            const ha = a.manualHoursOverride ?? a.playtimeHours ?? 0;
            const hb = b.manualHoursOverride ?? b.playtimeHours ?? 0;
            if (hb !== ha) return hb - ha;
            const ra = a.manualRecentHoursOverride ?? a.playtimeRecentHours ?? 0;
            const rb = b.manualRecentHoursOverride ?? b.playtimeRecentHours ?? 0;
            return rb - ra;
          })
          .slice(0, MAX_AUTO_SELECTED_STEAM_GAMES)
          .map((sg) => sg.appId)
      );

      const mergedOwnedGames = baseOwnedGames.map((sg) => ({
        ...sg,
        playsOverride:
          sg.playsOverride !== undefined ? sg.playsOverride : top10SteamAppIds.has(sg.appId),
      }));

      const cleanTotalHours =
        Math.round(mergedOwnedGames.reduce((acc, g) => acc + (g.playtimeHours || 0), 0) * 10) /
        10;
      const cleanConsiderableCount = mergedOwnedGames.filter((g, idx) =>
        isConsiderableSteamGame(g, idx)
      ).length;

      const mergedSteamProfile: PlayerSteamProfile = {
        ...fetchedProfile,
        totalHours: cleanTotalHours,
        considerableGamesCount: cleanConsiderableCount,
        ownedGames: mergedOwnedGames,
      };

      // Auto-mark matching Club Catalog games ONLY for the top 10 qualifying Steam games
      const autoCatalogPrefs: UserGamePreference[] = [];
      mergedOwnedGames.forEach((sg) => {
        if (!top10SteamAppIds.has(sg.appId)) return;
        const catalogMatch = games.find(
          (cg) =>
            cg.tags.includes(`steam:${sg.appId}`) ||
            normalizeGameName(cg.name) === normalizeGameName(sg.name)
        );
        if (catalogMatch) {
          const steamHours = sg.manualHoursOverride ?? sg.playtimeHours;
          const steamRecent = sg.manualRecentHoursOverride ?? sg.playtimeRecentHours;
          autoCatalogPrefs.push({
            userId: targetUserId,
            gameId: catalogMatch.id,
            plays: !sg.burnedOut,
            rating: sg.userRating ?? sg.suggestedRating ?? 3,
            ...(steamHours && steamHours > 0 ? { hoursPlayed: steamHours } : {}),
            ...(steamRecent && steamRecent > 0 ? { recentHoursPlayed: steamRecent } : {}),
          });
        }
      });

      let updatedPrefsForTaste = preferences;
      if (autoCatalogPrefs.length > 0) {
        const nextPrefs = [...preferences];
        for (const np of autoCatalogPrefs) {
          const existingIdx = nextPrefs.findIndex(
            (p) => p.userId === np.userId && p.gameId === np.gameId
          );
          if (existingIdx >= 0) {
            const resolvedH = np.hoursPlayed ?? nextPrefs[existingIdx].hoursPlayed;
            const resolvedR = np.recentHoursPlayed ?? nextPrefs[existingIdx].recentHoursPlayed;
            nextPrefs[existingIdx] = {
              ...nextPrefs[existingIdx],
              plays: np.plays,
              rating: nextPrefs[existingIdx].rating || np.rating,
              ...(resolvedH !== undefined ? { hoursPlayed: resolvedH } : {}),
              ...(resolvedR !== undefined ? { recentHoursPlayed: resolvedR } : {}),
            };
          } else {
            nextPrefs.push(np);
          }
          dbUpsertPreference(
            nextPrefs[existingIdx >= 0 ? existingIdx : nextPrefs.length - 1]
          ).catch(console.warn);
        }
        updatedPrefsForTaste = nextPrefs;
        setPreferences(nextPrefs);
        syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: nextPrefs });
      }

      let targetUpdated: PlayerProfile | undefined;

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== targetUserId) return p;

          const intermediatePlayer: PlayerProfile = {
            ...p,
            steamProfile: mergedSteamProfile,
          };

          const updatedTaste = recomputeTasteProfileForPlayer(
            intermediatePlayer,
            updatedPrefsForTaste,
            games
          );

          targetUpdated = {
            ...intermediatePlayer,
            tasteProfile: updatedTaste,
          };

          return targetUpdated;
        });

        if (targetUpdated) {
          dbUpsertProfile(targetUpdated).catch(console.warn);
          syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        }

        return nextPlayers;
      });

      return {
        ok: true,
        message: res.message,
        profile: targetUpdated?.steamProfile || mergedSteamProfile,
      };
    },
    [
      currentUserId,
      discordConfig.steamApiKey,
      discordConfig.igdbClientId,
      discordConfig.igdbClientSecret,
      updateDiscordConfig,
      players,
      preferences,
      games,
      syncChannel,
      setPreferences,
      setPlayers,
    ]
  );

  const updateSteamGameFeedback = useCallback(
    (
      appId: number,
      patch: {
        userRating?: GameRating;
        burnedOut?: boolean;
        selectedForCatalog?: boolean;
        manualHoursOverride?: number;
        manualRecentHoursOverride?: number;
      },
      userId?: string
    ) => {
      const targetUserId = userId || currentUserId;
      let targetUpdated: PlayerProfile | undefined;

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== targetUserId || !p.steamProfile) return p;

          const nextOwnedGames = p.steamProfile.ownedGames.map((g) => {
            if (g.appId !== appId) return g;
            return {
              ...g,
              ...(patch.userRating !== undefined ? { userRating: patch.userRating } : {}),
              ...(patch.burnedOut !== undefined ? { burnedOut: patch.burnedOut } : {}),
              ...(patch.selectedForCatalog !== undefined
                ? { selectedForCatalog: patch.selectedForCatalog }
                : {}),
              ...(patch.manualHoursOverride !== undefined
                ? { manualHoursOverride: patch.manualHoursOverride }
                : {}),
              ...(patch.manualRecentHoursOverride !== undefined
                ? { manualRecentHoursOverride: patch.manualRecentHoursOverride }
                : {}),
            };
          });

          const intermediatePlayer: PlayerProfile = {
            ...p,
            steamProfile: {
              ...p.steamProfile,
              ownedGames: nextOwnedGames,
            },
          };

          const updatedTaste = recomputeTasteProfileForPlayer(
            intermediatePlayer,
            preferences,
            games
          );

          targetUpdated = {
            ...intermediatePlayer,
            tasteProfile: updatedTaste,
          };

          return targetUpdated;
        });

        if (targetUpdated) {
          dbUpsertProfile(targetUpdated).catch(console.warn);
          syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        }

        return nextPlayers;
      });

      // Also sync rating if a matching game exists in games + preferences
      if (patch.userRating !== undefined) {
        const matchingGame = games.find(
          (g) =>
            g.tags.some((t) => t === `steam:${appId}` || t === `${appId}`) ||
            targetUpdated?.steamProfile?.ownedGames
              .find((og) => og.appId === appId)
              ?.name.toLowerCase() === g.name.toLowerCase()
        );

        if (matchingGame) {
          const nextPref: UserGamePreference = {
            userId: targetUserId,
            gameId: matchingGame.id,
            plays: true,
            rating: patch.userRating,
          };

          setPreferences((prev) => {
            const filtered = prev.filter(
              (p) => !(p.userId === targetUserId && p.gameId === matchingGame.id)
            );
            const updated = [...filtered, nextPref];
            syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: updated });
            return updated;
          });

          dbUpsertPreference(nextPref).catch(console.warn);
        }
      }
    },
    [currentUserId, games, preferences, syncChannel, setPlayers, setPreferences]
  );

  const updatePlayerTasteProfile = useCallback(
    (patch: Partial<PlayerTasteProfile>, userId?: string) => {
      const targetUserId = userId || currentUserId;
      let targetUpdated: PlayerProfile | undefined;

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== targetUserId) return p;

          const baseTaste: PlayerTasteProfile = p.tasteProfile || {
            topMultiplayerGames: [],
            topSingleplayerGames: [],
            externalGames: [],
            updatedAt: new Date().toISOString(),
          };

          const mergedTaste: PlayerTasteProfile = {
            ...baseTaste,
            ...patch,
            updatedAt: new Date().toISOString(),
          };

          const intermediatePlayer: PlayerProfile = {
            ...p,
            tasteProfile: mergedTaste,
          };

          const recomputedTaste = recomputeTasteProfileForPlayer(
            intermediatePlayer,
            preferences,
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
    [currentUserId, preferences, games, syncChannel, setPlayers]
  );

  const syncSteamGamesToCatalog = useCallback(
    (appIds: number[], userId?: string) => {
      const targetUserId = userId || currentUserId;
      const targetPlayer = players.find((p) => p.id === targetUserId);
      if (!targetPlayer?.steamProfile) return;

      const appIdSet = new Set(appIds);
      const steamGamesToSync = targetPlayer.steamProfile.ownedGames.filter((g) =>
        appIdSet.has(g.appId)
      );

      if (steamGamesToSync.length === 0) return;

      const newGamesToAdd: Game[] = [];
      const newPreferencesToAdd: UserGamePreference[] = [];

      setGames((prevGames) => {
        const updatedGames = [...prevGames];

        for (const sg of steamGamesToSync) {
          let existing = updatedGames.find(
            (g) =>
              g.tags.includes(`steam:${sg.appId}`) ||
              g.name.trim().toLowerCase() === sg.name.trim().toLowerCase()
          );

          if (!existing) {
            const newGame: Game = {
              id: `game-steam-${sg.appId}`,
              name: sg.name,
              description: `Importado de Steam Library. Min: ${sg.minPlayers}, Max: ${sg.maxPlayers}.`,
              coverUrl: sg.headerImageUrl,
              minPlayers: sg.minPlayers || 1,
              maxPlayers: sg.maxPlayers || 4,
              category: sg.genres[0] || 'Co-op Acción',
              tags: Array.from(new Set([...sg.tags, ...sg.genres, `steam:${sg.appId}`])),
              averageDurationMins: 60,
              addedBy: targetUserId,
            };
            updatedGames.push(newGame);
            newGamesToAdd.push(newGame);
            existing = newGame;
          }

          const rating: GameRating = sg.userRating || sg.suggestedRating || 3;
          const steamHours = sg.manualHoursOverride ?? sg.playtimeHours;
          const steamRecent = sg.manualRecentHoursOverride ?? sg.playtimeRecentHours;
          newPreferencesToAdd.push({
            userId: targetUserId,
            gameId: existing.id,
            plays: true,
            rating,
            ...(steamHours && steamHours > 0 ? { hoursPlayed: steamHours } : {}),
            ...(steamRecent && steamRecent > 0 ? { recentHoursPlayed: steamRecent } : {}),
          });
        }

        for (const g of newGamesToAdd) {
          dbInsertGame(g).catch(console.warn);
        }

        syncChannel?.postMessage({ type: 'SYNC_ALL', payload: { games: updatedGames } });
        return updatedGames;
      });

      if (newPreferencesToAdd.length > 0) {
        setPreferences((prevPrefs) => {
          const nextPrefs = [...prevPrefs];
          for (const np of newPreferencesToAdd) {
            const idx = nextPrefs.findIndex(
              (p) => p.userId === np.userId && p.gameId === np.gameId
            );
            if (idx >= 0) {
              nextPrefs[idx] = np;
            } else {
              nextPrefs.push(np);
            }
            dbUpsertPreference(np).catch(console.warn);
          }
          syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: nextPrefs });
          return nextPrefs;
        });
      }

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== targetUserId || !p.steamProfile) return p;

          const nextOwned = p.steamProfile.ownedGames.map((og) => {
            if (appIdSet.has(og.appId)) {
              return { ...og, selectedForCatalog: true };
            }
            return og;
          });

          const intermediatePlayer: PlayerProfile = {
            ...p,
            steamProfile: {
              ...p.steamProfile,
              ownedGames: nextOwned,
            },
          };

          const updatedTaste = recomputeTasteProfileForPlayer(
            intermediatePlayer,
            preferences,
            games
          );

          const updatedPlayer = {
            ...intermediatePlayer,
            tasteProfile: updatedTaste,
          };

          dbUpsertProfile(updatedPlayer).catch(console.warn);
          return updatedPlayer;
        });

        syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        return nextPlayers;
      });
    },
    [currentUserId, players, preferences, games, syncChannel, setGames, setPreferences, setPlayers]
  );

  return useMemo(
    () => ({
      importSteamProfile,
      updateSteamGameFeedback,
      updatePlayerTasteProfile,
      syncSteamGamesToCatalog,
    }),
    [
      importSteamProfile,
      updateSteamGameFeedback,
      updatePlayerTasteProfile,
      syncSteamGamesToCatalog,
    ]
  );
}
