import React, { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getEffectiveScheduleForDate } from '@/lib/matchmakingEngine';
import { AppTab, ROUTES, TAB_TITLES } from '@/lib/routes';
import { Link } from 'react-router-dom';
import { BrandWordmark } from '@/components/layout/BrandWordmark';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  applyTheme,
  getStoredTheme,
  THEME_PALETTES,
  ThemePaletteId,
} from '@/lib/theme';
import {
  Bell,
  Bot,
  Calendar,
  Check,
  Copy,
  Menu,
  MessageSquare,
  Palette,
  Users,
} from 'lucide-react';

export interface AppHeaderProps {
  activeTab: AppTab;
  onOpenMobileSidebar: () => void;
  onOpenChat: () => void;
  onOpenNotifications: () => void;
  onOpenDiscordModal: () => void;
}

const TAB_LABELS = TAB_TITLES;

function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  activeTab,
  onOpenMobileSidebar,
  onOpenChat,
  onOpenNotifications,
  onOpenDiscordModal,
}) => {
  const {
    currentUser,
    activeGroup,
    discordConfig,
    discordLogs,
    pushAlerts,
    chatMessages,
    notificationPermission,
    setShowWeeklyScheduleModal,
  } = useApp();

  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTheme, setActiveTheme] = useState<ThemePaletteId>(() => getStoredTheme());

  const handleSelectTheme = (themeId: ThemePaletteId) => {
    applyTheme(themeId);
    setActiveTheme(themeId);
  };

  const todaySchedule = useMemo(
    () => getEffectiveScheduleForDate(currentUser, getTodayDateStr()),
    [currentUser]
  );

  const activeDiscordChannel =
    activeGroup?.discordConfig.channelName?.trim() ||
    discordConfig.channelName ||
    'boludos-gaming';

  const handleCopyInviteCode = async () => {
    if (!activeGroup?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(activeGroup.inviteCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full h-14 border-b border-border/70 bg-background/75 backdrop-blur-md px-4 lg:pl-0 flex items-center justify-between gap-3">
      {/* Left: Brand Mark + Mobile Sidebar Toggle + Contextual Breadcrumb */}
      <div className="flex items-center gap-2.5 lg:gap-0 min-w-0">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={onOpenMobileSidebar}
          className="lg:hidden shrink-0"
          title="Menú"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" strokeWidth={1.75} />
        </Button>

        <Link
          to={ROUTES.SESSIONS}
          className="hidden lg:flex lg:w-60 lg:h-7 lg:px-4 items-center border-r border-border/70 shrink-0 focus:outline-none"
          aria-label="Ir a Sesiones"
        >
          <BrandWordmark />
        </Link>

        <div className="flex items-center gap-2 min-w-0 text-xs lg:pl-4">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-muted-foreground truncate max-w-[160px]">
            <Users className="w-4 h-4 text-primary shrink-0" strokeWidth={1.75} />
            <span className="truncate font-medium">
              {activeGroup ? activeGroup.name : 'Sin grupo'}
            </span>
          </span>
          <span className="hidden sm:inline text-border">/</span>
          <h1 className="text-sm font-semibold text-foreground truncate">
            {TAB_LABELS[activeTab]}
          </h1>

          {activeGroup?.inviteCode && (
            <button
              type="button"
              onClick={handleCopyInviteCode}
              title={`Copiar código ${activeGroup.inviteCode}`}
              aria-label={`Copiar código de invitación ${activeGroup.inviteCode}`}
              className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary hover:bg-accent border border-border text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <span>{activeGroup.inviteCode}</span>
              {copiedCode ? (
                <Check className="w-3 h-3 text-success" strokeWidth={2} />
              ) : (
                <Copy className="w-3 h-3" strokeWidth={1.75} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Right: Operational Status & Slide-over Triggers */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Today's Auto Schedule Pill */}
        <button
          type="button"
          onClick={() => setShowWeeklyScheduleModal(true)}
          title="Horario semanal"
          aria-label="Configurar horario semanal"
          className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-card hover:bg-accent text-[11px] transition-colors cursor-pointer"
        >
          <Calendar className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
          {todaySchedule.plays ? (
            <span className="text-foreground font-medium">
              <span className="font-mono text-success">
                {todaySchedule.availableFrom}–{todaySchedule.availableUntil}
              </span>{' '}
              <span className="text-muted-foreground">±{todaySchedule.precisionMinutes}m</span>
            </span>
          ) : (
            <span className="text-destructive font-medium">Hoy: No</span>
          )}
        </button>

        {/* Discord Feed & Bot Button */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onOpenDiscordModal}
          title={`Discord #${activeDiscordChannel}`}
          aria-label="Abrir Discord"
        >
          <Bot className="w-4 h-4 text-primary" strokeWidth={1.75} />
          <span className="hidden sm:inline font-mono text-[11px]">
            #{activeDiscordChannel}
          </span>
          <Badge variant="default" className="px-1.5 py-0 text-[10px]">
            {discordLogs.length}
          </Badge>
        </Button>

        {/* Push Notifications Button */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onOpenNotifications}
          title="Notificaciones"
          aria-label="Abrir notificaciones"
          className="relative"
        >
          <Bell className="w-4 h-4" strokeWidth={1.75} />
          <span
            className={`w-2 h-2 rounded-full ${
              notificationPermission === 'granted'
                ? 'bg-success'
                : notificationPermission === 'denied'
                ? 'bg-destructive'
                : 'bg-warning'
            }`}
          />
          {pushAlerts.length > 0 && (
            <span className="text-[11px] font-mono text-foreground">{pushAlerts.length}</span>
          )}
        </Button>

        {/* Theme Palette Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="px-2"
              title="Paleta de colores"
              aria-label="Cambiar paleta de colores"
            >
              <Palette className="w-4 h-4 text-primary" strokeWidth={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {THEME_PALETTES.map((palette) => {
              const isSelected = activeTheme === palette.id;
              return (
                <DropdownMenuItem
                  key={palette.id}
                  onClick={() => handleSelectTheme(palette.id)}
                  className="flex items-center justify-between gap-3 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium truncate">
                    <Check
                      className={`w-3.5 h-3.5 text-primary shrink-0 ${
                        isSelected ? 'opacity-100' : 'opacity-0'
                      }`}
                      strokeWidth={2}
                    />
                    <span>{palette.label}</span>
                  </span>
                  <span
                    className="flex items-center h-3 w-20 rounded-sm overflow-hidden border border-border shrink-0"
                    aria-hidden="true"
                  >
                    {palette.colors.map((hex, idx) => (
                      <span
                        key={`${palette.id}-c-${idx}`}
                        className="h-full flex-1"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Global Chat Sheet Trigger */}
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onOpenChat}
          title="Chat global"
          aria-label="Abrir chat global"
        >
          <MessageSquare className="w-4 h-4" strokeWidth={1.75} />
          <span className="px-1.5 py-0.2 rounded bg-black/25 text-[10px] font-mono">
            {chatMessages.length}
          </span>
        </Button>
      </div>
    </header>
  );
};
