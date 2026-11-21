import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { buildDemoLolDataset } from '@/lib/lolDemoData';
import { DEFAULT_DDRAGON_VERSION, loadDdragonRunesAndSpells } from '@/lib/lolDdragon';
import {
  DEFAULT_LOL_QUEUE_FILTERS,
  DEFAULT_LOL_TIME_RANGE,
  computeGroupLeaderboard,
  computeGroupLeaderboardByRole,
  computeGroupRecords,
  computePlayerAggregates,
  filterMatchesGlobally,
  isGroupMatch,
} from '@/lib/lolPerformanceEngine';
import {
  fetchGroupLolData,
  getRiotEdgeStatus,
  linkAndSyncRiotAccount,
  saveServerRiotApiKey,
  setLocalRiotApiKey,
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
} from '@/types/lol';
import { LolDurationScatterPanel } from './lol/LolDurationScatterPanel';
import { LolGroupLeaderboard } from './lol/LolGroupLeaderboard';
import { LolGroupRecordsPanel } from './lol/LolGroupRecordsPanel';
import { LolHeaderBar } from './lol/LolHeaderBar';
import {
  LolBootPhases,
  LolLoadingScreen,
  collectLolCriticalImageUrls,
  preloadLolImages,
} from './lol/LolLoadingScreen';
import { LolMatchDetailModal } from './lol/LolMatchDetailModal';
import { LolRecentMatchesList } from './lol/LolRecentMatchesList';
import { LolStatsComparisonPanel } from './lol/LolStatsComparisonPanel';
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
  const [selectedQueues, setSelectedQueues] = useState<LolSpecificQueueCategory[]>(
    () => [...DEFAULT_LOL_QUEUE_FILTERS]
  );
  const [timeRange, setTimeRange] = useState<LolTimeRangeFilter>(DEFAULT_LOL_TIME_RANGE);
  const [recordsScope, setRecordsScope] = useState<'group' | 'all'>('group');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(currentUser.id);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

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

  const [ddragonVersion, setDdragonVersion] = useState(DEFAULT_DDRAGON_VERSION);
  const [hasServerRiotKey, setHasServerRiotKey] = useState<boolean | null>(null);
  const [serverKeyUpdatedAt, setServerKeyUpdatedAt] = useState<string | null>(null);

  const [liveAccounts, setLiveAccounts] = useState<LolAccount[]>([]);
  const [liveMatches, setLiveMatches] = useState<LolMatchSummary[]>([]);
  const [isLoadingLive, setIsLoadingLive] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [isPageReady, setIsPageReady] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);
  const [revealGen, setRevealGen] = useState(0);
  const [bootPhases, setBootPhases] = useState<LolBootPhases>({
    ddragon: 'loading',
    edge: 'loading',
    matches: 'loading',
    assets: 'pending',
  });

  const demoData = useMemo(() => buildDemoLolDataset(groupMembers), [groupMembers]);

  const loadLiveData = useCallback(async () => {
    const memberIds = groupMembers.map((m) => m.id);
    if (memberIds.length === 0) {
      setLiveAccounts([]);
      setLiveMatches([]);
      setIsLoadingLive(false);
      return { accounts: [] as LolAccount[], matches: [] as LolMatchSummary[] };
    }

    setIsLoadingLive(true);
    const res = await fetchGroupLolData(memberIds);
    setLiveAccounts(res.accounts);
    setLiveMatches(res.matches);
    setIsLoadingLive(false);

    if (res.error) {
      setFeedback({ type: 'error', message: res.error });
    }
    return { accounts: res.accounts, matches: res.matches };
  }, [groupMembers]);

  useEffect(() => {
    let cancelled = false;

    const runFullBootPipeline = async () => {
      setIsPageReady(false);
      setBootProgress(8);
      setBootPhases({
        ddragon: 'loading',
        edge: 'loading',
        matches: 'loading',
        assets: 'pending',
      });

      let resolvedVersion = ddragonVersion || DEFAULT_DDRAGON_VERSION;
      let progressAcc = 8;

      const bumpProgress = (delta: number) => {
        if (cancelled) return;
        progressAcc = Math.min(75, progressAcc + delta);
        setBootProgress(progressAcc);
      };

      const ddragonPromise = loadDdragonRunesAndSpells()
        .then((ver) => {
          resolvedVersion = ver;
          if (!cancelled) {
            setDdragonVersion(ver);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) {
            setBootPhases((prev) => ({ ...prev, ddragon: 'done' }));
            bumpProgress(22);
          }
        });

      const edgePromise = getRiotEdgeStatus()
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
        })
        .finally(() => {
          if (!cancelled) {
            setBootPhases((prev) => ({ ...prev, edge: 'done' }));
            bumpProgress(18);
          }
        });

      const dataPromise = (async () => {
        if (isDemoMode) {
          return {
            accounts: demoData.accounts,
            matches: demoData.matches,
            members: demoData.members,
          };
        }
        const live = await loadLiveData();
        return {
          accounts: live.accounts,
          matches: live.matches,
          members: groupMembers,
        };
      })().finally(() => {
        if (!cancelled) {
          setBootPhases((prev) => ({ ...prev, matches: 'done' }));
          bumpProgress(27);
        }
      });

      const [, , resolvedData] = await Promise.all([
        ddragonPromise,
        edgePromise,
        dataPromise,
      ]);

      if (cancelled) return;

      setBootPhases((prev) => ({ ...prev, assets: 'loading' }));
      setBootProgress(78);

      const imageUrls = collectLolCriticalImageUrls({
        accounts: resolvedData.accounts,
        matches: resolvedData.matches,
        members: resolvedData.members,
        ddragonVersion: resolvedVersion,
      });

      await preloadLolImages(imageUrls, 1100, (loaded, total) => {
        if (cancelled) return;
        const ratio = total > 0 ? loaded / total : 1;
        setBootProgress(Math.min(99, Math.round(78 + ratio * 21)));
      });

      if (cancelled) return;

      setBootPhases({
        ddragon: 'done',
        edge: 'done',
        matches: 'done',
        assets: 'done',
      });
      setBootProgress(100);
      setRevealGen((g) => g + 1);
      setIsPageReady(true);
    };

    void runFullBootPipeline();

    return () => {
      cancelled = true;
    };
  }, [isDemoMode, loadLiveData, demoData, groupMembers]);

  useEffect(() => {
    if (!supabase || isDemoMode) return;
    const client = supabase;
    const channel = client
      .channel('lol-group-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lol_accounts' },
        () => {
          void loadLiveData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lol_matches' },
        () => {
          void loadLiveData();
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [isDemoMode, loadLiveData]);

  const activeMembers = isDemoMode ? demoData.members : groupMembers;
  const activeAccounts = isDemoMode ? demoData.accounts : liveAccounts;
  const activeMatches = isDemoMode ? demoData.matches : liveMatches;

  useEffect(() => {
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
  }, [activeAccounts, selectedUserId, currentUser.id]);

  const selectedAccount = useMemo(
    () =>
      activeAccounts.find((a) => a.userId === selectedUserId) ??
      activeAccounts[0] ??
      null,
    [activeAccounts, selectedUserId]
  );

  const selectedMemberProfile = useMemo(
    () => activeMembers.find((m) => m.id === selectedAccount?.userId) ?? currentUser,
    [activeMembers, selectedAccount, currentUser]
  );

  const groupPuuids = useMemo(
    () => new Set(activeAccounts.map((a) => a.puuid)),
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

  const personalVsGroupStats = useMemo(() => {
    if (!selectedAccount) return null;
    return computePlayerAggregates(
      globallyFilteredMatches,
      selectedAccount.puuid,
      groupPuuids,
      'all'
    );
  }, [globallyFilteredMatches, selectedAccount, groupPuuids]);

  const leaderboardEntries = useMemo(
    () =>
      computeGroupLeaderboard({
        matches: globallyFilteredMatches,
        accounts: activeAccounts,
        playerProfiles: activeMembers,
        queueFilter: 'all',
      }),
    [globallyFilteredMatches, activeAccounts, activeMembers]
  );

  const roleLeaderboard = useMemo(
    () =>
      computeGroupLeaderboardByRole({
        matches: globallyFilteredMatches,
        accounts: activeAccounts,
        playerProfiles: activeMembers,
        queueFilter: 'all',
      }),
    [globallyFilteredMatches, activeAccounts, activeMembers]
  );

  const hasGroupMatches = useMemo(
    () => globallyFilteredMatches.some((m) => isGroupMatch(m, groupPuuids)),
    [globallyFilteredMatches, groupPuuids]
  );

  const groupRecords = useMemo(
    () =>
      computeGroupRecords({
        matches: globallyFilteredMatches,
        accounts: activeAccounts,
        playerProfiles: activeMembers,
        queueFilter: 'all',
        scope: recordsScope,
      }),
    [globallyFilteredMatches, activeAccounts, activeMembers, recordsScope]
  );

  const selectedMatch = useMemo(
    () => activeMatches.find((m) => m.matchId === selectedMatchId) ?? null,
    [activeMatches, selectedMatchId]
  );

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
  }): Promise<{ ok: boolean; error?: string }> => {
    setIsSyncing(true);
    try {
      const res = await linkAndSyncRiotAccount(params);
      if (res.ok) {
        await loadLiveData();
        setSelectedUserId(params.userId);
        showTransientFeedback(
          'success',
          `Vinculado ${params.gameName}#${params.tagLine} (${res.fetchedMatches ?? 0} nuevas, ${res.cachedMatches ?? 0} en caché).`
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
        await loadLiveData();
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
    const ids = activeAccounts.map((a) => a.userId);
    if (ids.length === 0) return;
    setIsSyncing(true);
    try {
      const res = await syncRiotGroup({ userIds: ids });
      if (res.ok) {
        await loadLiveData();
        showTransientFeedback(
          'success',
          `Grupo sincronizado: ${res.syncedCount ?? ids.length} cuentas, ${res.fetchedMatches ?? 0} partidas nuevas.`
        );
      } else {
        showTransientFeedback('error', res.error || 'Error al sincronizar el grupo.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUnlinkAccount = async (userId: string) => {
    setIsSyncing(true);
    try {
      const res = await unlinkRiotAccount(userId);
      if (res.ok) {
        await loadLiveData();
        showTransientFeedback('success', 'Cuenta de Riot desvinculada.');
      } else {
        showTransientFeedback('error', res.error || 'No se pudo desvincular.');
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
    return (
      <LolLoadingScreen
        progress={bootProgress}
        phases={bootPhases}
        groupName={activeGroup?.name}
        isDemoMode={isDemoMode}
      />
    );
  }

  const filterAnimKey = `${revealGen}-${selectedAccount?.userId ?? 'none'}-${selectedQueues.join(',')}-${timeRange}`;

  return (
    <div key={`lol-ready-${revealGen}`} className="space-y-4">
      <div className="animate-lol-reveal" style={{ animationDelay: '0ms' }}>
        <LolHeaderBar
          userGroups={userGroups}
          activeGroup={activeGroup}
          onSelectGroup={setActiveGroupId}
          groupMembers={activeMembers}
          accounts={activeAccounts}
          selectedUserId={selectedAccount?.userId ?? selectedUserId}
          onSelectUser={(uid) => {
            setSelectedUserId(uid);
            setSelectedMatchId(null);
          }}
          selectedQueues={selectedQueues}
          onToggleQueue={handleToggleQueue}
          timeRange={timeRange}
          onChangeTimeRange={setTimeRange}
          isDemoMode={isDemoMode}
          onToggleDemoMode={(demo) => {
            setIsDemoMode(demo);
            setSelectedMatchId(null);
          }}
          isSyncing={isSyncing}
          hasServerRiotKey={hasServerRiotKey}
          serverKeyUpdatedAt={serverKeyUpdatedAt}
          ddragonVersion={ddragonVersion}
          onLinkAndSync={handleLinkAndSync}
          onSyncPlayer={handleSyncPlayer}
          onSyncGroup={handleSyncGroup}
          onUnlinkAccount={handleUnlinkAccount}
          onSaveServerRiotKey={handleSaveServerRiotKey}
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

      {!selectedAccount || !personalVsGroupStats ? (
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
      ) : (
        <div key={filterAnimKey} className="space-y-4">
          <div className="animate-lol-reveal" style={{ animationDelay: '65ms' }}>
            <LolStatsComparisonPanel
              account={selectedAccount}
              displayName={selectedMemberProfile.displayName}
              stats={personalVsGroupStats}
              ddragonVersion={ddragonVersion}
            />
          </div>

          {/* Bento Row 3 (Full Width): Panoramic Zoomable/Pannable Timeline + Group WR */}
          <div className="animate-lol-reveal" style={{ animationDelay: '130ms' }}>
            <LolDurationScatterPanel
              matches={globallyFilteredMatches}
              targetPuuid={selectedAccount.puuid}
              groupPuuids={groupPuuids}
              accountByPuuid={accountByPuuid}
              ddragonVersion={ddragonVersion}
              onSelectMatch={(matchId) => setSelectedMatchId(matchId)}
            />
          </div>

          {/* Bento Row 4: Compact Recent Matches (left) + Group Leaderboard / Role Leaders (right) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            <div
              className="xl:col-span-7 min-w-0 animate-lol-reveal"
              style={{ animationDelay: '195ms' }}
            >
              <LolRecentMatchesList
                matches={globallyFilteredMatches}
                targetPuuid={selectedAccount.puuid}
                groupPuuids={groupPuuids}
                accountByPuuid={accountByPuuid}
                ddragonVersion={ddragonVersion}
                onSelectMatch={(matchId) => setSelectedMatchId(matchId)}
              />
            </div>

            <div
              className="xl:col-span-5 min-w-0 animate-lol-reveal"
              style={{ animationDelay: '260ms' }}
            >
              <LolGroupLeaderboard
                entries={leaderboardEntries}
                roleLeaderboard={roleLeaderboard}
                selectedUserId={selectedAccount.userId}
                queueFilter={selectedQueues.length === 0 ? 'all' : selectedQueues[0]}
                ddragonVersion={ddragonVersion}
                onSelectPlayer={(uid) => setSelectedUserId(uid)}
              />
            </div>
          </div>

          {/* Bento Row 5 (Full Width): Group Records Bento Grid */}
          <div className="animate-lol-reveal" style={{ animationDelay: '325ms' }}>
            <LolGroupRecordsPanel
              records={groupRecords}
              scope={recordsScope}
              onChangeScope={setRecordsScope}
              hasGroupMatches={hasGroupMatches}
              selectedUserId={selectedAccount.userId}
              ddragonVersion={ddragonVersion}
              onSelectPlayer={(uid) => setSelectedUserId(uid)}
              onSelectMatch={(matchId) => setSelectedMatchId(matchId)}
            />
          </div>
        </div>
      )}

      {selectedMatch && selectedAccount && (
        <LolMatchDetailModal
          match={selectedMatch}
          initialParticipantPuuid={selectedAccount.puuid}
          groupPuuids={groupPuuids}
          accountByPuuid={accountByPuuid}
          ddragonVersion={selectedAccount.ddragonVersion || ddragonVersion}
          onClose={() => setSelectedMatchId(null)}
        />
      )}
    </div>
  );
};

export default LeagueOfLegendsView;
