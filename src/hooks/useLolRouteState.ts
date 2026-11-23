import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LolViewMode } from '@/types/lol';

export interface LolChampionsModalState {
  open: boolean;
  initialTab?: 'all' | 'best' | 'worst';
}

export interface LolChampionDetailTarget {
  userId: string;
  championName: string;
  scope: LolViewMode;
}

export interface LolSelectedMatchState {
  matchId: string;
  initialPuuid?: string;
}

/**
 * Synchronizes League of Legends view mode, selected player, and drill-down modals
 * with URL search params so every LoL sub-window is directly linkable.
 */
export function useLolRouteState(currentUserId: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const viewMode: LolViewMode =
    searchParams.get('mode') === 'group' ? 'group' : 'personal';

  const selectedUserId: string | null =
    searchParams.get('player') || currentUserId;

  const championsParam = searchParams.get('champions');
  const championsModal = useMemo<LolChampionsModalState>(() => {
    if (!championsParam) return { open: false };
    if (championsParam === 'best' || championsParam === 'worst' || championsParam === 'all') {
      return { open: true, initialTab: championsParam };
    }
    return { open: true };
  }, [championsParam]);

  const championName = searchParams.get('champion');
  const champUser = searchParams.get('champUser');
  const champScopeParam = searchParams.get('champScope');
  const championDetailTarget = useMemo<LolChampionDetailTarget | null>(() => {
    if (!championName) return null;
    const scope: LolViewMode =
      champScopeParam === 'group' || champScopeParam === 'personal'
        ? champScopeParam
        : viewMode;
    return {
      userId: champUser || selectedUserId || currentUserId,
      championName,
      scope,
    };
  }, [championName, champUser, champScopeParam, viewMode, selectedUserId, currentUserId]);

  const matchId = searchParams.get('match');
  const matchPuuid = searchParams.get('puuid') || undefined;
  const selectedMatchState = useMemo<LolSelectedMatchState | null>(() => {
    if (!matchId) return null;
    return { matchId, initialPuuid: matchPuuid };
  }, [matchId, matchPuuid]);

  const setViewMode = useCallback(
    (mode: LolViewMode) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (mode === 'personal') {
            next.delete('mode');
          } else {
            next.set('mode', mode);
          }
          next.delete('champions');
          next.delete('champion');
          next.delete('champUser');
          next.delete('champScope');
          next.delete('match');
          next.delete('puuid');
          return next;
        },
        { replace: false }
      );
    },
    [setSearchParams]
  );

  const setSelectedUserId = useCallback(
    (userId: string | null) => {
      setSearchParams(
        (prev) => {
          const current = prev.get('player');
          const nextVal = !userId || userId === currentUserId ? null : userId;
          if (current === nextVal) return prev;
          const next = new URLSearchParams(prev);
          if (nextVal) {
            next.set('player', nextVal);
          } else {
            next.delete('player');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams, currentUserId]
  );

  const setChampionsModal = useCallback(
    (state: LolChampionsModalState) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (state.open) {
            next.set('champions', state.initialTab || 'all');
          } else {
            next.delete('champions');
          }
          return next;
        },
        { replace: false }
      );
    },
    [setSearchParams]
  );

  const setChampionDetailTarget = useCallback(
    (target: LolChampionDetailTarget | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (target) {
            next.set('champion', target.championName);
            next.set('champUser', target.userId);
            next.set('champScope', target.scope);
          } else {
            next.delete('champion');
            next.delete('champUser');
            next.delete('champScope');
          }
          return next;
        },
        { replace: false }
      );
    },
    [setSearchParams]
  );

  const setSelectedMatchState = useCallback(
    (state: LolSelectedMatchState | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (state) {
            next.set('match', state.matchId);
            if (state.initialPuuid) {
              next.set('puuid', state.initialPuuid);
            } else {
              next.delete('puuid');
            }
          } else {
            next.delete('match');
            next.delete('puuid');
          }
          return next;
        },
        { replace: false }
      );
    },
    [setSearchParams]
  );

  return {
    viewMode,
    selectedUserId,
    championsModal,
    championDetailTarget,
    selectedMatchState,
    setViewMode,
    setSelectedUserId,
    setChampionsModal,
    setChampionDetailTarget,
    setSelectedMatchState,
  };
}
