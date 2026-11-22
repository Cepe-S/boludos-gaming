import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { GamingGroup, PlayerProfile } from '@/types/domain';
import {
  LolAccount,
  LolPlatform,
  LolSpecificQueueCategory,
  LolTimeRangeFilter,
  LolViewMode,
} from '@/types/lol';
import {
  DEFAULT_DDRAGON_VERSION,
  LOL_PLATFORM_OPTIONS,
  getProfileIconUrl,
} from '@/lib/lolDdragon';
import { getLocalRiotApiKey, setLocalRiotApiKey } from '@/lib/lolService';
import { getUserAccounts, resolveUserPrimaryAccount } from '@/lib/lolPerformanceEngine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  Calendar,
  Crown,
  FolderKanban,
  KeyRound,
  Link2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Unlink,
  User,
  Users,
} from 'lucide-react';

const linkRiotSchema = z.object({
  userId: z.string().min(1, 'Seleccioná un miembro.'),
  gameName: z.string().trim().min(1, 'Ingresá el Riot ID.'),
  tagLine: z
    .string()
    .trim()
    .min(2, 'Ingresá el Tag (ej. LAS).')
    .max(8, 'Máximo 8 caracteres.'),
  platform: z.enum([
    'la2',
    'la1',
    'br1',
    'na1',
    'euw1',
    'eun1',
    'kr',
    'jp1',
    'oc1',
    'tr1',
    'ru',
    'ph2',
    'sg2',
    'th2',
    'tw2',
    'vn2',
  ]),
});

type LinkRiotFormValues = z.infer<typeof linkRiotSchema>;

const QUEUE_FILTERS: Array<{ id: LolSpecificQueueCategory | 'all'; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'normal', label: 'Normal' },
  { id: 'ranked_flex', label: 'Flex' },
  { id: 'mode_5v5', label: '5v5' },
  { id: 'ranked_solo', label: 'SoloQ' },
  { id: 'aram', label: 'ARAM' },
  { id: 'arena', label: 'Arena' },
];

const TIME_RANGE_FILTERS: Array<{ id: LolTimeRangeFilter; label: string }> = [
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'all', label: 'Todo' },
];

export interface LolHeaderBarProps {
  viewMode: LolViewMode;
  onChangeViewMode: (mode: LolViewMode) => void;
  userGroups: GamingGroup[];
  activeGroup: GamingGroup | null;
  onSelectGroup: (groupId: string) => void;
  groupMembers: Array<Pick<PlayerProfile, 'id' | 'displayName' | 'avatarUrl'>>;
  accounts: LolAccount[];
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;
  selectedQueues: LolSpecificQueueCategory[];
  onToggleQueue: (queue: LolSpecificQueueCategory | 'all') => void;
  timeRange: LolTimeRangeFilter;
  onChangeTimeRange: (range: LolTimeRangeFilter) => void;
  isDemoMode: boolean;
  onToggleDemoMode: (demo: boolean) => void;
  isSyncing: boolean;
  hasServerRiotKey: boolean | null;
  serverKeyUpdatedAt?: string | null;
  ddragonVersion: string;
  onLinkAndSync: (params: {
    userId: string;
    gameName: string;
    tagLine: string;
    platform: LolPlatform;
    isPrimary?: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  onSyncPlayer: (userId: string) => Promise<void>;
  onSyncGroup: () => Promise<void>;
  onUnlinkAccount: (userId: string, puuid?: string) => Promise<void>;
  onSetPrimaryAccount: (userId: string, puuid: string) => Promise<void>;
  onSaveServerRiotKey: (apiKey: string) => Promise<{ ok: boolean; error?: string }>;
  openAccountsRequest?: { userId: string; nonce: number } | null;
}

function formatKeyUpdatedAt(iso?: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const LolHeaderBar: React.FC<LolHeaderBarProps> = ({
  viewMode,
  onChangeViewMode,
  userGroups,
  activeGroup,
  onSelectGroup,
  groupMembers,
  accounts,
  selectedUserId,
  onSelectUser,
  selectedQueues,
  onToggleQueue,
  timeRange,
  onChangeTimeRange,
  isDemoMode,
  onToggleDemoMode,
  isSyncing,
  hasServerRiotKey,
  serverKeyUpdatedAt,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  onLinkAndSync,
  onSyncPlayer,
  onSyncGroup,
  onUnlinkAccount,
  onSetPrimaryAccount,
  onSaveServerRiotKey,
  openAccountsRequest,
}) => {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkAsPrimary, setLinkAsPrimary] = useState(true);
  const [keyInput, setKeyInput] = useState('');
  const [hasLocalKey, setHasLocalKey] = useState(() => Boolean(getLocalRiotApiKey()));
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const primaryAccountByUserId = new Map<string, LolAccount>();
  const accountsCountByUserId = new Map<string, number>();
  for (const m of groupMembers) {
    const primary = resolveUserPrimaryAccount(accounts, m.id);
    if (primary) primaryAccountByUserId.set(m.id, primary);
    accountsCountByUserId.set(m.id, getUserAccounts(accounts, m.id).length);
  }
  for (const acc of accounts) {
    if (!primaryAccountByUserId.has(acc.userId)) {
      const primary = resolveUserPrimaryAccount(accounts, acc.userId);
      if (primary) primaryAccountByUserId.set(acc.userId, primary);
      accountsCountByUserId.set(acc.userId, getUserAccounts(accounts, acc.userId).length);
    }
  }

  const linkForm = useForm<LinkRiotFormValues>({
    resolver: zodResolver(linkRiotSchema),
    defaultValues: {
      userId: selectedUserId || groupMembers[0]?.id || '',
      gameName: '',
      tagLine: 'LAS',
      platform: 'la2',
    },
  });

  useEffect(() => {
    if (isLinkDialogOpen) {
      const targetId = selectedUserId || groupMembers[0]?.id || '';
      const userAccs = getUserAccounts(accounts, targetId);
      linkForm.reset({
        userId: targetId,
        gameName: '',
        tagLine: userAccs[0]?.tagLine || 'LAS',
        platform: userAccs[0]?.platform || 'la2',
      });
      setLinkAsPrimary(userAccs.length === 0);
      setLinkError(null);
    }
  }, [isLinkDialogOpen, selectedUserId]);

  const handleOpenLinkForMember = (memberId?: string) => {
    const targetId = memberId || selectedUserId || groupMembers[0]?.id || '';
    const userAccs = getUserAccounts(accounts, targetId);
    linkForm.reset({
      userId: targetId,
      gameName: '',
      tagLine: userAccs[0]?.tagLine || 'LAS',
      platform: userAccs[0]?.platform || 'la2',
    });
    setLinkAsPrimary(userAccs.length === 0);
    setLinkError(null);
    setIsLinkDialogOpen(true);
  };

  useEffect(() => {
    if (openAccountsRequest) {
      handleOpenLinkForMember(openAccountsRequest.userId);
    }
  }, [openAccountsRequest?.nonce]);

  const handleSubmitLink = linkForm.handleSubmit(async (values) => {
    setLinkError(null);
    const existingCount = getUserAccounts(accounts, values.userId).length;
    const res = await onLinkAndSync({
      userId: values.userId,
      gameName: values.gameName,
      tagLine: values.tagLine.replace(/^#/, ''),
      platform: values.platform,
      isPrimary: existingCount === 0 ? true : linkAsPrimary,
    });
    if (res.ok) {
      linkForm.setValue('gameName', '');
      setLinkAsPrimary(false);
    } else {
      setLinkError(res.error || 'No se pudo vincular la cuenta de Riot.');
    }
  });

  const handleSaveServerApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setKeyError('Ingresá una Riot API Key (RGAPI-...).');
      return;
    }

    setKeyError(null);
    setIsSavingKey(true);
    try {
      const res = await onSaveServerRiotKey(trimmed);
      if (res.ok) {
        setHasLocalKey(false);
        setKeyInput('');
        setIsKeyDialogOpen(false);
      } else {
        setKeyError(res.error || 'No se pudo validar ni guardar la Riot API Key.');
      }
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleSaveLocalApiKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setKeyError('Ingresá una Riot API Key (RGAPI-...).');
      return;
    }

    setLocalRiotApiKey(trimmed);
    setHasLocalKey(true);
    setKeyError(null);
    setIsKeyDialogOpen(false);
  };

  const formattedUpdatedAt = formatKeyUpdatedAt(serverKeyUpdatedAt);
  const selectedMember =
    groupMembers.find((m) => m.id === selectedUserId) ?? groupMembers[0] ?? null;
  const selectedAcc = selectedMember
    ? primaryAccountByUserId.get(selectedMember.id)
    : undefined;
  const selectedAltCount = selectedMember
    ? Math.max(0, (accountsCountByUserId.get(selectedMember.id) ?? 0) - 1)
    : 0;
  const dialogUserId = linkForm.watch('userId');
  const dialogUserAccounts = dialogUserId ? getUserAccounts(accounts, dialogUserId) : [];

  return (
    <>
      <div className="p-2.5 rounded-md bg-card/55 backdrop-blur-md border border-border">
        {/* Top Row: View Mode Switch + Compact Summoner Select (personal) / Group Switcher (group) + Filters + Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {/* Personal | Group Segmented View Switch */}
            <div
              role="group"
              aria-label="Modo de vista"
              className="inline-flex items-center rounded-md border border-border bg-background/55 p-0.5 shrink-0"
            >
              {(
                [
                  { id: 'personal', label: 'Personal', Icon: User },
                  { id: 'group', label: 'Grupo', Icon: Users },
                ] as const
              ).map(({ id, label, Icon }) => {
                const isActive = viewMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onChangeViewMode(id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border text-xs transition-all duration-150 cursor-pointer',
                      isActive
                        ? 'bg-primary/20 border-primary text-primary font-semibold'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Compact Summoner Dropdown (Personal Mode Only) */}
            {viewMode === 'personal' && groupMembers.length > 0 && (
              <div className="pl-2 border-l border-border">
                <Select
                  value={selectedMember?.id ?? ''}
                  onValueChange={(memberId) => {
                    if (primaryAccountByUserId.has(memberId)) {
                      onSelectUser(memberId);
                    } else if (!isDemoMode) {
                      handleOpenLinkForMember(memberId);
                    }
                  }}
                >
                  <SelectTrigger
                    aria-label="Seleccionar invocador"
                    title="Cambiar invocador"
                    className="h-7 w-auto min-w-[136px] max-w-[196px] px-2 gap-1.5 bg-background/55 border-border text-xs font-medium"
                  >
                    {selectedMember ? (
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                        <img
                          src={
                            selectedAcc
                              ? getProfileIconUrl(
                                  selectedAcc.profileIconId,
                                  selectedAcc.ddragonVersion || ddragonVersion
                                )
                              : selectedMember.avatarUrl
                          }
                          alt={selectedMember.displayName}
                          className="w-4 h-4 rounded-full object-cover border border-border shrink-0"
                        />
                        <span className="truncate text-foreground leading-none">
                          {selectedMember.displayName}
                        </span>
                        {selectedAltCount > 0 && (
                          <span className="text-[9px] font-mono font-semibold text-primary shrink-0">
                            +{selectedAltCount}
                          </span>
                        )}
                      </div>
                    ) : (
                      <SelectValue placeholder="Invocador" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {groupMembers.map((member) => {
                      const acc = primaryAccountByUserId.get(member.id);
                      const altCount = Math.max(
                        0,
                        (accountsCountByUserId.get(member.id) ?? 0) - 1
                      );
                      return (
                        <SelectItem key={member.id} value={member.id}>
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={
                                acc
                                  ? getProfileIconUrl(
                                      acc.profileIconId,
                                      acc.ddragonVersion || ddragonVersion
                                    )
                                  : member.avatarUrl
                              }
                              alt={member.displayName}
                              className="w-4 h-4 rounded-full object-cover border border-border shrink-0"
                            />
                            <span className="text-xs font-medium text-foreground truncate">
                              {member.displayName}
                            </span>
                            {acc ? (
                              <span className="text-[10px] font-mono text-muted-foreground truncate">
                                {acc.gameName}#{acc.tagLine}
                                {altCount > 0 ? ` (+${altCount})` : ''}
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono text-primary">
                                Vincular
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {viewMode === 'group' && userGroups.length > 1 && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-border">
                <FolderKanban
                  className="w-4 h-4 text-primary shrink-0"
                  strokeWidth={1.75}
                />
                {userGroups.map((g, idx) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onSelectGroup(g.id)}
                    style={{ animationDelay: `${idx * 25}ms` }}
                    className={cn(
                      'px-2 py-1 rounded-md border text-[11px] font-medium transition-all duration-150 active:scale-95 cursor-pointer animate-lol-card-pop',
                      activeGroup?.id === g.id
                        ? 'bg-primary/15 border-primary text-foreground shadow-[0_0_12px_-4px_rgba(88,101,242,0.5)]'
                        : 'bg-background/45 border-border text-muted-foreground hover:text-foreground hover:border-border/90'
                    )}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}

            {/* Global Queue Filters (Multi-select) */}
            <div className="flex flex-wrap items-center gap-1 pl-2 border-l border-border">
              {QUEUE_FILTERS.map((q, idx) => {
                const isActive =
                  q.id === 'all'
                    ? selectedQueues.length === 0
                    : selectedQueues.includes(q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => onToggleQueue(q.id)}
                    style={{ animationDelay: `${idx * 25 + 30}ms` }}
                    className={cn(
                      'px-2.5 py-1 rounded-md border text-[11px] font-medium transition-all duration-150 active:scale-95 cursor-pointer animate-lol-card-pop',
                      isActive
                        ? 'bg-primary/15 border-primary text-primary font-semibold shadow-[0_0_10px_-3px_rgba(88,101,242,0.45)]'
                        : 'bg-background/45 border-border text-muted-foreground hover:text-foreground hover:-translate-y-0.5'
                    )}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>

            {/* Global Time Range Filter */}
            <div className="flex items-center gap-1 pl-2 border-l border-border">
              <Calendar
                className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                strokeWidth={1.75}
              />
              {TIME_RANGE_FILTERS.map((tr, idx) => (
                <button
                  key={tr.id}
                  type="button"
                  onClick={() => onChangeTimeRange(tr.id)}
                  style={{ animationDelay: `${idx * 25 + 120}ms` }}
                  className={cn(
                    'px-2 py-1 rounded-md border text-[11px] font-mono font-medium transition-all duration-150 active:scale-95 cursor-pointer animate-lol-card-pop',
                    timeRange === tr.id
                      ? 'bg-primary/15 border-primary text-primary font-semibold'
                      : 'bg-background/45 border-border text-muted-foreground hover:text-foreground hover:-translate-y-0.5'
                  )}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {/* Demo vs Live Mode Toggle */}
            <div className="inline-flex items-center rounded-md border border-border bg-background/55 p-0.5">
              <button
                type="button"
                onClick={() => onToggleDemoMode(false)}
                className={cn(
                  'px-2 py-1 rounded-sm text-[11px] font-semibold transition-colors cursor-pointer',
                  !isDemoMode
                    ? 'bg-success/20 text-success'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Live
              </button>
              <button
                type="button"
                onClick={() => onToggleDemoMode(true)}
                className={cn(
                  'px-2 py-1 rounded-sm text-[11px] font-semibold transition-colors cursor-pointer inline-flex items-center gap-1',
                  isDemoMode
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Sparkles className="w-3 h-3" strokeWidth={1.75} />
                Demo
              </button>
            </div>

            {!isDemoMode && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleOpenLinkForMember()}
                  title="Agregar o gestionar cuentas de Riot (principal y secundarias)"
                  aria-label="Agregar cuenta de Riot"
                >
                  <Plus className="w-4 h-4 text-primary" strokeWidth={2} />
                  <span>Cuentas</span>
                </Button>

                {viewMode === 'personal' &&
                  selectedUserId &&
                  primaryAccountByUserId.has(selectedUserId) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={isSyncing}
                      onClick={() => onSyncPlayer(selectedUserId)}
                      title="Sincronizar jugador seleccionado"
                      aria-label="Sincronizar jugador"
                    >
                      <RefreshCw
                        className={cn('w-4 h-4', isSyncing && 'animate-spin')}
                        strokeWidth={1.75}
                      />
                      <span className="hidden sm:inline">Sync</span>
                    </Button>
                  )}

                {viewMode === 'group' && accounts.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    disabled={isSyncing}
                    onClick={onSyncGroup}
                    title="Sincronizar todo el grupo"
                    aria-label="Sincronizar todo el grupo"
                  >
                    <Users className="w-4 h-4" strokeWidth={1.75} />
                    <span className="hidden md:inline">Sync Grupo</span>
                  </Button>
                )}

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const currentLocal = getLocalRiotApiKey();
                    setHasLocalKey(Boolean(currentLocal));
                    setKeyInput(hasServerRiotKey ? '' : currentLocal);
                    setKeyError(null);
                    setIsKeyDialogOpen(true);
                  }}
                  title="Configurar Riot API Key"
                  aria-label="Configurar Riot API Key"
                  className="px-2"
                >
                  <KeyRound
                    className={cn(
                      'w-4 h-4',
                      hasServerRiotKey || hasLocalKey
                        ? 'text-success'
                        : 'text-warning'
                    )}
                    strokeWidth={1.75}
                  />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Link & Manage Riot Accounts Modal */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Cuentas de Riot</span>
            </DialogTitle>
          </DialogHeader>

          <Form {...linkForm}>
            <form onSubmit={handleSubmitLink} className="space-y-3">
              <FormField
                control={linkForm.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {viewMode === 'group' ? 'Miembro del Grupo' : 'Invocador'}
                    </FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(val) => {
                        field.onChange(val);
                        const userAccs = getUserAccounts(accounts, val);
                        linkForm.setValue('gameName', '');
                        linkForm.setValue('tagLine', userAccs[0]?.tagLine || 'LAS');
                        linkForm.setValue('platform', userAccs[0]?.platform || 'la2');
                        setLinkAsPrimary(userAccs.length === 0);
                        setLinkError(null);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Elegí miembro" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {groupMembers.map((m) => {
                          const cnt = accountsCountByUserId.get(m.id) ?? 0;
                          return (
                            <SelectItem key={m.id} value={m.id}>
                              <span className="flex items-center gap-2">
                                <span>{m.displayName}</span>
                                {cnt > 0 && (
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    ({cnt} {cnt === 1 ? 'cuenta' : 'cuentas'})
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Existing linked accounts for selected member */}
              {dialogUserAccounts.length > 0 && (
                <div className="space-y-1.5 rounded-md border border-border bg-background/45 p-2.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                    <span>Cuentas vinculadas ({dialogUserAccounts.length})</span>
                    <span className="font-mono text-[10px]">Stats unificadas</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                    {dialogUserAccounts.map((acc) => {
                      const isMain = acc.isPrimary !== false;
                      return (
                        <div
                          key={acc.puuid}
                          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border/80 bg-card/70"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={getProfileIconUrl(
                                acc.profileIconId,
                                acc.ddragonVersion || ddragonVersion
                              )}
                              alt={acc.gameName}
                              className="w-6 h-6 rounded-full border border-border object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-foreground truncate">
                                  {acc.gameName}
                                  <span className="text-muted-foreground font-mono text-[10px]">
                                    #{acc.tagLine}
                                  </span>
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] font-mono uppercase px-1 py-0"
                                >
                                  {acc.platform}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                {isMain ? (
                                  <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-amber-400">
                                    <Crown className="w-2.5 h-2.5" strokeWidth={2} />
                                    Principal
                                  </span>
                                ) : (
                                  <span className="text-[9.5px] font-mono text-muted-foreground">
                                    Secundaria
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {!isMain && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={isSyncing}
                                title="Marcar como cuenta principal"
                                aria-label={`Hacer principal a ${acc.gameName}`}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-400"
                                onClick={() =>
                                  void onSetPrimaryAccount(dialogUserId, acc.puuid)
                                }
                              >
                                <Crown className="w-3.5 h-3.5" strokeWidth={1.75} />
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isSyncing}
                              title="Desvincular esta cuenta"
                              aria-label={`Desvincular ${acc.gameName}`}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                void onUnlinkAccount(dialogUserId, acc.puuid)
                              }
                            >
                              <Unlink className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add new account section */}
              <div className="space-y-2.5 pt-1 border-t border-border/70">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
                    {dialogUserAccounts.length > 0
                      ? 'Agregar cuenta'
                      : 'Vincular cuenta principal'}
                  </span>

                  {dialogUserAccounts.length > 0 && (
                    <div className="inline-flex items-center rounded-md border border-border bg-background/55 p-0.5 text-[10px] gap-0.5">
                      <button
                        type="button"
                        onClick={() => setLinkAsPrimary(false)}
                        className={cn(
                          'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors',
                          !linkAsPrimary
                            ? 'bg-primary/20 text-primary font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Secundaria
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinkAsPrimary(true)}
                        className={cn(
                          'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors inline-flex items-center gap-1',
                          linkAsPrimary
                            ? 'bg-amber-500/20 text-amber-300 font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Crown className="w-2.5 h-2.5" strokeWidth={2} />
                        Principal
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <FormField
                    control={linkForm.control}
                    name="gameName"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Game Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Ej. SantiSmurf" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={linkForm.control}
                    name="tagLine"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tag</FormLabel>
                        <FormControl>
                          <Input placeholder="LAS" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={linkForm.control}
                  name="platform"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Servidor</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Servidor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LOL_PLATFORM_OPTIONS.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {linkError && (
                <p className="text-xs text-destructive font-medium bg-destructive/10 border border-destructive/40 rounded-md px-2.5 py-2">
                  {linkError}
                </p>
              )}

              <DialogFooter className="gap-2 pt-2">
                <Button type="submit" disabled={isSyncing}>
                  {isSyncing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <Link2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                  )}
                  <span>
                    {isSyncing
                      ? 'Sincronizando...'
                      : dialogUserAccounts.length > 0 && !linkAsPrimary
                        ? 'Agregar secundaria'
                        : 'Vincular y Sync'}
                  </span>
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Riot API Key Dialog */}
      <Dialog open={isKeyDialogOpen} onOpenChange={setIsKeyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Riot API Key</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveServerApiKey} className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-background/50 text-xs">
              <span className="text-muted-foreground">Servidor (Supabase)</span>
              <Badge
                variant={hasServerRiotKey ? 'success' : 'warning'}
                title={formattedUpdatedAt ? `Actualizada: ${formattedUpdatedAt}` : undefined}
              >
                <ShieldCheck className="w-3 h-3" strokeWidth={1.75} />
                <span>
                  {hasServerRiotKey ? 'Activa' : 'Sin configurar'}
                  {hasServerRiotKey && formattedUpdatedAt ? ` · ${formattedUpdatedAt}` : ''}
                </span>
              </Badge>
            </div>

            {hasLocalKey && (
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border border-warning/40 bg-warning/10 text-xs">
                <span className="text-warning font-medium">Override local</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isSavingKey}
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    setLocalRiotApiKey('');
                    setHasLocalKey(false);
                    setKeyInput('');
                    setKeyError(null);
                  }}
                >
                  Limpiar
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="lol-riot-api-key-input"
                className="text-xs font-medium text-foreground block"
              >
                Rotar Riot API Key (RGAPI-...)
              </label>
              <Input
                id="lol-riot-api-key-input"
                type="password"
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  if (keyError) setKeyError(null);
                }}
                placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="font-mono"
                autoComplete="off"
              />
            </div>

            {keyError && (
              <div className="flex items-start gap-2 text-xs text-destructive font-medium bg-destructive/10 border border-destructive/40 rounded-md px-2.5 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
                <span>{keyError}</span>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSavingKey || !keyInput.trim()}
                onClick={handleSaveLocalApiKey}
              >
                Solo local
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSavingKey || !keyInput.trim()}
              >
                {isSavingKey ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                )}
                <span>{isSavingKey ? 'Validando...' : 'Guardar en servidor'}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
