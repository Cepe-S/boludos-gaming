import React, { useEffect, useState } from 'react';
import { GamingSession, InstantSessionRsvp, PlayerProfile } from '@/types/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, Users, XCircle, Zap } from 'lucide-react';

export interface InstantSessionRsvpCardProps {
  activeSession: GamingSession;
  currentUser: PlayerProfile;
  groupMembers: PlayerProfile[];
  onRespond: (params: {
    status: 'going' | 'declined';
    etaMinutes?: number;
    durationMinutes?: number;
  }) => void;
}

const ETA_PRESETS: Array<{ label: string; mins: number }> = [
  { label: 'Ahora', mins: 0 },
  { label: '10m', mins: 10 },
  { label: '15m', mins: 15 },
  { label: '30m', mins: 30 },
  { label: '45m', mins: 45 },
  { label: '1h', mins: 60 },
];

const DURATION_PRESETS: Array<{ label: string; mins: number | undefined }> = [
  { label: 'Sin límite', mins: undefined },
  { label: '1h', mins: 60 },
  { label: '1.5h', mins: 90 },
  { label: '2h', mins: 120 },
  { label: '3h', mins: 180 },
  { label: '4h', mins: 240 },
];

function formatClockWithOffset(offsetMinutes: number): string {
  const target = new Date(Date.now() + offsetMinutes * 60_000);
  const hh = String(target.getHours()).padStart(2, '0');
  const mm = String(target.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const InstantSessionRsvpCard: React.FC<InstantSessionRsvpCardProps> = ({
  activeSession,
  currentUser,
  groupMembers,
  onRespond,
}) => {
  const rsvps = activeSession.instantRsvps || [];
  const myRsvp = rsvps.find((r) => r.userId === currentUser.id);

  const [selectedStatus, setSelectedStatus] = useState<'going' | 'declined'>(
    myRsvp?.status || 'going'
  );
  const [etaMinutes, setEtaMinutes] = useState<number>(myRsvp?.etaMinutes ?? 0);
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(
    myRsvp?.durationMinutes
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const commitArrivalTime = formatClockWithOffset(etaMinutes);
  const commitEndTime =
    durationMinutes && durationMinutes > 0
      ? formatClockWithOffset(etaMinutes + durationMinutes)
      : null;

  useEffect(() => {
    if (myRsvp) {
      setSelectedStatus(myRsvp.status);
      if (myRsvp.etaMinutes !== undefined) setEtaMinutes(myRsvp.etaMinutes);
      setDurationMinutes(myRsvp.durationMinutes);
    } else {
      setSelectedStatus('going');
      setEtaMinutes(0);
      setDurationMinutes(undefined);
    }
  }, [activeSession.id, myRsvp]);

  const goingCount = rsvps.filter((r) => r.status === 'going').length;
  const declinedCount = rsvps.filter((r) => r.status === 'declined').length;

  const formatDurationLabel = (mins?: number) => {
    if (!mins) return 'Sin límite';
    const hrs = Math.round((mins / 60) * 10) / 10;
    return `${hrs}h`;
  };

  return (
    <Card className="xl:col-span-5 cv-section">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-warning/15 border border-warning/40 flex items-center justify-center text-warning shrink-0">
            <Zap className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <CardTitle>¿Estás para jugar?</CardTitle>
        </div>

        <div className="flex items-center gap-1.5">
          <Badge variant="success" className="text-[10px]">
            {goingCount} van
          </Badge>
          {declinedCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {declinedCount} no
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Going / Declined Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={selectedStatus === 'going' ? 'emerald' : 'outline'}
            onClick={() => setSelectedStatus('going')}
          >
            <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
            <span>¡Estoy!</span>
          </Button>

          <Button
            type="button"
            variant={selectedStatus === 'declined' ? 'destructive' : 'outline'}
            onClick={() => {
              setSelectedStatus('declined');
              onRespond({ status: 'declined' });
            }}
          >
            <XCircle className="w-4 h-4" strokeWidth={1.75} />
            <span>No puedo</span>
          </Button>
        </div>

        {selectedStatus === 'going' && (
          <div className="space-y-3 p-3 rounded-md bg-background/45 border border-border">
            <div className="space-y-1.5">
              <Label className="text-[11px] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                <span>¿En cuánto tiempo estás?</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {ETA_PRESETS.map((preset) => (
                  <button
                    key={preset.mins}
                    type="button"
                    onClick={() => setEtaMinutes(preset.mins)}
                    className={cn(
                      'px-2.5 py-1 rounded border text-xs font-medium transition-colors cursor-pointer',
                      etaMinutes === preset.mins
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card/50 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-auto">
                  <Input
                    type="number"
                    min={0}
                    max={360}
                    value={etaMinutes}
                    onChange={(e) => setEtaMinutes(Math.max(0, Number(e.target.value) || 0))}
                    className="w-16 h-7 text-xs px-2 text-center font-mono"
                    aria-label="Minutos hasta estar disponible"
                  />
                  <span className="text-[11px] text-muted-foreground">min</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">
                ¿Cuánto tiempo vas a jugar? (opcional)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((preset) => {
                  const isActive = durationMinutes === preset.mins;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setDurationMinutes(preset.mins)}
                      className={cn(
                        'px-2.5 py-1 rounded border text-xs font-medium transition-colors cursor-pointer',
                        isActive
                          ? 'bg-primary/20 text-foreground border-primary'
                          : 'bg-card/50 border-border text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-2.5 py-2 rounded bg-primary/10 border border-primary/30 text-xs text-foreground">
              Te comprometés a jugar desde las{' '}
              <strong className="font-mono text-primary">{commitArrivalTime}</strong>
              {commitEndTime ? (
                <>
                  {' '}hasta las{' '}
                  <strong className="font-mono text-primary">{commitEndTime}</strong>{' '}
                  <span className="text-muted-foreground">
                    ({formatDurationLabel(durationMinutes)})
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground"> (sin límite horario)</span>
              )}
            </div>

            <Button
              type="button"
              className="w-full"
              onClick={() => setShowConfirmModal(true)}
            >
              <Zap className="w-4 h-4" strokeWidth={1.75} />
              <span>{myRsvp?.status === 'going' ? 'Actualizar llegada' : 'Confirmar llegada'}</span>
            </Button>
          </div>
        )}

        {/* Group Members Instant Status Strip */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
              Respuestas del grupo
            </span>
            <span className="font-mono">
              {rsvps.length}/{groupMembers.length}
            </span>
          </div>

          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {groupMembers.map((member) => {
              const rsvp: InstantSessionRsvp | undefined = rsvps.find(
                (r) => r.userId === member.id
              );
              const participant = activeSession.participants.find(
                (p) => p.userId === member.id
              );
              return (
                <div
                  key={member.id}
                  className="px-2.5 py-1.5 rounded bg-background/40 border border-border/70 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={member.avatarUrl}
                      alt={member.displayName}
                      className="w-5 h-5 rounded-full object-cover shrink-0"
                    />
                    <span className="font-medium text-foreground truncate">
                      {member.displayName}
                    </span>
                  </div>

                  {rsvp?.status === 'going' ? (
                    <Badge variant="success" className="text-[10px] font-mono shrink-0">
                      {participant?.availableFrom || 'Ahora'} ·{' '}
                      {formatDurationLabel(rsvp.durationMinutes)}
                    </Badge>
                  ) : rsvp?.status === 'declined' ? (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      No puede
                    </Badge>
                  ) : (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      Sin responder
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>

      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Zap className="w-4 h-4 text-warning" strokeWidth={1.75} />
              <span>Confirmar llegada</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {activeSession.title}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-1 text-xs">
            <div className="p-2.5 rounded-md bg-background/60 border border-border flex items-center justify-between">
              <span className="text-muted-foreground">Te comprometés a llegar</span>
              <span className="font-mono font-semibold text-foreground">
                {commitArrivalTime}{' '}
                <span className="text-[10px] text-muted-foreground font-normal">
                  ({etaMinutes === 0 ? 'Ahora' : `en ${etaMinutes}m`})
                </span>
              </span>
            </div>

            {commitEndTime && (
              <div className="p-2.5 rounded-md bg-background/60 border border-border flex items-center justify-between">
                <span className="text-muted-foreground">Jugás hasta</span>
                <span className="font-mono font-semibold text-foreground">
                  {commitEndTime}{' '}
                  <span className="text-[10px] text-muted-foreground font-normal">
                    ({formatDurationLabel(durationMinutes)})
                  </span>
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                onRespond({
                  status: 'going',
                  etaMinutes,
                  durationMinutes,
                });
                setShowConfirmModal(false);
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
