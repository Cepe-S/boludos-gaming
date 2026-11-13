import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Gamepad2,
  Trophy,
  Scale,
  Bot,
  Bell,
  MessageSquare,
  Flame,
  ChevronDown,
  Sparkles,
  ExternalLink,
  Menu,
  X,
  Radio,
  Clock,
  Ghost,
  ShieldCheck,
  Check,
} from 'lucide-react';

export interface NavbarProps {
  activeTab: 'sessions' | 'games' | 'tribunal' | 'discord';
  setActiveTab: (tab: 'sessions' | 'games' | 'tribunal' | 'discord') => void;
  onOpenChat: () => void;
  onOpenNotifications: () => void;
  onOpenDiscordModal: () => void;
  unreadChatCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenChat,
  onOpenNotifications,
  onOpenDiscordModal,
  unreadChatCount = 0,
}) => {
  const {
    currentUser,
    players,
    switchActivePlayer,
    loginWithDiscord,
    isSupabaseConnected,
    notificationPermission,
    pushAlerts,
    discordConfig,
  } = useApp();

  const [isPlayerDropdownOpen, setIsPlayerDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsPlayerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helper for karma badge color
  const getKarmaColorClass = (score: number) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40 shadow-emerald-950/30';
    if (score >= 50) return 'text-amber-400 bg-amber-950/60 border-amber-500/40 shadow-amber-950/30';
    return 'text-rose-400 bg-rose-950/60 border-rose-500/40 shadow-rose-950/30';
  };

  // Helper for notification status dot
  const getNotificationDotColor = () => {
    if (notificationPermission === 'granted') return 'bg-emerald-400 shadow-emerald-500/50';
    if (notificationPermission === 'denied') return 'bg-rose-400 shadow-rose-500/50';
    return 'bg-amber-400 shadow-amber-500/50';
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-indigo-950/50 bg-[#090d16]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('sessions')}
              className="flex items-center gap-2.5 text-left group focus:outline-none"
            >
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 p-0.5 shadow-lg shadow-indigo-600/30 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-[#090d16] rounded-[10px] flex items-center justify-center">
                  <Flame className="w-5 h-5 text-indigo-400 group-hover:text-amber-400 transition-colors" />
                </div>
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-black tracking-wider bg-gradient-to-r from-indigo-400 via-violet-300 to-amber-300 bg-clip-text text-transparent">
                    BOLUDOS
                  </span>
                  <span className="text-lg font-bold tracking-tight text-white">GAMING</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    ARG
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
                  Matchmaking con Horario ±min y Tribunal del Humo
                </p>
              </div>
            </button>
          </div>

          {/* Center Navigation Tabs (Desktop) */}
          <nav className="hidden lg:flex items-center gap-1.5 p-1 bg-[#131c31]/80 rounded-xl border border-indigo-900/40">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'sessions'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 border border-indigo-400/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Gamepad2 className="w-4 h-4 text-amber-400" />
              <span>Sesiones & Ruleta</span>
            </button>

            <button
              onClick={() => setActiveTab('games')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'games'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 border border-indigo-400/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Trophy className="w-4 h-4 text-violet-400" />
              <span>Catálogo & Gustos (1-5★)</span>
            </button>

            <button
              onClick={() => setActiveTab('tribunal')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'tribunal'
                  ? 'bg-gradient-to-r from-rose-600 to-indigo-600 text-white shadow-md shadow-rose-600/25 border border-rose-400/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Scale className="w-4 h-4 text-rose-400" />
              <span>Tribunal del Humo</span>
            </button>

            <button
              onClick={() => setActiveTab('discord')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'discord'
                  ? 'bg-gradient-to-r from-[#5865F2] to-indigo-600 text-white shadow-md shadow-[#5865F2]/25 border border-[#5865F2]/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Bot className="w-4 h-4 text-sky-400" />
              <span>Canal de Discord</span>
            </button>
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Active Player Selector & Karma pill */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsPlayerDropdownOpen(!isPlayerDropdownOpen)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#131c31] hover:bg-[#1a2542] border border-indigo-900/50 transition-all text-left"
                title="Cambiar jugador de prueba / Ver perfil"
              >
                <div className="relative">
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.displayName}
                    className="w-7 h-7 rounded-full object-cover ring-2 ring-indigo-500/40"
                  />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#131c31]" />
                </div>

                <div className="hidden sm:flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white max-w-[90px] truncate">
                      {currentUser.displayName}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded border shadow-sm ${getKarmaColorClass(
                        currentUser.karmaScore
                      )}`}
                    >
                      {currentUser.karmaScore}%
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                    {currentUser.activeTitle}
                  </span>
                </div>

                <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
              </button>

              {/* Player Switcher Dropdown */}
              {isPlayerDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-[#0f172a] border border-indigo-900/60 shadow-2xl shadow-black/80 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3.5 py-2 border-b border-indigo-950/60">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                        {isSupabaseConnected ? 'Cambiar Jugador (Supabase Live)' : 'Cambiar Jugador Activo (Demo)'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {players.length} amigos
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Probá cómo cada uno ve el lobby según sus gustos y karma.
                    </p>
                  </div>

                  <div className="max-h-64 overflow-y-auto py-1 divide-y divide-slate-800/40">
                    {players.map((p) => {
                      const isActive = p.id === currentUser.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            switchActivePlayer(p.id);
                            setIsPlayerDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2 text-left hover:bg-indigo-950/40 transition-colors ${
                            isActive ? 'bg-indigo-950/60' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="relative">
                              <img
                                src={p.avatarUrl}
                                alt={p.displayName}
                                className="w-8 h-8 rounded-full object-cover ring-1 ring-indigo-500/30"
                              />
                              {isActive && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-[#0f172a] flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-white">
                                  {p.displayName}
                                </span>
                                {p.karmaScore >= 90 ? (
                                  <Clock className="w-3 h-3 text-emerald-400" />
                                ) : p.karmaScore < 60 ? (
                                  <Ghost className="w-3 h-3 text-rose-400" />
                                ) : null}
                              </div>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[130px]">
                                {p.activeTitle}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getKarmaColorClass(
                                p.karmaScore
                              )}`}
                            >
                              {p.karmaScore}%
                            </span>
                            <span className="block text-[9px] text-slate-400 mt-0.5">
                              {p.sessionsPlayed} partidas
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Discord OAuth Login trigger */}
                  <div className="p-2 border-t border-indigo-950/60 mt-1">
                    <button
                      onClick={() => {
                        loginWithDiscord();
                        setIsPlayerDropdownOpen(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-[#5865F2] hover:bg-[#4752c4] text-white shadow-md shadow-[#5865F2]/20 transition-colors"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      <span>
                        {isSupabaseConnected ? 'Vincular Discord OAuth' : 'Conectar Discord (Demo)'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Notifications Button */}
            <button
              onClick={onOpenNotifications}
              className="relative p-2 rounded-xl bg-[#131c31] hover:bg-[#1a2542] border border-indigo-900/50 text-slate-300 hover:text-white transition-colors"
              title="Centro de Notificaciones & Web Push PWA"
            >
              <Bell className="w-4 h-4" />
              {/* Permission & unread indicator */}
              <span
                className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full shadow-sm ring-1 ring-[#131c31] ${getNotificationDotColor()}`}
              />
              {pushAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-violet-600 text-[9px] font-bold text-white ring-2 ring-[#090d16]">
                  {pushAlerts.length}
                </span>
              )}
            </button>

            {/* Discord Bot Config & Live Feed Modal Button */}
            <button
              onClick={onOpenDiscordModal}
              className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#131c31] hover:bg-[#1a2542] border border-indigo-900/50 text-slate-300 hover:text-white transition-colors"
              title="Configurar Webhook y Bot Serverless de Discord"
            >
              <Bot className="w-4 h-4 text-[#5865F2]" />
              <span className="text-xs font-semibold hidden md:inline">Bot Discord</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  discordConfig.enabled ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
            </button>

            {/* Global Chat Toggle Button */}
            <button
              onClick={onOpenChat}
              className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600/80 to-violet-600/80 hover:from-indigo-600 hover:to-violet-600 border border-indigo-400/30 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all"
              title="Abrir Chat Global en Vivo"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Chat</span>
              {unreadChatCount > 0 && (
                <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white">
                  {unreadChatCount}
                </span>
              )}
            </button>

            {/* Mobile Menu Hamburger Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-xl bg-[#131c31] border border-indigo-900/50 text-slate-300 hover:text-white lg:hidden"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-indigo-950/60 bg-[#090d16] px-4 py-3 space-y-2 animate-in slide-in-from-top duration-200">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setActiveTab('sessions');
                setIsMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold border ${
                activeTab === 'sessions'
                  ? 'bg-indigo-600 text-white border-indigo-400'
                  : 'bg-[#131c31] text-slate-300 border-indigo-900/40'
              }`}
            >
              <Gamepad2 className="w-4 h-4 text-amber-400" />
              <span>Sesiones & Ruleta</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('games');
                setIsMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold border ${
                activeTab === 'games'
                  ? 'bg-indigo-600 text-white border-indigo-400'
                  : 'bg-[#131c31] text-slate-300 border-indigo-900/40'
              }`}
            >
              <Trophy className="w-4 h-4 text-violet-400" />
              <span>Catálogo (1-5★)</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('tribunal');
                setIsMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold border ${
                activeTab === 'tribunal'
                  ? 'bg-rose-600 text-white border-rose-400'
                  : 'bg-[#131c31] text-slate-300 border-indigo-900/40'
              }`}
            >
              <Scale className="w-4 h-4 text-rose-400" />
              <span>Tribunal del Humo</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('discord');
                setIsMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold border ${
                activeTab === 'discord'
                  ? 'bg-[#5865F2] text-white border-[#5865F2]'
                  : 'bg-[#131c31] text-slate-300 border-indigo-900/40'
              }`}
            >
              <Bot className="w-4 h-4 text-sky-400" />
              <span>Canal Discord</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Sincronización en Tiempo Real</span>
            </span>
            <span className="font-semibold text-indigo-400">
              {currentUser.displayName}: {currentUser.karmaScore}% Karma
            </span>
          </div>
        </div>
      )}
    </header>
  );
};
