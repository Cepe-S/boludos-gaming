import React from 'react';
import { GroupGameRecommendation } from '@/types/domain';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

export const DEFAULT_RECOMMENDATION_COVER =
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80';

function getMatchScoreBadgeClasses(score: number): string {
  if (score >= 75) {
    return 'bg-success/15 text-success border-success/40';
  }
  if (score >= 55) {
    return 'bg-primary/15 text-primary border-primary/40';
  }
  return 'bg-warning/15 text-warning border-warning/40';
}

function getMatchScoreBarClasses(score: number): string {
  if (score >= 75) {
    return 'bg-success';
  }
  if (score >= 55) {
    return 'bg-primary';
  }
  return 'bg-warning';
}

export interface GroupRecommendationCardProps {
  recommendation: GroupGameRecommendation;
  isSelectedOrLocked?: boolean;
  selectedBadgeLabel?: string;
  actionLabel: string;
  actionIcon: React.ReactNode;
  actionVariant?: 'default' | 'secondary' | 'emerald' | 'outline';
  onAction: (rec: GroupGameRecommendation) => void;
  showTopReasonTag?: boolean;
  compact?: boolean;
}

export const GroupRecommendationCard: React.FC<GroupRecommendationCardProps> = ({
  recommendation,
  isSelectedOrLocked = false,
  selectedBadgeLabel,
  actionLabel,
  actionIcon,
  actionVariant = 'secondary',
  onAction,
  showTopReasonTag = false,
  compact = false,
}) => {
  return (
    <div
      className={cn(
        'rounded-md border transition-colors space-y-2.5',
        compact ? 'p-3' : 'p-3.5',
        isSelectedOrLocked
          ? 'bg-success/15 border-success/40'
          : 'bg-background/45 border-border hover:border-primary/40'
      )}
    >
      <div className="flex items-start gap-3">
        <img
          src={recommendation.coverUrl || DEFAULT_RECOMMENDATION_COVER}
          alt={recommendation.name}
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src !== DEFAULT_RECOMMENDATION_COVER) {
              img.src = DEFAULT_RECOMMENDATION_COVER;
            }
          }}
          className={cn(
            'object-cover rounded border border-border shrink-0',
            compact ? 'w-12 h-14' : 'w-14 h-16'
          )}
        />

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-semibold text-foreground truncate">
                {recommendation.name}
              </h4>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  👥 {recommendation.minPlayers}-{recommendation.maxPlayers}
                </Badge>
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  {recommendation.category}
                </Badge>
                {isSelectedOrLocked && selectedBadgeLabel && (
                  <Badge variant="success" className="text-[10px] px-1.5 py-0">
                    <Check className="w-2.5 h-2.5" strokeWidth={2} />
                    <span>{selectedBadgeLabel}</span>
                  </Badge>
                )}
              </div>
            </div>

            <span
              className={cn(
                'px-2 py-0.5 rounded border font-mono text-[11px] font-bold shrink-0',
                getMatchScoreBadgeClasses(recommendation.groupArithmeticScore)
              )}
            >
              {recommendation.groupArithmeticScore}%
            </span>
          </div>

          <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                getMatchScoreBarClasses(recommendation.groupArithmeticScore)
              )}
              style={{ width: `${recommendation.groupArithmeticScore}%` }}
            />
          </div>
        </div>
      </div>

      {recommendation.sharedDimensions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {recommendation.sharedDimensions.map((dim) => (
            <Badge key={dim} variant="purple" className="text-[10px] px-1.5 py-0">
              🧬 {dim}
            </Badge>
          ))}
        </div>
      )}

      {recommendation.explanation && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {recommendation.explanation}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border">
        {recommendation.playerBreakdowns.map((b) => {
          const topReason = b.matchingReasons[0];
          const tooltip =
            b.matchingReasons.length > 0
              ? `${b.displayName}: ${b.matchingReasons.join(' • ')}`
              : `${b.displayName}: ${b.affinityScore}% afinidad`;

          return (
            <div
              key={b.userId}
              title={tooltip}
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-medium',
                b.burnedOut
                  ? 'bg-destructive/15 border-destructive/40 text-destructive'
                  : b.affinityScore >= 75
                  ? 'bg-success/15 border-success/30 text-success'
                  : b.affinityScore >= 55
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-secondary/55 border-border text-muted-foreground'
              )}
            >
              <img
                src={b.avatarUrl}
                alt={b.displayName}
                className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
              />
              <span className="truncate max-w-[70px]">{b.displayName}</span>
              <span className="font-mono font-bold">{b.affinityScore}%</span>
              {b.burnedOut && (
                <span className="text-[9px] text-destructive font-bold">🔥 Quemado</span>
              )}
              {showTopReasonTag && !b.burnedOut && topReason && (
                <span className="hidden sm:inline text-[9px] text-muted-foreground truncate max-w-[120px] border-l border-border pl-1.5">
                  {topReason}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-1 flex justify-end">
        <Button
          type="button"
          size="xs"
          variant={isSelectedOrLocked ? 'emerald' : actionVariant}
          onClick={() => onAction(recommendation)}
        >
          {actionIcon}
          <span>{actionLabel}</span>
        </Button>
      </div>
    </div>
  );
};
