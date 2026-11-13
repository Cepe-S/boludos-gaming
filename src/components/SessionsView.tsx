import React, { useState, useMemo, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useApp } from '../context/AppContext';
import {
  calculateGameSynchrony,
  calculateScheduleOverlap,
  sortPlayersByLobbyPriority,
  formatMinutesToTime,
  parseTimeMinutes,
  getEffectiveScheduleForDate,
} from '../lib/matchmakingEngine';
import {
  Game,
  GamingSession,
  PrecisionMinutes,
  AttendanceStatus,
  GameSynchronyResult,
  ParticipantScheduleTimeline,
  PlayerProfile,
  SessionParticipant,
} from '../types/domain';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Ban,
  Bell,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Dices,
  Flame,
  Gamepad2,
  Ghost,
  Lock,
  Megaphone,
  MessageSquare,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  Shuffle,
  Sparkles,
  Star,
  Swords,
  Timer,
  Trophy,
  Unlock,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';

export function SessionsView() {
  const {
    currentUser,
    players,
    games,
    preferences,
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
    checkInToSession,
    castAttendanceVote,
    pingLatePlayer,
    toggleTodayNotPlaying,
    setShowWeeklyScheduleModal,
  } = useApp();

  // Active session
  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || sessions[0] || null;
  }, [sessions, activeSessionId]);

  // Today string & Effective Daily Schedule for current user
  const todayStr = useMemo(() => {
    return activeSession?.date || new Date().toISOString().split('T')[0];
  }, [activeSession?.date]);

  const effectiveToday = useMemo(() => {
    return getEffectiveScheduleForDate(currentUser, todayStr);
  }, [currentUser, todayStr]);

  // Modal: New Session
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('Noche de Vicio Viernes 🍕');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newMode, setNewMode] = useState<'random' | 'fixed'>('random');
  const [newSelectedGameId, setNewSelectedGameId] = useState<string>('');
  const [newAllowSplit, setNewAllowSplit] = useState(true);
  const [newFromTime, setNewFromTime] = useState('22:00');
  const [newUntilTime, setNewUntilTime] = useState('02:00');
  const [newPrecision, setNewPrecision] = useState<PrecisionMinutes>(15);
  const [newInviteMode, setNewInviteMode] = useState<'all' | 'custom'>('all');
  const [newSelectedInviteIds, setNewSelectedInviteIds] = useState<string[]>([]);

  // Modal: Manage Existing Session Invites
  const [isManageInvitesOpen, setIsManageInvitesOpen] = useState(false);
  const [editInviteMode, setEditInviteMode] = useState<'all' | 'custom'>('all');
  const [editSelectedInviteIds, setEditSelectedInviteIds] = useState<string[]>([]);

  // Modal: Session Callout ("Llamado a Sesión")
  const [isCalloutModalOpen, setIsCalloutModalOpen] = useState(false);
  const [calloutCustomMessage, setCalloutCustomMessage] = useState(
    '¡Che gente, confirmen si juegan hoy que estamos cerrando el quórum de la noche!'
  );
  const [isSendingCallout, setIsSendingCallout] = useState(false);

  // Sync initial invited users when opening new session modal
  useEffect(() => {
    if (isNewModalOpen && newSelectedInviteIds.length === 0) {
      setNewSelectedInviteIds(players.map((p) => p.id));
    }
  }, [isNewModalOpen, players, newSelectedInviteIds.length]);

  // Helper: Determine if a participant is 100% confirmed
  const isParticipantConfirmed = (participant?: SessionParticipant | null): boolean => {
    if (!participant) return false;
    if (participant.confirmationStatus === 'confirmed') return true;
    if (participant.isAutoEnrolled === false && participant.confirmationStatus !== 'probable') {
      return true;
    }
    return false;
  };

  // Helper: List of participants in probable (<100%) status
  const probableParticipants = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.participants.filter((p) => {
      const isInvited =
        !activeSession.invitedUserIds ||
        activeSession.invitedUserIds.length === 0 ||
        activeSession.invitedUserIds.includes(p.userId);
      return isInvited && !isParticipantConfirmed(p);
    });
  }, [activeSession]);

  // Helper: Count of confirmed participants (100%)
  const confirmedParticipantsCount = useMemo(() => {
    if (!activeSession) return 0;
    return activeSession.participants.filter(isParticipantConfirmed).length;
  }, [activeSession]);

  // Availability / Join Panel Form
  const currentParticipant = useMemo(() => {
    return activeSession?.participants.find((p) => p.userId === currentUser.id);
  }, [activeSession, currentUser.id]);

  const [joinFromTime, setJoinFromTime] = useState('22:00');
  const [joinUntilTime, setJoinUntilTime] = useState('02:00');
  const [joinPrecision, setJoinPrecision] = useState<PrecisionMinutes>(15);
  const [joinNote, setJoinNote] = useState('');

  // Sync join form when current participant or active session changes
  useEffect(() => {
    if (currentParticipant) {
      setJoinFromTime(currentParticipant.availableFrom);
      setJoinUntilTime(currentParticipant.availableUntil);
      setJoinPrecision(currentParticipant.precisionMinutes);
      setJoinNote(currentParticipant.note || '');
    } else {
      setJoinFromTime('22:00');
      setJoinUntilTime('02:00');
      setJoinPrecision(15);
      setJoinNote('');
    }
  }, [currentParticipant, activeSession?.id]);

  // Ping & Vote feedback toasts
  const [actionAlert, setActionAlert] = useState<{
    type: 'success' | 'info' | 'warning';
    message: string;
  } | null>(null);

  // Roulette interactive animation state
  const [isSpinning, setIsSpinning] = useState(false);
  const [rouletteIndex, setRouletteIndex] = useState(0);
  const [winnerCelebration, setWinnerCelebration] = useState<Game | null>(null);
  const spinTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Synchrony view tabs: 'perfect' | 'split' | 'incompatible'
  const [syncTab, setSyncTab] = useState<'perfect' | 'split' | 'incompatible'>('perfect');

  // Compute Schedule Overlap
  const scheduleOverlap = useMemo(() => {
    if (!activeSession) return null;
    return calculateScheduleOverlap(activeSession.participants, players);
  }, [activeSession, players]);

  // Compute Game Synchrony
  const synchronyResults = useMemo(() => {
    if (!activeSession) return [];
    return calculateGameSynchrony(
      games,
      preferences,
      activeSession.participants,
      players,
      activeSession.allowSplitLobbies
    );
  }, [games, preferences, activeSession, players]);

  // Filter synchrony sets
  const perfectFitGames = useMemo(
    () => synchronyResults.filter((r) => r.status === 'perfect_fit'),
    [synchronyResults]
  );
  const splitRequiredGames = useMemo(
    () => synchronyResults.filter((r) => r.status === 'split_required'),
    [synchronyResults]
  );
  const incompatibleGames = useMemo(
    () =>
      synchronyResults.filter(
        (r) => r.status === 'needs_more_players' || r.status === 'missing_owners'
      ),
    [synchronyResults]
  );

  // Candidates for roulette (all eligible games)
  const rouletteEligibleGames = useMemo(() => {
    const list = synchronyResults.filter(
      (r) => r.status === 'perfect_fit' || (activeSession?.allowSplitLobbies && r.status === 'split_required')
    );
    return list.length > 0 ? list : synchronyResults.slice(0, 5);
  }, [synchronyResults, activeSession?.allowSplitLobbies]);

  // Current session selected/winning game object
  const currentSessionGame = useMemo(() => {
    if (!activeSession) return null;
    const gId = activeSession.selectedGameId || activeSession.rouletteWinnerGameId;
    return games.find((g) => g.id === gId) || null;
  }, [activeSession, games]);

  // Calculate dynamic strict deadline for the current form inputs
  const calculatedStrictDeadline = useMemo(() => {
    const fromMins = parseTimeMinutes(joinFromTime);
    return formatMinutesToTime(fromMins + joinPrecision);
  }, [joinFromTime, joinPrecision]);

  // Helper alert auto-dismiss
  const triggerAlert = (type: 'success' | 'info' | 'warning', message: string) => {
    setActionAlert({ type, message });
    setTimeout(() => {
      setActionAlert(null);
    }, 5500);
  };

  // Roulette Spin Handler
  const handleSpinRoulette = () => {
    if (!activeSession || isSpinning) return;

    if (rouletteEligibleGames.length === 0) {
      triggerAlert('warning', 'No hay juegos con suficientes jugadores compatibles para girar la ruleta.');
      return;
    }

    setIsSpinning(true);
    setWinnerCelebration(null);

    let speed = 70;
    let step = 0;
    const totalSteps = 28 + Math.floor(Math.random() * 8);

    const spinStep = () => {
      step++;
      setRouletteIndex((prev) => (prev + 1) % rouletteEligibleGames.length);

      if (step < totalSteps) {
        if (step > totalSteps - 10) {
          speed += 35; // Decelerate smoothly
        }
        spinTimerRef.current = setTimeout(spinStep, speed);
      } else {
        // Complete spin in AppContext
        const wonGame = spinSessionRoulette(activeSession.id);
        setIsSpinning(false);

        if (wonGame) {
          setWinnerCelebration(wonGame);
          // Confetti explosion
          try {
            confetti({
              particleCount: 120,
              spread: 80,
              origin: { y: 0.55 },
              colors: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'],
            });
          } catch {
            // ignore in headless test
          }
          triggerAlert(
            'success',
            `🎉 ¡La Ruleta eligió "${wonGame.name}"! Se avisó al canal de Discord y por Web Push.`
          );
        }
      }
    };

    spinTimerRef.current = setTimeout(spinStep, speed);
  };

  useEffect(() => {
    return () => {
      if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    };
  }, []);

  // Helper badge to display a player's probability for a given date
  const renderPlayerProbabilityBadge = (player: PlayerProfile, dateStr: string) => {
    const eff = getEffectiveScheduleForDate(player, dateStr);
    if (!eff.plays) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/70 border border-rose-500/40 text-rose-300 text-[10px] font-bold shrink-0"
          title={eff.reason ? `Motivo: ${eff.reason}` : 'No juega por defecto'}
        >
          <Ban className="w-2.5 h-2.5 text-rose-400" />
          <span>Hoy no juega{eff.reason ? ` ("${eff.reason}")` : ''}</span>
        </span>
      );
    }

    const confidence = eff.confidencePercentage ?? 75;
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold shrink-0"
        title={`Probabilidad: ${confidence}% (${eff.source === 'weekly' ? 'Horario default' : 'Horario especial'})`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>
          🟢 {confidence}% Probable ({eff.availableFrom}–{eff.availableUntil})
        </span>
      </span>
    );
  };

  // Handle Confirm Attendance (100%)
  const handleConfirmAttendance = (userId?: string) => {
    if (!activeSession) return;
    const targetUserId = userId || currentUser.id;
    const targetPlayer = players.find((p) => p.id === targetUserId);

    if (typeof confirmSessionAttendance === 'function') {
      confirmSessionAttendance(activeSession.id, targetUserId);
    } else {
      const part = activeSession.participants.find((p) => p.userId === targetUserId);
      if (part) {
        joinOrUpdateSessionSchedule(activeSession.id, {
          availableFrom: part.availableFrom,
          availableUntil: part.availableUntil,
          precisionMinutes: part.precisionMinutes,
          note: part.note,
          userId: targetUserId,
          confirmAttendance: true,
        });
      }
    }

    triggerAlert(
      'success',
      `✅ ¡Asistencia 100% Confirmada para ${targetPlayer?.displayName || 'el jugador'}! Lugar asegurado en el lobby.`
    );
  };

  // Handle Trigger Callout ("Llamado a Sesión")
  const handleTriggerCallout = async () => {
    if (!activeSession || isSendingCallout) return;
    setIsSendingCallout(true);
    try {
      let notifiedUsers: PlayerProfile[] = [];
      if (typeof sendSessionCallout === 'function') {
        const result = await sendSessionCallout(activeSession.id, calloutCustomMessage.trim() || undefined);
        notifiedUsers = result?.notifiedUsers || [];
      }
      const count = notifiedUsers.length > 0 ? notifiedUsers.length : probableParticipants.length;
      setIsCalloutModalOpen(false);
      triggerAlert(
        'success',
        `📣 ¡Llamado a Sesión enviado a ${count} jugadores probables por Discord (<@menciones>) y Web Push!`
      );
    } catch (err) {
      triggerAlert(
        'warning',
        `Error al enviar el llamado: ${err instanceof Error ? err.message : 'Error inesperado'}`
      );
    } finally {
      setIsSendingCallout(false);
    }
  };

  // Handle Open Manage Invites Modal
  const handleOpenManageInvites = () => {
    if (!activeSession) return;
    if (!activeSession.invitedUserIds || activeSession.invitedUserIds.length === 0) {
      setEditInviteMode('all');
      setEditSelectedInviteIds(players.map((p) => p.id));
    } else {
      setEditInviteMode('custom');
      setEditSelectedInviteIds(activeSession.invitedUserIds);
    }
    setIsManageInvitesOpen(true);
  };

  // Handle Save Invites
  const handleSaveInvites = () => {
    if (!activeSession) return;
    const nextInvites = editInviteMode === 'custom' ? editSelectedInviteIds : undefined;
    if (typeof updateSessionInvites === 'function') {
      updateSessionInvites(activeSession.id, nextInvites);
    }
    setIsManageInvitesOpen(false);
    triggerAlert(
      'success',
      editInviteMode === 'custom'
        ? `🎯 Invitaciones actualizadas: ${editSelectedInviteIds.length} amigos convocados.`
        : '👥 Invitación abierta a todos los miembros del grupo.'
    );
  };

  // Handle Create Session
  const handleCreateSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const invitedUserIds = newInviteMode === 'custom' ? newSelectedInviteIds : undefined;

    const created = createSession({
      title: newTitle.trim(),
      date: newDate,
      mode: newMode,
      selectedGameId: newMode === 'fixed' && newSelectedGameId ? newSelectedGameId : undefined,
      allowSplitLobbies: newAllowSplit,
      availableFrom: newFromTime,
      availableUntil: newUntilTime,
      precisionMinutes: newPrecision,
      invitedUserIds,
    });

    setIsNewModalOpen(false);
    setActiveSessionId(created.id);
    triggerAlert('success', `¡Sesión "${created.title}" creada y anunciada en el canal de Discord!`);
  };

  // Handle Join or Update Schedule
  const handleJoinOrUpdate = () => {
    if (!activeSession) return;
    joinOrUpdateSessionSchedule(activeSession.id, {
      availableFrom: joinFromTime,
      availableUntil: joinUntilTime,
      precisionMinutes: joinPrecision,
      note: joinNote.trim() || undefined,
      userId: currentUser.id,
    });
    triggerAlert(
      'success',
      `¡Tu horario fue guardado! Límite estricto sin sanción: ${calculatedStrictDeadline}`
    );
  };

  // Handle Leave Session
  const handleLeaveSession = () => {
    if (!activeSession) return;
    leaveSession(activeSession.id, currentUser.id);
    triggerAlert('info', 'Abandonaste la sesión.');
  };

  // Handle Check-in (always uses real current time)
  const handleCheckIn = () => {
    if (!activeSession) return;
    checkInToSession(activeSession.id, undefined, currentUser.id);
    triggerAlert(
      'success',
      '✅ Check-in registrado. ¡El Tribunal del Humo evaluó tu puntualidad!'
    );
  };

  // Handle Ping Player
  const handlePingPlayer = async (targetUserId: string) => {
    if (!activeSession) return;
    const target = players.find((p) => p.id === targetUserId);
    await pingLatePlayer(activeSession.id, targetUserId);
    triggerAlert(
      'warning',
      `🔔 ¡Alerta enviada a ${target?.displayName || 'tu amigo'}! Push disparado al celu y @mención en Discord.`
    );
  };

  // Handle Attendance Vote
  const handleCastVote = (
    targetUserId: string,
    vote: 'on_time' | 'late' | 'no_show',
    reason?: string
  ) => {
    if (!activeSession) return;
    castAttendanceVote(activeSession.id, targetUserId, vote, reason);
    const voteLabels = {
      on_time: 'En Hora ✅',
      late: 'Llegó Tarde ⚠️',
      no_show: 'Faltó / Humo 👻',
    };
    triggerAlert('info', `Voto registrado: ${voteLabels[vote]} para el Tribunal del Humo.`);
  };

  // If no session exists
  if (!activeSession) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-[#131c31]/80 rounded-3xl border border-indigo-500/20 text-center max-w-xl mx-auto my-12">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4 text-indigo-400">
          <CalendarClock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">No hay sesiones creadas todavía</h2>
        <p className="text-slate-400 mb-6 text-sm">
          Organizá la primera noche de vicio entre amigos con ruleta de sincronía y control estricto de puntualidad.
        </p>
        <button
          onClick={() => setIsNewModalOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>Crear Primera Sesión</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* 0. PROMINENT CONTROL BANNER: ESTADO DE HOY & AUTO-INSCRIPCIÓN SEMANAL */}
      <div
        className={`relative overflow-hidden rounded-3xl border p-5 sm:p-6 shadow-2xl backdrop-blur-md transition-all duration-300 ${
          effectiveToday.plays
            ? 'bg-gradient-to-r from-[#131c31]/95 via-emerald-950/20 to-[#131c31]/95 border-emerald-500/40 shadow-emerald-950/30'
            : 'bg-gradient-to-r from-[#131c31]/95 via-rose-950/30 to-[#131c31]/95 border-rose-500/50 shadow-rose-950/40'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-lg ${
                effectiveToday.plays
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : 'bg-rose-500/20 border-rose-500/50 text-rose-400'
              }`}
            >
              {effectiveToday.plays ? (
                <Zap className="w-6 h-6 animate-pulse" />
              ) : (
                <Ban className="w-6 h-6" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Estado de Hoy & Auto-Inscripción Semanal:
                </span>
                <span
                  className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                    effectiveToday.plays
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                      : 'bg-rose-500/20 border-rose-400/50 text-rose-300'
                  }`}
                >
                  {effectiveToday.plays ? '⚡ Anotado para Jugar' : '🚫 No Juego Hoy'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  ({todayStr})
                </span>
              </div>

              <p className="text-sm text-slate-200">
                {effectiveToday.plays ? (
                  <>
                    <strong className="text-white">
                      ⚡ Estás anotado automáticamente hoy de {effectiveToday.availableFrom} a {effectiveToday.availableUntil} (±{effectiveToday.precisionMinutes}m)
                    </strong>{' '}
                    según tu {effectiveToday.source === 'weekly' ? 'horario default semanal' : 'horario personalizado de hoy'}.
                  </>
                ) : (
                  <>
                    <strong className="text-rose-300">
                      🚫 Marcaste que hoy no jugás
                    </strong>
                    {effectiveToday.reason ? ` ("${effectiveToday.reason}")` : ''}. No estás anotado en el lobby de hoy y no serás sancionado por humo.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2 lg:pt-0">
            {effectiveToday.plays ? (
              <button
                onClick={() => {
                  toggleTodayNotPlaying('Avisó con el botón Hoy No Juego desde la pantalla principal');
                  triggerAlert('info', 'Avisaste que hoy no jugás. Fuiste removido del lobby de hoy sin sanción.');
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition transform hover:scale-105 active:scale-95 cursor-pointer"
                title="Avisar que hoy no podés jugar y desanotarte automáticamente sin sanción"
              >
                <Ban className="w-4 h-4" />
                <span>🚫 Hoy no juego</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  toggleTodayNotPlaying();
                  triggerAlert('success', '¡Genial! Volvés a estar disponible hoy según tu horario.');
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition transform hover:scale-105 active:scale-95 cursor-pointer"
                title="Volver a estar disponible hoy y re-anotarte al lobby automáticamente"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>✅ Volver a estar disponible hoy</span>
              </button>
            )}

            <button
              onClick={() => setShowWeeklyScheduleModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 hover:border-indigo-500/50 text-slate-200 hover:text-white font-semibold text-xs transition cursor-pointer shadow-sm"
              title="Ajustar tu rutina semanal por defecto o excepciones futuras"
            >
              <Calendar className="w-4 h-4 text-indigo-400" />
              <span>📅 Rutina Semanal / Excepciones</span>
            </button>
          </div>
        </div>
      </div>

      {/* EXPLICIT 100% ATTENDANCE CONFIRMATION PULSING BANNER FOR CURRENT USER */}
      {currentParticipant && !isParticipantConfirmed(currentParticipant) && (
        <div className="relative overflow-hidden p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-emerald-950/95 via-[#162744] to-indigo-950/95 border-2 border-emerald-500/80 shadow-2xl shadow-emerald-950/50 flex flex-col sm:flex-row items-center justify-between gap-5 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 border-dashed">
                  🎲 PROBABLE {currentParticipant.confidencePercentage ?? 75}% (Auto-horario)
                </span>
                <span className="text-xs text-slate-300 font-bold">
                  {currentParticipant.availableFrom} a {currentParticipant.availableUntil} (±{currentParticipant.precisionMinutes}m)
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-white mt-1">
                ¿Jugás seguro hoy en "{activeSession.title}"? ¡Confirmá tu asistencia!
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
                Tu horario default semanal es una probabilidad estimada (nunca es 100% hasta confirmar). Al confirmar, tu estado pasa a <strong className="text-emerald-300">100% CONFIRMADO</strong> para asegurar quórum y fijar la ruleta.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleConfirmAttendance(currentUser.id)}
            className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs tracking-wider uppercase shadow-xl shadow-emerald-500/30 transition transform hover:scale-105 active:scale-95 cursor-pointer shrink-0 flex items-center justify-center gap-2.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>✅ Confirmar Asistencia (100%)</span>
          </button>
        </div>
      )}

      {/* Action Toast Alert Banner */}
      {actionAlert && (
        <div
          className={`flex items-center justify-between p-4 rounded-2xl border shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${
            actionAlert.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200 shadow-emerald-950/40'
              : actionAlert.type === 'warning'
              ? 'bg-amber-950/80 border-amber-500/40 text-amber-200 shadow-amber-950/40'
              : 'bg-indigo-950/80 border-indigo-500/40 text-indigo-200 shadow-indigo-950/40'
          }`}
        >
          <div className="flex items-center gap-3 text-sm">
            {actionAlert.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {actionAlert.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />}
            {actionAlert.type === 'info' && <Bell className="w-5 h-5 text-indigo-400 shrink-0" />}
            <span>{actionAlert.message}</span>
          </div>
          <button
            onClick={() => setActionAlert(null)}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-300 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. SESSION SWITCHER & QUICK ACTION BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#131c31]/90 p-4 rounded-3xl border border-indigo-500/20 backdrop-blur-md shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">
            Sesiones:
          </span>
          {sessions.map((sess) => {
            const isSelected = sess.id === activeSession.id;
            return (
              <button
                key={sess.id}
                onClick={() => setActiveSessionId(sess.id)}
                className={`relative px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-2 border ${
                  isSelected
                    ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span>{sess.mode === 'random' ? '🎲' : '🎯'}</span>
                <span>{sess.title}</span>
                <span className="px-1.5 py-0.5 rounded-full bg-slate-900/80 text-[10px] text-slate-300 border border-slate-700">
                  {sess.participants.length} jug.
                </span>
                {sess.status === 'in_progress' && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Sesión</span>
          </button>
        </div>
      </div>

      {/* 2. ACTIVE SESSION HEADER & STATUS HERO */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#16213c] to-[#0f172a] border border-indigo-500/30 p-6 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left Session Details */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border ${
                  activeSession.mode === 'random'
                    ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                    : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                }`}
              >
                {activeSession.mode === 'random' ? (
                  <>
                    <Shuffle className="w-3.5 h-3.5 text-purple-400" />
                    <span>Ruleta Random (Sincronía)</span>
                  </>
                ) : (
                  <>
                    <Gamepad2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Juego Fijo</span>
                  </>
                )}
              </span>

              <span
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  activeSession.status === 'open'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : activeSession.status === 'in_progress'
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 animate-pulse'
                    : 'bg-slate-700/50 border-slate-600 text-slate-300'
                }`}
              >
                {activeSession.status === 'open'
                  ? 'Abierta • Anotándose'
                  : activeSession.status === 'in_progress'
                  ? 'En Progreso • Viciando'
                  : 'Finalizada'}
              </span>

              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{activeSession.date}</span>
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {activeSession.title}
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                {activeSession.participants.length === 0
                  ? 'No hay jugadores anotados aún. Sé el primero en confirmar tu horario con margen estricto.'
                  : `${activeSession.participants.length} amigos anotados. Margen estricto de puntualidad activo con sanciones por humo.`}
              </p>
            </div>

            {/* Quick Status Badges */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {/* Invitados Button / Popover trigger */}
              <button
                type="button"
                onClick={handleOpenManageInvites}
                className="flex items-center gap-1.5 bg-slate-900/80 hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-indigo-500/30 text-xs text-slate-200 transition cursor-pointer shadow-sm"
                title="Administrar quiénes están convocados a esta sesión"
              >
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  Invitados:{' '}
                  <strong className="text-white">
                    {!activeSession.invitedUserIds || activeSession.invitedUserIds.length === 0
                      ? `Todos (${players.length})`
                      : `${activeSession.invitedUserIds.length} amigos`}
                  </strong>
                </span>
                <span className="text-[10px] text-indigo-400 font-bold ml-1 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/20">
                  Editar
                </span>
              </button>

              {/* Confirmed Participants Count */}
              <div className="flex items-center gap-1.5 bg-emerald-950/70 border border-emerald-500/40 px-3 py-1.5 rounded-xl text-xs text-emerald-300 font-bold shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  <strong>{confirmedParticipantsCount}</strong> Confirmados (100%)
                </span>
              </div>

              {/* Probable Participants Count */}
              {probableParticipants.length > 0 && (
                <div
                  className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-500/40 border-dashed px-3 py-1.5 rounded-xl text-xs text-amber-300 font-bold"
                  title="Amigos con horario default semanal pendiente de confirmación 100%"
                >
                  <Dices className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    <strong>{probableParticipants.length}</strong> Probables (&lt;100%)
                  </span>
                </div>
              )}

              {/* Prominent Session Callout Button */}
              {probableParticipants.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsCalloutModalOpen(true)}
                  className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black px-3.5 py-1.5 rounded-xl text-xs shadow-lg shadow-amber-500/30 transition transform hover:scale-105 active:scale-95 cursor-pointer animate-pulse"
                  title="Enviar notificación Push con sonido al teléfono y <@mención> en Discord para confirmar"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span>📣 Llamar a Probables ({probableParticipants.length})</span>
                </button>
              )}

              {/* Sub-lobbies Status */}
              <div className="flex items-center gap-1.5 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
                <Swords className="w-3.5 h-3.5 text-purple-400" />
                <span>
                  Sub-lobbies:{' '}
                  <strong className={activeSession.allowSplitLobbies ? 'text-emerald-400' : 'text-slate-400'}>
                    {activeSession.allowSplitLobbies ? 'Habilitados' : 'Deshabilitados'}
                  </strong>
                </span>
              </div>

              {/* Current User Confirmation / Probable Badge */}
              {currentParticipant ? (
                isParticipantConfirmed(currentParticipant) ? (
                  <div className="flex items-center gap-1.5 bg-emerald-950/80 border border-emerald-500/50 px-3 py-1.5 rounded-xl text-xs text-emerald-300 font-black shadow-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      Estás 100% CONFIRMADO ✅ ({currentParticipant.availableFrom} ±{currentParticipant.precisionMinutes}m)
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-500/50 border-dashed px-3 py-1.5 rounded-xl text-xs text-amber-300 font-bold">
                    <Dices className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      Estás PROBABLE {currentParticipant.confidencePercentage ?? 75}% 🎲 (Auto-horario)
                    </span>
                  </div>
                )
              ) : (
                <div className="flex items-center gap-1.5 bg-amber-950/40 border border-amber-500/30 px-3 py-1.5 rounded-xl text-xs text-amber-300">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Aún no te anotaste</span>
                </div>
              )}
            </div>

            {/* Recent Callouts History Preview */}
            {activeSession.callouts && activeSession.callouts.length > 0 && (
              <div className="pt-2">
                <div className="p-3 rounded-2xl bg-slate-900/80 border border-amber-500/30 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-amber-300">
                      <Megaphone className="w-3.5 h-3.5 text-amber-400" />
                      <span>Historial de Convocatorias ({activeSession.callouts.length})</span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Último llamado:{' '}
                      {new Date(activeSession.callouts[0].triggeredAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {activeSession.callouts.slice(0, 2).map((callout) => {
                      const caller = players.find((p) => p.id === callout.triggeredBy);
                      return (
                        <div
                          key={callout.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-[11px]"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <strong className="text-white">📣 {caller?.displayName || 'Alguien'}</strong>
                            <span className="text-slate-400">convocó a {callout.notifiedUserIds.length} amigos:</span>
                            {callout.message && (
                              <span className="text-amber-200/90 italic truncate max-w-xs">
                                "{callout.message}"
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {callout.notifiedUserIds.slice(0, 5).map((uid) => {
                              const u = players.find((p) => p.id === uid);
                              return (
                                <img
                                  key={uid}
                                  src={u?.avatarUrl}
                                  alt={u?.displayName}
                                  title={u?.displayName}
                                  className="w-4 h-4 rounded-full border border-slate-600 object-cover"
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Game Showcase / Roulette Banner */}
          <div className="lg:col-span-5">
            {currentSessionGame ? (
              <div className="relative group bg-[#0e172a] rounded-2xl border border-indigo-500/40 p-4 shadow-xl flex items-center gap-4">
                <img
                  src={currentSessionGame.coverUrl}
                  alt={currentSessionGame.name}
                  className="w-24 h-28 object-cover rounded-xl shadow-lg border border-slate-700/60 group-hover:scale-105 transition duration-300"
                />
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/30">
                      {activeSession.rouletteWinnerGameId
                        ? '🏆 Ganador de Ruleta'
                        : '🎯 Juego Seleccionado'}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      👥 {currentSessionGame.minPlayers}-{currentSessionGame.maxPlayers} jug.
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white truncate">{currentSessionGame.name}</h3>
                  <p className="text-xs text-slate-400 line-clamp-1">
                    Categoría: <strong className="text-slate-300">{currentSessionGame.category}</strong>
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleSpinRoulette}
                      disabled={isSpinning}
                      className="px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-xs font-semibold border border-purple-500/40 transition cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSpinning ? 'animate-spin' : ''}`} />
                      <span>Volver a Girar</span>
                    </button>
                    <button
                      onClick={() => lockSessionGame(activeSession.id, currentSessionGame.id)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer flex items-center gap-1"
                      title="Fijar permanentemente"
                    >
                      <Lock className="w-3 h-3 text-indigo-400" />
                      <span>Fijar</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#0e172a]/90 rounded-2xl border border-purple-500/30 p-5 shadow-xl text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400">
                  <Dices className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Pendiente de Ruleta de Sincronía</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {rouletteEligibleGames.length} juegos compatibles según los gustos del grupo.
                  </p>
                </div>
                <button
                  onClick={handleSpinRoulette}
                  disabled={isSpinning || activeSession.participants.length === 0}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold tracking-wide shadow-lg shadow-purple-600/30 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Dices className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`} />
                  <span>{isSpinning ? 'Girando la Ruleta...' : '🎲 Girar Ruleta de Sincronía'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. AVAILABILITY & PRECISION CONTROLS (±5m, ±15m, ±30m, ±60m) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-[#131c31] rounded-3xl border border-indigo-500/20 p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                <Timer className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Tu Horario y Margen de Precisión</h3>
                <p className="text-xs text-slate-400">
                  Jugador activo:{' '}
                  <strong className="text-indigo-300">{currentUser.displayName}</strong>
                </p>
              </div>
            </div>

            {currentParticipant && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium">
                Anotado
              </span>
            )}
          </div>

          {/* Time pickers: Arrival & Departure */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Hora de Llegada (PC)</span>
              </label>
              <input
                type="time"
                value={joinFromTime}
                onChange={(e) => setJoinFromTime(e.target.value)}
                className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>Hora de Salida</span>
              </label>
              <input
                type="time"
                value={joinUntilTime}
                onChange={(e) => setJoinUntilTime(e.target.value)}
                className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition"
              />
            </div>
          </div>

          {/* Precision Margin Selector (±5m, ±15m, ±30m, ±60m) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
              <span>Margen de Precisión (Ventana de Tolerancia):</span>
              <span className="text-[11px] text-indigo-400 font-mono">
                {joinPrecision === 5 && '⌚ Reloj Suizo'}
                {joinPrecision === 15 && '🫡 Margen Normal'}
                {joinPrecision === 30 && '🐢 Tibio'}
                {joinPrecision === 60 && '💨 Humero Peligroso'}
              </span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                {
                  val: 5 as PrecisionMinutes,
                  label: '±5 min',
                  sub: 'Reloj Suizo',
                  color: 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300',
                  icon: '⌚',
                },
                {
                  val: 15 as PrecisionMinutes,
                  label: '±15 min',
                  sub: 'Normal',
                  color: 'border-indigo-500/50 bg-indigo-950/20 text-indigo-300',
                  icon: '🫡',
                },
                {
                  val: 30 as PrecisionMinutes,
                  label: '±30 min',
                  sub: 'Tibio',
                  color: 'border-amber-500/50 bg-amber-950/20 text-amber-300',
                  icon: '🐢',
                },
                {
                  val: 60 as PrecisionMinutes,
                  label: '±60 min',
                  sub: 'Humo',
                  color: 'border-rose-500/50 bg-rose-950/20 text-rose-300',
                  icon: '💨',
                },
              ].map((opt) => {
                const isSelected = joinPrecision === opt.val;
                return (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setJoinPrecision(opt.val)}
                    className={`p-3 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      isSelected
                        ? `${opt.color} ring-2 ring-indigo-400 shadow-md`
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-base">{opt.icon}</span>
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className="text-[10px] opacity-80">{opt.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Strict Deadline Explainer */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-indigo-500/30 text-xs space-y-1">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold">
              <ShieldAlert className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                Límite estricto de check-in sin sanción:{' '}
                <strong className="text-white underline font-mono text-sm">
                  {calculatedStrictDeadline}
                </strong>
              </span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Si hacés check-in pasadas las {calculatedStrictDeadline}, tu estado pasa automáticamente a{' '}
              <strong className="text-amber-400">Tarde ⚠️</strong> y el Tribunal del Humo te descontará{' '}
              <strong>10 puntos de Karma</strong>.
            </p>
          </div>

          {/* Optional Note */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Comentario opcional:
            </label>
            <input
              type="text"
              placeholder="Ej: Salgo de cenar con la patrona y me conecto"
              value={joinNote}
              onChange={(e) => setJoinNote(e.target.value)}
              className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
            />
          </div>

          {/* Join / Update Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleJoinOrUpdate}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs tracking-wide shadow-lg shadow-indigo-600/30 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>{currentParticipant ? 'Actualizar mi Horario' : 'Anotarme a la Sesión 🚀'}</span>
            </button>

            {currentParticipant && (
              <button
                onClick={handleLeaveSession}
                className="py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition cursor-pointer"
                title="Salir de la sesión"
              >
                Salir
              </button>
            )}
          </div>
        </div>

        {/* Check-in Box & Attendance Action Panel */}
        <div className="lg:col-span-6 bg-[#131c31] rounded-3xl border border-indigo-500/20 p-6 shadow-xl flex flex-col justify-between space-y-5">
          <div className="border-b border-slate-800 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Check-in de Puntualidad</h3>
                  <p className="text-xs text-slate-400">
                    Avisá que ya estás sentado frente a la PC listo para jugar.
                  </p>
                </div>
              </div>

              {currentParticipant?.checkedInAt && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                  En Hora ({currentParticipant.checkedInAt})
                </span>
              )}
            </div>
          </div>

          {/* Check-in Status or Button */}
          {currentParticipant?.attendanceStatus === 'on_time' ||
          currentParticipant?.attendanceStatus === 'late' ? (
            <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-emerald-300">
                ¡Check-in realizado con éxito!
              </h4>
              <p className="text-xs text-slate-300">
                Registrado a las <strong>{currentParticipant.checkedInAt}</strong>. Estado:{' '}
                <strong
                  className={
                    currentParticipant.attendanceStatus === 'on_time'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }
                >
                  {currentParticipant.attendanceStatus === 'on_time'
                    ? 'Puntual (+5 Karma) ✅'
                    : 'Llegó Tarde (-10 Karma) ⚠️'}
                </strong>
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentParticipant && !isParticipantConfirmed(currentParticipant) && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/80 to-indigo-950/80 border border-emerald-500/40 flex items-center justify-between gap-3 shadow-md">
                  <div>
                    <span className="text-xs font-bold text-amber-300 block">
                      🎲 Estado: Probable {currentParticipant.confidencePercentage ?? 75}% (Auto-horario)
                    </span>
                    <span className="text-[11px] text-slate-300">
                      Confirmá tu asistencia al 100% para afianzar el quórum grupal.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleConfirmAttendance(currentUser.id)}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs shadow-md transition transform hover:scale-105 cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirmar 100%</span>
                  </button>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs space-y-2">
                <div className="flex items-center gap-2 text-slate-300 font-semibold">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>Check-in en Tiempo Real</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Al hacer check-in se registrará la hora exacta de tu dispositivo para verificar si estás dentro de tu ventana de tolerancia ({currentParticipant?.availableFrom || joinFromTime} ±{currentParticipant?.precisionMinutes || joinPrecision}m) y el límite estricto ({calculatedStrictDeadline}).
                </p>
              </div>

              <button
                onClick={handleCheckIn}
                disabled={!currentParticipant}
                className="w-full py-3 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white font-bold text-sm shadow-xl shadow-emerald-950/60 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {currentParticipant
                    ? '✅ Hacer Check-in (Ya estoy en la PC)'
                    : 'Anotate primero para hacer Check-in'}
                </span>
              </button>
            </div>
          )}

          {/* Quick Tribunal Rules Reminder */}
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Puntual: +5 Karma</span>
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>Tarde: -10 Karma</span>
            </span>
            <span className="flex items-center gap-1">
              <Ghost className="w-3.5 h-3.5 text-rose-400" />
              <span>Humo/Plantón: -25 Karma</span>
            </span>
          </div>
        </div>
      </div>

      {/* 4. VISUAL GROUP SCHEDULE TIMELINE (24h / Evening Overlap Bar Chart) */}
      <div className="bg-[#131c31] rounded-3xl border border-indigo-500/20 p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Línea de Tiempo y Quórum Grupal</h3>
              <p className="text-xs text-slate-400">
                Visualización de ventanas de llegada, márgenes de tolerancia y solapamiento garantizado.
              </p>
            </div>
          </div>

          {scheduleOverlap && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 self-start sm:self-auto ${
                scheduleOverlap.hasValidOverlap
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              }`}
            >
              {scheduleOverlap.hasValidOverlap ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Hay Quórum Pleno de Horario</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Horarios Desfasados (&lt; 30 min)</span>
                </>
              )}
            </span>
          )}
        </div>

        {/* KPI Summary Cards */}
        {scheduleOverlap && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 block mb-1">
                Inicio Probable (Primeros)
              </span>
              <span className="text-lg font-extrabold text-white font-mono">
                {scheduleOverlap.probableStartFormatted}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-indigo-500/30">
              <span className="text-[11px] font-medium text-indigo-300 block mb-1">
                Inicio 100% Garantizado
              </span>
              <span className="text-lg font-extrabold text-indigo-300 font-mono">
                {scheduleOverlap.guaranteedStartFormatted}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 block mb-1">
                Fin Probable (Primer abandono)
              </span>
              <span className="text-lg font-extrabold text-white font-mono">
                {scheduleOverlap.probableEndFormatted}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-500/30">
              <span className="text-[11px] font-medium text-emerald-300 block mb-1">
                Tiempo de Vicio Coincidente
              </span>
              <span className="text-lg font-extrabold text-emerald-300 font-mono">
                {Math.floor(scheduleOverlap.guaranteedOverlapMinutes / 60)}h{' '}
                {scheduleOverlap.guaranteedOverlapMinutes % 60}m
              </span>
            </div>
          </div>
        )}

        {/* Visual Horizontal Timeline Bar Chart */}
        {scheduleOverlap && scheduleOverlap.participantTimelines.length > 0 ? (
          (() => {
            // Compute range bounds: 20:00 to 03:00 (1200 to 1620 mins) or dynamically wrap
            const timelines = scheduleOverlap.participantTimelines;
            const minStart = Math.min(...timelines.map((t) => t.earliestStartMinutes));
            const maxEnd = Math.max(...timelines.map((t) => t.endMinutesFromBase));

            // Snap min to previous full hour, max to next full hour
            const baseMin = Math.floor(minStart / 60) * 60;
            const baseMax = Math.ceil(maxEnd / 60) * 60;
            const totalSpan = Math.max(300, baseMax - baseMin); // at least 5 hours

            // Hourly ticks
            const ticks: number[] = [];
            for (let m = baseMin; m <= baseMax; m += 60) {
              ticks.push(m);
            }

            // Guaranteed window bounds
            const gStart = parseTimeMinutes(scheduleOverlap.guaranteedStartFormatted);
            const gEnd = parseTimeMinutes(scheduleOverlap.guaranteedEndFormatted, true, gStart);
            const gLeft = Math.max(0, ((gStart - baseMin) / totalSpan) * 100);
            const gWidth = Math.max(0, ((gEnd - gStart) / totalSpan) * 100);

            return (
              <div className="space-y-4 pt-2">
                {/* Timeline Header & Scale */}
                <div className="relative border-b border-slate-700/60 pb-2">
                  <div className="flex justify-between text-[11px] font-mono text-slate-400 pl-44 pr-2">
                    {ticks.map((t) => (
                      <span key={t} className="text-center transform -translate-x-1/2">
                        {formatMinutesToTime(t)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Participant Rows */}
                <div className="relative space-y-3">
                  {/* Guaranteed Window Vertical Shaded Column */}
                  {scheduleOverlap.hasValidOverlap && (
                    <div
                      className="absolute top-0 bottom-0 pointer-events-none rounded-xl bg-emerald-500/10 border-x border-emerald-500/30 z-0"
                      style={{
                        left: `calc(11rem + (100% - 11rem) * ${gLeft / 100})`,
                        width: `calc((100% - 11rem) * ${gWidth / 100})`,
                      }}
                    >
                      <span className="absolute top-1 left-2 text-[10px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        Quórum Pleno
                      </span>
                    </div>
                  )}

                  {timelines.map((p) => {
                    // Coordinates relative to scale
                    const coreLeft = Math.max(0, ((p.startMinutesFromBase - baseMin) / totalSpan) * 100);
                    const coreWidth = Math.max(2, ((p.endMinutesFromBase - p.startMinutesFromBase) / totalSpan) * 100);

                    const wingLeft = Math.max(0, ((p.earliestStartMinutes - baseMin) / totalSpan) * 100);
                    const wingWidth = Math.max(2, ((p.strictDeadlineMinutes - p.earliestStartMinutes) / totalSpan) * 100);

                    const deadlinePos = Math.max(0, ((p.strictDeadlineMinutes - baseMin) / totalSpan) * 100);

                    return (
                      <div
                        key={p.userId}
                        className="relative z-10 flex items-center gap-3 py-1.5 px-2 rounded-xl hover:bg-slate-900/40 transition"
                      >
                        {/* Player Left Label */}
                        <div className="w-44 shrink-0 flex items-center gap-2.5">
                          <img
                            src={p.avatarUrl}
                            alt={p.displayName}
                            className="w-8 h-8 rounded-full border border-slate-700 object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-bold text-white truncate block">
                              {p.displayName}
                            </span>
                            <span className="text-[10px] text-indigo-400 block font-mono">
                              ±{p.precisionMinutes}m • {p.karmaScore}★
                            </span>
                            {(() => {
                              const participant = activeSession?.participants.find((pt) => pt.userId === p.userId);
                              const isConfirmed = isParticipantConfirmed(participant) || p.confirmationStatus === 'confirmed';
                              const confidence = participant?.confidencePercentage ?? p.confidencePercentage ?? (isConfirmed ? 100 : 75);

                              return isConfirmed ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 font-black truncate shadow-sm"
                                  title="Asistencia 100% Confirmada"
                                >
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                  100% CONFIRMADO ✅
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/50 border-dashed font-bold truncate"
                                  title="Horario default semanal: Requiere confirmación para ser 100%"
                                >
                                  <Dices className="w-2.5 h-2.5 text-amber-400" />
                                  PROBABLE {confidence}% 🎲 (Auto)
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Timeline Bar Track */}
                        <div className="relative flex-1 h-7 bg-slate-900/60 rounded-xl overflow-visible border border-slate-800">
                          {/* Translucent Wings (Uncertainty Margin) */}
                          <div
                            className="absolute top-1 bottom-1 rounded-lg bg-indigo-500/20 border border-indigo-500/40 border-dashed"
                            style={{
                              left: `${wingLeft}%`,
                              width: `${wingWidth}%`,
                            }}
                            title={`Margen: ${p.earliestStartFormatted} a ${p.strictDeadlineFormatted}`}
                          />

                          {/* Core Availability Bar (Solid if confirmed, striped/translucent if probable) */}
                          {(() => {
                            const participant = activeSession?.participants.find((pt) => pt.userId === p.userId);
                            const isConfirmed = isParticipantConfirmed(participant) || p.confirmationStatus === 'confirmed';
                            const confidence = participant?.confidencePercentage ?? p.confidencePercentage ?? (isConfirmed ? 100 : 75);

                            return isConfirmed ? (
                              <div
                                className="absolute top-1.5 bottom-1.5 rounded-md bg-gradient-to-r from-emerald-600 via-indigo-600 to-teal-500 border border-emerald-400/50 shadow-md flex items-center justify-between px-2 text-[10px] font-bold text-white overflow-hidden"
                                style={{
                                  left: `${coreLeft}%`,
                                  width: `${coreWidth}%`,
                                }}
                                title={`100% Confirmado: ${p.availableFrom} a ${p.availableUntil}`}
                              >
                                <span className="truncate">{p.availableFrom}</span>
                                <span className="truncate opacity-90">{p.availableUntil}</span>
                              </div>
                            ) : (
                              <div
                                className="absolute top-1.5 bottom-1.5 rounded-md bg-[repeating-linear-gradient(45deg,rgba(99,102,241,0.35),rgba(99,102,241,0.35)_8px,rgba(245,158,11,0.25)_8px,rgba(245,158,11,0.25)_16px)] border-2 border-dashed border-amber-400/70 shadow-sm flex items-center justify-between px-2 text-[10px] font-bold text-amber-200 overflow-hidden"
                                style={{
                                  left: `${coreLeft}%`,
                                  width: `${coreWidth}%`,
                                }}
                                title={`Horario Probable (${confidence}%): ${p.availableFrom} a ${p.availableUntil} (Pendiente de confirmación 100%)`}
                              >
                                <span className="truncate drop-shadow">{p.availableFrom}</span>
                                <span className="truncate opacity-90 drop-shadow">{p.availableUntil}</span>
                              </div>
                            );
                          })()}

                          {/* Strict Deadline Indicator Needle */}
                          <div
                            className="absolute -top-1 bottom-0 w-0.5 bg-amber-400 z-20"
                            style={{ left: `${deadlinePos}%` }}
                            title={`Límite Estricto: ${p.strictDeadlineFormatted}`}
                          >
                            <span className="absolute -top-3.5 -translate-x-1/2 bg-amber-500 text-slate-950 font-mono text-[9px] font-extrabold px-1 rounded shadow">
                              {p.strictDeadlineFormatted}
                            </span>
                          </div>
                        </div>

                        {/* Attendance Status Badge */}
                        <div className="w-28 shrink-0 text-right">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              p.attendanceStatus === 'on_time'
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : p.attendanceStatus === 'late'
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                : p.attendanceStatus === 'no_show'
                                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                            }`}
                          >
                            {p.attendanceStatus === 'on_time' && 'En Hora ✅'}
                            {p.attendanceStatus === 'late' && 'Tarde ⚠️'}
                            {p.attendanceStatus === 'no_show' && 'Fantasma 👻'}
                            {p.attendanceStatus === 'pending' && 'Pendiente ⏳'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs bg-slate-900/40 rounded-2xl border border-slate-800">
            Anotate con tu horario para visualizar el quórum y la coincidencia horaria del grupo.
          </div>
        )}
      </div>

      {/* 5. ATTENDANCE TABLE & "PINGEAR AL CELULAR Y DISCORD" ACTIONS */}
      <div className="bg-[#131c31] rounded-3xl border border-indigo-500/20 p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Control de Asistencia y Reclamo de Amigos Demorados
              </h3>
              <p className="text-xs text-slate-400">
                Pingeá a tu amigo a su teléfono vía Web Push y mencionalo en Discord, o votá en el Tribunal si llegó tarde.
              </p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-800">
          {activeSession.participants.map((part) => {
            const player = players.find((p) => p.id === part.userId);
            const isSelf = part.userId === currentUser.id;
            const votes = activeSession.attendanceVotes.filter(
              (v) => v.targetUserId === part.userId
            );

            return (
              <div
                key={part.userId}
                className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left: Player Info & Status */}
                <div className="flex items-center gap-3">
                  <img
                    src={player?.avatarUrl}
                    alt={player?.displayName}
                    className="w-10 h-10 rounded-2xl border border-slate-700 object-cover"
                  />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{player?.displayName}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {player?.activeTitle}
                      </span>
                      {isParticipantConfirmed(part) ? (
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 font-black flex items-center gap-1 shadow-sm">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          100% CONFIRMADO ✅
                        </span>
                      ) : (
                        <span
                          className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/40 border-dashed font-bold flex items-center gap-1"
                          title="Auto-horario semanal estimado: Nunca es 100% hasta que el jugador confirma"
                        >
                          <Dices className="w-3 h-3 text-amber-400" />
                          PROBABLE {part.confidencePercentage ?? 75}% 🎲 (Auto-horario)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                      <span>Llegada: {part.availableFrom}</span>
                      <span>•</span>
                      <span className="text-amber-400 font-medium">
                        Límite estricto:{' '}
                        {formatMinutesToTime(
                          parseTimeMinutes(part.availableFrom) + part.precisionMinutes
                        )}
                      </span>
                      <span>•</span>
                      <span className="font-semibold text-slate-300">
                        {part.attendanceStatus === 'on_time'
                          ? 'En Hora ✅'
                          : part.attendanceStatus === 'late'
                          ? 'Tarde ⚠️'
                          : part.attendanceStatus === 'no_show'
                          ? 'No vino 👻'
                          : 'Esperando llegada...'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions (Confirm 100%, Ping & Vote) */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Confirm Attendance Button (if not confirmed yet) */}
                  {!isParticipantConfirmed(part) ? (
                    <button
                      type="button"
                      onClick={() => handleConfirmAttendance(part.userId)}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-950/50 transition cursor-pointer flex items-center gap-1.5"
                      title={isSelf ? 'Confirmar tu asistencia al 100%' : `Confirmar asistencia de ${player?.displayName} al 100%`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirmar 100%</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Listo 100%</span>
                    </span>
                  )}
                  {/* Ping Button (only if not self and pending) */}
                  {!isSelf && part.attendanceStatus === 'pending' && (
                    <button
                      onClick={() => handlePingPlayer(part.userId)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold border border-amber-500/30 transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                      title="Enviar Push al teléfono y taggear <@discord_id> en Discord"
                    >
                      <Bell className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                      <span>Reclamar / Pingear</span>
                    </button>
                  )}

                  {/* Peer Voting for Tribunal del Humo */}
                  {!isSelf && (
                    <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs">
                      <span className="text-[10px] text-slate-400 px-1 hidden sm:inline">Votar:</span>
                      <button
                        onClick={() => handleCastVote(part.userId, 'on_time')}
                        className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold transition cursor-pointer"
                        title="Votar que llegó a tiempo"
                      >
                        👍 En Hora
                      </button>
                      <button
                        onClick={() =>
                          handleCastVote(part.userId, 'late', 'Demorado pasados los 15m')
                        }
                        className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[11px] font-semibold transition cursor-pointer"
                        title="Votar que llegó tarde"
                      >
                        ⚠️ Tarde
                      </button>
                      <button
                        onClick={() =>
                          handleCastVote(part.userId, 'no_show', 'No apareció ni avisó')
                        }
                        className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] font-semibold transition cursor-pointer"
                        title="Votar plantón / humo total"
                      >
                        👻 Humo
                      </button>
                    </div>
                  )}

                  {votes.length > 0 && (
                    <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                      {votes.length} {votes.length === 1 ? 'voto' : 'votos'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. SYNCHRONY ENGINE & WEIGHTED RANDOM ROULETTE PANEL */}
      <div className="bg-[#131c31] rounded-3xl border border-indigo-500/20 p-6 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-600/30">
              <Dices className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-white">
                Motor de Sincronía y Ruleta Ponderada
              </h3>
              <p className="text-xs text-slate-400">
                Ponderación matemática cuadrática basada en las calificaciones 1 a 5★ y límites de jugadores.
              </p>
            </div>
          </div>

          {/* Big Roulette Spin Button */}
          <button
            onClick={handleSpinRoulette}
            disabled={isSpinning || rouletteEligibleGames.length === 0}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-extrabold text-sm tracking-wide shadow-xl shadow-purple-600/40 transition transform hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center gap-2.5"
          >
            <Shuffle className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`} />
            <span>{isSpinning ? 'Girando Ruleta...' : '🎲 Tirar Ruleta de Sincronía'}</span>
          </button>
        </div>

        {/* Animated Roulette Reel Strip */}
        {isSpinning && rouletteEligibleGames.length > 0 && (
          <div className="relative overflow-hidden p-6 rounded-3xl bg-gradient-to-r from-purple-950/60 via-[#1e1b4b] to-purple-950/60 border border-purple-500/40 shadow-2xl text-center space-y-4 animate-pulse">
            <span className="text-xs font-bold uppercase tracking-widest text-purple-300">
              ⚡ Ruleta de Sincronía en Vivo
            </span>
            <div className="flex items-center justify-center gap-6">
              {(() => {
                const highlighted = rouletteEligibleGames[rouletteIndex]?.game;
                if (!highlighted) return null;
                return (
                  <div className="flex items-center gap-4 bg-slate-900/90 px-6 py-4 rounded-2xl border-2 border-purple-400 shadow-2xl transform scale-105 transition-all">
                    <img
                      src={highlighted.coverUrl}
                      alt={highlighted.name}
                      className="w-16 h-16 rounded-xl object-cover shadow-lg"
                    />
                    <div className="text-left">
                      <span className="text-[11px] text-purple-300 font-semibold block">
                        Evaluando compatibilidad...
                      </span>
                      <h4 className="text-xl font-black text-white">{highlighted.name}</h4>
                      <span className="text-xs text-slate-400">
                        👥 {highlighted.minPlayers}-{highlighted.maxPlayers} jugadores
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Roulette Winner Announcement Celebration Card */}
        {winnerCelebration && !isSpinning && (
          <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950/70 via-indigo-950/70 to-emerald-950/70 border-2 border-emerald-400 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-5 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <img
                src={winnerCelebration.coverUrl}
                alt={winnerCelebration.name}
                className="w-20 h-24 object-cover rounded-2xl shadow-xl border border-emerald-400/60"
              />
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-extrabold uppercase tracking-wider border border-emerald-500/30">
                  🏆 ¡Juego Elegido por la Ruleta!
                </span>
                <h4 className="text-2xl font-black text-white mt-1">
                  {winnerCelebration.name}
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Anunciado automáticamente en el canal de Discord y enviado por Web Push a los participantes.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => lockSessionGame(activeSession.id, winnerCelebration.id)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition cursor-pointer flex items-center gap-1.5"
              >
                <Lock className="w-4 h-4" />
                <span>Confirmar y Fijar</span>
              </button>
            </div>
          </div>
        )}

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setSyncTab('perfect')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 border ${
              syncTab === 'perfect'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🎯 Sincronía Perfecta</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-900 text-[10px] text-emerald-300">
              {perfectFitGames.length}
            </span>
          </button>

          <button
            onClick={() => setSyncTab('split')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 border ${
              syncTab === 'split'
                ? 'bg-purple-500/20 border-purple-400 text-purple-200'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>👥 Sub-Lobbies / Karma</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-900 text-[10px] text-purple-300">
              {splitRequiredGames.length}
            </span>
          </button>

          <button
            onClick={() => setSyncTab('incompatible')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 border ${
              syncTab === 'incompatible'
                ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>❌ Incompatibles</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-900 text-[10px] text-rose-300">
              {incompatibleGames.length}
            </span>
          </button>
        </div>

        {/* Tab 1: PERFECT FIT GAMES */}
        {syncTab === 'perfect' && (
          <div className="space-y-4">
            {perfectFitGames.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-900/40 rounded-2xl border border-slate-800">
                No hay juegos que cumplan quórum exacto para {activeSession.participants.length} participantes. Probá habilitar sub-lobbies o invitar más amigos.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {perfectFitGames.map((res) => {
                  return (
                    <div
                      key={res.game.id}
                      className="p-4 rounded-2xl bg-[#0e172a] border border-indigo-500/30 hover:border-indigo-400/60 transition shadow-lg space-y-3"
                    >
                      <div className="flex items-start gap-3.5">
                        <img
                          src={res.game.coverUrl}
                          alt={res.game.name}
                          className="w-16 h-20 object-cover rounded-xl shadow-md border border-slate-700 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-base font-bold text-white truncate">
                              {res.game.name}
                            </h4>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-mono text-xs font-extrabold shrink-0 border border-emerald-500/30">
                              {res.synchronyScore}%
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            👥 {res.game.minPlayers}-{res.game.maxPlayers} jugadores • Promedio:{' '}
                            <strong className="text-amber-300">
                              {res.averageRating.toFixed(1)}★
                            </strong>
                          </span>

                          {/* Synchrony Score Bar */}
                          <div className="w-full bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                              style={{ width: `${res.synchronyScore}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Player breakdown avatars with their star rating */}
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <div className="flex items-center -space-x-1.5 overflow-hidden">
                          {res.playerBreakdowns.map((pb) => (
                            <div
                              key={pb.userId}
                              className="relative group cursor-pointer"
                              title={`${pb.displayName}: ${pb.plays ? `${pb.rating}★` : 'No lo tiene'}`}
                            >
                              <img
                                src={pb.avatarUrl}
                                alt={pb.displayName}
                                className="w-7 h-7 rounded-full border-2 border-slate-900 object-cover"
                              />
                              <span
                                className={`absolute -bottom-1 -right-1 text-[9px] font-extrabold px-1 rounded-full ${
                                  pb.rating === 1
                                    ? 'bg-rose-500 text-white'
                                    : pb.rating >= 4
                                    ? 'bg-emerald-500 text-slate-950'
                                    : 'bg-amber-500 text-slate-950'
                                }`}
                              >
                                {pb.rating}★
                              </span>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={() => lockSessionGame(activeSession.id, res.game.id)}
                          className="px-3 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs font-semibold border border-indigo-500/30 transition cursor-pointer flex items-center gap-1"
                        >
                          <Lock className="w-3 h-3 text-indigo-400" />
                          <span>Fijar Juego</span>
                        </button>
                      </div>

                      {res.dislikeCount > 0 && (
                        <div className="text-[10px] text-rose-300 bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-500/20 flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                          <span>
                            {res.dislikeCount}{' '}
                            {res.dislikeCount === 1 ? 'jugador lo sufre' : 'jugadores lo sufren'}{' '}
                            (calificación 1★ con penalización de -15 pts).
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: SUB-LOBBIES / KARMA PRIORITY */}
        {syncTab === 'split' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-500/30 text-xs text-purple-200">
              <span className="font-bold block mb-1">
                ⚖️ División de Sub-Lobbies con Prioridad por Karma y Puntualidad:
              </span>
              Cuando se superan los cupos del juego (por ejemplo 7 jugadores para un juego de 4 o 5), quienes hicieron check-in a tiempo y tienen mayor puntuación en el Tribunal del Humo aseguran cupo titular. Los demás van al sub-lobby de rotación.
            </div>

            {splitRequiredGames.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-900/40 rounded-2xl border border-slate-800">
                Ningún juego supera la capacidad del grupo actualmente ({activeSession.participants.length} participantes).
              </div>
            ) : (
              <div className="space-y-4">
                {splitRequiredGames.map((res) => (
                  <div
                    key={res.game.id}
                    className="p-5 rounded-3xl bg-[#0e172a] border border-purple-500/30 shadow-xl space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={res.game.coverUrl}
                          alt={res.game.name}
                          className="w-12 h-14 object-cover rounded-xl shadow border border-slate-700"
                        />
                        <div>
                          <h4 className="text-base font-bold text-white">{res.game.name}</h4>
                          <span className="text-xs text-slate-400">
                            Cupo máximo: <strong>{res.game.maxPlayers} jugadores</strong> • Total anotados:{' '}
                            <strong>{res.totalParticipants}</strong>
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => lockSessionGame(activeSession.id, res.game.id)}
                        className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-xs font-semibold border border-purple-500/40 transition cursor-pointer"
                      >
                        Fijar con Sub-lobbies
                      </button>
                    </div>

                    {/* Sub-lobby split assignment breakdown */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      {res.suggestedSubLobbies?.map((sub, idx) => (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-2xl border ${
                            sub.isWaitlist
                              ? 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                              : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-bold mb-2">
                            <span>{sub.lobbyName}</span>
                            <span className="font-mono text-[11px] opacity-80">
                              {sub.players.length} jugadores
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            {sub.players.map((p, pIdx) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between bg-slate-900/60 px-2.5 py-1 rounded-xl text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    #{pIdx + 1}
                                  </span>
                                  <img
                                    src={p.avatarUrl}
                                    alt={p.displayName}
                                    className="w-5 h-5 rounded-full object-cover"
                                  />
                                  <span className="font-semibold text-white">{p.displayName}</span>
                                </div>
                                <span className="text-[11px] font-mono text-indigo-400 font-bold">
                                  {p.karmaScore}★ Karma
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: INCOMPATIBLE GAMES */}
        {syncTab === 'incompatible' && (
          <div className="space-y-4">
            {incompatibleGames.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-900/40 rounded-2xl border border-slate-800">
                ¡Ningún juego es incompatible! Todo el catálogo está al alcance del grupo.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {incompatibleGames.map((res) => {
                  const missingOwners = res.playerBreakdowns.filter((p) => !p.plays);

                  return (
                    <div
                      key={res.game.id}
                      className="p-4 rounded-2xl bg-[#0e172a]/60 border border-slate-800 space-y-3 opacity-80 hover:opacity-100 transition"
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={res.game.coverUrl}
                          alt={res.game.name}
                          className="w-14 h-16 object-cover rounded-xl shadow grayscale contrast-125"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-white truncate">{res.game.name}</h4>
                          <span className="text-[11px] text-slate-400 block mt-0.5">
                            👥 Mínimo: {res.game.minPlayers} jug. (Hay {res.totalParticipants})
                          </span>
                          <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                            {res.status === 'missing_owners'
                              ? 'Faltan dueños del juego'
                              : 'Faltan jugadores para el mínimo'}
                          </span>
                        </div>
                      </div>

                      {missingOwners.length > 0 && (
                        <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                          <span className="font-semibold text-rose-300">No lo tienen: </span>
                          {missingOwners.map((m) => m.displayName).join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 7. MODAL: NUEVA SESIÓN */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#131c31] w-full max-w-xl rounded-3xl border border-indigo-500/40 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <CalendarClock className="w-4 h-4" />
                </div>
                <h3 className="text-lg font-bold text-white">Crear Nueva Sesión de Juego</h3>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSessionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Título de la Sesión:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Noche de Vicio Viernes 🍕"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Fecha:</label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Modo:</label>
                  <select
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as 'random' | 'fixed')}
                    className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition"
                  >
                    <option value="random">🎲 Ruleta Random (Sincronía)</option>
                    <option value="fixed">🎯 Juego Fijo</option>
                  </select>
                </div>
              </div>

              {newMode === 'fixed' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Seleccionar Juego del Catálogo:
                  </label>
                  <select
                    value={newSelectedGameId}
                    onChange={(e) => setNewSelectedGameId(e.target.value)}
                    className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition"
                  >
                    <option value="">-- Elegir juego --</option>
                    {games.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.minPlayers}-{g.maxPlayers} jug.)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Toggle Split Lobbies */}
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="splitToggle"
                  checked={newAllowSplit}
                  onChange={(e) => setNewAllowSplit(e.target.checked)}
                  className="mt-1 rounded accent-indigo-600 cursor-pointer"
                />
                <label htmlFor="splitToggle" className="text-xs text-slate-300 cursor-pointer">
                  <strong className="block text-white">
                    Permitir dividir en Sub-lobbies si superamos el límite
                  </strong>
                  Si se anotan 6 o 7 amigos para un juego de 4 o 5, arma un Lobby Titular por Karma y un Sub-Lobby para suplentes.
                </label>
              </div>

              {/* Invitar Jugadores Section */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-white flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span>Invitar Jugadores:</span>
                  </label>
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setNewInviteMode('all')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        newInviteMode === 'all'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Todos ({players.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewInviteMode('custom');
                        if (newSelectedInviteIds.length === 0) {
                          setNewSelectedInviteIds(players.map((p) => p.id));
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        newInviteMode === 'custom'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Personalizada
                    </button>
                  </div>
                </div>

                {newInviteMode === 'custom' ? (
                  <div className="space-y-2.5 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400">
                        {newSelectedInviteIds.length} de {players.length} seleccionados
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setNewSelectedInviteIds(players.map((p) => p.id))}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold transition cursor-pointer"
                        >
                          Seleccionar Todos
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setNewSelectedInviteIds(
                              players
                                .filter((p) => getEffectiveScheduleForDate(p, newDate).plays)
                                .map((p) => p.id)
                            )
                          }
                          className="px-2 py-0.5 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold transition cursor-pointer"
                        >
                          Solo Probables hoy
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {players.map((player) => {
                        const isSelected = newSelectedInviteIds.includes(player.id);
                        return (
                          <label
                            key={player.id}
                            className={`flex items-center justify-between p-2 rounded-xl border text-xs transition cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-950/40 border-indigo-500/50 text-white'
                                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setNewSelectedInviteIds((prev) => [...prev, player.id]);
                                  } else {
                                    setNewSelectedInviteIds((prev) =>
                                      prev.filter((id) => id !== player.id)
                                    );
                                  }
                                }}
                                className="rounded accent-indigo-600 cursor-pointer"
                              />
                              <img
                                src={player.avatarUrl}
                                alt={player.displayName}
                                className="w-6 h-6 rounded-full object-cover border border-slate-700 shrink-0"
                              />
                              <span className="font-semibold truncate text-[11px]">{player.displayName}</span>
                            </div>
                            <div className="shrink-0">
                              {renderPlayerProbabilityBadge(player, newDate)}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Se invitará a todos los miembros registrados del grupo ({players.length} amigos) y se auto-anotarán con su probabilidad semanal para el {newDate}.
                  </p>
                )}
              </div>

              {/* Creator's Initial Schedule */}
              <div className="pt-2 border-t border-slate-800">
                <span className="text-xs font-bold text-slate-300 block mb-2">
                  Tu Horario de Llegada como Creador:
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Desde:</span>
                    <input
                      type="time"
                      value={newFromTime}
                      onChange={(e) => setNewFromTime(e.target.value)}
                      className="w-full bg-[#090d16] border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Hasta:</span>
                    <input
                      type="time"
                      value={newUntilTime}
                      onChange={(e) => setNewUntilTime(e.target.value)}
                      className="w-full bg-[#090d16] border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Margen:</span>
                    <select
                      value={newPrecision}
                      onChange={(e) => setNewPrecision(Number(e.target.value) as PrecisionMinutes)}
                      className="w-full bg-[#090d16] border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value={5}>±5m (Suizo)</option>
                      <option value={15}>±15m (Normal)</option>
                      <option value={30}>±30m (Tibio)</option>
                      <option value={60}>±60m (Humo)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold tracking-wide shadow-lg shadow-indigo-600/30 transition cursor-pointer"
                >
                  Crear Sesión y Avisar a Discord 🚀
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 8. MODAL: EDITAR INVITACIONES DE LA SESIÓN */}
      {isManageInvitesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#131c31] w-full max-w-xl rounded-3xl border border-indigo-500/40 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Editar Invitaciones de la Sesión</h3>
                  <p className="text-xs text-slate-400">
                    Elegí quiénes están convocados a "{activeSession.title}" ({activeSession.date})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManageInvitesOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Toggle Mode */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-900/80 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditInviteMode('all')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    editInviteMode === 'all'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Todos los del grupo ({players.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditInviteMode('custom')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    editInviteMode === 'custom'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Selección personalizada</span>
                </button>
              </div>

              {editInviteMode === 'custom' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-300">
                      Seleccionados: {editSelectedInviteIds.length} de {players.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditSelectedInviteIds(players.map((p) => p.id))}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition cursor-pointer"
                      >
                        Seleccionar Todos
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditSelectedInviteIds(
                            players
                              .filter((p) => getEffectiveScheduleForDate(p, activeSession.date).plays)
                              .map((p) => p.id)
                          )
                        }
                        className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition cursor-pointer"
                      >
                        Solo Probables hoy
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditSelectedInviteIds([])}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] font-semibold transition cursor-pointer"
                      >
                        Desmarcar
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {players.map((player) => {
                      const isSelected = editSelectedInviteIds.includes(player.id);
                      return (
                        <label
                          key={player.id}
                          className={`flex items-center justify-between p-3 rounded-2xl border transition cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-950/40 border-indigo-500/50 text-white'
                              : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditSelectedInviteIds((prev) => [...prev, player.id]);
                                } else {
                                  setEditSelectedInviteIds((prev) =>
                                    prev.filter((id) => id !== player.id)
                                  );
                                }
                              }}
                              className="rounded accent-indigo-600 cursor-pointer"
                            />
                            <img
                              src={player.avatarUrl}
                              alt={player.displayName}
                              className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">{player.displayName}</span>
                                <span className="text-[10px] text-slate-400">{player.activeTitle}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block">
                                @{player.discordUsername}
                              </span>
                            </div>
                          </div>

                          <div>
                            {renderPlayerProbabilityBadge(player, activeSession.date)}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsManageInvitesOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveInvites}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold tracking-wide shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                Guardar Invitaciones
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. MODAL: LLAMADO A SESIÓN (PING A PROBABLES) */}
      {isCalloutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#131c31] w-full max-w-lg rounded-3xl border border-amber-500/40 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Llamado a Sesión (Ping a Probables)</h3>
                  <p className="text-xs text-slate-400">
                    Convocá a los amigos en horario probable para que confirmen asistencia al 100%.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCalloutModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Recipients preview */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Destinatarios ({probableParticipants.length} amigos en horario probable):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {probableParticipants.map((part) => {
                    const player = players.find((p) => p.id === part.userId);
                    return (
                      <div
                        key={part.userId}
                        className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/80 border border-slate-800"
                      >
                        <img
                          src={player?.avatarUrl}
                          alt={player?.displayName}
                          className="w-7 h-7 rounded-full object-cover border border-slate-700 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-white block truncate">
                            {player?.displayName}
                          </span>
                          <span className="text-[10px] text-amber-400 font-mono block">
                            {part.availableFrom} (±{part.precisionMinutes}m)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mensaje personalizado para la convocatoria:
                </label>
                <textarea
                  rows={3}
                  value={calloutCustomMessage}
                  onChange={(e) => setCalloutCustomMessage(e.target.value)}
                  placeholder="¡Che gente, confirmen si juegan hoy que estamos cerrando el quórum!"
                  className="w-full bg-[#090d16] border border-slate-700 focus:border-amber-500 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none transition resize-none"
                />
              </div>

              {/* Multi-channel alert info */}
              <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <Radio className="w-4 h-4 text-amber-400" />
                  <span>Notificación Multicanal Activa:</span>
                </div>
                <p className="text-[11px] text-amber-300/80 leading-relaxed">
                  Se enviará una alerta Web Push al celular de cada uno con sonido de campanada y se publicará en Discord con mención real <strong>&lt;@discord_id&gt;</strong> con botón interactivo de confirmación.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsCalloutModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSendingCallout || probableParticipants.length === 0}
                onClick={handleTriggerCallout}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-black text-xs tracking-wide shadow-lg shadow-amber-500/30 transition cursor-pointer flex items-center gap-2"
              >
                <Megaphone className={`w-4 h-4 ${isSendingCallout ? 'animate-spin' : ''}`} />
                <span>{isSendingCallout ? 'Enviando llamado...' : `📣 Enviar Llamado (${probableParticipants.length})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionsView;
