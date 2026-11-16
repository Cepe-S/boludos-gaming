import React from 'react';
import { Game, GameSynchronyResult } from '@/types/domain';
import { getSafeCoverUrl, handleImageFallback } from '@/components/catalog/sharedCatalogConstants';
import {
  SessionPlayerAvatarRow,
  buildPlayerAvatarsFromBreakdown,
} from './SessionGameTile';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Clock, Lock, PartyPopper, Star, ThumbsDown, Users } from 'lucide-react';

export interface SelectedSessionGameCardProps {
  game: Game;
  syncResult?: GameSynchronyResult;
  isRouletteWinner?: boolean;
}

export const SelectedSessionGameCard: React.FC<SelectedSessionGameCardProps> = ({
  game,
  syncResult,
  isRouletteWinner = false,
}) => {
  const resolvedCoverUrl = getSafeCoverUrl(game.coverUrl);
  const avatars = syncResult ? buildPlayerAvatarsFromBreakdown(syncResult) : [];

  return (
    <Card className="overflow-hidden border-success/40 bg-card/65">
      {/* Steam 460x215 Cover Header */}
      <div className="relative w-full aspect-[460/215] max-h-[155px] overflow-hidden bg-background">
        <img
          src={resolvedCoverUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-md saturate-150"
        />
        <img
          src={resolvedCoverUrl}
          alt={game.name}
          draggable={false}
          onError={handleImageFallback}
          className="relative z-10 h-full w-full object-contain select-none"
        />

        <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5">
          <Badge variant={isRouletteWinner ? 'success' : 'default'} className="text-[10px] shadow-sm">
            {isRouletteWinner ? (
              <>
                <PartyPopper className="w-3 h-3" strokeWidth={1.75} />
                <span>Ganador Ruleta</span>
              </>
            ) : (
              <>
                <Lock className="w-3 h-3" strokeWidth={1.75} />
                <span>Juego Elegido</span>
              </>
            )}
          </Badge>
          <Badge variant="outline" className="text-[10px] bg-background/85 backdrop-blur-sm">
            {game.category}
          </Badge>
        </div>

        {syncResult && (
          <div className="absolute top-2 right-2 z-20">
            <span
              className={cn(
                'px-2 py-0.5 rounded border text-xs font-mono font-bold shadow-sm',
                syncResult.synchronyScore >= 75
                  ? 'bg-success/90 text-success-foreground border-success'
                  : syncResult.synchronyScore >= 55
                    ? 'bg-primary/90 text-primary-foreground border-primary'
                    : 'bg-warning/90 text-background border-warning'
              )}
            >
              {syncResult.synchronyScore}%
            </span>
          </div>
        )}
      </div>

      <CardContent className="p-3.5 space-y-2.5">
        <div className="space-y-1">
          <h3 className="text-sm sm:text-base font-bold text-foreground leading-tight">
            {game.name}
          </h3>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
              {game.minPlayers}–{game.maxPlayers} jug.
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
              ~{game.averageDurationMins}m
            </span>
            {syncResult && (
              <>
                <span className="inline-flex items-center gap-1 text-warning font-medium">
                  <Star className="w-3.5 h-3.5 fill-warning text-warning" strokeWidth={1.75} />
                  {syncResult.averageRating.toFixed(1)}
                </span>
                <span>
                  {syncResult.playersWhoPlayCount}/{syncResult.totalParticipants} juegan
                </span>
                {syncResult.dislikeCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-destructive font-medium">
                    <ThumbsDown className="w-3 h-3" strokeWidth={1.75} />
                    {syncResult.dislikeCount} veto(s)
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {game.description && (
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
            {game.description}
          </p>
        )}

        {game.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {game.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/70 border border-border text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {avatars.length > 0 && (
          <div className="pt-2 border-t border-border/60">
            <SessionPlayerAvatarRow avatars={avatars} size="md" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
