import React from 'react';
import { GroupGameRecommendation } from '@/types/domain';
import { SessionGameTile, SessionTilePlayerAvatar } from './SessionGameTile';
import { Badge } from '@/components/ui/badge';
import { Dna, Flame, Users } from 'lucide-react';

export const DEFAULT_RECOMMENDATION_COVER =
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80';

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
}) => {
  const playerAvatars: SessionTilePlayerAvatar[] = recommendation.playerBreakdowns.map((b) => {
    const ringClass = b.burnedOut
      ? 'ring-2 ring-destructive'
      : b.affinityScore >= 75
        ? 'ring-2 ring-success'
        : b.affinityScore >= 55
          ? 'ring-2 ring-primary'
          : 'ring-2 ring-warning';

    return {
      userId: b.userId,
      displayName: b.displayName,
      avatarUrl: b.avatarUrl,
      ringClass,
      dimmed: b.burnedOut,
      tooltipTitle: `${b.affinityScore}% afinidad${b.burnedOut ? ' · Quemado' : ''}`,
      tooltipDetails: b.matchingReasons.length > 0 ? b.matchingReasons : undefined,
    };
  });

  const burnedOutCount = recommendation.playerBreakdowns.filter((b) => b.burnedOut).length;

  const infoContent = (
    <div className="space-y-1.5">
      <span className="font-semibold text-foreground block">
        {recommendation.name}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
          {recommendation.category}
        </Badge>
        <Badge
          variant="outline"
          className="text-[9px] px-1.5 py-0 font-mono inline-flex items-center gap-1"
        >
          <span>{recommendation.releaseYear ?? 2024}</span>
          <span>·</span>
          <Users className="w-2.5 h-2.5 shrink-0" strokeWidth={1.75} />
          <span>
            {recommendation.minPlayers}–{recommendation.maxPlayers}j
          </span>
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span className="font-mono font-semibold text-foreground">
          {recommendation.groupArithmeticScore}% afinidad
        </span>
        {burnedOutCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-destructive">
            <Flame className="w-3 h-3 shrink-0" strokeWidth={1.75} />
            {burnedOutCount} quemado(s)
          </span>
        )}
      </div>
      {recommendation.sharedDimensions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {recommendation.sharedDimensions.map((dim) => (
            <Badge key={dim} variant="purple" className="text-[9px] px-1.5 py-0">
              <Dna className="w-3 h-3 shrink-0" strokeWidth={1.75} />
              <span>{dim}</span>
            </Badge>
          ))}
        </div>
      )}
      {recommendation.explanation && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {recommendation.explanation}
        </p>
      )}
    </div>
  );

  return (
    <SessionGameTile
      name={recommendation.name}
      coverUrl={recommendation.coverUrl || DEFAULT_RECOMMENDATION_COVER}
      steamAppId={recommendation.steamAppId}
      tags={recommendation.tags}
      gameId={recommendation.id}
      score={recommendation.groupArithmeticScore}
      isSelected={isSelectedOrLocked}
      statusPill={isSelectedOrLocked ? selectedBadgeLabel : undefined}
      infoContent={infoContent}
      playerAvatars={playerAvatars}
      actionLabel={actionLabel}
      actionIcon={actionIcon}
      actionVariant={actionVariant}
      onAction={() => onAction(recommendation)}
    />
  );
};
