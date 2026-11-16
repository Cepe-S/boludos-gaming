import React from 'react';
import { GamingSession, ScheduleOverlapSummary, SessionParticipant } from '@/types/domain';
import { formatMinutesToTime, parseTimeMinutes } from '@/lib/matchmakingEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, CalendarClock, CheckCircle2, Dices } from 'lucide-react';

export interface ScheduleOverlapBentoCardProps {
  activeSession: GamingSession;
  scheduleOverlap: ScheduleOverlapSummary | null;
  isParticipantConfirmed: (participant?: SessionParticipant | null) => boolean;
}

export const ScheduleOverlapBentoCard: React.FC<ScheduleOverlapBentoCardProps> = ({
  activeSession,
  scheduleOverlap,
  isParticipantConfirmed,
}) => {
  return (
    <Card className="xl:col-span-7 cv-section flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
            <CalendarClock className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <CardTitle>Quórum Horario</CardTitle>
        </div>

        {scheduleOverlap && (
          <Badge variant={scheduleOverlap.hasValidOverlap ? 'success' : 'warning'}>
            {scheduleOverlap.hasValidOverlap ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Quórum</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Desfase &lt;30m</span>
              </>
            )}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* KPI Strip */}
        {scheduleOverlap && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-md bg-background/45 border border-border">
              <span className="text-[10px] font-medium text-muted-foreground block">
                Inicio prob.
              </span>
              <span className="text-sm font-bold text-foreground font-mono">
                {scheduleOverlap.probableStartFormatted}
              </span>
            </div>

            <div className="p-2.5 rounded-md bg-background/45 border border-primary/40">
              <span className="text-[10px] font-medium text-primary block">
                Inicio gar.
              </span>
              <span className="text-sm font-bold text-primary font-mono">
                {scheduleOverlap.guaranteedStartFormatted}
              </span>
            </div>

            <div className="p-2.5 rounded-md bg-background/45 border border-border">
              <span className="text-[10px] font-medium text-muted-foreground block">
                Fin prob.
              </span>
              <span className="text-sm font-bold text-foreground font-mono">
                {scheduleOverlap.probableEndFormatted}
              </span>
            </div>

            <div className="p-2.5 rounded-md bg-success/15 border border-success/40">
              <span className="text-[10px] font-medium text-success block">
                Coincidencia
              </span>
              <span className="text-sm font-bold text-success font-mono">
                {Math.floor(scheduleOverlap.guaranteedOverlapMinutes / 60)}h{' '}
                {scheduleOverlap.guaranteedOverlapMinutes % 60}m
              </span>
            </div>
          </div>
        )}

        {/* Horizontal Timeline */}
        {scheduleOverlap && scheduleOverlap.participantTimelines.length > 0 ? (
          (() => {
            const timelines = scheduleOverlap.participantTimelines;
            const minStart = Math.min(...timelines.map((t) => t.earliestStartMinutes));
            const maxEnd = Math.max(...timelines.map((t) => t.endMinutesFromBase));
            const baseMin = Math.floor(minStart / 60) * 60;
            const baseMax = Math.ceil(maxEnd / 60) * 60;
            const totalSpan = Math.max(300, baseMax - baseMin);

            const ticks: number[] = [];
            for (let m = baseMin; m <= baseMax; m += 60) {
              ticks.push(m);
            }

            const gStart = parseTimeMinutes(scheduleOverlap.guaranteedStartFormatted);
            const gEnd = parseTimeMinutes(scheduleOverlap.guaranteedEndFormatted, true, gStart);
            const gLeft = Math.max(0, ((gStart - baseMin) / totalSpan) * 100);
            const gWidth = Math.max(0, ((gEnd - gStart) / totalSpan) * 100);

            return (
              <div className="space-y-3 overflow-x-auto scroller-thin pb-1">
                <div className="min-w-[580px] space-y-2.5">
                  {/* Scale */}
                  <div className="relative border-b border-border pb-1.5">
                    <div className="flex justify-between text-[10px] font-mono text-muted-foreground pl-40 pr-2">
                      {ticks.map((t) => (
                        <span key={t} className="text-center -translate-x-1/2">
                          {formatMinutesToTime(t)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Rows */}
                  <div className="relative space-y-2">
                    {scheduleOverlap.hasValidOverlap && (
                      <div
                        className="absolute top-0 bottom-0 pointer-events-none rounded bg-success/10 border-x border-success/35 z-0"
                        style={{
                          left: `calc(10rem + (100% - 10rem - 6rem) * ${gLeft / 100})`,
                          width: `calc((100% - 10rem - 6rem) * ${gWidth / 100})`,
                        }}
                      >
                        <span className="absolute -top-0.5 left-1.5 text-[9px] text-success font-bold uppercase tracking-wider bg-background/45 px-1 rounded border border-success/30">
                          Quórum
                        </span>
                      </div>
                    )}

                    {timelines.map((p) => {
                      const coreLeft = Math.max(
                        0,
                        ((p.startMinutesFromBase - baseMin) / totalSpan) * 100
                      );
                      const coreWidth = Math.max(
                        3,
                        ((p.endMinutesFromBase - p.startMinutesFromBase) / totalSpan) * 100
                      );

                      const wingLeft = Math.max(
                        0,
                        ((p.earliestStartMinutes - baseMin) / totalSpan) * 100
                      );
                      const wingWidth = Math.max(
                        3,
                        ((p.strictDeadlineMinutes - p.earliestStartMinutes) / totalSpan) * 100
                      );

                      const deadlinePos = Math.max(
                        0,
                        ((p.strictDeadlineMinutes - baseMin) / totalSpan) * 100
                      );

                      const participant = activeSession.participants.find(
                        (pt) => pt.userId === p.userId
                      );
                      const isConfirmed =
                        isParticipantConfirmed(participant) || p.confirmationStatus === 'confirmed';
                      const confidence =
                        participant?.confidencePercentage ??
                        p.confidencePercentage ??
                        (isConfirmed ? 100 : 75);

                      return (
                        <div
                          key={p.userId}
                          className="relative z-10 flex items-center gap-2.5 py-1 px-1.5 rounded-md hover:bg-muted/40 transition-colors"
                        >
                          {/* Player Label */}
                          <div className="w-40 shrink-0 flex items-center gap-2">
                            <img
                              src={p.avatarUrl}
                              alt={p.displayName}
                              className="w-6 h-6 rounded-md border border-border object-cover shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] font-semibold text-foreground truncate">
                                  {p.displayName}
                                </span>
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  ±{p.precisionMinutes}m
                                </span>
                              </div>
                              {isConfirmed ? (
                                <span className="inline-flex items-center gap-1 text-[9px] text-success font-semibold">
                                  <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2} />
                                  <span>Confirmado</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[9px] text-warning font-semibold">
                                  <Dices className="w-2.5 h-2.5" strokeWidth={2} />
                                  <span>Prob. {confidence}%</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Bar Track */}
                          <div className="relative flex-1 h-6 bg-background/45 rounded border border-border overflow-visible">
                            {/* Uncertainty Wings */}
                            <div
                              className="absolute top-0.5 bottom-0.5 rounded-sm bg-primary/15 border border-primary/40 border-dashed"
                              style={{ left: `${wingLeft}%`, width: `${wingWidth}%` }}
                              title={`Margen: ${p.earliestStartFormatted} a ${p.strictDeadlineFormatted}`}
                            />

                            {/* Solid / Striped Core */}
                            {isConfirmed ? (
                              <div
                                className="absolute top-1 bottom-1 rounded-sm bg-success/80 border border-success/60 flex items-center justify-between px-1.5 text-[9px] font-mono font-bold text-white overflow-hidden"
                                style={{ left: `${coreLeft}%`, width: `${coreWidth}%` }}
                                title={`100% Confirmado: ${p.availableFrom} a ${p.availableUntil}`}
                              >
                                <span className="truncate">{p.availableFrom}</span>
                                <span className="truncate opacity-80">{p.availableUntil}</span>
                              </div>
                            ) : (
                              <div
                                className="absolute top-1 bottom-1 rounded-sm bg-[repeating-linear-gradient(45deg,hsl(var(--primary)/0.35),hsl(var(--primary)/0.35)_6px,hsl(var(--warning)/0.25)_6px,hsl(var(--warning)/0.25)_12px)] border border-dashed border-warning/70 flex items-center justify-between px-1.5 text-[9px] font-mono font-bold text-warning overflow-hidden"
                                style={{ left: `${coreLeft}%`, width: `${coreWidth}%` }}
                                title={`Horario Probable (${confidence}%): ${p.availableFrom} a ${p.availableUntil}`}
                              >
                                <span className="truncate">{p.availableFrom}</span>
                                <span className="truncate opacity-80">{p.availableUntil}</span>
                              </div>
                            )}

                            {/* Strict Deadline Marker */}
                            <div
                              className="absolute -top-0.5 bottom-0 w-0.5 bg-warning z-20"
                              style={{ left: `${deadlinePos}%` }}
                              title={`Límite Estricto: ${p.strictDeadlineFormatted}`}
                            >
                              <span className="absolute -top-3 -translate-x-1/2 bg-warning text-background font-mono text-[8px] font-bold px-1 rounded-xs">
                                {p.strictDeadlineFormatted}
                              </span>
                            </div>
                          </div>

                          {/* Attendance Pill */}
                          <div className="w-24 shrink-0 text-right">
                            <Badge
                              variant={
                                p.attendanceStatus === 'on_time'
                                  ? 'success'
                                  : p.attendanceStatus === 'late'
                                  ? 'warning'
                                  : p.attendanceStatus === 'no_show'
                                  ? 'destructive'
                                  : 'secondary'
                              }
                              className={cn('text-[10px] px-1.5 py-0')}
                            >
                              {p.attendanceStatus === 'on_time' && 'En hora'}
                              {p.attendanceStatus === 'late' && 'Tarde'}
                              {p.attendanceStatus === 'no_show' && 'Humo'}
                              {p.attendanceStatus === 'pending' && 'Pendiente'}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          <div className="p-6 text-center text-muted-foreground text-xs bg-background/45 rounded-md border border-border">
            Sin horarios cargados.
          </div>
        )}
      </CardContent>
    </Card>
  );
};
