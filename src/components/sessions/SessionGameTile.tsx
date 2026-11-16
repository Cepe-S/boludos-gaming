import React from 'react';
import { GameSynchronyResult } from '@/types/domain';
import {
  RATING_INFO,
  getSafeCoverUrl,
  handleImageFallback,
} from '@/components/catalog/sharedCatalogConstants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

export interface SessionTilePlayerAvatar {
  userId: string;
  displayName: string;
  avatarUrl: string;
  ringClass: string;
  dimmed?: boolean;
  tooltipTitle: string;
  tooltipSubtitle?: string;
  tooltipDetails?: string[];
}

export interface SessionGameTileProps {
  name: string;
  coverUrl?: string;
  score: number;
  rank?: number;
  isSelected?: boolean;
  muted?: boolean;
  statusPill?: string;
  infoContent: React.ReactNode;
  playerAvatars: SessionTilePlayerAvatar[];
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  actionVariant?: 'default' | 'secondary' | 'emerald' | 'outline';
  onAction?: () => void;
}

function getScorePillClasses(score: number): string {
  if (score >= 75) return 'bg-success/90 text-success-foreground border-success';
  if (score >= 55) return 'bg-primary/90 text-primary-foreground border-primary';
  return 'bg-warning/90 text-background border-warning';
}

export function buildPlayerAvatarsFromBreakdown(
  item: GameSynchronyResult
): SessionTilePlayerAvatar[] {
  return item.playerBreakdowns.map((pb) => {
    const ringClass = !pb.plays
      ? 'ring-2 ring-destructive/75'
      : pb.rating >= 4
        ? 'ring-2 ring-success'
        : pb.rating === 3
          ? 'ring-2 ring-primary'
          : pb.rating === 2
            ? 'ring-2 ring-warning'
            : 'ring-2 ring-destructive';

    return {
      userId: pb.userId,
      displayName: pb.displayName,
      avatarUrl: pb.avatarUrl,
      ringClass,
      dimmed: !pb.plays,
      tooltipTitle: pb.plays
        ? `${pb.rating}★ · ${RATING_INFO[pb.rating]?.label ?? ''}`
        : 'No lo juega',
      tooltipSubtitle: `Karma ${pb.karmaScore}`,
    };
  });
}

export const SessionPlayerAvatarRow: React.FC<{
  avatars: SessionTilePlayerAvatar[];
  size?: 'sm' | 'md';
  className?: string;
}> = ({ avatars, size = 'sm', className }) => {
  if (avatars.length === 0) return null;
  const sizeClass = size === 'md' ? 'w-6 h-6' : 'w-5 h-5';

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {avatars.map((p) => (
        <Tooltip key={p.userId}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${p.displayName}: ${p.tooltipTitle}`}
              className="rounded-full focus:outline-none cursor-default shrink-0"
            >
              <img
                src={p.avatarUrl}
                alt={p.displayName}
                className={cn(
                  sizeClass,
                  'rounded-full object-cover border border-background',
                  p.ringClass,
                  p.dimmed && 'opacity-45 grayscale-[35%]'
                )}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[230px] text-[11px] space-y-0.5">
            <div className="font-semibold text-foreground">{p.displayName}</div>
            <div className="text-warning font-medium">{p.tooltipTitle}</div>
            {p.tooltipSubtitle && (
              <div className="text-[10px] text-muted-foreground">{p.tooltipSubtitle}</div>
            )}
            {p.tooltipDetails && p.tooltipDetails.length > 0 && (
              <div className="text-[10px] text-muted-foreground pt-0.5 border-t border-border/60">
                {p.tooltipDetails.join(' · ')}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
};

export const SessionGameTile: React.FC<SessionGameTileProps> = ({
  name,
  coverUrl,
  score,
  rank,
  isSelected = false,
  muted = false,
  statusPill,
  infoContent,
  playerAvatars,
  actionLabel,
  actionIcon,
  actionVariant = 'secondary',
  onAction,
}) => {
  const resolvedCoverUrl = getSafeCoverUrl(coverUrl);

  return (
    <div
      className={cn(
        'group rounded-md border transition-all duration-150 flex flex-col overflow-hidden',
        isSelected
          ? 'ring-2 ring-success border-success bg-success/10'
          : muted
            ? 'border-border/70 bg-background/40 opacity-85 hover:opacity-100'
            : 'border-border bg-card/55 hover:border-primary/50'
      )}
    >
      {/* Recycled Two-Layer Steam 460x215 Cover Composition */}
      <div className="relative w-full aspect-[460/215] overflow-hidden bg-background">
        <img
          src={resolvedCoverUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-md saturate-150"
        />
        <img
          src={resolvedCoverUrl}
          alt={name}
          loading="lazy"
          draggable={false}
          onError={handleImageFallback}
          className="relative z-10 h-full w-full object-contain transition-transform duration-300 ease-out group-hover:scale-[1.03] select-none"
        />

        {/* Top-left: Score & Rank/Status */}
        <div className="absolute top-1.5 left-1.5 z-20 flex items-center gap-1">
          {rank !== undefined && (
            <span className="px-1.5 py-0.5 rounded bg-background/85 backdrop-blur-sm border border-border text-[10px] font-mono font-bold text-foreground">
              #{rank}
            </span>
          )}
          <span
            className={cn(
              'px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold shadow-sm',
              getScorePillClasses(score)
            )}
          >
            {score}%
          </span>
          {statusPill && (
            <span className="px-1.5 py-0.5 rounded bg-background/85 backdrop-blur-sm border border-border text-[9px] font-medium text-muted-foreground">
              {statusPill}
            </span>
          )}
        </div>

        {/* Top-right: Info Hover Button */}
        <div className="absolute top-1.5 right-1.5 z-20">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Detalles de ${name}`}
                className="w-6 h-6 rounded-full bg-background/85 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground hover:border-primary/60 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Info className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px] p-2.5 text-[11px] space-y-1.5">
              {infoContent}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Compact Body: Title + Action + Player Avatar Circles */}
      <div className="p-2 space-y-1.5 flex-1 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-foreground truncate" title={name}>
            {name}
          </span>

          {onAction && actionLabel && (
            <Button
              type="button"
              size="xs"
              variant={isSelected ? 'emerald' : actionVariant}
              onClick={onAction}
              className="h-6 px-2 text-[10px] shrink-0"
            >
              {actionIcon}
              <span>{actionLabel}</span>
            </Button>
          )}
        </div>

        {/* Player Circular Avatars Only (ring color = affinity, details on hover) */}
        <SessionPlayerAvatarRow
          avatars={playerAvatars}
          className="pt-1 border-t border-border/50"
        />
      </div>
    </div>
  );
};
