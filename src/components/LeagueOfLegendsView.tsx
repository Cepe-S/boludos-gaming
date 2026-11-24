import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useLolRouteState } from '@/hooks/useLolRouteState';
import { buildDemoLolDataset } from '@/lib/lolDemoData';
import { DEFAULT_DDRAGON_VERSION, getCachedDdragonVersion, loadDdragonRunesAndSpells } from '@/lib/lolDdragon';
import {
  DEFAULT_LOL_QUEUE_FILTERS,
  DEFAULT_LOL_TIME_RANGE,
  buildPuuidToUserIdMap,
  computeGroupAggregateStats,
  computeGroupLeaderboard,
  computeGroupLeaderboardByRole,
  computeGroupPicks,
  computeGroupRecords,
  computePersonalRecords,
  computePlayerAggregates,
  computePlayerChampionDetail,
  filterMatchesGlobally,
  getUserAccounts,
  getUserPuuids,
  resolveUserPrimaryAccount,
} from '@/lib/lolPerformanceEngine';
import {
  fetchGroupLolData,
  getCachedGroupLolData,
  getCachedRiotEdgeStatus,
  getRiotEdgeStatus,
  invalidateGroupLolCache,
  linkAndSyncRiotAccount,
  saveServerRiotApiKey,
  setLocalRiotApiKey,
  setPrimaryRiotAccount,
  syncRiotGroup,
  syncRiotPlayer,
  unlinkRiotAccount,
} from '@/lib/lolService';
import { supabase } from '@/lib/supabaseClient';
import {
  LolAccount,
  LolMatchSummary,
  LolPlatform,
  LolSpecificQueueCategory,
  LolTimeRangeFilter,
  LolViewMode,
} from '@/types/lol';
import { LolChampionDetailModal } from './lol/LolChampionDetailModal';
import { LolChampionsModal } from './lol/LolChampionsModal';
import { LolChampionsSummaryPanel } from './lol/LolChampionsSummaryPanel';
import { LolDurationScatterPanel } from './lol/LolDurationScatterPanel';
import { LolOutcomeDurationChart } from './lol/LolOutcomeDurationChart';
import { LolGroupLeaderboard } from './lol/LolGroupLeaderboard';
import { LolGroupRecordsPanel } from './lol/LolGroupRecordsPanel';
import { LolHeaderBar } from './lol/LolHeaderBar';
import {
  LolLoadingScreen,
  collectLolCriticalImageUrls,
  preloadLolImages,
} from './lol/LolLoadingScreen';
import { LolMatchDetailModal } from './lol/LolMatchDetailModal';
import { LolRecentMatchesList } from './lol/LolRecentMatchesList';
import { LolStatsOverviewPanel } from './lol/LolStatsComparisonPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Sparkles, Swords } from 'lucide-react';

export const LeagueOfLegendsView: React.FC = () => {
  const {
    currentUser,
    players,
    activeGroup,
    userGroups,
    setActiveGroupId,
  } = useApp();

  const groupMembers = useMemo(() => {
    if (!activeGroup) return players;
    const memberSet = new Set(activeGroup.memberIds);
    const filtered = players.filter((p) => memberSet.has(p.id));
    return filtered.length > 0 ? filtered : players;
  }, [activeGroup, players]);

  const [isDemoMode, setIsDemoMode] = useState(false);
  const {
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
  } = useLolRouteState(currentUser.id);
  const [selectedQueues, setSelectedQueues] = useState<LolSpecificQueueCategory[]>(
    () => [...DEFAULT_LOL_QUEUE_FILTERS]
  );
  const [timeRange, setTimeRange] = useState<LolTimeRangeFilter>(DEFAULT_LOL_TIME_RANGE);
  const [accountsDialogRequest, setAccountsDialogRequest] = useState<{
    userId: string;
    nonce: number;
  } | null>(null);

  const handleChangeViewMode = useCallback(
    (mode: LolViewMode) => {
      setViewMode(mode);
    },
    [setViewMode]
  );

  const handleToggleQueue = useCallback((queue: LolSpecificQueueCategory | 'all') => {
    if (queue === 'all') {
      setSelectedQueues([]);
      return;
    }
    setSelectedQueues((prev) => {
      if (prev.length === 0) return [queue];
      if (prev.includes(queue)) {
        return prev.filter((q) => q !== queue);
      }
      return [...prev, queue];
    });
  }, []);

  const memberIdsKey = useMemo(
    () => Array.from(new Set(groupMembers.map((m) => m.id))).sort().join(','),
    [groupMembers]
  );
  const stableMemberIds = useMemo(
    () => (memberIdsKey ? memberIdsKey.split(',') : []),
    [memberIdsKey]
  );

  const initialLolCache = useMemo(
    () => getCachedGroupLolData(stableMemberIds),
    // Only read initial snapshot once per member set change
    [stableMemberIds]
  );
  const initialEdgeStatus = useMemo(() => getCachedRiotEdgeStatus(), []);

  const [ddragonVersion, setDdragonVersion] = useState<string>(() => getCachedDdragonVersion());
  const [hasServerRiotKey, setHasServerRiotKey] = useState<boolean | null>(
    () => initialEdgeStatus?.hasServerKey ?? null
  );
  const [serverKeyUpdatedAt, setServerKeyUpdatedAt] = useState<string | null>(
    () => initialEdgeStatus?.updatedAt ?? null
  );

  const [liveAccounts, setLiveAccounts] = useState<LolAccount[]>(
    () => initialLolCache?.accounts ?? []
  );
  const [liveMatches, setLiveMatches] = useState<LolMatchSummary[]>(
    () => initialLolCache?.matches ?? []
  );
  const [isLoadingLive, setIsLoadingLive] = useState<boolean>(() => !initialLolCache);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [isPageReady, setIsPageReady] = useState<boolean>(() => Boolean(initialLolCache));
  const [revealGen, setRevealGen] = useState(0);

  // Only build heavy demo dataset when Demo Mode is explicitly enabled
  const demoData = useMemo(
    () => (isDemoMode ? buildDemoLolDataset(groupMembers) : null),
    [isDemoMode, groupMembers]
  );

  const loadLiveData = useCallback(
    async (forceRefresh = false) => {
      if (stableMemberIds.length === 0) {
        setLiveAccounts([]);
        setLiveMatches([]);
        setIsLoadingLive(false);
        return { accounts: [] as LolAccount[], matches: [] as LolMatchSummary[] };
      }

      const cached = !forceRefresh ? getCachedGroupLolData(stableMemberIds) : null;
      if (cached) {
        setLiveAccounts(cached.accounts);
        setLiveMatches(cached.matches);
        setIsLoadingLive(false);
        if (cached.isFresh) {
          return { accounts: cached.accounts, matches: cached.matches };
        }
      } else {
        setIsLoadingLive(true);
      }

      const res = await fetchGroupLolData(stableMemberIds, { forceRefresh });
      setLiveAccounts(res.accounts);
      setLiveMatches(res.matches);
      setIsLoadingLive(false);

      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      }
      return { accounts: res.accounts, matches: res.matches };
    },
    [stableMemberIds]
  );

  useEffect(() => {
    let cancelled = false;

    const runBootPipeline = async () => {
      // Non-blocking background DDragon & Riot Edge status warm-up
      void loadDdragonRunesAndSpells()
        .then((ver) => {
          if (!cancelled) setDdragonVersion(ver);
        })
        .catch(() => undefined);

      void getRiotEdgeStatus()
        .then((status) => {
          if (!cancelled) {
            setHasServerRiotKey(status.hasServerKey);
            setServerKeyUpdatedAt(status.updatedAt ?? null);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setHasServerRiotKey((prev) => (prev === null ? false : prev));
          }
        });

      if (isDemoMode) {
        setIsPageReady(true);
        setRevealGen((g) => g + 1);
        return;
      }

      const cached = getCachedGroupLolData(stableMemberIds);
      if (cached) {
        setLiveAccounts(cached.accounts);
        setLiveMatches(cached.matches);
        setIsLoadingLive(false);
        setIsPageReady(true);
        if (cached.isFresh) return;
      } else if (stableMemberIds.length > 0) {
        setIsPageReady(false);
      }

      const live = await loadLiveData(false);
      if (cancelled) return;

      // Warm up critical images asynchronously without blocking UI rendering
      const imageUrls = collectLolCriticalImageUrls({
        accounts: live.accounts,
        matches: live.matches,
        members: groupMembers,
        ddragonVersion: getCachedDdragonVersion() || DEFAULT_DDRAGON_VERSION,
      });
      void preloadLolImages(imageUrls, 1100);

      if (!cached) {
        setRevealGen((g) => g + 1);
      }
      setIsPageReady(true);
    };

    void runBootPipeline();

    return () => {
      cancelled = true;
    };
    // Intentionally depend on stableMemberIds (sorted IDs string) so unrelated AppContext re-renders never flash loading
  }, [isDemoMode, stableMemberIds, loadLiveData]);

  useEffect(() => {
    if (!supabase || isDemoMode) return;
    const client = supabase;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        invalidateGroupLolCache();
        void loadLiveData(true);
      }, 600);
    };
    const channel = client
      .channel('lol-group-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lol_accounts' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lol_matches' },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void client.removeChannel(channel);
    };
  }, [isDemoMode, loadLiveData]);

  const activeMembers = isDemoMode && demoData ? demoData.members : groupMembers;
  const activeAccounts = isDemoMode && demoData ? demoData.accounts : liveAccounts;
  const activeMatches = isDemoMode && demoData ? demoData.matches : liveMatches;

  useEffect(() => {
    if (isLoadingLive && !isDemoMode) return;
    if (activeAccounts.length === 0) {
      setSelectedUserId(currentUser.id);
      return;
    }
    const stillExists = selectedUserId
      ? activeAccounts.some((a) => a.userId === selectedUserId)
      : false;
    if (!stillExists) {
      const me = activeAccounts.find((a) => a.userId === currentUser.id);
      setSelectedUserId(me ? me.userId : activeAccounts[0].userId);
    }
  }, [isLoadingLive, isDemoMode, activeAccounts, selectedUserId, currentUser.id, setSelectedUserId]);

  const selectedAccount = useMemo(
    () =>
      resolveUserPrimaryAccount(activeAccounts, selectedUserId) ??
      activeAccounts[0] ??
      null,
    [activeAccounts, selectedUserId]
  );

  const selectedUserAccounts = useMemo(
    () =>
      selectedAccount ? getUserAccounts(activeAccounts, selectedAccount.userId) : [],
    [activeAccounts, selectedAccount]
  );

  const selectedSecondaryAccounts = useMemo(
    () => selectedUserAccounts.filter((a) => a.puuid !== selectedAccount?.puuid),
    [selectedUserAccounts, selectedAccount]
  );

  const selectedUserPuuids = useMemo(
    () =>
      selectedAccount ? getUserPuuids(activeAccounts, selectedAccount.userId) : new Set<string>(),
    [activeAccounts, selectedAccount]
  );

  const selectedMemberProfile = useMemo(
    () => activeMembers.find((m) => m.id === selectedAccount?.userId) ?? currentUser,
    [activeMembers, selectedAccount, currentUser]
  );

  const groupPuuids = useMemo(
    () => new Set(activeAccounts.map((a) => a.puuid)),
    [activeAccounts]
  );

  const puuidToUserId = useMemo(
    () => buildPuuidToUserIdMap(activeAccounts),
    [activeAccounts]
  );

  const accountByPuuid = useMemo(
    () => new Map(activeAccounts.map((a) => [a.puuid, a])),
    [activeAccounts]
  );

  const globallyFilteredMatches = useMemo(
    () => filterMatchesGlobally(activeMatches, selectedQueues, timeRange),
    [activeMatches, selectedQueues, timeRange]
  );

  const personalStats = useMemo(
    () =>
      viewMode !== 'personal' || !selectedAccount
        ? null
        : computePlayerAggregates(
            globallyFilteredMatches,
            selectedUserPuuids,
            groupPuuids,
            'all',
            puuidToUserId
          ).personal,
    [viewMode, globallyFilteredMatches, selectedAccount, selectedUserPuuids, groupPuuids, puuidToUserId]
  );

  const currentUserAccount = useMemo(
    () =>
      resolveUserPrimaryAccount(activeAccounts, currentUser.id) ?? selectedAccount,
    [activeAccounts, currentUser.id, selectedAccount]
  );

  const currentUserPuuids = useMemo(
    () =>
      currentUserAccount
        ? getUserPuuids(activeAccounts, currentUserAccount.userId)
        : new Set<string>(),
    [activeAccounts, currentUserAccount]
  );

  const currentUserDisplayName = useMemo(
    () =>
      activeMembers.find((m) => m.id === currentUserAccount?.userId)?.displayName ??
      currentUserAccount?.gameName ??
      currentUser.displayName,
    [activeMembers, currentUserAccount, currentUser.displayName]
  );

  const personalInGroupStats = useMemo(
    () =>
      viewMode !== 'group' || !currentUserAccount
        ? null
        : computePlayerAggregates(
            globallyFilteredMatches,
            currentUserPuuids,
            groupPuuids,
            'all',
            puuidToUserId
          ).inGroup,
    [viewMode, globallyFilteredMatches, currentUserAccount, currentUserPuuids, groupPuuids, puuidToUserId]
  );

  const personalRecords = useMemo(
    () =>
      viewMode !== 'personal' || !selectedAccount
        ? []
        : computePersonalRecords({
            matches: globallyFilteredMatches,
            account: selectedAccount,
            puuids: selectedUserPuuids,
            displayName: selectedMemberProfile.displayName,
            avatarUrl: selectedMemberProfile.avatarUrl,
            queueFilter: 'all',
          }),
    [viewMode, globallyFilteredMatches, selectedAccount, selectedUserPuuids, selectedMemberProfile]
  );

  const groupAggregateStats = useMemo(
    () =>
      viewMode !== 'group'
        ? null
        : computeGroupAggregateStats({
            matches: globallyFilteredMatches,
            accounts: activeAccounts,
            queueFilter: 'all',
          }),
    [viewMode, globallyFilteredMatches, activeAccounts]
  );

  const groupPicks = useMemo(
    () =>
      viewMode !== 'group'
        ? null
        : computeGroupPicks({
            matches: globallyFilteredMatches,
            accounts: activeAccounts,
            playerProfiles: activeMembers,
            queueFilter: 'all',
            minGames: 3,
            tableLimit: 5,
          }),
    [viewMode, globallyFilteredMatches, activeAccounts, activeMembers]
  );

  const leaderboardEntries = useMemo(
    () =>
      viewMode !== 'group'
        ? []
        : computeGroupLeaderboard({
            matches: globallyFilteredMatches,
            accounts: activeAccounts,
            playerProfiles: activeMembers,
            queueFilter: 'all',
          }),
    [viewMode, globallyFilteredMatches, activeAccounts, activeMembers]
  );

  const roleLeaderboard = useMemo(
    () =>
      viewMode !== 'group'
        ? null
        : computeGroupLeaderboardByRole({
            matches: globallyFilteredMatches,
            accounts: activeAccounts,
            playerProfiles: activeMembers,
            queueFilter: 'all',
          }),
    [viewMode, globallyFilteredMatches, activeAccounts, activeMembers]
  );

  const groupRecords = useMemo(
    () =>
      viewMode !== 'group'
        ? []
        : computeGroupRecords({
            matches: globallyFilteredMatches,
            accounts: activeAccounts,
            playerProfiles: activeMembers,
            queueFilter: 'all',
            scope: 'group',
          }),
    [viewMode, globallyFilteredMatches, activeAccounts, activeMembers]
  );

  const championDetailStats = useMemo(() => {
    if (!championDetailTarget) return null;
    const account = resolveUserPrimaryAccount(activeAccounts, championDetailTarget.userId);
    if (!account) return null;
    const userPuuids = getUserPuuids(activeAccounts, account.userId);
    const profile = activeMembers.find((m) => m.id === account.userId);
    return computePlayerChampionDetail({
      matches: globallyFilteredMatches,
      account,
      puuids: userPuuids,
      displayName: profile?.displayName ?? account.gameName,
      avatarUrl: profile?.avatarUrl ?? '',
      championName: championDetailTarget.championName,
      scope: championDetailTarget.scope,
      groupMemberPuuids: groupPuuids,
      puuidToUserId,
    });
  }, [
    championDetailTarget,
    activeAccounts,
    activeMembers,
    globallyFilteredMatches,
    groupPuuids,
    puuidToUserId,
  ]);

  const selectedMatch = useMemo(() => {
    if (!selectedMatchState) return null;
    return (
      activeMatches.find((m) => m.matchId === selectedMatchState.matchId) ?? null
    );
  }, [activeMatches, selectedMatchState]);

  const showTransientFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => {
      setFeedback((curr) => (curr?.message === message ? null : curr));
    }, 6000);
  };

  const handleLinkAndSync = async (params: {
    userId: string;
    gameName: string;
    tagLine: string;
    platform: LolPlatform;
    isPrimary?: boolean;
  }): Promise<{ ok: boolean; error?: string }> => {
    setIsSyncing(true);
    try {
      const res = await linkAndSyncRiotAccount(params);
      if (res.ok) {
        await loadLiveData(true);
        setSelectedUserId(params.userId);
        const roleLabel = params.isPrimary === false ? 'secundaria' : 'principal';
        showTransientFeedback(
          'success',
          `Vinculada cuenta ${roleLabel} ${params.gameName}#${params.tagLine} (${res.fetchedMatches ?? 0} nuevas, ${res.cachedMatches ?? 0} en caché).`
        );
        return { ok: true };
      }
      return { ok: false, error: res.error };
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncPlayer = async (userId: string) => {
    setIsSyncing(true);
    try {
      const res = await syncRiotPlayer({ userId });
      if (res.ok) {
        await loadLiveData(true);
        showTransientFeedback(
          'success',
          `Sincronizado (${res.fetchedMatches ?? 0} nuevas, ${res.cachedMatches ?? 0} en caché).`
        );
      } else {
        showTransientFeedback('error', res.error || 'Error al sincronizar jugador.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncGroup = async () => {
    const ids = Array.from(new Set(activeAccounts.map((a) => a.userId)));
    if (ids.length === 0) return;
    setIsSyncing(true);
    try {
      const res = await syncRiotGroup({ userIds: ids });
      if (res.ok) {
        await loadLiveData(true);
        showTransientFeedback(
          'success',
          `Grupo sincronizado: ${res.syncedCount ?? activeAccounts.length} cuentas, ${res.fetchedMatches ?? 0} partidas nuevas.`
        );
      } else {
        showTransientFeedback('error', res.error || 'Error al sincronizar el grupo.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUnlinkAccount = async (userId: string, puuid?: string) => {
    setIsSyncing(true);
    try {
      const res = await unlinkRiotAccount(userId, puuid);
      if (res.ok) {
        await loadLiveData(true);
        showTransientFeedback('success', 'Cuenta de Riot desvinculada.');
      } else {
        showTransientFeedback('error', res.error || 'No se pudo desvincular.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSetPrimaryAccount = async (userId: string, puuid: string) => {
    setIsSyncing(true);
    try {
      const res = await setPrimaryRiotAccount(userId, puuid);
      if (res.ok) {
        await loadLiveData(true);
        showTransientFeedback('success', 'Cuenta principal actualizada.');
      } else {
        showTransientFeedback('error', res.error || 'No se pudo cambiar la cuenta principal.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveServerRiotKey = async (
    apiKey: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const res = await saveServerRiotApiKey(apiKey);
    if (res.ok) {
      setHasServerRiotKey(true);
      setServerKeyUpdatedAt(res.updatedAt ?? new Date().toISOString());
      setLocalRiotApiKey('');
      showTransientFeedback('success', 'Riot API Key validada y guardada en el servidor.');
      return { ok: true };
    }
    return { ok: false, error: res.error };
  };

  if (!isPageReady || (!isDemoMode && isLoadingLive && activeAccounts.length === 0)) {
    return <LolLoadingScreen />;
  }

  const filterAnimKey = `${revealGen}-${viewMode}-${viewMode === 'personal' ? (selectedAccount?.userId ?? 'none') : (activeGroup?.id ?? 'group')}-${selectedQueues.join(',')}-${timeRange}`;

  const showEmptyState =
    activeAccounts.length === 0 ||
    (viewMode === 'personal' && (!selectedAccount || !personalStats));

  return (
    <div key={`lol-ready-${revealGen}`} className="space-y-4">
      <div className="animate-lol-reveal" style={{ animationDelay: '0ms' }}>
        <LolHeaderBar
          viewMode={viewMode}
          onChangeViewMode={handleChangeViewMode}
          userGroups={userGroups}
          activeGroup={activeGroup}
          onSelectGroup={(groupId) => {
            setActiveGroupId(groupId);
            setChampionsModal({ open: false });
            setChampionDetailTarget(null);
            setSelectedMatchState(null);
          }}
          groupMembers={activeMembers}
          accounts={activeAccounts}
          selectedUserId={selectedAccount?.userId ?? selectedUserId}
          onSelectUser={(uid) => {
            setSelectedUserId(uid);
            setSelectedMatchState(null);
          }}
          selectedQueues={selectedQueues}
          onToggleQueue={handleToggleQueue}
          timeRange={timeRange}
          onChangeTimeRange={setTimeRange}
          isDemoMode={isDemoMode}
          onToggleDemoMode={(demo) => {
            setIsDemoMode(demo);
            setChampionsModal({ open: false });
            setChampionDetailTarget(null);
            setSelectedMatchState(null);
          }}
          isSyncing={isSyncing}
          hasServerRiotKey={hasServerRiotKey}
          serverKeyUpdatedAt={serverKeyUpdatedAt}
          ddragonVersion={ddragonVersion}
          onLinkAndSync={handleLinkAndSync}
          onSyncPlayer={handleSyncPlayer}
          onSyncGroup={handleSyncGroup}
          onUnlinkAccount={handleUnlinkAccount}
          onSetPrimaryAccount={handleSetPrimaryAccount}
          onSaveServerRiotKey={handleSaveServerRiotKey}
          openAccountsRequest={accountsDialogRequest}
        />
      </div>

      {feedback && (
        <div
          className={cn(
            'px-3.5 py-2.5 rounded-md border text-xs font-medium flex items-center gap-2 animate-lol-card-pop',
            feedback.type === 'success'
              ? 'bg-success/10 border-success/40 text-success'
              : 'bg-destructive/10 border-destructive/40 text-destructive'
          )}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {showEmptyState ? (
        <div className="animate-lol-reveal" style={{ animationDelay: '70ms' }}>
          <Card>
            <CardContent className="py-10 px-4 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-11 h-11 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary animate-lol-card-pop">
                <Swords className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-sm font-bold text-foreground">
                  Sin cuentas de Riot vinculadas en {activeGroup?.name || 'este grupo'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Vinculá tu Riot ID arriba o activá el modo Demo para explorar todas las métricas.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => setIsDemoMode(true)}
              >
                <Sparkles className="w-4 h-4" strokeWidth={1.75} />
                <span>Activar Modo Demo</span>
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : viewMode === 'personal' && selectedAccount && personalStats ? (
        <div key={filterAnimKey} className="space-y-4">
          {/* Fila 2: Overview Personal */}
          <div className="animate-lol-reveal" style={{ animationDelay: '65ms' }}>
            <LolStatsOverviewPanel
              mode="personal"
              account={selectedAccount}
              secondaryAccounts={selectedSecondaryAccounts}
              displayName={selectedMemberProfile.displayName}
              stats={personalStats}
              ddragonVersion={ddragonVersion}
              onSelectChampion={(champ) =>
                setChampionDetailTarget({
                  userId: selectedAccount.userId,
                  championName: champ,
                  scope: 'personal',
                })
              }
              onOpenChampionsModal={() => setChampionsModal({ open: true })}
              onManageAccounts={
                !isDemoMode
                  ? () =>
                      setAccountsDialogRequest({
                        userId: selectedAccount.userId,
                        nonce: Date.now(),
                      })
                  : undefined
              }
            />
          </div>

          {/* Fila 3 (Full Width): Panoramic Zoomable/Pannable Timeline */}
          <div className="animate-lol-reveal" style={{ animationDelay: '130ms' }}>
            <LolDurationScatterPanel
              mode="personal"
              matches={globallyFilteredMatches}
              targetPuuid={selectedAccount.puuid}
              targetPuuids={selectedUserPuuids}
              groupPuuids={groupPuuids}
              puuidToUserId={puuidToUserId}
              accountByPuuid={accountByPuuid}
              timeRange={timeRange}
              ddragonVersion={ddragonVersion}
              onSelectMatch={(matchId, puuid) =>
                setSelectedMatchState({
                  matchId,
                  initialPuuid: puuid ?? selectedAccount.puuid,
                })
              }
            />
          </div>

          {/* Fila 4 (Full Width): Stacked Area Chart — Victorias / Derrotas / FF */}
          <div className="animate-lol-reveal" style={{ animationDelay: '165ms' }}>
            <LolOutcomeDurationChart
              mode="personal"
              matches={globallyFilteredMatches}
              targetPuuid={selectedAccount.puuid}
              targetPuuids={selectedUserPuuids}
              groupPuuids={groupPuuids}
              puuidToUserId={puuidToUserId}
              accountByPuuid={accountByPuuid}
              ddragonVersion={ddragonVersion}
              onSelectMatch={(matchId, puuid) =>
                setSelectedMatchState({
                  matchId,
                  initialPuuid: puuid ?? selectedAccount.puuid,
                })
              }
            />
          </div>

          {/* Fila 4: Partidas Recientes (izq) + Campeones Más Jugados (der) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            <div
              className="xl:col-span-7 min-w-0 animate-lol-reveal"
              style={{ animationDelay: '195ms' }}
            >
              <LolRecentMatchesList
                mode="personal"
                matches={globallyFilteredMatches}
                targetPuuid={selectedAccount.puuid}
                targetPuuids={selectedUserPuuids}
                groupPuuids={groupPuuids}
                puuidToUserId={puuidToUserId}
                accountByPuuid={accountByPuuid}
                ddragonVersion={ddragonVersion}
                onSelectMatch={(matchId, puuid) =>
                  setSelectedMatchState({
                    matchId,
                    initialPuuid: puuid ?? selectedAccount.puuid,
                  })
                }
              />
            </div>

            <div
              className="xl:col-span-5 min-w-0 animate-lol-reveal"
              style={{ animationDelay: '260ms' }}
            >
              <LolChampionsSummaryPanel
                mode="personal"
                champions={personalStats.topChampions}
                ddragonVersion={ddragonVersion}
                onSelectChampion={(champ) =>
                  setChampionDetailTarget({
                    userId: selectedAccount.userId,
                    championName: champ,
                    scope: 'personal',
                  })
                }
                onOpenModal={() => setChampionsModal({ open: true })}
              />
            </div>
          </div>

          {/* Fila 5 (Full Width): Récords Personales */}
          <div className="animate-lol-reveal" style={{ animationDelay: '325ms' }}>
            <LolGroupRecordsPanel
              mode="personal"
              records={personalRecords}
              ddragonVersion={ddragonVersion}
              onSelectMatch={(matchId) => {
                const matched = activeMatches.find((m) => m.matchId === matchId);
                const userPart = matched?.participants.find((p) =>
                  selectedUserPuuids.has(p.puuid)
                );
                setSelectedMatchState({
                  matchId,
                  initialPuuid: userPart?.puuid ?? selectedAccount.puuid,
                });
              }}
            />
          </div>
        </div>
      ) : groupAggregateStats && groupPicks && roleLeaderboard ? (
        <div key={filterAnimKey} className="space-y-4">
          {/* Fila 2: Overview Grupal + Estadísticas Personales en Games del Grupo */}
          <div className="animate-lol-reveal" style={{ animationDelay: '65ms' }}>
            <LolStatsOverviewPanel
              mode="group"
              groupName={activeGroup?.name || 'Grupo'}
              accounts={activeAccounts}
              members={activeMembers}
              groupStats={groupAggregateStats}
              personalInGroupStats={personalInGroupStats}
              personalDisplayName={currentUserDisplayName}
              ddragonVersion={ddragonVersion}
            />
          </div>

          {/* Fila 3 (Full Width): Timeline Grupal */}
          <div className="animate-lol-reveal" style={{ animationDelay: '130ms' }}>
            <LolDurationScatterPanel
              mode="group"
              matches={globallyFilteredMatches}
              targetPuuid={currentUserAccount?.puuid ?? ''}
              targetPuuids={currentUserPuuids}
              groupPuuids={groupPuuids}
              puuidToUserId={puuidToUserId}
              accountByPuuid={accountByPuuid}
              timeRange={timeRange}
              ddragonVersion={ddragonVersion}
              onSelectMatch={(matchId, puuid) =>
                setSelectedMatchState({ matchId, initialPuuid: puuid })
              }
            />
          </div>

          {/* Fila 4 (Full Width): Stacked Area Chart — Victorias / Derrotas / FF */}
          <div className="animate-lol-reveal" style={{ animationDelay: '165ms' }}>
            <LolOutcomeDurationChart
              mode="group"
              matches={globallyFilteredMatches}
              targetPuuid={currentUserAccount?.puuid ?? ''}
              targetPuuids={currentUserPuuids}
              groupPuuids={groupPuuids}
              puuidToUserId={puuidToUserId}
              accountByPuuid={accountByPuuid}
              ddragonVersion={ddragonVersion}
              onSelectMatch={(matchId, puuid) =>
                setSelectedMatchState({ matchId, initialPuuid: puuid })
              }
            />
          </div>

          {/* Fila 4 (Full Width): Picks del Grupo */}
          <div className="animate-lol-reveal" style={{ animationDelay: '195ms' }}>
            <LolChampionsSummaryPanel
              mode="group"
              picksResult={groupPicks}
              ddragonVersion={ddragonVersion}
              onSelectPick={(userId, champ) =>
                setChampionDetailTarget({
                  userId,
                  championName: champ,
                  scope: 'group',
                })
              }
              onOpenModal={(initialTab) =>
                setChampionsModal({ open: true, initialTab })
              }
            />
          </div>

          {/* Fila 5: Partidas del Grupo (izq) + Leaderboard / Roles (der) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            <div
              className="xl:col-span-7 min-w-0 animate-lol-reveal"
              style={{ animationDelay: '260ms' }}
            >
              <LolRecentMatchesList
                mode="group"
                matches={globallyFilteredMatches}
                targetPuuid={currentUserAccount?.puuid ?? ''}
                targetPuuids={currentUserPuuids}
                groupPuuids={groupPuuids}
                puuidToUserId={puuidToUserId}
                accountByPuuid={accountByPuuid}
                ddragonVersion={ddragonVersion}
                onSelectMatch={(matchId, puuid) =>
                  setSelectedMatchState({ matchId, initialPuuid: puuid })
                }
                onSelectChampion={(userId, champ) =>
                  setChampionDetailTarget({
                    userId,
                    championName: champ,
                    scope: 'group',
                  })
                }
              />
            </div>

            <div
              className="xl:col-span-5 min-w-0 animate-lol-reveal"
              style={{ animationDelay: '325ms' }}
            >
              <LolGroupLeaderboard
                entries={leaderboardEntries}
                roleLeaderboard={roleLeaderboard}
                selectedUserId={currentUser.id}
                currentUserId={currentUser.id}
                queueFilter={selectedQueues.length === 0 ? 'all' : selectedQueues[0]}
                ddragonVersion={ddragonVersion}
                onSelectPlayer={() => {}}
                onSelectChampion={(userId, champ) =>
                  setChampionDetailTarget({
                    userId,
                    championName: champ,
                    scope: 'group',
                  })
                }
              />
            </div>
          </div>

          {/* Fila 6 (Full Width): Récords del Grupo */}
          <div className="animate-lol-reveal" style={{ animationDelay: '390ms' }}>
            <LolGroupRecordsPanel
              mode="group"
              records={groupRecords}
              selectedUserId={currentUser.id}
              ddragonVersion={ddragonVersion}
              onSelectPlayer={() => {}}
              onSelectMatch={(matchId) => setSelectedMatchState({ matchId })}
            />
          </div>
        </div>
      ) : null}

      {championsModal.open &&
        viewMode === 'personal' &&
        selectedAccount &&
        personalStats && (
          <LolChampionsModal
            mode="personal"
            account={selectedAccount}
            displayName={selectedMemberProfile.displayName}
            champions={personalStats.topChampions}
            ddragonVersion={selectedAccount.ddragonVersion || ddragonVersion}
            isSuppressed={Boolean(championDetailTarget || selectedMatchState)}
            onSelectChampion={(userId, champ) =>
              setChampionDetailTarget({
                userId,
                championName: champ,
                scope: 'personal',
              })
            }
            onClose={() => setChampionsModal({ open: false })}
          />
        )}

      {championsModal.open && viewMode === 'group' && groupPicks && (
        <LolChampionsModal
          mode="group"
          groupName={activeGroup?.name || 'Grupo'}
          picksResult={groupPicks}
          initialTab={championsModal.initialTab}
          ddragonVersion={ddragonVersion}
          isSuppressed={Boolean(championDetailTarget || selectedMatchState)}
          onSelectChampion={(userId, champ) =>
            setChampionDetailTarget({
              userId,
              championName: champ,
              scope: 'group',
            })
          }
          onClose={() => setChampionsModal({ open: false })}
        />
      )}

      {championDetailStats && (
        <LolChampionDetailModal
          detail={championDetailStats}
          ddragonVersion={
            championDetailStats.account.ddragonVersion || ddragonVersion
          }
          isSuppressed={Boolean(selectedMatchState)}
          onClose={() => setChampionDetailTarget(null)}
          onSelectMatch={(matchId, puuid) =>
            setSelectedMatchState({ matchId, initialPuuid: puuid })
          }
        />
      )}

      {selectedMatch && (
        <LolMatchDetailModal
          match={selectedMatch}
          initialParticipantPuuid={
            selectedMatchState?.initialPuuid ||
            selectedAccount?.puuid ||
            selectedMatch.participants[0]?.puuid ||
            ''
          }
          groupPuuids={groupPuuids}
          accountByPuuid={accountByPuuid}
          hideGroupInfo={viewMode === 'personal'}
          ddragonVersion={selectedAccount?.ddragonVersion || ddragonVersion}
          onClose={() => setSelectedMatchState(null)}
        />
      )}
    </div>
  );
};

export default LeagueOfLegendsView;
