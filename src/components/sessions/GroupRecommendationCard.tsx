import React from 'react';
import { GroupGameRecommendation } from '@/types/domain';
import { SessionGameTile, SessionTilePlayerAvatar } from './SessionGameTile';
import { Badge } from '@/components/ui/badge';

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
      tooltipTitle: `${b.affinityScore}% afinidad${b.burnedOut ? ' · 🔥 Quemado' : ''}`,
      tooltipDetails: b.matchingReasons.length > 0 ? b.matchingReasons : undefined,
    };
  });

  const infoContent = (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{recommendation.name}</span>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
          {recommendation.category}
        </Badge>
      </div>
      <div className="text-[10px] text-muted-foreground">
        👥 {recommendation.minPlayers}–{recommendation.maxPlayers} jug. · {recommendation.groupArithmeticScore}% match
      </div>
      {recommendation.sharedDimensions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {recommendation.sharedDimensions.map((dim) => (
            <Badge key={dim} variant="purple" className="text-[9px] px-1.5 py-0">
              🧬 {dim}
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
