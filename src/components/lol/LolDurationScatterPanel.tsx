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

type ScatterOutcomeFilter = 'all' | 'win' | 'loss' | 'ff';

interface ScatterPoint {
  match: LolMatchSummary;
  participant: LolMatchParticipantSummary;
  hourOfDay: number;
  durationMins: number;
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
    jx: ((h1 % 9) - 4) * 0.45,
    jy: ((h2 % 9) - 4) * 0.45,
  };
}

function bucketMatchesDuration(key: LolDurationBucketKey, sec: number): boolean {
  if (key === '0-5') return sec <= 300;
  if (key === '0-20') return sec <= 1200;
  if (key === '20-30') return sec > 1200 && sec <= 1800;
  return sec > 1800;
}

function resolveEventHourOfDay(match: LolMatchSummary): number {
  const startMs =
    match.gameStartTimestamp > 0 ? match.gameStartTimestamp : match.gameCreation;
  const endMs =
    match.gameEndTimestamp && match.gameEndTimestamp > 0
      ? match.gameEndTimestamp
      : startMs + match.gameDuration * 1000;

  if (!Number.isFinite(endMs) || endMs <= 0) return 12;
  const dt = new Date(endMs);
  return Math.min(24, Math.max(0, dt.getHours() + dt.getMinutes() / 60));
}

const SVG_W = 460;
const SVG_H = 228;
const PAD_L = 38;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 28;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;
const HOUR_TICKS = [0, 4, 8, 12, 16, 20, 24] as const;

export const LolDurationScatterPanel: React.FC<LolDurationScatterPanelProps> = ({
  matches,
  targetPuuid,
  groupPuuids,
  accountByPuuid,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  onSelectMatch,
}) => {
  const [outcomeFilter, setOutcomeFilter] = useState<ScatterOutcomeFilter>('all');
  const [highlightedBucket, setHighlightedBucket] = useState<LolDurationBucketKey | null>(
    null
  );
  const [hoveredState, setHoveredState] = useState<{
    match: LolMatchSummary;
    participant: LolMatchParticipantSummary;
    rect: { left: number; top: number; right: number; bottom: number };
  } | null>(null);

  const { allPoints, buckets, maxMins } = useMemo(() => {
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

    const points: ScatterPoint[] = samples.map(({ match, participant }) => {
      const durationMins = Math.max(0.5, match.gameDuration / 60);
      const hourOfDay = resolveEventHourOfDay(match);
      const { jx, jy } = hashJitter(match.matchId);
      return {
        match,
        participant,
        hourOfDay,
        durationMins,
        isGroup: isGroupMatch(match, groupPuuids),
        jitterX: jx,
        jitterY: jy,
      };
    });

    return {
      allPoints: points,
      buckets: bucketStats,
      maxMins: computedMaxMins,
    };
  }, [matches, targetPuuid, groupPuuids]);

  const visiblePoints = useMemo(() => {
    if (outcomeFilter === 'all') return allPoints;
    if (outcomeFilter === 'win') {
      return allPoints.filter((pt) => pt.participant.outcome === 'win');
    }
    if (outcomeFilter === 'loss') {
      return allPoints.filter((pt) => pt.participant.outcome === 'loss');
    }
    return allPoints.filter(
      (pt) => pt.participant.outcome === 'ff' || pt.participant.outcome === 'remake'
    );
  }, [allPoints, outcomeFilter]);

  const yTicks = useMemo(() => {
    const base = [0, 5, 15, 20, 30, 40];
    if (maxMins >= 50) base.push(50);
    if (maxMins >= 60) base.push(60);
    return base.filter((m) => m <= maxMins);
  }, [maxMins]);

  const toX = (hour: number) =>
    PAD_L + Math.min(1, Math.max(0, hour / 24)) * PLOT_W;
  const toY = (mins: number) =>
    PAD_T + PLOT_H - Math.min(1, Math.max(0, mins / maxMins)) * PLOT_H;

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
    const yTop = toY(maxM);
    const yBot = toY(minM);
    return {
      y: yTop,
      height: Math.max(4, yBot - yTop),
    };
  }, [highlightedBucket, maxMins]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 pt-3 px-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Activity className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <span>Duración vs Hora</span>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {visiblePoints.length}G
            </Badge>
            <LolInfoTip
              acronym="Ejes"
              title="Hora real vs Minuto del game"
              description="Eje X: hora local (00h–24h) en que ocurrió la partida. Eje Y: minuto exacto en que finalizó o hubo FF."
            />
          </CardTitle>

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
        </div>
      </CardHeader>

      <CardContent className="p-3.5 pt-1 space-y-3 flex-1 flex flex-col justify-between">
        {/* Single Unified Scatter Plot */}
        <div className="rounded-md border border-border bg-background/45 p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2.5">
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
                Grupo
              </span>
            </div>
            <span className="opacity-80">Y: min · X: hora</span>
          </div>

          <div className="relative w-full">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full h-auto overflow-visible select-none"
              role="img"
              aria-label="Gráfico unificado de duración en minutos vs hora real"
            >
              {/* Horizontal Highlighted Bucket Band on Y-Axis */}
              {bucketBandRect && (
                <rect
                  x={PAD_L}
                  y={bucketBandRect.y}
                  width={PLOT_W}
                  height={bucketBandRect.height}
                  fill="rgba(88, 101, 242, 0.12)"
                />
              )}

              {/* Horizontal Y Grid (Game Minutes) */}
              {yTicks.map((tick) => {
                const y = toY(tick);
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
                          ? 'rgba(148, 155, 164, 0.25)'
                          : 'rgba(255,255,255,0.06)'
                      }
                      strokeDasharray={isThreshold ? '3 3' : undefined}
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
                      {tick}m
                    </text>
                  </g>
                );
              })}

              {/* Vertical X Grid & Hour Ticks (Real Clock 00h - 24h) */}
              {HOUR_TICKS.map((hour) => {
                const x = toX(hour);
                return (
                  <g key={`x-${hour}`}>
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
                      y={SVG_H - 7}
                      textAnchor="middle"
                      fill="#949BA4"
                      fontSize="9.5"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {String(hour).padStart(2, '0')}h
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
              {visiblePoints.map((pt) => {
                const cx = Math.min(
                  SVG_W - PAD_R - 4,
                  Math.max(PAD_L + 4, toX(pt.hourOfDay) + pt.jitterX)
                );
                const cy = Math.min(
                  PAD_T + PLOT_H - 4,
                  Math.max(PAD_T + 4, toY(pt.durationMins) + pt.jitterY)
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
                    <circle cx={cx} cy={cy} r={10} fill="transparent" />

                    {pt.isGroup && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 9.5 : 8}
                        fill="none"
                        stroke="#5865F2"
                        strokeWidth={1.5}
                        strokeOpacity={0.8}
                      />
                    )}

                    {outcome === 'remake' ? (
                      <polygon
                        points={`${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={1.4}
                      />
                    ) : (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 6.8 : outcome === 'ff' ? 5.5 : 5}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={
                          outcome === 'ff' ||
                          (outcome === 'win' && pt.participant.enemySurrendered)
                            ? 1.8
                            : 1.3
                        }
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {visiblePoints.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[11px] font-mono text-muted-foreground bg-background/80 px-2 py-1 rounded border border-border">
                  Sin partidas en este filtro
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

          <div className="grid grid-cols-2 gap-2">
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
