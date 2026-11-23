import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import {
  GlobalOverlayKind,
  NotificationSubTab,
  ScheduleSubTab,
  TourStepParam,
  isValidGlobalOverlay,
} from '@/lib/routes';

const OVERLAY_EXTRA_KEYS = ['notifTab', 'scheduleTab', 'step'] as const;

export function useGlobalOverlays() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    showWeeklyScheduleModal,
    setShowWeeklyScheduleModal,
    showOnboardingModal,
    setShowOnboardingModal,
  } = useApp();

  const rawOverlay = searchParams.get('overlay');
  const activeOverlay: GlobalOverlayKind | null = isValidGlobalOverlay(rawOverlay)
    ? rawOverlay
    : null;

  const rawNotifTab = searchParams.get('notifTab');
  const notifTab: NotificationSubTab = rawNotifTab === 'install' ? 'install' : 'feed';

  const rawScheduleTab = searchParams.get('scheduleTab');
  const scheduleTab: ScheduleSubTab = rawScheduleTab === 'exceptions' ? 'exceptions' : 'routine';

  const rawStep = Number(searchParams.get('step'));
  const tourStep: TourStepParam = rawStep === 2 || rawStep === 3 ? rawStep : 1;

  const openOverlay = useCallback(
    (
      kind: GlobalOverlayKind,
      extra?: Record<string, string | undefined>,
      options?: { replace?: boolean }
    ) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('overlay', kind);
          OVERLAY_EXTRA_KEYS.forEach((key) => next.delete(key));
          if (extra) {
            Object.entries(extra).forEach(([k, v]) => {
              if (v !== undefined && v !== '') {
                next.set(k, v);
              }
            });
          }
          return next;
        },
        { replace: options?.replace ?? false }
      );
    },
    [setSearchParams]
  );

  const closeOverlay = useCallback(
    (options?: { replace?: boolean }) => {
      setSearchParams(
        (prev) => {
          if (
            !prev.has('overlay') &&
            !OVERLAY_EXTRA_KEYS.some((key) => prev.has(key))
          ) {
            return prev;
          }
          const next = new URLSearchParams(prev);
          next.delete('overlay');
          OVERLAY_EXTRA_KEYS.forEach((key) => next.delete(key));
          return next;
        },
        { replace: options?.replace ?? true }
      );
    },
    [setSearchParams]
  );

  const setNotifTab = useCallback(
    (tab: NotificationSubTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('overlay', 'notifications');
          if (tab === 'feed') {
            next.delete('notifTab');
          } else {
            next.set('notifTab', tab);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setScheduleTab = useCallback(
    (tab: ScheduleSubTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('overlay', 'schedule');
          if (tab === 'routine') {
            next.delete('scheduleTab');
          } else {
            next.set('scheduleTab', tab);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setTourStep = useCallback(
    (step: TourStepParam) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('overlay', 'tour');
          if (step === 1) {
            next.delete('step');
          } else {
            next.set('step', String(step));
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Two-way sync: URL -> AppContext for context-managed modals (schedule, tour)
  const prevOverlayRef = useRef<GlobalOverlayKind | null>(null);
  useEffect(() => {
    const prevOverlay = prevOverlayRef.current;
    prevOverlayRef.current = activeOverlay;

    if (activeOverlay === 'schedule' && !showWeeklyScheduleModal) {
      setShowWeeklyScheduleModal(true);
    } else if (
      prevOverlay === 'schedule' &&
      activeOverlay !== 'schedule' &&
      showWeeklyScheduleModal
    ) {
      setShowWeeklyScheduleModal(false);
    }

    if (activeOverlay === 'tour' && !showOnboardingModal) {
      setShowOnboardingModal(true);
    } else if (
      prevOverlay === 'tour' &&
      activeOverlay !== 'tour' &&
      showOnboardingModal
    ) {
      setShowOnboardingModal(false);
    }
  }, [
    activeOverlay,
    showWeeklyScheduleModal,
    setShowWeeklyScheduleModal,
    showOnboardingModal,
    setShowOnboardingModal,
  ]);

  // Two-way sync: AppContext -> URL for context-managed modals
  const prevScheduleRef = useRef<boolean>(showWeeklyScheduleModal);
  useEffect(() => {
    const wasOpen = prevScheduleRef.current;
    prevScheduleRef.current = showWeeklyScheduleModal;

    if (!wasOpen && showWeeklyScheduleModal && activeOverlay !== 'schedule') {
      openOverlay('schedule');
    } else if (wasOpen && !showWeeklyScheduleModal && activeOverlay === 'schedule') {
      closeOverlay({ replace: true });
    }
  }, [showWeeklyScheduleModal, activeOverlay, openOverlay, closeOverlay]);

  const prevTourRef = useRef<boolean>(showOnboardingModal);
  useEffect(() => {
    const wasOpen = prevTourRef.current;
    prevTourRef.current = showOnboardingModal;

    if (!wasOpen && showOnboardingModal && activeOverlay !== 'tour') {
      openOverlay('tour');
    } else if (wasOpen && !showOnboardingModal && activeOverlay === 'tour') {
      closeOverlay({ replace: true });
    }
  }, [showOnboardingModal, activeOverlay, openOverlay, closeOverlay]);

  return {
    activeOverlay,
    isChatOpen: activeOverlay === 'chat',
    isNotificationsOpen: activeOverlay === 'notifications',
    isDiscordModalOpen: activeOverlay === 'discord',
    notifTab,
    scheduleTab,
    tourStep,
    openOverlay,
    closeOverlay,
    setNotifTab,
    setScheduleTab,
    setTourStep,
  };
}
