import React from 'react';
import { Game, GameSynchronyResult } from '@/types/domain';
import { getSafeCoverUrl, handleImageFallback } from '@/components/catalog/sharedCatalogConstants';
import { resolveGameOfficialUrl } from '@/lib/tasteProfileEngine';
import {
  SessionPlayerAvatarRow,
  buildPlayerAvatarsFromBreakdown,
} from './SessionGameTile';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Clock,
  Dices,
  ExternalLink,
  MousePointerClick,
  Star,
  ThumbsDown,
  Users,
} from 'lucide-react';

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
  const officialUrl = resolveGameOfficialUrl({
    name: game.name,
    coverUrl: game.coverUrl,
    tags: game.tags,
    id: game.id,
  });
  const avatars = syncResult ? buildPlayerAvatarsFromBreakdown(syncResult) : [];

  return (
    <Card className="overflow-hidden border-success/40 bg-card/65">
      {/* Selected Game Header */}
      <div className="px-3.5 py-2 border-b border-border/60 bg-success/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-success shrink-0" strokeWidth={2} />
          <span className="text-xs font-bold uppercase tracking-wider text-success truncate">
            Juego Seleccionado
          </span>
        </div>

        <Badge
          variant={isRouletteWinner ? 'success' : 'secondary'}
          className="text-[10px] shrink-0"
          title={
            isRouletteWinner
              ? 'Seleccionado mediante la ruleta'
              : 'Seleccionado manualmente'
          }
        >
          {isRouletteWinner ? (
            <>
              <Dices className="w-3 h-3" strokeWidth={1.75} />
              <span>Por ruleta</span>
            </>
          ) : (
            <>
              <MousePointerClick className="w-3 h-3" strokeWidth={1.75} />
              <span>Manualmente</span>
            </>
          )}
        </Badge>
      </div>

      {/* Steam 460x215 Cover Header */}
      <div className="group/cover relative w-full aspect-[460/215] max-h-[155px] overflow-hidden bg-background">
        <a
          href={officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Ver página oficial de ${game.name}`}
          aria-label={`Ver página oficial de ${game.name}`}
          className="block h-full w-full cursor-pointer"
        >
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
        </a>

        <div className="pointer-events-none absolute top-2 left-2 z-20">
          <Badge variant="outline" className="text-[10px] bg-background/85 backdrop-blur-sm">
            {game.category}
          </Badge>
        </div>

        {syncResult && (
          <div className="pointer-events-none absolute top-2 right-2 z-20">
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

        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 right-2 z-20 inline-flex items-center justify-center w-6 h-6 rounded-md bg-background/85 backdrop-blur-sm border border-border text-muted-foreground opacity-75 group-hover/cover:opacity-100 group-hover/cover:text-foreground group-hover/cover:border-primary/60 transition-all"
        >
          <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
        </span>
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
