import React, { useState } from 'react';
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

export const PILLAR_META: Array<{
  key: keyof LolPerformancePillarScores;
  label: string;
  short: string;
}> = [
  { key: 'combat', label: 'Combate', short: 'CMB' },
  { key: 'impact', label: 'Impacto', short: 'IMP' },
  { key: 'economy', label: 'Economía', short: 'ECO' },
  { key: 'objectives', label: 'Objetivos', short: 'OBJ' },
  { key: 'vision', label: 'Visión', short: 'VIS' },
  { key: 'dominance', label: 'Dominio', short: 'DOM' },
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
    user: 'border-amber-400 ring-2 ring-amber-400/50',
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
    <Tooltip>
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
        ? 'warning'
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
      <Badge variant={variant} className="font-mono tracking-wide px-1.5 py-0 text-[10px]">
        {label}
      </Badge>
      {outcome === 'win' && enemySurrendered && (
        <Badge
          variant="outline"
          className="px-1.5 py-0 text-[9px] font-mono border-warning/40 text-warning"
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

export const LolPillarBars: React.FC<{
  pillars: LolPerformancePillarScores;
  weights?: LolPerformancePillarScores;
  compact?: boolean;
}> = ({ pillars, weights, compact = false }) => {
  const getBarColor = (val: number) => {
    if (val >= 78) return 'bg-success';
    if (val >= 58) return 'bg-primary';
    if (val >= 42) return 'bg-warning';
    return 'bg-destructive';
  };

  return (
    <div className={cn('grid gap-1.5', compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3')}>
      {PILLAR_META.map((item) => {
        const val = Math.round(pillars[item.key] ?? 0);
        const weight = weights ? Math.round((weights[item.key] ?? 0) * 100) : null;
        return (
          <div key={item.key} className="space-y-0.5">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-muted-foreground truncate">
                {compact ? item.short : item.label}
                {weight !== null && weight > 0 ? (
                  <span className="opacity-60 ml-1">{weight}%</span>
                ) : null}
              </span>
              <span className="text-foreground font-semibold">{val}</span>
            </div>
            <div className="h-1 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', getBarColor(val))}
                style={{ width: `${Math.min(100, Math.max(0, val))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
