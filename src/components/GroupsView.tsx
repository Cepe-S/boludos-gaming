import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { buildGroupPath, isValidGroupSubTab } from '@/lib/routes';
import {
  DiscordNotificationLog,
  Game,
  GamingSession,
  PlayerProfile,
} from '@/types/domain';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Calendar,
  Crown,
  FolderKanban,
  Gamepad2,
  Plus,
  Settings,
  Users,
  Webhook,
} from 'lucide-react';
import { DetailSubTab } from './groups/groupViewHelpers';
import { GroupAvatarBadge } from './groups/GroupAvatarBadge';
import { GroupCreateJoinPanel } from './groups/GroupCreateJoinPanel';
import { GroupHeaderCard } from './groups/GroupHeaderCard';
import { GroupMembersTab } from './groups/GroupMembersTab';
import { GroupGamesTab } from './groups/GroupGamesTab';
import { GroupDiscordTab } from './groups/GroupDiscordTab';
import { GroupSessionsTab } from './groups/GroupSessionsTab';
import { GroupSettingsTab } from './groups/GroupSettingsTab';

export interface GroupsViewProps {
  onNavigateToSessions?: (sessionId?: string) => void;
}

export const GroupsView: React.FC<GroupsViewProps> = ({
  onNavigateToSessions,
}) => {
  const {
    currentUser,
    players,
    sessions,
    games,
    preferences,
    updateGamePreference,
    updateSteamGameFeedback,
    userGroups,
    activeGroup,
    setActiveGroupId,
    createGroup,
    updateGroup,
    deleteGroup,
    joinGroupByInviteCode,
    addMemberToGroup,
    removeMemberFromGroup,
    addGameToGroup,
    removeGameFromGroup,
    addAndLinkGameToGroup,
    createInstantSession,
    deleteSession,
    testGroupDiscordWebhook,
    getGroupInviteLink,
    discordConfig,
    discordLogs,
    setActiveSessionId,
  } = useApp();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { groupId: routeGroupId, subTab: routeSubTab } = useParams<{
    groupId?: string;
    subTab?: string;
  }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!routeGroupId) return;
    const matched = userGroups.find((g) => g.id === routeGroupId);
    if (matched && activeGroup?.id !== matched.id) {
      setActiveGroupId(matched.id);
    }
  }, [routeGroupId, userGroups, activeGroup?.id, setActiveGroupId]);

  const detailTab: DetailSubTab = isValidGroupSubTab(routeSubTab) ? routeSubTab : 'members';

  const setDetailTab = useCallback(
    (nextTab: DetailSubTab) => {
      if (activeGroup) {
        navigate(buildGroupPath(activeGroup.id, nextTab));
      }
    },
    [activeGroup, navigate]
  );

  const handleSelectGroup = useCallback(
    (groupId: string) => {
      setActiveGroupId(groupId);
      navigate(buildGroupPath(groupId, detailTab));
    },
    [setActiveGroupId, navigate, detailTab]
  );

  const handleGroupCreated = useCallback(
    (groupId: string) => {
      setActiveGroupId(groupId);
      navigate(buildGroupPath(groupId, 'members'));
    },
    [setActiveGroupId, navigate]
  );

  const isCreatorOrAdmin = useMemo(() => {
    if (!activeGroup) return false;
    return (
      activeGroup.createdBy === currentUser.id ||
      activeGroup.adminIds.includes(currentUser.id)
    );
  }, [activeGroup, currentUser.id]);

  const currentMembers = useMemo<PlayerProfile[]>(() => {
    if (!activeGroup) return [];
    return players.filter((p) => activeGroup.memberIds.includes(p.id));
  }, [activeGroup, players]);

  const groupSessions = useMemo<GamingSession[]>(() => {
    if (!activeGroup) return [];
    return sessions
      .filter((s) => s.groupId === activeGroup.id)
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [activeGroup, sessions]);

  const activeGroupSessions = useMemo(
    () => groupSessions.filter((s) => s.status !== 'finished'),
    [groupSessions]
  );

  const finishedGroupSessions = useMemo(
    () => groupSessions.filter((s) => s.status === 'finished'),
    [groupSessions]
  );

  const groupGames = useMemo<Game[]>(() => {
    if (!activeGroup) return [];
    const allowed = new Set(activeGroup.gameIds);
    return games.filter((g) => allowed.has(g.id));
  }, [activeGroup, games]);

  const groupDiscordLogs = useMemo<DiscordNotificationLog[]>(() => {
    if (!activeGroup) return [];
    return discordLogs.filter((log) => log.groupId === activeGroup.id);
  }, [activeGroup, discordLogs]);

  const gamesById = useMemo(() => {
    const map = new Map<string, Game>();
    games.forEach((g) => map.set(g.id, g));
    return map;
  }, [games]);

  const settingsTabs: Array<{
    key: DetailSubTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }> = [
    {
      key: 'members',
      label: 'Miembros',
      icon: <Users className="w-4 h-4" strokeWidth={1.75} />,
      badge: activeGroup ? String(activeGroup.memberIds.length) : undefined,
    },
    {
      key: 'games',
      label: 'Juegos',
      icon: <Gamepad2 className="w-4 h-4" strokeWidth={1.75} />,
      badge: activeGroup ? String(activeGroup.gameIds.length) : undefined,
    },
    {
      key: 'discord',
      label: 'Discord',
      icon: <Webhook className="w-4 h-4" strokeWidth={1.75} />,
    },
    {
      key: 'sessions',
      label: 'Sesiones',
      icon: <Calendar className="w-4 h-4" strokeWidth={1.75} />,
      badge: activeGroup ? String(groupSessions.length) : undefined,
    },
    {
      key: 'settings',
      label: 'Ajustes',
      icon: <Settings className="w-4 h-4" strokeWidth={1.75} />,
    },
  ];

  return (
    <div className="space-y-4 animate-lol-reveal">
      <GroupCreateJoinPanel
        currentUser={currentUser}
        players={players}
        isCreateModalOpen={isCreateModalOpen}
        onCreateModalOpenChange={setIsCreateModalOpen}
        joinGroupByInviteCode={joinGroupByInviteCode}
        createGroup={createGroup}
        onGroupCreated={handleGroupCreated}
      />

      {/* Main Split Workspace: Left Group List + Right Active Group Repo Settings */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Group Selector List */}
        <aside className="w-full lg:w-72 shrink-0 space-y-2">
          <div className="px-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tus Grupos ({userGroups.length})
            </span>
          </div>

          {userGroups.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-center space-y-2">
                <FolderKanban
                  className="w-6 h-6 text-muted-foreground mx-auto"
                  strokeWidth={1.75}
                />
                <p className="text-xs text-muted-foreground">Sin grupos todavía.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {userGroups.map((group) => {
                const isSelected = activeGroup?.id === group.id;
                const isCreator = group.createdBy === currentUser.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => handleSelectGroup(group.id)}
                    className={cn(
                      'w-full p-2.5 rounded-md border text-left flex items-center gap-2.5 transition-colors cursor-pointer relative',
                      isSelected
                        ? 'bg-secondary/55 border-primary text-foreground'
                        : 'bg-card/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    )}
                  >
                    <GroupAvatarBadge
                      name={group.name}
                      avatarUrl={group.avatarUrl}
                      size="sm"
                      seed={group.id}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {group.name}
                        </span>
                        {isCreator && (
                          <Crown
                            className="w-3 h-3 text-warning shrink-0"
                            strokeWidth={1.75}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{group.memberIds.length} miemb.</span>
                        <span>·</span>
                        <span className="font-mono">{group.inviteCode}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right Active Group Detail Panel (GitHub Repo Settings Pattern) */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          {!activeGroup ? (
            <Card>
              <CardContent className="p-10 text-center space-y-3">
                <Users
                  className="w-8 h-8 text-primary mx-auto"
                  strokeWidth={1.75}
                />
                <h3 className="text-base font-bold text-foreground">
                  Seleccioná o creá un grupo
                </h3>
                <Button onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="w-4 h-4" strokeWidth={1.75} />
                  <span>Nuevo Grupo</span>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <GroupHeaderCard
                activeGroup={activeGroup}
                getGroupInviteLink={getGroupInviteLink}
                onNavigateToSessions={onNavigateToSessions}
              />

              {/* GitHub Repo Settings Tab Navigation */}
              <div className="flex flex-wrap gap-1 border-b border-border pb-2">
                {settingsTabs.map((t) => {
                  const active = detailTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setDetailTab(t.key)}
                      className={cn(
                        'px-3 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer',
                        active
                          ? 'bg-secondary/55 border-primary text-foreground'
                          : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-card'
                      )}
                    >
                      {t.icon}
                      <span>{t.label}</span>
                      {t.badge && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                          {t.badge}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>

              {detailTab === 'members' && (
                <GroupMembersTab
                  activeGroup={activeGroup}
                  currentUser={currentUser}
                  players={players}
                  currentMembers={currentMembers}
                  isCreatorOrAdmin={isCreatorOrAdmin}
                  updateGroup={updateGroup}
                  addMemberToGroup={addMemberToGroup}
                  removeMemberFromGroup={removeMemberFromGroup}
                />
              )}

              {detailTab === 'games' && (
                <GroupGamesTab
                  activeGroup={activeGroup}
                  currentUser={currentUser}
                  isCreatorOrAdmin={isCreatorOrAdmin}
                  currentMembers={currentMembers}
                  games={games}
                  groupGames={groupGames}
                  preferences={preferences}
                  discordConfig={discordConfig}
                  addGameToGroup={addGameToGroup}
                  removeGameFromGroup={removeGameFromGroup}
                  addAndLinkGameToGroup={addAndLinkGameToGroup}
                  updateGamePreference={updateGamePreference}
                  updateSteamGameFeedback={updateSteamGameFeedback}
                />
              )}

              {detailTab === 'discord' && (
                <GroupDiscordTab
                  activeGroup={activeGroup}
                  groupDiscordLogs={groupDiscordLogs}
                  updateGroup={updateGroup}
                  testGroupDiscordWebhook={testGroupDiscordWebhook}
                />
              )}

              {detailTab === 'sessions' && (
                <GroupSessionsTab
                  activeGroup={activeGroup}
                  currentUserId={currentUser.id}
                  isCreatorOrAdmin={isCreatorOrAdmin}
                  groupSessions={groupSessions}
                  activeGroupSessions={activeGroupSessions}
                  finishedGroupSessions={finishedGroupSessions}
                  gamesById={gamesById}
                  onNavigateToSessions={onNavigateToSessions}
                  createInstantSession={createInstantSession}
                  deleteSession={deleteSession}
                  setActiveSessionId={setActiveSessionId}
                />
              )}

              {detailTab === 'settings' && (
                <GroupSettingsTab
                  activeGroup={activeGroup}
                  isCreatorOrAdmin={isCreatorOrAdmin}
                  groupSessionsCount={groupSessions.length}
                  updateGroup={updateGroup}
                  deleteGroup={deleteGroup}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
