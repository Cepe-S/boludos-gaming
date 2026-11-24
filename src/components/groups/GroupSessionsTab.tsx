import React, { useState } from 'react';
import { Game, GamingGroup, GamingSession } from '@/types/domain';
import { InstantSessionModal } from '@/components/sessions/InstantSessionModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Trash2, Zap } from 'lucide-react';

export interface GroupSessionsTabProps {
  activeGroup: GamingGroup;
  currentUserId: string;
  isCreatorOrAdmin: boolean;
  groupSessions: GamingSession[];
  activeGroupSessions: GamingSession[];
  finishedGroupSessions: GamingSession[];
  gamesById: Map<string, Game>;
  onNavigateToSessions?: (sessionId?: string) => void;
  createInstantSession: (params: {
    groupId?: string;
    title?: string;
    startsInMinutes?: number;
  }) => GamingSession;
  deleteSession: (sessionId: string) => void;
  setActiveSessionId: (sessionId: string) => void;
}

export const GroupSessionsTab: React.FC<GroupSessionsTabProps> = ({
  activeGroup,
  currentUserId,
  isCreatorOrAdmin,
  groupSessions,
  activeGroupSessions,
  finishedGroupSessions,
  gamesById,
  onNavigateToSessions,
  createInstantSession,
  deleteSession,
  setActiveSessionId,
}) => {
  const [confirmDeleteGroupSessionId, setConfirmDeleteGroupSessionId] = useState<string | null>(
    null
  );
  const [showInstantModal, setShowInstantModal] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">
            Activas ({activeGroupSessions.length}) · Historial ({finishedGroupSessions.length})
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              size="xs"
              variant="secondary"
              disabled={activeGroupSessions.some((s) => s.sessionKind === 'instant')}
              onClick={() => setShowInstantModal(true)}
              title={
                activeGroupSessions.some((s) => s.sessionKind === 'instant')
                  ? 'Ya hay una convocatoria instantánea en curso'
                  : 'Convocar jugadores ahora'
              }
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
              <span>Convocar ahora</span>
            </Button>
            {onNavigateToSessions && (
              <Button size="xs" onClick={() => onNavigateToSessions()}>
                <span>Sesiones</span>
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          {groupSessions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Sin sesiones.</p>
          ) : (
            groupSessions.map((sess) => {
              const gId = sess.selectedGameId || sess.rouletteWinnerGameId;
              const game = gId ? gamesById.get(gId) : undefined;
              return (
                <div
                  key={sess.id}
                  className="p-3 rounded-md bg-background/45 border border-border flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {sess.title}
                      </span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {sess.date}
                      </Badge>
                      {game && (
                        <Badge variant="purple" className="text-[10px]">
                          {game.name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {sess.participants.length} anotados · Modo{' '}
                      {sess.mode === 'random' ? 'Ruleta' : 'Fijo'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {(sess.createdBy === currentUserId || isCreatorOrAdmin) &&
                      (confirmDeleteGroupSessionId === sess.id ? (
                        <>
                          <Button
                            size="xs"
                            variant="destructive"
                            onClick={() => {
                              deleteSession(sess.id);
                              setConfirmDeleteGroupSessionId(null);
                            }}
                            title="Confirmar eliminación"
                          >
                            <span>Borrar</span>
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => setConfirmDeleteGroupSessionId(null)}
                            title="Cancelar"
                          >
                            <span>No</span>
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="xs"
                          variant="destructive"
                          className="w-7 px-0"
                          onClick={() => setConfirmDeleteGroupSessionId(sess.id)}
                          title="Eliminar sesión"
                          aria-label="Eliminar sesión"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </Button>
                      ))}
                    <Button
                      size="xs"
                      variant="secondary"
                      className="w-7 px-0 shrink-0"
                      onClick={() => {
                        setActiveSessionId(sess.id);
                        onNavigateToSessions?.(sess.id);
                      }}
                      title="Ver sesión"
                      aria-label="Ver sesión"
                    >
                      <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <InstantSessionModal
        open={showInstantModal}
        onOpenChange={setShowInstantModal}
        groupName={activeGroup.name}
        onSubmit={({ startsInMinutes, title }) => {
          createInstantSession({
            groupId: activeGroup.id,
            startsInMinutes,
            title,
          });
          onNavigateToSessions?.();
        }}
      />
    </div>
  );
};
