import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  AlertTriangle,
  Award,
  ChevronDown,
  ChevronUp,
  Compass,
  Dna,
  ExternalLink,
  Flame,
  Grid,
  Play,
  Puzzle,
  SkipForward,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import {
  PVJ_DIMENSION_ICONS,
  PvjDimensionIcon,
} from '@/components/PvjDimensionIcon';
import {
  PlayerProfile,
  PvjDimensionKey,
  PvjPlayerCategorizationResult,
  PvjTopInfluencingGame,
  TasteDimensionKey,
  UnifiedSelectorGame,
} from '@/types/domain';
import {
  ARCHETYPE_MATRIX_6X6,
  PVJ_DIMENSIONS,
  PVJ_DIMENSION_KEYS,
  PVJ_DIMENSION_MAP,
} from '@/lib/playerCategorizationEngine';
import {
  GLOBAL_GAMES_KNOWLEDGE_BASE,
  TASTE_DIMENSIONS,
  TASTE_DIMENSION_MAP,
  extractTopDimensions,
  normalizeGameName,
  resolveGameOfficialUrl,
} from '@/lib/tasteProfileEngine';
import {
  getSafeCoverUrl,
  handleImageFallback,
} from '@/components/catalog/sharedCatalogConstants';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface PvjArchetypeDashboardProps {
  player: PlayerProfile;
  pvjProfile: PvjPlayerCategorizationResult;
  onJumpToPendingHours?: () => void;
  topDimensions?: Array<{ key: TasteDimensionKey; label: string; score: number }>;
  activeFeatureVector?: Partial<Record<TasteDimensionKey, number>>;
  unifiedGames?: UnifiedSelectorGame[];
}

const CLASSIFICATION_BADGE_MAP: Record<
  PvjPlayerCategorizationResult['classification']['type'],
  { label: string; variant: 'destructive' | 'default' | 'success' }
> = {
  PURE: {
    label: 'Especializado',
    variant: 'destructive',
  },
  COMPOUND: {
    label: 'Combinado',
    variant: 'default',
  },
  POLYMATH: {
    label: 'Polivalente',
    variant: 'success',
  },
};

type VectorGroupFilter = 'all' | 'genre' | 'pace' | 'social' | 'aesthetic';

const VECTOR_GROUP_META: Record<
  Exclude<VectorGroupFilter, 'all'>,
  { label: string; color: string; pillClass: string }
> = {
  genre: {
    label: 'Género',
    color: '#5865F2',
    pillClass: 'border-primary/50 bg-primary/15 text-[#99A5FF]',
  },
  pace: {
    label: 'Ritmo',
    color: '#f43f5e',
    pillClass: 'border-rose-500/50 bg-rose-500/15 text-rose-300',
  },
  social: {
    label: 'Social',
    color: '#10b981',
    pillClass: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300',
  },
  aesthetic: {
    label: 'Estética',
    color: '#a855f7',
    pillClass: 'border-purple-500/50 bg-purple-500/15 text-purple-300',
  },
};

function resolveInfluencingGameVisuals(
  game: PvjTopInfluencingGame,
  player: PlayerProfile,
  unifiedGames?: UnifiedSelectorGame[]
): { coverUrl: string; iconUrl: string; officialUrl: string; platform: string } {
  const norm = normalizeGameName(game.name);

  const steamOwned = player.steamProfile?.ownedGames?.find(
    (sg) =>
      (game.app_id > 0 && sg.appId === game.app_id) ||
      normalizeGameName(sg.name) === norm
  );

  const unifiedMatch = unifiedGames?.find(
    (ug) =>
      (game.app_id > 0 && ug.steamAppId === game.app_id) ||
      normalizeGameName(ug.name) === norm
  );

  const kbMatch = GLOBAL_GAMES_KNOWLEDGE_BASE.find(
    (kb) =>
      (game.app_id > 0 && kb.steamAppId === game.app_id) ||
      normalizeGameName(kb.name) === norm
  );

  const steamHeader =
    game.app_id > 0
      ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.app_id}/header.jpg`
      : undefined;

  const rawCover =
    steamOwned?.headerImageUrl ||
    unifiedMatch?.coverUrl ||
    kbMatch?.coverUrl ||
    steamHeader;

  const coverUrl = getSafeCoverUrl(rawCover);
  const iconUrl = getSafeCoverUrl(steamOwned?.iconUrl || rawCover);
  const officialUrl = resolveGameOfficialUrl({
    name: game.name,
    steamAppId: game.app_id > 0 ? game.app_id : kbMatch?.steamAppId,
    coverUrl,
  });
  const platform =
    steamOwned || game.app_id > 0
      ? 'Steam'
      : unifiedMatch?.platform || kbMatch?.platform || 'PC';

  return { coverUrl, iconUrl, officialUrl, platform };
}

export const PvjArchetypeDashboard: React.FC<PvjArchetypeDashboardProps> = ({
  player,
  pvjProfile,
  onJumpToPendingHours,
  topDimensions: propTopDimensions,
  activeFeatureVector: propFeatureVector,
  unifiedGames,
}) => {
  const [showMatrix, setShowMatrix] = useState(false);
  const [vectorGroupFilter, setVectorGroupFilter] =
    useState<VectorGroupFilter>('all');
  const [showAll32D, setShowAll32D] = useState(false);
  const [hoveredDimension, setHoveredDimension] =
    useState<PvjDimensionKey | null>(null);
  const [inspectedCell, setInspectedCell] = useState<{
    row: PvjDimensionKey;
    col: PvjDimensionKey;
  } | null>(null);

  // First-time Suspense & Sequential Bento Assembly State
  // Stages:
  // 0 = Suspense scanner overlay ("Decodificando ADN Gamer...")
  // 1 = Hero Radar + PVJ-6D Distribution Bar snaps into top full-width slot
  // 2 = Top Influencing Games (with mini game icons) snaps into left bento slot
  // 3 = 32D Taste Vector Breakdown snaps into right bento slot
  // 4 = Complete & settled (confetti on first reveal)
  const storageKey = `bg_adn_epic_reveal_v1_${player.id}`;
  const [revealStage, setRevealStage] = useState<0 | 1 | 2 | 3 | 4>(() => {
    if (pvjProfile.valid_games_analyzed === 0) return 4;
    try {
      const seen = window.localStorage.getItem(storageKey);
      return seen === '1' ? 4 : 0;
    } catch {
      return 4;
    }
  });
  const [replayNonce, setReplayNonce] = useState(0);
  const timersRef = useRef<number[]>([]);

  const clearRevealTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const triggerSequentialReveal = (withConfetti = true) => {
    clearRevealTimers();
    setRevealStage(0);
    setReplayNonce((n) => n + 1);

    const t1 = window.setTimeout(() => setRevealStage(1), 620);
    const t2 = window.setTimeout(() => setRevealStage(2), 1120);
    const t3 = window.setTimeout(() => setRevealStage(3), 1580);
    const t4 = window.setTimeout(() => {
      setRevealStage(4);
      try {
        window.localStorage.setItem(storageKey, '1');
      } catch {
        // ignore storage errors
      }
      if (withConfetti) {
        try {
          confetti({
            particleCount: 55,
            spread: 68,
            origin: { y: 0.55 },
          });
        } catch {
          // ignore headless errors
        }
      }
    }, 1980);

    timersRef.current = [t1, t2, t3, t4];
  };

  const skipRevealImmediately = () => {
    clearRevealTimers();
    setRevealStage(4);
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (pvjProfile.valid_games_analyzed === 0) {
      clearRevealTimers();
      setRevealStage(4);
      return;
    }
    let alreadySeen = false;
    try {
      alreadySeen = window.localStorage.getItem(storageKey) === '1';
    } catch {
      alreadySeen = true;
    }
    if (!alreadySeen) {
      triggerSequentialReveal(true);
    } else {
      setRevealStage(4);
    }
    return () => clearRevealTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id, pvjProfile.valid_games_analyzed]);

  const primaryMeta = PVJ_DIMENSION_MAP.get(
    pvjProfile.classification.primary_dimension
  );
  const secondaryMeta = pvjProfile.classification.secondary_dimension
    ? PVJ_DIMENSION_MAP.get(pvjProfile.classification.secondary_dimension)
    : undefined;

  const classBadge = CLASSIFICATION_BADGE_MAP[pvjProfile.classification.type];
  const confidencePct = Math.round(
    pvjProfile.classification.confidence_score * 100
  );
  const pendingHoursCount = pvjProfile.pending_hours_games_count ?? 0;

  // Resolve 32D Taste Vector from props or player.tasteProfile
  const activeFeatureVector = useMemo<
    Partial<Record<TasteDimensionKey, number>>
  >(() => {
    return propFeatureVector || player.tasteProfile?.featureVector || {};
  }, [propFeatureVector, player.tasteProfile?.featureVector]);

  const all32Dimensions = useMemo(() => {
    const fromProps =
      propTopDimensions && propTopDimensions.length > 0
        ? propTopDimensions
        : player.tasteProfile?.topDimensions &&
            player.tasteProfile.topDimensions.length > 0
          ? player.tasteProfile.topDimensions
          : extractTopDimensions(activeFeatureVector, 32);

    const scoreMap = new Map<TasteDimensionKey, number>();
    for (const d of fromProps) {
      scoreMap.set(d.key, d.score);
    }
    for (const [k, v] of Object.entries(activeFeatureVector)) {
      if (typeof v === 'number' && !scoreMap.has(k as TasteDimensionKey)) {
        scoreMap.set(k as TasteDimensionKey, v);
      }
    }

    return TASTE_DIMENSIONS.map((meta) => {
      const rawScore =
        activeFeatureVector[meta.key] ?? scoreMap.get(meta.key) ?? 0;
      return {
        key: meta.key,
        label: meta.label,
        group: meta.group,
        score: rawScore,
        pct: Math.min(100, Math.max(0, Math.round(rawScore * 100))),
      };
    }).sort((a, b) => b.score - a.score);
  }, [propTopDimensions, player.tasteProfile?.topDimensions, activeFeatureVector]);

  const filtered32Dimensions = useMemo(() => {
    const list =
      vectorGroupFilter === 'all'
        ? all32Dimensions
        : all32Dimensions.filter((d) => d.group === vectorGroupFilter);
    return showAll32D ? list : list.slice(0, 12);
  }, [all32Dimensions, vectorGroupFilter, showAll32D]);

  const active32Count = useMemo(
    () => all32Dimensions.filter((d) => d.pct > 0).length,
    [all32Dimensions]
  );

  const sortedDimensions = useMemo(() => {
    return [...PVJ_DIMENSIONS].sort(
      (a, b) =>
        (pvjProfile.vectors.relative_distribution_P[b.key] || 0) -
        (pvjProfile.vectors.relative_distribution_P[a.key] || 0)
    );
  }, [pvjProfile.vectors.relative_distribution_P]);

  const radarGeometry = useMemo(() => {
    const cx = 170;
    const cy = 152;
    const maxR = 94;
    const rings = [25, 50, 75, 100];

    const getPoint = (index: number, valuePct: number) => {
      const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2;
      const r = (Math.max(0, Math.min(100, valuePct)) / 100) * maxR;
      return {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        angle,
      };
    };

    const ringPolygons = rings.map((pct) => {
      const pts = PVJ_DIMENSIONS.map((_, idx) => {
        const pt = getPoint(idx, pct);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      }).join(' ');
      return { pct, pts };
    });

    const dataVertices = PVJ_DIMENSIONS.map((dim, idx) => {
      const sVal = pvjProfile.vectors.radar_scores_S[dim.key] || 0;
      const pVal = pvjProfile.vectors.relative_distribution_P[dim.key] || 0;
      const pt = getPoint(idx, sVal);
      const labelRadiusPct = 128;
      const labelAngle = (Math.PI * 2 * idx) / 6 - Math.PI / 2;
      const lx = cx + ((maxR * labelRadiusPct) / 100) * Math.cos(labelAngle);
      const ly = cy + ((maxR * labelRadiusPct) / 100) * Math.sin(labelAngle);
      const outerPt = getPoint(idx, 100);
      return {
        dim,
        sVal,
        pVal,
        x: pt.x,
        y: pt.y,
        outerX: outerPt.x,
        outerY: outerPt.y,
        lx,
        ly,
      };
    });

    const dataPolygonPoints = dataVertices
      .map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`)
      .join(' ');

    return { cx, cy, ringPolygons, dataVertices, dataPolygonPoints };
  }, [
    pvjProfile.vectors.radar_scores_S,
    pvjProfile.vectors.relative_distribution_P,
  ]);

  const maxInfluencingWeight = useMemo(() => {
    if (pvjProfile.top_influencing_games.length === 0) return 1;
    return Math.max(
      1,
      ...pvjProfile.top_influencing_games.map((g) => g.effective_weight_W || 1)
    );
  }, [pvjProfile.top_influencing_games]);

  if (pvjProfile.valid_games_analyzed === 0) {
    return (
      <Card className="animate-adn-bento-in border-primary/30">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0 animate-adn-float">
              <Puzzle className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                ADN Gamer · PVJ-6D &amp; Vector 32D
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                Importá Steam o asigná{' '}
                <strong className="text-foreground">≥1h</strong> a tus juegos
                para revelar tu Bento Grid de ADN Gamer.
              </p>
            </div>
          </div>

          {pendingHoursCount > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 text-xs text-amber-300">
                <AlertTriangle
                  className="w-4 h-4 text-amber-400 shrink-0"
                  strokeWidth={1.75}
                />
                <span>
                  <strong>{pendingHoursCount}</strong> sin horas asignadas.
                </span>
              </div>
              {onJumpToPendingHours && (
                <Button
                  size="xs"
                  variant="amber"
                  onClick={onJumpToPendingHours}
                >
                  Cargar horas
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const activeMatrixRow = pvjProfile.classification.primary_dimension;
  const activeMatrixCol =
    pvjProfile.classification.secondary_dimension ??
    pvjProfile.classification.primary_dimension;

  const activeInspectedMeta = inspectedCell
    ? ARCHETYPE_MATRIX_6X6[inspectedCell.row][inspectedCell.col]
    : ARCHETYPE_MATRIX_6X6[activeMatrixRow]?.[activeMatrixCol] ?? null;

  const isSuspensePhase = revealStage === 0;

  return (
    <div
      key={`adn-bento-${player.id}-${replayNonce}`}
      className="relative space-y-4"
    >
      {/* STAGE 0: FIRST-TIME SUSPENSE SCANNER OVERLAY */}
      {isSuspensePhase && (
        <Card className="relative overflow-hidden border-primary/50 bg-[#0B0D10]/95 min-h-[340px] flex flex-col items-center justify-center p-6 text-center animate-lol-modal-in">
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              background: `radial-gradient(circle at 50% 50%, ${primaryMeta?.color || '#5865F2'}44 0%, transparent 65%)`,
            }}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/25 via-primary/5 to-transparent animate-adn-scanline" />

          <div className="relative z-10 flex flex-col items-center gap-4 max-w-md">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-primary/60 animate-lol-orbit" />
              <div className="absolute inset-2 rounded-full border border-purple-400/50 animate-lol-orbit-reverse" />
              <div
                className="w-12 h-12 rounded-xl border flex items-center justify-center animate-adn-suspense-pulse"
                style={{
                  backgroundColor: `${primaryMeta?.color || '#5865F2'}25`,
                  borderColor: `${primaryMeta?.color || '#5865F2'}80`,
                }}
              >
                <Dna
                  className="w-6 h-6 text-[#99A5FF]"
                  strokeWidth={1.85}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.22em] text-[#99A5FF] block">
                Sintetizando Vector 6D · 32D
              </span>
              <h3 className="text-base sm:text-lg font-extrabold text-foreground tracking-tight">
                Decodificando ADN Gamer de {player.displayName}
              </h3>
              <p className="text-xs text-muted-foreground font-mono">
                {pvjProfile.valid_games_analyzed} juegos ·{' '}
                {Math.round(pvjProfile.total_hours_analyzed).toLocaleString()}h
                analizadas
              </p>
            </div>

            <div className="w-56 h-1.5 rounded-full bg-[#181C24] overflow-hidden border border-border">
              <div className="h-full w-full bg-gradient-to-r from-primary via-purple-500 to-emerald-400 animate-lol-shimmer" />
            </div>

            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={skipRevealImmediately}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              <SkipForward className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Saltar intro</span>
            </Button>
          </div>
        </Card>
      )}

      {/* EPIC BENTO GRID CONTAINER */}
      {!isSuspensePhase && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
          {/* ==================================================================
              BENTO TILE 1 (TOP FULL-WIDTH: xl:col-span-12)
              HERO ARCHETYPE + HEXAGONAL RADAR + PVJ-6D RELATIVE DISTRIBUTION
             ================================================================== */}
          {revealStage >= 1 && (
            <Card
              className="xl:col-span-12 relative overflow-hidden border-primary/40 bg-[#11141A]/90 animate-adn-bento-in animate-adn-hero-glow"
            >
              {/* Subtle Dynamic Archetype Accent Top Glow */}
              <div
                className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-20 blur-3xl"
                style={{
                  background: `radial-gradient(circle, ${primaryMeta?.color || '#5865F2'}, transparent 70%)`,
                }}
              />
              <div
                className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full opacity-15 blur-3xl"
                style={{
                  background: `radial-gradient(circle, ${secondaryMeta?.color || '#a855f7'}, transparent 70%)`,
                }}
              />

              <CardContent className="relative z-10 p-4 sm:p-5 space-y-4">
                {/* Hero Identity Strip */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border/80">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-lg flex items-center justify-center shrink-0 border shadow-lg animate-adn-float"
                      style={{
                        background: `linear-gradient(135deg, ${primaryMeta?.color || '#5865F2'}2E, ${
                          secondaryMeta?.color || '#a855f7'
                        }24)`,
                        borderColor: `${primaryMeta?.color || '#5865F2'}75`,
                        boxShadow: `0 0 24px -4px ${primaryMeta?.color || '#5865F2'}45`,
                      }}
                    >
                      {pvjProfile.classification.type === 'POLYMATH' ? (
                        <Sparkles
                          className="w-7 h-7 text-success"
                          strokeWidth={1.75}
                        />
                      ) : primaryMeta && secondaryMeta ? (
                        <span className="inline-flex items-center gap-1">
                          <PvjDimensionIcon
                            dimension={primaryMeta.key}
                            color={primaryMeta.color}
                            className="w-6 h-6 shrink-0"
                          />
                          <PvjDimensionIcon
                            dimension={secondaryMeta.key}
                            color={secondaryMeta.color}
                            className="w-4 h-4 shrink-0 opacity-90"
                          />
                        </span>
                      ) : primaryMeta ? (
                        <PvjDimensionIcon
                          dimension={primaryMeta.key}
                          color={primaryMeta.color}
                          className="w-7 h-7 shrink-0"
                        />
                      ) : (
                        <Puzzle
                          className="w-7 h-7 text-primary"
                          strokeWidth={1.75}
                        />
                      )}
                    </div>

                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#99A5FF] inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 border border-primary/35">
                          <Dna className="w-3 h-3" strokeWidth={1.85} />
                          ADN GAMER · {player.displayName}
                        </span>
                        <Badge
                          variant={classBadge.variant}
                          className="text-[10px]"
                        >
                          {classBadge.label}
                        </Badge>
                        {revealStage < 4 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono text-[#99A5FF] border-primary/40 animate-pulse"
                          >
                            Ensamblando Bento {revealStage}/3
                          </Badge>
                        )}
                      </div>

                      <h2 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">
                        {pvjProfile.classification.archetype_name}
                      </h2>

                      {pvjProfile.classification.archetype_description && (
                        <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                          {pvjProfile.classification.archetype_description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 flex-wrap pt-0.5">
                        {primaryMeta && (
                          <span
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-md border text-foreground transition-transform hover:scale-[1.03]"
                            style={{
                              backgroundColor: `${primaryMeta.color}20`,
                              borderColor: `${primaryMeta.color}65`,
                            }}
                          >
                            <PvjDimensionIcon
                              dimension={primaryMeta.key}
                              color={primaryMeta.color}
                              className="w-3.5 h-3.5 shrink-0"
                            />
                            <span>{primaryMeta.label}</span>
                            <span className="font-mono font-bold">
                              {pvjProfile.vectors.relative_distribution_P[
                                primaryMeta.key
                              ].toFixed(1)}
                              %
                            </span>
                          </span>
                        )}
                        {secondaryMeta && (
                          <span
                            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-md border text-foreground transition-transform hover:scale-[1.03]"
                            style={{
                              backgroundColor: `${secondaryMeta.color}18`,
                              borderColor: `${secondaryMeta.color}55`,
                            }}
                          >
                            <PvjDimensionIcon
                              dimension={secondaryMeta.key}
                              color={secondaryMeta.color}
                              className="w-3.5 h-3.5 shrink-0"
                            />
                            <span>{secondaryMeta.label}</span>
                            <span className="font-mono font-bold">
                              {pvjProfile.vectors.relative_distribution_P[
                                secondaryMeta.key
                              ].toFixed(1)}
                              %
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Hero Telemetry KPIs + Replay Intro Action */}
                  <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end justify-between gap-2.5 shrink-0">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="rounded-md bg-[#0B0D10]/90 border border-border px-2.5 py-1.5 text-center">
                        <span className="text-[10px] font-medium text-muted-foreground block">
                          Juegos
                        </span>
                        <span className="text-sm sm:text-base font-bold font-mono text-foreground">
                          {pvjProfile.valid_games_analyzed}
                        </span>
                      </div>
                      <div className="rounded-md bg-[#0B0D10]/90 border border-border px-2.5 py-1.5 text-center">
                        <span className="text-[10px] font-medium text-muted-foreground block">
                          Horas
                        </span>
                        <span className="text-sm sm:text-base font-bold font-mono text-[#99A5FF]">
                          {Math.round(
                            pvjProfile.total_hours_analyzed
                          ).toLocaleString()}
                          h
                        </span>
                      </div>
                      <div className="rounded-md bg-[#0B0D10]/90 border border-border px-2.5 py-1.5 text-center">
                        <span className="text-[10px] font-medium text-muted-foreground block">
                          Precisión
                        </span>
                        <span className="text-sm sm:text-base font-bold font-mono text-emerald-400">
                          {confidencePct}%
                        </span>
                      </div>
                      <div className="rounded-md bg-[#0B0D10]/90 border border-border px-2.5 py-1.5 text-center">
                        <span className="text-[10px] font-medium text-muted-foreground block">
                          Ejes 32D
                        </span>
                        <span className="text-sm sm:text-base font-bold font-mono text-purple-300">
                          {active32Count}/32
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1.5">
                      {revealStage < 4 ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={skipRevealImmediately}
                        >
                          <SkipForward
                            className="w-3.5 h-3.5"
                            strokeWidth={1.75}
                          />
                          <span>Mostrar todo</span>
                        </Button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="xs"
                              variant="secondary"
                              onClick={() => triggerSequentialReveal(true)}
                              title="Repetir animación épica de ADN"
                              aria-label="Repetir animación épica de ADN"
                            >
                              <Play
                                className="w-3 h-3 text-[#99A5FF]"
                                strokeWidth={2}
                              />
                              <span>Intro ADN</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Reproducir revelación secuencial del Bento Grid
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pending Hours Alert */}
                {pendingHoursCount > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-amber-300">
                      <AlertTriangle
                        className="w-4 h-4 text-amber-400 shrink-0"
                        strokeWidth={1.75}
                      />
                      <span>
                        <strong>{pendingHoursCount}</strong> juego(s) marcado(s)
                        sin horas asignadas.
                      </span>
                    </div>
                    {onJumpToPendingHours && (
                      <Button
                        size="xs"
                        variant="amber"
                        onClick={onJumpToPendingHours}
                      >
                        Cargar horas
                      </Button>
                    )}
                  </div>
                )}

                {/* Full-Width Horizontal Split: Left Hexagonal Radar + Right PVJ-6D Distribution & Stacked Bar */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                  {/* Left 5 Cols: Interactive SVG Hexagonal Radar */}
                  <div className="lg:col-span-5 rounded-md bg-[#0B0D10]/90 border border-border p-4 flex flex-col items-center justify-between relative overflow-hidden">
                    <div className="w-full flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
                        <Target
                          className="w-3.5 h-3.5 text-primary"
                          strokeWidth={1.75}
                        />
                        Radar Hexagonal PVJ-6D
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        Escala S [0–100]
                      </span>
                    </div>

                    <svg
                      viewBox="0 0 340 304"
                      className="w-full max-w-[340px] h-auto select-none overflow-visible"
                      role="img"
                      aria-label="Gráfico de radar hexagonal de ADN Gamer"
                    >
                      <defs>
                        <radialGradient
                          id="pvjRadarFillEpic"
                          cx="50%"
                          cy="50%"
                          r="55%"
                        >
                          <stop
                            offset="0%"
                            stopColor={primaryMeta?.color || '#5865F2'}
                            stopOpacity="0.62"
                          />
                          <stop
                            offset="65%"
                            stopColor={secondaryMeta?.color || '#a855f7'}
                            stopOpacity="0.32"
                          />
                          <stop
                            offset="100%"
                            stopColor="#5865F2"
                            stopOpacity="0.16"
                          />
                        </radialGradient>
                        <filter
                          id="pvjRadarGlow"
                          x="-20%"
                          y="-20%"
                          width="140%"
                          height="140%"
                        >
                          <feGaussianBlur stdDeviation="3.5" result="blur" />
                          <feComposite
                            in="SourceGraphic"
                            in2="blur"
                            operator="over"
                          />
                        </filter>
                      </defs>

                      {radarGeometry.ringPolygons.map((ring) => (
                        <polygon
                          key={ring.pct}
                          points={ring.pts}
                          fill={
                            ring.pct === 100
                              ? 'rgba(17, 20, 26, 0.78)'
                              : 'none'
                          }
                          stroke={
                            ring.pct === 100
                              ? 'rgba(153, 165, 255, 0.32)'
                              : 'rgba(139, 148, 158, 0.2)'
                          }
                          strokeWidth={ring.pct === 100 ? 1.3 : 0.8}
                          strokeDasharray={
                            ring.pct === 100 ? undefined : '3 3'
                          }
                        />
                      ))}

                      {radarGeometry.dataVertices.map((v) => {
                        const isHovered = hoveredDimension === v.dim.key;
                        return (
                          <line
                            key={`spoke-${v.dim.key}`}
                            x1={radarGeometry.cx}
                            y1={radarGeometry.cy}
                            x2={v.outerX}
                            y2={v.outerY}
                            stroke={
                              isHovered
                                ? v.dim.color
                                : 'rgba(139, 148, 158, 0.22)'
                            }
                            strokeWidth={isHovered ? '1.8' : '1'}
                          />
                        );
                      })}

                      <polygon
                        points={radarGeometry.dataPolygonPoints}
                        fill="url(#pvjRadarFillEpic)"
                        stroke="#99A5FF"
                        strokeWidth="2.4"
                        strokeLinejoin="round"
                        filter="url(#pvjRadarGlow)"
                        className="animate-adn-radar-expand"
                      />

                      {radarGeometry.dataVertices.map((v, idx) => {
                        const AxisIcon = PVJ_DIMENSION_ICONS[v.dim.key];
                        const isHovered = hoveredDimension === v.dim.key;
                        return (
                          <g
                            key={`vertex-${v.dim.key}`}
                            onMouseEnter={() => setHoveredDimension(v.dim.key)}
                            onMouseLeave={() => setHoveredDimension(null)}
                            className="cursor-pointer"
                          >
                            {isHovered && (
                              <circle
                                cx={v.x}
                                cy={v.y}
                                r="9"
                                fill={v.dim.color}
                                fillOpacity="0.25"
                                className="animate-lol-ring-pulse"
                              />
                            )}
                            <circle
                              cx={v.x}
                              cy={v.y}
                              r={isHovered ? '5.5' : '4.2'}
                              fill={v.dim.color}
                              stroke="#0B0D10"
                              strokeWidth="1.6"
                              className="animate-lol-dot-pop"
                              style={{ animationDelay: `${140 + idx * 55}ms` }}
                            />
                            <AxisIcon
                              x={v.lx - 7}
                              y={v.ly - 22}
                              width={14}
                              height={14}
                              color={v.dim.color}
                              strokeWidth={2}
                            />
                            <text
                              x={v.lx}
                              y={v.ly - 1}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill={isHovered ? '#FFFFFF' : '#F0F6FC'}
                              fontSize="10.5"
                              fontWeight="700"
                            >
                              {v.dim.shortLabel}
                            </text>
                            <text
                              x={v.lx}
                              y={v.ly + 12}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill={v.dim.color}
                              fontSize="10.5"
                              fontWeight="800"
                            >
                              {Math.round(v.sVal)}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Right 7 Cols: Relative Affinity Distribution P + Multi-Segment Spectrum Bar */}
                  <div className="lg:col-span-7 rounded-md bg-[#0B0D10]/90 border border-border p-4 flex flex-col justify-between space-y-3.5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
                          <Award
                            className="w-3.5 h-3.5 text-emerald-400"
                            strokeWidth={1.75}
                          />
                          Distribución Relativa PVJ-6D
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Vector P · 100%
                        </span>
                      </div>

                      {/* Stacked 100% Horizontal DNA Spectrum Bar */}
                      <div className="h-3 w-full rounded-full bg-[#181C24] overflow-hidden border border-border flex p-0.5 gap-0.5">
                        {sortedDimensions.map((dim) => {
                          const pScore =
                            pvjProfile.vectors.relative_distribution_P[
                              dim.key
                            ] || 0;
                          if (pScore <= 0.5) return null;
                          const isHovered = hoveredDimension === dim.key;
                          return (
                            <Tooltip key={`stack-${dim.key}`}>
                              <TooltipTrigger asChild>
                                <div
                                  onMouseEnter={() =>
                                    setHoveredDimension(dim.key)
                                  }
                                  onMouseLeave={() => setHoveredDimension(null)}
                                  className={cn(
                                    'h-full first:rounded-l-full last:rounded-r-full transition-all duration-300 cursor-pointer animate-lol-bar-grow',
                                    isHovered && 'brightness-125 scale-y-110'
                                  )}
                                  style={{
                                    width: `${pScore}%`,
                                    backgroundColor: dim.color,
                                  }}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                {dim.label}: {pScore.toFixed(1)}% (Radar S:{' '}
                                {Math.round(
                                  pvjProfile.vectors.radar_scores_S[dim.key] ||
                                    0
                                )}
                                )
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>

                    {/* 6 Dimension Breakdown Rows */}
                    <div className="space-y-2.5">
                      {sortedDimensions.map((dim, idx) => {
                        const pScore =
                          pvjProfile.vectors.relative_distribution_P[dim.key] ||
                          0;
                        const sScore =
                          pvjProfile.vectors.radar_scores_S[dim.key] || 0;
                        const isPrimary =
                          dim.key ===
                          pvjProfile.classification.primary_dimension;
                        const isSecondary =
                          dim.key ===
                          pvjProfile.classification.secondary_dimension;
                        const isHovered = hoveredDimension === dim.key;

                        return (
                          <div
                            key={dim.key}
                            onMouseEnter={() => setHoveredDimension(dim.key)}
                            onMouseLeave={() => setHoveredDimension(null)}
                            style={{ animationDelay: `${idx * 45}ms` }}
                            className={cn(
                              'p-2 rounded-md border transition-all duration-200 animate-lol-row-slide cursor-default',
                              isHovered
                                ? 'bg-[#181C24] border-primary/50 translate-x-0.5'
                                : 'bg-[#11141A]/75 border-border/70'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs mb-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] font-mono text-muted-foreground w-4">
                                  #{idx + 1}
                                </span>
                                <PvjDimensionIcon
                                  dimension={dim.key}
                                  color={dim.color}
                                  className="w-3.5 h-3.5 shrink-0"
                                />
                                <span className="font-semibold text-foreground truncate">
                                  {dim.label}
                                </span>
                                {isPrimary && (
                                  <Badge
                                    variant="default"
                                    className="text-[9px] px-1.5 py-0"
                                  >
                                    Dominante
                                  </Badge>
                                )}
                                {isSecondary && (
                                  <Badge
                                    variant="purple"
                                    className="text-[9px] px-1.5 py-0"
                                  >
                                    Secundaria
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0 font-mono">
                                <span className="text-[10px] text-muted-foreground">
                                  S:{Math.round(sScore)}
                                </span>
                                <span
                                  className="font-bold text-xs"
                                  style={{ color: dim.color }}
                                >
                                  {pScore.toFixed(1)}%
                                </span>
                              </div>
                            </div>

                            <div className="h-2 rounded-full bg-[#181C24] overflow-hidden border border-border/80">
                              <div
                                className="h-full rounded-full animate-lol-bar-grow transition-all duration-500"
                                style={{
                                  width: `${Math.max(2, Math.min(100, pScore))}%`,
                                  backgroundColor: dim.color,
                                  animationDelay: `${100 + idx * 55}ms`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ==================================================================
              BENTO TILE 2 (LEFT MIDDLE: xl:col-span-5)
              JUEGOS MÁS INFLUYENTES CON ICONOS CHIQUITITOS DE LOS JUEGOS
             ================================================================== */}
          {revealStage >= 2 && (
            <Card className="xl:col-span-5 border-border bg-[#11141A]/90 flex flex-col animate-adn-bento-in">
              <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border">
                    <h3 className="text-xs sm:text-sm font-bold text-foreground inline-flex items-center gap-2">
                      <Flame
                        className="w-4 h-4 text-amber-400 shrink-0"
                        strokeWidth={1.75}
                      />
                      <span>
                        Top {pvjProfile.top_influencing_games.length} Juegos
                        Influyentes
                      </span>
                    </h3>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono text-muted-foreground"
                    >
                      Peso W × ω
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {pvjProfile.top_influencing_games.map((g, idx) => {
                      const domMeta = PVJ_DIMENSION_MAP.get(
                        g.dominant_dimension
                      );
                      const visuals = resolveInfluencingGameVisuals(
                        g,
                        player,
                        unifiedGames
                      );
                      const weightRatioPct = Math.max(
                        8,
                        Math.min(
                          100,
                          Math.round(
                            ((g.effective_weight_W || 1) /
                              maxInfluencingWeight) *
                              100
                          )
                        )
                      );
                      const omegaPct = Math.round(
                        (g.specificity_omega || 0) * 100
                      );

                      return (
                        <div
                          key={`${g.app_id}-${g.name}`}
                          style={{ animationDelay: `${idx * 45}ms` }}
                          className="group p-2 rounded-md bg-[#0B0D10]/90 border border-border hover:border-primary/50 transition-all duration-200 hover:-translate-y-0.5 animate-lol-row-slide"
                        >
                          <div className="flex items-center justify-between gap-2.5">
                            {/* Rank + Tiny Game Icon Thumbnail + Name */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={cn(
                                  'w-5 h-5 rounded text-[10px] font-mono font-bold flex items-center justify-center shrink-0 border',
                                  idx === 0
                                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                    : idx === 1
                                      ? 'bg-slate-400/20 border-slate-400/45 text-slate-200'
                                      : idx === 2
                                        ? 'bg-amber-700/25 border-amber-600/45 text-amber-400'
                                        : 'bg-[#181C24] border-border text-muted-foreground'
                                )}
                              >
                                #{idx + 1}
                              </span>

                              {/* Tiny Game Icon / Cover with hover official link */}
                              <a
                                href={visuals.officialUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Abrir ${g.name}`}
                                aria-label={`Abrir ${g.name}`}
                                className="relative w-8 h-8 rounded-md overflow-hidden border border-border bg-[#181C24] shrink-0 block group-hover:border-primary/60 transition-transform duration-200 group-hover:scale-105"
                              >
                                <img
                                  src={visuals.coverUrl}
                                  alt={g.name}
                                  onError={handleImageFallback}
                                  className="w-full h-full object-cover"
                                />
                              </a>

                              <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                  <a
                                    href={visuals.officialUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-semibold text-foreground hover:text-[#99A5FF] truncate block transition-colors"
                                  >
                                    {g.name}
                                  </a>
                                  <ExternalLink
                                    className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                    strokeWidth={1.75}
                                  />
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                                  <span className="text-foreground font-semibold">
                                    {g.hours}h
                                  </span>
                                  {g.recent_hours !== undefined &&
                                    g.recent_hours > 0 && (
                                      <span className="text-emerald-400">
                                        (+{g.recent_hours}h rec)
                                      </span>
                                    )}
                                  <span>·</span>
                                  <span title="Especificidad de Shannon ω">
                                    ω {omegaPct}%
                                  </span>
                                  <span>·</span>
                                  <span title="Peso logarítmico efectivo W">
                                    W {g.effective_weight_W}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Dominant Dimension Pill */}
                            {domMeta && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border whitespace-nowrap text-foreground shrink-0"
                                style={{
                                  backgroundColor: `${domMeta.color}18`,
                                  borderColor: `${domMeta.color}45`,
                                }}
                              >
                                <PvjDimensionIcon
                                  dimension={domMeta.key}
                                  color={domMeta.color}
                                  className="w-3 h-3 shrink-0"
                                />
                                <span className="hidden sm:inline">
                                  {domMeta.label}
                                </span>
                              </span>
                            )}
                          </div>

                          {/* Mini Contribution Bar */}
                          <div className="mt-1.5 h-1 rounded-full bg-[#181C24] overflow-hidden">
                            <div
                              className="h-full rounded-full animate-lol-bar-grow"
                              style={{
                                width: `${weightRatioPct}%`,
                                backgroundColor: domMeta?.color || '#5865F2',
                                animationDelay: `${120 + idx * 50}ms`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mini Footer Summary */}
                <div className="pt-2 border-t border-border/70 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                  <span>Ponderación logarítmica + Entropía ω</span>
                  <span className="text-[#99A5FF]">
                    Top {pvjProfile.top_influencing_games.length} activos
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ==================================================================
              BENTO TILE 3 (RIGHT MIDDLE: xl:col-span-7)
              VECTOR 32D — TELEMETRÍA DE MICRO-DIMENSIONES
             ================================================================== */}
          {revealStage >= 3 && (
            <Card className="xl:col-span-7 border-border bg-[#11141A]/90 flex flex-col animate-adn-bento-in">
              <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Zap
                        className="w-4 h-4 text-[#99A5FF] shrink-0"
                        strokeWidth={1.75}
                      />
                      <h3 className="text-xs sm:text-sm font-bold text-foreground">
                        Vector de Gustos 32D
                      </h3>
                      <Badge
                        variant="purple"
                        className="text-[10px] font-mono px-1.5 py-0"
                      >
                        {active32Count} dimensiones
                      </Badge>
                    </div>

                    {/* Category Cluster Filter Pills */}
                    <div className="flex flex-wrap items-center gap-1">
                      {(
                        [
                          { id: 'all', label: 'Todas' },
                          { id: 'genre', label: 'Género' },
                          { id: 'pace', label: 'Ritmo' },
                          { id: 'social', label: 'Social' },
                          { id: 'aesthetic', label: 'Estética' },
                        ] as Array<{ id: VectorGroupFilter; label: string }>
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setVectorGroupFilter(tab.id)}
                          className={cn(
                            'px-2 py-0.5 rounded border text-[10px] font-semibold transition-all cursor-pointer active:scale-95',
                            vectorGroupFilter === tab.id
                              ? 'bg-primary/20 border-primary text-[#99A5FF]'
                              : 'bg-[#0B0D10] border-border text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 32D Dense Bento Grid of Micro-Dimensions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {filtered32Dimensions.map((dim, idx) => {
                      const groupMeta = VECTOR_GROUP_META[dim.group];
                      const meta = TASTE_DIMENSION_MAP.get(dim.key);
                      return (
                        <div
                          key={dim.key}
                          style={{ animationDelay: `${idx * 30}ms` }}
                          className="p-2.5 rounded-md bg-[#0B0D10]/90 border border-border hover:border-primary/45 transition-all duration-200 hover:-translate-y-0.5 space-y-1.5 animate-lol-card-pop"
                        >
                          <div className="flex items-center justify-between gap-1.5 text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: groupMeta.color }}
                                title={groupMeta.label}
                              />
                              <span
                                className="font-semibold text-foreground truncate"
                                title={meta?.label ?? dim.label}
                              >
                                {meta?.label ?? dim.label}
                              </span>
                            </div>
                            <span
                              className="font-mono font-bold text-[11px] shrink-0"
                              style={{ color: groupMeta.color }}
                            >
                              {dim.pct}%
                            </span>
                          </div>

                          <div className="h-1.5 rounded-full bg-[#181C24] overflow-hidden border border-border/60">
                            <div
                              className="h-full rounded-full animate-lol-bar-grow"
                              style={{
                                width: `${Math.max(4, dim.pct)}%`,
                                backgroundColor: groupMeta.color,
                                animationDelay: `${90 + idx * 30}ms`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Expand / Collapse all 32 dimensions */}
                <div className="pt-2 border-t border-border/70 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    {(
                      Object.entries(VECTOR_GROUP_META) as Array<
                        [
                          Exclude<VectorGroupFilter, 'all'>,
                          (typeof VECTOR_GROUP_META)['genre'],
                        ]
                      >
                    ).map(([key, g]) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1"
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: g.color }}
                        />
                        <span>{g.label}</span>
                      </span>
                    ))}
                  </div>

                  {vectorGroupFilter === 'all' && (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => setShowAll32D((prev) => !prev)}
                    >
                      <Compass className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>
                        {showAll32D ? 'Ver Top 12' : 'Ver las 32 Dimensiones'}
                      </span>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ==================================================================
              BENTO TILE 4 (BOTTOM FULL-WIDTH: xl:col-span-12)
              MATRIZ DE ARQUETIPOS 6×6 INTERACTIVA
             ================================================================== */}
          {revealStage >= 3 && (
            <Card className="xl:col-span-12 border-border bg-[#11141A]/90 animate-adn-bento-in">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
                      <Grid className="w-4 h-4" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-foreground">
                        Matriz Simétrica de Arquetipos 6×6
                      </h4>
                      <p className="text-[11px] text-muted-foreground truncate">
                        Posición activa:{' '}
                        <strong className="text-foreground">
                          {pvjProfile.classification.archetype_name}
                        </strong>{' '}
                        ({primaryMeta?.label} ×{' '}
                        {secondaryMeta?.label ?? primaryMeta?.label})
                      </p>
                    </div>
                  </div>

                  <Button
                    variant={showMatrix ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setShowMatrix((prev) => !prev)}
                  >
                    <Grid className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>{showMatrix ? 'Ocultar Matriz 6×6' : 'Explorar 36 Arquetipos'}</span>
                    {showMatrix ? (
                      <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.75} />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
                    )}
                  </Button>
                </div>

                {showMatrix && (
                  <div className="pt-2 border-t border-border grid grid-cols-1 xl:grid-cols-12 gap-4 items-start animate-step-in">
                    <div className="xl:col-span-8 overflow-x-auto scroller-thin pb-1">
                      <div className="w-fit space-y-1 text-[10px]">
                        {/* Header Row */}
                        <div className="grid grid-cols-[90px_repeat(6,84px)] gap-1">
                          <div className="px-2 py-1.5 rounded border border-border/70 bg-card/55 text-left font-semibold text-muted-foreground flex items-center">
                            D1..D6
                          </div>
                          {PVJ_DIMENSIONS.map((colDim) => (
                            <div
                              key={`col-${colDim.key}`}
                              className="px-1 py-1.5 rounded border border-border/70 bg-card/55 text-center font-semibold text-foreground flex items-center justify-center gap-1"
                            >
                              <PvjDimensionIcon
                                dimension={colDim.key}
                                color={colDim.color}
                                className="w-3 h-3 shrink-0"
                              />
                              <span className="truncate">{colDim.label}</span>
                            </div>
                          ))}
                        </div>

                        {/* 6x6 Symmetric Grid Rows */}
                        {PVJ_DIMENSION_KEYS.map((rowKey) => {
                          const rowDim = PVJ_DIMENSION_MAP.get(rowKey)!;
                          return (
                            <div
                              key={`row-${rowKey}`}
                              className="grid grid-cols-[90px_repeat(6,84px)] gap-1 items-stretch"
                            >
                              <div className="px-2 py-1.5 rounded border border-border/70 bg-card/55 text-left font-semibold text-foreground flex items-center gap-1 whitespace-nowrap">
                                <PvjDimensionIcon
                                  dimension={rowDim.key}
                                  color={rowDim.color}
                                  className="w-3 h-3 shrink-0"
                                />
                                <span className="truncate">{rowDim.label}</span>
                              </div>

                              {PVJ_DIMENSION_KEYS.map((colKey) => {
                                const colDim = PVJ_DIMENSION_MAP.get(colKey)!;
                                const cellMeta =
                                  ARCHETYPE_MATRIX_6X6[rowKey][colKey];
                                const isDiagonal = rowKey === colKey;
                                const isPlayerActive =
                                  pvjProfile.classification.type !==
                                    'POLYMATH' &&
                                  ((rowKey === activeMatrixRow &&
                                    colKey === activeMatrixCol) ||
                                    (rowKey === activeMatrixCol &&
                                      colKey === activeMatrixRow));
                                const isInspected =
                                  inspectedCell?.row === rowKey &&
                                  inspectedCell?.col === colKey;

                                return (
                                  <button
                                    key={`cell-${rowKey}-${colKey}`}
                                    type="button"
                                    title={cellMeta.name}
                                    onClick={() =>
                                      setInspectedCell({
                                        row: rowKey,
                                        col: colKey,
                                      })
                                    }
                                    className={cn(
                                      'aspect-square w-[84px] rounded border p-1.5 text-center transition-all duration-150 flex flex-col items-center justify-between gap-1 cursor-pointer hover:scale-[1.03]',
                                      isPlayerActive
                                        ? 'bg-primary/25 border-primary text-foreground ring-1 ring-inset ring-primary font-bold shadow-md shadow-primary/20'
                                        : isInspected
                                          ? 'bg-primary/15 border-primary/60 text-foreground ring-1 ring-inset ring-primary/50'
                                          : isDiagonal
                                            ? 'bg-secondary/65 border-border/80 text-foreground hover:bg-accent/70 font-semibold'
                                            : 'bg-background/50 border-border/70 text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                                    )}
                                  >
                                    <span className="w-full flex-1 flex items-center justify-center text-[9.5px] leading-[1.15] line-clamp-3 break-words">
                                      {cellMeta.name}
                                    </span>

                                    <span className="inline-flex items-center justify-center gap-1 shrink-0">
                                      {isDiagonal ? (
                                        <PvjDimensionIcon
                                          dimension={rowKey}
                                          color={rowDim.color}
                                          className="w-3.5 h-3.5 shrink-0"
                                        />
                                      ) : (
                                        <>
                                          <PvjDimensionIcon
                                            dimension={rowKey}
                                            color={rowDim.color}
                                            className="w-3 h-3 shrink-0"
                                          />
                                          <PvjDimensionIcon
                                            dimension={colKey}
                                            color={colDim.color}
                                            className="w-3 h-3 shrink-0 opacity-90"
                                          />
                                        </>
                                      )}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right 4 Cols: Inspected Archetype Spotlight Card */}
                    <div className="xl:col-span-4 space-y-2.5">
                      {activeInspectedMeta && (
                        <div className="rounded-md bg-[#0B0D10] border border-primary/40 p-3.5 space-y-2 text-xs animate-lol-card-pop">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-[#99A5FF]">
                              {inspectedCell
                                ? 'Arquetipo Inspeccionado'
                                : 'Tu Arquetipo Activo'}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <PvjDimensionIcon
                                dimension={
                                  inspectedCell?.row ?? activeMatrixRow
                                }
                                color={
                                  PVJ_DIMENSION_MAP.get(
                                    inspectedCell?.row ?? activeMatrixRow
                                  )?.color
                                }
                                className="w-4 h-4 shrink-0"
                              />
                              {(inspectedCell?.row ?? activeMatrixRow) !==
                                (inspectedCell?.col ?? activeMatrixCol) && (
                                <PvjDimensionIcon
                                  dimension={
                                    inspectedCell?.col ?? activeMatrixCol
                                  }
                                  color={
                                    PVJ_DIMENSION_MAP.get(
                                      inspectedCell?.col ?? activeMatrixCol
                                    )?.color
                                  }
                                  className="w-4 h-4 shrink-0"
                                />
                              )}
                            </span>
                          </div>

                          <h5 className="text-sm font-bold text-foreground">
                            {activeInspectedMeta.name}
                          </h5>

                          <div className="text-[11px] font-mono text-muted-foreground">
                            {
                              PVJ_DIMENSION_MAP.get(
                                inspectedCell?.row ?? activeMatrixRow
                              )?.label
                            }{' '}
                            ×{' '}
                            {
                              PVJ_DIMENSION_MAP.get(
                                inspectedCell?.col ?? activeMatrixCol
                              )?.label
                            }
                          </div>

                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {activeInspectedMeta.description}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
