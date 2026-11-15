import React, { useEffect, useState } from 'react';
import { GamingSession, PlayerProfile } from '@/types/domain';
import { getEffectiveDailySchedule } from '@/lib/matchmakingEngine';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Check, Users } from 'lucide-react';

export interface SessionManageInvitesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSession: GamingSession;
  groupMembers: PlayerProfile[];
  currentUserId: string;
  onSaveInvites: (invitedUserIds?: string[]) => void;
}

export const SessionManageInvitesModal: React.FC<SessionManageInvitesModalProps> = ({
  open,
  onOpenChange,
  activeSession,
  groupMembers,
  currentUserId,
  onSaveInvites,
}) => {
  const [inviteMode, setInviteMode] = useState<'all' | 'custom'>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      const hasCustom =
        activeSession.invitedUserIds && activeSession.invitedUserIds.length > 0;
      setInviteMode(hasCustom ? 'custom' : 'all');
      setSelectedUserIds(
        hasCustom
          ? Array.from(new Set([...(activeSession.invitedUserIds ?? []), currentUserId]))
          : groupMembers.map((m) => m.id)
      );
    }
  }, [open, activeSession, groupMembers, currentUserId]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSave = () => {
    if (inviteMode === 'all') {
      onSaveInvites(undefined);
    } else {
      const finalIds = Array.from(new Set([...selectedUserIds, currentUserId]));
      onSaveInvites(finalIds);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
              <Users className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <DialogTitle>Invitados</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setInviteMode('all')}
              className={cn(
                'p-2.5 rounded-md border text-left transition-colors cursor-pointer',
                inviteMode === 'all'
                  ? 'bg-primary/15 border-primary text-foreground'
                  : 'bg-background/45 border-border/70 text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="text-xs font-semibold block">Todo el Grupo</span>
              <span className="text-[11px] text-muted-foreground">
                {groupMembers.length} miembros
              </span>
            </button>

            <button
              type="button"
              onClick={() => setInviteMode('custom')}
              className={cn(
                'p-2.5 rounded-md border text-left transition-colors cursor-pointer',
                inviteMode === 'custom'
                  ? 'bg-primary/15 border-primary text-foreground'
                  : 'bg-background/45 border-border/70 text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="text-xs font-semibold block">Selección Manual</span>
              <span className="text-[11px] text-muted-foreground">Selectiva</span>
            </button>
          </div>

          {inviteMode === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {groupMembers.map((member) => {
                const isCreatorOrMe =
                  member.id === currentUserId || member.id === activeSession.createdBy;
                const isSelected = isCreatorOrMe || selectedUserIds.includes(member.id);
                const eff = getEffectiveDailySchedule(member, activeSession.date);

                return (
                  <button
                    key={member.id}
                    type="button"
                    disabled={isCreatorOrMe}
                    onClick={() => toggleUser(member.id)}
                    className={cn(
                      'p-2.5 rounded-md border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer disabled:opacity-80',
                      isSelected
                        ? 'bg-primary/15 border-primary/50 text-foreground'
                        : 'bg-background/45 border-border/70 text-muted-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={member.avatarUrl}
                        alt={member.displayName}
                        className="w-7 h-7 rounded-full object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-medium block truncate">
                          {member.displayName}
                        </span>
                        <span className="text-[10px] text-muted-foreground block">
                          {eff.plays ? `${eff.availableFrom} · ${eff.confidencePercentage}%` : 'No juega hoy'}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <Badge variant="default" className="text-[9px] px-1.5 py-0 shrink-0">
                        <Check className="w-2.5 h-2.5" strokeWidth={2} />
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
