import React, { useEffect, useState } from 'react';
import {
  Game,
  GameRating,
  PlayerProfile,
  UserGamePreference,
} from '@/types/domain';
import { normalizeGameName } from '@/lib/tasteProfileEngine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { BookPlus, Clock, Star } from 'lucide-react';

export interface GroupLibraryModalProps {
  game: Game | null;
  currentUser: PlayerProfile;
  existingPref?: UserGamePreference;
  onClose: () => void;
  onSave: (params: {
    game: Game;
    rating: GameRating;
    hoursPlayed: number;
    recentHoursPlayed: number;
    steamAppId: number | null;
  }) => void;
}

export const GroupLibraryModal: React.FC<GroupLibraryModalProps> = ({
  game,
  currentUser,
  existingPref,
  onClose,
  onSave,
}) => {
  const [rating, setRating] = useState<GameRating>(4);
  const [hours, setHours] = useState<string>('0');
  const [recentHours, setRecentHours] = useState<string>('0');
  const [steamAppId, setSteamAppId] = useState<number | null>(null);
  const [steamDetectedHours, setSteamDetectedHours] = useState<number | null>(null);

  useEffect(() => {
    if (!game) return;
    const normalizedTarget = normalizeGameName(game.name);
    const steamMatch = currentUser.steamProfile?.ownedGames.find(
      (sg) => normalizeGameName(sg.name) === normalizedTarget
    );

    const steamTotal = steamMatch
      ? Math.round((steamMatch.manualHoursOverride ?? steamMatch.playtimeHours) * 10) / 10
      : null;
    const steamRecent = steamMatch
      ? Math.round(
          (steamMatch.manualRecentHoursOverride ?? steamMatch.playtimeRecentHours) * 10
        ) / 10
      : null;

    setRating(existingPref?.rating ?? steamMatch?.userRating ?? 4);
    const initialHours =
      existingPref?.hoursPlayed !== undefined && existingPref.hoursPlayed > 0
        ? existingPref.hoursPlayed
        : steamTotal ?? 0;
    const initialRecent =
      existingPref?.recentHoursPlayed !== undefined && existingPref.recentHoursPlayed > 0
        ? existingPref.recentHoursPlayed
        : steamRecent ?? 0;

    setHours(String(initialHours));
    setRecentHours(String(initialRecent));
    setSteamAppId(steamMatch?.appId ?? null);
    setSteamDetectedHours(steamTotal);
  }, [game, existingPref, currentUser.steamProfile]);

  const handleSave = () => {
    if (!game) return;
    onSave({
      game,
      rating,
      hoursPlayed: Math.max(0, Number(hours) || 0),
      recentHoursPlayed: Math.max(0, Number(recentHours) || 0),
      steamAppId,
    });
  };

  return (
    <Dialog
      open={game !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookPlus className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <span>Agregar a mi librería</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {game?.name} · {game?.category}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {steamDetectedHours !== null && (
            <div className="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 flex items-center justify-between gap-2">
              <span>Detectado en tu cuenta de Steam</span>
              <span className="font-mono font-semibold">{steamDetectedHours}h</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground block">
              Puntaje (1–5★)
            </label>
            <div className="flex items-center gap-1.5">
              {([1, 2, 3, 4, 5] as GameRating[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRating(r)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer',
                    rating >= r
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-background/50 border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Star
                    className={cn(
                      'w-3.5 h-3.5',
                      rating >= r ? 'fill-amber-400 text-amber-400' : ''
                    )}
                    strokeWidth={1.75}
                  />
                  <span>{r}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.75} />
                <span>Horas totales</span>
              </label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.75} />
                <span>Últimas 2 sem. (opc.)</span>
              </label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={recentHours}
                onChange={(e) => setRecentHours(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave}>
            Guardar en librería
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
