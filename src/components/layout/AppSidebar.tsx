import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { getPlayerArchetypeBadge } from '@/lib/playerCategorizationEngine';
import { PvjArchetypeIcon } from '@/components/PvjDimensionIcon';
import { BrandWordmark } from '@/components/layout/BrandWordmark';
import { AppTab, ROUTES, getPathForTab } from '@/lib/routes';
import { prefetchRouteModule, prefetchTabRoute } from '@/lib/routePrefetch';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Bot,
  Calendar,
  Check,
  ChevronDown,
  Gamepad2,
  LogOut,
  Plus,
  Scale,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';

export type { AppTab };

export interface AppSidebarContentProps {
  activeTab: AppTab;
  setActiveTab?: (tab: AppTab) => void;
  onOpenDiscordModal: () => void;
  onItemNavigate?: () => void;
  hideBrandHeader?: boolean;
}

function getGroupInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return 'BG';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function getKarmaBadgeVariant(score: number): 'success' | 'warning' | 'destructive' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'destructive';
}

export const AppSidebarContent: React.FC<AppSidebarContentProps> = React.memo(({
  activeTab,
  setActiveTab,
  onOpenDiscordModal,
  onItemNavigate,
  hideBrandHeader = false,
}) => {
  const {
    currentUser,
    games,
    preferences,
    sessions,
    sanctions,
    userGroups,
    activeGroup,
    setActiveGroupId,
    setShowWeeklyScheduleModal,
    setShowOnboardingModal,
    logout,
    discordConfig,
  } = useApp();

  const currentArchetype = useMemo(
    () => getPlayerArchetypeBadge(currentUser, preferences, games),
    [currentUser, preferences, games]
  );

  const needsTasteSetup =
    !currentUser.steamProfile &&
    !(currentUser.tasteProfile?.topMultiplayerGames?.length);

  const openSessionsCount = useMemo(() => {
    const scoped = activeGroup
      ? sessions.filter((s) => s.groupId === activeGroup.id)
      : sessions;
    return scoped.filter((s) => s.status !== 'finished').length;
  }, [sessions, activeGroup]);

  const scopedSanctionsCount = useMemo(() => {
    if (!activeGroup) return sanctions.length;
    const scopedIds = new Set(
      sessions.filter((s) => s.groupId === activeGroup.id).map((s) => s.id)
    );
    return sanctions.filter(
      (s) => s.groupId === activeGroup.id || scopedIds.has(s.sessionId)
    ).length;
  }, [sanctions, sessions, activeGroup]);

  const routerNavigate = useNavigate();

  const navigate = (tab: AppTab) => {
    if (setActiveTab) {
      setActiveTab(tab);
    } else {
      routerNavigate(getPathForTab(tab));
    }
    onItemNavigate?.();
  };

  const navItems: Array<{
    id: AppTab;
    label: string;
    icon: React.ReactNode;
    badge?: string | number;
    badgeVariant?: 'default' | 'secondary' | 'warning' | 'destructive' | 'success';
  }> = [
    {
      id: 'sessions',
      label: 'Sesiones & Ruleta',
      icon: <Gamepad2 className="w-5 h-5 shrink-0" strokeWidth={1.75} />,
      badge: openSessionsCount,
      badgeVariant: openSessionsCount > 0 ? 'default' : 'secondary',
    },
    {
      id: 'recommendations',
      label: 'Recomendaciones',
      icon: <Sparkles className="w-5 h-5 shrink-0" strokeWidth={1.75} />,
    },
    {
      id: 'lol',
      label: 'League of Legends',
      icon: <Swords className="w-5 h-5 shrink-0" strokeWidth={1.75} />,
    },
    {
      id: 'games',
      label: 'Catálogo & ADN',
      icon: <Trophy className="w-5 h-5 shrink-0" strokeWidth={1.75} />,
      badge: needsTasteSetup ? 'Setup' : games.length,
      badgeVariant: needsTasteSetup ? 'warning' : 'secondary',
    },
    {
      id: 'tribunal',
      label: 'Tribunal del Humo',
      icon: <Scale className="w-5 h-5 shrink-0" strokeWidth={1.75} />,
      badge: scopedSanctionsCount > 0 ? scopedSanctionsCount : undefined,
      badgeVariant: 'destructive',
    },
    {
      id: 'groups',
      label: 'Grupos & Discord',
      icon: <Users className="w-5 h-5 shrink-0" strokeWidth={1.75} />,
      badge: userGroups.length,
      badgeVariant: 'secondary',
    },
  ];

  return (
    <div className="flex flex-col h-full bg-card/50 text-card-foreground select-none">
      {/* Brand Header */}
      {!hideBrandHeader && (
        <div className="h-14 px-4 border-b border-border flex items-center shrink-0">
          <Link
            to={ROUTES.SESSIONS}
            onClick={() => onItemNavigate?.()}
            className="w-full flex items-center text-left cursor-pointer focus:outline-none"
            aria-label="Ir a Sesiones"
          >
            <BrandWordmark />
          </Link>
        </div>
      )}

      {/* Active Server / Group Selector */}
      <div className="p-3 border-b border-border shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Cambiar grupo activo"
              title="Cambiar grupo activo"
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-secondary/55 hover:bg-accent border border-border transition-colors text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <div className="flex items-center gap-2 min-w-0">
                {activeGroup?.avatarUrl ? (
                  <img
                    src={activeGroup.avatarUrl}
                    alt={activeGroup.name}
                    className="w-6 h-6 rounded-md object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-md bg-primary/20 border border-primary/40 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                    {activeGroup ? getGroupInitials(activeGroup.name) : <Users className="w-3.5 h-3.5" />}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {activeGroup?.name || 'Sin grupo'}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {activeGroup
                      ? `${activeGroup.memberIds.length} · ${activeGroup.inviteCode}`
                      : 'Seleccionar'}
                  </p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Grupos ({userGroups.length})</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {userGroups.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                Sin grupos
              </div>
            ) : (
              userGroups.map((group) => {
                const isSelected = group.id === activeGroup?.id;
                return (
                  <DropdownMenuItem
                    key={group.id}
                    onClick={() => {
                      setActiveGroupId(group.id);
                      onItemNavigate?.();
                    }}
                    className="justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded bg-primary/20 border border-primary/30 text-[9px] font-bold text-primary flex items-center justify-center shrink-0">
                        {getGroupInitials(group.name)}
                      </span>
                      <span className="truncate font-medium">{group.name}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-success shrink-0" />}
                  </DropdownMenuItem>
                );
              })
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('groups')} className="text-primary font-semibold">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              <span>Gestionar grupos</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto scroller-thin p-3 space-y-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              activeTab === item.id || (item.id === 'groups' && activeTab === 'discord');
            return (
              <Link
                key={item.id}
                to={getPathForTab(item.id)}
                onMouseEnter={() => prefetchTabRoute(item.id)}
                onFocus={() => prefetchTabRoute(item.id)}
                onClick={() => onItemNavigate?.()}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer border',
                  isActive
                    ? 'bg-primary/15 text-foreground border-primary/40 font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/70'
                )}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className={cn(isActive ? 'text-primary' : 'text-muted-foreground')}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <Badge variant={item.badgeVariant} className="px-1.5 py-0 text-[10px]">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>

        {/* Quick Tools */}
        <div className="space-y-1 pt-3 border-t border-border">
          <button
            type="button"
            onMouseEnter={() => prefetchRouteModule('schedule')}
            onFocus={() => prefetchRouteModule('schedule')}
            onClick={() => {
              setShowWeeklyScheduleModal(true);
              onItemNavigate?.();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-primary shrink-0" strokeWidth={1.75} />
            <span className="truncate">Mi Horario</span>
          </button>

          <button
            type="button"
            onMouseEnter={() => prefetchRouteModule('discord')}
            onFocus={() => prefetchRouteModule('discord')}
            onClick={() => {
              onOpenDiscordModal();
              onItemNavigate?.();
            }}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Bot className="w-4 h-4 text-primary shrink-0" strokeWidth={1.75} />
              <span className="truncate">Discord Bot</span>
            </span>
            <span
              className={cn(
                'w-2 h-2 rounded-full shrink-0',
                discordConfig.enabled ? 'bg-success' : 'bg-muted-foreground/50'
              )}
            />
          </button>

          <button
            type="button"
            onMouseEnter={() => prefetchRouteModule('onboarding')}
            onFocus={() => prefetchRouteModule('onboarding')}
            onClick={() => {
              setShowOnboardingModal(true);
              onItemNavigate?.();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-warning shrink-0" strokeWidth={1.75} />
            <span className="truncate">Tour</span>
          </button>
        </div>
      </div>

      {/* Bottom User Profile Dock */}
      <div className="p-2.5 border-t border-border bg-background shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/80 border border-transparent hover:border-border transition-colors text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
              title="Cuenta y ajustes"
              aria-label="Menú de usuario"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative shrink-0">
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.displayName}
                    className="w-8 h-8 rounded-md object-cover border border-border"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-background" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {currentUser.displayName}
                    </span>
                    <Badge
                      variant={getKarmaBadgeVariant(currentUser.karmaScore)}
                      className="px-1 py-0 text-[9px] font-mono"
                    >
                      {currentUser.karmaScore}%
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 min-w-0">
                    {currentArchetype.hasData ? (
                      <>
                        <PvjArchetypeIcon
                          hasData={currentArchetype.hasData}
                          type={currentArchetype.type}
                          primaryDimension={currentArchetype.primaryDimension}
                          secondaryDimension={currentArchetype.secondaryDimension}
                          iconClassName="w-3 h-3 shrink-0"
                        />
                        <span className="truncate">{currentArchetype.name}</span>
                      </>
                    ) : (
                      <span className="truncate">{currentUser.activeTitle}</span>
                    )}
                  </span>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent side="top" align="start" className="w-64 p-2 space-y-2">
            <div className="p-2 rounded-md bg-secondary/55 border border-border space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {currentUser.displayName}
                  </p>
                  {currentUser.discordUsername && (
                    <p className="text-[11px] font-mono text-muted-foreground truncate">
                      @{currentUser.discordUsername}
                    </p>
                  )}
                </div>
                <Badge variant={getKarmaBadgeVariant(currentUser.karmaScore)}>
                  {currentUser.karmaScore}%
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] pt-1.5 border-t border-border">
                <div className="bg-background/45 p-1 rounded border border-border">
                  <span className="text-muted-foreground block">Partidas</span>
                  <strong className="text-foreground">{currentUser.sessionsPlayed}</strong>
                </div>
                <div className="bg-background/45 p-1 rounded border border-border">
                  <span className="text-success block">Puntual</span>
                  <strong className="text-foreground">{currentUser.onTimeCount}</strong>
                </div>
                <div className="bg-background/45 p-1 rounded border border-border">
                  <span className="text-warning block">Racha</span>
                  <strong className="text-foreground">{currentUser.currentStreak} 🔥</strong>
                </div>
              </div>
            </div>

            <DropdownMenuItem
              onClick={() => {
                setShowWeeklyScheduleModal(true);
                onItemNavigate?.();
              }}
            >
              <Calendar className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Mi Horario</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => {
                setShowOnboardingModal(true);
                onItemNavigate?.();
              }}
            >
              <Sparkles className="w-4 h-4 text-warning" strokeWidth={1.75} />
              <span>Tour</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => logout()}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
              <span>Cerrar sesión</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});
