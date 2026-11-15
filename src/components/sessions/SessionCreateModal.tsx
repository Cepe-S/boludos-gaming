import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  DiscordIntegrationConfig,
  Game,
  GamingGroup,
  GroupGameRecommendation,
  PlayerProfile,
  PrecisionMinutes,
  UserGamePreference,
} from '@/types/domain';
import { getEffectiveDailySchedule } from '@/lib/matchmakingEngine';
import {
  GLOBAL_GAMES_KNOWLEDGE_BASE,
  KnowledgeGameEntry,
  generateGroupGameRecommendations,
} from '@/lib/tasteProfileEngine';
import { fetchExternalDiscoveryGames } from '@/lib/steamService';
import { GroupRecommendationCard } from './GroupRecommendationCard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Brain, CalendarPlus, Check, Compass, Dices, Lock, Sparkles, Users } from 'lucide-react';

const createSessionSchema = z.object({
  title: z.string().trim().min(2, 'Ingresá un título de al menos 2 caracteres.'),
  date: z.string().min(1, 'Seleccioná una fecha.'),
  mode: z.enum(['random', 'fixed']),
  selectedGameId: z.string().optional(),
  allowSplitLobbies: z.boolean(),
  availableFrom: z.string().min(4, 'Hora de inicio requerida.'),
  availableUntil: z.string().min(4, 'Hora de salida requerida.'),
  precisionMinutes: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)]),
});

type CreateSessionFormValues = z.infer<typeof createSessionSchema>;

export interface SessionCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeGroup: GamingGroup | null;
  groupMembers: PlayerProfile[];
  currentUser: PlayerProfile;
  games: Game[];
  preferences: UserGamePreference[];
  discordConfig: DiscordIntegrationConfig;
  defaultDate: string;
  onSyncDiscoveryToCatalog: (rec: GroupGameRecommendation) => Game | null;
  onCreateSession: (params: {
    title: string;
    date: string;
    mode: 'fixed' | 'random';
    selectedGameId?: string;
    allowSplitLobbies: boolean;
    availableFrom: string;
    availableUntil: string;
    precisionMinutes: PrecisionMinutes;
    invitedUserIds?: string[];
    groupId?: string;
  }) => void;
}

export const SessionCreateModal: React.FC<SessionCreateModalProps> = ({
  open,
  onOpenChange,
  activeGroup,
  groupMembers,
  currentUser,
  games,
  preferences,
  discordConfig,
  defaultDate,
  onSyncDiscoveryToCatalog,
  onCreateSession,
}) => {
  const [inviteMode, setInviteMode] = useState<'all' | 'custom'>('all');
  const [customInvitedUserIds, setCustomInvitedUserIds] = useState<string[]>([currentUser.id]);
  const [onlyProbableToday, setOnlyProbableToday] = useState(false);
  const [liveDiscoveryGames, setLiveDiscoveryGames] = useState<KnowledgeGameEntry[]>([]);
  const [isLoadingDiscovery, setIsLoadingDiscovery] = useState(false);

  const form = useForm<CreateSessionFormValues>({
    resolver: zodResolver(createSessionSchema),
    defaultValues: {
      title: 'Viernes de Humo y Táctica',
      date: defaultDate,
      mode: 'random',
      selectedGameId: games[0]?.id ?? '',
      allowSplitLobbies: true,
      availableFrom: '22:00',
      availableUntil: '01:30',
      precisionMinutes: 15,
    },
  });

  const watchDate = form.watch('date');
  const watchMode = form.watch('mode');
  const watchSelectedGameId = form.watch('selectedGameId');

  // Reset form nicely each time modal opens
  useEffect(() => {
    if (open) {
      form.reset({
        title: 'Noche de Vicio Grupal',
        date: defaultDate,
        mode: 'random',
        selectedGameId: games[0]?.id ?? '',
        allowSplitLobbies: true,
        availableFrom: '22:00',
        availableUntil: '01:30',
        precisionMinutes: 15,
      });
      setInviteMode('all');
      setOnlyProbableToday(false);
      setCustomInvitedUserIds(groupMembers.map((p) => p.id));
    }
  }, [open, defaultDate, games, groupMembers, form]);

  // Fetch optional Steam/IGDB discovery entries when opened
  useEffect(() => {
    if (!open || liveDiscoveryGames.length > 0) return;
    let cancelled = false;
    setIsLoadingDiscovery(true);
    fetchExternalDiscoveryGames({
      igdbClientId: discordConfig.igdbClientId,
      igdbClientSecret: discordConfig.igdbClientSecret,
    })
      .then((res) => {
        if (!cancelled && res.length > 0) {
          setLiveDiscoveryGames(res);
        }
      })
      .catch(() => {
        // Fallback smoothly to GLOBAL_GAMES_KNOWLEDGE_BASE
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDiscovery(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    liveDiscoveryGames.length,
    discordConfig.igdbClientId,
    discordConfig.igdbClientSecret,
  ]);

  const targetPlayersForRecommendations = useMemo(() => {
    if (inviteMode === 'custom') {
      const selected = groupMembers.filter((m) => customInvitedUserIds.includes(m.id));
      return selected.length > 0 ? selected : groupMembers;
    }
    return groupMembers;
  }, [inviteMode, groupMembers, customInvitedUserIds]);

  const recommendations = useMemo(() => {
    return generateGroupGameRecommendations({
      targetPlayers: targetPlayersForRecommendations,
      catalogGames: games,
      preferences,
      externalDiscoveryGames:
        liveDiscoveryGames.length > 0 ? liveDiscoveryGames : GLOBAL_GAMES_KNOWLEDGE_BASE,
      maxResultsPerCategory: 4,
    });
  }, [targetPlayersForRecommendations, games, preferences, liveDiscoveryGames]);

  const toggleInvitedUser = (userId: string) => {
    setCustomInvitedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectRecommendation = (rec: GroupGameRecommendation) => {
    let targetId = rec.catalogGameId;
    if (!targetId) {
      const synced = onSyncDiscoveryToCatalog(rec);
      if (synced) targetId = synced.id;
    }
    if (targetId) {
      form.setValue('mode', 'fixed', { shouldDirty: true });
      form.setValue('selectedGameId', targetId, { shouldDirty: true });
    }
  };

  const handleSubmit = form.handleSubmit((values) => {
    const invitedIds =
      inviteMode === 'custom' && customInvitedUserIds.length > 0
        ? Array.from(new Set([...customInvitedUserIds, currentUser.id]))
        : undefined;

    onCreateSession({
      title: values.title,
      date: values.date,
      mode: values.mode,
      selectedGameId: values.mode === 'fixed' ? values.selectedGameId : undefined,
      allowSplitLobbies: values.allowSplitLobbies,
      availableFrom: values.availableFrom,
      availableUntil: values.availableUntil,
      precisionMinutes: values.precisionMinutes,
      invitedUserIds: invitedIds,
      groupId: activeGroup?.id,
    });
    onOpenChange(false);
  });

  const displayedMembers = onlyProbableToday
    ? groupMembers.filter((m) => getEffectiveDailySchedule(m, watchDate).plays)
    : groupMembers;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
              <CalendarPlus className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div>
              <DialogTitle>Nueva Sesión</DialogTitle>
              {activeGroup && <DialogDescription>{activeGroup.name}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title + Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Viernes de CS2 / Co-op Caótico" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Creator Schedule + Precision */}
            <div className="p-3 rounded-md bg-background/45 border border-border/70 space-y-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                Tu Horario
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="availableFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px]">Inicio</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="availableUntil"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px]">Fin</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="precisionMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px]">Precisión (±min)</FormLabel>
                      <div className="grid grid-cols-4 gap-1">
                        {([5, 15, 30, 60] as PrecisionMinutes[]).map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => field.onChange(val)}
                            className={cn(
                              'h-9 rounded-md border text-xs font-medium transition-colors cursor-pointer',
                              field.value === val
                                ? 'bg-primary/15 border-primary text-primary'
                                : 'bg-card border-border text-muted-foreground hover:text-foreground'
                            )}
                          >
                            ±{val}m
                          </button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Mode + Split Lobbies */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modo</FormLabel>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => field.onChange('random')}
                        className={cn(
                          'p-2.5 rounded-md border text-left transition-colors cursor-pointer flex items-center gap-2',
                          field.value === 'random'
                            ? 'bg-primary/15 border-primary text-foreground'
                            : 'bg-background border-border text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Dices className="w-4 h-4 text-primary shrink-0" strokeWidth={1.75} />
                        <span className="text-xs font-semibold">Ruleta</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => field.onChange('fixed')}
                        className={cn(
                          'p-2.5 rounded-md border text-left transition-colors cursor-pointer flex items-center gap-2',
                          field.value === 'fixed'
                            ? 'bg-primary/15 border-primary text-foreground'
                            : 'bg-background border-border text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Lock className="w-4 h-4 text-success shrink-0" strokeWidth={1.75} />
                        <span className="text-xs font-semibold">Juego Fijo</span>
                      </button>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowSplitLobbies"
                render={({ field }) => (
                  <FormItem className="flex flex-col justify-center p-3 rounded-md bg-background/45 border border-border/70">
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel className="text-xs">Sub-Lobbies por Karma</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            {watchMode === 'fixed' && (
              <FormField
                control={form.control}
                name="selectedGameId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Juego</FormLabel>
                    <FormControl>
                      <select
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {games.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} ({g.minPlayers}–{g.maxPlayers} jug. · {g.category})
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* AI Recommendations Picker */}
            {(recommendations.readyToPlay.length > 0 || recommendations.discovery.length > 0) && (
              <div className="p-3 rounded-md bg-background/45 border border-border/70 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Brain className="w-4 h-4 text-primary" strokeWidth={1.75} />
                    Recomendaciones IA ({targetPlayersForRecommendations.length})
                  </span>
                  {isLoadingDiscovery && (
                    <Badge variant="outline" className="text-[10px]">
                      Cargando...
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {recommendations.readyToPlay.slice(0, 2).map((rec) => {
                    const isSelected =
                      watchMode === 'fixed' && rec.catalogGameId === watchSelectedGameId;
                    return (
                      <GroupRecommendationCard
                        key={rec.id}
                        recommendation={rec}
                        compact
                        isSelectedOrLocked={isSelected}
                        selectedBadgeLabel="Fijado"
                        actionLabel={isSelected ? 'Fijado' : 'Fijar'}
                        actionIcon={
                          isSelected ? (
                            <Check className="w-3.5 h-3.5" strokeWidth={2} />
                          ) : (
                            <Lock className="w-3.5 h-3.5" strokeWidth={1.75} />
                          )
                        }
                        actionVariant={isSelected ? 'emerald' : 'secondary'}
                        onAction={handleSelectRecommendation}
                      />
                    );
                  })}
                  {recommendations.discovery.slice(0, 2).map((rec) => (
                    <GroupRecommendationCard
                      key={rec.id}
                      recommendation={rec}
                      compact
                      actionLabel="Importar"
                      actionIcon={
                        rec.sharedDimensions.length > 0 ? (
                          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
                        ) : (
                          <Compass className="w-3.5 h-3.5" strokeWidth={1.75} />
                        )
                      }
                      actionVariant="outline"
                      onAction={handleSelectRecommendation}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Invite Scope */}
            <div className="p-3 rounded-md bg-background/45 border border-border/70 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary" strokeWidth={1.75} />
                  Invitados
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setInviteMode('all')}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs font-medium border cursor-pointer transition-colors',
                      inviteMode === 'all'
                        ? 'bg-primary/15 border-primary text-primary'
                        : 'bg-card border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Todos ({groupMembers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteMode('custom')}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs font-medium border cursor-pointer transition-colors',
                      inviteMode === 'custom'
                        ? 'bg-primary/15 border-primary text-primary'
                        : 'bg-card border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Selectiva
                  </button>
                </div>
              </div>

              {inviteMode === 'custom' && (
                <div className="space-y-2 pt-1">
                  <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyProbableToday}
                      onChange={(e) => setOnlyProbableToday(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span>Solo disponibles ({watchDate})</span>
                  </label>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {displayedMembers.map((member) => {
                      const isMe = member.id === currentUser.id;
                      const isChecked = isMe || customInvitedUserIds.includes(member.id);
                      const eff = getEffectiveDailySchedule(member, watchDate);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          disabled={isMe}
                          onClick={() => toggleInvitedUser(member.id)}
                          className={cn(
                            'p-2 rounded border text-left flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-80',
                            isChecked
                              ? 'bg-primary/15 border-primary/50 text-foreground'
                              : 'bg-card border-border text-muted-foreground'
                          )}
                        >
                          <img
                            src={member.avatarUrl}
                            alt={member.displayName}
                            className="w-6 h-6 rounded-full object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="text-[11px] font-medium block truncate">
                              {member.displayName}
                            </span>
                            <span className="text-[9px] text-muted-foreground block">
                              {eff.plays ? `${eff.availableFrom} (${eff.confidencePercentage}%)` : 'No juega'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                <CalendarPlus className="w-4 h-4" strokeWidth={1.75} />
                <span>Crear sesión</span>
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
