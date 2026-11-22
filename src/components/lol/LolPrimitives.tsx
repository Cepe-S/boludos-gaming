import React, { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_DDRAGON_VERSION,
  getChampionIconUrl,
  getGradeColorClasses,
  getItemIconUrl,
  getRuneMeta,
  getRuneIconUrl,
  getRuneStyleIconUrl,
  getRuneStyleMeta,
  getSpellIconUrl,
  getSpellMeta,
} from '@/lib/lolDdragon';
import {
  LolGroupPickEntry,
  LolMatchOutcome,
  LolPerformanceGrade,
  LolPerformancePillarScores,
} from '@/types/lol';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

export const LOL_FF_BADGE_CLASS =
  'border-[#9F1239] bg-[#4C0519]/95 text-[#FDA4AF]';
export const LOL_FF_TEXT_CLASS = 'text-[#FB7185]';
export const LOL_FF_CHIP_CLASS =
  'inline-flex items-center px-1 rounded border border-[#9F1239]/80 bg-[#4C0519]/85 text-[#FDA4AF]';
export const LOL_FF_BAR_CLASS = 'bg-[#881337]';
export const LOL_WIN_DOT_FILL = '#20B26B';
export const LOL_LOSS_DOT_FILL = '#EF4444';
export const LOL_FF_DOT_FILL = '#881337';
export const LOL_FF_DOT_STROKE = '#FB7185';

export interface LolStatGlossaryEntry {
  acronym: string;
  title: string;
  description: string;
}

export const LOL_STAT_GLOSSARY = {
  bgPerf: {
    acronym: 'BG-PERF',
    title: 'Performance Boludos Gaming',
    description:
      'Puntaje de 0 a 100 ponderado por rol que evalúa combate, impacto, economía, objetivos, visión y dominio.',
  },
  wr: {
    acronym: 'WR',
    title: 'Win Rate',
    description:
      'Porcentaje de victorias sobre el total de partidas válidas (excluye remakes).',
  },
  kda: {
    acronym: 'KDA',
    title: 'Kills / Deaths / Assists',
    description:
      'Ratio promedio de bajas y asistencias por muerte: (K + A) / max(1, D).',
  },
  kp: {
    acronym: 'KP%',
    title: 'Kill Participation',
    description:
      'Porcentaje de las bajas totales de tu equipo en las que participaste.',
  },
  csMin: {
    acronym: 'CS/m',
    title: 'Creep Score por Minuto',
    description:
      'Promedio de súbditos y monstruos de jungla farmeados cada minuto.',
  },
  dpm: {
    acronym: 'DPM',
    title: 'Damage Per Minute',
    description:
      'Daño promedio infligido a campeones enemigos por minuto de partida.',
  },
  gpm: {
    acronym: 'GPM',
    title: 'Gold Per Minute',
    description: 'Oro promedio ganado por minuto durante la partida.',
  },
  visMin: {
    acronym: 'Vis/m',
    title: 'Visión por Minuto',
    description:
      'Puntuación de visión obtenida por minuto (centinelas colocados, limpiados y pinks).',
  },
  mvp: {
    acronym: 'MVP',
    title: 'Most Valuable Player',
    description: 'Jugador con mayor puntaje BG-PERF del equipo ganador.',
  },
  ace: {
    acronym: 'ACE',
    title: 'Mejor del Equipo Perdedor',
    description: 'Jugador con mayor puntaje BG-PERF del equipo derrotado.',
  },
  ff: {
    acronym: 'FF',
    title: 'Forfeit / Rendición',
    description: 'Derrota por votación anticipada de rendición del equipo.',
  },
  pickScore: {
    acronym: 'Pick Score',
    title: 'Impacto Real del Pick',
    description:
      'Score de 0 a 100 (≥3G) que pondera impacto del jugador vs su equipo y lobby en cada partida, duelo y dificultad de rivales, BG-PERF, WR ajustado por mérito (anti-pasajero), sinergia y FF.',
  },
} as const satisfies Record<string, LolStatGlossaryEntry>;

export const LolInfoTip: React.FC<{
  acronym: string;
  title: string;
  description: string;
  className?: string;
}> = ({ acronym, title, description, className }) => (
  <Tooltip delayDuration={0}>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        aria-label={`${acronym}: ${title}`}
        className={cn(
          'inline-flex items-center justify-center text-muted-foreground/75 hover:text-foreground transition-colors cursor-help align-middle shrink-0',
          className
        )}
      >
        <Info className="w-3 h-3" strokeWidth={1.75} />
      </button>
    </TooltipTrigger>
    <TooltipContent
      side="top"
      className="max-w-[230px] text-left space-y-0.5 py-1.5 px-2.5 z-[80]"
    >
      <div className="text-[11px] font-bold text-foreground leading-tight">
        {acronym} — {title}
      </div>
      <p className="text-[10px] font-normal text-muted-foreground leading-snug">
        {description}
      </p>
    </TooltipContent>
  </Tooltip>
);

export const LolPickScoreTooltip: React.FC<{
  pick: LolGroupPickEntry;
  tone?: 'best' | 'worst' | 'neutral';
  children: React.ReactElement;
}> = ({ pick, tone = 'neutral', children }) => {
  const formatSigned = (val: number, suffix = '') =>
    `${val > 0 ? '+' : ''}${val.toFixed(1)}${suffix}`;

  const deltaClass = (val: number, threshold = 0.5) =>
    val >= threshold
      ? 'text-success'
      : val <= -threshold
        ? 'text-destructive'
        : 'text-foreground';

  const scoreToneClass =
    tone === 'best'
      ? 'text-success'
      : tone === 'worst'
        ? 'text-destructive'
        : 'text-primary';

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        className="w-[256px] text-left space-y-1.5 py-2 px-2.5 z-[80]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-1">
          <span className="text-[11px] font-bold text-foreground truncate">
            {pick.displayName} × {pick.championName}
          </span>
          <span className={cn('text-[11px] font-mono font-bold shrink-0', scoreToneClass)}>
            {pick.pickScore.toFixed(1)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono">
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">WR Imp.</span>
            <span
              className={cn(
                'font-semibold',
                pick.impactWinRate >= 58
                  ? 'text-success'
                  : pick.impactWinRate <= 44
                    ? 'text-destructive'
                    : 'text-foreground'
              )}
            >
              {pick.impactWinRate.toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">vs Equipo</span>
            <span className={cn('font-semibold', deltaClass(pick.impactVsTeamDelta, 1.5))}>
              {formatSigned(pick.impactVsTeamDelta)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">vs Rival</span>
            <span className={cn('font-semibold', deltaClass(pick.vsOpponentDelta, 1.5))}>
              {formatSigned(pick.vsOpponentDelta)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">Dificultad</span>
            <span
              className={cn(
                'font-semibold',
                pick.avgDifficulty >= 56
                  ? 'text-amber-300'
                  : pick.avgDifficulty <= 42
                    ? 'text-muted-foreground'
                    : 'text-foreground'
              )}
            >
              {Math.round(pick.avgDifficulty)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">Aliados</span>
            <span className={cn('font-semibold', deltaClass(pick.teammatePerfDelta, 0.5))}>
              {formatSigned(pick.teammatePerfDelta)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">Rank med.</span>
            <span className="font-semibold text-foreground">
              {pick.avgMatchRank > 0 ? `#${pick.avgMatchRank.toFixed(1)}` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">FF%</span>
            <span
              className={cn(
                'font-semibold',
                pick.ffRate >= 30
                  ? LOL_FF_TEXT_CLASS
                  : pick.ffRate === 0
                    ? 'text-success'
                    : 'text-foreground'
              )}
            >
              {pick.ffRate.toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">Consist.</span>
            <span className="font-semibold text-foreground">
              {Math.round(pick.consistency)}%
            </span>
          </div>
        </div>

        {pick.pickDrivers.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1 border-t border-border/70">
            {pick.pickDrivers.map((driver) => (
              <span
                key={driver}
                className="inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-secondary/70 text-[9.5px] font-mono text-foreground leading-none"
              >
                {driver}
              </span>
            ))}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

export const PILLAR_META: Array<{
  key: keyof LolPerformancePillarScores;
  label: string;
  short: string;
  description: string;
}> = [
  {
    key: 'combat',
    label: 'Combate',
    short: 'CMB',
    description: 'KDA, participación en kills (KP%), multi-kills y penalización por tiempo muerto.',
  },
  {
    key: 'impact',
    label: 'Impacto',
    short: 'IMP',
    description: 'Daño/min, % daño del equipo, mitigación frontline y curación/escudos/CC.',
  },
  {
    key: 'economy',
    label: 'Economía',
    short: 'ECO',
    description: 'CS/min y GPM calibrados por rol, eficiencia de gasto y ventaja temprana.',
  },
  {
    key: 'objectives',
    label: 'Objetivos',
    short: 'OBJ',
    description: 'Daño a torres y objetivos épicos, dragones, barones, heraldos y robos.',
  },
  {
    key: 'vision',
    label: 'Visión',
    short: 'VIS',
    description: 'Visión/min, wards de control comprados/puestos y limpieza de visión.',
  },
  {
    key: 'dominance',
    label: 'Dominio',
    short: 'DOM',
    description: 'Diferencial directo frente a tu rival de línea y percentil global del game.',
  },
];

export const LolChampionAvatar: React.FC<{
  championName: string;
  level?: number;
  version?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ring?: 'none' | 'user' | 'group' | 'team100' | 'team200';
  className?: string;
}> = ({
  championName,
  level,
  version = DEFAULT_DDRAGON_VERSION,
  size = 'md',
  ring = 'none',
  className,
}) => {
  const [errored, setErrored] = useState(false);

  const sizeClasses: Record<NonNullable<typeof size>, string> = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-xs',
    lg: 'w-14 h-14 text-sm',
    xl: 'w-16 h-16 text-base',
  };

  const ringClasses: Record<NonNullable<typeof ring>, string> = {
    none: 'border-border',
    user: 'border-cyan-300 ring-2 ring-cyan-400/75 shadow-[0_0_8px_rgba(34,211,238,0.35)]',
    group: 'border-primary ring-2 ring-primary/50',
    team100: 'border-sky-500/60',
    team200: 'border-rose-500/60',
  };

  return (
    <div
      className={cn(
        'relative shrink-0 rounded-md overflow-hidden border bg-secondary/70 flex items-center justify-center font-bold text-muted-foreground select-none',
        sizeClasses[size],
        ringClasses[ring],
        className
      )}
    >
      {!errored ? (
        <img
          src={getChampionIconUrl(championName, version)}
          alt={championName}
          loading="lazy"
          onError={() => setErrored(true)}
          className="w-full h-full object-cover scale-105"
        />
      ) : (
        <span>{championName.slice(0, 2).toUpperCase()}</span>
      )}
      {level !== undefined && level > 0 && (
        <span className="absolute bottom-0 right-0 px-1 py-0 text-[9px] leading-tight font-mono font-bold bg-background/90 text-foreground border-tl border-border rounded-tl">
          {level}
        </span>
      )}
    </div>
  );
};

export const LolSpellsRunesBadge: React.FC<{
  summoner1Id: number;
  summoner2Id: number;
  primaryRuneId: number | null;
  subStyleId: number | null;
  version?: string;
  size?: 'sm' | 'md';
  layout?: 'grid' | 'row';
}> = ({
  summoner1Id,
  summoner2Id,
  primaryRuneId,
  subStyleId,
  version = DEFAULT_DDRAGON_VERSION,
  size = 'md',
  layout = 'grid',
}) => {
  const iconBox = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6';
  const spell1Url = getSpellIconUrl(summoner1Id, version);
  const spell2Url = getSpellIconUrl(summoner2Id, version);
  const spell1Name = getSpellMeta(summoner1Id)?.name || `Hechizo #${summoner1Id}`;
  const spell2Name = getSpellMeta(summoner2Id)?.name || `Hechizo #${summoner2Id}`;

  const runeUrl = primaryRuneId ? getRuneIconUrl(primaryRuneId) : null;
  const runeName = primaryRuneId
    ? getRuneMeta(primaryRuneId)?.name || `Runa #${primaryRuneId}`
    : 'Sin runa';

  const subStyleUrl = subStyleId ? getRuneStyleIconUrl(subStyleId) : null;
  const subStyleName = subStyleId
    ? getRuneStyleMeta(subStyleId)?.name || `Rama #${subStyleId}`
    : 'Secundaria';

  const renderIcon = (
    url: string | null,
    label: string,
    roundedFull = false,
    fallbackText = '?'
  ) => (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <div
          className={cn(
            iconBox,
            'overflow-hidden border border-border bg-background/80 flex items-center justify-center shrink-0',
            roundedFull ? 'rounded-full p-0.5' : 'rounded-sm'
          )}
        >
          {url ? (
            <img
              src={url}
              alt={label}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[9px] font-mono text-muted-foreground">
              {fallbackText}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  if (layout === 'row') {
    return (
      <div className="flex items-center gap-1 shrink-0">
        {renderIcon(spell1Url, spell1Name, false, 'D')}
        {renderIcon(spell2Url, spell2Name, false, 'F')}
        {renderIcon(runeUrl, runeName, true, 'R')}
        {subStyleId ? renderIcon(subStyleUrl, subStyleName, true, 'S') : null}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1 shrink-0">
      {renderIcon(spell1Url, spell1Name, false, 'D')}
      {renderIcon(runeUrl, runeName, true, 'R')}
      {renderIcon(spell2Url, spell2Name, false, 'F')}
      {renderIcon(subStyleUrl, subStyleName, true, 'S')}
    </div>
  );
};

export const LolItemRow: React.FC<{
  items: number[];
  version?: string;
  size?: 'xs' | 'sm' | 'md';
}> = ({ items, version = DEFAULT_DDRAGON_VERSION, size = 'sm' }) => {
  const normalized = Array.from({ length: 7 }, (_, i) => items[i] ?? 0);
  const boxClass =
    size === 'xs' ? 'w-4 h-4' : size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {normalized.map((itemId, idx) => {
        const url = getItemIconUrl(itemId, version);
        const isTrinket = idx === 6;
        return (
          <div
            key={`${idx}-${itemId}`}
            title={itemId > 0 ? `Ítem #${itemId}` : isTrinket ? 'Centinela vacío' : 'Espacio vacío'}
            className={cn(
              boxClass,
              'overflow-hidden border border-border/80 bg-background/55 flex items-center justify-center shrink-0',
              isTrinket ? 'rounded-full ml-0.5 border-primary/30' : 'rounded-sm'
            )}
          >
            {url ? (
              <img
                src={url}
                alt={`Item ${itemId}`}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export const LolOutcomeBadge: React.FC<{
  outcome: LolMatchOutcome;
  enemySurrendered?: boolean;
  compact?: boolean;
}> = ({ outcome, enemySurrendered = false, compact = false }) => {
  const variant =
    outcome === 'win'
      ? 'success'
      : outcome === 'ff'
        ? 'outline'
        : outcome === 'remake'
          ? 'secondary'
          : 'destructive';

  const label =
    outcome === 'win'
      ? compact
        ? 'WIN'
        : 'VICTORIA'
      : outcome === 'ff'
        ? 'FF'
        : outcome === 'remake'
          ? 'REMAKE'
          : compact
            ? 'LOSS'
            : 'DERROTA';

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <Badge
        variant={variant}
        className={cn(
          'font-mono tracking-wide px-1.5 py-0 text-[10px]',
          outcome === 'ff' && LOL_FF_BADGE_CLASS
        )}
      >
        {label}
      </Badge>
      {outcome === 'win' && enemySurrendered && (
        <Badge
          variant="outline"
          className="px-1.5 py-0 text-[9px] font-mono border-[#9F1239]/70 bg-[#4C0519]/60 text-[#FDA4AF]"
          title="El equipo rival se rindió"
        >
          Enemy FF
        </Badge>
      )}
    </span>
  );
};

export const LolPerformanceBadge: React.FC<{
  score: number;
  grade: LolPerformanceGrade;
  isMvp?: boolean;
  isAce?: boolean;
  matchRank?: number;
  isRemake?: boolean;
  compact?: boolean;
}> = ({
  score,
  grade,
  isMvp = false,
  isAce = false,
  matchRank,
  isRemake = false,
  compact = false,
}) => {
  if (isRemake) {
    return (
      <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
        Remake
      </Badge>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 shrink-0">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono font-bold text-[11px]',
          getGradeColorClasses(grade)
        )}
      >
        <span>{score.toFixed(1)}</span>
        <span className="opacity-80">{grade}</span>
      </span>
      {isMvp && (
        <Badge
          variant="warning"
          className="px-1.5 py-0 text-[9px] font-mono bg-amber-400/20 border-amber-400/50 text-amber-300"
        >
          MVP
        </Badge>
      )}
      {!isMvp && isAce && (
        <Badge
          variant="default"
          className="px-1.5 py-0 text-[9px] font-mono"
        >
          ACE
        </Badge>
      )}
      {!compact && matchRank !== undefined && matchRank > 0 && !isMvp && !isAce && (
        <span className="text-[10px] font-mono text-muted-foreground">
          #{matchRank}
        </span>
      )}
    </div>
  );
};

export function useLolAnimatedNumber(
  target: number,
  durationMs = 520
): number {
  const [current, setCurrent] = useState<number>(target);
  const prevRef = useRef<number>(0);

  useEffect(() => {
    const safeTarget = Number.isFinite(target) ? target : 0;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setCurrent(safeTarget);
      prevRef.current = safeTarget;
      return;
    }

    const startVal = prevRef.current;
    const delta = safeTarget - startVal;
    if (Math.abs(delta) < 0.001 || durationMs <= 0) {
      setCurrent(safeTarget);
      prevRef.current = safeTarget;
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / durationMs));
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = startVal + delta * eased;
      setCurrent(nextVal);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        setCurrent(safeTarget);
        prevRef.current = safeTarget;
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      prevRef.current = safeTarget;
    };
  }, [target, durationMs]);

  return current;
}

export const LolAnimatedNumber: React.FC<{
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  durationMs?: number;
  formatFn?: (n: number) => string;
  className?: string;
}> = ({
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  durationMs = 520,
  formatFn,
  className,
}) => {
  const animated = useLolAnimatedNumber(value, durationMs);
  const formatted = formatFn
    ? formatFn(animated)
    : decimals > 0
      ? animated.toFixed(decimals)
      : String(Math.round(animated));
  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};

export const LolPillarBars: React.FC<{
  pillars: LolPerformancePillarScores;
  weights?: LolPerformancePillarScores;
  compact?: boolean;
  showInfo?: boolean;
}> = ({ pillars, weights, compact = false, showInfo = true }) => {
  const getBarColor = (val: number) => {
    if (val >= 78) return 'bg-success';
    if (val >= 58) return 'bg-primary';
    if (val >= 42) return 'bg-warning';
    return 'bg-destructive';
  };

  return (
    <div className={cn('grid gap-1.5', compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3')}>
      {PILLAR_META.map((item, idx) => {
        const val = Math.round(pillars[item.key] ?? 0);
        const weight = weights ? Math.round((weights[item.key] ?? 0) * 100) : null;
        return (
          <div
            key={item.key}
            className="space-y-0.5 animate-lol-card-pop"
            style={{ animationDelay: `${idx * 40}ms` }}
          >
            <div className="flex items-center justify-between text-[10px] font-mono gap-1">
              <span className="inline-flex items-center gap-1 text-muted-foreground min-w-0">
                <span className="truncate">
                  {compact ? item.short : item.label}
                </span>
                {showInfo && (
                  <LolInfoTip
                    acronym={item.short}
                    title={item.label}
                    description={item.description}
                  />
                )}
                {weight !== null && weight > 0 ? (
                  <span className="opacity-60">{weight}%</span>
                ) : null}
              </span>
              <LolAnimatedNumber
                value={val}
                durationMs={480}
                className="text-foreground font-semibold shrink-0"
              />
            </div>
            <div className="h-1 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500 animate-lol-bar-grow',
                  getBarColor(val)
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, val))}%`,
                  animationDelay: `${idx * 45 + 60}ms`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
