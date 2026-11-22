import {
  Game,
  PlayerProfile,
  PlayerTasteProfile,
  TasteDimensionKey,
  UserGamePreference,
} from '../../types/domain';
import {
  buildPlayerTasteVector,
  isConsiderableSteamGame,
  isNonGameSteamApp,
} from '../../lib/tasteProfileEngine';
import { computePlayerPvj6dProfile } from '../../lib/playerCategorizationEngine';

export function stripNonGamesFromPlayer(player: PlayerProfile): {
  cleanedPlayer: PlayerProfile;
  removedAny: boolean;
} {
  let removedAny = false;

  let nextSteamProfile = player.steamProfile;
  if (nextSteamProfile?.ownedGames) {
    const cleanOwned = nextSteamProfile.ownedGames.filter((g) => !isNonGameSteamApp(g));
    if (cleanOwned.length !== nextSteamProfile.ownedGames.length) {
      removedAny = true;
      const totalHours =
        Math.round(cleanOwned.reduce((acc, g) => acc + (g.playtimeHours || 0), 0) * 10) / 10;
      const considerableGamesCount = cleanOwned.filter((g, idx) =>
        isConsiderableSteamGame(g, idx)
      ).length;
      nextSteamProfile = {
        ...nextSteamProfile,
        totalHours,
        considerableGamesCount,
        ownedGames: cleanOwned,
      };
    }
  }

  let nextTasteProfile = player.tasteProfile;
  if (nextTasteProfile) {
    const origTopMp = nextTasteProfile.topMultiplayerGames || [];
    const origTopSp = nextTasteProfile.topSingleplayerGames || [];
    const origExt = nextTasteProfile.externalGames || [];

    const cleanTopMp = origTopMp.filter((g) => !isNonGameSteamApp(g));
    const cleanTopSp = origTopSp.filter((g) => !isNonGameSteamApp(g));
    const cleanExt = origExt.filter((g) => !isNonGameSteamApp(g));

    if (
      cleanTopMp.length !== origTopMp.length ||
      cleanTopSp.length !== origTopSp.length ||
      cleanExt.length !== origExt.length
    ) {
      removedAny = true;
      nextTasteProfile = {
        ...nextTasteProfile,
        topMultiplayerGames: cleanTopMp.slice(0, 3).map((g, idx) => ({
          ...g,
          rank: (idx + 1) as 1 | 2 | 3,
        })),
        topSingleplayerGames: cleanTopSp.slice(0, 3).map((g, idx) => ({
          ...g,
          rank: (idx + 1) as 1 | 2 | 3,
        })),
        externalGames: cleanExt,
      };
    }
  }

  if (!removedAny) {
    return { cleanedPlayer: player, removedAny: false };
  }

  return {
    cleanedPlayer: {
      ...player,
      steamProfile: nextSteamProfile,
      tasteProfile: nextTasteProfile,
    },
    removedAny: true,
  };
}

export function recomputeTasteProfileForPlayer(
  player: PlayerProfile,
  allPrefs: UserGamePreference[],
  allGames: Game[]
): PlayerTasteProfile {
  const { cleanedPlayer } = stripNonGamesFromPlayer(player);
  const currentTaste: PlayerTasteProfile = cleanedPlayer.tasteProfile || {
    topMultiplayerGames: [],
    topSingleplayerGames: [],
    externalGames: [],
    updatedAt: new Date().toISOString(),
  };

  let featureVector: Partial<Record<TasteDimensionKey, number>> = {};
  let topDimensions: Array<{ key: TasteDimensionKey; label: string; score: number }> = [];

  try {
    const vectorResult = buildPlayerTasteVector(cleanedPlayer, allPrefs, allGames) as
      | {
          featureVector?: Partial<Record<TasteDimensionKey, number>>;
          topDimensions?: Array<{ key: TasteDimensionKey; label: string; score: number }>;
        }
      | Partial<Record<TasteDimensionKey, number>>
      | undefined;

    if (vectorResult) {
      if ('featureVector' in vectorResult && vectorResult.featureVector) {
        featureVector = vectorResult.featureVector;
        topDimensions = vectorResult.topDimensions || [];
      } else if (typeof vectorResult === 'object') {
        featureVector = vectorResult as Partial<Record<TasteDimensionKey, number>>;
      }
    }
  } catch (err) {
    console.warn('Error in buildPlayerTasteVector:', err);
  }

  if (topDimensions.length === 0 && Object.keys(featureVector).length > 0) {
    topDimensions = Object.entries(featureVector)
      .map(([key, score]) => ({
        key: key as TasteDimensionKey,
        label: key.replace(/_/g, ' '),
        score: Number(score) || 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  let pvjProfile = currentTaste.pvjProfile;
  try {
    pvjProfile = computePlayerPvj6dProfile(cleanedPlayer, allPrefs, allGames);
  } catch (err) {
    console.warn('Error in computePlayerPvj6dProfile:', err);
  }

  return {
    ...currentTaste,
    featureVector,
    topDimensions,
    pvjProfile,
    updatedAt: new Date().toISOString(),
  };
}

export function sanitizePlayerProfileNonGames(
  player: PlayerProfile,
  allPrefs: UserGamePreference[],
  allGames: Game[]
): { player: PlayerProfile; changed: boolean } {
  const { cleanedPlayer, removedAny } = stripNonGamesFromPlayer(player);
  const pvjHasNonGames = Boolean(
    cleanedPlayer.tasteProfile?.pvjProfile?.top_influencing_games?.some((g) =>
      isNonGameSteamApp({ appId: g.app_id, name: g.name })
    )
  );

  if (!removedAny && !pvjHasNonGames) {
    return { player, changed: false };
  }

  const updatedTaste = recomputeTasteProfileForPlayer(cleanedPlayer, allPrefs, allGames);
  return {
    player: {
      ...cleanedPlayer,
      tasteProfile: updatedTaste,
    },
    changed: true,
  };
}
