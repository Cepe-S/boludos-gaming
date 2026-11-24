import React, { useEffect, useMemo, useState } from 'react';
import {
  DiscordNotificationLog,
  GamingGroup,
  GroupDiscordConfig,
} from '@/types/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Send, Webhook } from 'lucide-react';

export interface GroupDiscordTabProps {
  activeGroup: GamingGroup;
  groupDiscordLogs: DiscordNotificationLog[];
  updateGroup: (
    groupId: string,
    patch: Partial<Omit<GamingGroup, 'id' | 'createdAt'>>
  ) => void;
  testGroupDiscordWebhook: (groupId: string) => Promise<{ ok: boolean; error?: string }>;
}

export const GroupDiscordTab: React.FC<GroupDiscordTabProps> = ({
  activeGroup,
  groupDiscordLogs,
  updateGroup,
  testGroupDiscordWebhook,
}) => {
  const [discordForm, setDiscordForm] = useState<GroupDiscordConfig>(() => ({
    enabled: activeGroup.discordConfig?.enabled ?? true,
    webhookUrl: activeGroup.discordConfig?.webhookUrl ?? '',
    channelName: activeGroup.discordConfig?.channelName ?? '',
    guildName: activeGroup.discordConfig?.guildName ?? '',
    mentionRoleId: activeGroup.discordConfig?.mentionRoleId ?? '',
    useEveryoneMention: activeGroup.discordConfig?.useEveryoneMention ?? false,
  }));
  const [discordSaveFeedback, setDiscordSaveFeedback] = useState<string | null>(null);
  const [discordTestState, setDiscordTestState] = useState<{
    loading: boolean;
    ok?: boolean;
    message?: string;
  }>({ loading: false });

  useEffect(() => {
    setDiscordForm({
      enabled: activeGroup.discordConfig?.enabled ?? true,
      webhookUrl: activeGroup.discordConfig?.webhookUrl ?? '',
      channelName: activeGroup.discordConfig?.channelName ?? '',
      guildName: activeGroup.discordConfig?.guildName ?? '',
      mentionRoleId: activeGroup.discordConfig?.mentionRoleId ?? '',
      useEveryoneMention: activeGroup.discordConfig?.useEveryoneMention ?? false,
    });
    setDiscordSaveFeedback(null);
    setDiscordTestState({ loading: false });
  }, [activeGroup.id]);

  const isDiscordFormDirty = useMemo(() => {
    const current = activeGroup.discordConfig;
    return (
      discordForm.enabled !== current.enabled ||
      discordForm.webhookUrl.trim() !== (current.webhookUrl || '').trim() ||
      discordForm.channelName.trim() !== (current.channelName || '').trim() ||
      discordForm.guildName.trim() !== (current.guildName || '').trim() ||
      discordForm.mentionRoleId.trim() !== (current.mentionRoleId || '').trim() ||
      discordForm.useEveryoneMention !== current.useEveryoneMention
    );
  }, [activeGroup.discordConfig, discordForm]);

  const handleSaveDiscordConfig = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateGroup(activeGroup.id, {
      discordConfig: {
        enabled: discordForm.enabled,
        webhookUrl: discordForm.webhookUrl.trim(),
        channelName: discordForm.channelName.trim() || 'squad-gaming',
        guildName: discordForm.guildName.trim(),
        mentionRoleId: discordForm.mentionRoleId.trim(),
        useEveryoneMention: discordForm.useEveryoneMention,
      },
    });
    setDiscordSaveFeedback('Configuración Discord guardada.');
    window.setTimeout(() => setDiscordSaveFeedback(null), 3500);
  };

  const handleTestDiscordWebhook = async () => {
    setDiscordTestState({ loading: true });
    if (isDiscordFormDirty) {
      updateGroup(activeGroup.id, { discordConfig: discordForm });
    }
    const res = await testGroupDiscordWebhook(activeGroup.id);
    setDiscordTestState({
      loading: false,
      ok: res.ok,
      message: res.ok
        ? 'Embed de prueba enviado correctamente a Discord!'
        : res.error || 'No se pudo enviar al webhook.',
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Webhook className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <span>Webhook Discord</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-4">
          <form onSubmit={handleSaveDiscordConfig} className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-md bg-background/45 border border-border">
              <Label className="text-xs">Webhook Activo</Label>
              <Switch
                checked={discordForm.enabled}
                onCheckedChange={(val) =>
                  setDiscordForm((p) => ({ ...p, enabled: val }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Discord Webhook URL</Label>
              <Input
                type="url"
                value={discordForm.webhookUrl}
                onChange={(e) =>
                  setDiscordForm((p) => ({
                    ...p,
                    webhookUrl: e.target.value,
                  }))
                }
                placeholder="URL del webhook de Discord"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nombre del Canal</Label>
                <Input
                  value={discordForm.channelName}
                  onChange={(e) =>
                    setDiscordForm((p) => ({
                      ...p,
                      channelName: e.target.value,
                    }))
                  }
                  placeholder="#squad-gaming"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Servidor (Guild)</Label>
                <Input
                  value={discordForm.guildName}
                  onChange={(e) =>
                    setDiscordForm((p) => ({
                      ...p,
                      guildName: e.target.value,
                    }))
                  }
                  placeholder="Boludos Server"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Role ID Mención</Label>
                <Input
                  value={discordForm.mentionRoleId}
                  onChange={(e) =>
                    setDiscordForm((p) => ({
                      ...p,
                      mentionRoleId: e.target.value,
                    }))
                  }
                  placeholder="Ej: 1234567890"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-md bg-background/45 border border-border">
              <Label className="text-xs">Mencionar @here / @everyone</Label>
              <Switch
                checked={discordForm.useEveryoneMention}
                onCheckedChange={(val) =>
                  setDiscordForm((p) => ({
                    ...p,
                    useEveryoneMention: val,
                  }))
                }
              />
            </div>

            {discordSaveFeedback && (
              <div className="p-2.5 rounded-md bg-success/10 border border-success/40 text-xs text-success">
                {discordSaveFeedback}
              </div>
            )}

            {discordTestState.message && (
              <div
                className={cn(
                  'p-2.5 rounded-md border text-xs',
                  discordTestState.ok
                    ? 'bg-success/10 border-success/40 text-success'
                    : 'bg-destructive/10 border-destructive/40 text-destructive'
                )}
              >
                {discordTestState.message}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={discordTestState.loading}
                onClick={handleTestDiscordWebhook}
                title="Probar Webhook"
                aria-label="Probar Webhook"
              >
                <Send className="w-4 h-4" strokeWidth={1.75} />
                <span>{discordTestState.loading ? 'Probando...' : 'Probar'}</span>
              </Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Recent Logs for this group */}
      <Card>
        <CardHeader className="pb-2 border-b border-border">
          <CardTitle className="text-sm">Logs Discord ({groupDiscordLogs.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2 max-h-60 overflow-y-auto">
          {groupDiscordLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              Sin eventos registrados.
            </p>
          ) : (
            groupDiscordLogs.slice(0, 8).map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-md bg-background/45 border border-border space-y-1 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{log.embed.title}</span>
                  <Badge
                    variant={log.deliveredToWebhook ? 'success' : 'secondary'}
                    className="text-[9px]"
                  >
                    {log.deliveredToWebhook ? 'Webhook OK' : 'Mirror Local'}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {log.embed.description}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
