import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { buildDemoLolDataset } from '@/lib/lolDemoData';
import { DEFAULT_DDRAGON_VERSION, loadDdragonRunesAndSpells } from '@/lib/lolDdragon';
import {
  computeGroupLeaderboard,
  computeGroupLeaderboardByRole,
  computeGroupRecords,
  computePlayerAggregates,
  getQueueCategory,
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
import { LolAccount, LolMatchSummary, LolPlatform, LolQueueCategory } from '@/types/lol';
import { LolDurationScatterPanel } from './lol/LolDurationScatterPanel';
import { LolGroupLeaderboard } from './lol/LolGroupLeaderboard';
import { LolGroupRecordsPanel } from './lol/LolGroupRecordsPanel';
import { LolHeaderBar } from './lol/LolHeaderBar';
import { LolMatchDetailModal } from './lol/LolMatchDetailModal';
import { LolRecentMatchesList } from './lol/LolRecentMatchesList';
import { LolStatsComparisonPanel } from './lol/LolStatsComparisonPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Loader2, Sparkles, Swords } from 'lucide-react';

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
  const [queueFilter, setQueueFilter] = useState<LolQueueCategory>('all');
  const [recordsScope, setRecordsScope] = useState<'group' | 'all'>('group');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(currentUser.id);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

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

  useEffect(() => {
    loadDdragonRunesAndSpells()
      .then((ver) => setDdragonVersion(ver))
      .catch(() => undefined);

    getRiotEdgeStatus()
      .then((status) => {
        setHasServerRiotKey(status.hasServerKey);
        setServerKeyUpdatedAt(status.updatedAt ?? null);
      })
      .catch(() => {
        setHasServerRiotKey(false);
        setServerKeyUpdatedAt(null);
      });
  }, []);

  const loadLiveData = useCallback(async () => {
    const memberIds = groupMembers.map((m) => m.id);
    if (memberIds.length === 0) {
      setLiveAccounts([]);
      setLiveMatches([]);
      setIsLoadingLive(false);
      return;
    }

    setIsLoadingLive(true);
    const res = await fetchGroupLolData(memberIds);
    setLiveAccounts(res.accounts);
    setLiveMatches(res.matches);
    setIsLoadingLive(false);

    if (res.error) {
      setFeedback({ type: 'error', message: res.error });
    }
  }, [groupMembers]);

  useEffect(() => {
    if (!isDemoMode) {
      void loadLiveData();
    }
  }, [isDemoMode, loadLiveData]);

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

  const demoData = useMemo(() => buildDemoLolDataset(groupMembers), [groupMembers]);

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

  const queueFilteredMatches = useMemo(() => {
    if (queueFilter === 'all') return activeMatches;
    return activeMatches.filter(
      (m) => getQueueCategory(m.queueId, m.gameMode) === queueFilter
    );
  }, [activeMatches, queueFilter]);

  const personalVsGroupStats = useMemo(() => {
    if (!selectedAccount) return null;
    return computePlayerAggregates(
      activeMatches,
      selectedAccount.puuid,
      groupPuuids,
      queueFilter
    );
  }, [activeMatches, selectedAccount, groupPuuids, queueFilter]);

  const leaderboardEntries = useMemo(
    () =>
      computeGroupLeaderboard({
        matches: activeMatches,
        accounts: activeAccounts,
        playerProfiles: activeMembers,
        queueFilter,
      }),
    [activeMatches, activeAccounts, activeMembers, queueFilter]
  );

  const roleLeaderboard = useMemo(
    () =>
      computeGroupLeaderboardByRole({
        matches: activeMatches,
        accounts: activeAccounts,
        playerProfiles: activeMembers,
        queueFilter,
      }),
    [activeMatches, activeAccounts, activeMembers, queueFilter]
  );

  const hasGroupMatches = useMemo(
    () => queueFilteredMatches.some((m) => isGroupMatch(m, groupPuuids)),
    [queueFilteredMatches, groupPuuids]
  );

  const groupRecords = useMemo(
    () =>
      computeGroupRecords({
        matches: activeMatches,
        accounts: activeAccounts,
        playerProfiles: activeMembers,
        queueFilter,
        scope: recordsScope,
      }),
    [activeMatches, activeAccounts, activeMembers, queueFilter, recordsScope]
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

  return (
    <div className="space-y-4">
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
        queueFilter={queueFilter}
        onChangeQueueFilter={setQueueFilter}
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

      {feedback && (
        <div
          className={cn(
            'px-3.5 py-2.5 rounded-md border text-xs font-medium flex items-center gap-2',
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

      {!isDemoMode && isLoadingLive && activeAccounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Cargando datos de League of Legends...</span>
          </CardContent>
        </Card>
      ) : !selectedAccount || !personalVsGroupStats ? (
        <Card>
          <CardContent className="py-10 px-4 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-11 h-11 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary">
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
      ) : (
        <>
          <LolStatsComparisonPanel
            account={selectedAccount}
            displayName={selectedMemberProfile.displayName}
            stats={personalVsGroupStats}
            ddragonVersion={ddragonVersion}
          />

          {/* Bento Row 3: Compact Recent Matches (left) + Unified Time vs Duration Scatter (right) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            <div className="xl:col-span-7 min-w-0">
              <LolRecentMatchesList
                matches={queueFilteredMatches}
                targetPuuid={selectedAccount.puuid}
                groupPuuids={groupPuuids}
                accountByPuuid={accountByPuuid}
                ddragonVersion={ddragonVersion}
                onSelectMatch={(matchId) => setSelectedMatchId(matchId)}
              />
            </div>

            <div className="xl:col-span-5 min-w-0">
              <LolDurationScatterPanel
                matches={queueFilteredMatches}
                targetPuuid={selectedAccount.puuid}
                groupPuuids={groupPuuids}
                accountByPuuid={accountByPuuid}
                ddragonVersion={ddragonVersion}
                onSelectMatch={(matchId) => setSelectedMatchId(matchId)}
              />
            </div>
          </div>

          {/* Bento Row 4: Compact Group Leaderboard + Role Leaders (left) + Group Records (right) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            <div className="xl:col-span-6 min-w-0">
              <LolGroupLeaderboard
                entries={leaderboardEntries}
                roleLeaderboard={roleLeaderboard}
                selectedUserId={selectedAccount.userId}
                queueFilter={queueFilter}
                ddragonVersion={ddragonVersion}
                onSelectPlayer={(uid) => setSelectedUserId(uid)}
              />
            </div>

            <div className="xl:col-span-6 min-w-0">
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
        </>
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
