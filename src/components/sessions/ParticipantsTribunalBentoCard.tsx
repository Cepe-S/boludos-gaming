import React from 'react';
import {
  AttendanceVote,
  Game,
  GamingSession,
  PlayerProfile,
  ScheduleOverlapSummary,
  SessionParticipant,
  UserGamePreference,
} from '@/types/domain';
import { getPlayerArchetypeBadge } from '@/lib/playerCategorizationEngine';
import { PvjArchetypeIcon } from '@/components/PvjDimensionIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  Gavel,
  Ghost,
  Megaphone,
  ShieldAlert,
  UserCheck,
  Users,
} from 'lucide-react';

export interface ParticipantsTribunalBentoCardProps {
  activeSession: GamingSession;
  currentUser: PlayerProfile;
  players: PlayerProfile[];
  games: Game[];
  preferences: UserGamePreference[];
  scheduleOverlap: ScheduleOverlapSummary | null;
  confirmedParticipantsCount: number;
  probableParticipantsCount: number;
  isParticipantConfirmed: (participant?: SessionParticipant | null) => boolean;
  pingingUserId: string | null;
  onConfirmAttendance: (userId?: string) => void;
  onPingLate: (userId: string) => void;
  onCastVote: (targetUserId: string, vote: AttendanceVote['vote']) => void;
  onOpenManageInvites: () => void;
  onOpenCalloutModal: () => void;
}

export const ParticipantsTribunalBentoCard: React.FC<ParticipantsTribunalBentoCardProps> = ({
  activeSession,
  currentUser,
  players,
  games,
  preferences,
  scheduleOverlap,
  confirmedParticipantsCount,
  probableParticipantsCount,
  isParticipantConfirmed,
  pingingUserId,
  onConfirmAttendance,
  onPingLate,
  onCastVote,
  onOpenManageInvites,
  onOpenCalloutModal,
}) => {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const timelineMap = new Map(
    (scheduleOverlap?.participantTimelines ?? []).map((tl) => [tl.userId, tl])
  );

  // Sort: confirmed first, then probable, sorted by Karma descending
  const sortedParticipants = [...activeSession.participants].sort((a, b) => {
    const aConf = isParticipantConfirmed(a) ? 1 : 0;
    const bConf = isParticipantConfirmed(b) ? 1 : 0;
    if (aConf !== bConf) return bConf - aConf;
    const pa = playerMap.get(a.userId)?.karmaScore ?? 0;
    const pb = playerMap.get(b.userId)?.karmaScore ?? 0;
    return pb - pa;
  });

  return (
    <Card className="xl:col-span-5 cv-section flex flex-col animate-adn-bento-in" style={{ animationDelay: '135ms' }}>
      <CardHeader className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-destructive/15 border border-destructive/40 flex items-center justify-center text-destructive shrink-0">
              <Gavel className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <CardTitle>Quórum &amp; Tribunal</CardTitle>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="success" className="text-[10px]">
              {confirmedParticipantsCount} Conf.
            </Badge>
            <Badge variant="warning" className="text-[10px]">
              {probableParticipantsCount} Prob.
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/70">
          <span className="text-[11px] text-muted-foreground">
            {activeSession.invitedUserIds && activeSession.invitedUserIds.length > 0
              ? `Selectiva (${activeSession.invitedUserIds.length})`
              : 'Grupo completo'}
          </span>
          <div className="flex items-center gap-1.5">
            {probableParticipantsCount > 0 && (
              <Button
                size="xs"
                variant="amber"
                className="w-6 px-0"
                onClick={onOpenCalloutModal}
                title={`Reclamar confirmación (${probableParticipantsCount})`}
                aria-label={`Reclamar confirmación (${probableParticipantsCount})`}
              >
                <Megaphone className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Button>
            )}
            <Button
              size="xs"
              variant="outline"
              className="w-6 px-0"
              onClick={onOpenManageInvites}
              title="Gestionar invitados"
              aria-label="Gestionar invitados"
            >
              <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3">
        {sortedParticipants.length === 0 ? (
          <div className="p-6 text-center rounded-md border border-dashed border-border bg-background/45 text-xs text-muted-foreground">
            Sin participantes aún.
          </div>
        ) : (
          <div className="rounded-md border border-border bg-background/45 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[155px]">Jugador</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Tribunal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedParticipants.map((part, idx) => {
                  const player = playerMap.get(part.userId);
                  if (!player) return null;

                  const timeline = timelineMap.get(part.userId);
                  const confirmed = isParticipantConfirmed(part);
                  const isMe = part.userId === currentUser.id;
                  const archetype = getPlayerArchetypeBadge(player, preferences, games);

                  const targetVotes = activeSession.attendanceVotes.filter(
                    (v) => v.targetUserId === part.userId
                  );
                  const myVote = targetVotes.find((v) => v.voterId === currentUser.id)?.vote;
                  const onTimeCount = targetVotes.filter((v) => v.vote === 'on_time').length;
                  const lateCount = targetVotes.filter((v) => v.vote === 'late').length;
                  const noShowCount = targetVotes.filter((v) => v.vote === 'no_show').length;

                  return (
                    <TableRow
                      key={part.userId}
                      style={{ animationDelay: `${idx * 40}ms` }}
                      className="animate-lol-row-slide"
                    >
                      {/* Player Identity */}
                      <TableCell className="align-top">
                        <div className="flex items-start gap-2.5">
                          <img
                            src={player.avatarUrl}
                            alt={player.displayName}
                            className="w-8 h-8 rounded-full border border-border object-cover shrink-0 mt-0.5"
                          />
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-foreground truncate">
                                {player.displayName}
                              </span>
                              {isMe && (
                                <Badge variant="default" className="text-[9px] px-1 py-0">
                                  Vos
                                </Badge>
                              )}
                              <span className="text-[10px] font-mono text-muted-foreground">
                                K:{player.karmaScore}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground block truncate max-w-[140px]">
                              {player.activeTitle}
                            </span>
                            {archetype.hasData && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/55 border border-border text-[9px] text-muted-foreground">
                                <PvjArchetypeIcon
                                  hasData={archetype.hasData}
                                  type={archetype.type}
                                  primaryDimension={archetype.primaryDimension}
                                  secondaryDimension={archetype.secondaryDimension}
                                  iconClassName="w-2.5 h-2.5 shrink-0"
                                />
                                <span className="truncate max-w-[115px]">{archetype.name}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Schedule & Attendance Status */}
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {confirmed ? (
                              <Badge variant="success" className="text-[10px] px-1.5 py-0">
                                <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2} />
                                <span>100% Conf.</span>
                              </Badge>
                            ) : (
                              <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                                <span>Prob. {part.confidencePercentage ?? 75}%</span>
                              </Badge>
                            )}

                            {part.attendanceStatus === 'on_time' && (
                              <Badge variant="success" className="text-[10px] px-1.5 py-0">
                                En Hora
                              </Badge>
                            )}
                            {part.attendanceStatus === 'late' && (
                              <Badge variant="warning" className="text-[10px] px-1.5 py-0">
                                Tarde
                              </Badge>
                            )}
                            {part.attendanceStatus === 'no_show' && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                Humo
                              </Badge>
                            )}
                          </div>

                          <div className="text-[10px] font-mono text-muted-foreground">
                            {part.availableFrom}–{part.availableUntil} (±{part.precisionMinutes}m)
                          </div>

                          {timeline && (
                            <div className="text-[10px] font-mono text-destructive">
                              Límite: {timeline.strictDeadlineFormatted}
                            </div>
                          )}

                          {part.note && (
                            <p className="text-[10px] italic text-muted-foreground truncate max-w-[130px]">
                              &ldquo;{part.note}&rdquo;
                            </p>
                          )}
                        </div>
                      </TableCell>

                      {/* Actions & Tribunal Voting */}
                      <TableCell className="align-top text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-1">
                            {!confirmed && isMe && (
                              <Button
                                size="xs"
                                variant="emerald"
                                className="w-6 px-0"
                                onClick={() => onConfirmAttendance(part.userId)}
                                title="Confirmar al 100%"
                                aria-label="Confirmar al 100%"
                              >
                                <UserCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                              </Button>
                            )}

                            {!isMe && (
                              <Button
                                size="xs"
                                variant="outline"
                                className="w-6 px-0"
                                disabled={pingingUserId === part.userId}
                                onClick={() => onPingLate(part.userId)}
                                title="Enviar ping (Discord & Push)"
                                aria-label="Enviar ping (Discord & Push)"
                              >
                                <BellRing
                                  className={cn(
                                    'w-3.5 h-3.5',
                                    pingingUserId === part.userId && 'animate-bounce text-warning'
                                  )}
                                  strokeWidth={1.75}
                                />
                              </Button>
                            )}
                          </div>

                          {/* Tribunal del Humo Votes */}
                          {!isMe && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onCastVote(part.userId, 'on_time')}
                                title="Votar En Hora (+5 Karma)"
                                className={cn(
                                  'px-1.5 py-0.5 rounded border text-[10px] font-medium inline-flex items-center gap-0.5 transition-colors cursor-pointer',
                                  myVote === 'on_time'
                                    ? 'bg-success/20 border-success/60 text-success'
                                    : 'bg-secondary/55 border-border text-muted-foreground hover:text-success'
                                )}
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={1.75} />
                                <span>{onTimeCount}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onCastVote(part.userId, 'late')}
                                title="Votar Llegó Tarde (-10 Karma)"
                                className={cn(
                                  'px-1.5 py-0.5 rounded border text-[10px] font-medium inline-flex items-center gap-0.5 transition-colors cursor-pointer',
                                  myVote === 'late'
                                    ? 'bg-warning/20 border-warning/60 text-warning'
                                    : 'bg-secondary/55 border-border text-muted-foreground hover:text-warning'
                                )}
                              >
                                <Clock className="w-2.5 h-2.5" strokeWidth={1.75} />
                                <span>{lateCount}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onCastVote(part.userId, 'no_show')}
                                title="Votar Vendió Humo (-25 Karma)"
                                className={cn(
                                  'px-1.5 py-0.5 rounded border text-[10px] font-medium inline-flex items-center gap-0.5 transition-colors cursor-pointer',
                                  myVote === 'no_show'
                                    ? 'bg-destructive/20 border-destructive/60 text-destructive'
                                    : 'bg-secondary/55 border-border text-muted-foreground hover:text-destructive'
                                )}
                              >
                                <Ghost className="w-2.5 h-2.5" strokeWidth={1.75} />
                                <span>{noShowCount}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Quick Tribunal legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-background/45 border border-border text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-destructive" strokeWidth={1.75} />
            <span>Quórum: 2 votos</span>
          </span>
          <span className="font-mono text-[10px]">+5 / -10 / -25 Karma</span>
        </div>
      </CardContent>
    </Card>
  );
};
