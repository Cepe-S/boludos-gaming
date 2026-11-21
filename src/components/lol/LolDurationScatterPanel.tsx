import React, { useMemo, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Activity, Clock } from 'lucide-react';

export interface LolDurationScatterPanelProps {
  matches: LolMatchSummary[];
  targetPuuid: string;
  groupPuuids: Set<string>;
  accountByPuuid: Map<string, LolAccount>;
  ddragonVersion?: string;
  onSelectMatch: (matchId: string) => void;
}

interface ScatterPoint {
  match: LolMatchSummary;
  participant: LolMatchParticipantSummary;
  durationMins: number;
  yValue: number;
  isGroup: boolean;
  jitterX: number;
  jitterY: number;
}

function hashJitter(str: string): { jx: number; jy: number } {
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    h1 = (h1 * 31 + code) % 997;
    h2 = (h2 * 37 + code) % 991;
  }
  return {
    jx: ((h1 % 11) - 5) * 0.45,
    jy: ((h2 % 11) - 5) * 0.45,
  };
}

function bucketMatchesDuration(key: LolDurationBucketKey, sec: number): boolean {
  if (key === '0-5') return sec <= 300;
  if (key === '0-20') return sec <= 1200;
  if (key === '20-30') return sec > 1200 && sec <= 1800;
  return sec > 1800;
}

const SVG_W = 540;
const SVG_H = 228;
const PAD_L = 36;
const PAD_R = 16;
const PAD_T = 14;
const PAD_B = 28;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

export const LolDurationScatterPanel: React.FC<LolDurationScatterPanelProps> = ({
  matches,
  targetPuuid,
  groupPuuids,
  accountByPuuid,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  onSelectMatch,
}) => {
  const [yMetric, setYMetric] = useState<'performance' | 'kda'>('performance');
  const [highlightedBucket, setHighlightedBucket] = useState<LolDurationBucketKey | null>(
    null
  );
  const [hoveredState, setHoveredState] = useState<{
    match: LolMatchSummary;
    participant: LolMatchParticipantSummary;
    rect: { left: number; top: number; right: number; bottom: number };
  } | null>(null);

  const { lossPoints, winPoints, buckets, maxMins, maxKda } = useMemo(() => {
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

    const highestKda = samples.reduce(
      (max, s) => Math.max(max, s.participant.kda),
      6
    );
    const computedMaxKda = Math.max(8, Math.ceil(highestKda / 2) * 2);

    const losses: ScatterPoint[] = [];
    const wins: ScatterPoint[] = [];

    for (const { match, participant } of samples) {
      const durationMins = Math.max(0.5, match.gameDuration / 60);
      const yValue =
        yMetric === 'performance'
          ? participant.performanceBreakdown.isRemake
            ? 0
            : participant.performanceScore
          : Math.min(computedMaxKda, participant.kda);
      const { jx, jy } = hashJitter(match.matchId);
      const pt: ScatterPoint = {
        match,
        participant,
        durationMins,
        yValue,
        isGroup: isGroupMatch(match, groupPuuids),
        jitterX: jx,
        jitterY: jy,
      };

      if (participant.outcome === 'win') {
        wins.push(pt);
      } else {
        losses.push(pt);
      }
    }

    return {
      lossPoints: losses,
      winPoints: wins,
      buckets: bucketStats,
      maxMins: computedMaxMins,
      maxKda: computedMaxKda,
    };
  }, [matches, targetPuuid, groupPuuids, yMetric]);

  const maxY = yMetric === 'performance' ? 100 : maxKda;
  const yTicks =
    yMetric === 'performance'
      ? [0, 25, 50, 75, 100]
      : [0, Math.round(maxKda * 0.25), Math.round(maxKda * 0.5), Math.round(maxKda * 0.75), maxKda];

  const xTicks = useMemo(() => {
    const ticks = [0, 5, 10, 20, 30];
    if (maxMins > 35) ticks.push(40);
    if (maxMins > 45) ticks.push(50);
    if (maxMins > 55) ticks.push(60);
    return ticks.filter((t) => t <= maxMins);
  }, [maxMins]);

  const toX = (mins: number) =>
    PAD_L + Math.min(1, Math.max(0, mins / maxMins)) * PLOT_W;
  const toY = (val: number) =>
    PAD_T + PLOT_H - Math.min(1, Math.max(0, val / maxY)) * PLOT_H;

  const renderChart = (
    title: string,
    points: ScatterPoint[],
    accentBorderClass: string,
    countBadgeClass: string
  ) => (
    <div
      className={cn(
        'rounded-md border bg-background/45 p-3 space-y-2',
        accentBorderClass
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <Badge variant="secondary" className={cn('font-mono text-[10px]', countBadgeClass)}>
          {points.length} games
        </Badge>
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-auto overflow-visible select-none"
          role="img"
          aria-label={title}
        >
          {/* Highlighted Bucket Band */}
          {highlightedBucket && (
            <rect
              x={
                highlightedBucket === '0-5'
                  ? toX(0)
                  : highlightedBucket === '0-20'
                    ? toX(0)
                    : highlightedBucket === '20-30'
                      ? toX(20)
                      : toX(30)
              }
              y={PAD_T}
              width={Math.max(
                4,
                (highlightedBucket === '0-5'
                  ? toX(5) - toX(0)
                  : highlightedBucket === '0-20'
                    ? toX(20) - toX(0)
                    : highlightedBucket === '20-30'
                      ? toX(30) - toX(20)
                      : toX(maxMins) - toX(30))
              )}
              height={PLOT_H}
              fill="rgba(88, 101, 242, 0.10)"
            />
          )}

          {/* Horizontal Y Grid */}
          {yTicks.map((tick) => {
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
                  x={PAD_L - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#949BA4"
                  fontSize="9.5"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Vertical Reference Cutoff Lines (5m, 20m, 30m) */}
          {[5, 20, 30]
            .filter((m) => m <= maxMins)
            .map((m) => {
              const x = toX(m);
              return (
                <line
                  key={`ref-${m}`}
                  x1={x}
                  y1={PAD_T}
                  x2={x}
                  y2={PAD_T + PLOT_H}
                  stroke="rgba(148, 155, 164, 0.25)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
              );
            })}

          {/* X Axis Ticks */}
          {xTicks.map((m) => {
            const x = toX(m);
            return (
              <g key={`x-${m}`}>
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
                  y={SVG_H - 7}
                  textAnchor="middle"
                  fill="#949BA4"
                  fontSize="9.5"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {m}m
                </text>
              </g>
            );
          })}

          {/* Axes Frame */}
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

          {/* Scatter Dots */}
          {points.map((pt) => {
            const cx = Math.min(SVG_W - PAD_R - 4, Math.max(PAD_L + 4, toX(pt.durationMins) + pt.jitterX));
            const cy = Math.min(PAD_T + PLOT_H - 4, Math.max(PAD_T + 4, toY(pt.yValue) + pt.jitterY));
            const outcome = pt.participant.outcome;
            const isDimmed =
              highlightedBucket !== null &&
              !bucketMatchesDuration(highlightedBucket, pt.match.gameDuration);
            const isHovered = hoveredState?.match.matchId === pt.match.matchId;

            const fillColor =
              outcome === 'win'
                ? '#20B26B'
                : outcome === 'ff'
                  ? '#F59E0B'
                  : outcome === 'remake'
                    ? '#949BA4'
                    : '#DA373C';

            const strokeColor =
              outcome === 'win' && pt.participant.enemySurrendered
                ? '#F59E0B'
                : pt.isGroup
                  ? '#5865F2'
                  : '#0B0D10';

            return (
              <g
                key={pt.match.matchId}
                opacity={isDimmed ? 0.2 : 1}
                className="cursor-pointer transition-opacity"
                onMouseEnter={(e) => {
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
                onClick={() => onSelectMatch(pt.match.matchId)}
              >
                {/* Invisible wider hit area */}
                <circle cx={cx} cy={cy} r={11} fill="transparent" />

                {/* Group Halo */}
                {pt.isGroup && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 9.5 : 8}
                    fill="none"
                    stroke="#5865F2"
                    strokeWidth={1.5}
                    strokeOpacity={0.75}
                  />
                )}

                {outcome === 'remake' ? (
                  <polygon
                    points={`${cx},${cy - 5.5} ${cx + 5.5},${cy} ${cx},${cy + 5.5} ${cx - 5.5},${cy}`}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={1.5}
                  />
                ) : (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 6.5 : 5}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={outcome === 'win' && pt.participant.enemySurrendered ? 2 : 1.4}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[11px] font-mono text-muted-foreground bg-background/80 px-2 py-1 rounded border border-border">
              Sin partidas en esta categoría
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <span>Resultados vs Duración</span>
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            {/* Legend */}
            <div className="hidden md:flex items-center gap-2.5 text-[10px] font-mono text-muted-foreground pr-2 border-r border-border">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-success" />
                Win
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-destructive" />
                Loss
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                FF
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rotate-45 bg-muted-foreground inline-block" />
                Remake
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-primary" />
                Grupo
              </span>
            </div>

            {/* Y Axis Toggle */}
            <div className="inline-flex items-center rounded-md border border-border bg-background/55 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setYMetric('performance')}
                className={cn(
                  'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors',
                  yMetric === 'performance'
                    ? 'bg-primary/20 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Performance
              </button>
              <button
                type="button"
                onClick={() => setYMetric('kda')}
                className={cn(
                  'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors',
                  yMetric === 'kda'
                    ? 'bg-primary/20 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                KDA
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 2 Side-by-Side Scatter Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderChart(
            'Derrotas & Surrenders vs Tiempo',
            lossPoints,
            'border-destructive/30',
            'text-destructive'
          )}
          {renderChart(
            'Victorias vs Tiempo',
            winPoints,
            'border-success/30',
            'text-success'
          )}
        </div>

        {/* Duration Buckets Strip inside the same component: 0-5, 0-20, 20-30, 30+ */}
        <div className="pt-3 border-t border-border/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
              <span>Balance por Duración (0-5 / 0-20 / 20-30 / 30+)</span>
            </span>
            {highlightedBucket && (
              <button
                type="button"
                onClick={() => setHighlightedBucket(null)}
                className="text-[11px] font-mono text-primary hover:underline cursor-pointer"
              >
                Limpiar filtro ({highlightedBucket})
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
                    'text-left p-2.5 rounded-md border transition-colors cursor-pointer space-y-2',
                    isSelected
                      ? 'bg-primary/15 border-primary'
                      : 'bg-background/45 border-border hover:bg-muted/60'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold font-mono text-foreground">
                      {bucket.label}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                      {bucket.total}G
                    </Badge>
                  </div>

                  {/* Stacked bar */}
                  <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden flex">
                    {bucket.total > 0 && (
                      <>
                        <div className="bg-success h-full" style={{ width: `${winPct}%` }} />
                        <div className="bg-destructive h-full" style={{ width: `${lossPct}%` }} />
                        <div className="bg-warning h-full" style={{ width: `${ffPct}%` }} />
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <div>
                      <span className="text-success font-bold">{bucket.wins}V</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="text-destructive font-bold">{bucket.losses}D</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="text-warning font-bold">{bucket.ffs}FF</span>
                    </div>
                    <span className="text-muted-foreground">
                      {bucket.total > 0 ? `${bucket.winRate}% WR` : '—'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>

      {hoveredState && (
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
