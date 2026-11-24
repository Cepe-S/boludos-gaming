import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Game, GroupGameRecommendation, PlayerProfile } from '@/types/domain';
import {
  GLOBAL_GAMES_KNOWLEDGE_BASE,
  KnowledgeGameEntry,
  applyRecommendationFeedback,
  generateGroupGameRecommendations,
  normalizeGameName,
} from '@/lib/tasteProfileEngine';
import { fetchExternalDiscoveryGames, getCachedExternalDiscoveryGames } from '@/lib/steamService';

const DISCOVERY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
let cachedDiscoveryGames: KnowledgeGameEntry[] = [];
let cachedDiscoveryFetchedAt = 0;

interface CachedRecResultEntry {
  readyToPlay: GroupGameRecommendation[];
  discovery: GroupGameRecommendation[];
}
const MAX_REC_RESULT_CACHE = 8;
const recommendationResultCache = new Map<string, CachedRecResultEntry>();

export interface UseNewRecommendationsOptions {
  targetPlayers: PlayerProfile[];
  catalogGames: Game[];
  enabled?: boolean;
  maxResults?: number;
  includeReadyToPlay?: boolean;
}

export function useNewRecommendations({
  targetPlayers,
  catalogGames,
  enabled = true,
  maxResults = 30,
  includeReadyToPlay = true,
}: UseNewRecommendationsOptions) {
  const { games, preferences, discordConfig, activeGroup, addGame } = useApp();
  const [liveDiscoveryGames, setLiveDiscoveryGames] = useState<KnowledgeGameEntry[]>(() => {
    if (cachedDiscoveryGames.length > 0) return cachedDiscoveryGames;
    const persisted = getCachedExternalDiscoveryGames();
    if (persisted.length > 0) {
      cachedDiscoveryGames = persisted;
      cachedDiscoveryFetchedAt = Date.now();
    }
    return persisted;
  });

  useEffect(() => {
    const isCacheFresh =
      cachedDiscoveryGames.length > 0 &&
      Date.now() - cachedDiscoveryFetchedAt < DISCOVERY_CACHE_TTL_MS;
    if (!enabled || (liveDiscoveryGames.length > 0 && isCacheFresh)) return;

    let cancelled = false;
    fetchExternalDiscoveryGames({
      igdbClientId: discordConfig.igdbClientId,
      igdbClientSecret: discordConfig.igdbClientSecret,
    })
      .then((res) => {
        if (!cancelled && res.length > 0) {
          cachedDiscoveryGames = res;
          cachedDiscoveryFetchedAt = Date.now();
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

  const targetPlayersKey = useMemo(
    () =>
      targetPlayers
        .map((p) => {
          const catKey = p.categoryPreferences
            ? Object.entries(p.categoryPreferences)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => `${k}:${v}`)
                .join(',')
            : '';
          const steamCount = p.steamProfile?.ownedGames?.length ?? 0;
          const mpPodiumCount = p.tasteProfile?.topMultiplayerGames?.length ?? 0;
          const spPodiumCount = p.tasteProfile?.topSingleplayerGames?.length ?? 0;
          const extCount = p.tasteProfile?.externalGames?.length ?? 0;
          return `${p.id}|${p.tasteProfile?.updatedAt ?? ''}|${p.steamProfile?.lastSyncedAt ?? ''}|${steamCount}|${mpPodiumCount}|${spPodiumCount}|${extCount}|${catKey}`;
        })
        .sort()
        .join(';'),
    [targetPlayers]
  );

  const latestTargetPlayersRef = useRef<PlayerProfile[]>(targetPlayers);
  latestTargetPlayersRef.current = targetPlayers;
  const stableTargetPlayers = useMemo(() => {
    void targetPlayersKey;
    return latestTargetPlayersRef.current;
  }, [targetPlayersKey]);

  const excludeNames = useMemo(
    () => new Set(games.map((g) => normalizeGameName(g.name))),
    [games]
  );

  const recommendationVotes = activeGroup?.recommendationVotes;

  const recCacheKey = useMemo(() => {
    if (!enabled || stableTargetPlayers.length === 0) return '';
    const catalogKey = catalogGames.map((g) => g.id).sort().join(',');
    const excludeKey = `${games.length}:${games.slice(-5).map((g) => g.id).join(',')}`;
    const prefKey = `${preferences.length}:${preferences
      .filter((p) => p.plays)
      .map((p) => `${p.userId}:${p.gameId}:${p.rating}`)
      .join(',')}`;
    return `${targetPlayersKey}|${catalogKey}|${excludeKey}|${prefKey}|${liveDiscoveryGames.length}|${maxResults}|${includeReadyToPlay ? 1 : 0}`;
  }, [
    enabled,
    stableTargetPlayers.length,
    targetPlayersKey,
    catalogGames,
    games,
    preferences,
    liveDiscoveryGames.length,
    maxResults,
    includeReadyToPlay,
  ]);

  const baseRecommendationResult = useMemo(() => {
    if (!enabled || stableTargetPlayers.length === 0) {
      return { readyToPlay: [] as GroupGameRecommendation[], discovery: [] as GroupGameRecommendation[] };
    }

    const cached = recommendationResultCache.get(recCacheKey);
    if (cached) {
      return cached;
    }

    const result = generateGroupGameRecommendations({
      targetPlayers: stableTargetPlayers,
      catalogGames,
      preferences,
      externalDiscoveryGames:
        liveDiscoveryGames.length > 0 ? liveDiscoveryGames : GLOBAL_GAMES_KNOWLEDGE_BASE,
      maxResultsPerCategory: maxResults,
      excludeNames,
    });

    const filteredDiscovery = result.discovery.filter((rec) => {
      if (rec.recommendationType !== 'discovery' || rec.catalogGameId) return false;
      if (excludeNames.has(normalizeGameName(rec.name))) return false;
      return true;
    });

    const computed: CachedRecResultEntry = {
      readyToPlay: includeReadyToPlay ? result.readyToPlay : [],
      discovery: filteredDiscovery,
    };

    if (recommendationResultCache.size >= MAX_REC_RESULT_CACHE) {
      const oldestKey = recommendationResultCache.keys().next().value;
      if (oldestKey !== undefined) recommendationResultCache.delete(oldestKey);
    }
    recommendationResultCache.set(recCacheKey, computed);
    return computed;
  }, [
    recCacheKey,
    enabled,
    stableTargetPlayers,
    catalogGames,
    preferences,
    liveDiscoveryGames,
    maxResults,
    excludeNames,
    includeReadyToPlay,
  ]);

  const recommendationResult = useMemo(
    () => ({
      readyToPlay: baseRecommendationResult.readyToPlay,
      discovery: applyRecommendationFeedback(
        baseRecommendationResult.discovery,
        recommendationVotes
      ),
    }),
    [baseRecommendationResult, recommendationVotes]
  );

  const newRecommendations = recommendationResult.discovery;
  const readyToPlayRecommendations = recommendationResult.readyToPlay;

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
    readyToPlayRecommendations,
    liveDiscoveryGames,
    ensureCatalogGameFromRec,
  };
}
