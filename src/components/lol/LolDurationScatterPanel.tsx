import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LolAccount,
  LolDurationBucketKey,
  LolDurationBucketStats,
  LolMatchParticipantSummary,
  LolMatchSummary,
} from '@/types/lol';
import { computeDurationBuckets, isGroupMatch } from '@/lib/lolPerformanceEngine';
import { DEFAULT_DDRAGON_VERSION } from '@/lib/lolDdragon';
import { LolMatchHoverCard } from './LolMatchHoverCard';
import {
  LOL_FF_BAR_CLASS,
  LOL_FF_CHIP_CLASS,
  LOL_FF_DOT_FILL,
  LOL_FF_DOT_STROKE,
  LOL_LOSS_DOT_FILL,
  LOL_WIN_DOT_FILL,
  LolInfoTip,
} from './LolPrimitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Activity,
  Clock,
  RotateCcw,
  TrendingUp,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export interface LolDurationScatterPanelProps {
  matches: LolMatchSummary[];
  targetPuuid: string;
  groupPuuids: Set<string>;
  accountByPuuid: Map<string, LolAccount>;
  ddragonVersion?: string;
  onSelectMatch: (matchId: string) => void;
}

type ScatterOutcomeFilter = 'all' | 'win' | 'loss' | 'ff';

interface ScatterPoint {
  match: LolMatchSummary;
  participant: LolMatchParticipantSummary;
  eventMs: number;
  durationMins: number;
  isGroup: boolean;
}

interface GroupWrPoint {
  matchId: string;
  eventMs: number;
  winRate: number;
  winsSoFar: number;
  lossesSoFar: number;
  totalSoFar: number;
  won: boolean;
}

function bucketMatchesDuration(key: LolDurationBucketKey, sec: number): boolean {
  if (key === '0-5') return sec <= 300;
  if (key === '0-20') return sec <= 1200;
  if (key === '20-30') return sec > 1200 && sec <= 1800;
  return sec > 1800;
}

function resolveEventTimestampMs(match: LolMatchSummary): number {
  const startMs =
    match.gameStartTimestamp > 0 ? match.gameStartTimestamp : match.gameCreation;
  const endMs =
    match.gameEndTimestamp && match.gameEndTimestamp > 0
      ? match.gameEndTimestamp
      : startMs + match.gameDuration * 1000;
  return Number.isFinite(endMs) && endMs > 0 ? endMs : Date.now();
}

function formatAxisTimestamp(ms: number, spanMs: number): string {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');

  const dayMs = 24 * 60 * 60 * 1000;
  if (spanMs <= 18 * 60 * 60 * 1000) {
    return `${dd}/${mm} ${hh}:${min}`;
  }
  if (spanMs <= 5 * dayMs) {
    return `${dd}/${mm} ${hh}h`;
  }
  return `${dd}/${mm}`;
}

function formatFullDateTime(ms: number): string {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}hs`;
}

const SVG_W = 1120;
const SVG_H = 268;
const PAD_L = 44;
const PAD_R = 46;
const PAD_T = 16;
const PAD_B = 30;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;
const MIN_ZOOM_SPAN_MS = 20 * 60 * 1000; // 20 minutes
const WR_TICKS = [0, 25, 50, 75, 100] as const;

export const LolDurationScatterPanel: React.FC<LolDurationScatterPanelProps> = ({
  matches,
  targetPuuid,
  groupPuuids,
  accountByPuuid,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  onSelectMatch,
}) => {
  const [outcomeFilter, setOutcomeFilter] = useState<ScatterOutcomeFilter>('all');
  const [showGroupWrLine, setShowGroupWrLine] = useState(true);
  const [highlightedBucket, setHighlightedBucket] = useState<LolDurationBucketKey | null>(
    null
  );
  const [hoveredState, setHoveredState] = useState<{
    match: LolMatchSummary;
    participant: LolMatchParticipantSummary;
    rect: { left: number; top: number; right: number; bottom: number };
  } | null>(null);
  const [hoveredWrNode, setHoveredWrNode] = useState<{
    point: GroupWrPoint;
    xPct: number;
    yPct: number;
  } | null>(null);

  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    startClientX: number;
    startMinMs: number;
    startMaxMs: number;
    movedPx: number;
  }>({
    active: false,
    startClientX: 0,
    startMinMs: 0,
    startMaxMs: 0,
    movedPx: 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  const { allPoints, groupWrSeries, buckets, maxMins, fullDomain } = useMemo(() => {
    const samples: Array<{
      match: LolMatchSummary;
      participant: LolMatchParticipantSummary;
    }> = [];

    for (const match of matches) {
      const p = match.participants.find((part) => part.puuid === targetPuuid);
      if (p) samples.push({ match, participant: p });
    }

    const bucketStats = computeDurationBuckets(
      samples.map((s) => ({
        durationSeconds: s.match.gameDuration,
        outcome: s.participant.outcome,
      }))
    );

    const maxDuration = samples.reduce(
      (max, s) => Math.max(max, s.match.gameDuration / 60),
      35
    );
    const computedMaxMins = Math.max(40, Math.ceil(maxDuration / 5) * 5);

    const points: ScatterPoint[] = samples
      .map(({ match, participant }) => ({
        match,
        participant,
        eventMs: resolveEventTimestampMs(match),
        durationMins: Math.max(0.5, match.gameDuration / 60),
        isGroup: isGroupMatch(match, groupPuuids),
      }))
      .sort((a, b) => a.eventMs - b.eventMs);

    // Build chronological Group Winrate line across ALL group matches in the active global filter
    const groupChronological = matches
      .filter((m) => isGroupMatch(m, groupPuuids))
      .map((m) => {
        const groupParts = m.participants.filter((p) => groupPuuids.has(p.puuid));
        const nonRemake = groupParts.filter((p) => p.outcome !== 'remake');
        if (nonRemake.length === 0) return null;
        const winsInMatch = nonRemake.filter((p) => p.outcome === 'win').length;
        const won = winsInMatch >= Math.ceil(nonRemake.length / 2);
        return {
          matchId: m.matchId,
          eventMs: resolveEventTimestampMs(m),
          won,
        };
      })
      .filter((x): x is { matchId: string; eventMs: number; won: boolean } => x !== null)
      .sort((a, b) => a.eventMs - b.eventMs);

    let winsSoFar = 0;
    let lossesSoFar = 0;
    const wrSeries: GroupWrPoint[] = groupChronological.map((item) => {
      if (item.won) winsSoFar += 1;
      else lossesSoFar += 1;
      const totalSoFar = winsSoFar + lossesSoFar;
      return {
        matchId: item.matchId,
        eventMs: item.eventMs,
        winRate: Math.round((winsSoFar / totalSoFar) * 1000) / 10,
        winsSoFar,
        lossesSoFar,
        totalSoFar,
        won: item.won,
      };
    });

    const allTimestamps = [
      ...points.map((p) => p.eventMs),
      ...wrSeries.map((w) => w.eventMs),
    ];

    const now = Date.now();
    let rawMin = now - 7 * 24 * 60 * 60 * 1000;
    let rawMax = now;
    if (allTimestamps.length > 0) {
      rawMin = Math.min(...allTimestamps);
      rawMax = Math.max(...allTimestamps);
      if (rawMax - rawMin < 60 * 60 * 1000) {
        rawMin -= 30 * 60 * 1000;
        rawMax += 30 * 60 * 1000;
      }
    }

    const pad = Math.max(15 * 60 * 1000, (rawMax - rawMin) * 0.04);
    return {
      allPoints: points,
      groupWrSeries: wrSeries,
      buckets: bucketStats,
      maxMins: computedMaxMins,
      fullDomain: { minMs: rawMin - pad, maxMs: rawMax + pad },
    };
  }, [matches, targetPuuid, groupPuuids]);

  const [viewDomain, setViewDomain] = useState<{ minMs: number; maxMs: number }>(fullDomain);

  // Reset zoom whenever underlying data range changes (e.g. timeframe/queue/user switch)
  useEffect(() => {
    setViewDomain(fullDomain);
  }, [fullDomain.minMs, fullDomain.maxMs]);

  const fullSpanMs = Math.max(MIN_ZOOM_SPAN_MS, fullDomain.maxMs - fullDomain.minMs);
  const viewSpanMs = Math.max(MIN_ZOOM_SPAN_MS, viewDomain.maxMs - viewDomain.minMs);
  const isZoomed = viewSpanMs < fullSpanMs * 0.98;

  const clampDomain = useCallback(
    (nextMin: number, nextMax: number) => {
      let span = nextMax - nextMin;
      if (span < MIN_ZOOM_SPAN_MS) {
        const mid = (nextMin + nextMax) / 2;
        span = MIN_ZOOM_SPAN_MS;
        nextMin = mid - span / 2;
        nextMax = mid + span / 2;
      }
      if (span >= fullSpanMs) {
        return { minMs: fullDomain.minMs, maxMs: fullDomain.maxMs };
      }
      if (nextMin < fullDomain.minMs) {
        nextMin = fullDomain.minMs;
        nextMax = fullDomain.minMs + span;
      }
      if (nextMax > fullDomain.maxMs) {
        nextMax = fullDomain.maxMs;
        nextMin = fullDomain.maxMs - span;
      }
      return { minMs: nextMin, maxMs: nextMax };
    },
    [fullDomain.minMs, fullDomain.maxMs, fullSpanMs]
  );

  const zoomAtRatio = useCallback(
    (factor: number, anchorRatio: number) => {
      setViewDomain((prev) => {
        const clampedRatio = Math.min(1, Math.max(0, anchorRatio));
        const prevSpan = Math.max(MIN_ZOOM_SPAN_MS, prev.maxMs - prev.minMs);
        const anchorMs = prev.minMs + clampedRatio * prevSpan;
        const nextSpan = Math.min(
          fullSpanMs,
          Math.max(MIN_ZOOM_SPAN_MS, prevSpan * factor)
        );
        const nextMin = anchorMs - clampedRatio * nextSpan;
        const nextMax = nextMin + nextSpan;
        return clampDomain(nextMin, nextMax);
      });
    },
    [clampDomain, fullSpanMs]
  );

  // Non-passive wheel listener so zooming never scrolls the outer page
  useEffect(() => {
    const el = svgContainerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;

      // Map clientX into plot area ratio [0..1]
      const svgX = ((e.clientX - rect.left) / rect.width) * SVG_W;
      const ratio = (svgX - PAD_L) / PLOT_W;
      const factor = e.deltaY < 0 ? 0.8 : 1.25;
      zoomAtRatio(factor, ratio);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [zoomAtRatio]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      active: true,
      startClientX: e.clientX,
      startMinMs: viewDomain.minMs,
      startMaxMs: viewDomain.maxMs,
      movedPx: 0,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st.active) return;

    const dxPx = e.clientX - st.startClientX;
    st.movedPx = Math.max(st.movedPx, Math.abs(dxPx));
    if (st.movedPx > 3) {
      setHoveredState(null);
      setHoveredWrNode(null);
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const plotPxWidth = Math.max(1, (PLOT_W / SVG_W) * rect.width);
    const span = st.startMaxMs - st.startMinMs;
    const deltaMs = -(dxPx / plotPxWidth) * span;
    setViewDomain(clampDomain(st.startMinMs + deltaMs, st.startMaxMs + deltaMs));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current.active) {
      dragStateRef.current.active = false;
      setIsDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const visiblePoints = useMemo(() => {
    let list = allPoints;
    if (outcomeFilter === 'win') {
      list = list.filter((pt) => pt.participant.outcome === 'win');
    } else if (outcomeFilter === 'loss') {
      list = list.filter((pt) => pt.participant.outcome === 'loss');
    } else if (outcomeFilter === 'ff') {
      list = list.filter(
        (pt) => pt.participant.outcome === 'ff' || pt.participant.outcome === 'remake'
      );
    }
    return list;
  }, [allPoints, outcomeFilter]);

  const inViewCount = useMemo(
    () =>
      visiblePoints.filter(
        (pt) => pt.eventMs >= viewDomain.minMs && pt.eventMs <= viewDomain.maxMs
      ).length,
    [visiblePoints, viewDomain.minMs, viewDomain.maxMs]
  );

  const yTicks = useMemo(() => {
    const base = [0, 5, 15, 20, 30, 40];
    if (maxMins >= 50) base.push(50);
    if (maxMins >= 60) base.push(60);
    return base.filter((m) => m <= maxMins);
  }, [maxMins]);

  const xTicks = useMemo(() => {
    const count = 7;
    const out: number[] = [];
    for (let i = 0; i <= count; i++) {
      out.push(viewDomain.minMs + (viewSpanMs * i) / count);
    }
    return out;
  }, [viewDomain.minMs, viewSpanMs]);

  const toX = (ms: number) =>
    PAD_L + ((ms - viewDomain.minMs) / viewSpanMs) * PLOT_W;
  const toYMin = (mins: number) =>
    PAD_T + PLOT_H - Math.min(1, Math.max(0, mins / maxMins)) * PLOT_H;
  const toYWr = (wrPct: number) =>
    PAD_T + PLOT_H - Math.min(1, Math.max(0, wrPct / 100)) * PLOT_H;

  const bucketBandRect = useMemo(() => {
    if (!highlightedBucket) return null;
    const minM =
      highlightedBucket === '20-30' ? 20 : highlightedBucket === '30+' ? 30 : 0;
    const maxM =
      highlightedBucket === '0-5'
        ? 5
        : highlightedBucket === '0-20'
          ? 20
          : highlightedBucket === '20-30'
            ? 30
            : maxMins;
    const yTop = toYMin(maxM);
    const yBot = toYMin(minM);
    return {
      y: yTop,
      height: Math.max(4, yBot - yTop),
    };
  }, [highlightedBucket, maxMins]);

  const groupWrPolyline = useMemo(() => {
    if (!showGroupWrLine || groupWrSeries.length === 0) return '';
    return groupWrSeries
      .map((pt) => `${toX(pt.eventMs).toFixed(1)},${toYWr(pt.winRate).toFixed(1)}`)
      .join(' ');
  }, [showGroupWrLine, groupWrSeries, viewDomain.minMs, viewSpanMs]);

  const groupWrAreaPath = useMemo(() => {
    if (!showGroupWrLine || groupWrSeries.length < 2) return '';
    const first = groupWrSeries[0];
    const last = groupWrSeries[groupWrSeries.length - 1];
    const lineSegs = groupWrSeries
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(pt.eventMs).toFixed(1)} ${toYWr(pt.winRate).toFixed(1)}`)
      .join(' ');
    return `${lineSegs} L ${toX(last.eventMs).toFixed(1)} ${(PAD_T + PLOT_H).toFixed(1)} L ${toX(first.eventMs).toFixed(1)} ${(PAD_T + PLOT_H).toFixed(1)} Z`;
  }, [showGroupWrLine, groupWrSeries, viewDomain.minMs, viewSpanMs]);

  const latestGroupWr =
    groupWrSeries.length > 0 ? groupWrSeries[groupWrSeries.length - 1].winRate : null;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 pt-3 px-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Activity className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <span>Duración vs Día y Hora</span>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {inViewCount}/{visiblePoints.length}G
            </Badge>
            {latestGroupWr !== null && showGroupWrLine && (
              <Badge
                variant="outline"
                className="font-mono text-[10px] border-indigo-400/50 bg-indigo-500/15 text-indigo-300"
              >
                <TrendingUp className="w-3 h-3" strokeWidth={1.75} />
                WR Grupo {latestGroupWr}%
              </Badge>
            )}
            <LolInfoTip
              acronym="Timeline"
              title="Duración y WR Grupo vs Fecha/Hora"
              description="Eje X: día y hora exacta de cada partida. Eje Y izq.: minuto en que terminó. Eje Y der.: evolución del Winrate del grupo (≥2). Usá la rueda para zoom y arrastrá con el click para desplazarte."
            />
          </CardTitle>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Group WR Line Toggle */}
            <button
              type="button"
              onClick={() => setShowGroupWrLine((prev) => !prev)}
              className={cn(
                'px-2 py-0.5 rounded-md border text-[11px] font-medium cursor-pointer transition-colors inline-flex items-center gap-1',
                showGroupWrLine
                  ? 'bg-indigo-500/20 border-indigo-400/60 text-indigo-300 font-semibold'
                  : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
              )}
              title="Mostrar/ocultar línea de Winrate del grupo"
            >
              <TrendingUp className="w-3 h-3" strokeWidth={1.75} />
              <span>WR Grupo</span>
            </button>

            {/* Unified Outcome Filters */}
            <div className="inline-flex items-center rounded-md border border-border bg-background/55 p-0.5 text-[11px] gap-0.5">
              <button
                type="button"
                onClick={() => setOutcomeFilter('all')}
                className={cn(
                  'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors',
                  outcomeFilter === 'all'
                    ? 'bg-primary/20 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setOutcomeFilter('win')}
                className={cn(
                  'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors',
                  outcomeFilter === 'win'
                    ? 'bg-success/20 text-success font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Wins
              </button>
              <button
                type="button"
                onClick={() => setOutcomeFilter('loss')}
                className={cn(
                  'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors',
                  outcomeFilter === 'loss'
                    ? 'bg-destructive/20 text-destructive font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Derrotas
              </button>
              <button
                type="button"
                onClick={() => setOutcomeFilter('ff')}
                className={cn(
                  'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors border border-transparent',
                  outcomeFilter === 'ff'
                    ? 'bg-[#4C0519]/90 border-[#9F1239] text-[#FDA4AF] font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                FF
              </button>
            </div>

            {/* Zoom & Pan Controls */}
            <div className="inline-flex items-center gap-0.5 pl-1 border-l border-border">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 w-6 p-0"
                title="Acercar (o rueda arriba)"
                aria-label="Acercar gráfico"
                onClick={() => zoomAtRatio(0.7, 0.5)}
              >
                <ZoomIn className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 w-6 p-0"
                title="Alejar (o rueda abajo)"
                aria-label="Alejar gráfico"
                onClick={() => zoomAtRatio(1.4, 0.5)}
              >
                <ZoomOut className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!isZoomed}
                className="h-6 px-1.5 text-[10px]"
                title="Restablecer zoom"
                aria-label="Restablecer zoom"
                onClick={() => setViewDomain(fullDomain)}
              >
                <RotateCcw className="w-3 h-3" strokeWidth={1.75} />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3.5 pt-1 space-y-3">
        {/* Panoramic Interactive Timeline Chart */}
        <div className="rounded-md border border-border bg-background/45 p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-success" />
                Win
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                Derrota
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#881337] border border-[#FB7185]" />
                FF
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rotate-45 bg-muted-foreground inline-block" />
                Remake
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-primary" />
                Grupo ≥2
              </span>
              {showGroupWrLine && (
                <span className="inline-flex items-center gap-1 text-indigo-300">
                  <span className="w-3.5 h-0.5 bg-indigo-400 inline-block rounded-full" />
                  WR Grupo (%)
                </span>
              )}
            </div>

            <span className="opacity-75">
              Rueda: zoom · Click + arrastrar: desplazar
            </span>
          </div>

          <div
            ref={svgContainerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={cn(
              'relative w-full select-none touch-none',
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            )}
          >
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full h-auto block overflow-visible"
              role="img"
              aria-label="Gráfico interactivo de duración y winrate del grupo vs día y hora exacta"
            >
              <defs>
                <clipPath id="lol-timeline-plot-clip">
                  <rect x={PAD_L} y={PAD_T - 6} width={PLOT_W} height={PLOT_H + 12} />
                </clipPath>
                <linearGradient id="lol-wr-area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818CF8" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#818CF8" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Horizontal Highlighted Bucket Band on Left Y-Axis */}
              {bucketBandRect && (
                <rect
                  x={PAD_L}
                  y={bucketBandRect.y}
                  width={PLOT_W}
                  height={bucketBandRect.height}
                  fill="rgba(88, 101, 242, 0.12)"
                />
              )}

              {/* Horizontal Grid & Left Y-Axis (Game Minutes) */}
              {yTicks.map((tick) => {
                const y = toYMin(tick);
                const isThreshold = tick === 5 || tick === 20 || tick === 30;
                return (
                  <g key={`y-${tick}`}>
                    <line
                      x1={PAD_L}
                      y1={y}
                      x2={SVG_W - PAD_R}
                      y2={y}
                      stroke={
                        isThreshold
                          ? 'rgba(148, 155, 164, 0.24)'
                          : 'rgba(255,255,255,0.06)'
                      }
                      strokeDasharray={isThreshold ? '3 3' : undefined}
                      strokeWidth={1}
                    />
                    <text
                      x={PAD_L - 7}
                      y={y + 3}
                      textAnchor="end"
                      fill="#949BA4"
                      fontSize="10"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {tick}m
                    </text>
                  </g>
                );
              })}

              {/* Right Y-Axis (Group Winrate 0% - 100%) */}
              {showGroupWrLine && (
                <g>
                  <line
                    x1={SVG_W - PAD_R}
                    y1={PAD_T}
                    x2={SVG_W - PAD_R}
                    y2={PAD_T + PLOT_H}
                    stroke="rgba(129, 140, 248, 0.3)"
                    strokeWidth={1}
                  />
                  {/* 50% WR reference line */}
                  <line
                    x1={PAD_L}
                    y1={toYWr(50)}
                    x2={SVG_W - PAD_R}
                    y2={toYWr(50)}
                    stroke="rgba(129, 140, 248, 0.22)"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                  />
                  {WR_TICKS.map((pct) => {
                    const y = toYWr(pct);
                    return (
                      <text
                        key={`wr-${pct}`}
                        x={SVG_W - PAD_R + 7}
                        y={y + 3}
                        textAnchor="start"
                        fill="#A5B4FC"
                        fontSize="9.5"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {pct}%
                      </text>
                    );
                  })}
                </g>
              )}

              {/* Vertical X Grid & Exact Date/Time Ticks */}
              {xTicks.map((ts, idx) => {
                const x = toX(ts);
                return (
                  <g key={`x-${idx}`}>
                    <line
                      x1={x}
                      y1={PAD_T}
                      x2={x}
                      y2={PAD_T + PLOT_H}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth={1}
                    />
                    <line
                      x1={x}
                      y1={PAD_T + PLOT_H}
                      x2={x}
                      y2={PAD_T + PLOT_H + 4}
                      stroke="rgba(255,255,255,0.18)"
                      strokeWidth={1}
                    />
                    <text
                      x={x}
                      y={SVG_H - 8}
                      textAnchor="middle"
                      fill="#949BA4"
                      fontSize="9.5"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {formatAxisTimestamp(ts, viewSpanMs)}
                    </text>
                  </g>
                );
              })}

              {/* Left & Bottom Axes Frame */}
              <line
                x1={PAD_L}
                y1={PAD_T}
                x2={PAD_L}
                y2={PAD_T + PLOT_H}
                stroke="rgba(255,255,255,0.16)"
                strokeWidth={1}
              />
              <line
                x1={PAD_L}
                y1={PAD_T + PLOT_H}
                x2={SVG_W - PAD_R}
                y2={PAD_T + PLOT_H}
                stroke="rgba(255,255,255,0.16)"
                strokeWidth={1}
              />

              {/* Clipped Data Layer: Group Winrate Line + Scatter Dots */}
              <g clipPath="url(#lol-timeline-plot-clip)">
                {/* Group Winrate Area + Line */}
                {showGroupWrLine && groupWrSeries.length >= 2 && (
                  <>
                    <path d={groupWrAreaPath} fill="url(#lol-wr-area-grad)" />
                    <polyline
                      fill="none"
                      stroke="#818CF8"
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={groupWrPolyline}
                    />
                  </>
                )}

                {showGroupWrLine &&
                  groupWrSeries.map((wrPt) => {
                    const cx = toX(wrPt.eventMs);
                    const cy = toYWr(wrPt.winRate);
                    if (cx < PAD_L - 12 || cx > SVG_W - PAD_R + 12) return null;
                    const isActive = hoveredWrNode?.point.matchId === wrPt.matchId;

                    return (
                      <g
                        key={`wr-node-${wrPt.matchId}`}
                        className="cursor-pointer"
                        onMouseEnter={() => {
                          if (dragStateRef.current.active) return;
                          setHoveredWrNode({
                            point: wrPt,
                            xPct: (cx / SVG_W) * 100,
                            yPct: (cy / SVG_H) * 100,
                          });
                        }}
                        onMouseLeave={() => setHoveredWrNode(null)}
                        onClick={(e) => {
                          if (dragStateRef.current.movedPx > 4) return;
                          e.stopPropagation();
                          onSelectMatch(wrPt.matchId);
                        }}
                      >
                        <circle cx={cx} cy={cy} r={8} fill="transparent" />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isActive ? 4.5 : 2.8}
                          fill="#A5B4FC"
                          stroke="#11141A"
                          strokeWidth={1.2}
                        />
                      </g>
                    );
                  })}

                {/* Scatter Match Dots */}
                {visiblePoints.map((pt) => {
                  const cx = toX(pt.eventMs);
                  if (cx < PAD_L - 14 || cx > SVG_W - PAD_R + 14) return null;
                  const cy = Math.min(
                    PAD_T + PLOT_H - 4,
                    Math.max(PAD_T + 4, toYMin(pt.durationMins))
                  );
                  const outcome = pt.participant.outcome;
                  const isDimmed =
                    highlightedBucket !== null &&
                    !bucketMatchesDuration(highlightedBucket, pt.match.gameDuration);
                  const isHovered = hoveredState?.match.matchId === pt.match.matchId;

                  const fillColor =
                    outcome === 'win'
                      ? LOL_WIN_DOT_FILL
                      : outcome === 'ff'
                        ? LOL_FF_DOT_FILL
                        : outcome === 'remake'
                          ? '#949BA4'
                          : LOL_LOSS_DOT_FILL;

                  const strokeColor =
                    outcome === 'ff'
                      ? LOL_FF_DOT_STROKE
                      : outcome === 'win' && pt.participant.enemySurrendered
                        ? '#F59E0B'
                        : pt.isGroup
                          ? '#5865F2'
                          : '#0B0D10';

                  return (
                    <g
                      key={pt.match.matchId}
                      opacity={isDimmed ? 0.18 : 1}
                      className="cursor-pointer transition-opacity"
                      onMouseEnter={(e) => {
                        if (dragStateRef.current.active) return;
                        const r = e.currentTarget.getBoundingClientRect();
                        setHoveredState({
                          match: pt.match,
                          participant: pt.participant,
                          rect: {
                            left: r.left,
                            top: r.top,
                            right: r.right,
                            bottom: r.bottom,
                          },
                        });
                      }}
                      onMouseLeave={() => setHoveredState(null)}
                      onClick={(e) => {
                        if (dragStateRef.current.movedPx > 4) return;
                        e.stopPropagation();
                        onSelectMatch(pt.match.matchId);
                      }}
                    >
                      <circle cx={cx} cy={cy} r={10} fill="transparent" />

                      {pt.isGroup && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 10 : 8.2}
                          fill="none"
                          stroke="#5865F2"
                          strokeWidth={1.6}
                          strokeOpacity={0.85}
                        />
                      )}

                      {outcome === 'remake' ? (
                        <polygon
                          points={`${cx},${cy - 5.2} ${cx + 5.2},${cy} ${cx},${cy + 5.2} ${cx - 5.2},${cy}`}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={1.4}
                        />
                      ) : (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 7 : outcome === 'ff' ? 5.8 : 5.2}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={
                            outcome === 'ff' ||
                            (outcome === 'win' && pt.participant.enemySurrendered)
                              ? 1.9
                              : 1.3
                          }
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Inline WR Line Hover Chip */}
            {hoveredWrNode && !hoveredState && (
              <div
                style={{
                  left: `${Math.min(82, Math.max(12, hoveredWrNode.xPct))}%`,
                  top: `${Math.max(8, hoveredWrNode.yPct - 16)}%`,
                }}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-indigo-400/50 bg-popover/95 px-2.5 py-1.5 text-[10.5px] font-mono text-popover-foreground shadow-lg whitespace-nowrap z-20"
              >
                <div className="font-bold text-indigo-300">
                  WR Grupo: {hoveredWrNode.point.winRate}% ({hoveredWrNode.point.winsSoFar}V /{' '}
                  {hoveredWrNode.point.lossesSoFar}D)
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {formatFullDateTime(hoveredWrNode.point.eventMs)} ·{' '}
                  {hoveredWrNode.point.won ? 'Victoria' : 'Derrota'}
                </div>
              </div>
            )}

            {visiblePoints.length === 0 && groupWrSeries.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[11px] font-mono text-muted-foreground bg-background/80 px-2.5 py-1 rounded border border-border">
                  Sin partidas en el filtro actual
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Duration Buckets Strip inside same component: 0-5, 0-20, 20-30, 30+ */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
              <span>Balance por Duración (0-5 / 0-20 / 20-30 / 30+)</span>
            </span>
            {highlightedBucket && (
              <button
                type="button"
                onClick={() => setHighlightedBucket(null)}
                className="text-[10px] font-mono text-primary hover:underline cursor-pointer"
              >
                Limpiar ({highlightedBucket})
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {buckets.map((bucket: LolDurationBucketStats) => {
              const isSelected = highlightedBucket === bucket.key;
              const total = Math.max(1, bucket.total);
              const winPct = (bucket.wins / total) * 100;
              const lossPct = (bucket.losses / total) * 100;
              const ffPct = (bucket.ffs / total) * 100;

              return (
                <button
                  key={bucket.key}
                  type="button"
                  onClick={() =>
                    setHighlightedBucket((prev) =>
                      prev === bucket.key ? null : bucket.key
                    )
                  }
                  className={cn(
                    'text-left p-2 rounded-md border transition-colors cursor-pointer space-y-1.5',
                    isSelected
                      ? 'bg-primary/15 border-primary'
                      : 'bg-background/45 border-border hover:bg-muted/60'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold font-mono text-foreground">
                      {bucket.label}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {bucket.total > 0 ? `${bucket.winRate}% WR` : '—'}
                    </span>
                  </div>

                  {/* Stacked bar: Win (green) | Loss (red) | FF (bordó) */}
                  <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden flex">
                    {bucket.total > 0 && (
                      <>
                        <div className="bg-success h-full" style={{ width: `${winPct}%` }} />
                        <div className="bg-destructive h-full" style={{ width: `${lossPct}%` }} />
                        <div className={cn('h-full', LOL_FF_BAR_CLASS)} style={{ width: `${ffPct}%` }} />
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <div className="flex items-center gap-1">
                      <span className="text-success font-bold">{bucket.wins}V</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-destructive font-bold">{bucket.losses}D</span>
                      <span className="text-muted-foreground">·</span>
                      <span className={cn('text-[9.5px] font-bold', LOL_FF_CHIP_CLASS)}>
                        {bucket.ffs}FF
                      </span>
                    </div>
                    <span className="text-muted-foreground">{bucket.total}G</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>

      {hoveredState && !isDragging && (
        <LolMatchHoverCard
          match={hoveredState.match}
          participant={hoveredState.participant}
          anchorRect={hoveredState.rect}
          groupPuuids={groupPuuids}
          accountByPuuid={accountByPuuid}
          ddragonVersion={ddragonVersion}
        />
      )}
    </Card>
  );
};
