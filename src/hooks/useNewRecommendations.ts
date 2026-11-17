import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Game, GroupGameRecommendation, PlayerProfile } from '@/types/domain';
import {
  GLOBAL_GAMES_KNOWLEDGE_BASE,
  KnowledgeGameEntry,
  generateGroupGameRecommendations,
  normalizeGameName,
} from '@/lib/tasteProfileEngine';
import { fetchExternalDiscoveryGames } from '@/lib/steamService';

let cachedDiscoveryGames: KnowledgeGameEntry[] = [];

export interface UseNewRecommendationsOptions {
  targetPlayers: PlayerProfile[];
  catalogGames: Game[];
  enabled?: boolean;
  maxResults?: number;
}

export function useNewRecommendations({
  targetPlayers,
  catalogGames,
  enabled = true,
  maxResults = 9,
}: UseNewRecommendationsOptions) {
  const { games, preferences, discordConfig, addGame } = useApp();
  const [liveDiscoveryGames, setLiveDiscoveryGames] = useState<KnowledgeGameEntry[]>(
    () => cachedDiscoveryGames
  );

  useEffect(() => {
    if (!enabled || liveDiscoveryGames.length > 0) return;
    let cancelled = false;
    fetchExternalDiscoveryGames({
      igdbClientId: discordConfig.igdbClientId,
      igdbClientSecret: discordConfig.igdbClientSecret,
    })
      .then((res) => {
        if (!cancelled && res.length > 0) {
          cachedDiscoveryGames = res;
          setLiveDiscoveryGames(res);
        }
      })
      .catch(() => {
        // Silently fall back to GLOBAL_GAMES_KNOWLEDGE_BASE
      });
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    liveDiscoveryGames.length,
    discordConfig.igdbClientId,
    discordConfig.igdbClientSecret,
  ]);

  const newRecommendations = useMemo(() => {
    if (!enabled || targetPlayers.length === 0) {
      return [];
    }

    const result = generateGroupGameRecommendations({
      targetPlayers,
      catalogGames,
      preferences,
      externalDiscoveryGames:
        liveDiscoveryGames.length > 0 ? liveDiscoveryGames : GLOBAL_GAMES_KNOWLEDGE_BASE,
      maxResultsPerCategory: maxResults,
    });

    const existingNames = new Set(games.map((g) => normalizeGameName(g.name)));

    return result.discovery.filter((rec) => {
      if (rec.recommendationType !== 'discovery' || rec.catalogGameId) return false;
      if (existingNames.has(normalizeGameName(rec.name))) return false;
      return true;
    });
  }, [enabled, targetPlayers, catalogGames, preferences, liveDiscoveryGames, maxResults, games]);

  const ensureCatalogGameFromRec = useCallback(
    (rec: GroupGameRecommendation): Game | null => {
      if (rec.catalogGameId) {
        return games.find((g) => g.id === rec.catalogGameId) ?? null;
      }
      const norm = normalizeGameName(rec.name);
      const existing = games.find((g) => normalizeGameName(g.name) === norm);
      if (existing) return existing;

      return addGame({
        name: rec.name,
        description: rec.description || 'Agregado desde Recomendaciones IA Grupales',
        coverUrl: rec.coverUrl,
        minPlayers: rec.minPlayers,
        maxPlayers: rec.maxPlayers,
        category: rec.category,
        tags: rec.tags,
        averageDurationMins: 60,
      });
    },
    [games, addGame]
  );

  return {
    newRecommendations,
    ensureCatalogGameFromRec,
  };
}
