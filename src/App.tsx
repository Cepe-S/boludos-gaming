import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
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
import { ViewLoadingScreen } from '@/components/ui/ViewLoadingScreen';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useApp } from '@/context/AppContext';
import { STORAGE_KEYS, saveToStorage } from '@/context/app/storageAndHelpers';
import { useGlobalOverlays } from '@/hooks/useGlobalOverlays';
import { routeLoaders, scheduleIdleRoutePrefetch } from '@/lib/routePrefetch';
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

const SessionsView = lazy(() =>
  routeLoaders.sessions().then((m) => ({ default: m.SessionsView }))
);
const GroupsView = lazy(() =>
  routeLoaders.groups().then((m) => ({ default: m.GroupsView }))
);
const GamesCatalogView = lazy(() =>
  routeLoaders.games().then((m) => ({ default: m.GamesCatalogView }))
);
const RecommendationsView = lazy(() =>
  routeLoaders.recommendations().then((m) => ({ default: m.RecommendationsView }))
);
const LeaderboardSanctionsView = lazy(() =>
  routeLoaders.tribunal().then((m) => ({ default: m.LeaderboardSanctionsView }))
);
const LeagueOfLegendsView = lazy(() =>
  routeLoaders.lol().then((m) => ({ default: m.LeagueOfLegendsView }))
);
const DiscordIntegrationModal = lazy(() =>
  routeLoaders.discord().then((m) => ({ default: m.DiscordIntegrationModal }))
);
const GlobalChatDrawer = lazy(() =>
  routeLoaders.chat().then((m) => ({ default: m.GlobalChatDrawer }))
);
const NotificationCenterModal = lazy(() =>
  routeLoaders.notifications().then((m) => ({ default: m.NotificationCenterModal }))
);
const WelcomeAuthView = lazy(() =>
  routeLoaders.welcome().then((m) => ({ default: m.WelcomeAuthView }))
);
const OnboardingTourModal = lazy(() =>
  routeLoaders.onboarding().then((m) => ({ default: m.OnboardingTourModal }))
);
const WeeklyScheduleModal = lazy(() =>
  routeLoaders.schedule().then((m) => ({ default: m.WeeklyScheduleModal }))
);

const ModalLoadingFallback: React.FC = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 pointer-events-auto">
    <div className="rounded-lg border border-border bg-card px-5 py-3 shadow-xl">
      <ViewLoadingScreen label="Abriendo..." compact className="min-h-0 py-1" />
    </div>
  </div>
);

const DocumentTitleSync: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = getDocumentTitleForPath(pathname);
  }, [pathname]);
  return null;
};

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

  return (
    <Suspense fallback={<ViewLoadingScreen label="Cargando acceso..." />}>
      <WelcomeAuthView />
    </Suspense>
  );
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

const SessionsRoute: React.FC = () => {
  const navigate = useNavigate();
  const handleNavigateToGroups = useCallback(() => navigate(ROUTES.GROUPS), [navigate]);
  return (
    <Suspense fallback={<ViewLoadingScreen label="Cargando Sesiones..." />}>
      <SessionsView onNavigateToGroups={handleNavigateToGroups} />
    </Suspense>
  );
};

const GroupsRoute: React.FC = () => {
  const navigate = useNavigate();
  const handleNavigateToSessions = useCallback(
    (sessionId?: string) => navigate(buildSessionPath(sessionId)),
    [navigate]
  );
  return (
    <Suspense fallback={<ViewLoadingScreen label="Cargando Grupos..." />}>
      <GroupsView onNavigateToSessions={handleNavigateToSessions} />
    </Suspense>
  );
};

const DiscordInlineRoute: React.FC = () => {
  const navigate = useNavigate();
  const handleClose = useCallback(() => navigate(ROUTES.GROUPS), [navigate]);
  return (
    <Suspense fallback={<ViewLoadingScreen label="Cargando Discord..." />}>
      <DiscordIntegrationModal isOpen={true} inlineView={true} onClose={handleClose} />
    </Suspense>
  );
};

const ProtectedShell: React.FC = () => {
  const { isAuthenticated, showOnboardingModal, showWeeklyScheduleModal } = useApp();
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
  const activeTab = getTabFromPathname(location.pathname);

  useEffect(() => {
    if (!isAuthenticated) {
      savePostAuthRedirect(fromPath);
    }
  }, [isAuthenticated, fromPath]);

  // Warm up remaining route chunks during idle time so subsequent clicks are instant
  useEffect(() => {
    if (!isAuthenticated) return;
    return scheduleIdleRoutePrefetch(activeTab);
  }, [isAuthenticated, activeTab]);

  // Close mobile drawer when route changes
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  const handleSetActiveTab = useCallback(
    (tab: Parameters<typeof getPathForTab>[0]) => navigate(getPathForTab(tab)),
    [navigate]
  );
  const handleOpenMobileSidebar = useCallback(() => setIsMobileSidebarOpen(true), []);
  const handleCloseMobileSidebar = useCallback(() => setIsMobileSidebarOpen(false), []);
  const handleOpenChat = useCallback(() => openOverlay('chat'), [openOverlay]);
  const handleOpenNotifications = useCallback(() => openOverlay('notifications'), [openOverlay]);
  const handleOpenDiscordModal = useCallback(() => openOverlay('discord'), [openOverlay]);
  const handleCloseOverlay = useCallback(() => closeOverlay(), [closeOverlay]);

  if (!isAuthenticated) {
    return <Navigate to={buildLoginRedirectPath(fromPath)} replace />;
  }

  return (
    <div className="relative min-h-screen text-foreground flex flex-col">
      {/* Global Full-Width GitHub-Style Top Header */}
      <AppHeader
        activeTab={activeTab}
        onOpenMobileSidebar={handleOpenMobileSidebar}
        onOpenChat={handleOpenChat}
        onOpenNotifications={handleOpenNotifications}
        onOpenDiscordModal={handleOpenDiscordModal}
      />

      {/* Mobile Drawer Sidebar */}
      <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
        <SheetContent
          side="left"
          className="p-0 w-72 bg-card/92 border-r border-border/70"
        >
          <SheetTitle className="sr-only">Navegación Principal</SheetTitle>
          <AppSidebarContent
            activeTab={activeTab}
            setActiveTab={handleSetActiveTab}
            onOpenDiscordModal={handleOpenDiscordModal}
            onItemNavigate={handleCloseMobileSidebar}
          />
        </SheetContent>
      </Sheet>

      {/* Below Header: Persistent Left Sidebar + Main Workspace */}
      <div className="flex-1 flex min-w-0">
        {/* Desktop Persistent Sidebar */}
        <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:shrink-0 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] border-r border-border/70 bg-card/92 z-20">
          <AppSidebarContent
            activeTab={activeTab}
            setActiveTab={handleSetActiveTab}
            onOpenDiscordModal={handleOpenDiscordModal}
            hideBrandHeader
          />
        </aside>

        {/* Main Workspace Column */}
        <main className="flex-1 min-w-0 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5">
          <Outlet />
        </main>
      </div>

      {/* Slide-over Sheets & Modals (lazy-loaded on demand, prefetched on hover) */}
      {isChatOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <GlobalChatDrawer isOpen={isChatOpen} onClose={handleCloseOverlay} />
        </Suspense>
      )}

      {isNotificationsOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <NotificationCenterModal
            isOpen={isNotificationsOpen}
            onClose={handleCloseOverlay}
            activeTab={notifTab}
            onTabChange={setNotifTab}
          />
        </Suspense>
      )}

      {isDiscordModalOpen && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <DiscordIntegrationModal
            isOpen={isDiscordModalOpen}
            inlineView={false}
            onClose={handleCloseOverlay}
          />
        </Suspense>
      )}

      {showOnboardingModal && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <OnboardingTourModal currentStep={tourStep} onStepChange={setTourStep} />
        </Suspense>
      )}

      {showWeeklyScheduleModal && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <WeeklyScheduleModal activeTab={scheduleTab} onTabChange={setScheduleTab} />
        </Suspense>
      )}
    </div>
  );
};

export function App() {
  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <MeshBackground />
      <DocumentTitleSync />
      <Routes>
        <Route path={ROUTES.LOGIN} element={<LoginRoute />} />
        <Route path={ROUTES.INVITE} element={<InviteRoute />} />

        <Route element={<ProtectedShell />}>
          <Route path={ROUTES.ROOT} element={<RootRedirect />} />
          <Route path="/sessions/:sessionId?" element={<SessionsRoute />} />
          <Route
            path={ROUTES.RECOMMENDATIONS}
            element={
              <Suspense fallback={<ViewLoadingScreen label="Cargando Recomendaciones..." />}>
                <RecommendationsView />
              </Suspense>
            }
          />
          <Route
            path={ROUTES.GAMES}
            element={
              <Suspense fallback={<ViewLoadingScreen label="Cargando Catálogo & ADN..." />}>
                <GamesCatalogView />
              </Suspense>
            }
          />
          <Route
            path={ROUTES.LOL}
            element={
              <Suspense fallback={<ViewLoadingScreen label="Cargando League of Legends..." />}>
                <LeagueOfLegendsView />
              </Suspense>
            }
          />
          <Route
            path={ROUTES.TRIBUNAL}
            element={
              <Suspense fallback={<ViewLoadingScreen label="Cargando Tribunal del Humo..." />}>
                <LeaderboardSanctionsView />
              </Suspense>
            }
          />
          <Route path="/groups/:groupId?/:subTab?" element={<GroupsRoute />} />
          <Route path={ROUTES.DISCORD} element={<DiscordInlineRoute />} />
          <Route path="*" element={<NotFoundView />} />
        </Route>
      </Routes>
    </TooltipProvider>
  );
}

export default App;
