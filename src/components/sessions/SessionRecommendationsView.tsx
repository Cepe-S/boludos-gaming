import React from 'react';
import { GroupGameRecommendation } from '@/types/domain';
import { DEFAULT_RECOMMENDATION_COVER } from './GroupRecommendationCard';
import { getSafeCoverUrl, handleImageFallback } from '@/components/catalog/sharedCatalogConstants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Brain, Compass, Flame, Sparkles, Users } from 'lucide-react';

export interface SessionRecommendationsViewProps {
  recommendations: GroupGameRecommendation[];
  onImportRecommendation: (rec: GroupGameRecommendation) => void;
  title?: string;
  emptyMessage?: string;
  actionLabel?: string;
}

export const SessionRecommendationsView: React.FC<SessionRecommendationsViewProps> = ({
  recommendations,
  onImportRecommendation,
  title = 'Descubrimiento para el Grupo',
  emptyMessage = 'No hay recomendaciones nuevas sin agregar.',
  actionLabel = 'Importar y fijar',
}) => {
  return (
    <Card className="cv-section flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
            <Brain className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <CardTitle>{title}</CardTitle>
        </div>

        <Badge variant="outline" className="text-xs font-mono">
          {recommendations.length} nuevas
        </Badge>
      </CardHeader>

      <CardContent>
        {recommendations.length === 0 ? (
          <div className="p-8 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground flex flex-col items-center gap-2">
            <Compass className="w-6 h-6 text-muted-foreground/70" strokeWidth={1.5} />
            <span>{emptyMessage}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {recommendations.map((rec) => {
              const coverUrl = getSafeCoverUrl(rec.coverUrl || DEFAULT_RECOMMENDATION_COVER);
              const scoreBadgeClass =
                rec.groupArithmeticScore >= 75
                  ? 'bg-success/90 text-success-foreground border-success'
                  : rec.groupArithmeticScore >= 55
                    ? 'bg-primary/90 text-primary-foreground border-primary'
                    : 'bg-warning/90 text-background border-warning';

              return (
                <div
                  key={rec.id}
                  className="group rounded-lg border border-border bg-background/45 hover:border-primary/45 transition-colors overflow-hidden flex flex-col"
                >
                  {/* Wide Steam-style Cover */}
                  <div className="relative w-full aspect-[460/215] overflow-hidden bg-background shrink-0">
                    <img
                      src={coverUrl}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-md saturate-150"
                    />
                    <img
                      src={coverUrl}
                      alt={rec.name}
                      draggable={false}
                      onError={handleImageFallback}
                      className="relative z-10 h-full w-full object-contain select-none"
                    />

                    <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] bg-background/85 backdrop-blur-sm">
                        {rec.category}
                      </Badge>
                    </div>

                    <div className="absolute top-2 right-2 z-20">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded border text-xs font-mono font-bold shadow-sm',
                          scoreBadgeClass
                        )}
                        title={`Afinidad grupal: ${rec.groupArithmeticScore}%`}
                      >
                        {rec.groupArithmeticScore}% match
                      </span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-3.5 flex-1 flex flex-col gap-3">
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-bold text-foreground leading-tight">
                          {rec.name}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
                          {rec.minPlayers}–{rec.maxPlayers} jug.
                        </span>
                      </div>
                    </div>

                    {rec.sharedDimensions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {rec.sharedDimensions.slice(0, 4).map((dim) => (
                          <Badge key={dim} variant="purple" className="text-[10px] px-1.5 py-0">
                            {dim}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {rec.explanation && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {rec.explanation}
                      </p>
                    )}

                    {/* Per-player affinity breakdown */}
                    {rec.playerBreakdowns.length > 0 && (
                      <div className="pt-2 border-t border-border/60 space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          {rec.playerBreakdowns.map((b) => {
                            const pillClass = b.burnedOut
                              ? 'border-destructive/40 bg-destructive/10 text-destructive'
                              : b.affinityScore >= 75
                                ? 'border-success/40 bg-success/10 text-success'
                                : b.affinityScore >= 55
                                  ? 'border-primary/40 bg-primary/10 text-primary'
                                  : 'border-warning/40 bg-warning/10 text-warning';

                            return (
                              <div
                                key={b.userId}
                                title={
                                  b.matchingReasons.length > 0
                                    ? `${b.displayName}: ${b.matchingReasons.join(' · ')}`
                                    : `${b.displayName}: ${b.affinityScore}% afinidad`
                                }
                                className="flex items-center justify-between gap-1.5 px-2 py-1 rounded bg-background/60 border border-border/70 min-w-0"
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <img
                                    src={b.avatarUrl}
                                    alt={b.displayName}
                                    className={cn(
                                      'w-5 h-5 rounded-full object-cover shrink-0 border border-border',
                                      b.burnedOut && 'opacity-50 grayscale'
                                    )}
                                  />
                                  <span className="text-[11px] font-medium text-foreground truncate">
                                    {b.displayName}
                                  </span>
                                </div>
                                <span
                                  className={cn(
                                    'text-[10px] font-mono font-bold px-1.5 py-0 rounded border shrink-0 inline-flex items-center gap-0.5',
                                    pillClass
                                  )}
                                >
                                  {b.burnedOut && <Flame className="w-2.5 h-2.5" strokeWidth={2} />}
                                  {b.affinityScore}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="mt-auto pt-1">
                      <Button
                        size="sm"
                        className="w-full gap-1.5 text-xs"
                        onClick={() => onImportRecommendation(rec)}
                      >
                        <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span>{actionLabel}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
