import React, { useEffect, useState } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { AppSidebarContent } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { MeshBackground } from '@/components/layout/MeshBackground';
import { NotFoundView } from '@/components/layout/NotFoundView';
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
import { STORAGE_KEYS, saveToStorage } from '@/context/app/storageAndHelpers';
import { useGlobalOverlays } from '@/hooks/useGlobalOverlays';
import {
  ROUTES,
  buildGroupPath,
  buildLoginRedirectPath,
  buildSessionPath,
  consumePostAuthRedirect,
  getDocumentTitleForPath,
  getPathForTab,
  getTabFromPathname,
  sanitizeRedirectPath,
  savePostAuthRedirect,
} from '@/lib/routes';

const RootRedirect: React.FC = () => {
  const storedRedirect = consumePostAuthRedirect();
  return <Navigate to={sanitizeRedirectPath(storedRedirect)} replace />;
};

const LoginRoute: React.FC = () => {
  const { isAuthenticated } = useApp();
  const [searchParams] = useSearchParams();

  if (isAuthenticated) {
    const queryRedirect = searchParams.get('redirect');
    const storedRedirect = consumePostAuthRedirect();
    const target = sanitizeRedirectPath(queryRedirect ?? storedRedirect);
    return <Navigate to={target} replace />;
  }

  return <WelcomeAuthView />;
};

const InviteRoute: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const { isAuthenticated, joinGroupByInviteCode } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    const normalized = code?.trim().toUpperCase() || '';
    if (!normalized) {
      navigate(isAuthenticated ? ROUTES.SESSIONS : ROUTES.LOGIN, { replace: true });
      return;
    }

    if (!isAuthenticated) {
      saveToStorage(STORAGE_KEYS.PENDING_INVITE_CODE, normalized);
      savePostAuthRedirect(ROUTES.GROUPS);
      navigate(`${ROUTES.LOGIN}?invite=${encodeURIComponent(normalized)}`, { replace: true });
      return;
    }

    const res = joinGroupByInviteCode(normalized);
    if (res.ok && res.group) {
      navigate(buildGroupPath(res.group.id, 'members'), { replace: true });
    } else {
      saveToStorage(STORAGE_KEYS.PENDING_INVITE_CODE, normalized);
      navigate(ROUTES.GROUPS, { replace: true });
    }
  }, [code, isAuthenticated, joinGroupByInviteCode, navigate]);

  return null;
};

const ProtectedShell: React.FC = () => {
  const { isAuthenticated } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const {
    isChatOpen,
    isNotificationsOpen,
    isDiscordModalOpen,
    notifTab,
    scheduleTab,
    tourStep,
    openOverlay,
    closeOverlay,
    setNotifTab,
    setScheduleTab,
    setTourStep,
  } = useGlobalOverlays();

  const fromPath = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (!isAuthenticated) {
      savePostAuthRedirect(fromPath);
    }
  }, [isAuthenticated, fromPath]);

  // Close mobile drawer when route changes
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  if (!isAuthenticated) {
    return <Navigate to={buildLoginRedirectPath(fromPath)} replace />;
  }

  const activeTab = getTabFromPathname(location.pathname);

  return (
    <div className="relative min-h-screen text-foreground flex flex-col">
      {/* Global Full-Width GitHub-Style Top Header */}
      <AppHeader
        activeTab={activeTab}
        onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
        onOpenChat={() => openOverlay('chat')}
        onOpenNotifications={() => openOverlay('notifications')}
        onOpenDiscordModal={() => openOverlay('discord')}
      />

      {/* Mobile Drawer Sidebar */}
      <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
        <SheetContent
          side="left"
          className="p-0 w-72 bg-card/70 backdrop-blur-md border-r border-border/70"
        >
          <SheetTitle className="sr-only">Navegación Principal</SheetTitle>
          <AppSidebarContent
            activeTab={activeTab}
            setActiveTab={(tab) => navigate(getPathForTab(tab))}
            onOpenDiscordModal={() => openOverlay('discord')}
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
            setActiveTab={(tab) => navigate(getPathForTab(tab))}
            onOpenDiscordModal={() => openOverlay('discord')}
            hideBrandHeader
          />
        </aside>

        {/* Main Workspace Column */}
        <main className="flex-1 min-w-0 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5">
          <Outlet />
        </main>
      </div>

      {/* Slide-over Sheets & Modals (URL-synchronized via ?overlay=...) */}
      <GlobalChatDrawer isOpen={isChatOpen} onClose={() => closeOverlay()} />

      <NotificationCenterModal
        isOpen={isNotificationsOpen}
        onClose={() => closeOverlay()}
        activeTab={notifTab}
        onTabChange={setNotifTab}
      />

      {isDiscordModalOpen && (
        <DiscordIntegrationModal
          isOpen={isDiscordModalOpen}
          inlineView={false}
          onClose={() => closeOverlay()}
        />
      )}

      <OnboardingTourModal currentStep={tourStep} onStepChange={setTourStep} />
      <WeeklyScheduleModal activeTab={scheduleTab} onTabChange={setScheduleTab} />
    </div>
  );
};

export function App() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = getDocumentTitleForPath(location.pathname);
  }, [location.pathname]);

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <MeshBackground />
      <Routes>
        <Route path={ROUTES.LOGIN} element={<LoginRoute />} />
        <Route path={ROUTES.INVITE} element={<InviteRoute />} />

        <Route element={<ProtectedShell />}>
          <Route path={ROUTES.ROOT} element={<RootRedirect />} />
          <Route
            path={ROUTES.SESSIONS}
            element={<SessionsView onNavigateToGroups={() => navigate(ROUTES.GROUPS)} />}
          />
          <Route
            path={ROUTES.SESSION_DETAIL}
            element={<SessionsView onNavigateToGroups={() => navigate(ROUTES.GROUPS)} />}
          />
          <Route
            path={ROUTES.RECOMMENDATIONS}
            element={<GamesCatalogView mode="recommendations-only" />}
          />
          <Route path={ROUTES.GAMES} element={<GamesCatalogView />} />
          <Route path={ROUTES.LOL} element={<LeagueOfLegendsView />} />
          <Route path={ROUTES.TRIBUNAL} element={<LeaderboardSanctionsView />} />
          <Route
            path={ROUTES.GROUPS}
            element={
              <GroupsView
                onNavigateToSessions={(sessionId) => navigate(buildSessionPath(sessionId))}
              />
            }
          />
          <Route
            path={ROUTES.GROUP_DETAIL}
            element={
              <GroupsView
                onNavigateToSessions={(sessionId) => navigate(buildSessionPath(sessionId))}
              />
            }
          />
          <Route
            path={ROUTES.GROUP_SUBTAB}
            element={
              <GroupsView
                onNavigateToSessions={(sessionId) => navigate(buildSessionPath(sessionId))}
              />
            }
          />
          <Route
            path={ROUTES.DISCORD}
            element={
              <DiscordIntegrationModal
                isOpen={true}
                inlineView={true}
                onClose={() => navigate(ROUTES.GROUPS)}
              />
            }
          />
          <Route path="*" element={<NotFoundView />} />
        </Route>
      </Routes>
    </TooltipProvider>
  );
}

export default App;
