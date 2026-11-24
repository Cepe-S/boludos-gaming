import React, { useEffect, useMemo, useState } from 'react';
import { GamingGroup, PlayerProfile } from '@/types/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Crown,
  LogOut,
  Search,
  Shield,
  ShieldOff,
  UserMinus,
  UserPlus,
} from 'lucide-react';

export interface GroupMembersTabProps {
  activeGroup: GamingGroup;
  currentUser: PlayerProfile;
  players: PlayerProfile[];
  currentMembers: PlayerProfile[];
  isCreatorOrAdmin: boolean;
  updateGroup: (
    groupId: string,
    patch: Partial<Omit<GamingGroup, 'id' | 'createdAt'>>
  ) => void;
  addMemberToGroup: (groupId: string, userId: string) => void;
  removeMemberFromGroup: (groupId: string, userId: string) => void;
}

export const GroupMembersTab: React.FC<GroupMembersTabProps> = ({
  activeGroup,
  currentUser,
  players,
  currentMembers,
  isCreatorOrAdmin,
  updateGroup,
  addMemberToGroup,
  removeMemberFromGroup,
}) => {
  const [memberSearch, setMemberSearch] = useState('');
  const [memberFeedback, setMemberFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setMemberFeedback(null);
    setMemberSearch('');
  }, [activeGroup.id]);

  const availablePlatformPlayers = useMemo<PlayerProfile[]>(() => {
    const query = memberSearch.trim().toLowerCase();
    return players
      .filter((p) => !activeGroup.memberIds.includes(p.id))
      .filter((p) => {
        if (!query) return true;
        return (
          p.displayName.toLowerCase().includes(query) ||
          p.discordUsername.toLowerCase().includes(query)
        );
      });
  }, [activeGroup.memberIds, players, memberSearch]);

  const handleRemoveOrLeaveMember = (member: PlayerProfile) => {
    if (activeGroup.createdBy === member.id && activeGroup.memberIds.length > 1) {
      setMemberFeedback({
        type: 'error',
        text: 'El creador no puede abandonar el grupo mientras queden otros miembros. Eliminá el grupo en Configuración si querés cerrarlo.',
      });
      return;
    }
    removeMemberFromGroup(activeGroup.id, member.id);
    setMemberFeedback({
      type: 'success',
      text:
        member.id === currentUser.id
          ? `Saliste de "${activeGroup.name}".`
          : `Se removió a ${member.displayName} del grupo.`,
    });
  };

  const handleToggleAdmin = (member: PlayerProfile) => {
    if (!isCreatorOrAdmin) return;
    if (member.id === activeGroup.createdBy) return;
    const isAdmin = activeGroup.adminIds.includes(member.id);
    const nextAdmins = isAdmin
      ? activeGroup.adminIds.filter((id) => id !== member.id)
      : Array.from(new Set([...activeGroup.adminIds, member.id]));
    updateGroup(activeGroup.id, { adminIds: nextAdmins });
    setMemberFeedback({
      type: 'success',
      text: isAdmin
        ? `${member.displayName} pasó a ser Miembro.`
        : `${member.displayName} promovido a Admin.`,
    });
  };

  return (
    <div className="space-y-4">
      {memberFeedback && (
        <div
          className={cn(
            'px-3.5 py-2.5 rounded-md border text-xs font-medium',
            memberFeedback.type === 'success'
              ? 'bg-success/10 border-success/40 text-success'
              : 'bg-destructive/10 border-destructive/40 text-destructive'
          )}
        >
          {memberFeedback.text}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm">Miembros ({currentMembers.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Jugador</TableHead>
                <TableHead>Karma</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentMembers.map((member) => {
                const isCreator = activeGroup.createdBy === member.id;
                const isAdmin = isCreator || activeGroup.adminIds.includes(member.id);
                const isMe = member.id === currentUser.id;

                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <img
                          src={member.avatarUrl}
                          alt={member.displayName}
                          className="w-8 h-8 rounded-full border border-border object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-foreground">
                              {member.displayName}
                            </span>
                            {isMe && (
                              <Badge variant="default" className="text-[9px] px-1 py-0">
                                Vos
                              </Badge>
                            )}
                          </div>
                          {member.discordUsername && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              @{member.discordUsername}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold">
                      {member.karmaScore}
                    </TableCell>
                    <TableCell>
                      {isCreator ? (
                        <Badge variant="warning" className="text-[10px]">
                          <Crown className="w-3 h-3" strokeWidth={1.75} />
                          <span>Creador</span>
                        </Badge>
                      ) : isAdmin ? (
                        <Badge variant="default" className="text-[10px]">
                          <Shield className="w-3 h-3" strokeWidth={1.75} />
                          <span>Admin</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Miembro
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isCreatorOrAdmin && !isCreator && (
                          <Button
                            size="xs"
                            variant="outline"
                            className="w-7 px-0"
                            onClick={() => handleToggleAdmin(member)}
                            title={
                              isAdmin
                                ? `Quitar Admin a ${member.displayName}`
                                : `Hacer Admin a ${member.displayName}`
                            }
                            aria-label={
                              isAdmin
                                ? `Quitar Admin a ${member.displayName}`
                                : `Hacer Admin a ${member.displayName}`
                            }
                          >
                            {isAdmin ? (
                              <ShieldOff className="w-3.5 h-3.5" strokeWidth={1.75} />
                            ) : (
                              <Shield className="w-3.5 h-3.5" strokeWidth={1.75} />
                            )}
                          </Button>
                        )}
                        {(isMe || isCreatorOrAdmin) && !isCreator && (
                          <Button
                            size="xs"
                            variant="destructive"
                            className="w-7 px-0"
                            onClick={() => handleRemoveOrLeaveMember(member)}
                            title={isMe ? 'Salir del grupo' : `Expulsar a ${member.displayName}`}
                            aria-label={
                              isMe ? 'Salir del grupo' : `Expulsar a ${member.displayName}`
                            }
                          >
                            {isMe ? (
                              <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
                            ) : (
                              <UserMinus className="w-3.5 h-3.5" strokeWidth={1.75} />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Platform Members */}
      {availablePlatformPlayers.length > 0 && (
        <Card>
          <CardHeader className="pb-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Sumar Miembros</span>
            </CardTitle>
            <div className="relative w-full sm:w-56">
              <Search
                className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
                strokeWidth={1.75}
              />
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Buscar usuario..."
                className="pl-8 h-8 text-xs"
              />
            </div>
          </CardHeader>
          <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {availablePlatformPlayers.map((pl) => (
              <div
                key={pl.id}
                className="p-2.5 rounded-md bg-background/45 border border-border flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src={pl.avatarUrl}
                    alt={pl.displayName}
                    className="w-7 h-7 rounded-full object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-foreground block truncate">
                      {pl.displayName}
                    </span>
                    {pl.discordUsername && (
                      <span className="text-[10px] text-muted-foreground font-mono truncate block">
                        @{pl.discordUsername}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  className="w-7 px-0 shrink-0"
                  onClick={() => {
                    addMemberToGroup(activeGroup.id, pl.id);
                    setMemberFeedback({
                      type: 'success',
                      text: `${pl.displayName} agregado a ${activeGroup.name}.`,
                    });
                  }}
                  title={`Sumar a ${pl.displayName}`}
                  aria-label={`Sumar a ${pl.displayName}`}
                >
                  <UserPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
