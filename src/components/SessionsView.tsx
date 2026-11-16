import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { useApp } from '@/context/AppContext';
import {
  AttendanceVote,
  Game,
  GroupGameRecommendation,
  PrecisionMinutes,
  SessionParticipant,
} from '@/types/domain';
import {
  calculateGameSynchrony,
  calculateScheduleOverlap,
  formatMinutesToTime,
  getEffectiveDailySchedule,
  parseTimeMinutes,
} from '@/lib/matchmakingEngine';
import {
  GLOBAL_GAMES_KNOWLEDGE_BASE,
  KnowledgeGameEntry,
  generateGroupGameRecommendations,
  normalizeGameName,
} from '@/lib/tasteProfileEngine';
import { fetchExternalDiscoveryGames } from '@/lib/steamService';
import { GroupOnboardingEmptyState } from '@/components/sessions/GroupOnboardingEmptyState';
import { ScheduleOverlapBentoCard } from '@/components/sessions/ScheduleOverlapBentoCard';
import { PersonalCheckInBentoCard } from '@/components/sessions/PersonalCheckInBentoCard';
import { InstantSessionRsvpCard } from '@/components/sessions/InstantSessionRsvpCard';
import { InstantSessionModal } from '@/components/sessions/InstantSessionModal';
import { RouletteSynchronyBentoCard } from '@/components/sessions/RouletteSynchronyBentoCard';
import { SelectedSessionGameCard } from '@/components/sessions/SelectedSessionGameCard';
import { ParticipantsTribunalBentoCard } from '@/components/sessions/ParticipantsTribunalBentoCard';
import { SessionCreateModal } from '@/components/sessions/SessionCreateModal';
import { SessionManageInvitesModal } from '@/components/sessions/SessionManageInvitesModal';
import { SessionCalloutModal } from '@/components/sessions/SessionCalloutModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Dices,
  Gamepad2,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

export interface SessionsViewProps {
  onNavigateToGroups?: () => void;
}

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isParticipantConfirmed(participant?: SessionParticipant | null): boolean {
  if (!participant) return false;
  return (
    participant.confirmationStatus === 'confirmed' ||
    participant.confidencePercentage === 100
  );
}

export const SessionsView: React.FC<SessionsViewProps> = ({ onNavigateToGroups }) => {
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    createInstantSession,
    deleteSession,
    respondToInstantSession,
    addGameToGroup,
    joinOrUpdateSessionSchedule,
    confirmSessionAttendance,
    sendSessionCallout,
    updateSessionInvites,
    leaveSession,
    spinSessionRoulette,
    lockSessionGame,
    selectSessionGame,
    games,
    addGame,
    preferences,
    players,
    currentUser,
    castAttendanceVote,
    pingLatePlayer,
    discordConfig,
    userGroups,
    activeGroup,
    createGroup,
    joinGroupByInviteCode,
  } = useApp();

  // Group sessions scoped to activeGroup
  const groupSessions = useMemo(() => {
    if (!activeGroup) return [];
    return sessions.filter((s) => s.groupId === activeGroup.id);
  }, [sessions, activeGroup]);

  const activeSession = useMemo(() => {
    return (
      groupSessions.find((s) => s.id === activeSessionId) ??
      groupSessions[0] ??
      null
    );
  }, [groupSessions, activeSessionId]);

  const groupMembers = useMemo(() => {
    if (!activeGroup) return players;
    const memberSet = new Set(activeGroup.memberIds);
    return players.filter((p) => memberSet.has(p.id));
  }, [activeGroup, players]);

  const groupGames = useMemo(() => {
    if (!activeGroup) return [];
    const groupGameSet = new Set(activeGroup.gameIds);
    return games.filter((g) => groupGameSet.has(g.id));
  }, [activeGroup, games]);

  // Personal Check-in & schedule editor local state synced to activeSession participant
  const currentParticipant = useMemo(() => {
    return activeSession?.participants.find((p) => p.userId === currentUser.id);
  }, [activeSession, currentUser.id]);

  const [joinFromTime, setJoinFromTime] = useState('22:00');
  const [joinUntilTime, setJoinUntilTime] = useState('01:30');
  const [joinPrecision, setJoinPrecision] = useState<PrecisionMinutes>(15);
  const [joinNote, setJoinNote] = useState('');

  useEffect(() => {
    if (currentParticipant) {
      setJoinFromTime(currentParticipant.availableFrom);
      setJoinUntilTime(currentParticipant.availableUntil);
      setJoinPrecision(currentParticipant.precisionMinutes);
      setJoinNote(currentParticipant.note ?? '');
    } else if (activeSession) {
      const eff = getEffectiveDailySchedule(currentUser, activeSession.date);
      setJoinFromTime(eff.availableFrom || '22:00');
      setJoinUntilTime(eff.availableUntil || '01:30');
      setJoinPrecision(eff.precisionMinutes || 15);
      setJoinNote('');
    }
  }, [currentParticipant, activeSession, currentUser]);

  const calculatedStrictDeadline = useMemo(() => {
    const startMins = parseTimeMinutes(joinFromTime);
    return formatMinutesToTime(startMins + joinPrecision);
  }, [joinFromTime, joinPrecision]);

  // Modals & action UI states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInstantModal, setShowInstantModal] = useState(false);
  const [showManageInvitesModal, setShowManageInvitesModal] = useState(false);
  const [showCalloutModal, setShowCalloutModal] = useState(false);
  const [pingingUserId, setPingingUserId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [sessionSubTab, setSessionSubTab] = useState<'session' | 'games'>('session');

  const canDeleteActiveSession = useMemo(() => {
    if (!activeSession) return false;
    return (
      activeSession.createdBy === currentUser.id ||
      activeGroup?.createdBy === currentUser.id ||
      Boolean(activeGroup?.adminIds.includes(currentUser.id))
    );
  }, [activeSession, activeGroup, currentUser.id]);

  const activeInstantSession = useMemo(
    () =>
      groupSessions.find(
        (s) => s.sessionKind === 'instant' && s.status !== 'finished'
      ),
    [groupSessions]
  );

  // Roulette animation state
  const [isSpinningRoulette, setIsSpinningRoulette] = useState(false);
  const [slotReelGameName, setSlotReelGameName] = useState<string | null>(null);
  const [rouletteWinnerBanner, setRouletteWinnerBanner] = useState<Game | null>(null);
  const spinTimerRef = useRef<number | null>(null);
  const spinIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    setRouletteWinnerBanner(null);
    setSlotReelGameName(null);
    setIsSpinningRoulette(false);
    setConfirmDeleteSession(false);
  }, [activeSession?.id]);

  useEffect(() => {
    return () => {
      if (spinTimerRef.current) window.clearTimeout(spinTimerRef.current);
      if (spinIntervalRef.current) window.clearInterval(spinIntervalRef.current);
    };
  }, []);

  // Optional live IGDB/Steam discovery pool for session recommendations
  const [liveDiscoveryGames, setLiveDiscoveryGames] = useState<KnowledgeGameEntry[]>([]);
  useEffect(() => {
    if (!activeSession || liveDiscoveryGames.length > 0) return;
    let cancelled = false;
    fetchExternalDiscoveryGames({
      igdbClientId: discordConfig.igdbClientId,
      igdbClientSecret: discordConfig.igdbClientSecret,
    })
      .then((res) => {
        if (!cancelled && res.length > 0) {
          setLiveDiscoveryGames(res);
        }
      })
      .catch(() => {
        // Silently fall back to GLOBAL_GAMES_KNOWLEDGE_BASE
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeSession,
    liveDiscoveryGames.length,
    discordConfig.igdbClientId,
    discordConfig.igdbClientSecret,
  ]);

  // Computed Engine Values
  const scheduleOverlap = useMemo(() => {
    if (!activeSession) return null;
    return calculateScheduleOverlap(activeSession.participants, players);
  }, [activeSession, players]);

  const synchronyResults = useMemo(() => {
    if (!activeSession) return [];
    return calculateGameSynchrony(
      groupGames,
      preferences,
      activeSession.participants,
      players,
      activeSession.allowSplitLobbies
    );
  }, [activeSession, groupGames, preferences, players]);

  const perfectGames = useMemo(
    () => synchronyResults.filter((r) => r.status === 'perfect_fit'),
    [synchronyResults]
  );

  const splitGames = useMemo(
    () => synchronyResults.filter((r) => r.status === 'split_required'),
    [synchronyResults]
  );

  const incompatibleGames = useMemo(
    () =>
      synchronyResults.filter(
        (r) => r.status !== 'perfect_fit' && r.status !== 'split_required'
      ),
    [synchronyResults]
  );

  const sessionRecommendations = useMemo(() => {
    if (!activeSession) {
      return { readyToPlay: [], discovery: [], all: [] };
    }
    const targetIds = new Set(activeSession.participants.map((p) => p.userId));
    const targetPlayers =
      targetIds.size > 0
        ? players.filter((p) => targetIds.has(p.id))
        : groupMembers;

    return generateGroupGameRecommendations({
      targetPlayers,
      catalogGames: groupGames,
      preferences,
      externalDiscoveryGames:
        liveDiscoveryGames.length > 0 ? liveDiscoveryGames : GLOBAL_GAMES_KNOWLEDGE_BASE,
      maxResultsPerCategory: 6,
    });
  }, [activeSession, players, groupMembers, groupGames, preferences, liveDiscoveryGames]);

  const activeGame = useMemo(() => {
    if (!activeSession) return null;
    const id =
      rouletteWinnerBanner?.id ||
      activeSession.rouletteWinnerGameId ||
      activeSession.selectedGameId ||
      activeSession.selectedGameIds?.[0];
    if (!id) return null;
    return games.find((g) => g.id === id) ?? null;
  }, [activeSession, games, rouletteWinnerBanner]);

  const activeGameSync = useMemo(() => {
    if (!activeGame) return undefined;
    return synchronyResults.find((r) => r.game.id === activeGame.id);
  }, [activeGame, synchronyResults]);

  const confirmedParticipantsCount = useMemo(() => {
    if (!activeSession) return 0;
    return activeSession.participants.filter((p) => isParticipantConfirmed(p)).length;
  }, [activeSession]);

  const probableParticipants = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.participants.filter((p) => !isParticipantConfirmed(p));
  }, [activeSession]);

  const todayStr = getTodayDateString();

  const showTempBanner = (msg: string) => {
    setFeedbackBanner(msg);
    window.setTimeout(() => {
      setFeedbackBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // Sync a recommendation (ready_to_play or discovery) into catalog cleanly
  const ensureCatalogGameFromRec = (rec: GroupGameRecommendation): Game | null => {
    if (rec.catalogGameId) {
      return games.find((g) => g.id === rec.catalogGameId) ?? null;
    }
    const norm = normalizeGameName(rec.name);
    const existing = games.find((g) => normalizeGameName(g.name) === norm);
    if (existing) return existing;

    return addGame({
      name: rec.name,
      description: rec.description || 'Agregado desde Recomendaciones IA Grupales',
      coverUrl: rec.coverUrl,
      minPlayers: rec.minPlayers,
      maxPlayers: rec.maxPlayers,
      category: rec.category,
      tags: rec.tags,
      averageDurationMins: 60,
    });
  };

  // Roulette Spin Handler with slot reel visual & confetti
  const handleSpinRoulette = (onlyLocked = false) => {
    if (!activeSession || isSpinningRoulette) return;
    const lockedIds =
      activeSession.selectedGameIds && activeSession.selectedGameIds.length > 0
        ? activeSession.selectedGameIds
        : activeSession.selectedGameId
          ? [activeSession.selectedGameId]
          : [];

    const allCandidates = [...perfectGames, ...splitGames, ...incompatibleGames];
    const pool =
      onlyLocked && lockedIds.length > 0
        ? allCandidates.filter((item) => lockedIds.includes(item.game.id))
        : [...perfectGames, ...splitGames];
    if (pool.length === 0) return;

    setIsSpinningRoulette(true);
    setRouletteWinnerBanner(null);

    let tick = 0;
    spinIntervalRef.current = window.setInterval(() => {
      const candidate = pool[tick % pool.length];
      setSlotReelGameName(candidate.game.name);
      tick += 1;
    }, 90);

    spinTimerRef.current = window.setTimeout(() => {
      if (spinIntervalRef.current) {
        window.clearInterval(spinIntervalRef.current);
        spinIntervalRef.current = null;
      }
      const winner = spinSessionRoulette(activeSession.id, { onlyLocked });
      setIsSpinningRoulette(false);
      setSlotReelGameName(null);
      if (winner) {
        setRouletteWinnerBanner(winner);
        showTempBanner(`🎲 Ruleta ponderada eligió: ${winner.name} (enviado a Discord)`);
        try {
          confetti({
            particleCount: 70,
            spread: 60,
            origin: { y: 0.6 },
          });
        } catch {
          // Ignore confetti errors in headless test environments
        }
      }
    }, 1350);
  };

  const handlePingLate = async (targetUserId: string) => {
    if (!activeSession) return;
    setPingingUserId(targetUserId);
    try {
      await pingLatePlayer(activeSession.id, targetUserId);
      const target = players.find((p) => p.id === targetUserId);
      showTempBanner(
        `🔔 Reclamo enviado por Discord & Push a ${target?.displayName ?? 'jugador'}`
      );
    } finally {
      window.setTimeout(() => setPingingUserId(null), 1200);
    }
  };

  const handleCastVote = (targetUserId: string, vote: AttendanceVote['vote']) => {
    if (!activeSession) return;
    castAttendanceVote(activeSession.id, targetUserId, vote);
  };

  // Empty state if user has no groups
  if (userGroups.length === 0) {
    return (
      <GroupOnboardingEmptyState
        onCreateGroup={(params) => {
          createGroup(params);
        }}
        onJoinGroup={(code) => joinGroupByInviteCode(code)}
        onNavigateToGroups={onNavigateToGroups}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact Session Selector Bar + New Session CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {groupSessions.map((sess) => {
            const isSelected = activeSession?.id === sess.id;
            const confCount = sess.participants.filter((p) => isParticipantConfirmed(p)).length;
            return (
              <button
                key={sess.id}
                type="button"
                onClick={() => setActiveSessionId(sess.id)}
                className={cn(
                  'px-2.5 py-1 rounded-md border text-left shrink-0 transition-colors cursor-pointer min-w-[140px] max-w-[195px]',
                  isSelected
                    ? 'bg-secondary/60 border-primary text-foreground'
                    : 'bg-card/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                )}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[11px] font-semibold truncate">{sess.title}</span>
                  <Badge
                    variant={sess.sessionKind === 'instant' ? 'warning' : sess.mode === 'random' ? 'default' : 'secondary'}
                    className="text-[9px] px-1 py-0 shrink-0"
                  >
                    {sess.sessionKind === 'instant'
                      ? '⚡'
                      : sess.mode === 'random'
                        ? 'Ruleta'
                        : 'Fijo'}
                  </Badge>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground flex items-center justify-between gap-2 mt-0.5">
                  <span>{sess.date}</span>
                  <span className="text-success font-medium">
                    {confCount}/{sess.participants.length}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeSession && canDeleteActiveSession && (
            confirmDeleteSession ? (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    deleteSession(activeSession.id);
                    setConfirmDeleteSession(false);
                    showTempBanner('Sesión eliminada.');
                  }}
                  title="Confirmar eliminación"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                  <span>Confirmar</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDeleteSession(false)}
                  title="Cancelar"
                  aria-label="Cancelar"
                >
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="w-9 px-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                onClick={() => setConfirmDeleteSession(true)}
                title="Eliminar sesión"
                aria-label="Eliminar sesión"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.75} />
              </Button>
            )
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={Boolean(activeInstantSession)}
            onClick={() => {
              if (activeInstantSession) {
                setActiveSessionId(activeInstantSession.id);
                return;
              }
              setShowInstantModal(true);
            }}
            title={
              activeInstantSession
                ? 'Ya hay una convocatoria instantánea en curso'
                : 'Convocar jugadores ahora'
            }
          >
            <Zap className="w-4 h-4 text-warning" strokeWidth={1.75} />
            <span>Convocar ahora</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreateModal(true)}
          >
            <CalendarPlus className="w-4 h-4" strokeWidth={1.75} />
            <span>Nueva Sesión</span>
          </Button>
        </div>
      </div>

      {/* Floating Toast Feedback Banner (zero layout shift) */}
      {feedbackBanner && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-md px-3.5 py-2.5 rounded-md bg-card/95 backdrop-blur-md border border-success/40 shadow-lg text-success text-xs flex items-center justify-between gap-2.5"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            {feedbackBanner}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            title="Cerrar"
            aria-label="Cerrar"
            className="opacity-75 hover:opacity-100 cursor-pointer p-0.5 rounded shrink-0"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}

      {/* Main Content */}
      {!activeSession ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <div className="w-10 h-10 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary mx-auto">
              <Dices className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              Sin sesiones en {activeGroup?.name ?? 'este grupo'}
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowInstantModal(true)}
              >
                <Zap className="w-4 h-4 text-warning" strokeWidth={1.75} />
                <span>Convocar ahora</span>
              </Button>
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                <CalendarPlus className="w-4 h-4" strokeWidth={1.75} />
                <span>Programar sesión</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Session Sub-Tabs: Sesión | Juegos */}
          <Tabs
            value={sessionSubTab}
            onValueChange={(v) => setSessionSubTab(v as 'session' | 'games')}
            className="w-full space-y-3"
          >
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="session" className="gap-1.5 text-xs">
                <Calendar className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Sesión</span>
              </TabsTrigger>
              <TabsTrigger value="games" className="gap-1.5 text-xs">
                <Gamepad2 className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                <span>Juegos</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="session" className="mt-0">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                <div className="xl:col-span-7 flex flex-col gap-4 min-w-0">
                  <ScheduleOverlapBentoCard
                    activeSession={activeSession}
                    scheduleOverlap={scheduleOverlap}
                    isParticipantConfirmed={isParticipantConfirmed}
                  />

                  <RouletteSynchronyBentoCard
                    sectionMode="locked"
                    activeSession={activeSession}
                    activeGame={activeGame}
                    participantsCount={activeSession.participants.length}
                    perfectGames={perfectGames}
                    splitGames={splitGames}
                    incompatibleGames={incompatibleGames}
                    sessionRecommendations={sessionRecommendations}
                    isSpinningRoulette={isSpinningRoulette}
                    slotReelGameName={slotReelGameName}
                    rouletteWinnerBanner={rouletteWinnerBanner}
                    onSpinRoulette={() => handleSpinRoulette(true)}
                    chosenGameId={activeGame?.id}
                    onSelectGame={(gameId) => {
                      selectSessionGame(activeSession.id, gameId);
                      setRouletteWinnerBanner(null);
                      const chosen = games.find((g) => g.id === gameId);
                      if (chosen) {
                        showTempBanner(`🎮 Juego elegido: ${chosen.name}`);
                      }
                    }}
                    onOpenGamesTab={() => setSessionSubTab('games')}
                    onLockGame={(gameId) => {
                      const existingIds =
                        activeSession.selectedGameIds ??
                        (activeSession.selectedGameId ? [activeSession.selectedGameId] : []);
                      const wasLocked = existingIds.includes(gameId);
                      lockSessionGame(activeSession.id, gameId);
                      const locked = games.find((g) => g.id === gameId);
                      if (locked) {
                        showTempBanner(
                          wasLocked
                            ? `Juego quitado: ${locked.name}`
                            : `🔒 Juego fijado: ${locked.name}`
                        );
                      }
                    }}
                    onSelectRecommendation={(rec) => {
                      const game = ensureCatalogGameFromRec(rec);
                      if (game) {
                        if (activeGroup) {
                          addGameToGroup(activeGroup.id, game.id);
                        }
                        lockSessionGame(activeSession.id, game.id);
                        showTempBanner(`✨ Juego importado/fijado: ${game.name}`);
                      }
                    }}
                  />
                </div>

                <div className="xl:col-span-5 flex flex-col gap-4 min-w-0">
                  {activeGame && (
                    <SelectedSessionGameCard
                      game={activeGame}
                      syncResult={activeGameSync}
                      isRouletteWinner={
                        Boolean(rouletteWinnerBanner?.id === activeGame.id) ||
                        activeSession.rouletteWinnerGameId === activeGame.id
                      }
                    />
                  )}

                  {activeSession.sessionKind === 'instant' ? (
                    <InstantSessionRsvpCard
                      activeSession={activeSession}
                      currentUser={currentUser}
                      groupMembers={groupMembers}
                      onRespond={(resp) => {
                        respondToInstantSession(activeSession.id, resp);
                        showTempBanner(
                          resp.status === 'going'
                            ? '⚡ ¡Anotado! Tu llegada se actualizó en el gráfico.'
                            : 'Avisaste que esta vez no podés.'
                        );
                      }}
                    />
                  ) : (
                    <PersonalCheckInBentoCard
                      currentUser={currentUser}
                      currentParticipant={currentParticipant}
                      isConfirmed={isParticipantConfirmed(currentParticipant)}
                      joinFromTime={joinFromTime}
                      setJoinFromTime={setJoinFromTime}
                      joinUntilTime={joinUntilTime}
                      setJoinUntilTime={setJoinUntilTime}
                      joinPrecision={joinPrecision}
                      setJoinPrecision={setJoinPrecision}
                      joinNote={joinNote}
                      setJoinNote={setJoinNote}
                      calculatedStrictDeadline={calculatedStrictDeadline}
                      onJoinOrUpdate={() => {
                        joinOrUpdateSessionSchedule(activeSession.id, {
                          availableFrom: joinFromTime,
                          availableUntil: joinUntilTime,
                          precisionMinutes: joinPrecision,
                          note: joinNote || undefined,
                          confirmAttendance: true,
                        });
                        showTempBanner('✅ Horario guardado y asistencia confirmada (100%) en Discord.');
                      }}
                      onLeaveSession={() => {
                        leaveSession(activeSession.id);
                        showTempBanner('Saliste de la sesión.');
                      }}
                      onConfirmAttendance={() => {
                        confirmSessionAttendance(activeSession.id);
                        showTempBanner('✅ Confirmaste asistencia al 100%.');
                      }}
                    />
                  )}

                  <ParticipantsTribunalBentoCard
                    activeSession={activeSession}
                    currentUser={currentUser}
                    players={players}
                    games={groupGames}
                    preferences={preferences}
                    scheduleOverlap={scheduleOverlap}
                    confirmedParticipantsCount={confirmedParticipantsCount}
                    probableParticipantsCount={probableParticipants.length}
                    isParticipantConfirmed={isParticipantConfirmed}
                    pingingUserId={pingingUserId}
                    onConfirmAttendance={(userId) => confirmSessionAttendance(activeSession.id, userId)}
                    onPingLate={handlePingLate}
                    onCastVote={handleCastVote}
                    onOpenManageInvites={() => setShowManageInvitesModal(true)}
                    onOpenCalloutModal={() => setShowCalloutModal(true)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="games" className="mt-0">
              <RouletteSynchronyBentoCard
                sectionMode="games"
                activeSession={activeSession}
                activeGame={activeGame}
                participantsCount={activeSession.participants.length}
                perfectGames={perfectGames}
                splitGames={splitGames}
                incompatibleGames={incompatibleGames}
                sessionRecommendations={sessionRecommendations}
                isSpinningRoulette={isSpinningRoulette}
                slotReelGameName={slotReelGameName}
                rouletteWinnerBanner={rouletteWinnerBanner}
                onSpinRoulette={() => handleSpinRoulette(false)}
                chosenGameId={activeGame?.id}
                onSelectGame={(gameId) => {
                  selectSessionGame(activeSession.id, gameId);
                  setRouletteWinnerBanner(null);
                  const chosen = games.find((g) => g.id === gameId);
                  if (chosen) {
                    showTempBanner(`🎮 Juego elegido: ${chosen.name}`);
                  }
                }}
                onLockGame={(gameId) => {
                  const existingIds =
                    activeSession.selectedGameIds ??
                    (activeSession.selectedGameId ? [activeSession.selectedGameId] : []);
                  const wasLocked = existingIds.includes(gameId);
                  lockSessionGame(activeSession.id, gameId);
                  const locked = games.find((g) => g.id === gameId);
                  if (locked) {
                    showTempBanner(
                      wasLocked
                        ? `Juego quitado: ${locked.name}`
                        : `🔒 Juego fijado: ${locked.name}`
                    );
                  }
                }}
                onSelectRecommendation={(rec) => {
                  const game = ensureCatalogGameFromRec(rec);
                  if (game) {
                    if (activeGroup) {
                      addGameToGroup(activeGroup.id, game.id);
                    }
                    lockSessionGame(activeSession.id, game.id);
                    showTempBanner(`✨ Juego importado/fijado para la sesión: ${game.name}`);
                  }
                }}
              />
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Session Modals */}
      <InstantSessionModal
        open={showInstantModal}
        onOpenChange={setShowInstantModal}
        groupName={activeGroup?.name}
        onSubmit={({ startsInMinutes, title }) => {
          createInstantSession({
            groupId: activeGroup?.id,
            startsInMinutes,
            title,
          });
          showTempBanner(
            startsInMinutes > 0
              ? `⚡ Convocatoria programada para dentro de ${startsInMinutes}m.`
              : '⚡ Convocatoria instantánea enviada a todo el grupo.'
          );
        }}
      />

      <SessionCreateModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        activeGroup={activeGroup}
        groupMembers={groupMembers}
        currentUser={currentUser}
        games={groupGames}
        preferences={preferences}
        discordConfig={discordConfig}
        defaultDate={todayStr}
        onSyncDiscoveryToCatalog={ensureCatalogGameFromRec}
        onCreateSession={(params) => {
          createSession(params);
          showTempBanner(`🗓️ Sesión "${params.title}" creada y notificada en Discord.`);
        }}
      />

      {activeSession && (
        <>
          <SessionManageInvitesModal
            open={showManageInvitesModal}
            onOpenChange={setShowManageInvitesModal}
            activeSession={activeSession}
            groupMembers={groupMembers}
            currentUserId={currentUser.id}
            onSaveInvites={(invitedIds) => {
              updateSessionInvites(activeSession.id, invitedIds);
              showTempBanner('👥 Lista de invitados actualizada.');
            }}
          />

          <SessionCalloutModal
            open={showCalloutModal}
            onOpenChange={setShowCalloutModal}
            activeSession={activeSession}
            probableParticipants={probableParticipants}
            players={players}
            onSendCallout={async (msg) => {
              const res = await sendSessionCallout(activeSession.id, msg);
              showTempBanner(
                `📣 Reclamo enviado a ${res.notifiedUsers.length} probable(s) vía Discord y Web Push.`
              );
            }}
          />
        </>
      )}
    </div>
  );
};
