import React from 'react';
import {
  Game,
  GameSynchronyResult,
  GamingSession,
} from '@/types/domain';
import {
  SessionGameTile,
  SessionPlayerAvatarRow,
  buildPlayerAvatarsFromBreakdown,
} from './SessionGameTile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Dices,
  Flame,
  Gamepad2,
  Lock,
  PartyPopper,
  Play,
  RotateCw,
  Trophy,
  Users,
  X,
} from 'lucide-react';

function buildSynchronyInfoContent(item: GameSynchronyResult): React.ReactNode {
  const statusLabel =
    item.status === 'missing_owners'
      ? `Faltan dueños (${item.playersWhoPlayCount}/${item.totalParticipants})`
      : item.status === 'needs_more_players'
        ? `Requiere mín. ${item.game.minPlayers} jugadores`
        : item.status === 'split_required'
          ? `Máx. ${item.game.maxPlayers} por lobby (Sub-lobbies)`
          : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{item.game.name}</span>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
          {item.game.category}
        </Badge>
      </div>
      <div className="text-[10px] text-muted-foreground space-y-0.5">
        <div>
          👥 {item.game.minPlayers}–{item.game.maxPlayers} jug. · ~{item.game.averageDurationMins}m · ★{' '}
          {item.averageRating.toFixed(1)}
        </div>
        <div>
          {item.playersWhoPlayCount}/{item.totalParticipants} juegan · Peso{' '}
          {item.rouletteWeight.toLocaleString()}
          {item.dislikeCount > 0 ? ` · ${item.dislikeCount} veto(s)` : ''}
        </div>
      </div>
      {statusLabel && (
        <div className="text-[10px] font-medium text-warning">{statusLabel}</div>
      )}
      {item.game.description && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          {item.game.description}
        </p>
      )}
      {item.suggestedSubLobbies && item.suggestedSubLobbies.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-border/60">
          {item.suggestedSubLobbies.map((lobby) => (
            <div key={lobby.lobbyName} className="text-[10px]">
              <span className="font-semibold text-foreground">{lobby.lobbyName}: </span>
              <span className="text-muted-foreground">
                {lobby.players.map((pl) => pl.displayName).join(', ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface RouletteSynchronyBentoCardProps {
  sectionMode?: 'locked' | 'games';
  activeSession: GamingSession;
  activeGame: Game | null;
  participantsCount: number;
  perfectGames: GameSynchronyResult[];
  splitGames: GameSynchronyResult[];
  incompatibleGames: GameSynchronyResult[];
  isSpinningRoulette: boolean;
  slotReelGameName: string | null;
  rouletteWinnerBanner: Game | null;
  onSpinRoulette: () => void;
  onLockGame: (gameId: string) => void;
  onSelectGame?: (gameId: string) => void;
  chosenGameId?: string;
  onOpenGamesTab?: () => void;
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
  sectionMode = 'games',
  activeSession,
  activeGame,
  participantsCount,
  perfectGames,
  splitGames,
  incompatibleGames,
  isSpinningRoulette,
  slotReelGameName,
  rouletteWinnerBanner,
  onSpinRoulette,
  onLockGame,
  onSelectGame,
  chosenGameId,
  onOpenGamesTab,
}) => {
  const lockedGameIds =
    activeSession.selectedGameIds && activeSession.selectedGameIds.length > 0
      ? activeSession.selectedGameIds
      : activeSession.selectedGameId
        ? [activeSession.selectedGameId]
        : activeSession.rouletteWinnerGameId
          ? [activeSession.rouletteWinnerGameId]
          : [];

  const allSyncItems = [...perfectGames, ...splitGames, ...incompatibleGames];
  const activeGameId = lockedGameIds[0];
  const activeSync = allSyncItems.find((g) => g.game.id === activeGameId);

  const canSpin = participantsCount > 0 && perfectGames.length + splitGames.length > 0;
  const gridColsClass =
    sectionMode === 'games'
      ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5'
      : 'grid grid-cols-2 sm:grid-cols-3 gap-2';

  if (sectionMode === 'locked') {
    const lockedSyncItems = lockedGameIds
      .map((id) => allSyncItems.find((item) => item.game.id === id))
      .filter((item): item is GameSynchronyResult => Boolean(item));

    return (
      <Card className="cv-section flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-success/15 border border-success/40 flex items-center justify-center text-success shrink-0">
              <Lock className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <CardTitle className="truncate">Juegos Fijados</CardTitle>
            {lockedGameIds.length > 0 && (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {lockedGameIds.length}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenGamesTab && (
              <Button size="xs" variant="outline" onClick={onOpenGamesTab}>
                <Gamepad2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Todos los juegos</span>
              </Button>
            )}
            <Button
              size="xs"
              onClick={onSpinRoulette}
              disabled={isSpinningRoulette || lockedSyncItems.length === 0}
              title={
                lockedSyncItems.length === 0
                  ? 'Fijá al menos un juego para girar la ruleta'
                  : 'Sortear entre los juegos fijados'
              }
            >
              <Dices className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>{isSpinningRoulette ? 'Girando...' : 'Ruleta'}</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {isSpinningRoulette && (
            <div className="rounded-md border border-primary/70 bg-primary/10 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-primary truncate">
                {slotReelGameName || 'Sorteando...'}
              </span>
              <Badge variant="default" className="text-[10px]">
                Girando
              </Badge>
            </div>
          )}

          {!isSpinningRoulette &&
            (rouletteWinnerBanner || activeSession.rouletteWinnerGameId) &&
            (() => {
              const winnerGame =
                rouletteWinnerBanner ||
                allSyncItems.find((g) => g.game.id === activeSession.rouletteWinnerGameId)?.game;
              if (!winnerGame) return null;
              return (
                <div className="rounded-md border border-success/50 bg-success/15 px-3 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <PartyPopper className="w-4 h-4 text-success shrink-0" strokeWidth={1.75} />
                    <span className="text-xs font-semibold text-foreground truncate">
                      Salió: <span className="text-success">{winnerGame.name}</span>
                    </span>
                  </div>
                  <Badge variant="success" className="text-[10px] shrink-0">
                    Ganador
                  </Badge>
                </div>
              );
            })()}

          {lockedSyncItems.length === 0 ? (
            <div className="p-5 text-center rounded-md border border-dashed border-border bg-background/45 space-y-2.5">
              <p className="text-xs text-muted-foreground">Sin juegos fijados todavía.</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {perfectGames[0] && (
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => onLockGame(perfectGames[0].game.id)}
                  >
                    <Trophy className="w-3.5 h-3.5 text-warning" strokeWidth={1.75} />
                    <span>Fijar {perfectGames[0].game.name}</span>
                  </Button>
                )}
                {onOpenGamesTab && (
                  <Button size="xs" variant="outline" onClick={onOpenGamesTab}>
                    <Gamepad2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Ver juegos</span>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {lockedSyncItems.map((item) => {
                const isWinner =
                  rouletteWinnerBanner?.id === item.game.id ||
                  activeSession.rouletteWinnerGameId === item.game.id;
                const isChosen = chosenGameId === item.game.id;
                return (
                  <SessionGameTile
                    key={item.game.id}
                    name={item.game.name}
                    coverUrl={item.game.coverUrl}
                    score={item.synchronyScore}
                    isSelected
                    statusPill={isWinner ? 'Ruleta' : isChosen ? 'Elegido' : undefined}
                    infoContent={buildSynchronyInfoContent(item)}
                    playerAvatars={buildPlayerAvatarsFromBreakdown(item)}
                    secondaryActionIcon={<Play className="w-3 h-3" strokeWidth={2} />}
                    secondaryActionVariant={isChosen ? 'emerald' : 'outline'}
                    secondaryActionTitle={isChosen ? 'Juego elegido' : 'Elegir sin tirar ruleta'}
                    onSecondaryAction={onSelectGame ? () => onSelectGame(item.game.id) : undefined}
                    actionLabel="Quitar"
                    actionIcon={<X className="w-3 h-3" strokeWidth={2} />}
                    actionVariant="outline"
                    onAction={() => onLockGame(item.game.id)}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="cv-section flex flex-col">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
            <Gamepad2 className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <CardTitle>Juegos</CardTitle>
          {lockedGameIds.length > 0 && (
            <Badge variant="success" className="font-mono text-[10px]">
              {lockedGameIds.length} fijado{lockedGameIds.length === 1 ? '' : 's'}
            </Badge>
          )}
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

              <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
                {activeSync && (
                  <SessionPlayerAvatarRow
                    size="md"
                    avatars={buildPlayerAvatarsFromBreakdown(activeSync)}
                    className="sm:justify-end"
                  />
                )}
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

        {/* Sincronía / Otros Tabs (Sub-Lobbies removed) */}
        <Tabs defaultValue="perfect" className="w-full flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 h-auto">
            <TabsTrigger value="perfect" className="gap-1.5 text-xs py-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" strokeWidth={1.75} />
              <span>Sincronía ({perfectGames.length})</span>
            </TabsTrigger>
            <TabsTrigger value="incompatible" className="gap-1.5 text-xs py-1.5">
              <Ban className="w-3.5 h-3.5 text-destructive" strokeWidth={1.75} />
              <span>Otros ({incompatibleGames.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: PERFECT MATCH GAMES */}
          <TabsContent value="perfect" className="max-h-[540px] overflow-y-auto pr-1">
            {participantsCount === 0 ? (
              <div className="p-6 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground">
                Sin participantes.
              </div>
            ) : perfectGames.length === 0 ? (
              <div className="p-6 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground">
                Sin juegos compatibles para {participantsCount} jugadores.
              </div>
            ) : (
              <div className={gridColsClass}>
                {perfectGames.map((item, idx) => {
                  const isSelected = lockedGameIds.includes(item.game.id);
                  const isChosen = chosenGameId === item.game.id;
                  return (
                    <SessionGameTile
                      key={item.game.id}
                      name={item.game.name}
                      coverUrl={item.game.coverUrl}
                      score={item.synchronyScore}
                      rank={idx + 1}
                      isSelected={isSelected}
                      infoContent={buildSynchronyInfoContent(item)}
                      playerAvatars={buildPlayerAvatarsFromBreakdown(item)}
                      secondaryActionIcon={<Play className="w-3 h-3" strokeWidth={2} />}
                      secondaryActionVariant={isChosen ? 'emerald' : 'outline'}
                      secondaryActionTitle={isChosen ? 'Juego elegido' : 'Elegir sin tirar ruleta'}
                      onSecondaryAction={onSelectGame ? () => onSelectGame(item.game.id) : undefined}
                      actionLabel={isSelected ? 'Fijado' : 'Fijar'}
                      actionIcon={
                        isSelected ? (
                          <Check className="w-3 h-3" strokeWidth={2} />
                        ) : (
                          <Lock className="w-3 h-3" strokeWidth={1.75} />
                        )
                      }
                      onAction={() => onLockGame(item.game.id)}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB 2: INCOMPATIBLE GAMES */}
          <TabsContent value="incompatible" className="max-h-[540px] overflow-y-auto pr-1">
            {incompatibleGames.length === 0 ? (
              <div className="p-6 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground">
                Todos los juegos son compatibles.
              </div>
            ) : (
              <div className={gridColsClass}>
                {incompatibleGames.map((item) => {
                  const isSelected = lockedGameIds.includes(item.game.id);
                  const isChosen = chosenGameId === item.game.id;
                  const reasonPill =
                    item.status === 'missing_owners'
                      ? `${item.playersWhoPlayCount}/${item.totalParticipants}`
                      : item.status === 'needs_more_players'
                        ? `Mín ${item.game.minPlayers}p`
                        : `Máx ${item.game.maxPlayers}p`;
                  return (
                    <SessionGameTile
                      key={item.game.id}
                      name={item.game.name}
                      coverUrl={item.game.coverUrl}
                      score={item.synchronyScore}
                      isSelected={isSelected}
                      muted={!isSelected}
                      statusPill={reasonPill}
                      infoContent={buildSynchronyInfoContent(item)}
                      playerAvatars={buildPlayerAvatarsFromBreakdown(item)}
                      secondaryActionIcon={<Play className="w-3 h-3" strokeWidth={2} />}
                      secondaryActionVariant={isChosen ? 'emerald' : 'outline'}
                      secondaryActionTitle={isChosen ? 'Juego elegido' : 'Elegir sin tirar ruleta'}
                      onSecondaryAction={onSelectGame ? () => onSelectGame(item.game.id) : undefined}
                      actionLabel={isSelected ? 'Fijado' : 'Fijar'}
                      actionIcon={
                        isSelected ? (
                          <Check className="w-3 h-3" strokeWidth={2} />
                        ) : (
                          <Lock className="w-3 h-3" strokeWidth={1.75} />
                        )
                      }
                      onAction={() => onLockGame(item.game.id)}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
