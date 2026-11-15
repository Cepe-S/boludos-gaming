import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CategoryPreferenceLevel,
  ExternalGamePlatform,
  GAME_CATEGORIES,
  GameRating,
  PlayerProfile,
  PodiumGameEntry,
  PvjPlayerCategorizationResult,
  TasteDimensionKey,
  UnifiedSelectorGame,
} from '@/types/domain';
import { TASTE_DIMENSION_MAP } from '@/lib/tasteProfileEngine';
import { PvjArchetypeDashboard } from '@/components/PvjArchetypeDashboard';
import { PvjArchetypeIcon } from '@/components/PvjDimensionIcon';
import { GameCompactTile } from './GameCompactTile';
import { StickyTopPodiumBar } from './StickyTopPodiumBar';
import {
  ActivePodiumPickerState,
  EXTERNAL_PLATFORMS,
  SelectorFilterTab,
  formatHours,
  getSafeCoverUrl,
  handleImageFallback,
} from './sharedCatalogConstants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Compass,
  ExternalLink,
  Gamepad2,
  Heart,
  Layers,
  Library,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';

export type ProfileSectionKey =
  | 'dna'
  | 'steam'
  | 'podiums'
  | 'categories'
  | 'library';

export interface GamerProfileSplitViewProps {
  currentUser: PlayerProfile;
  pvjProfile: PvjPlayerCategorizationResult;
  embeddedInTour: boolean;
  isProfileRevealed: boolean;
  setProfileRevealed: (revealed: boolean) => void;
  selectedGamesCount: number;
  hasTasteSignal: boolean;
  topDimensions: Array<{ key: TasteDimensionKey; label: string; score: number }>;
  activeFeatureVector: Partial<Record<TasteDimensionKey, number>>;

  // Steam
  steamUrlInput: string;
  setSteamUrlInput: (val: string) => void;
  isSyncingSteam: boolean;
  syncResult: { ok: boolean; message: string; autoTriggered?: boolean } | null;
  onSubmitSteamSync: (e: React.FormEvent) => void;

  // Podiums
  topMultiplayerGames: PodiumGameEntry[];
  topSingleplayerGames: PodiumGameEntry[];
  activePodiumPicker: ActivePodiumPickerState | null;
  setActivePodiumPicker: (state: ActivePodiumPickerState | null) => void;
  podiumSearchQuery: string;
  setPodiumSearchQuery: (val: string) => void;
  podiumPickerCandidates: UnifiedSelectorGame[];
  isSearchingPodiumLive: boolean;
  onAutoFillPodiumFromSteam: (type: 'mp' | 'sp') => void;
  onRemovePodiumRank: (type: 'mp' | 'sp', rank: 1 | 2 | 3) => void;
  onAssignPodiumEntry: (
    type: 'mp' | 'sp',
    rank: 1 | 2 | 3,
    entry: UnifiedSelectorGame
  ) => void;
  onDropPodiumGame: (
    type: 'mp' | 'sp',
    rank: 1 | 2 | 3,
    payload: { name: string; coverUrl?: string; hoursPlayed?: number }
  ) => void;
  onSetPodiumEntryHours: (type: 'mp' | 'sp', rank: 1 | 2 | 3, hours: number) => void;
  findPodiumRank: (gameName: string) => { type: 'mp' | 'sp'; rank: 1 | 2 | 3 } | null;

  // Categories
  onSetCategoryPreference: (catId: string, level: CategoryPreferenceLevel) => void;
  onSetAllCategories: (level: CategoryPreferenceLevel) => void;

  // Unified Library Selector
  selectorTab: SelectorFilterTab;
  setSelectorTab: (tab: SelectorFilterTab) => void;
  tabCounts: Record<SelectorFilterTab, number>;
  selectorQuery: string;
  setSelectorQuery: (val: string) => void;
  isLoadingDiscovery: boolean;
  isSearchingLive: boolean;
  filteredUnifiedGames: UnifiedSelectorGame[];
  displayedUnifiedGames: UnifiedSelectorGame[];
  visibleLimit: number;
  setVisibleLimit: React.Dispatch<React.SetStateAction<number>>;
  onSetUnifiedFeedback: (
    game: UnifiedSelectorGame,
    patch: {
      plays?: boolean;
      rating?: GameRating;
      burnedOut?: boolean;
      hoursPlayed?: number;
      recentHoursPlayed?: number;
    }
  ) => void;
  onAddManualCustomGame: (params: {
    name: string;
    platform: ExternalGamePlatform;
    category: string;
    minPlayers: number;
    maxPlayers: number;
    tags: string;
    rating: GameRating;
    hoursPlayed: number;
    recentHoursPlayed: number;
  }) => void;
}

const manualGameSchema = z.object({
  name: z.string().trim().min(2, 'Ingresá el nombre del juego.'),
  platform: z.string().min(1),
  category: z.string().min(1),
  minPlayers: z.number().int().min(1).max(64),
  maxPlayers: z.number().int().min(1).max(128),
  tags: z.string(),
  rating: z.number().int().min(1).max(5),
  hoursPlayed: z.number().min(0).max(50000),
  recentHoursPlayed: z.number().min(0).max(5000),
});

type ManualGameFormValues = z.infer<typeof manualGameSchema>;

export const GamerProfileSplitView: React.FC<GamerProfileSplitViewProps> = ({
  currentUser,
  pvjProfile,
  embeddedInTour,
  isProfileRevealed,
  setProfileRevealed,
  selectedGamesCount,
  hasTasteSignal,
  topDimensions,
  activeFeatureVector,
  steamUrlInput,
  setSteamUrlInput,
  isSyncingSteam,
  syncResult,
  onSubmitSteamSync,
  topMultiplayerGames,
  topSingleplayerGames,
  activePodiumPicker,
  setActivePodiumPicker,
  podiumSearchQuery,
  setPodiumSearchQuery,
  podiumPickerCandidates,
  isSearchingPodiumLive,
  onAutoFillPodiumFromSteam,
  onRemovePodiumRank,
  onAssignPodiumEntry,
  onDropPodiumGame,
  onSetPodiumEntryHours,
  findPodiumRank,
  onSetCategoryPreference,
  onSetAllCategories,
  selectorTab,
  setSelectorTab,
  tabCounts,
  selectorQuery,
  setSelectorQuery,
  isLoadingDiscovery,
  isSearchingLive,
  filteredUnifiedGames,
  displayedUnifiedGames,
  visibleLimit,
  setVisibleLimit,
  onSetUnifiedFeedback,
  onAddManualCustomGame,
}) => {
  const [section, setSection] = useState<ProfileSectionKey>('dna');
  const [showAllDimensions, setShowAllDimensions] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [orderTick, setOrderTick] = useState(0);
  const hoveredKeyRef = useRef<string | null>(null);
  const pinnedOrderKeysRef = useRef<string[] | null>(null);
  const hoverLeaveTimerRef = useRef<number | null>(null);
  const filterSigRef = useRef<string>('');
  const prevFlipFilterSigRef = useRef<string>('');
  const prevOrderSigRef = useRef<string>('');
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const prevOffsetsRef = useRef<Map<string, { left: number; top: number }>>(new Map());

  useEffect(() => {
    return () => {
      if (hoverLeaveTimerRef.current) {
        window.clearTimeout(hoverLeaveTimerRef.current);
      }
    };
  }, []);

  const filterSig = `${selectorTab}::${selectorQuery}::${visibleLimit}`;
  if (filterSig !== filterSigRef.current) {
    filterSigRef.current = filterSig;
    pinnedOrderKeysRef.current = null;
  }

  const pinCurrentOrderWhileHovered = () => {
    if (hoveredKeyRef.current && pinnedOrderKeysRef.current === null) {
      pinnedOrderKeysRef.current = displayedUnifiedGames.map((g) => g.key);
    }
  };

  const orderedDisplayedGames = useMemo(() => {
    const pinnedKeys = pinnedOrderKeysRef.current;
    if (!pinnedKeys || pinnedKeys.length === 0) {
      return displayedUnifiedGames;
    }
    const byKey = new Map(displayedUnifiedGames.map((g) => [g.key, g]));
    const pinned: UnifiedSelectorGame[] = [];
    const seen = new Set<string>();
    for (const key of pinnedKeys) {
      const item = byKey.get(key);
      if (item) {
        pinned.push(item);
        seen.add(key);
      }
    }
    for (const item of displayedUnifiedGames) {
      if (!seen.has(item.key)) {
        pinned.push(item);
      }
    }
    return pinned;
  }, [displayedUnifiedGames, orderTick]);

  const orderSig = useMemo(
    () => orderedDisplayedGames.map((g) => g.key).join('|'),
    [orderedDisplayedGames]
  );

  useLayoutEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const nextOffsets = new Map<string, { left: number; top: number }>();
    const children = Array.from(
      container.querySelectorAll<HTMLElement>('[data-game-key]')
    );

    const shouldAnimateFlip =
      prevOrderSigRef.current !== '' &&
      prevOrderSigRef.current !== orderSig &&
      prevFlipFilterSigRef.current === filterSig;

    for (const child of children) {
      const key = child.dataset.gameKey;
      if (!key) continue;
      const rect = child.getBoundingClientRect();
      const relPos = {
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
      };
      nextOffsets.set(key, relPos);

      if (shouldAnimateFlip) {
        const prevPos = prevOffsetsRef.current.get(key);
        if (prevPos && typeof child.animate === 'function') {
          const dx = prevPos.left - relPos.left;
          const dy = prevPos.top - relPos.top;
          if ((Math.abs(dx) > 1 || Math.abs(dy) > 1) && Math.abs(dy) < 1800) {
            try {
              child.getAnimations().forEach((anim) => anim.cancel());
              child.animate(
                [
                  { transform: `translate3d(${dx}px, ${dy}px, 0)` },
                  { transform: 'translate3d(0, 0, 0)' },
                ],
                {
                  duration: 360,
                  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                }
              );
            } catch {
              // Ignore Web Animations API errors in headless/unsupported envs
            }
          }
        }
      }
    }

    prevOffsetsRef.current = nextOffsets;
    prevOrderSigRef.current = orderSig;
    prevFlipFilterSigRef.current = filterSig;
  }, [orderSig, filterSig]);

  const handleDropPodiumGame = (
    type: 'mp' | 'sp',
    rank: 1 | 2 | 3,
    e: React.DragEvent<HTMLDivElement>
  ) => {
    const raw = e.dataTransfer.getData('application/x-boludos-game');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        name?: string;
        coverUrl?: string;
        hoursPlayed?: number;
      };
      if (parsed.name) {
        onDropPodiumGame(type, rank, {
          name: parsed.name,
          coverUrl: parsed.coverUrl,
          hoursPlayed: parsed.hoursPlayed,
        });
      }
    } catch {
      // Ignore malformed drag payload
    }
  };

  const manualForm = useForm<ManualGameFormValues>({
    resolver: zodResolver(manualGameSchema),
    defaultValues: {
      name: '',
      platform: 'Riot Games',
      category: 'Shooter Táctico',
      minPlayers: 1,
      maxPlayers: 5,
      tags: 'coop, multijugador, accion',
      rating: 4,
      hoursPlayed: 25,
      recentHoursPlayed: 0,
    },
  });

  useEffect(() => {
    if (isManualModalOpen) {
      manualForm.reset({
        name: '',
        platform: 'Riot Games',
        category: 'Shooter Táctico',
        minPlayers: 1,
        maxPlayers: 5,
        tags: 'coop, multijugador, accion',
        rating: 4,
        hoursPlayed: 25,
        recentHoursPlayed: 0,
      });
    }
  }, [isManualModalOpen, manualForm]);

  const handleManualSubmit = manualForm.handleSubmit((values) => {
    onAddManualCustomGame({
      name: values.name,
      platform: values.platform as ExternalGamePlatform,
      category: values.category,
      minPlayers: values.minPlayers,
      maxPlayers: Math.max(values.minPlayers, values.maxPlayers),
      tags: values.tags,
      rating: values.rating as GameRating,
      hoursPlayed: values.hoursPlayed,
      recentHoursPlayed: values.recentHoursPlayed,
    });
    setIsManualModalOpen(false);
  });

  const navItems: Array<{
    key: ProfileSectionKey;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }> = [
    {
      key: 'dna',
      label: 'PVJ-6D',
      icon: <Brain className="w-4 h-4" strokeWidth={1.75} />,
      badge:
        pvjProfile.valid_games_analyzed > 0
          ? `${pvjProfile.valid_games_analyzed}`
          : undefined,
    },
    {
      key: 'steam',
      label: 'Steam',
      icon: <RefreshCw className="w-4 h-4" strokeWidth={1.75} />,
      badge: currentUser.steamProfile ? 'OK' : undefined,
    },
    {
      key: 'podiums',
      label: 'Podios',
      icon: <Trophy className="w-4 h-4" strokeWidth={1.75} />,
      badge: `${topMultiplayerGames.length + topSingleplayerGames.length}/6`,
    },
    {
      key: 'categories',
      label: 'Géneros',
      icon: <Layers className="w-4 h-4" strokeWidth={1.75} />,
    },
    {
      key: 'library',
      label: 'Biblioteca',
      icon: <Library className="w-4 h-4" strokeWidth={1.75} />,
      badge: `${tabCounts.active}`,
    },
  ];

  const renderSteamSyncBar = () => (
    <div className="space-y-2">
      <form onSubmit={onSubmitSteamSync} className="flex gap-2">
        <Input
          value={steamUrlInput}
          onChange={(e) => setSteamUrlInput(e.target.value)}
          placeholder="URL de Steam o SteamID64"
          className="flex-1"
        />
        <Button
          type="submit"
          size="icon"
          disabled={isSyncingSteam}
          title="Sincronizar Steam"
          aria-label="Sincronizar Steam"
          className="shrink-0 h-9 w-9"
        >
          <RefreshCw
            className={cn('w-4 h-4', isSyncingSteam && 'animate-spin')}
            strokeWidth={1.75}
          />
        </Button>
      </form>

      {syncResult && (
        <div
          className={cn(
            'p-2.5 rounded-md border text-xs flex items-center gap-2',
            syncResult.ok
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
          )}
        >
          {syncResult.ok ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          )}
          <span>{syncResult.message}</span>
        </div>
      )}
    </div>
  );

  const renderCatalogToolbarAndGrid = (draggable: boolean) => (
    <div className="space-y-3">
      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
            strokeWidth={1.75}
          />
          <Input
            value={selectorQuery}
            onChange={(e) => setSelectorQuery(e.target.value)}
            placeholder="Buscar juego..."
            className="pl-9 pr-8"
          />
          {selectorQuery && (
            <button
              type="button"
              onClick={() => setSelectorQuery('')}
              title="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
        {(isSearchingLive || isLoadingDiscovery) && (
          <Badge variant="outline" className="shrink-0">
            Buscando...
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { id: 'all', label: `Todos (${tabCounts.all})` },
            { id: 'active', label: `Mis Activos (${tabCounts.active})` },
            { id: 'steam', label: `Steam (${tabCounts.steam})` },
            { id: 'mp', label: `Multiplayer (${tabCounts.mp})` },
            { id: 'sp', label: `Singleplayer (${tabCounts.sp})` },
            { id: 'discover', label: `Descubrir (${tabCounts.discover})` },
          ] as Array<{ id: SelectorFilterTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSelectorTab(tab.id)}
            className={cn(
              'px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer',
              selectorTab === tab.id
                ? 'bg-primary/15 border-primary text-[#99A5FF]'
                : 'bg-[#0B0D10] border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {orderedDisplayedGames.length === 0 ? (
        <div className="p-8 text-center rounded-md border border-dashed border-border bg-[#0B0D10] text-xs text-muted-foreground">
          Sin resultados.
        </div>
      ) : (
        <div
          ref={gridContainerRef}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5"
        >
          {orderedDisplayedGames.map((ug) => (
            <div
              key={ug.key}
              data-game-key={ug.key}
              onMouseEnter={() => {
                if (hoverLeaveTimerRef.current) {
                  window.clearTimeout(hoverLeaveTimerRef.current);
                  hoverLeaveTimerRef.current = null;
                }
                hoveredKeyRef.current = ug.key;
              }}
              onMouseLeave={() => {
                if (hoveredKeyRef.current === ug.key) {
                  hoveredKeyRef.current = null;
                }
                if (pinnedOrderKeysRef.current !== null) {
                  if (hoverLeaveTimerRef.current) {
                    window.clearTimeout(hoverLeaveTimerRef.current);
                  }
                  hoverLeaveTimerRef.current = window.setTimeout(() => {
                    if (!hoveredKeyRef.current && pinnedOrderKeysRef.current !== null) {
                      pinnedOrderKeysRef.current = null;
                      setOrderTick((v) => v + 1);
                    }
                  }, 140);
                }
              }}
            >
              <GameCompactTile
                game={ug}
                podiumRank={findPodiumRank(ug.name)}
                draggable={draggable}
                onTogglePlay={(g) => {
                  pinCurrentOrderWhileHovered();
                  onSetUnifiedFeedback(g, {
                    plays: !g.isPlayedOrRatedByUser,
                    rating: g.effectiveRating,
                  });
                }}
                onRemoveSelected={(g) => {
                  pinCurrentOrderWhileHovered();
                  onSetUnifiedFeedback(g, { plays: false });
                }}
                onSetRating={(g, star) => {
                  pinCurrentOrderWhileHovered();
                  onSetUnifiedFeedback(g, { plays: true, rating: star });
                }}
                onSetHours={(g, hours) => {
                  pinCurrentOrderWhileHovered();
                  onSetUnifiedFeedback(g, { plays: true, hoursPlayed: hours });
                }}
                onFallbackImage={handleImageFallback}
              />
            </div>
          ))}
        </div>
      )}

      {filteredUnifiedGames.length > visibleLimit && (
        <div className="pt-2 text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisibleLimit((prev) => prev + 36)}
          >
            <Compass className="w-4 h-4" strokeWidth={1.75} />
            <span>Ver más ({filteredUnifiedGames.length - visibleLimit})</span>
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      {/* Left GitHub Settings Navigation Rail (hidden during tour) */}
      {!embeddedInTour && (
        <aside className="w-full lg:w-60 shrink-0 lg:sticky lg:top-20 space-y-1.5">
          <div className="p-3 rounded-md bg-[#11141A] border border-border mb-2 flex items-center gap-2.5">
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.displayName}
              className="w-9 h-9 rounded-full border border-border object-cover shrink-0"
            />
            <div className="min-w-0">
              <span className="text-xs font-bold text-foreground block truncate">
                {currentUser.displayName}
              </span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 min-w-0">
                {pvjProfile.valid_games_analyzed > 0 ? (
                  <>
                    <PvjArchetypeIcon
                      hasData
                      type={pvjProfile.classification.type}
                      primaryDimension={pvjProfile.classification.primary_dimension}
                      secondaryDimension={pvjProfile.classification.secondary_dimension}
                      iconClassName="w-3 h-3 shrink-0"
                    />
                    <span className="truncate">{pvjProfile.classification.archetype_name}</span>
                  </>
                ) : (
                  <span className="truncate">Perfil en configuración</span>
                )}
              </span>
            </div>
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1">
            {navItems.map((item) => {
              const isActive = section === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSection(item.key)}
                  className={cn(
                    'relative flex items-center justify-between gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors shrink-0 lg:w-full text-left cursor-pointer border',
                    isActive
                      ? 'bg-[#181C24] border-border text-foreground'
                      : 'bg-transparent border-transparent text-muted-foreground hover:bg-[#11141A] hover:text-foreground'
                  )}
                >
                  {isActive && (
                    <span className="hidden lg:block absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-primary" />
                  )}
                  <span className="flex items-center gap-2">
                    <span className={cn(isActive ? 'text-primary' : 'text-muted-foreground')}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </span>
                  {item.badge && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                      {item.badge}
                    </Badge>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>
      )}

      {/* Right Focused Panel */}
      <div className="flex-1 min-w-0 space-y-4 w-full">
        {embeddedInTour ? (
          isProfileRevealed ? (
            <PvjArchetypeDashboard
              player={currentUser}
              pvjProfile={pvjProfile}
              onJumpToPendingHours={() => {
                setProfileRevealed(false);
                setSelectorTab('active');
              }}
            />
          ) : (
            <div className="space-y-3">
              <StickyTopPodiumBar
                mpGames={topMultiplayerGames}
                spGames={topSingleplayerGames}
                selectedCount={selectedGamesCount}
                minRequiredCount={10}
                onDropGame={handleDropPodiumGame}
                onRemoveGame={onRemovePodiumRank}
                onUpdateHours={onSetPodiumEntryHours}
                headerActions={
                  currentUser.steamProfile ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      onClick={() => {
                        onAutoFillPodiumFromSteam('mp');
                        onAutoFillPodiumFromSteam('sp');
                      }}
                      title="Autocompletar desde Steam"
                      aria-label="Autocompletar desde Steam"
                      className="h-7 w-7"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#99A5FF]" strokeWidth={1.75} />
                    </Button>
                  ) : undefined
                }
              />

              {renderSteamSyncBar()}

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <Gamepad2 className="w-4 h-4 text-primary" strokeWidth={1.75} />
                    <span>Biblioteca</span>
                  </CardTitle>

                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setIsManualModalOpen(true)}
                    title="Agregar juego externo"
                    aria-label="Agregar juego externo"
                    className="h-8 w-8"
                  >
                    <Plus className="w-4 h-4" strokeWidth={1.75} />
                  </Button>
                </CardHeader>

                <CardContent className="p-3">
                  {renderCatalogToolbarAndGrid(true)}
                </CardContent>
              </Card>
            </div>
          )
        ) : (
          <>
        {/* SECTION 1: ADN GAMER & PVJ-6D */}
        {section === 'dna' && (
          <div className="space-y-4">
            <PvjArchetypeDashboard
              player={currentUser}
              pvjProfile={pvjProfile}
              onJumpToPendingHours={() => {
                setSection('library');
                setSelectorTab('active');
              }}
            />

            {/* 32D Taste Vector Breakdown */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 border-b border-border">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#99A5FF]" strokeWidth={1.75} />
                  <span>Vector 32D</span>
                </CardTitle>
                {hasTasteSignal && topDimensions.length > 6 && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setShowAllDimensions((p) => !p)}
                  >
                    {showAllDimensions ? 'Top 6' : `Todas (${topDimensions.length})`}
                  </Button>
                )}
              </CardHeader>

              <CardContent className="p-4">
                {!hasTasteSignal ? (
                  <p className="text-xs text-muted-foreground">
                    Sincronizá Steam o marcá juegos en Biblioteca para generar tu vector.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {(showAllDimensions ? topDimensions : topDimensions.slice(0, 6)).map(
                      (dim) => {
                        const meta = TASTE_DIMENSION_MAP.get(dim.key);
                        const pct = Math.min(100, Math.max(5, Math.round(dim.score * 100)));
                        const rawVal = activeFeatureVector[dim.key] ?? dim.score;
                        return (
                          <div
                            key={dim.key}
                            className="p-2.5 rounded-md bg-[#0B0D10] border border-border space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-foreground truncate">
                                {meta?.label ?? dim.label}
                              </span>
                              <span className="font-mono text-[#99A5FF] text-[11px]">
                                {Math.round(rawVal * 100)}%
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-[#181C24] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* SECTION 2: STEAM */}
        {section === 'steam' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-primary" strokeWidth={1.75} />
                    <span>Steam</span>
                  </CardTitle>
                  {currentUser.steamProfile && (
                    <Badge variant="success">
                      {currentUser.steamProfile.considerableGamesCount} juegos ·{' '}
                      {Math.round(currentUser.steamProfile.totalHours)}h
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <form onSubmit={onSubmitSteamSync} className="flex gap-2">
                  <Input
                    value={steamUrlInput}
                    onChange={(e) => setSteamUrlInput(e.target.value)}
                    placeholder="URL de Steam o SteamID64"
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={isSyncingSteam}
                    title="Sincronizar Steam"
                    aria-label="Sincronizar Steam"
                    className="shrink-0 h-9 w-9"
                  >
                    <RefreshCw
                      className={cn('w-4 h-4', isSyncingSteam && 'animate-spin')}
                      strokeWidth={1.75}
                    />
                  </Button>
                </form>

                {syncResult && (
                  <div
                    className={cn(
                      'p-3 rounded-md border text-xs flex items-center gap-2',
                      syncResult.ok
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                    )}
                  >
                    {syncResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                    )}
                    <span>{syncResult.message}</span>
                  </div>
                )}

                {currentUser.steamProfile && (
                  <div className="p-3 rounded-md bg-[#0B0D10] border border-border flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={currentUser.steamProfile.avatarUrl}
                        alt={currentUser.steamProfile.personaName}
                        className="w-10 h-10 rounded-md border border-border object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-foreground block truncate">
                          {currentUser.steamProfile.personaName}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground block truncate">
                          {currentUser.steamProfile.steamId64}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {currentUser.steamProfile.profileUrl && (
                        <Button
                          size="icon"
                          variant="ghost"
                          asChild
                          className="h-7 w-7"
                        >
                          <a
                            href={currentUser.steamProfile.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir perfil en Steam"
                            aria-label="Abrir perfil en Steam"
                          >
                            <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </a>
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={() => setSection('library')}
                        title="Ir a Biblioteca"
                        aria-label="Ir a Biblioteca"
                        className="h-7 w-7"
                      >
                        <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* SECTION 3: PODIUMS TOP 3 */}
        {section === 'podiums' && (
          <div className="space-y-4">
            <StickyTopPodiumBar
              mpGames={topMultiplayerGames}
              spGames={topSingleplayerGames}
              selectedCount={selectedGamesCount}
              minRequiredCount={10}
              onDropGame={handleDropPodiumGame}
              onRemoveGame={onRemovePodiumRank}
              onUpdateHours={onSetPodiumEntryHours}
              headerActions={
                currentUser.steamProfile ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    onClick={() => {
                      onAutoFillPodiumFromSteam('mp');
                      onAutoFillPodiumFromSteam('sp');
                    }}
                    title="Autocompletar desde Steam"
                    aria-label="Autocompletar desde Steam"
                    className="h-7 w-7"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#99A5FF]" strokeWidth={1.75} />
                  </Button>
                ) : undefined
              }
            />

            <Card>
              <CardContent className="p-4">
                {renderCatalogToolbarAndGrid(true)}
              </CardContent>
            </Card>
          </div>
        )}

        {/* SECTION 4: CATEGORIES PREFERENCES */}
        {section === 'categories' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-400" strokeWidth={1.75} />
                <span>Géneros</span>
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Button size="xs" variant="emerald" onClick={() => onSetAllCategories('like')}>
                  Todos Sí
                </Button>
                <Button size="xs" variant="outline" onClick={() => onSetAllCategories('neutral')}>
                  Reset
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {GAME_CATEGORIES.map((cat) => {
                const level: CategoryPreferenceLevel =
                  currentUser.categoryPreferences?.[cat.id] ?? 'neutral';
                return (
                  <div
                    key={cat.id}
                    className="p-3 rounded-md bg-[#0B0D10] border border-border flex flex-col justify-between gap-2.5"
                  >
                    <span className="text-xs font-semibold text-foreground block">
                      {cat.emoji} {cat.label}
                    </span>

                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'like', label: 'Me gusta' },
                          { id: 'neutral', label: 'Neutral' },
                          { id: 'dislike', label: 'No' },
                        ] as Array<{ id: CategoryPreferenceLevel; label: string }>
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onSetCategoryPreference(cat.id, opt.id)}
                          className={cn(
                            'py-1 rounded border text-[11px] font-medium transition-colors cursor-pointer',
                            level === opt.id
                              ? opt.id === 'like'
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                : opt.id === 'dislike'
                                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                                  : 'bg-[#181C24] border-primary/50 text-foreground'
                              : 'bg-[#11141A] border-border text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* SECTION 5: UNIFIED LIBRARY & EXTERNAL GAMES */}
        {section === 'library' && (
          <div className="space-y-4">
            <StickyTopPodiumBar
              mpGames={topMultiplayerGames}
              spGames={topSingleplayerGames}
              selectedCount={selectedGamesCount}
              minRequiredCount={10}
              onDropGame={handleDropPodiumGame}
              onRemoveGame={onRemovePodiumRank}
              onUpdateHours={onSetPodiumEntryHours}
              headerActions={
                currentUser.steamProfile ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    onClick={() => {
                      onAutoFillPodiumFromSteam('mp');
                      onAutoFillPodiumFromSteam('sp');
                    }}
                    title="Autocompletar desde Steam"
                    aria-label="Autocompletar desde Steam"
                    className="h-7 w-7"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#99A5FF]" strokeWidth={1.75} />
                  </Button>
                ) : undefined
              }
            />

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-primary" strokeWidth={1.75} />
                  <span>Biblioteca</span>
                </CardTitle>

                <Button
                  size="icon"
                  onClick={() => setIsManualModalOpen(true)}
                  title="Agregar juego externo"
                  aria-label="Agregar juego externo"
                >
                  <Plus className="w-4 h-4" strokeWidth={1.75} />
                </Button>
              </CardHeader>

              <CardContent className="p-4">
                {renderCatalogToolbarAndGrid(true)}
              </CardContent>
            </Card>
          </div>
        )}
          </>
        )}
      </div>

      {/* PODIUM PICKER DIALOG */}
      <Dialog
        open={!!activePodiumPicker}
        onOpenChange={(open) => {
          if (!open) setActivePodiumPicker(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Puesto #{activePodiumPicker?.rank} ·{' '}
              {activePodiumPicker?.type === 'mp' ? 'Multiplayer' : 'Singleplayer'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search
                className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
                strokeWidth={1.75}
              />
              <Input
                value={podiumSearchQuery}
                onChange={(e) => setPodiumSearchQuery(e.target.value)}
                placeholder="Buscar juego..."
                className="pl-9"
              />
            </div>

            {isSearchingPodiumLive && (
              <p className="text-[11px] text-[#99A5FF]">Buscando...</p>
            )}

            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {podiumPickerCandidates.map((cand) => (
                <button
                  key={cand.key}
                  type="button"
                  onClick={() => {
                    if (activePodiumPicker) {
                      onAssignPodiumEntry(
                        activePodiumPicker.type,
                        activePodiumPicker.rank,
                        cand
                      );
                    }
                  }}
                  className="w-full p-2.5 rounded-md border border-border bg-[#0B0D10] hover:border-primary/50 hover:bg-[#181C24] flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={getSafeCoverUrl(cand.coverUrl)}
                      alt={cand.name}
                      onError={handleImageFallback}
                      className="w-9 h-10 object-cover rounded border border-border shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-foreground block truncate">
                        {cand.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        {cand.platform} · {cand.category}
                        {cand.playtimeHours > 0 ? ` · ${formatHours(cand.playtimeHours)}h` : ''}
                      </span>
                    </div>
                  </div>
                  <Badge variant="default" className="text-[10px] shrink-0">
                    Asignar
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MANUAL EXTERNAL GAME DIALOG (RHF + ZOD) */}
      <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Juego Externo</DialogTitle>
          </DialogHeader>

          <Form {...manualForm}>
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <FormField
                control={manualForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Valorant, League of Legends..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={manualForm.control}
                  name="platform"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plataforma</FormLabel>
                      <FormControl>
                        <select
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-border bg-[#0B0D10] px-2.5 text-xs text-foreground"
                        >
                          {EXTERNAL_PLATFORMS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={manualForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría</FormLabel>
                      <FormControl>
                        <select
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-border bg-[#0B0D10] px-2.5 text-xs text-foreground"
                        >
                          {GAME_CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <FormField
                  control={manualForm.control}
                  name="minPlayers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px]">Mín</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={64}
                          value={field.value}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value) || 1)
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={manualForm.control}
                  name="maxPlayers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px]">Máx</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={128}
                          value={field.value}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value) || 1)
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={manualForm.control}
                  name="hoursPlayed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px]">Horas</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={50000}
                          value={field.value}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value) || 0)
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={manualForm.control}
                name="rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Voto</FormLabel>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => field.onChange(s)}
                          className={cn(
                            'h-9 rounded-md border text-xs font-bold cursor-pointer transition-colors',
                            Number(field.value) === s
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                              : 'bg-[#0B0D10] border-border text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {s}★
                        </button>
                      ))}
                    </div>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsManualModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">Guardar</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
