import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useApp } from '@/context/AppContext';
import { getPlayerArchetypeBadge } from '@/lib/playerCategorizationEngine';
import { PvjArchetypeIcon } from '@/components/PvjDimensionIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
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
  Award,
  BellRing,
  Clock,
  Flame,
  FolderKanban,
  Gavel,
  Ghost,
  Search,
  Trophy,
} from 'lucide-react';

const PRESET_REASONS = [
  'Dijo 22:00 ±15m y apareció a las 23:40 comiendo empanadas.',
  'Dijo "me baño y entro" y desapareció hasta el día siguiente.',
  'Clavó el visto en WhatsApp y lo vimos jugando Valorant solo.',
  'Dijo "reinicio la compu que actualiza Windows" y no volvió más.',
  'Se quedó dormido con los auriculares puestos en llamada de Discord.',
  'Avisó 45 minutos después del horario pactado que "le surgió un plan".',
];

const sanctionSchema = z.object({
  sessionId: z.string().min(1, 'Seleccioná una sesión.'),
  targetUserId: z.string().min(1, 'Seleccioná al jugador.'),
  sanctionType: z.enum(['late', 'no_show']),
  reason: z.string().trim().min(5, 'Escribí un motivo de al menos 5 caracteres.'),
});

type SanctionFormValues = z.infer<typeof sanctionSchema>;

export const LeaderboardSanctionsView: React.FC = () => {
  const {
    players,
    sanctions,
    sessions,
    activeSessionId,
    games,
    preferences,
    issueDirectSanction,
    pingLatePlayer,
    currentUser,
    userGroups,
    activeGroup,
    setActiveGroupId,
  } = useApp();

  const scopedPlayers = useMemo(() => {
    if (!activeGroup) return players;
    const memberSet = new Set(activeGroup.memberIds);
    return players.filter((p) => memberSet.has(p.id));
  }, [activeGroup, players]);

  const scopedSessions = useMemo(() => {
    if (!activeGroup) return sessions;
    return sessions.filter((s) => s.groupId === activeGroup.id);
  }, [activeGroup, sessions]);

  const scopedSanctions = useMemo(() => {
    if (!activeGroup) return sanctions;
    const scopedSessionIds = new Set(scopedSessions.map((s) => s.id));
    return sanctions.filter((san) =>
      san.groupId
        ? san.groupId === activeGroup.id
        : scopedSessionIds.has(san.sessionId)
    );
  }, [activeGroup, sanctions, scopedSessions]);

  const [searchParams, setSearchParams] = useSearchParams();

  const searchQuery = searchParams.get('q') ?? '';
  const setSearchQuery = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value.trim()) {
            next.set('q', value);
          } else {
            next.delete('q');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const rawSort = searchParams.get('sort');
  const sortBy: 'karma' | 'hours' | 'punctuality' =
    rawSort === 'hours' || rawSort === 'punctuality' ? rawSort : 'karma';
  const setSortBy = useCallback(
    (nextSort: 'karma' | 'hours' | 'punctuality') => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (nextSort === 'karma') {
            next.delete('sort');
          } else {
            next.set('sort', nextSort);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pingStatusMessage, setPingStatusMessage] = useState<string | null>(null);

  const defaultSessionId = useMemo(() => {
    const preferred =
      scopedSessions.find((s) => s.id === activeSessionId) ?? scopedSessions[0];
    return preferred?.id ?? '';
  }, [scopedSessions, activeSessionId]);

  const defaultTargetId = useMemo(() => {
    const fallback =
      scopedPlayers.find((p) => p.id !== currentUser.id) ?? scopedPlayers[0];
    return fallback?.id ?? '';
  }, [scopedPlayers, currentUser.id]);

  const form = useForm<SanctionFormValues>({
    resolver: zodResolver(sanctionSchema),
    defaultValues: {
      sessionId: defaultSessionId,
      targetUserId: defaultTargetId,
      sanctionType: 'late',
      reason: '',
    },
  });

  useEffect(() => {
    if (
      defaultSessionId &&
      !scopedSessions.some((s) => s.id === form.getValues('sessionId'))
    ) {
      form.setValue('sessionId', defaultSessionId);
    }
    if (
      defaultTargetId &&
      !scopedPlayers.some((p) => p.id === form.getValues('targetUserId'))
    ) {
      form.setValue('targetUserId', defaultTargetId);
    }
  }, [defaultSessionId, defaultTargetId, scopedSessions, scopedPlayers, form]);

  // Podium calculations
  const punctualLeader = useMemo(() => {
    return [...scopedPlayers].sort((a, b) => {
      const ratioA = a.onTimeCount / Math.max(1, a.sessionsPlayed);
      const ratioB = b.onTimeCount / Math.max(1, b.sessionsPlayed);
      if (ratioB !== ratioA) return ratioB - ratioA;
      return b.karmaScore - a.karmaScore;
    })[0];
  }, [scopedPlayers]);

  const viciosoLeader = useMemo(() => {
    return [...scopedPlayers].sort(
      (a, b) =>
        b.hoursPlayed - a.hoursPlayed || b.sessionsPlayed - a.sessionsPlayed
    )[0];
  }, [scopedPlayers]);

  const humoLeader = useMemo(() => {
    return [...scopedPlayers].sort((a, b) => {
      const humScoreA = a.noShowCount * 3 + a.lateCount * 1.5 - a.karmaScore;
      const humScoreB = b.noShowCount * 3 + b.lateCount * 1.5 - b.karmaScore;
      return humScoreB - humScoreA;
    })[0];
  }, [scopedPlayers]);

  const filteredPlayers = useMemo(() => {
    return scopedPlayers
      .filter((p) => {
        const query = searchQuery.toLowerCase().trim();
        return (
          p.displayName.toLowerCase().includes(query) ||
          p.discordUsername.toLowerCase().includes(query) ||
          p.activeTitle.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'karma') return b.karmaScore - a.karmaScore;
        if (sortBy === 'hours') return b.hoursPlayed - a.hoursPlayed;
        if (sortBy === 'punctuality') return b.onTimeCount - a.onTimeCount;
        return 0;
      });
  }, [scopedPlayers, searchQuery, sortBy]);

  const handleIssueSanction = form.handleSubmit((values) => {
    issueDirectSanction(
      values.sessionId,
      values.targetUserId,
      values.sanctionType,
      values.reason
    );
    const targetPlayer =
      scopedPlayers.find((p) => p.id === values.targetUserId) ||
      players.find((p) => p.id === values.targetUserId);
    setSuccessMessage(
      `⚖️ Sentencia emitida contra ${
        targetPlayer?.displayName || 'el jugador'
      }. Publicada en Discord y Webhook.`
    );
    form.setValue('reason', '');
    window.setTimeout(() => setSuccessMessage(null), 5500);
  });

  const handlePingPlayer = async (targetId: string) => {
    const target =
      scopedPlayers.find((p) => p.id === targetId) ||
      players.find((p) => p.id === targetId);
    if (!target) return;
    const currentSession =
      scopedSessions.find((s) => s.id === activeSessionId) ?? scopedSessions[0];
    if (!currentSession) {
      setPingStatusMessage(
        'No hay sesiones activas en este grupo para enviar el reclamo.'
      );
      window.setTimeout(() => setPingStatusMessage(null), 4000);
      return;
    }

    try {
      await pingLatePlayer(currentSession.id, targetId);
      const targetLabel = target.discordUsername ? `@${target.discordUsername}` : target.displayName;
      setPingStatusMessage(
        `🚨 Reclamo de humo enviado a ${targetLabel} por Discord y Push!`
      );
      window.setTimeout(() => setPingStatusMessage(null), 5000);
    } catch {
      setPingStatusMessage('No se pudo enviar el reclamo.');
      window.setTimeout(() => setPingStatusMessage(null), 4000);
    }
  };

  const getKarmaColorClass = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 55) return 'text-primary';
    if (score >= 35) return 'text-warning';
    return 'text-destructive';
  };

  const getKarmaBarClass = (score: number) => {
    if (score >= 80) return 'bg-success';
    if (score >= 55) return 'bg-primary';
    if (score >= 35) return 'bg-warning';
    return 'bg-destructive';
  };

  return (
    <div className="space-y-4 animate-lol-reveal">
      {/* Group Scope Switcher */}
      {userGroups.length > 0 && (
        <div className="p-3 rounded-md bg-card/50 border border-border flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5 mr-1">
            <FolderKanban className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
            Grupo:
          </span>
          {userGroups.map((g) => {
            const active = activeGroup?.id === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveGroupId(g.id)}
                className={cn(
                  'px-2.5 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer',
                  active
                    ? 'bg-primary/15 border-primary text-foreground'
                    : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Alerts */}
      {pingStatusMessage && (
        <div className="px-3.5 py-2.5 rounded-md bg-warning/10 border border-warning/40 text-xs text-warning font-medium">
          {pingStatusMessage}
        </div>
      )}
      {successMessage && (
        <div className="px-3.5 py-2.5 rounded-md bg-success/10 border border-success/40 text-xs text-success font-medium">
          {successMessage}
        </div>
      )}

      {/* Top 3 KPI Podium Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Punctual Leader */}
        <Card className="animate-adn-bento-in" style={{ animationDelay: '30ms' }}>
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-md bg-success/15 border border-success/40 flex items-center justify-center text-success shrink-0">
              <Trophy className="w-5 h-5" strokeWidth={1.75} />
            </div>
            {punctualLeader ? (
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-success block">
                  Reloj Suizo
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <img
                    src={punctualLeader.avatarUrl}
                    alt={punctualLeader.displayName}
                    className="w-6 h-6 rounded-full object-cover border border-border"
                  />
                  <span className="text-sm font-bold text-foreground truncate">
                    {punctualLeader.displayName}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {punctualLeader.onTimeCount} a tiempo · {punctualLeader.karmaScore} Karma
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Sin datos</span>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Hours Leader */}
        <Card className="animate-adn-bento-in" style={{ animationDelay: '75ms' }}>
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
              <Flame className="w-5 h-5" strokeWidth={1.75} />
            </div>
            {viciosoLeader ? (
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary block">
                  Más Horas
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <img
                    src={viciosoLeader.avatarUrl}
                    alt={viciosoLeader.displayName}
                    className="w-6 h-6 rounded-full object-cover border border-border"
                  />
                  <span className="text-sm font-bold text-foreground truncate">
                    {viciosoLeader.displayName}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {viciosoLeader.hoursPlayed}h · {viciosoLeader.sessionsPlayed} sesiones
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Sin datos</span>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Rey del Humo */}
        <Card className="animate-adn-bento-in" style={{ animationDelay: '120ms' }}>
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-md bg-destructive/15 border border-destructive/40 flex items-center justify-center text-destructive shrink-0">
              <Ghost className="w-5 h-5" strokeWidth={1.75} />
            </div>
            {humoLeader ? (
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive block">
                  Rey del Humo
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <img
                    src={humoLeader.avatarUrl}
                    alt={humoLeader.displayName}
                    className="w-6 h-6 rounded-full object-cover border border-border"
                  />
                  <span className="text-sm font-bold text-foreground truncate">
                    {humoLeader.displayName}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {humoLeader.noShowCount} faltas · {humoLeader.lateCount} tardes
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Sin datos</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main 12-Col Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT 8-COL: RELIABILITY & KARMA TABLE */}
        <Card className="xl:col-span-8">
          <CardHeader className="space-y-3 pb-3 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Award className="w-4 h-4 text-primary" strokeWidth={1.75} />
                <span>Confiabilidad &amp; Karma</span>
              </CardTitle>

              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'karma', label: 'Karma' },
                    { id: 'hours', label: 'Horas' },
                    { id: 'punctuality', label: 'Puntualidad' },
                  ] as Array<{ id: 'karma' | 'hours' | 'punctuality'; label: string }>
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSortBy(s.id)}
                    className={cn(
                      'px-2.5 py-1 rounded border text-[11px] font-medium cursor-pointer transition-colors',
                      sortBy === s.id
                        ? 'bg-primary/15 border-primary text-primary'
                        : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <Search
                className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
                strokeWidth={1.75}
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar jugador..."
                className="pl-9"
              />
            </div>
          </CardHeader>

          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[650px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Jugador &amp; Arquetipo</TableHead>
                  <TableHead className="w-[150px]">Karma Score</TableHead>
                  <TableHead>Historial</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.map((player, index) => {
                  const isMe = player.id === currentUser.id;
                  const arch = getPlayerArchetypeBadge(
                    player,
                    preferences,
                    games
                  );
                  return (
                    <TableRow
                      key={player.id}
                      style={{ animationDelay: `${index * 35}ms` }}
                      className="animate-lol-row-slide"
                    >
                      <TableCell className="font-mono font-bold text-muted-foreground">
                        #{index + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <img
                            src={player.avatarUrl}
                            alt={player.displayName}
                            className="w-8 h-8 rounded-full border border-border object-cover shrink-0"
                          />
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs sm:text-sm font-semibold text-foreground">
                                {player.displayName}
                              </span>
                              {isMe && (
                                <Badge variant="default" className="text-[9px] px-1 py-0">
                                  Vos
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                              <span>{player.activeTitle}</span>
                              {arch.hasData && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/55 border border-border text-[9px]">
                                  <PvjArchetypeIcon
                                    hasData={arch.hasData}
                                    type={arch.type}
                                    primaryDimension={arch.primaryDimension}
                                    secondaryDimension={arch.secondaryDimension}
                                    iconClassName="w-2.5 h-2.5 shrink-0"
                                  />
                                  <span>{arch.name}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-mono font-bold">
                            <span className={getKarmaColorClass(player.karmaScore)}>
                              {player.karmaScore}/100
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              🔥 {player.currentStreak}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full animate-lol-bar-grow',
                                getKarmaBarClass(player.karmaScore)
                              )}
                              style={{
                                width: `${Math.min(100, Math.max(0, player.karmaScore))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px] font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-success">{player.onTimeCount}✓</span>
                          <span className="text-warning">{player.lateCount}⏱</span>
                          <span className="text-destructive">{player.noShowCount}💨</span>
                          <span className="text-muted-foreground">
                            · {player.hoursPlayed}h
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isMe && (
                            <Button
                              size="xs"
                              variant="outline"
                              className="w-7 px-0"
                              onClick={() => handlePingPlayer(player.id)}
                              title={`Enviar Ping a ${player.displayName}`}
                              aria-label={`Enviar Ping a ${player.displayName}`}
                            >
                              <BellRing className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </Button>
                          )}
                          <Button
                            size="xs"
                            variant="secondary"
                            className="w-7 px-0"
                            onClick={() => {
                              form.setValue('targetUserId', player.id);
                              document
                                .getElementById('tribunal-form')
                                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                            title={`Juzgar a ${player.displayName}`}
                            aria-label={`Juzgar a ${player.displayName}`}
                          >
                            <Gavel className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* RIGHT 4-COL: TRIBUNAL DEL HUMO SANCTION FORM & HISTORY FEED */}
        <div className="xl:col-span-4 space-y-4">
          <Card id="tribunal-form">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gavel className="w-4 h-4 text-destructive" strokeWidth={1.75} />
                <span>Tribunal del Humo</span>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4">
              <Form {...form}>
                <form onSubmit={handleIssueSanction} className="space-y-3">
                  <FormField
                    control={form.control}
                    name="sessionId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Sesión</FormLabel>
                        <FormControl>
                          <select
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-border bg-background/45 px-2.5 text-xs text-foreground"
                          >
                            {scopedSessions.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.date} · {s.title}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="targetUserId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Acusado</FormLabel>
                        <FormControl>
                          <select
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-border bg-background/45 px-2.5 text-xs text-foreground"
                          >
                            {scopedPlayers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.displayName} (Karma: {p.karmaScore})
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sanctionType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Falta</FormLabel>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => field.onChange('late')}
                            className={cn(
                              'p-2 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer',
                              field.value === 'late'
                                ? 'bg-warning/15 border-warning text-warning'
                                : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <span>Tarde (-10)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => field.onChange('no_show')}
                            className={cn(
                              'p-2 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer',
                              field.value === 'no_show'
                                ? 'bg-destructive/15 border-destructive text-destructive'
                                : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <Ghost className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <span>Humo (-25)</span>
                          </button>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Pruebas / Relato</FormLabel>
                        <FormControl>
                          <Input placeholder="Contá qué pasó..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-wrap gap-1">
                    {PRESET_REASONS.slice(0, 3).map((pr) => (
                      <button
                        key={pr}
                        type="button"
                        onClick={() => form.setValue('reason', pr, { shouldValidate: true })}
                        className="px-2 py-0.5 rounded border border-border bg-background hover:border-primary/40 text-[10px] text-muted-foreground hover:text-foreground truncate max-w-full cursor-pointer"
                      >
                        + {pr}
                      </button>
                    ))}
                  </div>

                  <Button
                    type="submit"
                    variant="destructive"
                    className="w-full"
                    disabled={scopedSessions.length === 0}
                  >
                    <Gavel className="w-4 h-4" strokeWidth={1.75} />
                    <span>Emitir Sentencia</span>
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Sanction Feed */}
          <Card>
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm">
                Historial ({scopedSanctions.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2 max-h-[340px] overflow-y-auto">
              {scopedSanctions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Sin registros.
                </p>
              ) : (
                scopedSanctions.map((san) => {
                  const target = players.find((p) => p.id === san.userId);
                  const isBonus = san.type === 'on_time_bonus';
                  const isNoShow = san.type === 'no_show';
                  return (
                    <div
                      key={san.id}
                      className="p-2.5 rounded-md bg-background/45 border border-border space-y-1 text-xs animate-lol-row-slide"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground truncate">
                          {target?.displayName ?? 'Jugador'}
                        </span>
                        <Badge
                          variant={
                            isBonus
                              ? 'success'
                              : isNoShow
                                ? 'destructive'
                                : 'warning'
                          }
                          className="text-[10px] font-mono shrink-0"
                        >
                          {san.karmaDelta > 0 ? `+${san.karmaDelta}` : san.karmaDelta} Karma
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {san.description}
                      </p>
                      <span className="text-[10px] font-mono text-muted-foreground/75 block">
                        {san.date} · {san.sessionTitle}
                      </span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
