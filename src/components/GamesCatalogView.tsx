import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  CategoryPreferenceLevel,
  ExternalGamePlatform,
  GAME_CATEGORIES,
  GameRating,
  PodiumGameEntry,
  TasteDimensionKey,
  UnifiedSelectorGame,
  UserGamePreference,
} from '@/types/domain';
import {
  KnowledgeGameEntry,
  buildPlayerTasteProfile,
  buildUnifiedGameSelectorList,
  normalizeGameName,
} from '@/lib/tasteProfileEngine';
import { computePlayerPvj6dProfile } from '@/lib/playerCategorizationEngine';
import {
  SearchedSteamGame,
  fetchExternalDiscoveryGames,
  searchSteamStoreGames,
} from '@/lib/steamService';
import {
  ActivePodiumPickerState,
  CatalogPlayerFilter,
  CatalogSortBy,
  FALLBACK_GAME_COVER,
  GameGroupMetrics,
  RATING_INFO,
  SelectorFilterTab,
  getSafeCoverUrl,
  isValidSteamProfileInput,
} from '@/components/catalog/sharedCatalogConstants';
import { GamerProfileSplitView } from '@/components/catalog/GamerProfileSplitView';
import { ClubMatrixTableView } from '@/components/catalog/ClubMatrixTableView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Library, UserCheck, X } from 'lucide-react';

export interface GamesCatalogViewProps {
  /** Compact layout mode when embedded inside the interactive onboarding tour */
  embeddedInTour?: boolean;
  /** Controlled Step 2 visibility (Categories & ADN Gamer): parent can hide Step 2 until finalized */
  profileRevealed?: boolean;
  /** Callback when Step 2 visibility toggles */
  onProfileRevealedChange?: (revealed: boolean) => void;
}

export function GamesCatalogView({
  embeddedInTour = false,
  profileRevealed,
  onProfileRevealedChange,
}: GamesCatalogViewProps) {
  const {
    games,
    preferences,
    updateGamePreference,
    addGame,
    currentUser,
    players,
    activeGroup,
    discordConfig,
    updateCategoryPreferences,
    importSteamProfile,
    updatePlayerTasteProfile,
    setUnifiedGameFeedback,
  } = useApp();

  const needsTasteSetup =
    !currentUser.steamProfile &&
    !(currentUser.tasteProfile?.topMultiplayerGames?.length);

  const [activeTab, setActiveTab] = useState<'profiler' | 'catalog'>(() =>
    embeddedInTour || needsTasteSetup ? 'profiler' : 'catalog'
  );

  // Two-phase profiling flow state preserved for OnboardingTourModal compatibility
  const [internalProfileRevealed, setInternalProfileRevealed] =
    useState<boolean>(false);
  const topContainerRef = useRef<HTMLDivElement | null>(null);
  const isProfileRevealed =
    profileRevealed !== undefined ? profileRevealed : internalProfileRevealed;

  const setProfileRevealed = useCallback(
    (revealed: boolean) => {
      if (profileRevealed === undefined) {
        setInternalProfileRevealed(revealed);
      }
      onProfileRevealedChange?.(revealed);
      if (revealed) {
        window.setTimeout(() => {
          topContainerRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }, 40);
      }
    },
    [profileRevealed, onProfileRevealedChange]
  );

  // Shared Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  // Steam & API Keys State
  const [steamUrlInput, setSteamUrlInput] = useState<string>(
    currentUser.steamProfile?.profileUrl || ''
  );
  const [isSyncingSteam, setIsSyncingSteam] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<{
    ok: boolean;
    message: string;
    autoTriggered?: boolean;
  } | null>(null);
  const lastAutoSyncedInputRef = useRef<string>(
    (currentUser.steamProfile?.profileUrl || '').trim()
  );

  // Unified selector & podium state
  const [discoveryGames, setDiscoveryGames] = useState<KnowledgeGameEntry[]>(
    []
  );
  const [isLoadingDiscovery, setIsLoadingDiscovery] = useState<boolean>(false);
  const [selectorTab, setSelectorTab] = useState<SelectorFilterTab>('all');
  const [selectorQuery, setSelectorQuery] = useState<string>('');
  const [liveSearchResults, setLiveSearchResults] = useState<
    SearchedSteamGame[]
  >([]);
  const [isSearchingLive, setIsSearchingLive] = useState<boolean>(false);
  const [visibleLimit, setVisibleLimit] = useState<number>(
    embeddedInTour ? 18 : 36
  );

  const [activePodiumPicker, setActivePodiumPicker] =
    useState<ActivePodiumPickerState | null>(null);
  const [podiumSearchQuery, setPodiumSearchQuery] = useState<string>('');
  const [podiumLiveResults, setPodiumLiveResults] = useState<
    SearchedSteamGame[]
  >([]);
  const [isSearchingPodiumLive, setIsSearchingPodiumLive] =
    useState<boolean>(false);

  // Club Matrix Filter & Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [playerFilter, setPlayerFilter] =
    useState<CatalogPlayerFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<CatalogSortBy>(() =>
    currentUser.steamProfile ? 'likelihood' : 'synchrony'
  );

  // Sync user-local state on user change
  useEffect(() => {
    const existingUrl = currentUser.steamProfile?.profileUrl || '';
    setSteamUrlInput(existingUrl);
    lastAutoSyncedInputRef.current = existingUrl.trim();
    setSyncResult(null);
    setActivePodiumPicker(null);
    setInternalProfileRevealed(false);
  }, [currentUser.id, currentUser.steamProfile?.profileUrl]);

  useEffect(() => {
    setVisibleLimit(embeddedInTour ? 18 : 36);
  }, [selectorTab, selectorQuery, embeddedInTour]);

  // Fetch IGDB / SteamSpy live discovery games
  useEffect(() => {
    let cancelled = false;
    setIsLoadingDiscovery(true);
    fetchExternalDiscoveryGames({
      igdbClientId: discordConfig.igdbClientId,
      igdbClientSecret: discordConfig.igdbClientSecret,
    })
      .then((items) => {
        if (!cancelled) setDiscoveryGames(items);
      })
      .catch(() => {
        if (!cancelled) setDiscoveryGames([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDiscovery(false);
      });

    return () => {
      cancelled = true;
    };
  }, [discordConfig.igdbClientId, discordConfig.igdbClientSecret]);

  // Core Steam sync helper
  const executeSteamSync = useCallback(
    async (rawUrlOrId: string, autoTriggered: boolean) => {
      const clean = rawUrlOrId.trim();
      if (!clean) return;

      lastAutoSyncedInputRef.current = clean;
      setIsSyncingSteam(true);
      setSyncResult(null);

      try {
        const res = await importSteamProfile(
          clean,
          discordConfig.steamApiKey || undefined
        );
        setSyncResult({
          ok: res.ok,
          message: res.message,
          autoTriggered,
        });
        if (res.ok) {
          showToast(
            autoTriggered
              ? '⚡ Link detectado: Steam cargado y juegos organizados automáticamente.'
              : '✅ ¡Biblioteca de Steam sincronizada y selector actualizado!'
          );
        }
      } finally {
        setIsSyncingSteam(false);
      }
    },
    [importSteamProfile, discordConfig.steamApiKey, showToast]
  );

  // Auto-load valid Steam link pasted/typed
  useEffect(() => {
    const clean = steamUrlInput.trim();
    if (!clean || isSyncingSteam) return;
    if (!isValidSteamProfileInput(clean)) return;
    if (clean === lastAutoSyncedInputRef.current) return;
    if (clean === (currentUser.steamProfile?.profileUrl || '').trim()) return;

    const timer = window.setTimeout(() => {
      executeSteamSync(clean, true);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    steamUrlInput,
    isSyncingSteam,
    currentUser.steamProfile?.profileUrl,
    executeSteamSync,
  ]);

  // Auto-live IGDB / Steam Store search for Unified Selector
  useEffect(() => {
    const q = selectorQuery.trim();
    if (q.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    let cancelled = false;
    setIsSearchingLive(true);

    const timer = window.setTimeout(async () => {
      try {
        const items = await searchSteamStoreGames(q, {
          igdbClientId: discordConfig.igdbClientId,
          igdbClientSecret: discordConfig.igdbClientSecret,
        });
        if (!cancelled) setLiveSearchResults(items);
      } catch {
        if (!cancelled) setLiveSearchResults([]);
      } finally {
        if (!cancelled) setIsSearchingLive(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectorQuery, discordConfig.igdbClientId, discordConfig.igdbClientSecret]);

  // Auto-live search for Podium Picker
  useEffect(() => {
    const q = podiumSearchQuery.trim();
    if (!activePodiumPicker || q.length < 2) {
      setPodiumLiveResults([]);
      setIsSearchingPodiumLive(false);
      return;
    }

    let cancelled = false;
    setIsSearchingPodiumLive(true);

    const timer = window.setTimeout(async () => {
      try {
        const items = await searchSteamStoreGames(q, {
          igdbClientId: discordConfig.igdbClientId,
          igdbClientSecret: discordConfig.igdbClientSecret,
        });
        if (!cancelled) setPodiumLiveResults(items);
      } catch {
        if (!cancelled) setPodiumLiveResults([]);
      } finally {
        if (!cancelled) setIsSearchingPodiumLive(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activePodiumPicker,
    podiumSearchQuery,
    discordConfig.igdbClientId,
    discordConfig.igdbClientSecret,
  ]);

  // Unified Data & Ranking
  const unifiedGames = useMemo<UnifiedSelectorGame[]>(() => {
    return buildUnifiedGameSelectorList({
      player: currentUser,
      allPreferences: preferences,
      catalogGames: games,
      discoveryGames,
      liveSearchResults,
    });
  }, [currentUser, preferences, games, discoveryGames, liveSearchResults]);

  const unifiedPodiumPool = useMemo<UnifiedSelectorGame[]>(() => {
    if (!activePodiumPicker) return [];
    const combinedLive = [...liveSearchResults, ...podiumLiveResults];
    return buildUnifiedGameSelectorList({
      player: currentUser,
      allPreferences: preferences,
      catalogGames: games,
      discoveryGames,
      liveSearchResults: combinedLive,
    });
  }, [
    activePodiumPicker,
    currentUser,
    preferences,
    games,
    discoveryGames,
    liveSearchResults,
    podiumLiveResults,
  ]);

  const ownedSteamCount = currentUser.steamProfile?.ownedGames?.length || 0;

  const pvjProfile = useMemo(
    () => computePlayerPvj6dProfile(currentUser, preferences, games),
    [currentUser, preferences, games]
  );

  const tabCounts = useMemo<Record<SelectorFilterTab, number>>(() => {
    let active = 0;
    let discover = 0;
    let mp = 0;
    let sp = 0;
    let steam = 0;

    for (const g of unifiedGames) {
      if (g.isPlayedOrRatedByUser || (g.ownedOnSteam && g.playtimeHours >= 2))
        active++;
      if (!g.ownedOnSteam) discover++;
      if (g.isMultiplayer && g.maxPlayers >= 3) mp++;
      else if (!g.isMultiplayer || g.maxPlayers <= 2) sp++;
      if (g.ownedOnSteam) steam++;
    }

    return {
      all: unifiedGames.length,
      active,
      discover,
      mp,
      sp,
      steam,
    };
  }, [unifiedGames]);

  const filteredUnifiedGames = useMemo<UnifiedSelectorGame[]>(() => {
    const q = selectorQuery.trim().toLowerCase();

    return unifiedGames.filter((g) => {
      if (selectorTab === 'active') {
        const isActive =
          g.isPlayedOrRatedByUser || (g.ownedOnSteam && g.playtimeHours >= 2);
        if (!isActive) return false;
      } else if (selectorTab === 'discover') {
        if (g.ownedOnSteam) return false;
      } else if (selectorTab === 'mp') {
        if (!(g.isMultiplayer && g.maxPlayers >= 3)) return false;
      } else if (selectorTab === 'sp') {
        if (g.isMultiplayer && g.maxPlayers > 2) return false;
      } else if (selectorTab === 'steam') {
        if (!g.ownedOnSteam) return false;
      }

      if (q) {
        const matchesText =
          g.name.toLowerCase().includes(q) ||
          g.category.toLowerCase().includes(q) ||
          g.platform.toLowerCase().includes(q) ||
          g.genres.some((gen) => gen.toLowerCase().includes(q)) ||
          g.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesText) return false;
      }

      return true;
    });
  }, [unifiedGames, selectorTab, selectorQuery]);

  const displayedUnifiedGames = useMemo(
    () => filteredUnifiedGames.slice(0, visibleLimit),
    [filteredUnifiedGames, visibleLimit]
  );

  const selectedGamesCount = useMemo(
    () => unifiedGames.filter((g) => g.isPlayedOrRatedByUser).length,
    [unifiedGames]
  );

  // Podiums
  const topMultiplayerGames = useMemo<PodiumGameEntry[]>(() => {
    return [...(currentUser.tasteProfile?.topMultiplayerGames || [])].sort(
      (a, b) => a.rank - b.rank
    );
  }, [currentUser.tasteProfile?.topMultiplayerGames]);

  const topSingleplayerGames = useMemo<PodiumGameEntry[]>(() => {
    return [...(currentUser.tasteProfile?.topSingleplayerGames || [])].sort(
      (a, b) => a.rank - b.rank
    );
  }, [currentUser.tasteProfile?.topSingleplayerGames]);

  const findPodiumRank = useCallback(
    (gameName: string): { type: 'mp' | 'sp'; rank: 1 | 2 | 3 } | null => {
      const norm = normalizeGameName(gameName);
      const mpMatch = topMultiplayerGames.find(
        (m) => normalizeGameName(m.name) === norm
      );
      if (mpMatch) return { type: 'mp', rank: mpMatch.rank };
      const spMatch = topSingleplayerGames.find(
        (s) => normalizeGameName(s.name) === norm
      );
      if (spMatch) return { type: 'sp', rank: spMatch.rank };
      return null;
    },
    [topMultiplayerGames, topSingleplayerGames]
  );

  const podiumPickerCandidates = useMemo<UnifiedSelectorGame[]>(() => {
    if (!activePodiumPicker) return [];
    const isMp = activePodiumPicker.type === 'mp';
    const q = podiumSearchQuery.trim().toLowerCase();

    return unifiedPodiumPool
      .filter((g) => {
        if (isMp && !(g.isMultiplayer && g.maxPlayers >= 3)) return false;
        if (!isMp && g.isMultiplayer && g.maxPlayers > 4 && !q) return false;
        if (q) {
          const matches =
            g.name.toLowerCase().includes(q) ||
            g.category.toLowerCase().includes(q) ||
            g.platform.toLowerCase().includes(q) ||
            g.tags.some((t) => t.toLowerCase().includes(q));
          if (!matches) return false;
        }
        return true;
      })
      .slice(0, 24);
  }, [activePodiumPicker, podiumSearchQuery, unifiedPodiumPool]);

  const computedProfileSnapshot = useMemo(
    () => buildPlayerTasteProfile(currentUser, preferences, games),
    [currentUser, preferences, games]
  );

  const topDimensions = useMemo(() => {
    if (
      computedProfileSnapshot.topDimensions &&
      computedProfileSnapshot.topDimensions.length > 0
    ) {
      return computedProfileSnapshot.topDimensions;
    }
    return currentUser.tasteProfile?.topDimensions || [];
  }, [
    computedProfileSnapshot.topDimensions,
    currentUser.tasteProfile?.topDimensions,
  ]);

  const activeFeatureVector = useMemo<
    Partial<Record<TasteDimensionKey, number>>
  >(() => {
    return (
      computedProfileSnapshot.featureVector ||
      currentUser.tasteProfile?.featureVector ||
      {}
    );
  }, [
    computedProfileSnapshot.featureVector,
    currentUser.tasteProfile?.featureVector,
  ]);

  const hasTasteSignal = useMemo(() => {
    return (
      ownedSteamCount > 0 ||
      topMultiplayerGames.length > 0 ||
      topSingleplayerGames.length > 0 ||
      (currentUser.tasteProfile?.externalGames?.length || 0) > 0 ||
      preferences.some((p) => p.userId === currentUser.id && p.plays)
    );
  }, [
    ownedSteamCount,
    topMultiplayerGames.length,
    topSingleplayerGames.length,
    currentUser.tasteProfile?.externalGames?.length,
    preferences,
    currentUser.id,
  ]);

  // Club Matrix Computations
  const prefMap = useMemo(() => {
    const map = new Map<string, UserGamePreference>();
    for (const p of preferences) {
      map.set(`${p.userId}_${p.gameId}`, p);
    }
    return map;
  }, [preferences]);

  const gamesWithMetrics = useMemo<GameGroupMetrics[]>(() => {
    const scopedGames = activeGroup
      ? games.filter((g) => activeGroup.gameIds.includes(g.id))
      : [];
    const scopedPlayers = activeGroup
      ? players.filter((p) => activeGroup.memberIds.includes(p.id))
      : players;

    return scopedGames.map((game) => {
      let playsCount = 0;
      let ratingSum = 0;
      let dislikeCount = 0;
      let lovedCount = 0;

      const playerRatings = scopedPlayers.map((player) => {
        const pref = prefMap.get(`${player.id}_${game.id}`);
        const plays = pref ? pref.plays : false;
        const rating = (pref ? pref.rating : 3) as GameRating;

        if (plays) {
          playsCount++;
          ratingSum += rating;
          if (rating === 1) dislikeCount++;
          if (rating >= 4) lovedCount++;
        }

        return { player, plays, rating };
      });

      const totalPlayers = scopedPlayers.length;
      let synchronyScore = 0;
      let averageRating = 1.0;

      if (playsCount > 0) {
        averageRating = Number((ratingSum / playsCount).toFixed(2));
        let raw = Math.round(averageRating * 20);
        raw -= dislikeCount * 15;
        if (lovedCount === totalPlayers && totalPlayers > 0) {
          raw += 5;
        }
        synchronyScore = Math.min(100, Math.max(0, raw));
      }

      return {
        game,
        playsCount,
        totalPlayers,
        averageRating,
        synchronyScore,
        dislikeCount,
        playerRatings,
      };
    });
  }, [games, players, prefMap, activeGroup]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) => {
      if (g.category) set.add(g.category);
    });
    return Array.from(set);
  }, [games]);

  const unifiedLikelihoodMap = useMemo(() => {
    const map = new Map<
      string,
      { score: number; badge: string; affinity: number }
    >();
    for (const item of unifiedGames) {
      const entry = {
        score: item.likelihoodScore,
        badge: item.likelihoodBadge,
        affinity: item.tasteAffinityPct,
      };
      if (item.catalogGameId) {
        map.set(item.catalogGameId, entry);
      }
      map.set(normalizeGameName(item.name), entry);
    }
    return map;
  }, [unifiedGames]);

  const filteredCatalogGames = useMemo(() => {
    return gamesWithMetrics
      .filter((item) => {
        const g = item.game;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = g.name.toLowerCase().includes(q);
          const matchCat = g.category.toLowerCase().includes(q);
          const matchTags = g.tags.some((t) => t.toLowerCase().includes(q));
          if (!matchName && !matchCat && !matchTags) return false;
        }

        if (selectedCategory !== 'all' && g.category !== selectedCategory)
          return false;

        if (playerFilter === 'up_to_4') return g.maxPlayers <= 4;
        if (playerFilter === '5_players')
          return g.minPlayers <= 5 && g.maxPlayers >= 5;
        if (playerFilter === '6_plus') return g.maxPlayers >= 6;
        if (playerFilter === 'only_mine') {
          const userPref = prefMap.get(`${currentUser.id}_${g.id}`);
          return userPref?.plays === true;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'likelihood') {
          const scoreA =
            unifiedLikelihoodMap.get(a.game.id)?.score ??
            unifiedLikelihoodMap.get(normalizeGameName(a.game.name))?.score ??
            0;
          const scoreB =
            unifiedLikelihoodMap.get(b.game.id)?.score ??
            unifiedLikelihoodMap.get(normalizeGameName(b.game.name))?.score ??
            0;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return b.synchronyScore - a.synchronyScore;
        }
        if (sortBy === 'synchrony') return b.synchronyScore - a.synchronyScore;
        if (sortBy === 'name') return a.game.name.localeCompare(b.game.name);
        if (sortBy === 'max_players')
          return b.game.maxPlayers - a.game.maxPlayers;
        if (sortBy === 'my_rating') {
          const prefA = prefMap.get(`${currentUser.id}_${a.game.id}`);
          const prefB = prefMap.get(`${currentUser.id}_${b.game.id}`);
          const rA = prefA?.plays ? prefA.rating : 0;
          const rB = prefB?.plays ? prefB.rating : 0;
          return rB - rA;
        }
        return 0;
      });
  }, [
    gamesWithMetrics,
    searchQuery,
    selectedCategory,
    playerFilter,
    sortBy,
    prefMap,
    currentUser.id,
    unifiedLikelihoodMap,
  ]);

  const totalMyGames = useMemo(() => {
    return games.filter(
      (g) => prefMap.get(`${currentUser.id}_${g.id}`)?.plays === true
    ).length;
  }, [games, prefMap, currentUser.id]);

  // Handlers
  const handleManualSubmitSteam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!steamUrlInput.trim()) {
      setSyncResult({
        ok: false,
        message: 'Ingresá tu link de Steam o SteamID64 antes de sincronizar.',
      });
      return;
    }
    await executeSteamSync(steamUrlInput.trim(), false);
  };

  const mapUnifiedToPodiumEntry = (
    g: UnifiedSelectorGame
  ): Omit<PodiumGameEntry, 'rank'> => ({
    gameId: g.catalogGameId || g.externalGameId || g.key,
    steamAppId: g.steamAppId,
    name: g.name,
    coverUrl: getSafeCoverUrl(g.coverUrl),
    category: g.category,
    tags: g.tags,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    isMultiplayer: g.isMultiplayer,
    source: g.ownedOnSteam ? 'steam' : g.catalogGameId ? 'catalog' : 'external',
    ...(g.playtimeHours > 0 ? { hoursPlayed: g.playtimeHours } : {}),
    ...(g.playtimeRecentHours > 0
      ? { recentHoursPlayed: g.playtimeRecentHours }
      : {}),
  });

  const assignPodiumEntry = useCallback(
    (
      type: 'mp' | 'sp',
      rank: 1 | 2 | 3,
      entry: Omit<PodiumGameEntry, 'rank'>
    ) => {
      const currentList =
        type === 'mp' ? topMultiplayerGames : topSingleplayerGames;
      const normNew = normalizeGameName(entry.name);

      const filtered = currentList.filter(
        (item) =>
          item.rank !== rank && normalizeGameName(item.name) !== normNew
      );

      const updated: PodiumGameEntry[] = [
        ...filtered,
        {
          ...entry,
          rank,
        },
      ].sort((a, b) => a.rank - b.rank);

      if (type === 'mp') {
        updatePlayerTasteProfile({ topMultiplayerGames: updated });
      } else {
        updatePlayerTasteProfile({ topSingleplayerGames: updated });
      }

      const matchedUnified = unifiedGames.find(
        (g) =>
          (entry.steamAppId !== undefined && g.steamAppId === entry.steamAppId) ||
          normalizeGameName(g.name) === normNew
      );
      const targetUnified: UnifiedSelectorGame = matchedUnified || {
        key: `podium-${normNew}`,
        name: entry.name,
        coverUrl: entry.coverUrl,
        category: entry.category,
        tags: entry.tags,
        genres: [],
        minPlayers: entry.minPlayers,
        maxPlayers: entry.maxPlayers,
        isMultiplayer: entry.isMultiplayer,
        platform: entry.source === 'steam' ? 'Steam' : 'Otro Launcher',
        source: entry.source === 'steam' ? 'steam_owned' : 'external_rated',
        steamAppId: entry.steamAppId,
        ownedOnSteam: entry.source === 'steam',
        playtimeHours: entry.hoursPlayed ?? 0,
        playtimeRecentHours: entry.recentHoursPlayed ?? 0,
        isPlayedOrRatedByUser: true,
        effectiveRating: 5,
        hasExplicitUserRating: true,
        burnedOut: false,
        inClubCatalog: entry.source === 'catalog',
        needsHoursInput: false,
        tasteAffinityPct: 100,
        likelihoodScore: 0,
        likelihoodBadge: 'Top 3',
      };

      setUnifiedGameFeedback(targetUnified, {
        plays: true,
        rating: 5,
        ...(entry.hoursPlayed !== undefined && entry.hoursPlayed > 0
          ? { hoursPlayed: entry.hoursPlayed }
          : {}),
      });

      setActivePodiumPicker(null);
      showToast(
        `🏆 "${entry.name}" asignado al #${rank} ${
          type === 'mp' ? 'Multiplayer' : 'Singleplayer'
        }!`
      );
    },
    [
      topMultiplayerGames,
      topSingleplayerGames,
      unifiedGames,
      updatePlayerTasteProfile,
      setUnifiedGameFeedback,
      showToast,
    ]
  );

  const handleAutoFillPodiumFromSteam = (type: 'mp' | 'sp') => {
    const isMp = type === 'mp';
    const existingList = isMp ? topMultiplayerGames : topSingleplayerGames;
    const occupiedRanks = new Set(existingList.map((e) => e.rank));
    const existingNames = new Set(
      [...topMultiplayerGames, ...topSingleplayerGames].map((e) =>
        normalizeGameName(e.name)
      )
    );

    const eligibleSteamGames = unifiedGames.filter((g) => {
      if (!g.ownedOnSteam || g.burnedOut || g.playtimeHours < 1) return false;
      if (existingNames.has(normalizeGameName(g.name))) return false;
      if (isMp) return g.isMultiplayer && g.maxPlayers >= 3;
      return !g.isMultiplayer || g.maxPlayers <= 2;
    });

    const targetRanks: Array<1 | 2 | 3> = ([1, 2, 3] as const).filter(
      (r) => !occupiedRanks.has(r)
    );

    if (targetRanks.length === 0 || eligibleSteamGames.length === 0) {
      showToast(
        eligibleSteamGames.length === 0
          ? 'No encontramos juegos disponibles en tu Steam para sugerir.'
          : 'Este podio ya tiene los 3 puestos completos.'
      );
      return;
    }

    const addedEntries: PodiumGameEntry[] = [...existingList];
    targetRanks.forEach((rank, idx) => {
      const candidate = eligibleSteamGames[idx];
      if (!candidate) return;
      addedEntries.push({
        ...mapUnifiedToPodiumEntry(candidate),
        rank,
      });
    });

    const sorted = addedEntries.sort((a, b) => a.rank - b.rank);
    if (isMp) {
      updatePlayerTasteProfile({ topMultiplayerGames: sorted });
    } else {
      updatePlayerTasteProfile({ topSingleplayerGames: sorted });
    }
    showToast(
      `✨ Podio ${
        isMp ? 'Multiplayer' : 'Singleplayer'
      } completado con tus juegos top de Steam!`
    );
  };

  const removePodiumRank = (type: 'mp' | 'sp', rank: 1 | 2 | 3) => {
    const currentList =
      type === 'mp' ? topMultiplayerGames : topSingleplayerGames;
    const updated = currentList.filter((item) => item.rank !== rank);
    if (type === 'mp') {
      updatePlayerTasteProfile({ topMultiplayerGames: updated });
    } else {
      updatePlayerTasteProfile({ topSingleplayerGames: updated });
    }
    showToast(`🗑️ Puesto #${rank} liberado.`);
  };

  const handleSetPodiumEntryHours = (
    type: 'mp' | 'sp',
    rank: 1 | 2 | 3,
    hours: number
  ) => {
    const cleanHours = Math.max(0, Math.round(hours));
    const currentList =
      type === 'mp' ? topMultiplayerGames : topSingleplayerGames;
    const targetEntry = currentList.find((e) => e.rank === rank);
    if (!targetEntry) return;

    const updated = currentList.map((e) =>
      e.rank === rank ? { ...e, hoursPlayed: cleanHours } : e
    );

    if (type === 'mp') {
      updatePlayerTasteProfile({ topMultiplayerGames: updated });
    } else {
      updatePlayerTasteProfile({ topSingleplayerGames: updated });
    }

    const matchingUnified = unifiedGames.find(
      (ug) =>
        (targetEntry.steamAppId !== undefined &&
          ug.steamAppId === targetEntry.steamAppId) ||
        normalizeGameName(ug.name) === normalizeGameName(targetEntry.name)
    );
    if (matchingUnified) {
      setUnifiedGameFeedback(matchingUnified, {
        plays: true,
        hoursPlayed: cleanHours,
      });
    }
  };

  const handleAddManualCustomGame = (params: {
    name: string;
    platform: ExternalGamePlatform;
    category: string;
    minPlayers: number;
    maxPlayers: number;
    tags: string;
    rating: GameRating;
    hoursPlayed: number;
    recentHoursPlayed: number;
  }) => {
    const rawTags = params.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const syntheticGame: UnifiedSelectorGame = {
      key: `custom-${normalizeGameName(params.name)}-${Date.now()}`,
      name: params.name,
      coverUrl: FALLBACK_GAME_COVER,
      category: params.category,
      tags: rawTags,
      genres: [params.category],
      minPlayers: params.minPlayers,
      maxPlayers: params.maxPlayers,
      isMultiplayer: params.maxPlayers >= 2,
      platform: params.platform,
      source: 'external_rated',
      ownedOnSteam: false,
      playtimeHours: params.hoursPlayed,
      playtimeRecentHours: params.recentHoursPlayed,
      isPlayedOrRatedByUser: true,
      effectiveRating: params.rating,
      hasExplicitUserRating: true,
      burnedOut: false,
      inClubCatalog: false,
      tasteAffinityPct: 75,
      likelihoodScore: 1000,
      likelihoodBadge: `⭐ ${params.rating}★ (${params.platform})`,
    };

    setUnifiedGameFeedback(syntheticGame, {
      plays: true,
      rating: params.rating,
      platform: params.platform,
      hoursPlayed: params.hoursPlayed,
      recentHoursPlayed: params.recentHoursPlayed,
    });
    setSelectorQuery(params.name);
    setSelectorTab('all');
    showToast(
      `🎮 "${params.name}" (${params.platform}) guardado con ${params.rating}★!`
    );
  };

  const handleSetCategoryPreference = (
    categoryId: string,
    level: CategoryPreferenceLevel
  ) => {
    const updated = {
      ...(currentUser.categoryPreferences || {}),
      [categoryId]: level,
    };
    updateCategoryPreferences(updated);
    const cat = GAME_CATEGORIES.find((c) => c.id === categoryId);
    const label =
      level === 'like'
        ? '💚 Me gusta'
        : level === 'dislike'
          ? '💔 No me gusta'
          : '😐 Neutral';
    showToast(
      `Categoría ${cat?.emoji || ''} "${cat?.label || categoryId}": ${label}`
    );
  };

  const handleSetAllCategories = (level: CategoryPreferenceLevel) => {
    const updated: Record<string, CategoryPreferenceLevel> = {};
    GAME_CATEGORIES.forEach((cat) => {
      updated[cat.id] = level;
    });
    updateCategoryPreferences(updated);
    showToast(
      level === 'like'
        ? '💚 Marcaste todas las categorías como Me gusta.'
        : '😐 Restableciste todas las categorías a Neutral.'
    );
  };

  const handleTogglePlay = (
    gameId: string,
    currentPlays: boolean,
    currentRating: GameRating
  ) => {
    const nextPlays = !currentPlays;
    updateGamePreference(gameId, nextPlays, currentRating || 3);
    const game = games.find((g) => g.id === gameId);
    showToast(
      nextPlays
        ? `✅ Agregaste "${game?.name}" a tus juegos que jugás.`
        : `❌ Marcaste "${game?.name}" como 'No lo juego'.`
    );
  };

  const handleSetRating = (gameId: string, rating: GameRating) => {
    updateGamePreference(gameId, true, rating);
    const game = games.find((g) => g.id === gameId);
    showToast(`⭐ Calificaste "${game?.name}" con ${RATING_INFO[rating].label}`);
  };

  return (
    <div ref={topContainerRef} className="space-y-4">
      {/* Shared Toast Banner */}
      {toastMessage && (
        <div className="px-3.5 py-2.5 rounded-md bg-success/10 border border-success/40 text-success text-xs flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            {toastMessage}
          </span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            title="Cerrar"
            aria-label="Cerrar"
            className="p-0.5 rounded opacity-75 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}

      {/* Primary Two-View Switcher (Mi Perfil vs Matriz) */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'profiler' | 'catalog')}
        className="w-full"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
          <TabsList>
            <TabsTrigger value="profiler" className="gap-1.5">
              <UserCheck className="w-4 h-4" strokeWidth={1.75} />
              <span>Mi Perfil</span>
              {needsTasteSetup && (
                <Badge variant="warning" className="text-[9px] px-1.5 py-0 ml-1">
                  Setup
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="catalog" className="gap-1.5">
              <Library className="w-4 h-4" strokeWidth={1.75} />
              <span>Matriz ({games.length})</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">{totalMyGames}</strong> en club
            </span>
          </div>
        </div>

        <TabsContent value="profiler" className="mt-3">
          <GamerProfileSplitView
            currentUser={currentUser}
            pvjProfile={pvjProfile}
            embeddedInTour={embeddedInTour}
            isProfileRevealed={isProfileRevealed}
            setProfileRevealed={(revealed) => {
              if (revealed && embeddedInTour && selectedGamesCount < 10) return;
              setProfileRevealed(revealed);
            }}
            selectedGamesCount={selectedGamesCount}
            hasTasteSignal={hasTasteSignal}
            topDimensions={topDimensions}
            activeFeatureVector={activeFeatureVector}
            steamUrlInput={steamUrlInput}
            setSteamUrlInput={setSteamUrlInput}
            isSyncingSteam={isSyncingSteam}
            syncResult={syncResult}
            onSubmitSteamSync={handleManualSubmitSteam}
            topMultiplayerGames={topMultiplayerGames}
            topSingleplayerGames={topSingleplayerGames}
            activePodiumPicker={activePodiumPicker}
            setActivePodiumPicker={setActivePodiumPicker}
            podiumSearchQuery={podiumSearchQuery}
            setPodiumSearchQuery={setPodiumSearchQuery}
            podiumPickerCandidates={podiumPickerCandidates}
            isSearchingPodiumLive={isSearchingPodiumLive}
            onAutoFillPodiumFromSteam={handleAutoFillPodiumFromSteam}
            onRemovePodiumRank={removePodiumRank}
            onAssignPodiumEntry={(type, rank, cand) =>
              assignPodiumEntry(type, rank, mapUnifiedToPodiumEntry(cand))
            }
            onDropPodiumGame={(type, rank, payload) => {
              const norm = normalizeGameName(payload.name);
              const matched = unifiedGames.find(
                (g) => normalizeGameName(g.name) === norm
              );
              if (matched) {
                assignPodiumEntry(type, rank, {
                  ...mapUnifiedToPodiumEntry(matched),
                  ...(payload.hoursPlayed !== undefined
                    ? { hoursPlayed: payload.hoursPlayed }
                    : {}),
                });
              } else {
                assignPodiumEntry(type, rank, {
                  gameId: payload.name,
                  name: payload.name,
                  coverUrl: getSafeCoverUrl(payload.coverUrl),
                  category: 'General',
                  tags: [],
                  minPlayers: 1,
                  maxPlayers: 4,
                  isMultiplayer: type === 'mp',
                  source: 'external',
                  ...(payload.hoursPlayed !== undefined
                    ? { hoursPlayed: payload.hoursPlayed }
                    : {}),
                });
              }
            }}
            onSetPodiumEntryHours={handleSetPodiumEntryHours}
            findPodiumRank={findPodiumRank}
            onSetCategoryPreference={handleSetCategoryPreference}
            onSetAllCategories={handleSetAllCategories}
            selectorTab={selectorTab}
            setSelectorTab={setSelectorTab}
            tabCounts={tabCounts}
            selectorQuery={selectorQuery}
            setSelectorQuery={setSelectorQuery}
            isLoadingDiscovery={isLoadingDiscovery}
            isSearchingLive={isSearchingLive}
            filteredUnifiedGames={filteredUnifiedGames}
            displayedUnifiedGames={displayedUnifiedGames}
            visibleLimit={visibleLimit}
            setVisibleLimit={setVisibleLimit}
            onSetUnifiedFeedback={(game, patch) => setUnifiedGameFeedback(game, patch)}
            onAddManualCustomGame={handleAddManualCustomGame}
          />
        </TabsContent>

        <TabsContent value="catalog" className="mt-3">
          <ClubMatrixTableView
            currentUser={currentUser}
            filteredCatalogGames={filteredCatalogGames}
            totalGamesCount={games.length}
            totalMyGames={totalMyGames}
            categories={categories}
            prefMap={prefMap}
            unifiedLikelihoodMap={unifiedLikelihoodMap}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            playerFilter={playerFilter}
            setPlayerFilter={setPlayerFilter}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            sortBy={sortBy}
            setSortBy={setSortBy}
            onTogglePlay={handleTogglePlay}
            onSetRating={handleSetRating}
            onAddGame={(newGame) => {
              const created = addGame(newGame);
              showToast(`🎮 "${created.name}" agregado al catálogo grupal!`);
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
