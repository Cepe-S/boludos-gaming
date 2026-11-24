import React, { useState } from 'react';
import { GamingGroup } from '@/types/domain';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, Copy, Link as LinkIcon } from 'lucide-react';
import { GroupAvatarBadge } from './GroupAvatarBadge';
import { copyTextToClipboard } from './groupViewHelpers';

export interface GroupHeaderCardProps {
  activeGroup: GamingGroup;
  getGroupInviteLink: (inviteCode: string) => string;
  onNavigateToSessions?: (sessionId?: string) => void;
}

export const GroupHeaderCard: React.FC<GroupHeaderCardProps> = ({
  activeGroup,
  getGroupInviteLink,
  onNavigateToSessions,
}) => {
  const [copiedState, setCopiedState] = useState<'code' | 'link' | null>(null);

  const handleCopyInvite = async (mode: 'code' | 'link') => {
    const payload =
      mode === 'code'
        ? activeGroup.inviteCode
        : getGroupInviteLink(activeGroup.inviteCode);
    const ok = await copyTextToClipboard(payload);
    if (ok) {
      setCopiedState(mode);
      window.setTimeout(() => setCopiedState(null), 2200);
    }
  };

  return (
    <Card className="animate-adn-bento-in">
      <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <GroupAvatarBadge
            name={activeGroup.name}
            avatarUrl={activeGroup.avatarUrl}
            size="lg"
            seed={activeGroup.id}
          />
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-foreground truncate">
                {activeGroup.name}
              </h2>
              <Badge variant="outline" className="font-mono text-[10px]">
                {activeGroup.inviteCode}
              </Badge>
              {activeGroup.discordConfig?.enabled &&
                activeGroup.discordConfig?.webhookUrl && (
                  <Badge variant="success" className="text-[10px]">
                    Webhook Activo
                  </Badge>
                )}
            </div>
            {activeGroup.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {activeGroup.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Button
            size="xs"
            variant="outline"
            className="w-7 px-0"
            onClick={() => handleCopyInvite('code')}
            title={copiedState === 'code' ? 'Código copiado' : 'Copiar código'}
            aria-label={copiedState === 'code' ? 'Código copiado' : 'Copiar código'}
          >
            {copiedState === 'code' ? (
              <Check className="w-3.5 h-3.5 text-success" strokeWidth={2} />
            ) : (
              <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
          </Button>

          <Button
            size="xs"
            variant="secondary"
            className="w-7 px-0"
            onClick={() => handleCopyInvite('link')}
            title={copiedState === 'link' ? 'Link copiado' : 'Copiar link de invitación'}
            aria-label={
              copiedState === 'link' ? 'Link copiado' : 'Copiar link de invitación'
            }
          >
            {copiedState === 'link' ? (
              <Check className="w-3.5 h-3.5 text-success" strokeWidth={2} />
            ) : (
              <LinkIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
          </Button>

          {onNavigateToSessions && (
            <Button size="xs" onClick={() => onNavigateToSessions()} title="Ir a sesiones">
              <span>Sesiones</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
