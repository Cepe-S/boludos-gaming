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
import { RouletteSynchronyBentoCard } from '@/components/sessions/RouletteSynchronyBentoCard';
import { ParticipantsTribunalBentoCard } from '@/components/sessions/ParticipantsTribunalBentoCard';
import { SessionCreateModal } from '@/components/sessions/SessionCreateModal';
import { SessionManageInvitesModal } from '@/components/sessions/SessionManageInvitesModal';
import { SessionCalloutModal } from '@/components/sessions/SessionCalloutModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Calendar,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Dices,
  FolderKanban,
  Moon,
  Settings,
  Sun,
  Users,
  X,
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
    joinOrUpdateSessionSchedule,
    confirmSessionAttendance,
    sendSessionCallout,
    updateSessionInvites,
    leaveSession,
    spinSessionRoulette,
    lockSessionGame,
    games,
    addGame,
    preferences,
    players,
    currentUser,
    checkInToSession,
    castAttendanceVote,
    pingLatePlayer,
    toggleTodayNotPlaying,
    setShowWeeklyScheduleModal,
    discordConfig,
    userGroups,
    activeGroup,
    setActiveGroupId,
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
  const [showManageInvitesModal, setShowManageInvitesModal] = useState(false);
  const [showCalloutModal, setShowCalloutModal] = useState(false);
  const [pingingUserId, setPingingUserId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

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
      games,
      preferences,
      activeSession.participants,
      players,
      activeSession.allowSplitLobbies
    );
  }, [activeSession, games, preferences, players]);

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
      catalogGames: games,
      preferences,
      externalDiscoveryGames:
        liveDiscoveryGames.length > 0 ? liveDiscoveryGames : GLOBAL_GAMES_KNOWLEDGE_BASE,
      maxResultsPerCategory: 6,
    });
  }, [activeSession, players, groupMembers, games, preferences, liveDiscoveryGames]);

  const activeGame = useMemo(() => {
    if (!activeSession) return null;
    const id = activeSession.selectedGameId || activeSession.rouletteWinnerGameId;
    if (!id) return null;
    return games.find((g) => g.id === id) ?? null;
  }, [activeSession, games]);

  const confirmedParticipantsCount = useMemo(() => {
    if (!activeSession) return 0;
    return activeSession.participants.filter((p) => isParticipantConfirmed(p)).length;
  }, [activeSession]);

  const probableParticipants = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.participants.filter((p) => !isParticipantConfirmed(p));
  }, [activeSession]);

  const todayStr = getTodayDateString();
  const effectiveToday = useMemo(
    () => getEffectiveDailySchedule(currentUser, todayStr),
    [currentUser, todayStr]
  );

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
  const handleSpinRoulette = () => {
    if (!activeSession || isSpinningRoulette) return;
    const pool = [...perfectGames, ...splitGames];
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
      const winner = spinSessionRoulette(activeSession.id);
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
    <div className="space-y-4">
      {/* Group Strip + Today Auto-Enrollment Quick Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-md bg-card/50 border border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <FolderKanban
            className="w-3.5 h-3.5 text-primary shrink-0 mr-0.5"
            strokeWidth={1.75}
            aria-label="Grupo"
          />

          {userGroups.map((g) => {
            const isActive = activeGroup?.id === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveGroupId(g.id)}
                className={cn(
                  'px-2.5 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-2 transition-colors cursor-pointer',
                  isActive
                    ? 'bg-primary/15 border-primary text-foreground'
                    : 'bg-background/45 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <span className="truncate max-w-[140px]">{g.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary/55 border border-border text-muted-foreground">
                  {g.memberIds.length}
                </span>
              </button>
            );
          })}

          {onNavigateToGroups && (
            <Button
              size="xs"
              variant="ghost"
              className="w-6 px-0"
              onClick={onNavigateToGroups}
              title="Gestionar grupos y webhooks"
              aria-label="Gestionar grupos y webhooks"
            >
              <Settings className="w-3.5 h-3.5" strokeWidth={1.75} />
            </Button>
          )}
        </div>

        {/* Today Auto-Enrollment Status */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              'px-2.5 py-1 rounded-md border text-[11px] inline-flex items-center gap-1.5',
              effectiveToday.plays
                ? 'bg-success/10 border-success/35 text-success'
                : 'bg-destructive/10 border-destructive/35 text-destructive'
            )}
          >
            {effectiveToday.plays ? (
              <>
                <Sun className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>
                  Hoy {effectiveToday.availableFrom}–{effectiveToday.availableUntil} ·{' '}
                  {effectiveToday.confidencePercentage}%
                </span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Hoy no juego</span>
              </>
            )}
          </div>

          <Button
            size="xs"
            variant={effectiveToday.plays ? 'outline' : 'destructive'}
            onClick={() => toggleTodayNotPlaying('Cambio rápido desde Sesiones')}
            title={effectiveToday.plays ? 'Marcar Hoy No Juego' : 'Volver a Jugar Hoy'}
          >
            {effectiveToday.plays ? 'No juego' : 'Juego hoy'}
          </Button>

          <Button
            size="xs"
            variant="secondary"
            onClick={() => setShowWeeklyScheduleModal(true)}
            title="Configurar horario semanal"
          >
            <CalendarClock className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Horario</span>
          </Button>
        </div>
      </div>

      {/* Session Selector Bar + New Session CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {groupSessions.map((sess) => {
            const isSelected = activeSession?.id === sess.id;
            const confCount = sess.participants.filter((p) => isParticipantConfirmed(p)).length;
            return (
              <button
                key={sess.id}
                type="button"
                onClick={() => setActiveSessionId(sess.id)}
                className={cn(
                  'px-3 py-2 rounded-md border text-left shrink-0 transition-colors cursor-pointer min-w-[190px]',
                  isSelected
                    ? 'bg-secondary/55 border-primary text-foreground'
                    : 'bg-card/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" strokeWidth={1.75} />
                    {sess.date}
                  </span>
                  <Badge
                    variant={sess.mode === 'random' ? 'default' : 'secondary'}
                    className="text-[9px] px-1.5 py-0"
                  >
                    {sess.mode === 'random' ? 'Ruleta' : 'Fijo'}
                  </Badge>
                </div>
                <div className="text-xs font-semibold truncate">{sess.title}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span>{sess.participants.length} anotados</span>
                  <span className="text-success font-medium">{confCount} conf.</span>
                </div>
              </button>
            );
          })}
        </div>

        <Button
          size="sm"
          className="shrink-0"
          onClick={() => setShowCreateModal(true)}
        >
          <CalendarPlus className="w-4 h-4" strokeWidth={1.75} />
          <span>Nueva Sesión</span>
        </Button>
      </div>

      {/* Toast Feedback Banner */}
      {feedbackBanner && (
        <div className="px-3.5 py-2.5 rounded-md bg-success/10 border border-success/40 text-success text-xs flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            {feedbackBanner}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            title="Cerrar"
            aria-label="Cerrar"
            className="opacity-75 hover:opacity-100 cursor-pointer p-0.5 rounded"
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
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <CalendarPlus className="w-4 h-4" strokeWidth={1.75} />
              <span>Crear sesión</span>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Compact Session Summary Hero */}
          <div className="p-4 rounded-md bg-card/50 border border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">
                  <Calendar className="w-3 h-3" strokeWidth={1.75} />
                  <span>{activeSession.date}</span>
                </Badge>
                <Badge
                  variant={
                    activeSession.status === 'open'
                      ? 'success'
                      : activeSession.status === 'in_progress'
                        ? 'default'
                        : 'secondary'
                  }
                  className="text-[10px]"
                >
                  {activeSession.status === 'open'
                    ? 'Abierta'
                    : activeSession.status === 'in_progress'
                      ? 'En curso'
                      : 'Finalizada'}
                </Badge>
                {activeGame && (
                  <Badge variant="purple" className="text-[10px]">
                    {activeGame.name}
                  </Badge>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
                {activeSession.title}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Badge variant="secondary" className="py-1 px-2.5 font-mono">
                <Users className="w-3.5 h-3.5 mr-1 text-primary" strokeWidth={1.75} />
                {confirmedParticipantsCount}/{activeSession.participants.length} conf.
              </Badge>
            </div>
          </div>

          {/* BENTO GRID ROW 1: Schedule Overlap Timeline + Personal Check-in */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ScheduleOverlapBentoCard
              activeSession={activeSession}
              scheduleOverlap={scheduleOverlap}
              isParticipantConfirmed={isParticipantConfirmed}
            />

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
              onCheckIn={() => {
                checkInToSession(activeSession.id);
                showTempBanner('✅ Check-in registrado en el Tribunal del Humo.');
              }}
            />
          </div>

          {/* BENTO GRID ROW 2: Weighted Roulette & Synchrony + Participants & Tribunal */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            <RouletteSynchronyBentoCard
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
              onSpinRoulette={handleSpinRoulette}
              onLockGame={(gameId) => {
                lockSessionGame(activeSession.id, gameId);
                const locked = games.find((g) => g.id === gameId);
                if (locked) {
                  showTempBanner(`🔒 Juego fijado: ${locked.name}`);
                }
              }}
              onSelectRecommendation={(rec) => {
                const game = ensureCatalogGameFromRec(rec);
                if (game) {
                  lockSessionGame(activeSession.id, game.id);
                  showTempBanner(`✨ Juego importado/fijado para la sesión: ${game.name}`);
                }
              }}
            />

            <ParticipantsTribunalBentoCard
              activeSession={activeSession}
              currentUser={currentUser}
              players={players}
              games={games}
              preferences={preferences}
              scheduleOverlap={scheduleOverlap}
              confirmedParticipantsCount={confirmedParticipantsCount}
              probableParticipantsCount={probableParticipants.length}
              isParticipantConfirmed={isParticipantConfirmed}
              pingingUserId={pingingUserId}
              onConfirmAttendance={(userId) => confirmSessionAttendance(activeSession.id, userId)}
              onCheckIn={(userId) => checkInToSession(activeSession.id, undefined, userId)}
              onPingLate={handlePingLate}
              onCastVote={handleCastVote}
              onOpenManageInvites={() => setShowManageInvitesModal(true)}
              onOpenCalloutModal={() => setShowCalloutModal(true)}
            />
          </div>
        </>
      )}

      {/* Session Modals */}
      <SessionCreateModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        activeGroup={activeGroup}
        groupMembers={groupMembers}
        currentUser={currentUser}
        games={games}
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
