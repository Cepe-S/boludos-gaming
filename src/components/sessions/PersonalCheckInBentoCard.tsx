import React from 'react';
import { PlayerProfile, PrecisionMinutes, SessionParticipant } from '@/types/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Ghost,
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
  onCheckIn: () => void;
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
  onCheckIn,
}) => {
  const checkedIn =
    currentParticipant?.attendanceStatus === 'on_time' ||
    currentParticipant?.attendanceStatus === 'late';

  return (
    <Card className="flex flex-col justify-between">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-success/15 border border-success/40 flex items-center justify-center text-success shrink-0">
            <Timer className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <CardTitle className="truncate">Check-in &amp; Horario</CardTitle>
        </div>

        {currentParticipant && (
          <Badge variant={isConfirmed ? 'success' : 'warning'}>
            {isConfirmed ? 'Confirmado' : 'Probable'}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-3.5">
        {/* Check-in Box First for Immediate Access */}
        {checkedIn && currentParticipant ? (
          <div className="p-3 rounded-md bg-success/15 border border-success/40 flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-success/20 text-success flex items-center justify-center shrink-0">
              <Check className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="min-w-0 text-xs">
              <p className="font-semibold text-success">
                Check-in {currentParticipant.checkedInAt}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {currentParticipant.attendanceStatus === 'on_time'
                  ? 'En hora (+5 Karma)'
                  : 'Tarde (-10 Karma)'}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-md bg-background/45 border border-border space-y-2.5">
            {currentParticipant && !isConfirmed && (
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
                <span className="text-[11px] text-warning font-medium">
                  Auto ({currentParticipant.confidencePercentage ?? 75}%)
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="emerald"
                  onClick={onConfirmAttendance}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Confirmar</span>
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-success" strokeWidth={1.75} />
                <span>Límite:</span>
              </span>
              <strong className="font-mono text-foreground">{calculatedStrictDeadline}</strong>
            </div>

            <Button
              type="button"
              variant="emerald"
              className="w-full"
              disabled={!currentParticipant}
              onClick={onCheckIn}
              title={!currentParticipant ? 'Anotate primero para hacer check-in' : 'Registrar check-in'}
            >
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
              <span>Check-in</span>
            </Button>
          </div>
        )}

        {/* Arrival / Departure */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <Label htmlFor="join-from-time" className="text-[11px] text-muted-foreground">
              Llegada
            </Label>
            <Input
              id="join-from-time"
              type="time"
              value={joinFromTime}
              onChange={(e) => setJoinFromTime(e.target.value)}
              className="font-mono"
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
              className="font-mono"
            />
          </div>
        </div>

        {/* Precision Margin Segmented Selector */}
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Tolerancia</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {PRECISION_OPTIONS.map((opt) => {
              const selected = joinPrecision === opt.val;
              return (
                <button
                  key={opt.val}
                  type="button"
                  title={opt.sub}
                  onClick={() => setJoinPrecision(opt.val)}
                  className={cn(
                    'py-1.5 px-1 rounded-md border text-center transition-colors cursor-pointer flex flex-col items-center',
                    selected
                      ? 'bg-primary/15 border-primary text-foreground'
                      : 'bg-background/45 border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <span className="text-xs leading-none mb-0.5">{opt.icon}</span>
                  <span className="text-[11px] font-bold font-mono">{opt.label}</span>
                  <span className="text-[9px] opacity-80">{opt.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Note */}
        <Input
          id="join-note"
          type="text"
          placeholder="Nota opcional..."
          aria-label="Nota opcional"
          value={joinNote}
          onChange={(e) => setJoinNote(e.target.value)}
        />

        {/* Join / Update / Leave */}
        <div className="flex items-center gap-2">
          <Button type="button" onClick={onJoinOrUpdate} className="flex-1">
            <Check className="w-4 h-4" strokeWidth={1.75} />
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
              className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          )}
        </div>

        {/* Karma Rules Strip */}
        <div className="pt-2 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Award className="w-3 h-3 text-success" strokeWidth={1.75} />
            +5 Puntual
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-warning" strokeWidth={1.75} />
            -10 Tarde
          </span>
          <span className="flex items-center gap-1">
            <Ghost className="w-3 h-3 text-destructive" strokeWidth={1.75} />
            -25 Humo
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
