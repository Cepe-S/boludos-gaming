import React, { useState } from 'react';
import { GameRating, UnifiedSelectorGame } from '@/types/domain';
import { RATING_INFO, getSafeCoverUrl } from './sharedCatalogConstants';
import { cn } from '@/lib/utils';
import { Check, Plus, Star, X } from 'lucide-react';

export interface GameCompactTileProps {
  game: UnifiedSelectorGame;
  podiumRank?: { type: 'mp' | 'sp'; rank: 1 | 2 | 3 } | null;
  draggable?: boolean;
  onDragStartGame?: (
    game: UnifiedSelectorGame,
    e: React.DragEvent<HTMLDivElement>
  ) => void;
  onTogglePlay: (game: UnifiedSelectorGame) => void;
  onRemoveSelected?: (game: UnifiedSelectorGame) => void;
  onSetRating: (game: UnifiedSelectorGame, rating: GameRating) => void;
  onSetHours: (game: UnifiedSelectorGame, hours: number) => void;
  onToggleBurnedOut?: (game: UnifiedSelectorGame) => void;
  onFallbackImage: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

const HOUR_DELTAS = [1, 10, 100, 500] as const;

export const GameCompactTile: React.FC<GameCompactTileProps> = ({
  game,
  podiumRank,
  draggable = true,
  onDragStartGame,
  onTogglePlay,
  onRemoveSelected,
  onSetRating,
  onSetHours,
  onFallbackImage,
}) => {
  const [isEditingHours, setIsEditingHours] = useState(false);
  const [draftHours, setDraftHours] = useState('');

  const isPlayed = game.isPlayedOrRatedByUser;
  const hasSteamHours = Boolean(game.ownedOnSteam && game.playtimeHours > 0);
  const resolvedCoverUrl = getSafeCoverUrl(game.coverUrl);

  const openHoursEditor = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftHours(String(Math.round(game.playtimeHours || 0)));
    setIsEditingHours(true);
  };

  const commitHours = () => {
    onSetHours(game, Math.max(0, Number(draftHours) || 0));
    setIsEditingHours(false);
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData(
      'application/x-boludos-game',
      JSON.stringify({
        key: game.key,
        name: game.name,
        coverUrl: game.coverUrl,
        hoursPlayed: game.playtimeHours,
      })
    );
    onDragStartGame?.(game, e);
  };

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      className={cn(
        'group rounded-md border transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.98]',
        draggable && 'cursor-grab active:cursor-grabbing',
        isPlayed
          ? 'ring-2 ring-success border-success bg-success/15 shadow-lg shadow-success/25'
          : 'border-border bg-card/55 backdrop-blur-sm hover:border-border'
      )}
    >
      {/* Two-layer Steam 460x215 Cover Composition */}
      <div className="relative w-full aspect-[460/215] overflow-hidden rounded-t-[calc(var(--radius)-1px)] bg-background">
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
          loading="lazy"
          draggable={false}
          onError={onFallbackImage}
          className="relative z-10 h-full w-full object-contain transition-transform duration-300 ease-out group-hover:scale-[1.03] select-none"
        />

        {/* Top-left: Selected Check / Plus + Podium Rank */}
        <div className="absolute top-1.5 left-1.5 z-20 flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isPlayed) {
                (onRemoveSelected || onTogglePlay)(game);
              } else {
                onTogglePlay(game);
              }
            }}
            title={isPlayed ? 'Quitar de seleccionados' : 'Marcar activo'}
            aria-label={
              isPlayed
                ? `Quitar ${game.name} de seleccionados`
                : `Marcar ${game.name} como activo`
            }
            className={cn(
              'rounded-md p-1 transition-all cursor-pointer flex items-center justify-center',
              isPlayed
                ? 'bg-success text-background font-bold shadow-md shadow-success/30 hover:bg-success'
                : 'bg-background/80 text-foreground hover:bg-primary hover:text-white border border-white/15'
            )}
          >
            {isPlayed ? (
              <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
            ) : (
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
          </button>

          {podiumRank && (
            <span className="h-5 px-1.5 rounded bg-warning/95 text-black text-[10px] font-bold inline-flex items-center shadow-sm">
              #{podiumRank.rank}
            </span>
          )}
        </div>

        {/* Top-right: X Deselect (when selected) */}
        {isPlayed && (
          <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                (onRemoveSelected || onTogglePlay)(game);
              }}
              title="Quitar de seleccionados"
              aria-label={`Quitar ${game.name} de seleccionados`}
              className="bg-background/85 text-destructive hover:bg-destructive hover:text-white border border-destructive/40 rounded-md p-1 transition-all cursor-pointer flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>
        )}

        {/* Bottom Overlay: Game Title */}
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-2 py-1 pointer-events-none">
          <span className="text-[11px] font-semibold text-white truncate block">
            {game.name}
          </span>
        </div>
      </div>

      {/* Ultra-Compact Footer: 5 Stars + Smart Hours Control */}
      <div className="px-2 py-1 flex items-center justify-between gap-1 border-t border-border/60">
        <div className="flex items-center">
          {([1, 2, 3, 4, 5] as GameRating[]).map((star) => {
            const active = isPlayed && game.effectiveRating >= star;
            return (
              <button
                key={star}
                type="button"
                title={RATING_INFO[star].label}
                aria-label={RATING_INFO[star].label}
                onClick={(e) => {
                  e.stopPropagation();
                  onSetRating(game, star);
                }}
                className={cn(
                  'p-0.5 rounded transition-transform duration-150 hover:scale-125 cursor-pointer',
                  active
                    ? 'text-warning'
                    : 'text-muted-foreground/40 hover:text-warning'
                )}
              >
                <Star
                  className="w-3 h-3"
                  fill={active ? 'currentColor' : 'none'}
                  strokeWidth={1.75}
                />
              </button>
            );
          })}
        </div>

        {/* Hours Control */}
        <div className="shrink-0 flex items-center">
          {isEditingHours ? (
            <input
              type="number"
              min={0}
              max={25000}
              autoFocus
              value={draftHours}
              onChange={(e) => setDraftHours(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitHours}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitHours();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsEditingHours(false);
                }
              }}
              aria-label={`Horas en ${game.name}`}
              className="w-12 rounded border border-primary bg-background/45 px-1 py-0.5 text-[10px] font-mono text-right text-foreground focus:outline-none"
            />
          ) : hasSteamHours ? (
            <button
              type="button"
              onClick={openHoursEditor}
              title="Click para editar horas"
              aria-label={`Editar horas de ${game.name}`}
              className="px-1.5 py-0.5 rounded border border-border bg-card/90 text-[10px] font-mono text-foreground hover:border-primary/60 hover:text-white transition-colors cursor-pointer"
            >
              {Math.round(game.playtimeHours)}h
            </button>
          ) : (
            <div
              className={cn(
                'relative group/hours flex items-center',
                isPlayed
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 transition-opacity'
              )}
            >
              <button
                type="button"
                onClick={openHoursEditor}
                title="Click para editar horas"
                aria-label={`Editar horas de ${game.name}`}
                className="px-1.5 py-0.5 rounded border border-border bg-card/90 text-[10px] font-mono text-foreground hover:border-primary/60 hover:text-white transition-colors cursor-pointer"
              >
                {Math.round(game.playtimeHours || 0)}h
              </button>

              {/* Floating +1/+10/+100/+500 Hover Menu */}
              <div className="absolute bottom-full right-0 pb-1 z-40 opacity-0 pointer-events-none group-hover/hours:opacity-100 group-hover/hours:pointer-events-auto transition-opacity duration-150">
                <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/60 backdrop-blur-md p-1 shadow-xl backdrop-blur-md">
                  {HOUR_DELTAS.map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetHours(
                          game,
                          Math.round((game.playtimeHours || 0) + delta)
                        );
                      }}
                      title={`+${delta}h`}
                      aria-label={`Sumar ${delta} horas a ${game.name}`}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold text-foreground hover:bg-primary hover:text-white transition-colors cursor-pointer"
                    >
                      +{delta}
                    </button>
                  ))}
                  {(game.playtimeHours || 0) > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetHours(game, 0);
                      }}
                      title="Reiniciar horas"
                      aria-label={`Reiniciar horas de ${game.name}`}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold text-destructive hover:bg-destructive hover:text-white transition-colors cursor-pointer"
                    >
                      0
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
