import React from 'react';
import {
  Game,
  GameSynchronyResult,
  GamingSession,
  GroupGameRecommendation,
} from '@/types/domain';
import { GroupRecommendationsResult } from '@/lib/tasteProfileEngine';
import { GroupRecommendationCard } from './GroupRecommendationCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Ban,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Dices,
  Flame,
  Lock,
  PartyPopper,
  RotateCw,
  ShieldAlert,
  Sparkles,
  Split,
  Star,
  ThumbsDown,
  Trophy,
  Users,
} from 'lucide-react';

export interface RouletteSynchronyBentoCardProps {
  activeSession: GamingSession;
  activeGame: Game | null;
  participantsCount: number;
  perfectGames: GameSynchronyResult[];
  splitGames: GameSynchronyResult[];
  incompatibleGames: GameSynchronyResult[];
  sessionRecommendations: GroupRecommendationsResult;
  isSpinningRoulette: boolean;
  slotReelGameName: string | null;
  rouletteWinnerBanner: Game | null;
  onSpinRoulette: () => void;
  onLockGame: (gameId: string) => void;
  onSelectRecommendation: (rec: GroupGameRecommendation) => void;
}

const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80';

function getSynchronyColorClass(score: number): string {
  if (score >= 75) return 'text-success';
  if (score >= 55) return 'text-primary';
  return 'text-warning';
}

function getSynchronyBarClass(score: number): string {
  if (score >= 75) return 'bg-success';
  if (score >= 55) return 'bg-primary';
  return 'bg-warning';
}

export const RouletteSynchronyBentoCard: React.FC<RouletteSynchronyBentoCardProps> = ({
  activeSession,
  activeGame,
  participantsCount,
  perfectGames,
  splitGames,
  incompatibleGames,
  sessionRecommendations,
  isSpinningRoulette,
  slotReelGameName,
  rouletteWinnerBanner,
  onSpinRoulette,
  onLockGame,
  onSelectRecommendation,
}) => {
  const activeGameId = activeSession.selectedGameId || activeSession.rouletteWinnerGameId;
  const activeSync =
    perfectGames.find((g) => g.game.id === activeGameId) ||
    splitGames.find((g) => g.game.id === activeGameId) ||
    incompatibleGames.find((g) => g.game.id === activeGameId);

  const canSpin = participantsCount > 0 && perfectGames.length + splitGames.length > 0;

  return (
    <Card className="xl:col-span-7 cv-section flex flex-col">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
            <Dices className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <CardTitle>Ruleta &amp; Sincronía</CardTitle>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={activeSession.mode === 'random' ? 'default' : 'secondary'}>
            {activeSession.mode === 'random' ? 'Ruleta' : 'Fijo'}
          </Badge>
          <Button
            size="sm"
            onClick={onSpinRoulette}
            disabled={isSpinningRoulette || !canSpin}
          >
            {isSpinningRoulette ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                <span>Girando...</span>
              </>
            ) : (
              <>
                <Dices className="w-4 h-4" strokeWidth={1.75} />
                <span>Girar Ruleta</span>
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 flex flex-col">
        {/* Vibrant Roulette Spotlight Stage (confined to this widget per DESIGN.md) */}
        <div
          className={cn(
            'rounded-md border p-3.5 transition-colors',
            isSpinningRoulette
              ? 'bg-card/50 border-primary/70'
              : rouletteWinnerBanner
                ? 'bg-success/15 border-success/50'
                : activeGame
                  ? 'bg-background/45 border-border'
                  : 'bg-background/45 border-dashed border-border'
          )}
        >
          {isSpinningRoulette ? (
            <div className="flex items-center justify-between gap-4 py-1">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-md bg-primary/20 border border-primary/50 flex items-center justify-center text-primary shrink-0">
                  <Dices className="w-5 h-5 animate-spin" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary block">
                    Sorteando...
                  </span>
                  <p className="text-base sm:text-lg font-bold text-foreground truncate font-mono">
                    {slotReelGameName || '...'}
                  </p>
                </div>
              </div>
              <Badge variant="default" className="shrink-0 font-mono">
                {perfectGames.length + splitGames.length}
              </Badge>
            </div>
          ) : activeGame ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={activeGame.coverUrl || DEFAULT_COVER}
                  alt={activeGame.name}
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.src !== DEFAULT_COVER) img.src = DEFAULT_COVER;
                  }}
                  className="w-14 h-16 object-cover rounded border border-border shrink-0"
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {rouletteWinnerBanner?.id === activeGame.id ? (
                      <Badge variant="success" className="text-[10px]">
                        <PartyPopper className="w-3 h-3" strokeWidth={1.75} />
                        <span>Ganador</span>
                      </Badge>
                    ) : (
                      <Badge variant="default" className="text-[10px]">
                        <Lock className="w-3 h-3" strokeWidth={1.75} />
                        <span>Fijado</span>
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {activeGame.category}
                    </Badge>
                  </div>
                  <h4 className="text-sm sm:text-base font-bold text-foreground truncate">
                    {activeGame.name}
                  </h4>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {activeGame.minPlayers}–{activeGame.maxPlayers}p
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
                      ~{activeGame.averageDurationMins}m
                    </span>
                    {activeSync && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 font-semibold font-mono',
                          getSynchronyColorClass(activeSync.synchronyScore)
                        )}
                      >
                        <Flame className="w-3.5 h-3.5" strokeWidth={1.75} />
                        {activeSync.synchronyScore}% · ★{activeSync.averageRating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {activeSync?.suggestedSubLobbies && activeSync.suggestedSubLobbies.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                  {activeSync.suggestedSubLobbies.map((lobby) => (
                    <Badge
                      key={lobby.lobbyName}
                      variant={lobby.isWaitlist ? 'warning' : 'secondary'}
                      className="text-[10px]"
                    >
                      {lobby.lobbyName}: {lobby.players.map((p) => p.displayName).join(', ')}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1">
              <p className="text-xs font-medium text-muted-foreground">Sin juego fijado</p>
              {perfectGames[0] && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onLockGame(perfectGames[0].game.id)}
                >
                  <Trophy className="w-3.5 h-3.5 text-warning" strokeWidth={1.75} />
                  <span>Fijar {perfectGames[0].game.name}</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Synchrony / Sub-Lobbies / AI / Incompatibles Tabs */}
        <Tabs defaultValue="perfect" className="w-full flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
            <TabsTrigger value="perfect" className="gap-1.5 text-xs py-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" strokeWidth={1.75} />
              <span>Sincronía ({perfectGames.length})</span>
            </TabsTrigger>
            <TabsTrigger value="split" className="gap-1.5 text-xs py-1.5">
              <Split className="w-3.5 h-3.5 text-warning" strokeWidth={1.75} />
              <span>Sub-Lobbies ({splitGames.length})</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5 text-xs py-1.5">
              <Brain className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
              <span>IA ({sessionRecommendations.all.length})</span>
            </TabsTrigger>
            <TabsTrigger value="incompatible" className="gap-1.5 text-xs py-1.5">
              <Ban className="w-3.5 h-3.5 text-destructive" strokeWidth={1.75} />
              <span>Otros ({incompatibleGames.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: PERFECT MATCH GAMES */}
          <TabsContent value="perfect" className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {participantsCount === 0 ? (
              <div className="p-6 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground">
                Sin participantes.
              </div>
            ) : perfectGames.length === 0 ? (
              <div className="p-6 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground">
                Sin juegos compatibles para {participantsCount} jugadores.
              </div>
            ) : (
              perfectGames.map((item, idx) => {
                const isSelected = activeGameId === item.game.id;
                return (
                  <div
                    key={item.game.id}
                    className={cn(
                      'p-3 rounded-md border transition-colors space-y-2',
                      isSelected
                        ? 'bg-success/15 border-success/45'
                        : 'bg-background/45 border-border hover:border-primary/40'
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-mono font-bold text-muted-foreground w-5 shrink-0">
                          #{idx + 1}
                        </span>
                        <img
                          src={item.game.coverUrl || DEFAULT_COVER}
                          alt={item.game.name}
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (img.src !== DEFAULT_COVER) img.src = DEFAULT_COVER;
                          }}
                          className="w-10 h-11 object-cover rounded border border-border shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                              {item.game.name}
                            </span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {item.game.minPlayers}–{item.game.maxPlayers}p
                            </Badge>
                            {item.dislikeCount > 0 && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                <ThumbsDown className="w-2.5 h-2.5" strokeWidth={1.75} />
                                {item.dislikeCount} veto(s)
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                            <span className="inline-flex items-center gap-1 text-warning font-medium">
                              <Star className="w-3 h-3 fill-warning text-warning" strokeWidth={1.75} />
                              {item.averageRating.toFixed(1)}
                            </span>
                            <span>
                              {item.playersWhoPlayCount}/{item.totalParticipants} jug.
                            </span>
                            <span className="font-mono text-[10px]">
                              Peso: {item.rouletteWeight.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
                        <div className="text-right">
                          <span
                            className={cn(
                              'text-sm font-bold font-mono block leading-none',
                              getSynchronyColorClass(item.synchronyScore)
                            )}
                          >
                            {item.synchronyScore}%
                          </span>
                          <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden mt-1">
                            <div
                              className={cn('h-full rounded-full', getSynchronyBarClass(item.synchronyScore))}
                              style={{ width: `${Math.min(100, item.synchronyScore)}%` }}
                            />
                          </div>
                        </div>

                        <Button
                          size="xs"
                          variant={isSelected ? 'emerald' : 'secondary'}
                          onClick={() => onLockGame(item.game.id)}
                        >
                          {isSelected ? (
                            <>
                              <Check className="w-3 h-3" strokeWidth={2} />
                              <span>Fijado</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3 h-3" strokeWidth={1.75} />
                              <span>Fijar</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Player breakdown pills */}
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-border/60">
                      {item.playerBreakdowns.map((pb) => (
                        <span
                          key={pb.userId}
                          className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border',
                            !pb.plays
                              ? 'bg-destructive/10 border-destructive/30 text-destructive'
                              : pb.rating >= 4
                                ? 'bg-success/10 border-success/30 text-success'
                                : pb.rating === 1
                                  ? 'bg-warning/10 border-warning/30 text-warning'
                                  : 'bg-secondary/55 border-border text-muted-foreground'
                          )}
                        >
                          <span>{pb.displayName}:</span>
                          <span className="font-semibold">
                            {pb.plays ? `${pb.rating}★` : 'No juega'}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* TAB 2: SUB-LOBBIES / SPLIT GAMES */}
          <TabsContent value="split" className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {splitGames.length === 0 ? (
              <div className="p-6 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground">
                Sin sub-lobbies disponibles.
              </div>
            ) : (
              splitGames.map((item) => {
                const isSelected = activeGameId === item.game.id;
                return (
                  <div
                    key={item.game.id}
                    className={cn(
                      'p-3 rounded-md border space-y-2',
                      isSelected
                        ? 'bg-success/15 border-success/45'
                        : 'bg-background/45 border-border'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={item.game.coverUrl || DEFAULT_COVER}
                          alt={item.game.name}
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (img.src !== DEFAULT_COVER) img.src = DEFAULT_COVER;
                          }}
                          className="w-9 h-10 object-cover rounded border border-border shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                              {item.game.name}
                            </span>
                            <Badge variant="warning" className="text-[10px]">
                              Máx {item.game.maxPlayers}p
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            Sincronía {item.synchronyScore}%
                          </p>
                        </div>
                      </div>

                      <Button
                        size="xs"
                        variant={isSelected ? 'emerald' : 'secondary'}
                        onClick={() => onLockGame(item.game.id)}
                      >
                        {isSelected ? 'Fijado' : 'Fijar'}
                      </Button>
                    </div>

                    {item.suggestedSubLobbies && item.suggestedSubLobbies.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5 border-t border-border/60">
                        {item.suggestedSubLobbies.map((lobby) => (
                          <div
                            key={lobby.lobbyName}
                            className="p-2 rounded bg-card/50 border border-border text-[11px]"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-foreground">{lobby.lobbyName}</span>
                              <Badge
                                variant={lobby.isWaitlist ? 'warning' : 'success'}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {lobby.players.length} jug.
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {lobby.players.map((pl) => (
                                <span
                                  key={pl.id}
                                  className="px-1.5 py-0.5 rounded bg-secondary/55 border border-border text-[10px] text-muted-foreground"
                                >
                                  {pl.displayName} ({pl.karmaScore})
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* TAB 3: AI GROUP RECOMMENDATIONS (32D TASTE + STEAM + TOP 3 PODIUM + IGDB) */}
          <TabsContent value="ai" className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {sessionRecommendations.all.length === 0 ? (
              <div className="p-6 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground">
                Sin recomendaciones disponibles.
              </div>
            ) : (
              <>
                {sessionRecommendations.readyToPlay.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-success flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
                        En Catálogo ({sessionRecommendations.readyToPlay.length})
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {sessionRecommendations.readyToPlay.map((rec) => {
                        const isLocked =
                          !!rec.catalogGameId && rec.catalogGameId === activeGameId;
                        return (
                          <GroupRecommendationCard
                            key={rec.id}
                            recommendation={rec}
                            compact
                            isSelectedOrLocked={isLocked}
                            selectedBadgeLabel="Fijado"
                            actionLabel={isLocked ? 'Fijado' : 'Fijar'}
                            actionIcon={
                              isLocked ? (
                                <Check className="w-3.5 h-3.5" strokeWidth={2} />
                              ) : (
                                <Lock className="w-3.5 h-3.5" strokeWidth={1.75} />
                              )
                            }
                            actionVariant={isLocked ? 'emerald' : 'secondary'}
                            onAction={onSelectRecommendation}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {sessionRecommendations.discovery.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Descubrimiento ({sessionRecommendations.discovery.length})
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {sessionRecommendations.discovery.map((rec) => (
                        <GroupRecommendationCard
                          key={rec.id}
                          recommendation={rec}
                          compact
                          actionLabel="Importar"
                          actionIcon={<Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />}
                          actionVariant="default"
                          onAction={onSelectRecommendation}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* TAB 4: INCOMPATIBLE GAMES */}
          <TabsContent value="incompatible" className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {incompatibleGames.length === 0 ? (
              <div className="p-6 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground">
                Todos los juegos son compatibles.
              </div>
            ) : (
              incompatibleGames.map((item) => (
                <div
                  key={item.game.id}
                  className="p-2.5 rounded-md border border-border bg-background/45 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ShieldAlert className="w-4 h-4 text-destructive shrink-0" strokeWidth={1.75} />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-foreground truncate block">
                        {item.game.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {item.status === 'missing_owners'
                          ? `Faltan dueños (${item.playersWhoPlayCount}/${item.totalParticipants})`
                          : item.status === 'needs_more_players'
                            ? `Mín. ${item.game.minPlayers} jug.`
                            : `Máx. ${item.game.maxPlayers} jug.`}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                    {item.synchronyScore}%
                  </Badge>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
