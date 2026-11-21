import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LolAccount,
  LolDurationBucketKey,
  LolDurationBucketStats,
  LolMatchParticipantSummary,
  LolMatchSummary,
  LolTimeRangeFilter,
} from '@/types/lol';
import {
  computeDurationBuckets,
  isGroupMatch,
  TIME_RANGE_DAYS,
} from '@/lib/lolPerformanceEngine';
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
  timeRange: LolTimeRangeFilter;
  ddragonVersion?: string;
  onSelectMatch: (matchId: string) => void;
}

type ScatterOutcomeFilter = 'all' | 'win' | 'loss' | 'ff';

interface ScatterPoint {
  match: LolMatchSummary;
  participant: LolMatchParticipantSummary;
  eventMs: number;
  /** Average performanceScore (0-100) of all group members present in the game */
  groupPerf: number;
  groupScorers: number;
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

interface CrosshairState {
  ms: number;
  perf: number | null;
  scorers: number | null;
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

const WEEKDAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

function formatDayLabel(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAYS_ES[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

function formatHourLabel(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatFullDateTime(ms: number): string {
  return `${formatDayLabel(ms)} · ${formatHourLabel(ms)}hs`;
}

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

const TICK_STEPS_MS = [
  10 * MIN_MS,
  15 * MIN_MS,
  30 * MIN_MS,
  HOUR_MS,
  2 * HOUR_MS,
  3 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
  2 * DAY_MS,
  3 * DAY_MS,
  4 * DAY_MS,
  7 * DAY_MS,
  14 * DAY_MS,
  30 * DAY_MS,
] as const;

/** Builds calendar-aligned (local time) ticks: hour boundaries or local midnights. */
function buildTimeTicks(
  minMs: number,
  maxMs: number,
  targetCount = 10
): { ticks: number[]; stepMs: number } {
  const span = Math.max(1, maxMs - minMs);
  const stepMs =
    TICK_STEPS_MS.find((s) => span / s <= targetCount) ??
    TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
  const ticks: number[] = [];

  if (stepMs < DAY_MS) {
    const offsetMs = new Date(minMs).getTimezoneOffset() * MIN_MS;
    let t = Math.ceil((minMs - offsetMs) / stepMs) * stepMs + offsetMs;
    while (t <= maxMs && ticks.length < 60) {
      ticks.push(t);
      t += stepMs;
    }
  } else {
    const stepDays = Math.round(stepMs / DAY_MS);
    const d = new Date(minMs);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < minMs) d.setDate(d.getDate() + 1);
    while (d.getTime() <= maxMs && ticks.length < 60) {
      ticks.push(d.getTime());
      d.setDate(d.getDate() + stepDays);
    }
  }

  return { ticks, stepMs };
}

const SVG_W = 1120;
const SVG_H = 292;
const PAD_L = 44;
const PAD_R = 46;
const PAD_T = 30;
const PAD_B = 38;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;
const MIN_ZOOM_SPAN_MS = 20 * MIN_MS;
const Y_TICKS = [0, 25, 50, 75, 100] as const;
const GRADE_LINES: ReadonlyArray<{ score: number; grade: string }> = [
  { score: 45, grade: 'C' },
  { score: 66, grade: 'A' },
  { score: 82, grade: 'S' },
];
const CROSSHAIR_LABEL_W = 210;
const SNAP_DISTANCE = 12;

export const LolDurationScatterPanel: React.FC<LolDurationScatterPanelProps> = ({
  matches,
  targetPuuid,
  groupPuuids,
  accountByPuuid,
  timeRange,
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
  const [crosshair, setCrosshair] = useState<CrosshairState | null>(null);

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

  const { allPoints, groupWrSeries, buckets, fullDomain } = useMemo(() => {
    const samples: Array<{
      match: LolMatchSummary;
      participant: LolMatchParticipantSummary;
    }> = [];

    for (const match of matches) {
      const p = match.participants.find((part) => part.puuid === targetPuuid);
      if (p) samples.push({ match, participant: p });
    }

    // Duration buckets remain the source of truth for "minute of win / loss / FF"
    const bucketStats = computeDurationBuckets(
      samples.map((s) => ({
        durationSeconds: s.match.gameDuration,
        outcome: s.participant.outcome,
      }))
    );

    const points: ScatterPoint[] = [];
    for (const { match, participant } of samples) {
      const scorers = match.participants.filter(
        (p) =>
          (groupPuuids.has(p.puuid) || p.puuid === targetPuuid) &&
          p.outcome !== 'remake' &&
          Number.isFinite(p.performanceScore)
      );
      if (scorers.length === 0) continue;
      const avg = scorers.reduce((sum, p) => sum + p.performanceScore, 0) / scorers.length;
      points.push({
        match,
        participant,
        eventMs: resolveEventTimestampMs(match),
        groupPerf: Math.round(avg * 10) / 10,
        groupScorers: scorers.length,
        isGroup: isGroupMatch(match, groupPuuids),
      });
    }
    points.sort((a, b) => a.eventMs - b.eventMs);

    // Chronological cumulative Group Winrate across ALL group (≥2) games in the active filter
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

    // X domain follows the global timeframe filter (7d / 30d / 90d) — "Todo" fits the data
    const now = Date.now();
    let domain: { minMs: number; maxMs: number };
    if (timeRange !== 'all') {
      const startMs = now - TIME_RANGE_DAYS[timeRange] * DAY_MS;
      const span = now - startMs;
      domain = { minMs: startMs - span * 0.005, maxMs: now + span * 0.012 };
    } else {
      const allTimestamps = [
        ...points.map((p) => p.eventMs),
        ...wrSeries.map((w) => w.eventMs),
      ];
      let rawMin = now - 30 * DAY_MS;
      let rawMax = now;
      if (allTimestamps.length > 0) {
        rawMin = Math.min(...allTimestamps);
        rawMax = Math.max(now, ...allTimestamps);
      }
      const pad = Math.max(HOUR_MS, (rawMax - rawMin) * 0.02);
      domain = { minMs: rawMin - pad, maxMs: rawMax + pad };
    }

    return {
      allPoints: points,
      groupWrSeries: wrSeries,
      buckets: bucketStats,
      fullDomain: domain,
    };
  }, [matches, targetPuuid, groupPuuids, timeRange]);

  const [viewDomain, setViewDomain] = useState<{ minMs: number; maxMs: number }>(fullDomain);

  // Reset zoom whenever the timeframe / data range changes
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

  const visiblePoints = useMemo(() => {
    if (outcomeFilter === 'all') return allPoints;
    return allPoints.filter((pt) => pt.participant.outcome === outcomeFilter);
  }, [allPoints, outcomeFilter]);

  const toX = (ms: number) => PAD_L + ((ms - viewDomain.minMs) / viewSpanMs) * PLOT_W;
  const toY = (value0to100: number) =>
    PAD_T + PLOT_H - Math.min(1, Math.max(0, value0to100 / 100)) * PLOT_H;

  const updateCrosshair = (clientX: number, containerEl: HTMLDivElement) => {
    const rect = containerEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * SVG_W;
    if (svgX < PAD_L || svgX > SVG_W - PAD_R) {
      setCrosshair(null);
      return;
    }

    // Snap to the nearest game (scatter dot) when close enough
    let best: ScatterPoint | null = null;
    let bestDist = Infinity;
    for (const pt of visiblePoints) {
      const dist = Math.abs(toX(pt.eventMs) - svgX);
      if (dist < bestDist) {
        bestDist = dist;
        best = pt;
      }
    }

    if (best && bestDist <= SNAP_DISTANCE) {
      setCrosshair({ ms: best.eventMs, perf: best.groupPerf, scorers: best.groupScorers });
      return;
    }

    const ms = viewDomain.minMs + ((svgX - PAD_L) / PLOT_W) * viewSpanMs;
    setCrosshair({ ms, perf: null, scorers: null });
  };

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
    if (!st.active) {
      updateCrosshair(e.clientX, e.currentTarget);
      return;
    }

    const dxPx = e.clientX - st.startClientX;
    st.movedPx = Math.max(st.movedPx, Math.abs(dxPx));
    if (st.movedPx > 3) {
      setHoveredState(null);
      setCrosshair(null);
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

  const inViewPoints = useMemo(
    () =>
      visiblePoints.filter(
        (pt) => pt.eventMs >= viewDomain.minMs && pt.eventMs <= viewDomain.maxMs
      ),
    [visiblePoints, viewDomain.minMs, viewDomain.maxMs]
  );

  const avgGroupPerfInView = useMemo(() => {
    if (inViewPoints.length === 0) return null;
    const sum = inViewPoints.reduce((acc, pt) => acc + pt.groupPerf, 0);
    return Math.round(sum / inViewPoints.length);
  }, [inViewPoints]);

  const { ticks: xTicks, stepMs: xStepMs } = useMemo(
    () => buildTimeTicks(viewDomain.minMs, viewDomain.maxMs),
    [viewDomain.minMs, viewDomain.maxMs]
  );
  const showTickHours = xStepMs < DAY_MS;

  const groupWrPolyline = useMemo(() => {
    if (!showGroupWrLine || groupWrSeries.length === 0) return '';
    return groupWrSeries
      .map((pt) => `${toX(pt.eventMs).toFixed(1)},${toY(pt.winRate).toFixed(1)}`)
      .join(' ');
  }, [showGroupWrLine, groupWrSeries, viewDomain.minMs, viewSpanMs]);

  const groupWrAreaPath = useMemo(() => {
    if (!showGroupWrLine || groupWrSeries.length < 2) return '';
    const first = groupWrSeries[0];
    const last = groupWrSeries[groupWrSeries.length - 1];
    const lineSegs = groupWrSeries
      .map(
        (pt, idx) =>
          `${idx === 0 ? 'M' : 'L'} ${toX(pt.eventMs).toFixed(1)} ${toY(pt.winRate).toFixed(1)}`
      )
      .join(' ');
    return `${lineSegs} L ${toX(last.eventMs).toFixed(1)} ${(PAD_T + PLOT_H).toFixed(1)} L ${toX(first.eventMs).toFixed(1)} ${(PAD_T + PLOT_H).toFixed(1)} Z`;
  }, [showGroupWrLine, groupWrSeries, viewDomain.minMs, viewSpanMs]);

  const latestGroupWr =
    groupWrSeries.length > 0 ? groupWrSeries[groupWrSeries.length - 1].winRate : null;

  const crosshairX = crosshair ? toX(crosshair.ms) : null;
  const crosshairLabelX =
    crosshairX !== null
      ? Math.min(
          SVG_W - PAD_R - CROSSHAIR_LABEL_W / 2,
          Math.max(PAD_L + CROSSHAIR_LABEL_W / 2, crosshairX)
        )
      : 0;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 pt-3 px-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Activity className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <span>Performance del Grupo</span>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {inViewPoints.length}/{visiblePoints.length}G
            </Badge>
            {avgGroupPerfInView !== null && (
              <Badge
                variant="outline"
                className="font-mono text-[10px] border-primary/45 bg-primary/10 text-primary"
                title="Performance promedio del grupo en las partidas visibles"
              >
                Prom {avgGroupPerfInView}
              </Badge>
            )}
            {latestGroupWr !== null && showGroupWrLine && (
              <Badge
                variant="outline"
                className="font-mono text-[10px] border-indigo-400/50 bg-indigo-500/15 text-indigo-300"
              >
                <TrendingUp className="w-3 h-3" strokeWidth={1.75} />
                WR {latestGroupWr}%
              </Badge>
            )}
            <LolInfoTip
              acronym="Perf"
              title="Performance del Grupo vs Día y Hora"
              description="Cada punto es una partida. Eje Y izq.: performance promedio (0-100) de los integrantes del grupo en ese game. Eje Y der.: WR acumulado del grupo (≥2). Rueda: zoom · Arrastrar: desplazar."
            />
          </CardTitle>

          <div className="flex flex-wrap items-center gap-1.5">
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

            <div className="inline-flex items-center rounded-md border border-border bg-background/55 p-0.5 text-[11px] gap-0.5">
              {(
                [
                  { key: 'all', label: 'Todos', active: 'bg-primary/20 text-primary' },
                  { key: 'win', label: 'Wins', active: 'bg-success/20 text-success' },
                  {
                    key: 'loss',
                    label: 'Derrotas',
                    active: 'bg-destructive/20 text-destructive',
                  },
                  {
                    key: 'ff',
                    label: 'FF',
                    active: 'bg-[#4C0519]/90 border-[#9F1239] text-[#FDA4AF]',
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setOutcomeFilter(opt.key)}
                  className={cn(
                    'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors border border-transparent',
                    outcomeFilter === opt.key
                      ? cn(opt.active, 'font-semibold')
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

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
                title="Restablecer al filtro de tiempo"
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
        <div className="rounded-md border border-border bg-background/45 p-2.5 space-y-1.5">
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
            <span className="opacity-75">Rueda: zoom · Arrastrar: desplazar</span>
          </div>

          <div
            ref={svgContainerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => {
              if (!dragStateRef.current.active) setCrosshair(null);
            }}
            className={cn(
              'relative w-full select-none touch-none',
              isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
            )}
          >
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full h-auto block overflow-visible"
              role="img"
              aria-label="Performance promedio del grupo por partida vs día y hora"
            >
              <defs>
                <clipPath id="lol-timeline-plot-clip">
                  <rect x={PAD_L} y={PAD_T - 6} width={PLOT_W} height={PLOT_H + 12} />
                </clipPath>
                <linearGradient id="lol-wr-area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818CF8" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#818CF8" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Horizontal grid + Left Y-axis (Group performance 0-100) */}
              {Y_TICKS.map((tick) => {
                const y = toY(tick);
                return (
                  <g key={`y-${tick}`}>
                    <line
                      x1={PAD_L}
                      y1={y}
                      x2={SVG_W - PAD_R}
                      y2={y}
                      stroke="rgba(255,255,255,0.06)"
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
                      {tick}
                    </text>
                    {showGroupWrLine && (
                      <text
                        x={SVG_W - PAD_R + 7}
                        y={y + 3}
                        textAnchor="start"
                        fill="#A5B4FC"
                        fontSize="9.5"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {tick}%
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Grade reference lines (C / A / S) */}
              {GRADE_LINES.map(({ score, grade }) => {
                const y = toY(score);
                return (
                  <g key={`grade-${grade}`}>
                    <line
                      x1={PAD_L}
                      y1={y}
                      x2={SVG_W - PAD_R}
                      y2={y}
                      stroke="rgba(148, 155, 164, 0.22)"
                      strokeDasharray="3 4"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD_L + 5}
                      y={y - 3}
                      fill="rgba(148, 155, 164, 0.7)"
                      fontSize="9"
                      fontWeight={700}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {grade}
                    </text>
                  </g>
                );
              })}

              {/* Vertical X grid + calendar-aligned day/hour ticks */}
              {xTicks.map((ts) => {
                const x = toX(ts);
                return (
                  <g key={`x-${ts}`}>
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
                      stroke="rgba(255,255,255,0.22)"
                      strokeWidth={1}
                    />
                    <text
                      x={x}
                      y={PAD_T + PLOT_H + 15}
                      textAnchor="middle"
                      fill="#B5BAC1"
                      fontSize="9.5"
                      fontWeight={600}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {formatDayLabel(ts)}
                    </text>
                    {showTickHours && (
                      <text
                        x={x}
                        y={PAD_T + PLOT_H + 27}
                        textAnchor="middle"
                        fill="#80848E"
                        fontSize="9"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {formatHourLabel(ts)}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Axes frame */}
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
              {showGroupWrLine && (
                <line
                  x1={SVG_W - PAD_R}
                  y1={PAD_T}
                  x2={SVG_W - PAD_R}
                  y2={PAD_T + PLOT_H}
                  stroke="rgba(129, 140, 248, 0.3)"
                  strokeWidth={1}
                />
              )}

              <g clipPath="url(#lol-timeline-plot-clip)">
                {/* Game rug: exact time of every game on the X axis */}
                {visiblePoints.map((pt) => {
                  const x = toX(pt.eventMs);
                  return (
                    <line
                      key={`rug-${pt.match.matchId}`}
                      x1={x}
                      y1={PAD_T + PLOT_H - 5}
                      x2={x}
                      y2={PAD_T + PLOT_H}
                      stroke="rgba(181, 186, 193, 0.45)"
                      strokeWidth={1}
                    />
                  );
                })}

                {/* Group Winrate area + line */}
                {showGroupWrLine && groupWrSeries.length >= 2 && (
                  <>
                    <path d={groupWrAreaPath} fill="url(#lol-wr-area-grad)" />
                    <polyline
                      fill="none"
                      stroke="#818CF8"
                      strokeOpacity={0.85}
                      strokeWidth={1.75}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={groupWrPolyline}
                    />
                  </>
                )}

                {/* Hover crosshair line */}
                {crosshairX !== null && !isDragging && (
                  <line
                    x1={crosshairX}
                    y1={PAD_T}
                    x2={crosshairX}
                    y2={PAD_T + PLOT_H}
                    stroke="rgba(242, 243, 245, 0.55)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    pointerEvents="none"
                  />
                )}

                {/* Game dots: Y = group average performance */}
                {visiblePoints.map((pt) => {
                  const cx = toX(pt.eventMs);
                  if (cx < PAD_L - 14 || cx > SVG_W - PAD_R + 14) return null;
                  const cy = Math.min(
                    PAD_T + PLOT_H - 4,
                    Math.max(PAD_T + 4, toY(pt.groupPerf))
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
                    </g>
                  );
                })}
              </g>

              {/* Crosshair date/time label — above the plot, outside the chart area */}
              {crosshair && crosshairX !== null && !isDragging && (
                <g pointerEvents="none">
                  <rect
                    x={crosshairLabelX - CROSSHAIR_LABEL_W / 2}
                    y={3}
                    width={CROSSHAIR_LABEL_W}
                    height={19}
                    rx={4}
                    fill="#1E1F22"
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={1}
                  />
                  <text
                    x={crosshairLabelX}
                    y={16.5}
                    textAnchor="middle"
                    fill="#F2F3F5"
                    fontSize="10.5"
                    fontWeight={600}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {formatFullDateTime(crosshair.ms)}
                    {crosshair.perf !== null && (
                      <tspan fill="#949BA4" fontWeight={500}>
                        {`  ·  Perf ${Math.round(crosshair.perf)}`}
                      </tspan>
                    )}
                  </text>
                  <line
                    x1={crosshairX}
                    y1={22}
                    x2={crosshairX}
                    y2={PAD_T}
                    stroke="rgba(242, 243, 245, 0.55)"
                    strokeWidth={1}
                  />
                </g>
              )}
            </svg>

            {visiblePoints.length === 0 && groupWrSeries.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[11px] font-mono text-muted-foreground bg-background/80 px-2.5 py-1 rounded border border-border">
                  Sin partidas en el filtro actual
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Minute of Win / Loss / FF — duration buckets */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
              <span>Minuto de Victoria / Derrota / FF</span>
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
                    setHighlightedBucket((prev) => (prev === bucket.key ? null : bucket.key))
                  }
                  title="Resaltar partidas de esta duración en el gráfico"
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
