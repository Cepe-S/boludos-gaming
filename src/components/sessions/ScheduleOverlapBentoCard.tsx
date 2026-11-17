import React, { useEffect, useState } from 'react';
import { GamingSession, ScheduleOverlapSummary, SessionParticipant } from '@/types/domain';
import { formatMinutesToTime, parseTimeMinutes } from '@/lib/matchmakingEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AlertTriangle, CalendarClock, CheckCircle2, Dices } from 'lucide-react';

export interface ScheduleOverlapBentoCardProps {
  activeSession: GamingSession;
  scheduleOverlap: ScheduleOverlapSummary | null;
  isParticipantConfirmed: (participant?: SessionParticipant | null) => boolean;
}

function getEdgeAlignedTransform(percent: number): string {
  if (percent <= 8) return 'translate-x-0';
  if (percent >= 92) return '-translate-x-full';
  return '-translate-x-1/2';
}

export const ScheduleOverlapBentoCard: React.FC<ScheduleOverlapBentoCardProps> = ({
  activeSession,
  scheduleOverlap,
  isParticipantConfirmed,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, []);
  return (
    <TooltipProvider delayDuration={80}>
      <Card className="xl:col-span-7 cv-section flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
              <CalendarClock className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <CardTitle>Quórum Horario</CardTitle>
          </div>

          {scheduleOverlap && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
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
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {scheduleOverlap.hasValidOverlap
                  ? 'Hay al menos 30 minutos de coincidencia garantizada entre todos los participantes'
                  : 'La coincidencia garantizada entre participantes es menor a 30 minutos'}
              </TooltipContent>
            </Tooltip>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* KPI Strip */}
          {scheduleOverlap && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2.5 rounded-md bg-background/45 border border-border">
                    <span className="text-xs font-medium text-muted-foreground block">
                      Inicio prob.
                    </span>
                    <span className="text-base font-bold text-foreground font-mono">
                      {scheduleOverlap.probableStartFormatted}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Horario estimado de inicio según las disponibilidades cargadas
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2.5 rounded-md bg-background/45 border border-primary/40">
                    <span className="text-xs font-medium text-primary block">
                      Inicio gar.
                    </span>
                    <span className="text-base font-bold text-primary font-mono">
                      {scheduleOverlap.guaranteedStartFormatted}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Horario mínimo garantizado considerando el margen de llegada (±m) de todos
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2.5 rounded-md bg-background/45 border border-border">
                    <span className="text-xs font-medium text-muted-foreground block">
                      Fin prob.
                    </span>
                    <span className="text-base font-bold text-foreground font-mono">
                      {scheduleOverlap.probableEndFormatted}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Horario estimado de finalización de la sesión
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-2.5 rounded-md bg-success/15 border border-success/40">
                    <span className="text-xs font-medium text-success block">
                      Coincidencia
                    </span>
                    <span className="text-base font-bold text-success font-mono">
                      {Math.floor(scheduleOverlap.guaranteedOverlapMinutes / 60)}h{' '}
                      {scheduleOverlap.guaranteedOverlapMinutes % 60}m
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Duración total de la franja con quórum garantizado
                </TooltipContent>
              </Tooltip>
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
            const gLeft = Math.max(0, Math.min(100, ((gStart - baseMin) / totalSpan) * 100));
            const gWidth = Math.max(0, Math.min(100 - gLeft, ((gEnd - gStart) / totalSpan) * 100));

            const rawNowMinutes = now.getHours() * 60 + now.getMinutes();
            const mappedNowMinutes =
              rawNowMinutes >= baseMin && rawNowMinutes <= baseMax
                ? rawNowMinutes
                : rawNowMinutes + 1440 >= baseMin && rawNowMinutes + 1440 <= baseMax
                ? rawNowMinutes + 1440
                : null;
            const nowPercent =
              mappedNowMinutes !== null
                ? Math.max(0, Math.min(100, ((mappedNowMinutes - baseMin) / totalSpan) * 100))
                : null;
            const nowLabel = mappedNowMinutes !== null ? formatMinutesToTime(mappedNowMinutes) : null;
            const tickStep = ticks.length > 9 ? 2 : 1;

            const quorumHours = Math.floor(scheduleOverlap.guaranteedOverlapMinutes / 60);
            const quorumMins = scheduleOverlap.guaranteedOverlapMinutes % 60;
            const quorumTooltip = `Franja con quórum total: ${scheduleOverlap.guaranteedStartFormatted} a ${scheduleOverlap.guaranteedEndFormatted} (${quorumHours}h ${quorumMins}m)`;

            return (
              <div className="space-y-2 overflow-x-auto scroller-thin pb-1">
                <div className="min-w-[640px]">
                  {/* Scale (aligned 1:1 with track column) */}
                  <div className="flex items-center gap-3 px-2 pb-2 border-b border-border">
                    <div className="w-44 shrink-0 text-xs font-medium text-muted-foreground">
                      Jugador
                    </div>
                    <div className="relative flex-1 min-w-0 h-5">
                      {ticks.map((t, idx) => {
                        if (idx % tickStep !== 0 && idx !== ticks.length - 1) return null;
                        const pct = ((t - baseMin) / totalSpan) * 100;
                        const alignClass =
                          idx === 0
                            ? 'translate-x-0'
                            : idx === ticks.length - 1
                            ? '-translate-x-full'
                            : '-translate-x-1/2';
                        const formattedTick = formatMinutesToTime(t);
                        return (
                          <Tooltip key={t}>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  'absolute top-0 text-xs font-mono text-muted-foreground whitespace-nowrap',
                                  alignClass
                                )}
                                style={{ left: `${pct}%` }}
                              >
                                {formattedTick}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Marca horaria: {formattedTick}</TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                    <div className="w-24 shrink-0 text-right text-xs font-medium text-muted-foreground">
                      Estado
                    </div>
                  </div>

                  {/* Rows + Track Overlays */}
                  <div className="relative mt-2 space-y-2.5">
                    {/* Track-aligned vertical overlays (Gridlines, Quórum band, Now line) */}
                    <div className="absolute inset-0 pointer-events-none flex gap-3 px-2">
                      <div className="w-44 shrink-0" />
                      <div className="relative flex-1 min-w-0">
                        {/* Subtle hourly vertical gridlines */}
                        {ticks.map((t) => {
                          const pct = ((t - baseMin) / totalSpan) * 100;
                          return (
                            <div
                              key={`grid-${t}`}
                              className="absolute top-0 bottom-0 w-px bg-border/35"
                              style={{ left: `${pct}%` }}
                            />
                          );
                        })}

                        {/* Quórum Shaded Band (hoverable for instant tooltip) */}
                        {scheduleOverlap.hasValidOverlap && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="pointer-events-auto absolute top-0 bottom-0 rounded bg-success/12 hover:bg-success/22 transition-colors border-x border-success/40 z-0"
                                style={{
                                  left: `${gLeft}%`,
                                  width: `${gWidth}%`,
                                }}
                              />
                            </TooltipTrigger>
                            <TooltipContent>{quorumTooltip}</TooltipContent>
                          </Tooltip>
                        )}

                        {/* Current Time Vertical Line crossing all bars */}
                        {nowPercent !== null && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="pointer-events-auto absolute -top-1 -bottom-1 w-2 -translate-x-1/2 flex justify-center z-20"
                                style={{ left: `${nowPercent}%` }}
                              >
                                <div className="relative w-0.5 h-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]">
                                  <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-background" />
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>Hora actual: {nowLabel}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="w-24 shrink-0" />
                    </div>

                    {timelines.map((p) => {
                      const coreLeft = Math.max(
                        0,
                        Math.min(100, ((p.startMinutesFromBase - baseMin) / totalSpan) * 100)
                      );
                      const coreWidth = Math.max(
                        3,
                        Math.min(100 - coreLeft, ((p.endMinutesFromBase - p.startMinutesFromBase) / totalSpan) * 100)
                      );

                      const wingLeft = Math.max(
                        0,
                        Math.min(100, ((p.earliestStartMinutes - baseMin) / totalSpan) * 100)
                      );
                      const wingWidth = Math.max(
                        3,
                        Math.min(100 - wingLeft, ((p.strictDeadlineMinutes - p.earliestStartMinutes) / totalSpan) * 100)
                      );

                      const deadlinePos = Math.max(
                        0,
                        Math.min(100, ((p.strictDeadlineMinutes - baseMin) / totalSpan) * 100)
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

                      const attendanceLabel =
                        p.attendanceStatus === 'on_time'
                          ? 'En hora'
                          : p.attendanceStatus === 'late'
                          ? 'Tarde'
                          : p.attendanceStatus === 'no_show'
                          ? 'Humo'
                          : 'Pendiente';

                      return (
                        <div
                          key={p.userId}
                          className="pointer-events-none relative z-10 flex items-center gap-3 pt-4 pb-1.5 px-2 rounded-md"
                        >
                          {/* Player Label */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="pointer-events-auto w-44 shrink-0 flex items-center gap-2.5">
                                <img
                                  src={p.avatarUrl}
                                  alt={p.displayName}
                                  className="w-7 h-7 rounded-md border border-border object-cover shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-foreground truncate">
                                      {p.displayName}
                                    </span>
                                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                                      ±{p.precisionMinutes}m
                                    </span>
                                  </div>
                                  {isConfirmed ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-success font-semibold">
                                      <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
                                      <span>Confirmado</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-warning font-semibold">
                                      <Dices className="w-3 h-3" strokeWidth={2} />
                                      <span>Prob. {confidence}%</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {p.displayName} · Precisión ±{p.precisionMinutes}m ·{' '}
                              {isConfirmed
                                ? 'Asistencia confirmada (100%)'
                                : `Probabilidad de asistencia: ${confidence}%`}
                            </TooltipContent>
                          </Tooltip>

                          {/* Bar Track (empty track lets hover reach Quórum band underneath) */}
                          <div className="pointer-events-none relative flex-1 min-w-0 h-8 bg-background/45 rounded border border-border overflow-visible">
                            {/* Uncertainty Wings */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className="pointer-events-auto absolute top-0.5 bottom-0.5 rounded-sm bg-primary/15 border border-primary/40 border-dashed hover:bg-primary/25 transition-colors"
                                  style={{ left: `${wingLeft}%`, width: `${wingWidth}%` }}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                Margen (±{p.precisionMinutes}m): desde {p.earliestStartFormatted} hasta límite{' '}
                                {p.strictDeadlineFormatted}
                              </TooltipContent>
                            </Tooltip>

                            {/* Solid / Striped Core */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {isConfirmed ? (
                                  <div
                                    className="pointer-events-auto absolute top-1 bottom-1 rounded-sm bg-success/85 hover:bg-success/95 transition-colors border border-success/60 flex items-center justify-between gap-1.5 px-2 text-[11px] font-mono font-bold text-white overflow-hidden"
                                    style={{ left: `${coreLeft}%`, width: `${coreWidth}%` }}
                                  >
                                    <span className="truncate">{p.availableFrom}</span>
                                    {coreWidth >= 14 && (
                                      <span className="truncate opacity-85">{p.availableUntil}</span>
                                    )}
                                  </div>
                                ) : (
                                  <div
                                    className="pointer-events-auto absolute top-1 bottom-1 rounded-sm bg-[repeating-linear-gradient(45deg,hsl(var(--primary)/0.35),hsl(var(--primary)/0.35)_6px,hsl(var(--warning)/0.25)_6px,hsl(var(--warning)/0.25)_12px)] hover:brightness-110 transition-all border border-dashed border-warning/70 flex items-center justify-between gap-1.5 px-2 text-[11px] font-mono font-bold text-warning overflow-hidden"
                                    style={{ left: `${coreLeft}%`, width: `${coreWidth}%` }}
                                  >
                                    <span className="truncate">{p.availableFrom}</span>
                                    {coreWidth >= 14 && (
                                      <span className="truncate opacity-85">{p.availableUntil}</span>
                                    )}
                                  </div>
                                )}
                              </TooltipTrigger>
                              <TooltipContent>
                                {isConfirmed
                                  ? `100% Confirmado: ${p.availableFrom} a ${p.availableUntil}`
                                  : `Horario Probable (${confidence}%): ${p.availableFrom} a ${p.availableUntil}`}
                              </TooltipContent>
                            </Tooltip>

                            {/* Strict Deadline Marker (contained within row's pt-4 & edge-aligned) */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className="pointer-events-auto absolute top-0 bottom-0 w-1.5 -translate-x-1/2 flex justify-center z-20"
                                  style={{ left: `${deadlinePos}%` }}
                                >
                                  <div className="w-0.5 h-full bg-warning" />
                                  <span
                                    className={cn(
                                      'absolute -top-4 bg-warning text-background font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-xs whitespace-nowrap leading-none',
                                      deadlinePos <= 8
                                        ? 'left-0 translate-x-0'
                                        : deadlinePos >= 92
                                        ? 'right-0 translate-x-0'
                                        : 'left-1/2 -translate-x-1/2'
                                    )}
                                  >
                                    {p.strictDeadlineFormatted}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                Límite estricto de llegada: {p.strictDeadlineFormatted} (margen ±{p.precisionMinutes}m)
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          {/* Attendance Pill */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="pointer-events-auto w-24 shrink-0 text-right">
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
                                  className={cn('text-[11px] px-2 py-0.5')}
                                >
                                  {attendanceLabel}
                                </Badge>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              Estado de asistencia de {p.displayName}: {attendanceLabel}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      );
                    })}
                  </div>

                  {/* Dedicated Current Time footer badge (aligned with vertical line) */}
                  {nowPercent !== null && nowLabel && (
                    <div className="flex items-center gap-3 px-2 pt-2">
                      <div className="w-44 shrink-0" />
                      <div className="relative flex-1 min-w-0 h-6">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                'absolute top-0 text-[11px] font-mono font-bold text-white bg-rose-500 px-2 py-0.5 rounded shadow-sm whitespace-nowrap leading-tight',
                                getEdgeAlignedTransform(nowPercent)
                              )}
                              style={{ left: `${nowPercent}%` }}
                            >
                              Ahora {nowLabel}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Hora actual del sistema: {nowLabel}</TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="w-24 shrink-0" />
                    </div>
                  )}
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
    </TooltipProvider>
  );
};
