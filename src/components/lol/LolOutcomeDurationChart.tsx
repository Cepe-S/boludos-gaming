import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  LolAccount,
  LolMacroDurationRangeKey,
  LolMacroDurationRangeStats,
  LolMatchParticipantSummary,
  LolMatchSummary,
  LolOutcomeCurveModel,
  LolOutcomeCurveSample,
  LolOutcomeMinuteEstimate,
  LolValidOutcome,
  LolViewMode,
} from '@/types/lol';
import {
  computeMacroDurationRangeStats,
  computeOutcomeChartDomain,
  computeOutcomeMinuteCurve,
  estimateOutcomeAtMinute,
  isGroupMatch,
  resolveGroupMatchOutcome,
  resolveMacroDurationRange,
} from '@/lib/lolPerformanceEngine';
import { DEFAULT_DDRAGON_VERSION, formatDuration } from '@/lib/lolDdragon';
import { LolMatchHoverCard } from './LolMatchHoverCard';
import {
  LOL_FF_CHIP_CLASS,
  LOL_FF_DOT_FILL,
  LOL_FF_DOT_STROKE,
  LOL_LOSS_DOT_FILL,
  LOL_WIN_DOT_FILL,
  LolInfoTip,
} from './LolPrimitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Layers } from 'lucide-react';

export interface LolOutcomeDurationChartProps {
  mode: LolViewMode;
  matches: LolMatchSummary[];
  targetPuuid: string;
  targetPuuids?: ReadonlySet<string>;
  groupPuuids: Set<string>;
  puuidToUserId?: ReadonlyMap<string, string>;
  accountByPuuid: Map<string, LolAccount>;
  ddragonVersion?: string;
  onSelectMatch?: (matchId: string, initialPuuid?: string) => void;
}

type AxisMode = 'minute' | 'timeline';
type ScaleMode = 'count' | 'percent';

interface OutcomeSample {
  id: string;
  match: LolMatchSummary;
  participant: LolMatchParticipantSummary;
  selectPuuid: string;
  enemySurrendered: boolean;
  durationSec: number;
  eventMs: number;
  outcome: LolValidOutcome;
  macroKey: LolMacroDurationRangeKey;
}

interface TimelinePoint {
  key: string;
  label: string;
  fullLabel: string;
  wins: number;
  losses: number;
  ffs: number;
  total: number;
}

interface VisibleMacroRange {
  stats: LolMacroDurationRangeStats;
  visStartSec: number;
  visEndSec: number;
}

interface SvgCoord {
  x: number;
  y: number;
}

interface GameDot {
  id: string;
  x: number;
  y: number;
  outcome: LolValidOutcome;
  macroKey: LolMacroDurationRangeKey;
  timelineIdx: number;
  sample: OutcomeSample;
}

interface XTick {
  key: string;
  x: number;
  label: string;
  isThreshold?: boolean;
}

interface HoverDisplay {
  xStart: number;
  xEnd: number;
  centerX: number;
  crosshairX: number;
  wins: number;
  losses: number;
  ffs: number;
  total: number;
  winPct: number;
  lossPct: number;
  ffPct: number;
  curveWinRate: number | null;
  curveLossRate: number | null;
  curveFfRate: number | null;
  curveEffectiveGames: number | null;
  rangeLabel: string;
  bottomLabel: string;
}

const MACRO_THRESHOLD_MINUTES = [10, 20, 30, 40] as const;
const WEEKDAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');

function formatShortDate(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

function formatFullDateTime(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAYS_ES[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}hs`;
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

/**
 * Computes Fritsch-Carlson monotone cubic spline tangent slopes.
 * Symmetric under reversal, so adjacent stacked bands share exact boundaries with zero gap or crossover.
 */
function computeMonotoneSlopes(pts: SvgCoord[]): number[] {
  const n = pts.length;
  if (n < 2) return new Array<number>(n).fill(0);

  const dx: number[] = new Array<number>(n - 1);
  const dy: number[] = new Array<number>(n - 1);
  const secant: number[] = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    dy[i] = pts[i + 1].y - pts[i].y;
    secant[i] = Math.abs(dx[i]) > 1e-6 ? dy[i] / dx[i] : 0;
  }

  const m: number[] = new Array<number>(n);
  m[0] = secant[0];
  m[n - 1] = secant[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (secant[i - 1] * secant[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (secant[i - 1] + secant[i]) / 2;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(secant[i]) < 1e-6) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i] / secant[i];
      const b = m[i + 1] / secant[i];
      const h = Math.hypot(a, b);
      if (h > 3) {
        const t = 3 / h;
        m[i] = t * a * secant[i];
        m[i + 1] = t * b * secant[i];
      }
    }
  }

  return m;
}

function buildMonotoneCurveSegments(pts: SvgCoord[], precomputedSlopes?: number[]): string {
  const n = pts.length;
  if (n < 2) return '';
  if (n === 2) {
    return `L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  }

  const m = precomputedSlopes ?? computeMonotoneSlopes(pts);
  const segs: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const step = dx / 3;
    const c1x = pts[i].x + step;
    const c1y = pts[i].y + m[i] * step;
    const c2x = pts[i + 1].x - step;
    const c2y = pts[i + 1].y - m[i + 1] * step;
    segs.push(
      `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`
    );
  }
  return segs.join(' ');
}

/**
 * Evaluates the exact Y pixel of a Fritsch-Carlson cubic Bézier spline at X.
 * Because control X coordinates are trisected (x0 + dx/3, x1 - dx/3), X(t) is strictly linear in t.
 */
function evaluateMonotoneY(pts: SvgCoord[], slopes: number[], x: number): number {
  const n = pts.length;
  if (n === 0) return PAD_T + PLOT_H;
  if (n === 1 || x <= pts[0].x) return pts[0].y;
  if (x >= pts[n - 1].x) return pts[n - 1].y;

  let lo = 0;
  let hi = n - 2;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (x < pts[mid].x) hi = mid - 1;
    else if (x > pts[mid + 1].x) lo = mid + 1;
    else {
      lo = mid;
      break;
    }
  }
  const i = Math.min(n - 2, Math.max(0, lo));
  const x0 = pts[i].x;
  const x1 = pts[i + 1].x;
  const dx = x1 - x0;
  if (dx <= 1e-6) return pts[i].y;

  const t = Math.min(1, Math.max(0, (x - x0) / dx));
  const y0 = pts[i].y;
  const y1 = pts[i + 1].y;
  if (n === 2) {
    return y0 + t * (y1 - y0);
  }
  const step = dx / 3;
  const c1y = y0 + slopes[i] * step;
  const c2y = y1 - slopes[i + 1] * step;
  const u = 1 - t;
  return (
    u * u * u * y0 +
    3 * u * u * t * c1y +
    3 * u * t * t * c2y +
    t * t * t * y1
  );
}

function buildLinePath(pts: SvgCoord[], slopes?: number[]): string {
  if (pts.length < 2) return '';
  return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} ${buildMonotoneCurveSegments(pts, slopes)}`;
}

function buildStackedBandPath(
  lower: SvgCoord[],
  upper: SvgCoord[],
  upperSlopes?: number[]
): string {
  if (upper.length < 2 || lower.length !== upper.length) return '';
  const reversedLower = [...lower].reverse();
  const topSegs = buildMonotoneCurveSegments(upper, upperSlopes);
  const botSegs = buildMonotoneCurveSegments(reversedLower);
  return [
    `M ${upper[0].x.toFixed(1)} ${upper[0].y.toFixed(1)}`,
    topSegs,
    `L ${reversedLower[0].x.toFixed(1)} ${reversedLower[0].y.toFixed(1)}`,
    botSegs,
    'Z',
  ].join(' ');
}

/**
 * Maps a rank [0..count-1] to a well-spread vertical fraction in (0, 1) using an alternating
 * bijection so neighboring dots along X separate cleanly across the band height.
 */
function spreadVerticalFraction(rank: number, count: number): number {
  if (count <= 1) return 0.5;
  const slotIdx =
    rank % 2 === 0
      ? rank / 2
      : Math.ceil(count / 2) + Math.floor(rank / 2);
  return (slotIdx + 0.5) / count;
}

const SVG_W = 1120;
const SVG_H = 264;
const PAD_L = 44;
const PAD_R = 24;
const PAD_T = 48;
const PAD_B = 40;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;
const TOP_HUD_W = 398;
const EMPTY_HUD_W = 188;
const BOTTOM_LABEL_W = 166;
const BOTTOM_TIMELINE_LABEL_W = 176;
const DOT_BAND_PAD = 4;
const DOT_SNAP_RADIUS = 13;

export const LolOutcomeDurationChart: React.FC<LolOutcomeDurationChartProps> = ({
  mode,
  matches,
  targetPuuid,
  targetPuuids,
  groupPuuids,
  puuidToUserId,
  accountByPuuid,
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
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const isPersonal = mode === 'personal';
  const [axisMode, setAxisMode] = useState<AxisMode>('minute');
  const [scaleMode, setScaleMode] = useState<ScaleMode>('percent');
  const [hoveredMacroKey, setHoveredMacroKey] = useState<LolMacroDurationRangeKey | null>(null);
  const [hoveredTimelineIdx, setHoveredTimelineIdx] = useState<number | null>(null);
  const [crosshairSvgX, setCrosshairSvgX] = useState<number | null>(null);
  const [hoveredSec, setHoveredSec] = useState<number | null>(null);
  const [hoveredDotState, setHoveredDotState] = useState<{
    dot: GameDot;
    rect: { left: number; top: number; right: number; bottom: number };
  } | null>(null);

  useEffect(() => {
    setHoveredMacroKey(null);
    setHoveredTimelineIdx(null);
    setCrosshairSvgX(null);
    setHoveredSec(null);
    setHoveredDotState(null);
  }, [mode, targetPuuid]);

  const { samples, totals, remakes } = useMemo(() => {
    const out: OutcomeSample[] = [];
    let winCount = 0;
    let lossCount = 0;
    let ffCount = 0;
    let remakeCount = 0;

    if (mode === 'personal') {
      for (const match of matches) {
        const p = match.participants.find((part) => effectiveTargetPuuids.has(part.puuid));
        if (!p) continue;
        if (p.outcome === 'remake') {
          remakeCount += 1;
          continue;
        }
        if (p.outcome === 'win') winCount += 1;
        else if (p.outcome === 'ff') ffCount += 1;
        else lossCount += 1;
        out.push({
          id: `${match.matchId}-p`,
          match,
          participant: p,
          selectPuuid: p.puuid,
          enemySurrendered: p.enemySurrendered,
          durationSec: match.gameDuration,
          eventMs: resolveEventTimestampMs(match),
          outcome: p.outcome,
          macroKey: resolveMacroDurationRange(match.gameDuration),
        });
      }
    } else {
      for (const match of matches) {
        if (!isGroupMatch(match, groupPuuids, puuidToUserId)) continue;
        const resolved = resolveGroupMatchOutcome(match, groupPuuids);
        if (resolved.outcome === 'remake' || !resolved.representative) {
          remakeCount += 1;
          continue;
        }
        if (resolved.outcome === 'win') winCount += 1;
        else if (resolved.outcome === 'ff') ffCount += 1;
        else lossCount += 1;
        const myPart =
          effectiveTargetPuuids.size > 0
            ? match.participants.find((part) => effectiveTargetPuuids.has(part.puuid))
            : undefined;
        const hoverParticipant = myPart ?? resolved.representative;
        out.push({
          id: `${match.matchId}-g`,
          match,
          participant: hoverParticipant,
          selectPuuid: hoverParticipant.puuid,
          enemySurrendered: resolved.enemySurrendered,
          durationSec: match.gameDuration,
          eventMs: resolveEventTimestampMs(match),
          outcome: resolved.outcome,
          macroKey: resolveMacroDurationRange(match.gameDuration),
        });
      }
    }

    out.sort((a, b) => a.eventMs - b.eventMs);

    return {
      samples: out,
      totals: {
        wins: winCount,
        losses: lossCount,
        ffs: ffCount,
        total: winCount + lossCount + ffCount,
      },
      remakes: remakeCount,
    };
  }, [mode, matches, effectiveTargetPuuids, groupPuuids, puuidToUserId]);

  const {
    minuteDomain,
    minuteModel,
    minutePoints,
    visibleMacroRanges,
    timelineSeries,
  } = useMemo<{
    minuteDomain: { startMin: number; endMin: number; axisMinSec: number; axisMaxSec: number } | null;
    minuteModel: LolOutcomeCurveModel | null;
    minutePoints: LolOutcomeMinuteEstimate[];
    visibleMacroRanges: VisibleMacroRange[];
    timelineSeries: TimelinePoint[];
  }>(() => {
    if (samples.length === 0) {
      return {
        minuteDomain: null,
        minuteModel: null,
        minutePoints: [],
        visibleMacroRanges: [],
        timelineSeries: [],
      };
    }

    const curveSamples: LolOutcomeCurveSample[] = samples.map((s) => ({
      durationSeconds: s.durationSec,
      outcome: s.outcome,
    }));

    const domain = computeOutcomeChartDomain(samples.map((s) => s.durationSec));
    const axisMinSec = domain.startMin * 60;
    const axisMaxSec = domain.endMin * 60;
    const { model, points } = computeOutcomeMinuteCurve(curveSamples, {
      startMin: domain.startMin,
      endMin: domain.endMin,
      stepMin: 1,
    });

    const macroStats = computeMacroDurationRangeStats(curveSamples);
    const visRanges: VisibleMacroRange[] = [];
    for (const st of macroStats) {
      const visStartSec = Math.max(axisMinSec, st.startSec);
      const visEndSec = Math.min(axisMaxSec, st.endSec ?? axisMaxSec);
      if (visEndSec > visStartSec) {
        visRanges.push({ stats: st, visStartSec, visEndSec });
      }
    }

    // Cumulative timeline series
    let wins = 0;
    let losses = 0;
    let ffs = 0;
    const tl: TimelinePoint[] = samples.map((s, idx) => {
      if (s.outcome === 'win') wins += 1;
      else if (s.outcome === 'ff') ffs += 1;
      else losses += 1;
      return {
        key: `t-${idx}-${s.eventMs}`,
        label: formatShortDate(s.eventMs),
        fullLabel: formatFullDateTime(s.eventMs),
        wins,
        losses,
        ffs,
        total: wins + losses + ffs,
      };
    });

    return {
      minuteDomain: {
        startMin: domain.startMin,
        endMin: domain.endMin,
        axisMinSec,
        axisMaxSec,
      },
      minuteModel: model,
      minutePoints: points,
      visibleMacroRanges: visRanges,
      timelineSeries: tl,
    };
  }, [samples]);

  const maxY = useMemo(() => {
    if (scaleMode === 'percent') return 100;
    if (axisMode === 'minute') {
      const rawMax = minutePoints.reduce((m, pt) => Math.max(m, pt.effectiveGames), 0);
      if (rawMax <= 2) return 2;
      if (rawMax <= 4) return 4;
      if (rawMax <= 10) return Math.ceil(rawMax / 2) * 2;
      return Math.ceil(rawMax / 5) * 5;
    }
    const rawMax = timelineSeries.reduce((m, pt) => Math.max(m, pt.total), 0);
    if (rawMax <= 4) return Math.max(4, rawMax);
    if (rawMax <= 10) return Math.ceil(rawMax / 2) * 2;
    return Math.ceil(rawMax / 5) * 5;
  }, [axisMode, scaleMode, minutePoints, timelineSeries]);

  const yTicks = useMemo(() => {
    if (scaleMode === 'percent') return [0, 25, 50, 75, 100];
    const step = maxY / 4;
    const raw = [0, step, step * 2, step * 3, maxY].map((v) =>
      maxY <= 4 ? Math.round(v * 2) / 2 : Math.round(v)
    );
    return Array.from(new Set(raw));
  }, [maxY, scaleMode]);

  const toMinuteX = (sec: number): number => {
    if (!minuteDomain) return PAD_L + PLOT_W / 2;
    const span = Math.max(1, minuteDomain.axisMaxSec - minuteDomain.axisMinSec);
    const ratio = Math.min(1, Math.max(0, (sec - minuteDomain.axisMinSec) / span));
    return PAD_L + ratio * PLOT_W;
  };

  const getTimelineX = (idx: number): number => {
    if (timelineSeries.length <= 1) return PAD_L + PLOT_W / 2;
    return PAD_L + (idx / (timelineSeries.length - 1)) * PLOT_W;
  };

  const getY = (val: number): number =>
    PAD_T + PLOT_H - Math.min(1, Math.max(0, val / Math.max(1e-6, maxY))) * PLOT_H;

  const {
    baseCoords,
    winCoords,
    lossCoords,
    ffCoords,
    winAreaPath,
    lossAreaPath,
    ffAreaPath,
    winLinePath,
    lossLinePath,
    ffLinePath,
    gameDots,
  } = useMemo(() => {
    const base: SvgCoord[] = [];
    const winC: SvgCoord[] = [];
    const lossC: SvgCoord[] = [];
    const ffC: SvgCoord[] = [];

    if (samples.length === 0) {
      return {
        baseCoords: base,
        winCoords: winC,
        lossCoords: lossC,
        ffCoords: ffC,
        winAreaPath: '',
        lossAreaPath: '',
        ffAreaPath: '',
        winLinePath: '',
        lossLinePath: '',
        ffLinePath: '',
        gameDots: [] as GameDot[],
      };
    }

    const pushCoord = (x: number, w: number, l: number, f: number) => {
      base.push({ x, y: getY(0) });
      winC.push({ x, y: getY(w) });
      lossC.push({ x, y: getY(w + l) });
      ffC.push({ x, y: getY(w + l + f) });
    };

    if (axisMode === 'minute' && minuteDomain && minutePoints.length >= 2) {
      for (const pt of minutePoints) {
        const x = toMinuteX(pt.minute * 60);
        if (scaleMode === 'percent') {
          pushCoord(x, pt.winRate, pt.lossRate, pt.ffRate);
        } else {
          const eff = pt.effectiveGames;
          pushCoord(
            x,
            (eff * pt.winRate) / 100,
            (eff * pt.lossRate) / 100,
            (eff * pt.ffRate) / 100
          );
        }
      }
    } else {
      timelineSeries.forEach((pt, idx) => {
        const x = getTimelineX(idx);
        if (scaleMode === 'count') {
          pushCoord(x, pt.wins, pt.losses, pt.ffs);
        } else {
          const denom = Math.max(1, pt.total);
          const w = (pt.wins / denom) * 100;
          const l = (pt.losses / denom) * 100;
          const f = Math.max(0, 100 - w - l);
          pushCoord(x, w, l, f);
        }
      });
    }

    const winSlopes = computeMonotoneSlopes(winC);
    const lossSlopes = computeMonotoneSlopes(lossC);
    const ffSlopes = computeMonotoneSlopes(ffC);

    const dots: GameDot[] = [];

    if (axisMode === 'minute' && minuteDomain && winC.length >= 2) {
      // Group nearby games (2-minute buckets per outcome) to spread Y cleanly without overlap
      const grouped = new Map<
        string,
        Array<{ sample: OutcomeSample; timelineIdx: number; x: number }>
      >();

      samples.forEach((sample, timelineIdx) => {
        const rawX = toMinuteX(sample.durationSec);
        const x = Math.min(PAD_L + PLOT_W - 3, Math.max(PAD_L + 3, rawX));
        const clusterSlot = Math.floor(sample.durationSec / 120);
        const gKey = `${clusterSlot}:${sample.outcome}`;
        const bucket = grouped.get(gKey);
        if (bucket) bucket.push({ sample, timelineIdx, x });
        else grouped.set(gKey, [{ sample, timelineIdx, x }]);
      });

      const yBaseVal = getY(0);

      for (const entries of grouped.values()) {
        entries.sort((a, b) => a.sample.durationSec - b.sample.durationSec);
        const count = entries.length;
        entries.forEach((entry, rank) => {
          const x = entry.x;
          const yWin = evaluateMonotoneY(winC, winSlopes, x);
          const yLoss = evaluateMonotoneY(lossC, lossSlopes, x);
          const yFf = evaluateMonotoneY(ffC, ffSlopes, x);

          let bandTopY: number;
          let bandBottomY: number;
          if (entry.sample.outcome === 'win') {
            bandTopY = yWin;
            bandBottomY = yBaseVal;
          } else if (entry.sample.outcome === 'loss') {
            bandTopY = yLoss;
            bandBottomY = yWin;
          } else {
            bandTopY = yFf;
            bandBottomY = yLoss;
          }

          const bandHeight = bandBottomY - bandTopY;
          let y: number;
          if (bandHeight <= DOT_BAND_PAD * 2) {
            y = (bandTopY + bandBottomY) / 2;
          } else {
            const frac = spreadVerticalFraction(rank, count);
            y = bandTopY + DOT_BAND_PAD + frac * (bandHeight - DOT_BAND_PAD * 2);
          }

          dots.push({
            id: entry.sample.id,
            x,
            y,
            outcome: entry.sample.outcome,
            macroKey: entry.sample.macroKey,
            timelineIdx: entry.timelineIdx,
            sample: entry.sample,
          });
        });
      }
    } else {
      samples.forEach((sample, idx) => {
        const coord =
          sample.outcome === 'win'
            ? winC[idx]
            : sample.outcome === 'ff'
              ? ffC[idx]
              : lossC[idx];
        if (!coord) return;
        dots.push({
          id: sample.id,
          x: coord.x,
          y: coord.y,
          outcome: sample.outcome,
          macroKey: sample.macroKey,
          timelineIdx: idx,
          sample,
        });
      });
    }

    return {
      baseCoords: base,
      winCoords: winC,
      lossCoords: lossC,
      ffCoords: ffC,
      winAreaPath: buildStackedBandPath(base, winC, winSlopes),
      lossAreaPath: buildStackedBandPath(winC, lossC, lossSlopes),
      ffAreaPath: buildStackedBandPath(lossC, ffC, ffSlopes),
      winLinePath: buildLinePath(winC, winSlopes),
      lossLinePath: buildLinePath(lossC, lossSlopes),
      ffLinePath: buildLinePath(ffC, ffSlopes),
      gameDots: dots,
    };
  }, [samples, axisMode, minuteDomain, minutePoints, timelineSeries, scaleMode, maxY]);

  const xTicks = useMemo<XTick[]>(() => {
    if (samples.length === 0) return [];

    if (axisMode === 'minute' && minuteDomain) {
      const { startMin, endMin } = minuteDomain;
      const span = endMin - startMin;
      const step = span <= 24 ? 2 : 5;
      const minGap = span <= 24 ? 1.2 : 2.5;
      const thresholdSet = new Set<number>(MACRO_THRESHOLD_MINUTES);
      const tickMinutes = new Set<number>();

      const firstAligned = Math.ceil(startMin / step) * step;
      for (let m = firstAligned; m <= endMin; m += step) {
        tickMinutes.add(m);
      }

      // Include start/end edges when they don't crowd the adjacent aligned tick
      const sortedCore = Array.from(tickMinutes).sort((a, b) => a - b);
      if (sortedCore.length === 0 || sortedCore[0] - startMin >= minGap) {
        tickMinutes.add(startMin);
      }
      if (sortedCore.length === 0 || endMin - sortedCore[sortedCore.length - 1] >= minGap) {
        tickMinutes.add(endMin);
      }

      return Array.from(tickMinutes)
        .sort((a, b) => a - b)
        .map((m) => ({
          key: `min-${m}`,
          x: toMinuteX(m * 60),
          label: `${m}m`,
          isThreshold: thresholdSet.has(m),
        }));
    }

    // Timeline mode
    const indices: number[] = [];
    if (timelineSeries.length <= 10) {
      for (let i = 0; i < timelineSeries.length; i++) indices.push(i);
    } else {
      const desired = 7;
      for (let i = 0; i <= desired; i++) {
        indices.push(Math.round((i / desired) * (timelineSeries.length - 1)));
      }
    }
    return Array.from(new Set(indices)).map((idx) => ({
      key: `tx-${timelineSeries[idx].key}`,
      x: getTimelineX(idx),
      label: timelineSeries[idx].label,
    }));
  }, [samples.length, axisMode, minuteDomain, timelineSeries]);

  const visibleThresholdLines = useMemo(() => {
    if (axisMode !== 'minute' || !minuteDomain) return [] as Array<{ min: number; x: number }>;
    return MACRO_THRESHOLD_MINUTES.filter(
      (m) => m > minuteDomain.startMin && m < minuteDomain.endMin
    ).map((m) => ({
      min: m,
      x: toMinuteX(m * 60),
    }));
  }, [axisMode, minuteDomain]);

  const findNearestDot = (svgX: number, svgY: number): GameDot | null => {
    let best: GameDot | null = null;
    let bestDist = DOT_SNAP_RADIUS;
    for (const dot of gameDots) {
      const dist = Math.hypot(dot.x - svgX, dot.y - svgY);
      if (dist <= bestDist) {
        bestDist = dist;
        best = dot;
      }
    }
    return best;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (samples.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * SVG_W;
    const svgY = ((e.clientY - rect.top) / rect.height) * SVG_H;
    if (svgX < PAD_L - 8 || svgX > SVG_W - PAD_R + 8) {
      clearHover();
      return;
    }

    const snappedDot = findNearestDot(svgX, svgY);

    if (axisMode === 'minute' && minuteDomain && visibleMacroRanges.length > 0) {
      if (snappedDot) {
        const dotScreenX = rect.left + (snappedDot.x / SVG_W) * rect.width;
        const dotScreenY = rect.top + (snappedDot.y / SVG_H) * rect.height;
        setHoveredDotState({
          dot: snappedDot,
          rect: {
            left: dotScreenX - 6,
            right: dotScreenX + 6,
            top: dotScreenY - 6,
            bottom: dotScreenY + 6,
          },
        });
        setCrosshairSvgX(snappedDot.x);
        setHoveredSec(snappedDot.sample.durationSec);
        setHoveredMacroKey(snappedDot.macroKey);
        return;
      }

      setHoveredDotState(null);
      const clampedSvgX = Math.min(SVG_W - PAD_R, Math.max(PAD_L, svgX));
      const ratio = Math.min(1, Math.max(0, (clampedSvgX - PAD_L) / PLOT_W));
      const sec =
        minuteDomain.axisMinSec +
        ratio * (minuteDomain.axisMaxSec - minuteDomain.axisMinSec);
      const matched =
        visibleMacroRanges.find((r, i) =>
          i === 0 ? sec <= r.visEndSec : sec > r.visStartSec && sec <= r.visEndSec
        ) ?? visibleMacroRanges[visibleMacroRanges.length - 1];
      setCrosshairSvgX(clampedSvgX);
      setHoveredSec(sec);
      setHoveredMacroKey(matched.stats.key);
      return;
    }

    // Timeline mode
    if (snappedDot) {
      const dotScreenX = rect.left + (snappedDot.x / SVG_W) * rect.width;
      const dotScreenY = rect.top + (snappedDot.y / SVG_H) * rect.height;
      setHoveredDotState({
        dot: snappedDot,
        rect: {
          left: dotScreenX - 6,
          right: dotScreenX + 6,
          top: dotScreenY - 6,
          bottom: dotScreenY + 6,
        },
      });
      setCrosshairSvgX(snappedDot.x);
      setHoveredTimelineIdx(snappedDot.timelineIdx);
      return;
    }

    setHoveredDotState(null);
    if (timelineSeries.length === 1) {
      setCrosshairSvgX(getTimelineX(0));
      setHoveredTimelineIdx(0);
      return;
    }

    const ratio = Math.min(1, Math.max(0, (svgX - PAD_L) / PLOT_W));
    const idx = Math.min(
      timelineSeries.length - 1,
      Math.max(0, Math.round(ratio * (timelineSeries.length - 1)))
    );
    setCrosshairSvgX(getTimelineX(idx));
    setHoveredTimelineIdx(idx);
  };

  const handlePointerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSelectMatch || samples.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * SVG_W;
    const svgY = ((e.clientY - rect.top) / rect.height) * SVG_H;
    const snapped = findNearestDot(svgX, svgY);
    if (snapped) {
      clearHover();
      onSelectMatch(snapped.sample.match.matchId, snapped.sample.selectPuuid);
    }
  };

  const clearHover = () => {
    setHoveredMacroKey(null);
    setHoveredTimelineIdx(null);
    setCrosshairSvgX(null);
    setHoveredSec(null);
    setHoveredDotState(null);
  };

  const hoverDisplay = useMemo<HoverDisplay | null>(() => {
    if (axisMode === 'minute') {
      if (!hoveredMacroKey || !minuteDomain) return null;
      const found = visibleMacroRanges.find((r) => r.stats.key === hoveredMacroKey);
      if (!found) return null;
      const xStart = toMinuteX(found.visStartSec);
      const xEnd = toMinuteX(found.visEndSec);
      const st = found.stats;
      const cx = crosshairSvgX ?? (xStart + xEnd) / 2;
      const sec =
        hoveredSec ??
        minuteDomain.axisMinSec +
          ((cx - PAD_L) / PLOT_W) * (minuteDomain.axisMaxSec - minuteDomain.axisMinSec);
      const est =
        minuteModel !== null ? estimateOutcomeAtMinute(minuteModel, sec / 60) : null;

      return {
        xStart,
        xEnd,
        centerX: (xStart + xEnd) / 2,
        crosshairX: cx,
        wins: st.wins,
        losses: st.losses,
        ffs: st.ffs,
        total: st.total,
        winPct: st.winPct,
        lossPct: st.lossPct,
        ffPct: st.ffPct,
        curveWinRate: est ? est.winRate : null,
        curveLossRate: est ? est.lossRate : null,
        curveFfRate: est ? est.ffRate : null,
        curveEffectiveGames: est ? est.effectiveGames : null,
        rangeLabel: st.label,
        bottomLabel: `${formatDuration(Math.round(sec))} · ${st.label}`,
      };
    }

    if (hoveredTimelineIdx === null) return null;
    const pt = timelineSeries[hoveredTimelineIdx];
    if (!pt) return null;
    const centerX = getTimelineX(hoveredTimelineIdx);
    const halfStep =
      timelineSeries.length <= 1 ? PLOT_W / 2 : PLOT_W / (2 * (timelineSeries.length - 1));
    const xStart = Math.max(PAD_L, centerX - halfStep);
    const xEnd = Math.min(PAD_L + PLOT_W, centerX + halfStep);
    const denom = Math.max(1, pt.total);
    return {
      xStart,
      xEnd,
      centerX,
      crosshairX: crosshairSvgX ?? centerX,
      wins: pt.wins,
      losses: pt.losses,
      ffs: pt.ffs,
      total: pt.total,
      winPct: Math.round((pt.wins / denom) * 100),
      lossPct: Math.round((pt.losses / denom) * 100),
      ffPct: Math.round((pt.ffs / denom) * 100),
      curveWinRate: null,
      curveLossRate: null,
      curveFfRate: null,
      curveEffectiveGames: null,
      rangeLabel: `#${hoveredTimelineIdx + 1}`,
      bottomLabel: pt.fullLabel,
    };
  }, [
    axisMode,
    hoveredMacroKey,
    hoveredTimelineIdx,
    crosshairSvgX,
    hoveredSec,
    minuteDomain,
    minuteModel,
    visibleMacroRanges,
    timelineSeries,
  ]);

  const hasActiveHover =
    axisMode === 'minute' ? hoveredMacroKey !== null : hoveredTimelineIdx !== null;

  const isDotHighlighted = (dot: GameDot): boolean => {
    if (hoveredDotState?.dot.id === dot.id) return true;
    if (axisMode === 'minute') {
      return hoveredMacroKey !== null && dot.macroKey === hoveredMacroKey;
    }
    return hoveredTimelineIdx !== null && dot.timelineIdx === hoveredTimelineIdx;
  };

  const activeHudW =
    hoverDisplay && hoverDisplay.total === 0 && hoverDisplay.curveWinRate === null
      ? EMPTY_HUD_W
      : TOP_HUD_W;
  const activeBottomLabelW =
    axisMode === 'minute' ? BOTTOM_LABEL_W : BOTTOM_TIMELINE_LABEL_W;

  const topHudX =
    hoverDisplay !== null
      ? Math.min(
          SVG_W - PAD_R - activeHudW / 2,
          Math.max(PAD_L + activeHudW / 2, hoverDisplay.crosshairX)
        )
      : 0;
  const bottomLabelX =
    hoverDisplay !== null
      ? Math.min(
          SVG_W - PAD_R - activeBottomLabelW / 2,
          Math.max(PAD_L + activeBottomLabelW / 2, hoverDisplay.crosshairX)
        )
      : 0;

  const totalDenom = Math.max(1, totals.total);
  const totalWinPct = Math.round((totals.wins / totalDenom) * 100);
  const totalLossPct = Math.round((totals.losses / totalDenom) * 100);
  const totalFfPct = Math.round((totals.ffs / totalDenom) * 100);

  const winGradId = `lol-stack-win-grad-${uid}`;
  const lossGradId = `lol-stack-loss-grad-${uid}`;
  const ffGradId = `lol-stack-ff-grad-${uid}`;
  const areaClipId = `lol-stack-area-clip-${uid}`;
  const dotsClipId = `lol-stack-dots-clip-${uid}`;

  const renderDot = (dot: GameDot, highlighted: boolean) => {
    const isSnappedDot = hoveredDotState?.dot.id === dot.id;
    const isDimmed = hasActiveHover && !highlighted;
    const fill =
      dot.outcome === 'win'
        ? LOL_WIN_DOT_FILL
        : dot.outcome === 'ff'
          ? LOL_FF_DOT_FILL
          : LOL_LOSS_DOT_FILL;
    const stroke =
      dot.outcome === 'ff'
        ? isSnappedDot || highlighted
          ? '#FFE4E6'
          : LOL_FF_DOT_STROKE
        : dot.outcome === 'win' && dot.sample.enemySurrendered
          ? '#F59E0B'
          : isSnappedDot || highlighted
            ? '#F2F3F5'
            : 'rgba(17, 20, 26, 0.85)';
    const strokeWidth = isSnappedDot
      ? 1.5
      : dot.outcome === 'ff'
        ? highlighted
          ? 1.35
          : 1.1
        : highlighted
          ? 1.2
          : 0.9;

    return (
      <g key={dot.id}>
        {isSnappedDot && (
          <circle
            cx={dot.x}
            cy={dot.y}
            r={7}
            fill="none"
            stroke="rgba(242, 243, 245, 0.8)"
            strokeWidth={1.15}
          />
        )}
        <circle
          cx={dot.x}
          cy={dot.y}
          r={isSnappedDot ? 4.4 : highlighted ? 3.2 : 2.5}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          opacity={isDimmed ? 0.35 : 0.96}
        />
      </g>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 pt-3 px-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Layers className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Victorias, Derrotas y FF</span>
            </CardTitle>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {totals.total}G
            </Badge>
            {totals.total > 0 && (
              <div className="inline-flex items-center gap-1.5 text-[10.5px] font-mono pl-1">
                <span className="text-success font-bold">
                  {totals.wins}V ({totalWinPct}%)
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-destructive font-bold">
                  {totals.losses}D ({totalLossPct}%)
                </span>
                <span className="text-muted-foreground">·</span>
                <span className={cn('text-[10px] font-bold', LOL_FF_CHIP_CLASS)}>
                  {totals.ffs}FF ({totalFfPct}%)
                </span>
                {remakes > 0 && (
                  <span className="text-muted-foreground text-[10px]">
                    ({remakes}R)
                  </span>
                )}
              </div>
            )}
            <LolInfoTip
              acronym="V/D/FF"
              title="Stacked Area — Victorias, Derrotas y FF"
              description={
                isPersonal
                  ? 'Curvas suavizadas minuto a minuto (kernel adaptativo + prior Bayesiano para muestras chicas) de tus victorias, derrotas y FF. Hover agrupa datos reales en 0–10 / 10–20 / 20–30 / 30–40 / 40+.'
                  : 'Curvas suavizadas minuto a minuto (kernel adaptativo + prior Bayesiano para muestras chicas) del grupo (≥2). Hover agrupa datos reales en 0–10 / 10–20 / 20–30 / 30–40 / 40+.'
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Axis Switch: Por Minuto vs Acumulado */}
            <div className="inline-flex items-center rounded-md border border-border bg-background/55 p-0.5 text-[11px] gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setAxisMode('minute');
                  clearHover();
                }}
                className={cn(
                  'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors',
                  axisMode === 'minute'
                    ? 'bg-primary/20 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Por Minuto
              </button>
              <button
                type="button"
                onClick={() => {
                  setAxisMode('timeline');
                  clearHover();
                }}
                className={cn(
                  'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors',
                  axisMode === 'timeline'
                    ? 'bg-primary/20 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Acumulado
              </button>
            </div>

            {/* Scale Switch: Count vs 100% */}
            <div className="inline-flex items-center rounded-md border border-border bg-background/55 p-0.5 text-[11px] gap-0.5">
              <button
                type="button"
                onClick={() => setScaleMode('count')}
                className={cn(
                  'px-2 py-0.5 rounded-sm font-mono font-medium cursor-pointer transition-colors',
                  scaleMode === 'count'
                    ? 'bg-primary/20 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title={
                  axisMode === 'minute'
                    ? 'Densidad local apilada (partidas efectivas)'
                    : 'Cantidad acumulada de partidas'
                }
              >
                Cant
              </button>
              <button
                type="button"
                onClick={() => setScaleMode('percent')}
                className={cn(
                  'px-2 py-0.5 rounded-sm font-mono font-medium cursor-pointer transition-colors',
                  scaleMode === 'percent'
                    ? 'bg-primary/20 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Proporción 100% apilada"
              >
                %
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3.5 pt-1">
        <div className="rounded-md border border-border bg-background/45 p-2.5 space-y-1.5">
          {/* Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-success/75 border border-success" />
                Victorias
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#EF4444]/70 border border-[#EF4444]" />
                Derrotas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#881337]/90 border border-[#FB7185]" />
                FF (Rendición)
              </span>
            </div>
            <span className="opacity-75">
              {axisMode === 'minute'
                ? 'Minuto a minuto · hover 0–10 / 10–20 / 20–30 / 30–40 / 40+'
                : 'Evolución acumulada en el filtro'}
            </span>
          </div>

          <div
            onPointerMove={handlePointerMove}
            onPointerLeave={clearHover}
            onClick={handlePointerClick}
            className="relative w-full select-none touch-none cursor-crosshair"
          >
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full h-auto block overflow-visible cursor-crosshair"
              role="img"
              aria-label="Stacked Area Chart de Victorias, Derrotas y FF"
            >
              <defs>
                <linearGradient id={winGradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LOL_WIN_DOT_FILL} stopOpacity="0.62" />
                  <stop offset="100%" stopColor={LOL_WIN_DOT_FILL} stopOpacity="0.16" />
                </linearGradient>
                <linearGradient id={lossGradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LOL_LOSS_DOT_FILL} stopOpacity="0.58" />
                  <stop offset="100%" stopColor={LOL_LOSS_DOT_FILL} stopOpacity="0.18" />
                </linearGradient>
                <linearGradient id={ffGradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LOL_FF_DOT_FILL} stopOpacity="0.92" />
                  <stop offset="100%" stopColor="#4C0519" stopOpacity="0.62" />
                </linearGradient>
                <clipPath id={areaClipId}>
                  <rect x={PAD_L} y={PAD_T - 2} width={PLOT_W} height={PLOT_H + 4} />
                </clipPath>
                <clipPath id={dotsClipId}>
                  <rect
                    x={PAD_L - 4}
                    y={PAD_T - 5}
                    width={PLOT_W + 8}
                    height={PLOT_H + 10}
                  />
                </clipPath>
              </defs>

              {/* Horizontal Y grid & labels */}
              {yTicks.map((tick) => {
                const y = getY(tick);
                return (
                  <g key={`sy-${tick}`}>
                    <line
                      x1={PAD_L}
                      y1={y}
                      x2={SVG_W - PAD_R}
                      y2={y}
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD_L - 8}
                      y={y + 3}
                      textAnchor="end"
                      fill="#949BA4"
                      fontSize="9.5"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {scaleMode === 'percent' ? `${tick}%` : tick}
                    </text>
                  </g>
                );
              })}

              {/* Vertical X grid & ticks */}
              {xTicks.map((tick) => (
                <g key={tick.key}>
                  <line
                    x1={tick.x}
                    y1={PAD_T}
                    x2={tick.x}
                    y2={PAD_T + PLOT_H}
                    stroke="rgba(255,255,255,0.045)"
                    strokeWidth={1}
                  />
                  <line
                    x1={tick.x}
                    y1={PAD_T + PLOT_H}
                    x2={tick.x}
                    y2={PAD_T + PLOT_H + (tick.isThreshold ? 5 : 3.5)}
                    stroke={
                      tick.isThreshold
                        ? 'rgba(242,243,245,0.42)'
                        : 'rgba(255,255,255,0.2)'
                    }
                    strokeWidth={1}
                  />
                  <text
                    x={tick.x}
                    y={PAD_T + PLOT_H + 17}
                    textAnchor="middle"
                    fill={tick.isThreshold ? '#E2E8F0' : '#949BA4'}
                    fontSize="9.5"
                    fontWeight={tick.isThreshold ? 700 : 500}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}

              {/* Stacked Areas & Strokes */}
              {winCoords.length >= 2 && (
                <g clipPath={`url(#${areaClipId})`}>
                  {/* Band 1 (bottom): Wins */}
                  <path d={winAreaPath} fill={`url(#${winGradId})`} />
                  {/* Band 2 (middle): Losses */}
                  <path d={lossAreaPath} fill={`url(#${lossGradId})`} />
                  {/* Band 3 (top): FF */}
                  <path d={ffAreaPath} fill={`url(#${ffGradId})`} />

                  {/* Crisp top boundary lines */}
                  <path
                    d={winLinePath}
                    fill="none"
                    stroke={LOL_WIN_DOT_FILL}
                    strokeWidth={1.75}
                    strokeOpacity={0.95}
                  />
                  <path
                    d={lossLinePath}
                    fill="none"
                    stroke={LOL_LOSS_DOT_FILL}
                    strokeWidth={1.6}
                    strokeOpacity={0.9}
                  />
                  <path
                    d={ffLinePath}
                    fill="none"
                    stroke={LOL_FF_DOT_STROKE}
                    strokeWidth={1.8}
                    strokeOpacity={0.95}
                  />
                </g>
              )}

              {/* Subtle macro threshold guide lines at 10m, 20m, 30m */}
              {visibleThresholdLines.length > 0 && (
                <g pointerEvents="none">
                  {visibleThresholdLines.map((t) => (
                    <line
                      key={`macro-bound-${t.min}`}
                      x1={t.x}
                      y1={PAD_T}
                      x2={t.x}
                      y2={PAD_T + PLOT_H}
                      stroke="rgba(242, 243, 245, 0.22)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  ))}
                </g>
              )}

              {/* Single-point fallback bar in timeline mode if only 1 sample exists */}
              {axisMode === 'timeline' && timelineSeries.length === 1 && baseCoords[0] && (
                <g>
                  <rect
                    x={PAD_L + PLOT_W / 2 - 24}
                    y={ffCoords[0].y}
                    width={48}
                    height={Math.max(0, lossCoords[0].y - ffCoords[0].y)}
                    fill={LOL_FF_DOT_FILL}
                    stroke={LOL_FF_DOT_STROKE}
                  />
                  <rect
                    x={PAD_L + PLOT_W / 2 - 24}
                    y={lossCoords[0].y}
                    width={48}
                    height={Math.max(0, winCoords[0].y - lossCoords[0].y)}
                    fill={LOL_LOSS_DOT_FILL}
                  />
                  <rect
                    x={PAD_L + PLOT_W / 2 - 24}
                    y={winCoords[0].y}
                    width={48}
                    height={Math.max(0, baseCoords[0].y - winCoords[0].y)}
                    fill={LOL_WIN_DOT_FILL}
                  />
                </g>
              )}

              {/* Hover Macro Range Highlight Band + Vertical Crosshair Line */}
              {hoverDisplay && (
                <g pointerEvents="none">
                  <rect
                    x={hoverDisplay.xStart}
                    y={PAD_T}
                    width={Math.max(1, hoverDisplay.xEnd - hoverDisplay.xStart)}
                    height={PLOT_H}
                    fill="rgba(255,255,255,0.08)"
                  />
                  <line
                    x1={hoverDisplay.xStart}
                    y1={PAD_T}
                    x2={hoverDisplay.xStart}
                    y2={PAD_T + PLOT_H}
                    stroke="rgba(242,243,245,0.34)"
                    strokeWidth={1}
                  />
                  <line
                    x1={hoverDisplay.xEnd}
                    y1={PAD_T}
                    x2={hoverDisplay.xEnd}
                    y2={PAD_T + PLOT_H}
                    stroke="rgba(242,243,245,0.34)"
                    strokeWidth={1}
                  />
                  {/* Exact Vertical Crosshair Line (matching Performance chart) */}
                  <line
                    x1={hoverDisplay.crosshairX}
                    y1={PAD_T}
                    x2={hoverDisplay.crosshairX}
                    y2={PAD_T + PLOT_H}
                    stroke="rgba(242, 243, 245, 0.68)"
                    strokeWidth={1.15}
                    strokeDasharray="3 3"
                  />
                </g>
              )}

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

              {/* Individual Game Dots (non-hovered pass first, hovered pass on top) */}
              {gameDots.length > 0 && (
                <g clipPath={`url(#${dotsClipId})`} pointerEvents="none">
                  {gameDots
                    .filter((dot) => !isDotHighlighted(dot))
                    .map((dot) => renderDot(dot, false))}
                  {hasActiveHover &&
                    gameDots
                      .filter((dot) => isDotHighlighted(dot))
                      .map((dot) => renderDot(dot, true))}
                </g>
              )}

              {/* Hover Top HUD & Bottom Exact Time/Range Pill */}
              {hoverDisplay && (
                <g pointerEvents="none">
                  {/* Top HUD Pill */}
                  <line
                    x1={hoverDisplay.crosshairX}
                    y1={42}
                    x2={hoverDisplay.crosshairX}
                    y2={PAD_T}
                    stroke="rgba(242, 243, 245, 0.55)"
                    strokeWidth={1}
                  />
                  <rect
                    x={topHudX - activeHudW / 2}
                    y={2}
                    width={activeHudW}
                    height={40}
                    rx={6}
                    fill="#11141A"
                    stroke="rgba(255,255,255,0.22)"
                    strokeWidth={1}
                  />
                  {hoverDisplay.curveWinRate !== null &&
                  hoverDisplay.curveLossRate !== null &&
                  hoverDisplay.curveFfRate !== null ? (
                    <>
                      {/* Line 1: Exact minute curve rates at vertical crosshair */}
                      <text
                        x={topHudX}
                        y={17}
                        textAnchor="middle"
                        fontSize="11.5"
                        fontWeight={800}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        <tspan fill="#949BA4" fontSize="9.5" fontWeight={700}>
                          {'CURVA '}
                        </tspan>
                        <tspan fill="#34D399">{`V ${hoverDisplay.curveWinRate.toFixed(1)}%`}</tspan>
                        <tspan fill="#64748B">{' · '}</tspan>
                        <tspan fill="#F87171">{`D ${hoverDisplay.curveLossRate.toFixed(1)}%`}</tspan>
                        <tspan fill="#64748B">{' · '}</tspan>
                        <tspan fill="#FDA4AF">{`FF ${hoverDisplay.curveFfRate.toFixed(1)}%`}</tspan>
                      </text>
                      {/* Line 2: Macro range real game counts */}
                      <text
                        x={topHudX}
                        y={33}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight={600}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        <tspan fill="#949BA4">{`${hoverDisplay.rangeLabel}: `}</tspan>
                        {hoverDisplay.total === 0 ? (
                          <tspan fill="#64748B">Sin partidas (0G)</tspan>
                        ) : (
                          <>
                            <tspan fill="#34D399">{`${hoverDisplay.wins}V`}</tspan>
                            <tspan fill="#949BA4" fontSize="9">{` (${hoverDisplay.winPct}%)`}</tspan>
                            <tspan fill="#64748B">{' · '}</tspan>
                            <tspan fill="#F87171">{`${hoverDisplay.losses}D`}</tspan>
                            <tspan fill="#949BA4" fontSize="9">{` (${hoverDisplay.lossPct}%)`}</tspan>
                            <tspan fill="#64748B">{' · '}</tspan>
                            <tspan fill="#FDA4AF">{`${hoverDisplay.ffs}FF`}</tspan>
                            <tspan fill="#949BA4" fontSize="9">{` (${hoverDisplay.ffPct}%)`}</tspan>
                            <tspan fill="#64748B">{' · '}</tspan>
                            <tspan fill="#E2E8F0">{`${hoverDisplay.total}G`}</tspan>
                          </>
                        )}
                      </text>
                    </>
                  ) : hoverDisplay.total === 0 ? (
                    <text
                      x={topHudX}
                      y={26}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={600}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      fill="#949BA4"
                    >
                      Sin partidas (0G)
                    </text>
                  ) : (
                    <text
                      x={topHudX}
                      y={26}
                      textAnchor="middle"
                      fontSize="11.5"
                      fontWeight={700}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      <tspan fill="#34D399">{`${hoverDisplay.wins}V`}</tspan>
                      <tspan fill="#949BA4" fontSize="9.5" fontWeight={500}>
                        {` (${hoverDisplay.winPct}%)`}
                      </tspan>
                      <tspan fill="#64748B">{' · '}</tspan>
                      <tspan fill="#F87171">{`${hoverDisplay.losses}D`}</tspan>
                      <tspan fill="#949BA4" fontSize="9.5" fontWeight={500}>
                        {` (${hoverDisplay.lossPct}%)`}
                      </tspan>
                      <tspan fill="#64748B">{' · '}</tspan>
                      <tspan fill="#FDA4AF">{`${hoverDisplay.ffs}FF`}</tspan>
                      <tspan fill="#949BA4" fontSize="9.5" fontWeight={500}>
                        {` (${hoverDisplay.ffPct}%)`}
                      </tspan>
                      <tspan fill="#64748B">{' · '}</tspan>
                      <tspan fill="#E2E8F0" fontSize="10">
                        {`${hoverDisplay.total}G`}
                      </tspan>
                    </text>
                  )}

                  {/* Bottom X Crosshair Time & Range Pill */}
                  <line
                    x1={hoverDisplay.crosshairX}
                    y1={PAD_T + PLOT_H}
                    x2={hoverDisplay.crosshairX}
                    y2={PAD_T + PLOT_H + 6}
                    stroke="rgba(242, 243, 245, 0.65)"
                    strokeWidth={1}
                  />
                  <rect
                    x={bottomLabelX - activeBottomLabelW / 2}
                    y={PAD_T + PLOT_H + 6}
                    width={activeBottomLabelW}
                    height={22}
                    rx={4}
                    fill="#181C24"
                    stroke="rgba(242, 243, 245, 0.34)"
                    strokeWidth={1}
                  />
                  <text
                    x={bottomLabelX}
                    y={PAD_T + PLOT_H + 20.5}
                    textAnchor="middle"
                    fill="#F2F3F5"
                    fontSize="10.5"
                    fontWeight={700}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {hoverDisplay.bottomLabel}
                  </text>
                </g>
              )}
            </svg>

            {samples.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[11px] font-mono text-muted-foreground bg-background/80 px-2.5 py-1 rounded border border-border">
                  Sin partidas válidas en el filtro actual
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>

      {hoveredDotState && (
        <LolMatchHoverCard
          match={hoveredDotState.dot.sample.match}
          participant={hoveredDotState.dot.sample.participant}
          anchorRect={hoveredDotState.rect}
          groupPuuids={groupPuuids}
          accountByPuuid={accountByPuuid}
          ddragonVersion={ddragonVersion}
          hideGroupInfo={isPersonal}
          showOutcomeDiffs
        />
      )}
    </Card>
  );
};
