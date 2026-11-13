import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { SessionsView } from './components/SessionsView';
import { GamesCatalogView } from './components/GamesCatalogView';
import { LeaderboardSanctionsView } from './components/LeaderboardSanctionsView';
import { DiscordIntegrationModal } from './components/DiscordIntegrationModal';
import { GlobalChatDrawer } from './components/GlobalChatDrawer';
import { NotificationCenterModal } from './components/NotificationCenterModal';
import { WelcomeAuthView } from './components/WelcomeAuthView';
import { OnboardingTourModal } from './components/OnboardingTourModal';
import { WeeklyScheduleModal } from './components/WeeklyScheduleModal';
import { useApp } from './context/AppContext';
import {
  Bell,
  Bot,
  CalendarClock,
  Dices,
  Flame,
  Gamepad2,
  MessageSquare,
  RotateCcw,
  Scale,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';

export function App() {
  const {
    currentUser,
    sessions,
    games,
    chatMessages,
    discordConfig,
    discordLogs,
    pushAlerts,
    isSupabaseConnected,
    resetDemoData,
    isAuthenticated,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'sessions' | 'games' | 'tribunal' | 'discord'>('sessions');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isDiscordModalOpen, setIsDiscordModalOpen] = useState(false);

  // If user is not authenticated, show Welcome & Profile Creation screen
  if (!isAuthenticated) {
    return <WelcomeAuthView />;
  }

  const openSessionsCount = sessions.filter((s) => s.status !== 'finished').length;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col relative overflow-x-hidden">
      {/* Ambient Neon Glow Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
      </div>

      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenChat={() => setIsChatOpen(true)}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenDiscordModal={() => setIsDiscordModalOpen(true)}
        unreadChatCount={chatMessages.length}
      />

      {/* Quick Status Strip */}
      <div className="relative z-10 border-b border-slate-800/80 bg-[#0d1322]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-indigo-300 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Jugando como: <strong className="text-white">{currentUser.displayName}</strong>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {currentUser.activeTitle}
              </span>
            </span>

            <span className="hidden sm:inline-flex items-center gap-1.5 text-slate-400">
              <Dices className="w-3.5 h-3.5 text-emerald-400" />
              <span>{openSessionsCount} sesiones activas</span>
            </span>

            <span className="hidden md:inline-flex items-center gap-1.5 text-slate-400">
              <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />
              <span>{games.length} juegos en el catálogo</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('discord')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#5865F2]/15 hover:bg-[#5865F2]/25 text-[#8ea1e1] border border-[#5865F2]/30 transition cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5 text-[#5865F2]" />
              <span>
                Canal Discord #{discordConfig.channelName} ({discordLogs.length} avisos)
              </span>
            </button>

            <button
              onClick={() => setIsNotificationsOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 transition cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5 text-emerald-400" />
              <span>Push ({pushAlerts.length})</span>
            </button>

            {isSupabaseConnected ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Supabase Live</span>
              </span>
            ) : (
              <button
                onClick={resetDemoData}
                title="Restaurar datos de demostración originales"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/70 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Reset Demo</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {activeTab === 'sessions' && <SessionsView />}
        {activeTab === 'games' && <GamesCatalogView />}
        {activeTab === 'tribunal' && <LeaderboardSanctionsView />}
        {activeTab === 'discord' && (
          <DiscordIntegrationModal isOpen={true} inlineView={true} onClose={() => setActiveTab('sessions')} />
        )}
      </main>

      {/* Floating Chat Trigger for Mobile & Desktop */}
      <button
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold shadow-xl shadow-indigo-950/60 border border-indigo-400/30 transition transform hover:scale-105 cursor-pointer"
      >
        <MessageSquare className="w-5 h-5" />
        <span>Chat Global</span>
        <span className="px-2 py-0.5 text-xs rounded-full bg-black/30 text-indigo-100">
          {chatMessages.length}
        </span>
      </button>

      {/* Modals & Drawers */}
      <GlobalChatDrawer isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      <NotificationCenterModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />

      {isDiscordModalOpen && (
        <DiscordIntegrationModal
          isOpen={isDiscordModalOpen}
          inlineView={false}
          onClose={() => setIsDiscordModalOpen(false)}
        />
      )}

      {/* Onboarding Tour & Weekly Schedule Modals */}
      <OnboardingTourModal />
      <WeeklyScheduleModal />
    </div>
  );
}

export default App;
