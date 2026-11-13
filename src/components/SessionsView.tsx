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
  MessageSquare,
  Play,
  Plus,
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
  Users,
  X,
  Zap,
} from 'lucide-react';

export function SessionsView() {
  const {
    currentUser,
    players,
    switchActivePlayer,
    games,
    preferences,
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    joinOrUpdateSessionSchedule,
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

  // Availability / Join Panel Form
  const existingParticipant = useMemo(() => {
    return activeSession?.participants.find((p) => p.userId === currentUser.id);
  }, [activeSession, currentUser.id]);

  const [joinFromTime, setJoinFromTime] = useState('22:00');
  const [joinUntilTime, setJoinUntilTime] = useState('02:00');
  const [joinPrecision, setJoinPrecision] = useState<PrecisionMinutes>(15);
  const [joinNote, setJoinNote] = useState('');
  const [actingUserId, setActingUserId] = useState<string>(currentUser.id);

  // Sync join form when existing participant or active player changes
  useEffect(() => {
    setActingUserId(currentUser.id);
    if (existingParticipant) {
      setJoinFromTime(existingParticipant.availableFrom);
      setJoinUntilTime(existingParticipant.availableUntil);
      setJoinPrecision(existingParticipant.precisionMinutes);
      setJoinNote(existingParticipant.note || '');
    } else {
      setJoinFromTime('22:00');
      setJoinUntilTime('02:00');
      setJoinPrecision(15);
      setJoinNote('');
    }
  }, [existingParticipant, currentUser.id, activeSession?.id]);

  // Time simulator for Check-in testing
  const [isCustomCheckInTime, setIsCustomCheckInTime] = useState(false);
  const [simulatedCheckInTime, setSimulatedCheckInTime] = useState('22:10');

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

  // Handle Create Session
  const handleCreateSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const created = createSession({
      title: newTitle.trim(),
      date: newDate,
      mode: newMode,
      selectedGameId: newMode === 'fixed' && newSelectedGameId ? newSelectedGameId : undefined,
      allowSplitLobbies: newAllowSplit,
      availableFrom: newFromTime,
      availableUntil: newUntilTime,
      precisionMinutes: newPrecision,
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
      userId: actingUserId,
    });
    const targetPlayer = players.find((p) => p.id === actingUserId);
    triggerAlert(
      'success',
      `¡Horario de ${targetPlayer?.displayName || 'jugador'} guardado! Límite estricto: ${calculatedStrictDeadline}`
    );
  };

  // Handle Leave Session
  const handleLeaveSession = () => {
    if (!activeSession) return;
    leaveSession(activeSession.id, actingUserId);
    triggerAlert('info', 'Abandonaste la sesión.');
  };

  // Handle Check-in
  const handleCheckIn = () => {
    if (!activeSession) return;
    const timeToUse = isCustomCheckInTime ? simulatedCheckInTime : undefined;
    checkInToSession(activeSession.id, timeToUse, actingUserId);
    triggerAlert(
      'success',
      `✅ Check-in registrado para ${actingPlayer?.displayName || 'vos'}. ¡El Tribunal del Humo evaluó tu puntualidad!`
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

  // Acting player (defaults to currentUser or simulated from selector)
  const actingPlayer = useMemo(() => {
    return players.find((p) => p.id === actingUserId) || currentUser;
  }, [players, actingUserId, currentUser]);

  const actingParticipant = useMemo(() => {
    return activeSession?.participants.find((p) => p.userId === actingUserId);
  }, [activeSession, actingUserId]);

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
          {/* Quick Player Simulator Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-700/80 text-xs">
            <span className="text-slate-400 hidden lg:inline">Simular como:</span>
            <select
              value={currentUser.id}
              onChange={(e) => switchActivePlayer(e.target.value)}
              className="bg-transparent text-indigo-300 font-medium focus:outline-none cursor-pointer"
            >
              {players.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                  {p.displayName} ({p.karmaScore}★ Karma)
                </option>
              ))}
            </select>
          </div>

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
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="flex items-center gap-2 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>
                  <strong>{activeSession.participants.length}</strong> participantes
                </span>
              </div>

              <div className="flex items-center gap-2 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
                <Swords className="w-4 h-4 text-purple-400" />
                <span>
                  Sub-lobbies:{' '}
                  <strong className={activeSession.allowSplitLobbies ? 'text-emerald-400' : 'text-slate-400'}>
                    {activeSession.allowSplitLobbies ? 'Habilitados (Titulares vs Suplentes)' : 'Deshabilitados'}
                  </strong>
                </span>
              </div>

              {actingParticipant ? (
                <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs text-emerald-300 font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    Estás anotado ({actingParticipant.availableFrom} ±{actingParticipant.precisionMinutes}m)
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-amber-950/40 border border-amber-500/30 px-3 py-1.5 rounded-xl text-xs text-amber-300">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Aún no te anotaste</span>
                </div>
              )}
            </div>
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
                  <strong className="text-indigo-300">{actingPlayer.displayName}</strong>
                </p>
              </div>
            </div>

            {actingParticipant && (
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
              <span>{actingParticipant ? 'Actualizar mi Horario' : 'Anotarme a la Sesión 🚀'}</span>
            </button>

            {actingParticipant && (
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

              {actingParticipant?.checkedInAt && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                  En Hora ({actingParticipant.checkedInAt})
                </span>
              )}
            </div>
          </div>

          {/* Check-in Status or Button */}
          {actingParticipant?.attendanceStatus === 'on_time' ||
          actingParticipant?.attendanceStatus === 'late' ? (
            <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-emerald-300">
                ¡Check-in realizado con éxito!
              </h4>
              <p className="text-xs text-slate-300">
                Registrado a las <strong>{actingParticipant.checkedInAt}</strong>. Estado:{' '}
                <strong
                  className={
                    actingParticipant.attendanceStatus === 'on_time'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }
                >
                  {actingParticipant.attendanceStatus === 'on_time'
                    ? 'Puntual (+5 Karma) ✅'
                    : 'Llegó Tarde (-10 Karma) ⚠️'}
                </strong>
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300">
                    Simulador de Tiempo de Check-in:
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-indigo-400 font-medium">
                    <input
                      type="checkbox"
                      checked={isCustomCheckInTime}
                      onChange={(e) => setIsCustomCheckInTime(e.target.checked)}
                      className="rounded accent-indigo-600"
                    />
                    <span>Elegir hora ficticia</span>
                  </label>
                </div>

                {isCustomCheckInTime ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      value={simulatedCheckInTime}
                      onChange={(e) => setSimulatedCheckInTime(e.target.value)}
                      className="bg-[#090d16] border border-indigo-500/40 rounded-xl px-3 py-1.5 text-white text-xs focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-400">
                      Permite probar check-in a tiempo vs check-in tarde pasados los {joinPrecision}m.
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Si hacés check-in ahora, se usará la hora real del sistema para calcular si llegaste dentro de tu ventana de precisión.
                  </p>
                )}
              </div>

              <button
                onClick={handleCheckIn}
                disabled={!actingParticipant}
                className="w-full py-3 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white font-bold text-sm shadow-xl shadow-emerald-950/60 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {actingParticipant
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
                              return participant?.isAutoEnrolled ? (
                                <span
                                  className="inline-block text-[9px] px-1.5 py-0.2 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/30 truncate"
                                  title="Auto-anotado (Default Semanal)"
                                >
                                  ⚡ Auto-anotado (Default Semanal)
                                </span>
                              ) : (
                                <span
                                  className="inline-block text-[9px] px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30 truncate"
                                  title="Horario de hoy personalizado"
                                >
                                  ✏️ Horario de hoy personalizado
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

                          {/* Solid Core Availability Bar */}
                          <div
                            className="absolute top-1.5 bottom-1.5 rounded-md bg-gradient-to-r from-indigo-600 to-purple-600 shadow-sm flex items-center justify-between px-2 text-[10px] font-bold text-white overflow-hidden"
                            style={{
                              left: `${coreLeft}%`,
                              width: `${coreWidth}%`,
                            }}
                          >
                            <span className="truncate">{p.availableFrom}</span>
                            <span className="truncate opacity-80">{p.availableUntil}</span>
                          </div>

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
                      {part.isAutoEnrolled ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-500/30 font-medium">
                          ⚡ Auto-anotado (Default Semanal)
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/30 font-medium">
                          ✏️ Horario de hoy personalizado
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

                {/* Right: Actions (Ping & Vote) */}
                <div className="flex flex-wrap items-center gap-2">
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
    </div>
  );
}

export default SessionsView;
