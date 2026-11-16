import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Clock, Zap } from 'lucide-react';

export interface InstantSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName?: string;
  onSubmit: (params: { startsInMinutes: number; title?: string }) => void;
}

const DELAY_PRESETS: Array<{ label: string; mins: number }> = [
  { label: 'Ahora', mins: 0 },
  { label: '15m', mins: 15 },
  { label: '30m', mins: 30 },
  { label: '45m', mins: 45 },
  { label: '1h', mins: 60 },
];

function formatFutureTime(offsetMinutes: number): string {
  const target = new Date(Date.now() + offsetMinutes * 60_000);
  const hh = String(target.getHours()).padStart(2, '0');
  const mm = String(target.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const InstantSessionModal: React.FC<InstantSessionModalProps> = ({
  open,
  onOpenChange,
  groupName,
  onSubmit,
}) => {
  const [startsInMinutes, setStartsInMinutes] = useState<number>(0);
  const [title, setTitle] = useState<string>('');

  useEffect(() => {
    if (open) {
      setStartsInMinutes(0);
      setTitle('');
    }
  }, [open]);

  const clampedDelay = Math.min(60, Math.max(0, Math.round(startsInMinutes)));
  const startClock = formatFutureTime(clampedDelay);

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      startsInMinutes: clampedDelay,
      title: title.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4 text-warning" strokeWidth={1.75} />
            <span>Convocar ahora</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {groupName ? `${groupName} · ` : ''}Máximo dentro de 60 minutos
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.75} />
                ¿Cuándo arrancamos?
              </span>
              <span className="font-mono text-primary font-semibold">
                {clampedDelay === 0 ? `Ahora (${startClock})` : `En ${clampedDelay}m (${startClock})`}
              </span>
            </Label>

            <div className="grid grid-cols-5 gap-1.5">
              {DELAY_PRESETS.map((preset) => (
                <button
                  key={preset.mins}
                  type="button"
                  onClick={() => setStartsInMinutes(preset.mins)}
                  className={cn(
                    'py-1.5 px-2 rounded-md border text-xs font-medium transition-colors cursor-pointer',
                    clampedDelay === preset.mins
                      ? 'bg-primary/20 border-primary text-foreground'
                      : 'bg-background/50 border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Input
                type="range"
                min={0}
                max={60}
                step={5}
                value={clampedDelay}
                onChange={(e) => setStartsInMinutes(Number(e.target.value) || 0)}
                className="h-2 cursor-pointer accent-primary"
                aria-label="Minutos hasta iniciar"
              />
              <Input
                type="number"
                min={0}
                max={60}
                value={clampedDelay}
                onChange={(e) =>
                  setStartsInMinutes(
                    Math.min(60, Math.max(0, Number(e.target.value) || 0))
                  )
                }
                className="w-16 h-8 text-xs font-mono text-center shrink-0"
              />
              <span className="text-xs text-muted-foreground shrink-0">min</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instant-session-title" className="text-xs">
              Título (opcional)
            </Label>
            <Input
              id="instant-session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                clampedDelay === 0
                  ? `⚡ Convocatoria Instantánea (${startClock})`
                  : `⚡ Convocatoria en ${clampedDelay}m (${startClock})`
              }
              className="h-8 text-xs"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">
              <Zap className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>
                {clampedDelay === 0 ? 'Convocar ya' : `Convocar en ${clampedDelay}m`}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
