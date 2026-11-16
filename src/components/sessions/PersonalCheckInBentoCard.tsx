import React from 'react';
import { PlayerProfile, PrecisionMinutes, SessionParticipant } from '@/types/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Check,
  Clock,
  LogOut,
  Timer,
} from 'lucide-react';

export interface PersonalCheckInBentoCardProps {
  currentUser: PlayerProfile;
  currentParticipant?: SessionParticipant;
  isConfirmed: boolean;
  joinFromTime: string;
  setJoinFromTime: (val: string) => void;
  joinUntilTime: string;
  setJoinUntilTime: (val: string) => void;
  joinPrecision: PrecisionMinutes;
  setJoinPrecision: (val: PrecisionMinutes) => void;
  joinNote: string;
  setJoinNote: (val: string) => void;
  calculatedStrictDeadline: string;
  onJoinOrUpdate: () => void;
  onLeaveSession: () => void;
  onConfirmAttendance: () => void;
}

const PRECISION_OPTIONS: Array<{
  val: PrecisionMinutes;
  label: string;
  sub: string;
  icon: string;
}> = [
  { val: 5, label: '±5m', sub: 'Suizo', icon: '⌚' },
  { val: 15, label: '±15m', sub: 'Normal', icon: '🫡' },
  { val: 30, label: '±30m', sub: 'Tibio', icon: '🐢' },
  { val: 60, label: '±60m', sub: 'Humo', icon: '💨' },
];

export const PersonalCheckInBentoCard: React.FC<PersonalCheckInBentoCardProps> = ({
  currentUser: _currentUser,
  currentParticipant,
  isConfirmed,
  joinFromTime,
  setJoinFromTime,
  joinUntilTime,
  setJoinUntilTime,
  joinPrecision,
  setJoinPrecision,
  joinNote,
  setJoinNote,
  calculatedStrictDeadline,
  onJoinOrUpdate,
  onLeaveSession,
  onConfirmAttendance,
}) => {
  return (
    <Card className="xl:col-span-5 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-success/15 border border-success/40 flex items-center justify-center text-success shrink-0">
            <Timer className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <CardTitle className="truncate">Mi Horario</CardTitle>
        </div>

        {currentParticipant && (
          <Badge variant={isConfirmed ? 'success' : 'warning'}>
            {isConfirmed ? 'Confirmado' : `Prob. ${currentParticipant.confidencePercentage ?? 75}%`}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-2.5">
        {/* Compact Schedule Limit & Confirm Bar */}
        <div className="px-2.5 py-2 rounded-md bg-background/45 border border-border flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-success shrink-0" strokeWidth={1.75} />
            <span>Límite</span>
            <strong className="font-mono text-foreground">{calculatedStrictDeadline}</strong>
          </span>

          {currentParticipant && !isConfirmed && (
            <Button
              type="button"
              size="xs"
              variant="emerald"
              onClick={onConfirmAttendance}
              title="Confirmar asistencia al 100%"
            >
              <Check className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Confirmar horario</span>
            </Button>
          )}
        </div>

        {/* Arrival / Departure */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="join-from-time" className="text-[11px] text-muted-foreground">
              Llegada
            </Label>
            <Input
              id="join-from-time"
              type="time"
              value={joinFromTime}
              onChange={(e) => setJoinFromTime(e.target.value)}
              className="font-mono h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="join-until-time" className="text-[11px] text-muted-foreground">
              Salida
            </Label>
            <Input
              id="join-until-time"
              type="time"
              value={joinUntilTime}
              onChange={(e) => setJoinUntilTime(e.target.value)}
              className="font-mono h-8 text-xs"
            />
          </div>
        </div>

        {/* Precision Margin Segmented Selector */}
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Tolerancia</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {PRECISION_OPTIONS.map((opt) => {
              const selected = joinPrecision === opt.val;
              return (
                <button
                  key={opt.val}
                  type="button"
                  title={`${opt.icon} ${opt.sub} (${opt.label})`}
                  onClick={() => setJoinPrecision(opt.val)}
                  className={cn(
                    'py-1.5 px-1.5 rounded-md border text-center transition-colors cursor-pointer flex items-center justify-center gap-1',
                    selected
                      ? 'bg-primary/15 border-primary text-foreground'
                      : 'bg-background/45 border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <span className="text-[11px] font-bold font-mono">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Note + Join / Update / Leave */}
        <div className="flex items-center gap-2 pt-0.5">
          <Input
            id="join-note"
            type="text"
            placeholder="Nota opcional..."
            aria-label="Nota opcional"
            value={joinNote}
            onChange={(e) => setJoinNote(e.target.value)}
            className="h-8 text-xs flex-1 min-w-0"
          />
          <Button type="button" size="sm" onClick={onJoinOrUpdate} className="shrink-0">
            <Check className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>{currentParticipant ? 'Actualizar' : 'Anotarme'}</span>
          </Button>
          {currentParticipant && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onLeaveSession}
              title="Salir de la sesión"
              aria-label="Salir de la sesión"
              className="h-8 w-8 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
