import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  GamingGroup,
  GroupDiscordConfig,
  PlayerProfile,
} from '@/types/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { cn } from '@/lib/utils';
import { Hash, Plus } from 'lucide-react';
import {
  CreateGroupValues,
  GROUP_COLOR_PRESETS,
  buildInitialsSvgDataUrl,
  createGroupSchema,
} from './groupViewHelpers';

export interface GroupCreateJoinPanelProps {
  currentUser: PlayerProfile;
  players: PlayerProfile[];
  isCreateModalOpen: boolean;
  onCreateModalOpenChange: (open: boolean) => void;
  joinGroupByInviteCode: (
    inviteCode: string,
    userId?: string
  ) => { ok: boolean; group?: GamingGroup; error?: string };
  createGroup: (params: {
    name: string;
    description?: string;
    avatarUrl?: string;
    memberIds?: string[];
    discordConfig?: Partial<GroupDiscordConfig>;
  }) => GamingGroup;
  onGroupCreated: (groupId: string) => void;
}

export const GroupCreateJoinPanel: React.FC<GroupCreateJoinPanelProps> = ({
  currentUser,
  players,
  isCreateModalOpen,
  onCreateModalOpenChange,
  joinGroupByInviteCode,
  createGroup,
  onGroupCreated,
}) => {
  const [joinInput, setJoinInput] = useState('');
  const [joinBanner, setJoinBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [createAvatarMode, setCreateAvatarMode] = useState<'initials' | 'url'>('initials');
  const [createColorId, setCreateColorId] = useState<string>(GROUP_COLOR_PRESETS[0].id);
  const [createMemberIds, setCreateMemberIds] = useState<string[]>(() => [currentUser.id]);
  const [showCreateDiscord, setShowCreateDiscord] = useState(false);
  const [createDiscordConfig, setCreateDiscordConfig] = useState<GroupDiscordConfig>({
    enabled: true,
    webhookUrl: '',
    channelName: 'squad-gaming',
    guildName: '',
    mentionRoleId: '',
    useEveryoneMention: false,
  });

  const createForm = useForm<CreateGroupValues>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: '',
      description: '',
      avatarUrl: '',
    },
  });

  useEffect(() => {
    if (isCreateModalOpen) {
      createForm.reset({ name: '', description: '', avatarUrl: '' });
      setCreateAvatarMode('initials');
      setCreateColorId(GROUP_COLOR_PRESETS[0].id);
      setCreateMemberIds([currentUser.id]);
      setShowCreateDiscord(false);
    }
  }, [isCreateModalOpen, currentUser.id, createForm]);

  const handleJoinSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setJoinBanner(null);
    const res = joinGroupByInviteCode(joinInput);
    if (!res.ok) {
      setJoinBanner({
        type: 'error',
        text: res.error || 'No se pudo unir al grupo con ese código.',
      });
      return;
    }
    setJoinInput('');
    setJoinBanner({
      type: 'success',
      text: `Te uniste a "${res.group?.name}"!`,
    });
    window.setTimeout(() => setJoinBanner(null), 4500);
  };

  const handleCreateSubmit = createForm.handleSubmit((values) => {
    const preset =
      GROUP_COLOR_PRESETS.find((p) => p.id === createColorId) || GROUP_COLOR_PRESETS[0];
    const resolvedAvatar =
      createAvatarMode === 'url' && values.avatarUrl
        ? values.avatarUrl
        : buildInitialsSvgDataUrl(values.name, preset);

    const created = createGroup({
      name: values.name,
      description: values.description || undefined,
      avatarUrl: resolvedAvatar,
      memberIds: Array.from(new Set([currentUser.id, ...createMemberIds])),
      discordConfig: showCreateDiscord ? createDiscordConfig : undefined,
    });
    onGroupCreated(created.id);
    onCreateModalOpenChange(false);
  });

  return (
    <>
      {/* Top Toolbar: Quick Join + New Group */}
      <div className="p-3.5 rounded-md bg-card/50 border border-border flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <form
          onSubmit={handleJoinSubmit}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-xl"
        >
          <div className="relative flex-1">
            <Hash
              className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
              strokeWidth={1.75}
            />
            <Input
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="Código o link de invitación..."
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary" className="shrink-0">
            Unirme
          </Button>
        </form>

        <Button onClick={() => onCreateModalOpenChange(true)} className="shrink-0">
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          <span>Nuevo Grupo</span>
        </Button>
      </div>

      {joinBanner && (
        <div
          className={cn(
            'px-3.5 py-2.5 rounded-md border text-xs font-medium animate-ui-toast-in',
            joinBanner.type === 'success'
              ? 'bg-success/10 border-success/40 text-success'
              : 'bg-destructive/10 border-destructive/40 text-destructive'
          )}
        >
          {joinBanner.text}
        </div>
      )}

      {/* CREATE GROUP DIALOG (RHF + ZOD) */}
      <Dialog open={isCreateModalOpen} onOpenChange={onCreateModalOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Grupo</DialogTitle>
          </DialogHeader>

          <Form {...createForm}>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Grupo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Los Pibes del CS2" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Input placeholder="Co-op nocturno sin humo..." {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Avatar mode & color swatches */}
              <div className="space-y-2 p-3 rounded-md bg-background/45 border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Ícono del Grupo</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setCreateAvatarMode('initials')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] border cursor-pointer',
                        createAvatarMode === 'initials'
                          ? 'bg-primary/15 border-primary text-primary'
                          : 'bg-card/50 border-border text-muted-foreground'
                      )}
                    >
                      Iniciales
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateAvatarMode('url')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] border cursor-pointer',
                        createAvatarMode === 'url'
                          ? 'bg-primary/15 border-primary text-primary'
                          : 'bg-card/50 border-border text-muted-foreground'
                      )}
                    >
                      URL Imagen
                    </button>
                  </div>
                </div>

                {createAvatarMode === 'initials' ? (
                  <div className="flex items-center gap-2 pt-1">
                    {GROUP_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.label}
                        onClick={() => setCreateColorId(preset.id)}
                        className={cn(
                          'w-7 h-7 rounded-md bg-gradient-to-br border-2 cursor-pointer transition-transform',
                          preset.tailwindBg,
                          createColorId === preset.id
                            ? 'border-white scale-110'
                            : 'border-transparent opacity-70 hover:opacity-100'
                        )}
                      />
                    ))}
                  </div>
                ) : (
                  <FormField
                    control={createForm.control}
                    name="avatarUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input placeholder="https://..." {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Quick Initial Members Picker */}
              {players.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Invitar Jugadores Iniciales</Label>
                  <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {players.map((pl) => {
                      const isMe = pl.id === currentUser.id;
                      const selected = isMe || createMemberIds.includes(pl.id);
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          disabled={isMe}
                          onClick={() =>
                            setCreateMemberIds((prev) =>
                              prev.includes(pl.id)
                                ? prev.filter((id) => id !== pl.id)
                                : [...prev, pl.id]
                            )
                          }
                          className={cn(
                            'p-1.5 rounded border text-left flex items-center gap-2 text-xs cursor-pointer disabled:opacity-80',
                            selected
                              ? 'bg-primary/15 border-primary/50 text-foreground'
                              : 'bg-background/45 border-border text-muted-foreground'
                          )}
                        >
                          <img
                            src={pl.avatarUrl}
                            alt={pl.displayName}
                            className="w-5 h-5 rounded-full object-cover shrink-0"
                          />
                          <span className="truncate">{pl.displayName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Optional Initial Discord Webhook */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowCreateDiscord((p) => !p)}
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  {showCreateDiscord ? '− Ocultar Webhook' : '+ Webhook Discord'}
                </button>

                {showCreateDiscord && (
                  <div className="p-3 rounded-md bg-background/45 border border-border space-y-2">
                    <Input
                      type="url"
                      placeholder="URL del webhook de Discord"
                      value={createDiscordConfig.webhookUrl}
                      onChange={(e) =>
                        setCreateDiscordConfig((p) => ({
                          ...p,
                          webhookUrl: e.target.value,
                        }))
                      }
                    />
                    <Input
                      placeholder="Canal (ej: squad-gaming)"
                      value={createDiscordConfig.channelName}
                      onChange={(e) =>
                        setCreateDiscordConfig((p) => ({
                          ...p,
                          channelName: e.target.value,
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onCreateModalOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">Crear</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
};
