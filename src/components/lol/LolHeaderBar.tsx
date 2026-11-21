import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { GamingGroup, PlayerProfile } from '@/types/domain';
import { LolAccount, LolPlatform, LolQueueCategory } from '@/types/lol';
import {
  DEFAULT_DDRAGON_VERSION,
  LOL_PLATFORM_OPTIONS,
  getProfileIconUrl,
} from '@/lib/lolDdragon';
import { getLocalRiotApiKey, setLocalRiotApiKey } from '@/lib/lolService';
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
  FolderKanban,
  KeyRound,
  Link2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Unlink,
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

const QUEUE_FILTERS: Array<{ id: LolQueueCategory; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'ranked_solo', label: 'SoloQ' },
  { id: 'ranked_flex', label: 'Flex' },
  { id: 'normal', label: 'Normal' },
  { id: 'aram', label: 'ARAM' },
  { id: 'arena', label: 'Arena' },
];

export interface LolHeaderBarProps {
  userGroups: GamingGroup[];
  activeGroup: GamingGroup | null;
  onSelectGroup: (groupId: string) => void;
  groupMembers: Array<Pick<PlayerProfile, 'id' | 'displayName' | 'avatarUrl'>>;
  accounts: LolAccount[];
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;
  queueFilter: LolQueueCategory;
  onChangeQueueFilter: (queue: LolQueueCategory) => void;
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
  }) => Promise<{ ok: boolean; error?: string }>;
  onSyncPlayer: (userId: string) => Promise<void>;
  onSyncGroup: () => Promise<void>;
  onUnlinkAccount: (userId: string) => Promise<void>;
  onSaveServerRiotKey: (apiKey: string) => Promise<{ ok: boolean; error?: string }>;
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
  userGroups,
  activeGroup,
  onSelectGroup,
  groupMembers,
  accounts,
  selectedUserId,
  onSelectUser,
  queueFilter,
  onChangeQueueFilter,
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
  onSaveServerRiotKey,
}) => {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [hasLocalKey, setHasLocalKey] = useState(() => Boolean(getLocalRiotApiKey()));
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const accountByUserId = new Map(accounts.map((a) => [a.userId, a]));

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
      const existing = accountByUserId.get(targetId);
      linkForm.reset({
        userId: targetId,
        gameName: existing?.gameName || '',
        tagLine: existing?.tagLine || 'LAS',
        platform: existing?.platform || 'la2',
      });
      setLinkError(null);
    }
  }, [isLinkDialogOpen, selectedUserId]);

  const handleOpenLinkForMember = (memberId?: string) => {
    const targetId = memberId || selectedUserId || groupMembers[0]?.id || '';
    const existing = accountByUserId.get(targetId);
    linkForm.reset({
      userId: targetId,
      gameName: existing?.gameName || '',
      tagLine: existing?.tagLine || 'LAS',
      platform: existing?.platform || 'la2',
    });
    setLinkError(null);
    setIsLinkDialogOpen(true);
  };

  const handleSubmitLink = linkForm.handleSubmit(async (values) => {
    setLinkError(null);
    const res = await onLinkAndSync({
      userId: values.userId,
      gameName: values.gameName,
      tagLine: values.tagLine.replace(/^#/, ''),
      platform: values.platform,
    });
    if (res.ok) {
      setIsLinkDialogOpen(false);
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

  return (
    <>
      <div className="p-3 rounded-md bg-card/55 backdrop-blur-md border border-border space-y-3">
        {/* Top Row: Group Switcher + Mode Toggle + Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {userGroups.length > 1 && (
              <div className="flex items-center gap-1.5 pr-2 border-r border-border">
                <FolderKanban
                  className="w-4 h-4 text-primary shrink-0"
                  strokeWidth={1.75}
                />
                {userGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onSelectGroup(g.id)}
                    className={cn(
                      'px-2 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer',
                      activeGroup?.id === g.id
                        ? 'bg-primary/15 border-primary text-foreground'
                        : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}

            {/* Queue Filters */}
            <div className="flex flex-wrap items-center gap-1">
              {QUEUE_FILTERS.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onChangeQueueFilter(q.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer',
                    queueFilter === q.id
                      ? 'bg-primary/15 border-primary text-primary font-semibold'
                      : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {q.label}
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
                  title="Vincular Riot ID"
                  aria-label="Vincular Riot ID"
                >
                  <Link2 className="w-4 h-4 text-primary" strokeWidth={1.75} />
                  <span>Riot ID</span>
                </Button>

                {selectedUserId && accountByUserId.has(selectedUserId) && (
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

                {accounts.length > 0 && (
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

        {/* Bottom Row: Group Member Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto scroller-thin pt-2 border-t border-border/70">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
            Invocador:
          </span>
          {groupMembers.map((member) => {
            const acc = accountByUserId.get(member.id);
            const isSelected = selectedUserId === member.id;
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => {
                  if (acc) {
                    onSelectUser(member.id);
                  } else if (!isDemoMode) {
                    handleOpenLinkForMember(member.id);
                  }
                }}
                className={cn(
                  'inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs transition-colors shrink-0 cursor-pointer',
                  isSelected
                    ? 'bg-primary/15 border-primary text-foreground font-semibold'
                    : acc
                      ? 'bg-background/45 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      : 'bg-background/25 border-dashed border-border/70 text-muted-foreground/70 hover:text-foreground'
                )}
              >
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
                  className="w-5 h-5 rounded-full object-cover border border-border shrink-0"
                />
                <span>{member.displayName}</span>
                {acc ? (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {acc.gameName}#{acc.tagLine}
                  </span>
                ) : (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    Vincular
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Link Riot ID Modal */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Vincular Riot ID</span>
            </DialogTitle>
          </DialogHeader>

          <Form {...linkForm}>
            <form onSubmit={handleSubmitLink} className="space-y-3">
              <FormField
                control={linkForm.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Miembro del Grupo</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(val) => {
                        field.onChange(val);
                        const existing = accountByUserId.get(val);
                        if (existing) {
                          linkForm.setValue('gameName', existing.gameName);
                          linkForm.setValue('tagLine', existing.tagLine);
                          linkForm.setValue('platform', existing.platform);
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Elegí miembro" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {groupMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-2">
                <FormField
                  control={linkForm.control}
                  name="gameName"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Game Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. SantiSuizo" {...field} />
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

              {linkError && (
                <p className="text-xs text-destructive font-medium bg-destructive/10 border border-destructive/40 rounded-md px-2.5 py-2">
                  {linkError}
                </p>
              )}

              <DialogFooter className="gap-2 pt-2">
                {accountByUserId.has(linkForm.watch('userId')) && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isSyncing}
                    onClick={async () => {
                      await onUnlinkAccount(linkForm.getValues('userId'));
                      setIsLinkDialogOpen(false);
                    }}
                  >
                    <Unlink className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Desvincular</span>
                  </Button>
                )}
                <Button type="submit" disabled={isSyncing}>
                  {isSyncing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <Link2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                  )}
                  <span>{isSyncing ? 'Sincronizando...' : 'Vincular y Sync'}</span>
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
