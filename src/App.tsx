import React, { useState } from 'react';
import { AppSidebarContent, AppTab } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { MeshBackground } from '@/components/layout/MeshBackground';
import { SessionsView } from '@/components/SessionsView';
import { GroupsView } from '@/components/GroupsView';
import { GamesCatalogView } from '@/components/GamesCatalogView';
import { LeaderboardSanctionsView } from '@/components/LeaderboardSanctionsView';
import { LeagueOfLegendsView } from '@/components/LeagueOfLegendsView';
import { DiscordIntegrationModal } from '@/components/DiscordIntegrationModal';
import { GlobalChatDrawer } from '@/components/GlobalChatDrawer';
import { NotificationCenterModal } from '@/components/NotificationCenterModal';
import { WelcomeAuthView } from '@/components/WelcomeAuthView';
import { OnboardingTourModal } from '@/components/OnboardingTourModal';
import { WeeklyScheduleModal } from '@/components/WeeklyScheduleModal';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useApp } from '@/context/AppContext';

export function App() {
  const { isAuthenticated } = useApp();

  const [activeTab, setActiveTab] = useState<AppTab>('sessions');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isDiscordModalOpen, setIsDiscordModalOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <TooltipProvider delayDuration={200}>
        <MeshBackground />
        <WelcomeAuthView />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <MeshBackground />
      <div className="relative min-h-screen text-foreground flex flex-col">
        {/* Global Full-Width GitHub-Style Top Header */}
        <AppHeader
          activeTab={activeTab}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onOpenChat={() => setIsChatOpen(true)}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
          onOpenDiscordModal={() => setIsDiscordModalOpen(true)}
        />

        {/* Mobile Drawer Sidebar */}
        <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
          <SheetContent side="left" className="p-0 w-72 bg-card/70 backdrop-blur-md border-r border-border/70">
            <SheetTitle className="sr-only">Navegación Principal</SheetTitle>
            <AppSidebarContent
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onOpenDiscordModal={() => setIsDiscordModalOpen(true)}
              onItemNavigate={() => setIsMobileSidebarOpen(false)}
            />
          </SheetContent>
        </Sheet>

        {/* Below Header: Persistent Left Sidebar + Main Workspace */}
        <div className="flex-1 flex min-w-0">
          {/* Desktop Persistent Sidebar */}
          <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:shrink-0 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] border-r border-border/70 bg-card/55 backdrop-blur-md z-20">
            <AppSidebarContent
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onOpenDiscordModal={() => setIsDiscordModalOpen(true)}
              hideBrandHeader
            />
          </aside>

          {/* Main Workspace Column */}
          <main className="flex-1 min-w-0 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5">
            {activeTab === 'sessions' && (
              <SessionsView onNavigateToGroups={() => setActiveTab('groups')} />
            )}
            {activeTab === 'recommendations' && (
              <GamesCatalogView mode="recommendations-only" />
            )}
            {activeTab === 'groups' && (
              <GroupsView onNavigateToSessions={() => setActiveTab('sessions')} />
            )}
            {activeTab === 'games' && <GamesCatalogView />}
            {activeTab === 'lol' && <LeagueOfLegendsView />}
            {activeTab === 'tribunal' && <LeaderboardSanctionsView />}
            {activeTab === 'discord' && (
              <DiscordIntegrationModal
                isOpen={true}
                inlineView={true}
                onClose={() => setActiveTab('groups')}
              />
            )}
          </main>
        </div>

        {/* Slide-over Sheets & Modals */}
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

        <OnboardingTourModal />
        <WeeklyScheduleModal />
      </div>
    </TooltipProvider>
  );
}

export default App;
