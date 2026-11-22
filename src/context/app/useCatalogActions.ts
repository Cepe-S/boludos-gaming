import React, { useCallback, useMemo } from 'react';
import {
  Game,
  GameRating,
  PlayerProfile,
  PlayerTasteProfile,
  UserGamePreference,
} from '../../types/domain';
import { normalizeGameName } from '../../lib/tasteProfileEngine';
import { dbInsertGame, dbUpsertPreference, dbUpsertProfile } from '../../lib/supabaseSync';
import { recomputeTasteProfileForPlayer } from './playerSanitizers';
import { TriggerNotificationPipeline } from './useNotificationsAndDiscord';

export interface UseCatalogActionsParams {
  currentUserId: string;
  currentUser: PlayerProfile;
  games: Game[];
  players: PlayerProfile[];
  preferences: UserGamePreference[];
  syncChannel: BroadcastChannel | null;
  setGames: React.Dispatch<React.SetStateAction<Game[]>>;
  setPreferences: React.Dispatch<React.SetStateAction<UserGamePreference[]>>;
  setPlayers: React.Dispatch<React.SetStateAction<PlayerProfile[]>>;
  addGameToGroup: (groupId: string, gameId: string) => void;
  triggerNotificationPipeline: TriggerNotificationPipeline;
}

export function useCatalogActions({
  currentUserId,
  currentUser,
  games,
  players,
  preferences,
  syncChannel,
  setGames,
  setPreferences,
  setPlayers,
  addGameToGroup,
  triggerNotificationPipeline,
}: UseCatalogActionsParams) {
  const updateGamePreference = useCallback(
    (
      gameId: string,
      plays: boolean,
      rating: GameRating,
      hoursPlayed?: number,
      recentHoursPlayed?: number
    ) => {
      const existingPref = preferences.find(
        (p) => p.userId === currentUserId && p.gameId === gameId
      );
      const resolvedHoursPlayed = hoursPlayed ?? existingPref?.hoursPlayed;
      const resolvedRecentHoursPlayed = recentHoursPlayed ?? existingPref?.recentHoursPlayed;

      const targetCatGame = games.find((g) => g.id === gameId);
      const targetNormName = targetCatGame ? normalizeGameName(targetCatGame.name) : '';
      const targetSteamTag = targetCatGame?.tags.find((t) => t.startsWith('steam:'));
      const parsedTargetAppId = targetSteamTag ? Number(targetSteamTag.slice(6)) : undefined;
      const targetSteamAppId =
        parsedTargetAppId !== undefined && Number.isFinite(parsedTargetAppId)
          ? parsedTargetAppId
          : undefined;

      const nextPref: UserGamePreference = {
        userId: currentUserId,
        gameId,
        plays,
        rating,
        ...(resolvedHoursPlayed !== undefined ? { hoursPlayed: resolvedHoursPlayed } : {}),
        ...(resolvedRecentHoursPlayed !== undefined
          ? { recentHoursPlayed: resolvedRecentHoursPlayed }
          : {}),
      };
      const filtered = preferences.filter(
        (p) => !(p.userId === currentUserId && p.gameId === gameId)
      );
      const updatedPrefs: UserGamePreference[] = [...filtered, nextPref];

      setPreferences(updatedPrefs);
      syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: updatedPrefs });
      dbUpsertPreference({ userId: currentUserId, gameId, plays, rating }).catch(console.warn);

      // Keep taste profile featureVector & PVJ-6D fresh, and sync hours across catalog/Steam/external/podium
      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== currentUserId) return p;
          const baseTaste: PlayerTasteProfile = p.tasteProfile || {
            topMultiplayerGames: [],
            topSingleplayerGames: [],
            externalGames: [],
            updatedAt: new Date().toISOString(),
          };
          const prevCatalogHours = baseTaste.catalogGameHours || {};
          const nextCatalogHours =
            resolvedHoursPlayed !== undefined || resolvedRecentHoursPlayed !== undefined
              ? {
                  ...prevCatalogHours,
                  [gameId]: {
                    hoursPlayed:
                      resolvedHoursPlayed ?? prevCatalogHours[gameId]?.hoursPlayed ?? 0,
                    ...(resolvedRecentHoursPlayed !== undefined ||
                    prevCatalogHours[gameId]?.recentHoursPlayed !== undefined
                      ? {
                          recentHoursPlayed:
                            resolvedRecentHoursPlayed ??
                            prevCatalogHours[gameId]?.recentHoursPlayed ??
                            0,
                        }
                      : {}),
                  },
                }
              : prevCatalogHours;

          const hasHourPatch =
            resolvedHoursPlayed !== undefined || resolvedRecentHoursPlayed !== undefined;

          const matchesTarget = (name: string, appId?: number): boolean => {
            if (targetSteamAppId !== undefined && appId === targetSteamAppId) return true;
            return Boolean(targetNormName && normalizeGameName(name) === targetNormName);
          };

          const nextSteamProfile =
            hasHourPatch && targetCatGame && p.steamProfile
              ? {
                  ...p.steamProfile,
                  ownedGames: p.steamProfile.ownedGames.map((og) => {
                    if (!matchesTarget(og.name, og.appId)) return og;
                    return {
                      ...og,
                      ...(resolvedHoursPlayed !== undefined
                        ? { manualHoursOverride: resolvedHoursPlayed }
                        : {}),
                      ...(resolvedRecentHoursPlayed !== undefined
                        ? { manualRecentHoursOverride: resolvedRecentHoursPlayed }
                        : {}),
                    };
                  }),
                }
              : p.steamProfile;

          const nextExternalGames =
            hasHourPatch && targetCatGame
              ? (baseTaste.externalGames || []).map((ext) => {
                  if (!matchesTarget(ext.name, ext.steamAppId)) return ext;
                  return {
                    ...ext,
                    ...(resolvedHoursPlayed !== undefined
                      ? { hoursPlayedEstimate: resolvedHoursPlayed }
                      : {}),
                    ...(resolvedRecentHoursPlayed !== undefined
                      ? { recentHoursPlayed: resolvedRecentHoursPlayed }
                      : {}),
                  };
                })
              : baseTaste.externalGames || [];

          const syncPodiumHours = (entries: typeof baseTaste.topMultiplayerGames) =>
            hasHourPatch && targetCatGame
              ? entries.map((pe) => {
                  if (!matchesTarget(pe.name, pe.steamAppId)) return pe;
                  return {
                    ...pe,
                    ...(resolvedHoursPlayed !== undefined
                      ? { hoursPlayed: resolvedHoursPlayed }
                      : {}),
                    ...(resolvedRecentHoursPlayed !== undefined
                      ? { recentHoursPlayed: resolvedRecentHoursPlayed }
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
            },
          };
          const updatedTaste = recomputeTasteProfileForPlayer(
            intermediatePlayer,
            updatedPrefs,
            games
          );
          const updatedP = { ...intermediatePlayer, tasteProfile: updatedTaste };
          dbUpsertProfile(updatedP).catch(console.warn);
          return updatedP;
        });
        syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        return nextPlayers;
      });
    },
    [currentUserId, games, preferences, syncChannel, setPreferences, setPlayers]
  );

  const addGame = useCallback(
    (gameData: Omit<Game, 'id' | 'addedBy'>): Game => {
      const newGame: Game = {
        ...gameData,
        id: `game-${Date.now()}`,
        addedBy: currentUserId,
      };

      const nextGamesSnapshot = [...games, newGame];
      setGames((prev) => {
        const updated = [...prev, newGame];
        syncChannel?.postMessage({ type: 'SYNC_ALL', payload: { games: updated } });
        return updated;
      });
      dbInsertGame(newGame).catch(console.warn);

      const defaultPref: UserGamePreference = {
        userId: currentUserId,
        gameId: newGame.id,
        plays: true,
        rating: 4 as GameRating,
      };
      const nextPrefsSnapshot = [...preferences, defaultPref];
      // Add default preference for current user
      setPreferences((prev) => {
        const updated = [...prev, defaultPref];
        syncChannel?.postMessage({ type: 'SYNC_PREFERENCES', payload: updated });
        return updated;
      });
      dbUpsertPreference(defaultPref).catch(console.warn);

      setPlayers((prevPlayers) => {
        const nextPlayers = prevPlayers.map((p) => {
          if (p.id !== currentUserId) return p;
          const updatedTaste = recomputeTasteProfileForPlayer(
            p,
            nextPrefsSnapshot,
            nextGamesSnapshot
          );
          const updatedP = { ...p, tasteProfile: updatedTaste };
          dbUpsertProfile(updatedP).catch(console.warn);
          return updatedP;
        });
        syncChannel?.postMessage({ type: 'SYNC_PLAYERS', payload: nextPlayers });
        return nextPlayers;
      });

      triggerNotificationPipeline(
        {
          title: '🎮 Nuevo Juego Agregado',
          body: `${currentUser.displayName} agregó "${newGame.name}" al catálogo de Boludos Gaming.`,
          tag: 'game_added',
          targetUserIds: players.map((p) => p.id),
        },
        'message'
      );

      return newGame;
    },
    [
      currentUser,
      currentUserId,
      games,
      players,
      preferences,
      syncChannel,
      triggerNotificationPipeline,
      setGames,
      setPreferences,
      setPlayers,
    ]
  );

  const addAndLinkGameToGroup = useCallback(
    (groupId: string, gameData: Omit<Game, 'id' | 'addedBy'>): Game => {
      const normalizedTarget = normalizeGameName(gameData.name);
      const existing = games.find((g) => normalizeGameName(g.name) === normalizedTarget);
      const resolved = existing ?? addGame(gameData);
      addGameToGroup(groupId, resolved.id);
      return resolved;
    },
    [games, addGame, addGameToGroup]
  );

  return useMemo(
    () => ({
      updateGamePreference,
      addGame,
      addAndLinkGameToGroup,
    }),
    [updateGamePreference, addGame, addAndLinkGameToGroup]
  );
}
