import React, { useEffect, useMemo, useState } from 'react';
import {
  LolChampionDetailedStats,
  LolMatchParticipantSummary,
  LolMatchSummary,
} from '@/types/lol';
import {
  DEFAULT_DDRAGON_VERSION,
  formatCompactNumber,
  formatDuration,
  formatQueueLabel,
  formatRoleLabel,
  getChampionSplashUrl,
  getGradeColorClasses,
  getItemIconUrl,
  getProfileIconUrl,
  getRuneIconUrl,
  getRuneMeta,
  getRuneStyleIconUrl,
  getRuneStyleMeta,
  getSpellIconUrl,
  getSpellMeta,
} from '@/lib/lolDdragon';
import { getGradeFromScore } from '@/lib/lolPerformanceEngine';
import {
  LOL_FF_DOT_FILL,
  LOL_FF_DOT_STROKE,
  LOL_LOSS_DOT_FILL,
  LOL_STAT_GLOSSARY,
  LOL_WIN_DOT_FILL,
  LolChampionAvatar,
  LolInfoTip,
  LolItemRow,
  LolOutcomeBadge,
  LolPerformanceBadge,
  LolPillarBars,
  LolSpellsRunesBadge,
} from './LolPrimitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  Activity,
  Award,
  Clock,
  Crown,
  Flame,
  Package,
  Sparkles,
  Swords,
  TrendingDown,
  TrendingUp,
  User,
  Users,
  X,
} from 'lucide-react';

export interface LolChampionDetailModalProps {
  detail: LolChampionDetailedStats;
  ddragonVersion?: string;
  isSuppressed?: boolean;
  onClose: () => void;
  onSelectMatch: (matchId: string, initialPuuid?: string) => void;
}

function formatMatchDateTime(match: LolMatchSummary): string {
  const ts =
    match.gameStartTimestamp > 0 ? match.gameStartTimestamp : match.gameCreation;
  if (!Number.isFinite(ts) || ts <= 0) return '—';
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
}

function getWinRateClass(winRate: number): string {
  if (winRate >= 55) return 'text-success';
  if (winRate <= 45) return 'text-destructive';
  return 'text-foreground';
}

interface HighlightMatchCardProps {
  kind: 'best' | 'worst';
  entry: { match: LolMatchSummary; participant: LolMatchParticipantSummary } | null;
  onSelect: (matchId: string) => void;
}

const HighlightMatchCard: React.FC<HighlightMatchCardProps> = ({
  kind,
  entry,
  onSelect,
}) => {
  const isBest = kind === 'best';
  const title = isBest ? 'Mejor Partida' : 'Peor Partida';

  if (!entry) {
    return (
      <div className="bg-[#11141A] border border-white/10 rounded-md p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          {isBest ? (
            <TrendingUp className="w-4 h-4 text-success" strokeWidth={1.75} />
          ) : (
            <TrendingDown className="w-4 h-4 text-destructive" strokeWidth={1.75} />
          )}
          <span>{title}</span>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">
          {isBest ? 'Sin partidas puntuadas' : 'Requiere ≥2 partidas'}
        </span>
      </div>
    );
  }

  const { match, participant: p } = entry;
  const mins = Math.max(1, match.gameDuration / 60);

  return (
    <button
      type="button"
      onClick={() => onSelect(match.matchId)}
      className={cn(
        'w-full text-left bg-[#11141A] border rounded-md p-3.5 transition-all cursor-pointer space-y-2.5 group',
        isBest
          ? 'border-emerald-500/25 hover:border-emerald-400/55 hover:bg-[#141922]'
          : 'border-rose-500/25 hover:border-rose-400/55 hover:bg-[#141922]'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isBest ? (
            <TrendingUp className="w-4 h-4 text-success shrink-0" strokeWidth={1.75} />
          ) : (
            <TrendingDown className="w-4 h-4 text-destructive shrink-0" strokeWidth={1.75} />
          )}
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            {title}
          </span>
          <LolOutcomeBadge
            outcome={p.outcome}
            enemySurrendered={p.enemySurrendered}
            compact
          />
        </div>

        <LolPerformanceBadge
          score={p.performanceScore}
          grade={p.performanceGrade}
          isMvp={p.isMvp}
          isAce={p.isAce}
          matchRank={p.matchRank}
          isRemake={p.performanceBreakdown.isRemake}
          compact
        />
      </div>

      <div className="grid grid-cols-4 gap-2 font-mono text-xs">
        <div className="p-2 rounded border border-white/5 bg-black/30">
          <span className="text-[10px] text-muted-foreground block">KDA</span>
          <strong className="text-foreground">
            {p.kills}/{p.deaths}/{p.assists}
          </strong>
          <span className="text-[10px] text-muted-foreground block">
            {p.kda.toFixed(2)}
          </span>
        </div>
        <div className="p-2 rounded border border-white/5 bg-black/30">
          <span className="text-[10px] text-muted-foreground block">CS</span>
          <strong className="text-foreground">{p.cs}</strong>
          <span className="text-[10px] text-muted-foreground block">
            {p.csPerMin.toFixed(1)}/m
          </span>
        </div>
        <div className="p-2 rounded border border-white/5 bg-black/30">
          <span className="text-[10px] text-muted-foreground block">Daño</span>
          <strong className="text-foreground">
            {formatCompactNumber(p.damageToChampions)}
          </strong>
          <span className="text-[10px] text-muted-foreground block">
            {formatCompactNumber(p.damageToChampions / mins)}/m
          </span>
        </div>
        <div className="p-2 rounded border border-white/5 bg-black/30">
          <span className="text-[10px] text-muted-foreground block">Partida</span>
          <strong className="text-foreground text-[11px] truncate block">
            {formatMatchDateTime(match)}
          </strong>
          <span className="text-[10px] text-muted-foreground truncate block">
            {formatQueueLabel(match.queueId, match.gameMode)}
          </span>
        </div>
      </div>
    </button>
  );
};

interface EvolutionChartProps {
  chronologicalMatches: Array<{
    match: LolMatchSummary;
    participant: LolMatchParticipantSummary;
  }>;
  onSelectMatch: (matchId: string) => void;
}

const EVO_W = 640;
const EVO_H = 118;
const EVO_PAD_L = 28;
const EVO_PAD_R = 14;
const EVO_PAD_T = 12;
const EVO_PAD_B = 16;
const EVO_PLOT_W = EVO_W - EVO_PAD_L - EVO_PAD_R;
const EVO_PLOT_H = EVO_H - EVO_PAD_T - EVO_PAD_B;

const ChampionEvolutionChart: React.FC<EvolutionChartProps> = ({
  chronologicalMatches,
  onSelectMatch,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    setHoveredIdx(null);
  }, [chronologicalMatches]);

  const points = useMemo(() => {
    const count = chronologicalMatches.length;
    return chronologicalMatches.map((entry, idx) => {
      const x =
        count <= 1
          ? EVO_PAD_L + EVO_PLOT_W / 2
          : EVO_PAD_L + (idx / (count - 1)) * EVO_PLOT_W;
      const clampedScore = Math.max(0, Math.min(100, entry.participant.performanceScore));
      const y = EVO_PAD_T + (1 - clampedScore / 100) * EVO_PLOT_H;
      return { entry, idx, x, y, score: clampedScore };
    });
  }, [chronologicalMatches]);

  const polylinePoints = useMemo(
    () => points.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' '),
    [points]
  );

  const areaPoints = useMemo(() => {
    if (points.length < 2) return '';
    const first = points[0];
    const last = points[points.length - 1];
    const baseY = EVO_PAD_T + EVO_PLOT_H;
    return `${first.x.toFixed(1)},${baseY} ${polylinePoints} ${last.x.toFixed(1)},${baseY}`;
  }, [points, polylinePoints]);

  const hovered = hoveredIdx !== null ? points[hoveredIdx] ?? null : null;

  return (
    <div className="rounded-md border border-white/10 bg-black/35 p-2.5 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-[20px]">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <Activity className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
          <span>Evolución BG-PERF</span>
          <span className="text-[10px] font-mono text-muted-foreground font-normal">
            ({points.length}G cronológico)
          </span>
        </div>

        {hovered ? (
          <div className="flex items-center gap-2 text-[10.5px] font-mono animate-in fade-in duration-100">
            <span className="text-muted-foreground">
              {formatMatchDateTime(hovered.entry.match)}
            </span>
            <LolOutcomeBadge
              outcome={hovered.entry.participant.outcome}
              enemySurrendered={hovered.entry.participant.enemySurrendered}
              compact
            />
            <span className="text-foreground font-semibold">
              {hovered.entry.participant.kills}/{hovered.entry.participant.deaths}/
              {hovered.entry.participant.assists}
            </span>
            <span
              className={cn(
                'px-1.5 py-0 rounded border font-bold',
                getGradeColorClasses(hovered.entry.participant.performanceGrade)
              )}
            >
              {hovered.score.toFixed(1)} {hovered.entry.participant.performanceGrade}
            </span>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-muted-foreground">
            Click en punto para abrir partida
          </span>
        )}
      </div>

      {points.length === 0 ? (
        <div className="h-[94px] flex items-center justify-center text-[11px] font-mono text-muted-foreground">
          Sin partidas puntuadas para graficar
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${EVO_W} ${EVO_H}`}
          className="w-full h-[118px] select-none overflow-visible"
          role="img"
          aria-label="Evolución de BG-PERF partida a partida"
        >
          <defs>
            <linearGradient id="lolChampEvoFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5865F2" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#5865F2" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {[25, 50, 75, 100].map((tick) => {
            const y = EVO_PAD_T + (1 - tick / 100) * EVO_PLOT_H;
            return (
              <g key={tick}>
                <line
                  x1={EVO_PAD_L}
                  y1={y}
                  x2={EVO_W - EVO_PAD_R}
                  y2={y}
                  stroke="rgba(255,255,255,0.08)"
                  strokeDasharray={tick === 50 ? '3 3' : undefined}
                />
                <text
                  x={EVO_PAD_L - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#949BA4"
                  fontSize="9"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {areaPoints && <polygon points={areaPoints} fill="url(#lolChampEvoFill)" />}

          {points.length >= 2 && (
            <polyline
              fill="none"
              stroke="#5865F2"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={polylinePoints}
            />
          )}

          {points.map((pt) => {
            const outcome = pt.entry.participant.outcome;
            const isHovered = hoveredIdx === pt.idx;
            const fill =
              outcome === 'win'
                ? LOL_WIN_DOT_FILL
                : outcome === 'ff'
                  ? LOL_FF_DOT_FILL
                  : LOL_LOSS_DOT_FILL;
            const stroke =
              outcome === 'ff' ? LOL_FF_DOT_STROKE : 'rgba(255,255,255,0.75)';

            return (
              <g
                key={pt.entry.match.matchId}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(pt.idx)}
                onMouseLeave={() => setHoveredIdx((prev) => (prev === pt.idx ? null : prev))}
                onClick={() => onSelectMatch(pt.entry.match.matchId)}
              >
                <circle cx={pt.x} cy={pt.y} r={10} fill="transparent" />
                {isHovered && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={8}
                    fill="none"
                    stroke="#5865F2"
                    strokeWidth={1.5}
                    strokeOpacity={0.9}
                  />
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 5.5 : 4}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={outcome === 'ff' ? 1.75 : 1.2}
                />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
};

export const LolChampionDetailModal: React.FC<LolChampionDetailModalProps> = ({
  detail,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  isSuppressed = false,
  onClose,
  onSelectMatch,
}) => {
  const [splashErrored, setSplashErrored] = useState(false);

  const version = detail.account.ddragonVersion || ddragonVersion;
  const grade = getGradeFromScore(detail.avgPerformance);

  useEffect(() => {
    setSplashErrored(false);
  }, [detail.championName]);

  useEffect(() => {
    if (isSuppressed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSuppressed, onClose]);

  const chronologicalScored = useMemo(
    () =>
      [...detail.matches]
        .filter((m) => m.participant.outcome !== 'remake')
        .reverse(),
    [detail.matches]
  );

  const kpiCards = useMemo(
    () => [
      {
        label: 'KDA',
        value: detail.avgKda.toFixed(2),
        sub: `${detail.avgKills}/${detail.avgDeaths}/${detail.avgAssists}`,
        tip: LOL_STAT_GLOSSARY.kda,
      },
      {
        label: 'KP%',
        value: `${Math.round(detail.avgKp * 100)}%`,
        sub: 'Participación',
        tip: LOL_STAT_GLOSSARY.kp,
      },
      {
        label: 'CS/m',
        value: detail.avgCsPerMin.toFixed(1),
        sub: `${detail.avgCs.toFixed(0)} CS/g`,
        tip: LOL_STAT_GLOSSARY.csMin,
      },
      {
        label: 'DPM',
        value: formatCompactNumber(detail.avgDpm),
        sub: `${formatCompactNumber(detail.avgDamage)} dmg/g`,
        tip: LOL_STAT_GLOSSARY.dpm,
      },
      {
        label: 'GPM',
        value: String(Math.round(detail.avgGpm)),
        sub: 'Oro/min',
        tip: LOL_STAT_GLOSSARY.gpm,
      },
      {
        label: 'Vis/m',
        value: detail.avgVisionPerMin.toFixed(2),
        sub: `Rec. ${formatCompactNumber(detail.avgDamageTakenPerMin)}/m`,
        tip: LOL_STAT_GLOSSARY.visMin,
      },
      {
        label: 'Tiempo Muerto',
        value: formatDuration(detail.avgDeadSeconds),
        sub: 'prom. gris/g',
        tip: {
          acronym: 'Muerto',
          title: 'Tiempo Muerto Promedio',
          description: 'Tiempo promedio por partida esperando respawn.',
        },
      },
      {
        label: 'FF% / Duración',
        value: `${detail.ffRate}% FF`,
        sub: `Prom ${formatDuration(detail.avgDurationSeconds)}`,
        tip: LOL_STAT_GLOSSARY.ff,
      },
    ],
    [detail]
  );

  const profileIconSrc =
    detail.avatarUrl && detail.avatarUrl.trim().length > 0
      ? detail.avatarUrl
      : getProfileIconUrl(detail.account.profileIconId, version);

  const frequentItems = detail.topItems.slice(0, 6);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-lg flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${detail.championName} (${detail.displayName})`}
    >
      <div
        className="w-full max-w-[96vw] xl:max-w-[1360px] h-[92vh] flex flex-col overflow-hidden rounded-md border border-white/15 bg-[#090B0E] text-card-foreground shadow-[0_32px_96px_-12px_rgba(0,0,0,0.95)] ring-1 ring-inset ring-white/10 animate-lol-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero Header with Champion Splash Art */}
        <div className="relative overflow-hidden border-b border-white/10 px-4 sm:px-6 py-4 shrink-0 bg-[#090B0E]">
          {!splashErrored && (
            <img
              src={getChampionSplashUrl(detail.championName)}
              alt=""
              aria-hidden="true"
              onError={() => setSplashErrored(true)}
              className="absolute inset-0 w-full h-full object-cover object-top opacity-25 scale-105 pointer-events-none select-none"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-[#090B0E] via-[#090B0E]/85 to-[#090B0E]/70 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090B0E] via-transparent to-transparent pointer-events-none" />

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            {/* Left Identity */}
            <div className="flex items-center gap-3.5 min-w-0">
              <LolChampionAvatar
                championName={detail.championName}
                version={version}
                size="xl"
                ring={detail.scope === 'group' ? 'group' : 'user'}
              />

              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black tracking-tight text-foreground">
                    {detail.championName}
                  </h2>
                  {detail.scope === 'personal' ? (
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px] border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                    >
                      <User className="w-3 h-3" strokeWidth={1.75} />
                      Personal
                    </Badge>
                  ) : (
                    <Badge variant="default" className="font-mono text-[10px]">
                      <Users className="w-3 h-3" strokeWidth={1.75} />
                      Grupo ≥2
                    </Badge>
                  )}
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {detail.totalGames}G
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <img
                    src={profileIconSrc}
                    alt={detail.displayName}
                    className="w-5 h-5 rounded-sm object-cover border border-white/20"
                  />
                  <span className="font-semibold text-foreground">{detail.displayName}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {detail.account.gameName}#{detail.account.tagLine}
                  </span>
                </div>

                {detail.roleDistribution.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {detail.roleDistribution.map((r) => (
                      <span
                        key={r.role}
                        className="px-2 py-0.5 rounded border border-white/10 bg-black/55 text-[10px] font-mono text-muted-foreground"
                      >
                        <strong className="text-foreground">
                          {formatRoleLabel(r.role)}
                        </strong>{' '}
                        {Math.round(r.pct)}% ·{' '}
                        <span className={getWinRateClass(r.winRate)}>
                          {Math.round(r.winRate)}% WR
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Metrics & Close */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 shrink-0">
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-white/10 bg-black/55 backdrop-blur-xs">
                <div
                  className={cn(
                    'px-2.5 py-1 rounded border flex items-baseline gap-1.5 font-mono',
                    getGradeColorClasses(grade)
                  )}
                >
                  <span className="text-xl font-black leading-none">
                    {detail.avgPerformance.toFixed(1)}
                  </span>
                  <span className="text-xs font-bold">{grade}</span>
                </div>
                <div className="space-y-0.5">
                  <div className="text-[11px] font-semibold text-foreground inline-flex items-center gap-1">
                    <span>BG-PERF</span>
                    <LolInfoTip {...LOL_STAT_GLOSSARY.bgPerf} />
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span className="text-amber-300 inline-flex items-center gap-0.5">
                      <Crown className="w-3 h-3" strokeWidth={1.75} />
                      {detail.mvpCount} MVP
                    </span>
                    <span className="text-primary inline-flex items-center gap-0.5">
                      <Award className="w-3 h-3" strokeWidth={1.75} />
                      {detail.aceCount} ACE
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right font-mono px-3 py-2 rounded-md border border-white/10 bg-black/55 backdrop-blur-xs">
                <div className="text-base font-black leading-tight">
                  <span className={getWinRateClass(detail.winRate)}>
                    {detail.winRate.toFixed(1)}%
                  </span>{' '}
                  <span className="text-[10px] font-normal text-muted-foreground">WR</span>
                </div>
                <div className="text-[11px] flex items-center justify-end gap-1 mt-0.5">
                  <span className="text-success font-semibold">{detail.wins}V</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-destructive font-semibold">
                    {detail.losses + detail.ffs}D
                  </span>
                  {detail.remakes > 0 && (
                    <span className="text-muted-foreground">({detail.remakes}R)</span>
                  )}
                </div>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={onClose}
                title="Cerrar"
                aria-label="Cerrar detalle de campeón"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </Button>
            </div>
          </div>
        </div>

        {/* Scrollable Dark Body */}
        <div className="flex-1 overflow-y-auto scroller-thin p-4 space-y-4 bg-[#090B0E]">
          {/* Section 1: Pillars + Duration Strip & KPIs + Evolution */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
            {/* 6 Pillars & Duration Strip */}
            <div className="xl:col-span-5 bg-[#11141A] border border-white/10 rounded-md p-3.5 flex flex-col justify-between gap-3">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                    <span>6 Pilares BG-PERF</span>
                    <LolInfoTip {...LOL_STAT_GLOSSARY.bgPerf} />
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {detail.scoredGames} puntuadas
                  </span>
                </div>
                <LolPillarBars pillars={detail.avgPillars} showInfo />
              </div>

              <div className="pt-2.5 border-t border-white/10 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Clock className="w-3 h-3 text-primary" strokeWidth={1.75} />
                  <span>Duración (0-5 / 0-20 / 20-30 / 30+)</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 font-mono">
                  {detail.durationBuckets.map((bucket) => {
                    const total = Math.max(1, bucket.total);
                    return (
                      <div
                        key={bucket.key}
                        className="p-1.5 rounded border border-white/10 bg-black/30 space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-foreground">{bucket.key}</span>
                          <span className="text-muted-foreground">
                            {bucket.total > 0 ? `${Math.round(bucket.winRate)}%` : '—'}
                          </span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-secondary overflow-hidden flex">
                          {bucket.total > 0 && (
                            <>
                              <div
                                className="bg-success h-full"
                                style={{ width: `${(bucket.wins / total) * 100}%` }}
                              />
                              <div
                                className="bg-destructive h-full"
                                style={{
                                  width: `${((bucket.losses + bucket.ffs) / total) * 100}%`,
                                }}
                              />
                            </>
                          )}
                        </div>
                        <div className="text-[9px] text-muted-foreground truncate">
                          {bucket.wins}V·{bucket.losses + bucket.ffs}D
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 8 KPIs + Evolution SVG Chart */}
            <div className="xl:col-span-7 bg-[#11141A] border border-white/10 rounded-md p-3.5 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                {kpiCards.map((kpi) => (
                  <div
                    key={kpi.label}
                    className="p-2 rounded-md border border-white/10 bg-black/30"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] text-muted-foreground truncate">
                        {kpi.label}
                      </span>
                      <LolInfoTip {...kpi.tip} />
                    </div>
                    <strong className="text-xs sm:text-sm text-foreground block mt-0.5">
                      {kpi.value}
                    </strong>
                    <span className="text-[10px] text-muted-foreground block truncate">
                      {kpi.sub}
                    </span>
                  </div>
                ))}
              </div>

              <ChampionEvolutionChart
                chronologicalMatches={chronologicalScored}
                onSelectMatch={(matchId) => onSelectMatch(matchId, detail.account.puuid)}
              />
            </div>
          </div>

          {/* Section 2: Runes, Spells & Frequent Items */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Key Runes */}
            <div className="bg-[#11141A] border border-white/10 rounded-md p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
                <span>Runas Clave</span>
              </div>
              {detail.topRunes.length === 0 ? (
                <div className="py-4 text-center text-[11px] font-mono text-muted-foreground">
                  Sin datos de runas
                </div>
              ) : (
                <div className="space-y-1.5">
                  {detail.topRunes.map((r) => {
                    const runeUrl = getRuneIconUrl(r.primaryRuneId);
                    const runeName =
                      getRuneMeta(r.primaryRuneId)?.name || `Runa #${r.primaryRuneId}`;
                    const subUrl = r.subStyleId ? getRuneStyleIconUrl(r.subStyleId) : null;
                    const subName = r.subStyleId
                      ? getRuneStyleMeta(r.subStyleId)?.name || `Rama #${r.subStyleId}`
                      : null;

                    return (
                      <div
                        key={`${r.primaryRuneId}-${r.subStyleId ?? 'none'}`}
                        className="flex items-center justify-between gap-2 p-1.5 rounded border border-white/5 bg-black/30"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex items-center -space-x-1 shrink-0">
                            <div className="w-7 h-7 rounded-full border border-white/15 bg-black/60 overflow-hidden flex items-center justify-center p-0.5">
                              {runeUrl ? (
                                <img
                                  src={runeUrl}
                                  alt={runeName}
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  R
                                </span>
                              )}
                            </div>
                            {r.subStyleId && (
                              <div className="w-5 h-5 rounded-full border border-white/15 bg-[#11141A] overflow-hidden flex items-center justify-center p-0.5">
                                {subUrl ? (
                                  <img
                                    src={subUrl}
                                    alt={subName ?? 'Secundaria'}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className="text-[8px] font-mono text-muted-foreground">
                                    S
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground truncate">
                              {runeName}
                            </div>
                            {subName && (
                              <div className="text-[10px] text-muted-foreground truncate">
                                + {subName}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right font-mono text-[11px] shrink-0">
                          <div className={cn('font-bold', getWinRateClass(r.winRate))}>
                            {r.winRate.toFixed(0)}% WR
                          </div>
                          <div className="text-[10px] text-muted-foreground">{r.games}G</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Spells */}
            <div className="bg-[#11141A] border border-white/10 rounded-md p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Flame className="w-3.5 h-3.5 text-sky-400" strokeWidth={1.75} />
                <span>Hechizos</span>
              </div>
              {detail.topSpells.length === 0 ? (
                <div className="py-4 text-center text-[11px] font-mono text-muted-foreground">
                  Sin datos de hechizos
                </div>
              ) : (
                <div className="space-y-1.5">
                  {detail.topSpells.map((s) => {
                    const s1Url = getSpellIconUrl(s.summoner1Id, version);
                    const s2Url = getSpellIconUrl(s.summoner2Id, version);
                    const s1Name =
                      getSpellMeta(s.summoner1Id)?.name || `#${s.summoner1Id}`;
                    const s2Name =
                      getSpellMeta(s.summoner2Id)?.name || `#${s.summoner2Id}`;

                    return (
                      <div
                        key={`${s.summoner1Id}-${s.summoner2Id}`}
                        className="flex items-center justify-between gap-2 p-1.5 rounded border border-white/5 bg-black/30"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex items-center gap-1 shrink-0">
                            {[
                              { id: s.summoner1Id, url: s1Url, name: s1Name },
                              { id: s.summoner2Id, url: s2Url, name: s2Name },
                            ].map((sp, sIdx) => (
                              <div
                                key={`${sIdx}-${sp.id}`}
                                className="w-6 h-6 rounded-sm border border-white/15 bg-black/60 overflow-hidden flex items-center justify-center"
                              >
                                {sp.url ? (
                                  <img
                                    src={sp.url}
                                    alt={sp.name}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className="text-[9px] font-mono text-muted-foreground">
                                    ?
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          <span className="text-xs font-semibold text-foreground truncate">
                            {s1Name} + {s2Name}
                          </span>
                        </div>

                        <div className="text-right font-mono text-[11px] shrink-0">
                          <div className={cn('font-bold', getWinRateClass(s.winRate))}>
                            {s.winRate.toFixed(0)}% WR
                          </div>
                          <div className="text-[10px] text-muted-foreground">{s.games}G</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Frequent Items */}
            <div className="bg-[#11141A] border border-white/10 rounded-md p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Package className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                <span>Ítems Frecuentes</span>
              </div>
              {frequentItems.length === 0 ? (
                <div className="py-4 text-center text-[11px] font-mono text-muted-foreground">
                  Sin datos de ítems
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {frequentItems.map((item) => {
                    const url = getItemIconUrl(item.itemId, version);
                    return (
                      <div
                        key={item.itemId}
                        title={`Ítem #${item.itemId}`}
                        className="flex items-center gap-2 p-1.5 rounded border border-white/5 bg-black/30"
                      >
                        <div className="w-7 h-7 rounded-sm border border-white/15 bg-black/60 overflow-hidden flex items-center justify-center shrink-0">
                          {url ? (
                            <img
                              src={url}
                              alt={`Ítem #${item.itemId}`}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[9px] font-mono text-muted-foreground">
                              #{item.itemId}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 font-mono">
                          <div className="text-[11px] font-bold text-foreground truncate">
                            {item.pickRate.toFixed(0)}% pick
                          </div>
                          <div className="text-[10px] flex items-center gap-1">
                            <span className={cn('font-semibold', getWinRateClass(item.winRate))}>
                              {item.winRate.toFixed(0)}% WR
                            </span>
                            <span className="text-muted-foreground">· {item.games}G</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Best & Worst Match */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <HighlightMatchCard
              kind="best"
              entry={detail.bestMatch}
              onSelect={(matchId) => onSelectMatch(matchId, detail.account.puuid)}
            />
            <HighlightMatchCard
              kind="worst"
              entry={detail.worstMatch}
              onSelect={(matchId) => onSelectMatch(matchId, detail.account.puuid)}
            />
          </div>

          {/* Section 4: Match History with Champion */}
          <div className="bg-[#11141A] border border-white/10 rounded-md overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between gap-2 bg-black/25">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <Swords className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                <span>
                  Historial con {detail.championName} ({detail.matches.length})
                </span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">
                Click para inspeccionar partida
              </span>
            </div>

            {detail.matches.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Sin partidas registradas con {detail.championName}.
              </div>
            ) : (
              <div className="max-h-[380px] overflow-auto scroller-thin">
                <Table className="min-w-[960px]">
                  <TableHeader className="sticky top-0 z-10 bg-[#11141A]">
                    <TableRow className="hover:bg-transparent border-white/10">
                      <TableHead>Resultado</TableHead>
                      <TableHead>Cola</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Duración</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Hechizos / Runas</TableHead>
                      <TableHead>Ítems</TableHead>
                      <TableHead>KDA</TableHead>
                      <TableHead>CS/m</TableHead>
                      <TableHead>Daño</TableHead>
                      <TableHead>Vis/m</TableHead>
                      <TableHead className="text-right">BG-PERF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-white/5">
                    {detail.matches.map(({ match, participant: p }) => {
                      const mins = Math.max(1, match.gameDuration / 60);
                      return (
                        <TableRow
                          key={match.matchId}
                          onClick={() => onSelectMatch(match.matchId, detail.account.puuid)}
                          className="cursor-pointer border-white/5 hover:bg-white/[0.04]"
                        >
                          <TableCell>
                            <LolOutcomeBadge
                              outcome={p.outcome}
                              enemySurrendered={p.enemySurrendered}
                              compact
                            />
                          </TableCell>
                          <TableCell className="text-[11px] font-medium text-foreground whitespace-nowrap">
                            {formatQueueLabel(match.queueId, match.gameMode)}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {formatMatchDateTime(match)}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-foreground whitespace-nowrap">
                            {formatDuration(match.gameDuration)}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {formatRoleLabel(p.performanceBreakdown.role)}
                          </TableCell>
                          <TableCell>
                            <LolSpellsRunesBadge
                              summoner1Id={p.summoner1Id}
                              summoner2Id={p.summoner2Id}
                              primaryRuneId={p.primaryRuneId}
                              subStyleId={p.subStyleId}
                              version={version}
                              size="sm"
                              layout="row"
                            />
                          </TableCell>
                          <TableCell>
                            <LolItemRow items={p.items} version={version} size="xs" />
                          </TableCell>
                          <TableCell className="font-mono whitespace-nowrap">
                            <span className="font-bold text-foreground">
                              {p.kills}/{p.deaths}/{p.assists}
                            </span>{' '}
                            <span className="text-[10px] text-muted-foreground">
                              ({p.kda.toFixed(2)})
                            </span>
                          </TableCell>
                          <TableCell className="font-mono whitespace-nowrap">
                            <span className="text-foreground font-semibold">{p.cs}</span>{' '}
                            <span className="text-[10px] text-muted-foreground">
                              ({p.csPerMin.toFixed(1)})
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-foreground whitespace-nowrap">
                            {formatCompactNumber(p.damageToChampions)}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground whitespace-nowrap">
                            {(p.visionScore / mins).toFixed(1)}/m
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex justify-end">
                              <LolPerformanceBadge
                                score={p.performanceScore}
                                grade={p.performanceGrade}
                                isMvp={p.isMvp}
                                isAce={p.isAce}
                                matchRank={p.matchRank}
                                isRemake={p.performanceBreakdown.isRemake}
                                compact
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
