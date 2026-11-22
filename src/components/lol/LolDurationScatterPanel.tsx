import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LolAccount,
  LolMatchOutcome,
  LolMatchParticipantSummary,
  LolMatchSummary,
  LolTimeRangeFilter,
  LolViewMode,
} from '@/types/lol';
import {
  getGradeFromScore,
  isGroupMatch,
  resolveGroupMatchOutcome,
  TIME_RANGE_DAYS,
} from '@/lib/lolPerformanceEngine';
import { DEFAULT_DDRAGON_VERSION } from '@/lib/lolDdragon';
import { LolMatchHoverCard } from './LolMatchHoverCard';
import {
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
  RotateCcw,
  TrendingUp,
  User,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export interface LolDurationScatterPanelProps {
  mode: LolViewMode;
  matches: LolMatchSummary[];
  targetPuuid: string;
  targetPuuids?: ReadonlySet<string>;
  groupPuuids: Set<string>;
  puuidToUserId?: ReadonlyMap<string, string>;
  accountByPuuid: Map<string, LolAccount>;
  timeRange: LolTimeRangeFilter;
  ddragonVersion?: string;
  onSelectMatch: (matchId: string, initialPuuid?: string) => void;
}

type ScatterOutcomeFilter = 'all' | 'win' | 'loss' | 'ff';

interface ScatterPoint {
  match: LolMatchSummary;
  participant: LolMatchParticipantSummary;
  eventMs: number;
  perf: number;
  outcome: LolMatchOutcome;
  enemySurrendered: boolean;
  selectPuuid: string;
}

interface TimelineSeriesPoint {
  matchId: string;
  eventMs: number;
  winRate: number;
  avgPerf: number;
  winsSoFar: number;
  lossesSoFar: number;
  totalSoFar: number;
  won: boolean;
}

interface PersonalInGroupSeriesPoint {
  matchId: string;
  eventMs: number;
  avgPerf: number;
  gamesSoFar: number;
}

interface CrosshairState {
  ms: number;
  perf: number | null;
}

function buildStepPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return '';
  const segs: string[] = [`M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`];
  for (let i = 1; i < coords.length; i++) {
    segs.push(`L ${coords[i].x.toFixed(1)} ${coords[i - 1].y.toFixed(1)}`);
    segs.push(`L ${coords[i].x.toFixed(1)} ${coords[i].y.toFixed(1)}`);
  }
  return segs.join(' ');
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
const SVG_H = 326;
const PAD_L = 44;
const PAD_R = 46;
const PAD_T = 46;
const PAD_B = 42;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;
const MIN_ZOOM_SPAN_MS = 20 * MIN_MS;
const Y_TICKS = [0, 25, 50, 75, 100] as const;
const GRADE_LINES: ReadonlyArray<{ score: number; grade: string }> = [
  { score: 45, grade: 'C' },
  { score: 66, grade: 'A' },
  { score: 82, grade: 'S' },
];
const TOP_HUD_W = 296;
const TOP_HUD_W_EXPANDED = 418;
const BOTTOM_TIME_W = 152;
const SNAP_DISTANCE = 14;
const DRAG_THRESHOLD_PX = 4;

export const LolDurationScatterPanel: React.FC<LolDurationScatterPanelProps> = ({
  mode,
  matches,
  targetPuuid,
  targetPuuids,
  groupPuuids,
  puuidToUserId,
  accountByPuuid,
  timeRange,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  onSelectMatch,
}) => {
  const effectiveTargetPuuids = useMemo(
    () =>
      targetPuuids && targetPuuids.size > 0
        ? targetPuuids
        : targetPuuid
          ? new Set([targetPuuid])
          : new Set<string>(),
    [targetPuuids, targetPuuid]
  );
  const isPersonal = mode === 'personal';
  const wrLabel = isPersonal ? 'WR Personal' : 'WR Grupo';
  const avgPerfLabel = isPersonal ? 'Perf Personal' : 'Perf Grupo';

  const [outcomeFilter, setOutcomeFilter] = useState<ScatterOutcomeFilter>('all');
  const [showWrLine, setShowWrLine] = useState(true);
  const [showAvgPerfLine, setShowAvgPerfLine] = useState(true);
  const [showPersonalInGroupLine, setShowPersonalInGroupLine] = useState(false);
  const [hoveredState, setHoveredState] = useState<{
    match: LolMatchSummary;
    participant: LolMatchParticipantSummary;
    rect: { left: number; top: number; right: number; bottom: number };
  } | null>(null);
  const [crosshair, setCrosshair] = useState<CrosshairState | null>(null);

  useEffect(() => {
    setHoveredState(null);
    setCrosshair(null);
  }, [mode, targetPuuid]);

  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerDown: boolean;
    dragging: boolean;
    pointerId: number | null;
    startClientX: number;
    startClientY: number;
    startMinMs: number;
    startMaxMs: number;
    movedPx: number;
  }>({
    pointerDown: false,
    dragging: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startMinMs: 0,
    startMaxMs: 0,
    movedPx: 0,
  });
  const [isDragging, setIsDragging] = useState(false);

  const { allPoints, timelineSeries, personalInGroupSeries, fullDomain } = useMemo(() => {
    const points: ScatterPoint[] = [];

    if (mode === 'personal') {
      for (const match of matches) {
        const participant = match.participants.find((part) =>
          effectiveTargetPuuids.has(part.puuid)
        );
        if (
          !participant ||
          participant.outcome === 'remake' ||
          !Number.isFinite(participant.performanceScore)
        ) {
          continue;
        }
        const eventMs = resolveEventTimestampMs(match);
        points.push({
          match,
          participant,
          eventMs,
          perf: Math.round(participant.performanceScore * 10) / 10,
          outcome: participant.outcome,
          enemySurrendered: participant.enemySurrendered,
          selectPuuid: participant.puuid,
        });
      }
    } else {
      for (const match of matches) {
        if (!isGroupMatch(match, groupPuuids, puuidToUserId)) continue;
        const resolved = resolveGroupMatchOutcome(match, groupPuuids);

        if (
          resolved.outcome === 'remake' ||
          !resolved.representative ||
          !Number.isFinite(resolved.avgPerformance)
        ) {
          continue;
        }

        const myPart =
          effectiveTargetPuuids.size > 0
            ? match.participants.find((part) => effectiveTargetPuuids.has(part.puuid))
            : undefined;
        const hoverParticipant = myPart ?? resolved.representative;

        const eventMs = resolveEventTimestampMs(match);
        points.push({
          match,
          participant: hoverParticipant,
          eventMs,
          perf: resolved.avgPerformance,
          outcome: resolved.outcome,
          enemySurrendered: resolved.enemySurrendered,
          selectPuuid: hoverParticipant.puuid,
        });
      }
    }

    points.sort((a, b) => a.eventMs - b.eventMs);

    let winsSoFar = 0;
    let lossesSoFar = 0;
    let perfSumSoFar = 0;
    const computedSeries: TimelineSeriesPoint[] = points.map((pt) => {
      const won = pt.outcome === 'win';
      if (won) winsSoFar += 1;
      else lossesSoFar += 1;
      perfSumSoFar += pt.perf;
      const totalSoFar = winsSoFar + lossesSoFar;
      return {
        matchId: pt.match.matchId,
        eventMs: pt.eventMs,
        winRate: Math.round((winsSoFar / totalSoFar) * 1000) / 10,
        avgPerf: Math.round((perfSumSoFar / totalSoFar) * 10) / 10,
        winsSoFar,
        lossesSoFar,
        totalSoFar,
        won,
      };
    });

    const computedPersonalInGroupSeries: PersonalInGroupSeriesPoint[] = [];
    if (mode === 'group' && effectiveTargetPuuids.size > 0) {
      let personalPerfSumSoFar = 0;
      let personalGamesSoFar = 0;
      for (const pt of points) {
        const myPart = pt.match.participants.find((part) =>
          effectiveTargetPuuids.has(part.puuid)
        );
        if (
          !myPart ||
          myPart.outcome === 'remake' ||
          !Number.isFinite(myPart.performanceScore)
        ) {
          continue;
        }
        personalPerfSumSoFar += myPart.performanceScore;
        personalGamesSoFar += 1;
        computedPersonalInGroupSeries.push({
          matchId: pt.match.matchId,
          eventMs: pt.eventMs,
          avgPerf: Math.round((personalPerfSumSoFar / personalGamesSoFar) * 10) / 10,
          gamesSoFar: personalGamesSoFar,
        });
      }
    }

    // X domain starts at the exact first game and ends at the exact last game (zero leading/trailing gap)
    const now = Date.now();
    const allTimestamps = points.map((p) => p.eventMs);
    let domain: { minMs: number; maxMs: number };
    if (allTimestamps.length > 0) {
      const rawMin = Math.min(...allTimestamps);
      const rawMax = Math.max(...allTimestamps);
      if (rawMax > rawMin) {
        domain = { minMs: rawMin, maxMs: rawMax };
      } else {
        const half = MIN_ZOOM_SPAN_MS / 2;
        domain = { minMs: rawMin - half, maxMs: rawMax + half };
      }
    } else {
      const fallbackDays = timeRange === 'all' ? 30 : TIME_RANGE_DAYS[timeRange];
      domain = { minMs: now - fallbackDays * DAY_MS, maxMs: now };
    }

    return {
      allPoints: points,
      timelineSeries: computedSeries,
      personalInGroupSeries: computedPersonalInGroupSeries,
      fullDomain: domain,
    };
  }, [mode, matches, effectiveTargetPuuids, groupPuuids, puuidToUserId, timeRange]);

  const [viewDomain, setViewDomain] = useState<{ minMs: number; maxMs: number }>(fullDomain);

  // Reset zoom whenever the timeframe / data range changes
  useEffect(() => {
    setViewDomain(fullDomain);
  }, [fullDomain.minMs, fullDomain.maxMs]);

  const fullSpanMs = Math.max(1000, fullDomain.maxMs - fullDomain.minMs);
  const minZoomSpanMs = Math.min(MIN_ZOOM_SPAN_MS, fullSpanMs);
  const viewSpanMs = Math.max(1000, viewDomain.maxMs - viewDomain.minMs);
  const isZoomed = viewSpanMs < fullSpanMs * 0.995;

  const clampDomain = useCallback(
    (nextMin: number, nextMax: number) => {
      let span = nextMax - nextMin;
      if (span < minZoomSpanMs) {
        const mid = (nextMin + nextMax) / 2;
        span = minZoomSpanMs;
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
    [fullDomain.minMs, fullDomain.maxMs, fullSpanMs, minZoomSpanMs]
  );

  const zoomAtRatio = useCallback(
    (factor: number, anchorRatio: number) => {
      setViewDomain((prev) => {
        const clampedRatio = Math.min(1, Math.max(0, anchorRatio));
        const prevSpan = Math.max(minZoomSpanMs, prev.maxMs - prev.minMs);
        const anchorMs = prev.minMs + clampedRatio * prevSpan;
        const nextSpan = Math.min(
          fullSpanMs,
          Math.max(minZoomSpanMs, prevSpan * factor)
        );
        const nextMin = anchorMs - clampedRatio * nextSpan;
        const nextMax = nextMin + nextSpan;
        return clampDomain(nextMin, nextMax);
      });
    },
    [clampDomain, fullSpanMs, minZoomSpanMs]
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
      setHoveredState(null);
      zoomAtRatio(factor, ratio);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [zoomAtRatio]);

  const visiblePoints = useMemo(() => {
    if (outcomeFilter === 'all') return allPoints;
    return allPoints.filter((pt) => pt.outcome === outcomeFilter);
  }, [allPoints, outcomeFilter]);

  const toX = (ms: number) => PAD_L + ((ms - viewDomain.minMs) / viewSpanMs) * PLOT_W;
  const toY = (value0to100: number) =>
    PAD_T + PLOT_H - Math.min(1, Math.max(0, value0to100 / 100)) * PLOT_H;

  const findSnappedPoint = (svgX: number, svgY: number): ScatterPoint | null => {
    const candidates: Array<{ pt: ScatterPoint; dx: number; dy: number }> = [];
    for (const pt of visiblePoints) {
      const cx = toX(pt.eventMs);
      if (cx < PAD_L - 1 || cx > SVG_W - PAD_R + 1) continue;
      const dx = Math.abs(cx - svgX);
      if (dx <= SNAP_DISTANCE) {
        const cy = Math.min(PAD_T + PLOT_H - 4, Math.max(PAD_T + 4, toY(pt.perf)));
        candidates.push({ pt, dx, dy: Math.abs(cy - svgY) });
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      // When two games share essentially the same X column, let Y disambiguate them
      if (Math.abs(a.dx - b.dx) <= 4) {
        return a.dy - b.dy || a.dx - b.dx;
      }
      return a.dx - b.dx;
    });
    return candidates[0].pt;
  };

  const updateCrosshairAndHover = (
    clientX: number,
    clientY: number,
    containerEl: HTMLDivElement
  ) => {
    const rect = containerEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * SVG_W;
    const svgY = ((clientY - rect.top) / rect.height) * SVG_H;
    if (svgX < PAD_L - 8 || svgX > SVG_W - PAD_R + 8) {
      setCrosshair(null);
      setHoveredState(null);
      return;
    }

    const snapped = findSnappedPoint(svgX, svgY);
    if (snapped) {
      const cx = toX(snapped.eventMs);
      const cy = Math.min(PAD_T + PLOT_H - 4, Math.max(PAD_T + 4, toY(snapped.perf)));
      const dotScreenX = rect.left + (cx / SVG_W) * rect.width;
      const dotScreenY = rect.top + (cy / SVG_H) * rect.height;
      setCrosshair({ ms: snapped.eventMs, perf: snapped.perf });
      setHoveredState({
        match: snapped.match,
        participant: snapped.participant,
        rect: {
          left: dotScreenX - 6,
          right: dotScreenX + 6,
          top: dotScreenY - 6,
          bottom: dotScreenY + 6,
        },
      });
      return;
    }

    const clampedSvgX = Math.min(SVG_W - PAD_R, Math.max(PAD_L, svgX));
    const ms = viewDomain.minMs + ((clampedSvgX - PAD_L) / PLOT_W) * viewSpanMs;
    setCrosshair({ ms, perf: null });
    setHoveredState(null);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragStateRef.current = {
      pointerDown: true,
      dragging: false,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startMinMs: viewDomain.minMs,
      startMaxMs: viewDomain.maxMs,
      movedPx: 0,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st.pointerDown) {
      updateCrosshairAndHover(e.clientX, e.clientY, e.currentTarget);
      return;
    }

    const dxPx = e.clientX - st.startClientX;
    const dyPx = e.clientY - st.startClientY;
    const distPx = Math.hypot(dxPx, dyPx);
    st.movedPx = Math.max(st.movedPx, distPx);

    if (!st.dragging && st.movedPx > DRAG_THRESHOLD_PX) {
      st.dragging = true;
      setIsDragging(true);
      setHoveredState(null);
      setCrosshair(null);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer already released
      }
    }

    if (!st.dragging) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const plotPxWidth = Math.max(1, (PLOT_W / SVG_W) * rect.width);
    const span = st.startMaxMs - st.startMinMs;
    const deltaMs = -(dxPx / plotPxWidth) * span;
    setViewDomain(clampDomain(st.startMinMs + deltaMs, st.startMaxMs + deltaMs));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st.pointerDown) return;

    const wasDragging = st.dragging || st.movedPx > DRAG_THRESHOLD_PX;
    st.pointerDown = false;
    st.dragging = false;
    st.pointerId = null;
    setIsDragging(false);

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (!wasDragging) {
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const svgX = ((e.clientX - rect.left) / rect.width) * SVG_W;
        const svgY = ((e.clientY - rect.top) / rect.height) * SVG_H;
        if (svgX >= PAD_L - 8 && svgX <= SVG_W - PAD_R + 8) {
          const snapped = findSnappedPoint(svgX, svgY);
          if (snapped) {
            setHoveredState(null);
            setCrosshair(null);
            onSelectMatch(snapped.match.matchId, snapped.selectPuuid);
          }
        }
      }
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    st.pointerDown = false;
    st.dragging = false;
    st.pointerId = null;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const inViewPoints = useMemo(
    () =>
      visiblePoints.filter(
        (pt) => pt.eventMs >= viewDomain.minMs && pt.eventMs <= viewDomain.maxMs
      ),
    [visiblePoints, viewDomain.minMs, viewDomain.maxMs]
  );

  const avgPerfInView = useMemo(() => {
    if (inViewPoints.length === 0) return null;
    const sum = inViewPoints.reduce((acc, pt) => acc + pt.perf, 0);
    return Math.round(sum / inViewPoints.length);
  }, [inViewPoints]);

  const { ticks: xTicks, stepMs: xStepMs } = useMemo(
    () => buildTimeTicks(viewDomain.minMs, viewDomain.maxMs),
    [viewDomain.minMs, viewDomain.maxMs]
  );
  const showTickHours = xStepMs < DAY_MS;

  const wrStepPath = useMemo(() => {
    if (!showWrLine || timelineSeries.length < 2) return '';
    return buildStepPath(
      timelineSeries.map((pt) => ({ x: toX(pt.eventMs), y: toY(pt.winRate) }))
    );
  }, [showWrLine, timelineSeries, viewDomain.minMs, viewSpanMs]);

  const wrStepAreaPath = useMemo(() => {
    if (!wrStepPath || timelineSeries.length < 2) return '';
    const first = timelineSeries[0];
    const last = timelineSeries[timelineSeries.length - 1];
    const baseY = (PAD_T + PLOT_H).toFixed(1);
    return `${wrStepPath} L ${toX(last.eventMs).toFixed(1)} ${baseY} L ${toX(first.eventMs).toFixed(1)} ${baseY} Z`;
  }, [wrStepPath, timelineSeries, viewDomain.minMs, viewSpanMs]);

  const avgPerfStepPath = useMemo(() => {
    if (!showAvgPerfLine || timelineSeries.length < 2) return '';
    return buildStepPath(
      timelineSeries.map((pt) => ({ x: toX(pt.eventMs), y: toY(pt.avgPerf) }))
    );
  }, [showAvgPerfLine, timelineSeries, viewDomain.minMs, viewSpanMs]);

  const personalInGroupStepPath = useMemo(() => {
    if (isPersonal || !showPersonalInGroupLine || personalInGroupSeries.length === 0) {
      return '';
    }
    const coords = personalInGroupSeries.map((pt) => ({
      x: toX(pt.eventMs),
      y: toY(pt.avgPerf),
    }));
    const lastTimelineMs =
      timelineSeries.length > 0
        ? timelineSeries[timelineSeries.length - 1].eventMs
        : null;
    const lastPersonal = personalInGroupSeries[personalInGroupSeries.length - 1];
    if (lastTimelineMs !== null && lastTimelineMs > lastPersonal.eventMs) {
      coords.push({
        x: toX(lastTimelineMs),
        y: toY(lastPersonal.avgPerf),
      });
    }
    if (coords.length < 2) return '';
    return buildStepPath(coords);
  }, [
    isPersonal,
    showPersonalInGroupLine,
    personalInGroupSeries,
    timelineSeries,
    viewDomain.minMs,
    viewSpanMs,
  ]);

  const latestSeriesPoint =
    timelineSeries.length > 0 ? timelineSeries[timelineSeries.length - 1] : null;
  const latestWr = latestSeriesPoint ? latestSeriesPoint.winRate : null;

  const seriesAtCrosshair = useMemo(() => {
    if (!crosshair || timelineSeries.length === 0) return null;
    let active: TimelineSeriesPoint | null = null;
    for (const pt of timelineSeries) {
      if (pt.eventMs <= crosshair.ms) {
        active = pt;
      } else {
        break;
      }
    }
    return active ?? timelineSeries[0];
  }, [crosshair, timelineSeries]);

  const personalPerfAtCrosshair = useMemo(() => {
    if (
      isPersonal ||
      !showPersonalInGroupLine ||
      !crosshair ||
      personalInGroupSeries.length === 0
    ) {
      return null;
    }
    let active: PersonalInGroupSeriesPoint | null = null;
    for (const pt of personalInGroupSeries) {
      if (pt.eventMs <= crosshair.ms) {
        active = pt;
      } else {
        break;
      }
    }
    return active;
  }, [isPersonal, showPersonalInGroupLine, crosshair, personalInGroupSeries]);

  const crosshairX = crosshair ? toX(crosshair.ms) : null;
  const showPersonalHud =
    !isPersonal && showPersonalInGroupLine && personalPerfAtCrosshair !== null;
  const topHudW = showPersonalHud ? TOP_HUD_W_EXPANDED : TOP_HUD_W;
  const topHudX =
    crosshairX !== null
      ? Math.min(
          SVG_W - PAD_R - topHudW / 2,
          Math.max(PAD_L + topHudW / 2, crosshairX)
        )
      : 0;
  const hudLeft = topHudX - topHudW / 2;
  const bottomTimeX =
    crosshairX !== null
      ? Math.min(
          SVG_W - PAD_R - BOTTOM_TIME_W / 2,
          Math.max(PAD_L + BOTTOM_TIME_W / 2, crosshairX)
        )
      : 0;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 pt-3 px-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Activity className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <span>{isPersonal ? 'Performance Personal' : 'Performance del Grupo'}</span>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {inViewPoints.length}/{visiblePoints.length}G
            </Badge>
            {avgPerfInView !== null && (
              <Badge
                variant="outline"
                className="font-mono text-[10px] border-cyan-400/50 bg-cyan-500/15 text-cyan-300"
                title={
                  isPersonal
                    ? 'Performance promedio personal en las partidas visibles'
                    : 'Performance promedio del grupo en las partidas visibles'
                }
              >
                Prom {avgPerfInView}
              </Badge>
            )}
            {latestWr !== null && showWrLine && (
              <Badge
                variant="outline"
                className="font-mono text-[10px] border-indigo-400/50 bg-indigo-500/15 text-indigo-300"
              >
                <TrendingUp className="w-3 h-3" strokeWidth={1.75} />
                {wrLabel} {latestWr}%
              </Badge>
            )}
            <LolInfoTip
              acronym="Perf"
              title={
                isPersonal
                  ? 'Performance Personal vs Día y Hora'
                  : 'Performance del Grupo vs Día y Hora'
              }
              description={
                isPersonal
                  ? 'Puntos: BG-PERF por partida (sin remakes). Línea cyan escalonada: performance promedio acumulada. Línea índigo escalonada: WR Personal acumulado (%). Rueda: zoom · Arrastrar: desplazar.'
                  : 'Puntos: BG-PERF promedio grupal por partida (≥2). Línea cyan escalonada: performance promedio acumulada del grupo. Línea índigo escalonada: WR Grupo acumulado (%). Rueda: zoom · Arrastrar: desplazar.'
              }
            />
          </CardTitle>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowAvgPerfLine((prev) => !prev)}
              className={cn(
                'px-2 py-0.5 rounded-md border text-[11px] font-medium cursor-pointer transition-colors inline-flex items-center gap-1',
                showAvgPerfLine
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300 font-semibold'
                  : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
              )}
              title={
                isPersonal
                  ? 'Mostrar/ocultar línea de performance promedio personal'
                  : 'Mostrar/ocultar línea de performance promedio del grupo'
              }
            >
              <Activity className="w-3 h-3" strokeWidth={1.75} />
              <span>{avgPerfLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowWrLine((prev) => !prev)}
              className={cn(
                'px-2 py-0.5 rounded-md border text-[11px] font-medium cursor-pointer transition-colors inline-flex items-center gap-1',
                showWrLine
                  ? 'bg-indigo-500/20 border-indigo-400/60 text-indigo-300 font-semibold'
                  : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
              )}
              title={
                isPersonal
                  ? 'Mostrar/ocultar línea de Winrate personal'
                  : 'Mostrar/ocultar línea de Winrate del grupo'
              }
            >
              <TrendingUp className="w-3 h-3" strokeWidth={1.75} />
              <span>{wrLabel}</span>
            </button>

            {!isPersonal && personalInGroupSeries.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPersonalInGroupLine((prev) => !prev)}
                className={cn(
                  'px-2 py-0.5 rounded-md border text-[11px] font-medium cursor-pointer transition-colors inline-flex items-center gap-1',
                  showPersonalInGroupLine
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 font-semibold'
                    : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                )}
                title="Mostrar/ocultar mi performance personal promedio en partidas del grupo"
              >
                <User className="w-3 h-3" strokeWidth={1.75} />
                <span>Mi Perf</span>
              </button>
            )}

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
                title="Ajustar a todas las partidas"
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
              {showAvgPerfLine && (
                <span className="inline-flex items-center gap-1 text-cyan-300">
                  <span className="w-3.5 h-0.5 bg-cyan-400 inline-block rounded-full" />
                  {avgPerfLabel} (Prom)
                </span>
              )}
              {showWrLine && (
                <span className="inline-flex items-center gap-1 text-indigo-300">
                  <span className="w-3.5 h-0.5 bg-indigo-400 inline-block rounded-full" />
                  {wrLabel} (%)
                </span>
              )}
              {!isPersonal && showPersonalInGroupLine && personalInGroupSeries.length > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <span className="w-3.5 h-0.5 bg-amber-400 inline-block rounded-full" />
                  Mi Perf (Grupo)
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
            onPointerCancel={handlePointerCancel}
            onPointerLeave={() => {
              if (!dragStateRef.current.dragging) {
                setCrosshair(null);
                setHoveredState(null);
              }
            }}
            className="relative w-full select-none touch-none cursor-crosshair"
          >
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full h-auto block overflow-visible cursor-crosshair"
              role="img"
              aria-label={
                isPersonal
                  ? 'Performance personal por partida vs día y hora'
                  : 'Performance promedio del grupo por partida vs día y hora'
              }
            >
              <defs>
                <clipPath id="lol-timeline-plot-clip">
                  <rect x={PAD_L} y={PAD_T - 6} width={PLOT_W} height={PLOT_H + 12} />
                </clipPath>
                <clipPath id="lol-timeline-dots-clip">
                  <rect x={PAD_L - 8} y={PAD_T - 8} width={PLOT_W + 16} height={PLOT_H + 16} />
                </clipPath>
                <linearGradient id="lol-wr-area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818CF8" stopOpacity="0.11" />
                  <stop offset="100%" stopColor="#818CF8" stopOpacity="0.005" />
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
                    {showWrLine && (
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
              {showWrLine && (
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

                {/* Cumulative Stepped Winrate area + line */}
                {showWrLine && wrStepPath && (
                  <>
                    <path d={wrStepAreaPath} fill="url(#lol-wr-area-grad)" />
                    <path
                      d={wrStepPath}
                      fill="none"
                      stroke="#818CF8"
                      strokeOpacity={0.78}
                      strokeWidth={1.15}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </>
                )}

                {/* Cumulative Stepped Average Performance line */}
                {showAvgPerfLine && avgPerfStepPath && (
                  <path
                    d={avgPerfStepPath}
                    fill="none"
                    stroke="#22D3EE"
                    strokeOpacity={0.85}
                    strokeWidth={1.2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}

                {/* Optional Cumulative Stepped Personal Performance in Group Matches line */}
                {!isPersonal && showPersonalInGroupLine && personalInGroupStepPath && (
                  <path
                    d={personalInGroupStepPath}
                    fill="none"
                    stroke="#F59E0B"
                    strokeOpacity={0.85}
                    strokeWidth={1.2}
                    strokeDasharray="4 2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}

                {/* Hover crosshair vertical line */}
                {crosshairX !== null && !isDragging && (
                  <g pointerEvents="none">
                    <line
                      x1={crosshairX}
                      y1={PAD_T}
                      x2={crosshairX}
                      y2={PAD_T + PLOT_H}
                      stroke="rgba(242, 243, 245, 0.55)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  </g>
                )}
              </g>

              {/* Game dots: Y = personal or group performance (unclipped at exact start/end edges) */}
              <g clipPath="url(#lol-timeline-dots-clip)">
                {visiblePoints.map((pt) => {
                  const cx = toX(pt.eventMs);
                  if (cx < PAD_L - 1 || cx > SVG_W - PAD_R + 1) return null;
                  const cy = Math.min(
                    PAD_T + PLOT_H - 4,
                    Math.max(PAD_T + 4, toY(pt.perf))
                  );
                  const outcome = pt.outcome;
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
                      : outcome === 'win' && pt.enemySurrendered
                        ? '#F59E0B'
                        : '#0B0D10';

                  return (
                    <g
                      key={pt.match.matchId}
                      className="transition-opacity pointer-events-none"
                    >
                      {isHovered && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={7}
                          fill="none"
                          stroke="rgba(242, 243, 245, 0.75)"
                          strokeWidth={1.1}
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 4.4 : outcome === 'ff' ? 3.1 : 2.6}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={
                          isHovered
                            ? 1.4
                            : outcome === 'ff' ||
                                (outcome === 'win' && pt.enemySurrendered)
                              ? 1.1
                              : 0.75
                        }
                      />
                    </g>
                  );
                })}
              </g>

              {/* Hover Readouts: Prominent WR + Avg Perf HUD ABOVE plot & Exact Date/Time Pill BELOW plot */}
              {crosshair && crosshairX !== null && !isDragging && (
                <g pointerEvents="none">
                  {seriesAtCrosshair && (
                    <g>
                      <line
                        x1={crosshairX}
                        y1={40}
                        x2={crosshairX}
                        y2={PAD_T}
                        stroke="rgba(242, 243, 245, 0.55)"
                        strokeWidth={1}
                      />
                      <rect
                        x={hudLeft}
                        y={2}
                        width={topHudW}
                        height={38}
                        rx={6}
                        fill="#11141A"
                        stroke="rgba(255,255,255,0.22)"
                        strokeWidth={1}
                      />
                      {/* Left Block: Winrate at selected moment */}
                      <circle
                        cx={hudLeft + 13}
                        cy={13}
                        r={2.8}
                        fill="#818CF8"
                      />
                      <text
                        x={hudLeft + 21}
                        y={15.5}
                        fill="#A5B4FC"
                        fontSize="8.5"
                        fontWeight={700}
                        letterSpacing="0.06em"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {wrLabel.toUpperCase()}
                      </text>
                      <text
                        x={hudLeft + 11}
                        y={33}
                        fill="#E0E7FF"
                        fontSize="13.5"
                        fontWeight={800}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {seriesAtCrosshair.winRate.toFixed(1)}%
                        <tspan fill="#949BA4" fontSize="9.5" fontWeight={500}>
                          {` (${seriesAtCrosshair.winsSoFar}V-${seriesAtCrosshair.lossesSoFar}D)`}
                        </tspan>
                      </text>

                      {/* Divider 1 */}
                      <line
                        x1={hudLeft + 146}
                        y1={8}
                        x2={hudLeft + 146}
                        y2={34}
                        stroke="rgba(255,255,255,0.14)"
                        strokeWidth={1}
                      />

                      {/* Middle / Right Block: Average Performance at selected moment */}
                      <circle
                        cx={hudLeft + 159}
                        cy={13}
                        r={2.8}
                        fill="#22D3EE"
                      />
                      <text
                        x={hudLeft + 167}
                        y={15.5}
                        fill="#67E8F9"
                        fontSize="8.5"
                        fontWeight={700}
                        letterSpacing="0.06em"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        PERF PROMEDIO
                      </text>
                      <text
                        x={hudLeft + 157}
                        y={33}
                        fill="#CFFAFE"
                        fontSize="13.5"
                        fontWeight={800}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {seriesAtCrosshair.avgPerf.toFixed(1)}
                        <tspan fill="#22D3EE" fontSize="10.5" fontWeight={700}>
                          {` ${getGradeFromScore(seriesAtCrosshair.avgPerf)}`}
                        </tspan>
                        <tspan fill="#949BA4" fontSize="9.5" fontWeight={500}>
                          {` · ${seriesAtCrosshair.totalSoFar}G`}
                        </tspan>
                      </text>

                      {/* Optional 3rd Block: Personal Performance in Group Matches */}
                      {showPersonalHud && personalPerfAtCrosshair && (
                        <>
                          <line
                            x1={hudLeft + 294}
                            y1={8}
                            x2={hudLeft + 294}
                            y2={34}
                            stroke="rgba(255,255,255,0.14)"
                            strokeWidth={1}
                          />
                          <circle
                            cx={hudLeft + 307}
                            cy={13}
                            r={2.8}
                            fill="#F59E0B"
                          />
                          <text
                            x={hudLeft + 315}
                            y={15.5}
                            fill="#FCD34D"
                            fontSize="8.5"
                            fontWeight={700}
                            letterSpacing="0.06em"
                            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                          >
                            MI PERF
                          </text>
                          <text
                            x={hudLeft + 305}
                            y={33}
                            fill="#FEF3C7"
                            fontSize="13.5"
                            fontWeight={800}
                            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                          >
                            {personalPerfAtCrosshair.avgPerf.toFixed(1)}
                            <tspan fill="#F59E0B" fontSize="10.5" fontWeight={700}>
                              {` ${getGradeFromScore(personalPerfAtCrosshair.avgPerf)}`}
                            </tspan>
                            <tspan fill="#949BA4" fontSize="9.5" fontWeight={500}>
                              {` · ${personalPerfAtCrosshair.gamesSoFar}G`}
                            </tspan>
                          </text>
                        </>
                      )}
                    </g>
                  )}

                  {/* Bottom Exact Selected Date & Time Pill */}
                  <line
                    x1={crosshairX}
                    y1={PAD_T + PLOT_H}
                    x2={crosshairX}
                    y2={PAD_T + PLOT_H + 8}
                    stroke="rgba(242, 243, 245, 0.65)"
                    strokeWidth={1}
                  />
                  <rect
                    x={bottomTimeX - BOTTOM_TIME_W / 2}
                    y={PAD_T + PLOT_H + 8}
                    width={BOTTOM_TIME_W}
                    height={23}
                    rx={4}
                    fill="#181C24"
                    stroke="rgba(242, 243, 245, 0.34)"
                    strokeWidth={1}
                  />
                  <text
                    x={bottomTimeX}
                    y={PAD_T + PLOT_H + 23}
                    textAnchor="middle"
                    fill="#F2F3F5"
                    fontSize="10.5"
                    fontWeight={700}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {formatFullDateTime(crosshair.ms)}
                  </text>
                </g>
              )}
            </svg>

            {visiblePoints.length === 0 && timelineSeries.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[11px] font-mono text-muted-foreground bg-background/80 px-2.5 py-1 rounded border border-border">
                  Sin partidas en el filtro actual
                </span>
              </div>
            )}
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
          hideGroupInfo={isPersonal}
        />
      )}
    </Card>
  );
};
