import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  Game,
  GroupGameRecommendation,
  GroupRecommendationVotesMap,
  PlayerProfile,
  RecommendationVoteValue,
} from '@/types/domain';
import {
  KnowledgeGameEntry,
  UnifiedSearchCandidate,
  normalizeGameName,
  resolveGameOfficialUrl,
  searchMultiPlatformGamesForAffinity,
} from '@/lib/tasteProfileEngine';
import {
  SearchedSteamGame,
  fetchExternalDiscoveryGames,
  searchSteamStoreGames,
} from '@/lib/steamService';
import { DEFAULT_RECOMMENDATION_COVER } from './GroupRecommendationCard';
import {
  getSafeCoverUrl,
  handleImageFallback,
} from '@/components/catalog/sharedCatalogConstants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  ArrowUpDown,
  Brain,
  CheckCircle2,
  ChevronDown,
  Compass,
  Dna,
  ExternalLink,
  Flame,
  Gamepad2,
  Loader2,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Users,
  X,
} from 'lucide-react';

export type RecommendationQuickFilter = 'all' | 'new_releases' | 'majority';
export type RecommendationSortBy = 'affinity' | 'votes' | 'newest';

const INITIAL_VISIBLE_COUNT = 12;

export interface SessionRecommendationsViewProps {
  recommendations: GroupGameRecommendation[];
  onImportRecommendation: (rec: GroupGameRecommendation) => void;
  title?: string;
  emptyMessage?: string;
  actionLabel?: string;
  eligibleVoterIds?: string[];
  votesMap?: GroupRecommendationVotesMap;
  onVote?: (
    recKey: string,
    vote: RecommendationVoteValue | null,
    gameName: string
  ) => void;
  targetPlayers?: PlayerProfile[];
  showAffinitySearch?: boolean;
  readyToPlayRecommendations?: GroupGameRecommendation[];
  readyTitle?: string;
  readyEmptyMessage?: string;
  onSelectExistingGame?: (rec: GroupGameRecommendation) => void;
  lockedGameIds?: string[];
  chosenGameId?: string;
  liveDiscoveryGames?: KnowledgeGameEntry[];
}

interface EnrichedRecommendation {
  rec: GroupGameRecommendation;
  originalIndex: number;
  recKey: string;
  recVotes: Record<string, RecommendationVoteValue>;
  isNewRelease: boolean;
  upVoters: string[];
  downVoters: string[];
  eligibleCount: number;
  isMajorityAccepted: boolean;
  currentUserVote: RecommendationVoteValue | null;
}

function mapSearchedGameToCandidate(
  item: SearchedSteamGame
): UnifiedSearchCandidate {
  return {
    igdbId: item.igdbId,
    appId: item.appId,
    steamAppId: item.appId,
    name: item.name,
    description: item.summary,
    summary: item.summary,
    headerImageUrl: item.headerImageUrl,
    coverUrl: item.headerImageUrl,
    category: item.category,
    genres: item.genres,
    tags: item.tags,
    tagVotes: item.tagVotes,
    isMultiplayer: item.isMultiplayer,
    minPlayers: item.minPlayers,
    maxPlayers: item.maxPlayers,
    rating: item.rating,
    source: item.source,
  };
}

export const SessionRecommendationsView: React.FC<
  SessionRecommendationsViewProps
> = ({
  recommendations,
  onImportRecommendation,
  title = 'Descubrimiento para el Grupo',
  emptyMessage = 'No hay recomendaciones nuevas sin agregar.',
  actionLabel = 'Importar y fijar',
  eligibleVoterIds,
  votesMap,
  onVote,
  targetPlayers,
  showAffinitySearch = true,
  readyToPlayRecommendations,
  readyTitle = 'Para Jugar Ahora · Juegos del Grupo',
  readyEmptyMessage = 'El grupo todavía no tiene juegos cargados compatibles.',
  onSelectExistingGame,
  lockedGameIds,
  chosenGameId,
  liveDiscoveryGames,
}) => {
  const {
    activeGroup,
    currentUser,
    players,
    games,
    preferences,
    discordConfig,
    voteGroupRecommendation,
  } = useApp();

  const [quickFilter, setQuickFilter] =
    useState<RecommendationQuickFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<RecommendationSortBy>('affinity');
  const [visibleCount, setVisibleCount] = useState<number>(
    INITIAL_VISIBLE_COUNT
  );

  // Multi-platform affinity search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [liveSearchResults, setLiveSearchResults] = useState<
    UnifiedSearchCandidate[]
  >([]);
  const [isSearchingLive, setIsSearchingLive] = useState<boolean>(false);
  const [internalDiscoveryGames, setInternalDiscoveryGames] = useState<
    KnowledgeGameEntry[]
  >([]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [quickFilter, selectedCategory, sortBy]);

  useEffect(() => {
    if (
      !showAffinitySearch ||
      (liveDiscoveryGames && liveDiscoveryGames.length > 0) ||
      internalDiscoveryGames.length > 0
    ) {
      return;
    }
    let cancelled = false;
    fetchExternalDiscoveryGames({
      igdbClientId: discordConfig.igdbClientId,
      igdbClientSecret: discordConfig.igdbClientSecret,
    })
      .then((res) => {
        if (!cancelled && res.length > 0) {
          setInternalDiscoveryGames(res);
        }
      })
      .catch(() => {
        // Fallback handled inside searchMultiPlatformGamesForAffinity
      });
    return () => {
      cancelled = true;
    };
  }, [
    showAffinitySearch,
    liveDiscoveryGames,
    internalDiscoveryGames.length,
    discordConfig.igdbClientId,
    discordConfig.igdbClientSecret,
  ]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!showAffinitySearch || trimmed.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    let cancelled = false;
    setIsSearchingLive(true);

    const timer = window.setTimeout(async () => {
      try {
        const items = await searchSteamStoreGames(trimmed, {
          igdbClientId: discordConfig.igdbClientId,
          igdbClientSecret: discordConfig.igdbClientSecret,
        });
        if (!cancelled) {
          setLiveSearchResults(items.map(mapSearchedGameToCandidate));
        }
      } catch {
        if (!cancelled) {
          setLiveSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearchingLive(false);
        }
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    searchQuery,
    showAffinitySearch,
    discordConfig.igdbClientId,
    discordConfig.igdbClientSecret,
  ]);

  const resolvedVotesMap: GroupRecommendationVotesMap =
    votesMap ?? activeGroup?.recommendationVotes ?? {};

  const resolvedTargetPlayers = useMemo(() => {
    if (targetPlayers && targetPlayers.length > 0) return targetPlayers;
    if (activeGroup) {
      const memberSet = new Set(activeGroup.memberIds);
      const members = players.filter((p) => memberSet.has(p.id));
      if (members.length > 0) return members;
    }
    return players;
  }, [targetPlayers, activeGroup, players]);

  const resolvedCatalogGames = useMemo(() => {
    if (!activeGroup) return games;
    const groupGameSet = new Set(activeGroup.gameIds);
    return games.filter((g) => groupGameSet.has(g.id));
  }, [activeGroup, games]);

  const catalogByNormName = useMemo(() => {
    const map = new Map<string, Game>();
    for (const g of resolvedCatalogGames) {
      map.set(normalizeGameName(g.name), g);
    }
    return map;
  }, [resolvedCatalogGames]);

  const groupEligibleIds = useMemo(() => {
    if (eligibleVoterIds && eligibleVoterIds.length > 0) {
      return Array.from(new Set(eligibleVoterIds));
    }
    if (activeGroup?.memberIds && activeGroup.memberIds.length > 0) {
      return Array.from(new Set(activeGroup.memberIds));
    }
    return [];
  }, [eligibleVoterIds, activeGroup?.memberIds]);

  const enrichRecommendation = useCallback(
    (
      rec: GroupGameRecommendation,
      originalIndex: number
    ): EnrichedRecommendation => {
      const recKey = rec.recKey || `name:${normalizeGameName(rec.name)}`;
      const recVotes = resolvedVotesMap[recKey] || {};

      const itemEligibleIds =
        groupEligibleIds.length > 0
          ? groupEligibleIds
          : Array.from(new Set(rec.playerBreakdowns.map((b) => b.userId)));

      const voterIdSet = new Set(itemEligibleIds);
      const eligibleCount =
        itemEligibleIds.length || rec.playerBreakdowns.length || 1;

      const upVoters: string[] = [];
      const downVoters: string[] = [];

      for (const [uid, vote] of Object.entries(recVotes)) {
        if (voterIdSet.size > 0 && !voterIdSet.has(uid)) continue;
        if (vote === 'up') upVoters.push(uid);
        else if (vote === 'down') downVoters.push(uid);
      }

      const majorityThreshold = Math.floor(eligibleCount / 2) + 1;
      const isMajorityAccepted =
        upVoters.length >= majorityThreshold ||
        (upVoters.length >= 2 &&
          upVoters.length > downVoters.length &&
          upVoters.length >= Math.ceil(eligibleCount * 0.5));

      const isNewRelease =
        rec.isNewRelease ??
        (rec.releaseYear !== undefined &&
          rec.releaseYear >= 2022 &&
          rec.releaseYear <= 2026);

      const currentUserVote = recVotes[currentUser.id] ?? null;

      return {
        rec,
        originalIndex,
        recKey,
        recVotes,
        isNewRelease,
        upVoters,
        downVoters,
        eligibleCount,
        isMajorityAccepted,
        currentUserVote,
      };
    },
    [resolvedVotesMap, groupEligibleIds, currentUser.id]
  );

  const enrichedRecommendations = useMemo<EnrichedRecommendation[]>(
    () => recommendations.map((rec, idx) => enrichRecommendation(rec, idx)),
    [recommendations, enrichRecommendation]
  );

  const enrichedReadyRecommendations = useMemo<EnrichedRecommendation[]>(() => {
    if (!readyToPlayRecommendations) return [];
    return readyToPlayRecommendations.map((rec, idx) =>
      enrichRecommendation(rec, idx)
    );
  }, [readyToPlayRecommendations, enrichRecommendation]);

  const searchResults = useMemo<GroupGameRecommendation[]>(() => {
    const trimmed = searchQuery.trim();
    if (!showAffinitySearch || trimmed.length === 0) return [];
    const discoveryPool =
      liveDiscoveryGames && liveDiscoveryGames.length > 0
        ? liveDiscoveryGames
        : internalDiscoveryGames;
    return searchMultiPlatformGamesForAffinity({
      query: trimmed,
      targetPlayers: resolvedTargetPlayers,
      preferences,
      catalogGames: resolvedCatalogGames,
      discoveryGames: discoveryPool,
      liveSearchResults,
      limit: 18,
    });
  }, [
    searchQuery,
    showAffinitySearch,
    liveDiscoveryGames,
    internalDiscoveryGames,
    resolvedTargetPlayers,
    preferences,
    resolvedCatalogGames,
    liveSearchResults,
  ]);

  const enrichedSearchResults = useMemo<EnrichedRecommendation[]>(
    () => searchResults.map((rec, idx) => enrichRecommendation(rec, idx)),
    [searchResults, enrichRecommendation]
  );

  const majorityCount = useMemo(
    () =>
      enrichedRecommendations.filter((item) => item.isMajorityAccepted).length,
    [enrichedRecommendations]
  );

  const topCategories = useMemo(() => {
    const counts = new Map<string, number>();
    const combined = [
      ...enrichedRecommendations,
      ...enrichedReadyRecommendations,
    ];
    for (const item of combined) {
      if (!item.rec.category) continue;
      counts.set(item.rec.category, (counts.get(item.rec.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([category]) => category);
  }, [enrichedRecommendations, enrichedReadyRecommendations]);

  const applyFiltersAndSort = useCallback(
    (items: EnrichedRecommendation[]): EnrichedRecommendation[] => {
      const filtered = items.filter((item) => {
        if (quickFilter === 'new_releases' && !item.isNewRelease) return false;
        if (quickFilter === 'majority' && !item.isMajorityAccepted)
          return false;
        if (
          selectedCategory !== 'all' &&
          item.rec.category !== selectedCategory
        ) {
          return false;
        }
        return true;
      });

      const sorted = [...filtered];
      sorted.sort((a, b) => {
        if (sortBy === 'votes') {
          const netDiff =
            b.upVoters.length -
            b.downVoters.length -
            (a.upVoters.length - a.downVoters.length);
          if (netDiff !== 0) return netDiff;
          const upDiff = b.upVoters.length - a.upVoters.length;
          if (upDiff !== 0) return upDiff;
          return b.rec.groupArithmeticScore - a.rec.groupArithmeticScore;
        }
        if (sortBy === 'newest') {
          const yearDiff =
            (b.rec.releaseYear ?? 0) - (a.rec.releaseYear ?? 0);
          if (yearDiff !== 0) return yearDiff;
          return b.rec.groupArithmeticScore - a.rec.groupArithmeticScore;
        }
        return a.originalIndex - b.originalIndex;
      });

      return sorted;
    },
    [quickFilter, selectedCategory, sortBy]
  );

  const filteredReadyRecommendations = useMemo(
    () => applyFiltersAndSort(enrichedReadyRecommendations),
    [enrichedReadyRecommendations, applyFiltersAndSort]
  );

  const filteredRecommendations = useMemo(
    () => applyFiltersAndSort(enrichedRecommendations),
    [enrichedRecommendations, applyFiltersAndSort]
  );

  const visibleRecommendations = useMemo(
    () => filteredRecommendations.slice(0, visibleCount),
    [filteredRecommendations, visibleCount]
  );

  const remainingCount =
    filteredRecommendations.length - visibleRecommendations.length;

  const canVote = Boolean(onVote || activeGroup);

  const handleVote = (
    recKey: string,
    targetVote: RecommendationVoteValue,
    currentVote: RecommendationVoteValue | null,
    gameName: string
  ) => {
    const nextVote: RecommendationVoteValue | null =
      currentVote === targetVote ? null : targetVote;
    if (onVote) {
      onVote(recKey, nextVote, gameName);
      return;
    }
    if (activeGroup) {
      voteGroupRecommendation(activeGroup.id, recKey, nextVote, gameName);
    }
  };

  const renderRecommendationCard = (
    item: EnrichedRecommendation,
    options?: { isReadyContext?: boolean }
  ) => {
    const {
      rec,
      recKey,
      recVotes,
      upVoters,
      downVoters,
      eligibleCount,
      isMajorityAccepted,
      currentUserVote,
    } = item;

    const coverUrl = getSafeCoverUrl(
      rec.coverUrl || DEFAULT_RECOMMENDATION_COVER
    );
    const officialUrl = resolveGameOfficialUrl({
      name: rec.name,
      steamAppId: rec.steamAppId,
      coverUrl: rec.coverUrl,
      tags: rec.tags,
      id: rec.id,
    });
    const scoreBadgeClass =
      rec.groupArithmeticScore >= 75
        ? 'bg-success/90 text-success-foreground border-success'
        : rec.groupArithmeticScore >= 55
          ? 'bg-primary/90 text-primary-foreground border-primary'
          : 'bg-warning/90 text-background border-warning';

    const matchedCatalogGame =
      catalogByNormName.get(normalizeGameName(rec.name)) ?? null;
    const existingCatalogId = rec.catalogGameId ?? matchedCatalogGame?.id;
    const isChosenOrLocked = Boolean(
      existingCatalogId &&
        (chosenGameId === existingCatalogId ||
          lockedGameIds?.includes(existingCatalogId))
    );
    const canSelectExisting = Boolean(
      onSelectExistingGame && existingCatalogId
    );

    return (
      <div
        key={`${options?.isReadyContext ? 'ready' : 'rec'}-${rec.id}`}
        className={cn(
          'group rounded-lg border bg-background/45 transition-all duration-200 hover:-translate-y-0.5 overflow-hidden flex flex-col animate-lol-card-pop',
          isChosenOrLocked
            ? 'ring-2 ring-success border-success bg-success/5 animate-tile-selected'
            : isMajorityAccepted
              ? 'border-success/60 hover:border-success'
              : 'border-border hover:border-primary/45'
        )}
      >
        {/* Wide Steam-style Cover */}
        <div className="relative w-full aspect-[460/215] overflow-hidden bg-background shrink-0">
          <a
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Ver página oficial de ${rec.name}`}
            aria-label={`Ver página oficial de ${rec.name}`}
            className="block h-full w-full cursor-pointer"
          >
            <img
              src={coverUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-md saturate-150"
            />
            <img
              src={coverUrl}
              alt={rec.name}
              draggable={false}
              onError={handleImageFallback}
              className="relative z-10 h-full w-full object-contain select-none"
            />
          </a>

          <div className="pointer-events-none absolute top-2 left-2 z-20 flex flex-wrap items-center gap-1.5 max-w-[78%]">
            <Badge
              variant="outline"
              className="text-[10px] bg-background/85 backdrop-blur-sm"
            >
              {rec.category}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] bg-background/85 backdrop-blur-sm font-mono inline-flex items-center gap-1"
            >
              <span>{rec.releaseYear ?? 2024}</span>
              <span>·</span>
              <Users className="w-2.5 h-2.5" strokeWidth={1.75} />
              <span>
                {rec.minPlayers}–{rec.maxPlayers}j
              </span>
            </Badge>
          </div>

          <div className="pointer-events-none absolute top-2 right-2 z-20">
            <span
              className={cn(
                'px-2 py-0.5 rounded border text-xs font-mono font-bold shadow-sm',
                scoreBadgeClass
              )}
              title={`Afinidad grupal: ${rec.groupArithmeticScore}%`}
            >
              {rec.groupArithmeticScore}%
            </span>
          </div>

          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 right-2 z-20 inline-flex items-center justify-center w-6 h-6 rounded-md bg-background/85 backdrop-blur-sm border border-border text-muted-foreground opacity-75 group-hover:opacity-100 group-hover:text-foreground group-hover:border-primary/60 transition-all"
          >
            <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
          </span>

          {canSelectExisting ? (
            <Button
              type="button"
              size="xs"
              variant={isChosenOrLocked ? 'emerald' : 'secondary'}
              title={isChosenOrLocked ? 'Seleccionado' : 'Elegir para jugar'}
              className={cn(
                'absolute bottom-2 left-2 z-30 shadow-md backdrop-blur-sm',
                !isChosenOrLocked &&
                  'bg-background/85 hover:bg-background text-foreground border-border/90'
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelectExistingGame?.({
                  ...rec,
                  catalogGameId: existingCatalogId,
                });
              }}
            >
              <CheckCircle2 className="w-3 h-3" strokeWidth={1.75} />
              <span>{isChosenOrLocked ? 'Seleccionado' : 'Elegir'}</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="xs"
              variant="default"
              title={actionLabel}
              className="absolute bottom-2 left-2 z-30 shadow-md backdrop-blur-sm bg-primary/95 hover:bg-primary border-primary/60"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onImportRecommendation(rec);
              }}
            >
              <Sparkles className="w-3 h-3" strokeWidth={1.75} />
              <span>
                {actionLabel.toLowerCase().includes('fijar')
                  ? 'Importar y fijar'
                  : 'Importar'}
              </span>
            </Button>
          )}
        </div>

        {/* Body */}
        <div className="p-3.5 flex-1 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground leading-tight">
              {rec.name}
            </h3>
            {isMajorityAccepted && (
              <Badge variant="success" className="text-[10px] shrink-0">
                <CheckCircle2 className="w-3 h-3" strokeWidth={1.75} />
                <span>
                  Mayoría ({upVoters.length}/{eligibleCount})
                </span>
              </Badge>
            )}
          </div>

          {rec.sharedDimensions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {rec.sharedDimensions.slice(0, 4).map((dim) => (
                <Badge
                  key={dim}
                  variant="purple"
                  className="text-[10px] px-1.5 py-0"
                >
                  <Dna className="w-2.5 h-2.5" strokeWidth={1.75} />
                  <span>{dim}</span>
                </Badge>
              ))}
            </div>
          )}

          {rec.explanation && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {rec.explanation}
            </p>
          )}

          {/* Unified Compact Player Affinity + Vote Badges */}
          {rec.playerBreakdowns.length > 0 && (
            <div className="pt-2 border-t border-border/60 flex flex-wrap items-center gap-1.5">
              {rec.playerBreakdowns.map((b) => {
                const playerVote = recVotes[b.userId];
                const pillStyle =
                  playerVote === 'up'
                    ? 'border-success bg-success/20 text-success ring-1 ring-success/45'
                    : playerVote === 'down'
                      ? 'border-destructive bg-destructive/20 text-destructive ring-1 ring-destructive/45'
                      : cn(
                          'border-border bg-background/75',
                          b.burnedOut
                            ? 'text-destructive'
                            : b.affinityScore >= 75
                              ? 'text-success'
                              : b.affinityScore >= 55
                                ? 'text-primary'
                                : 'text-warning'
                        );

                const voteSuffix =
                  playerVote === 'up'
                    ? ' · Votó Banco'
                    : playerVote === 'down'
                      ? ' · Votó Paso'
                      : '';
                const reasonsSuffix =
                  b.matchingReasons.length > 0
                    ? ` · ${b.matchingReasons.join(' · ')}`
                    : '';

                return (
                  <div
                    key={b.userId}
                    title={`${b.displayName}: ${b.affinityScore}% afinidad${voteSuffix}${b.burnedOut ? ' · Quemado' : ''}${reasonsSuffix}`}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border pl-0.5 pr-2 py-0.5 text-[11px] font-mono font-bold transition-colors',
                      pillStyle
                    )}
                  >
                    <img
                      src={b.avatarUrl}
                      alt={b.displayName}
                      className={cn(
                        'w-5 h-5 rounded-full object-cover shrink-0',
                        playerVote === 'up'
                          ? 'ring-1 ring-success'
                          : playerVote === 'down'
                            ? 'ring-1 ring-destructive'
                            : 'border border-border/60',
                        b.burnedOut && 'opacity-50 grayscale'
                      )}
                    />
                    <span>{b.affinityScore}%</span>
                    {playerVote === 'up' ? (
                      <ThumbsUp
                        className="w-2.5 h-2.5 text-success shrink-0"
                        strokeWidth={2.25}
                      />
                    ) : playerVote === 'down' ? (
                      <ThumbsDown
                        className="w-2.5 h-2.5 text-destructive shrink-0"
                        strokeWidth={2.25}
                      />
                    ) : b.burnedOut ? (
                      <Flame
                        className="w-2.5 h-2.5 text-destructive shrink-0"
                        strokeWidth={1.75}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* Primary Vote Action Buttons: Banco / Paso */}
          <div className="mt-auto pt-2.5 border-t border-border/60 grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!canVote}
              variant={currentUserVote === 'up' ? 'emerald' : 'outline'}
              aria-pressed={currentUserVote === 'up'}
              className="w-full gap-1.5 text-xs font-semibold"
              onClick={() =>
                handleVote(recKey, 'up', currentUserVote, rec.name)
              }
            >
              <ThumbsUp className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Banco</span>
              <span className="font-mono">{upVoters.length}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={!canVote}
              variant={
                currentUserVote === 'down' ? 'destructive' : 'outline'
              }
              aria-pressed={currentUserVote === 'down'}
              className="w-full gap-1.5 text-xs font-semibold"
              onClick={() =>
                handleVote(recKey, 'down', currentUserVote, rec.name)
              }
            >
              <ThumbsDown className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Paso</span>
              <span className="font-mono">{downVoters.length}</span>
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const hasFilterItems =
    recommendations.length > 0 || enrichedReadyRecommendations.length > 0;

  return (
    <div className="space-y-4">
      {/* Universal Multi-Platform Affinity Search Window */}
      {showAffinitySearch && (
        <section className="rounded-md border border-border bg-card overflow-hidden shadow-sm flex flex-col">
          <div className="px-3.5 py-2.5 bg-secondary/45 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Search
                className="w-4 h-4 text-primary shrink-0"
                strokeWidth={1.75}
              />
              <h2 className="text-sm font-bold text-foreground truncate">
                Buscador de Afinidad · Todas las Plataformas
              </h2>
              {searchQuery.trim().length > 0 && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {enrichedSearchResults.length} resultados
                </Badge>
              )}
            </div>

            {isSearchingLive && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2
                  className="w-3.5 h-3.5 animate-spin text-primary"
                  strokeWidth={1.75}
                />
                <span>Consultando IGDB / Steam...</span>
              </span>
            )}
          </div>

          <div className="p-3.5 bg-card space-y-3">
            <div className="relative">
              <Search
                className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.75}
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar cualquier juego (Steam, Riot, Epic, Battle.net, IGDB)..."
                aria-label="Buscar cualquier juego por afinidad grupal"
                className="pl-8 pr-8"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              )}
            </div>

            {searchQuery.trim().length > 0 &&
              (enrichedSearchResults.length === 0 ? (
                <div className="p-6 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground flex flex-col items-center gap-2">
                  <Compass
                    className="w-5 h-5 text-muted-foreground/70"
                    strokeWidth={1.75}
                  />
                  <span>
                    {isSearchingLive
                      ? 'Buscando en catálogos externos...'
                      : `Sin coincidencias para "${searchQuery.trim()}".`}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {enrichedSearchResults.map((item) =>
                    renderRecommendationCard(item)
                  )}
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Window 1: Ready-To-Play Group Games */}
      {readyToPlayRecommendations !== undefined && (
        <section className="cv-section rounded-md border border-border bg-card overflow-hidden shadow-sm flex flex-col">
          <div className="px-3.5 py-2.5 bg-secondary/45 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Gamepad2
                className="w-4 h-4 text-primary shrink-0"
                strokeWidth={1.75}
              />
              <h2 className="text-sm font-bold text-foreground truncate">
                {readyTitle}
              </h2>
              <Badge variant="outline" className="text-[10px] font-mono">
                {filteredReadyRecommendations.length} juegos
              </Badge>
            </div>
          </div>

          <div className="p-3.5 bg-card">
            {filteredReadyRecommendations.length === 0 ? (
              <div className="p-6 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground flex flex-col items-center gap-2">
                <Compass
                  className="w-5 h-5 text-muted-foreground/70"
                  strokeWidth={1.75}
                />
                <span>
                  {enrichedReadyRecommendations.length === 0
                    ? readyEmptyMessage
                    : 'Sin resultados para los filtros activos.'}
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredReadyRecommendations.map((item) =>
                  renderRecommendationCard(item, { isReadyContext: true })
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Window 2: Discovery / New Recommendations */}
      <section className="cv-section rounded-md border border-border bg-card overflow-hidden shadow-sm flex flex-col">
        <div className="px-3.5 py-2.5 bg-secondary/45 border-b border-border space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Brain
                className="w-4 h-4 text-primary shrink-0"
                strokeWidth={1.75}
              />
              <h2 className="text-sm font-bold text-foreground truncate">
                {title}
              </h2>
              <Badge variant="outline" className="text-[10px] font-mono">
                {filteredRecommendations.length} juegos
              </Badge>
            </div>

            <div className="flex items-center gap-1.5">
              <ArrowUpDown
                className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                strokeWidth={1.75}
              />
              <select
                aria-label="Ordenar recomendaciones"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as RecommendationSortBy)
                }
                className="h-6 rounded-md border border-border bg-secondary px-2 text-[11px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                <option value="affinity">Afinidad</option>
                <option value="votes">Más votados</option>
                <option value="newest">Más nuevos</option>
              </select>
            </div>
          </div>

          {hasFilterItems && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="xs"
                variant={
                  quickFilter === 'all' && selectedCategory === 'all'
                    ? 'default'
                    : 'outline'
                }
                onClick={() => {
                  setQuickFilter('all');
                  setSelectedCategory('all');
                }}
              >
                <span>Todos</span>
              </Button>

              <Button
                type="button"
                size="xs"
                variant={quickFilter === 'new_releases' ? 'default' : 'outline'}
                onClick={() =>
                  setQuickFilter((prev) =>
                    prev === 'new_releases' ? 'all' : 'new_releases'
                  )
                }
              >
                <Sparkles className="w-3 h-3" strokeWidth={1.75} />
                <span>Novedades 22–26</span>
              </Button>

              <Button
                type="button"
                size="xs"
                variant={quickFilter === 'majority' ? 'emerald' : 'outline'}
                onClick={() =>
                  setQuickFilter((prev) =>
                    prev === 'majority' ? 'all' : 'majority'
                  )
                }
              >
                <CheckCircle2 className="w-3 h-3" strokeWidth={1.75} />
                <span>Mayoría ({majorityCount})</span>
              </Button>

              {topCategories.length > 0 && (
                <span
                  aria-hidden="true"
                  className="h-4 w-px bg-border mx-0.5 shrink-0"
                />
              )}

              {topCategories.map((category) => (
                <Button
                  key={category}
                  type="button"
                  size="xs"
                  variant={
                    selectedCategory === category ? 'secondary' : 'outline'
                  }
                  className={cn(
                    selectedCategory === category &&
                      'border-primary/60 text-foreground'
                  )}
                  onClick={() =>
                    setSelectedCategory((prev) =>
                      prev === category ? 'all' : category
                    )
                  }
                >
                  <span>{category}</span>
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="p-3.5 bg-card">
          {filteredRecommendations.length === 0 ? (
            <div className="p-8 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground flex flex-col items-center gap-2">
              <Compass
                className="w-6 h-6 text-muted-foreground/70"
                strokeWidth={1.75}
              />
              <span>
                {recommendations.length === 0
                  ? emptyMessage
                  : 'Sin resultados para los filtros activos.'}
              </span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {visibleRecommendations.map((item) =>
                  renderRecommendationCard(item)
                )}
              </div>

              {remainingCount > 0 && (
                <div className="pt-4 flex justify-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={() =>
                      setVisibleCount((prev) => prev + INITIAL_VISIBLE_COUNT)
                    }
                  >
                    <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Mostrar más ({remainingCount})</span>
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
};
