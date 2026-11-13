import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { PlayerProfile, SanctionRecord } from '../types/domain';
import {
  Scale,
  Flame,
  Clock,
  Ghost,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Award,
  TrendingUp,
  Search,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  Send,
  UserX,
  Volume2,
  Calendar,
  Gamepad2,
  ArrowUpRight,
  ChevronRight,
  Filter,
} from 'lucide-react';

export const LeaderboardSanctionsView: React.FC = () => {
  const {
    players,
    sanctions,
    sessions,
    currentUser,
    activeSessionId,
    issueDirectSanction,
    pingLatePlayer,
  } = useApp();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'karma' | 'hours' | 'punctuality'>('karma');

  // Tribunal Sanction Form State
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    activeSessionId || (sessions[0] ? sessions[0].id : '')
  );
  const [selectedTargetUserId, setSelectedTargetUserId] = useState<string>(
    players.find((p) => p.id !== currentUser.id)?.id || players[0]?.id || ''
  );
  const [sanctionType, setSanctionType] = useState<'late' | 'no_show'>('late');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pingStatusMessage, setPingStatusMessage] = useState<string | null>(null);

  // Preset Argentine gamer reasons
  const PRESET_REASONS = [
    'Dijo 22:00 ±15m y apareció a las 23:40 comiendo empanadas.',
    'Dijo "me baño y entro" y desapareció hasta el día siguiente.',
    'Clavó el visto en WhatsApp y lo vimos jugando Valorant solo.',
    'Dijo "reinicio la compu que actualiza Windows" y no volvió más.',
    'Se quedó dormido con los auriculares puestos en llamada de Discord.',
    'Avisó 45 minutos después del horario pactado que "le surgió un plan".',
  ];

  // Helper calculations for podium cards
  const punctualLeader = useMemo(() => {
    return [...players].sort((a, b) => {
      const ratioA = a.onTimeCount / Math.max(1, a.sessionsPlayed);
      const ratioB = b.onTimeCount / Math.max(1, b.sessionsPlayed);
      if (ratioB !== ratioA) return ratioB - ratioA;
      return b.karmaScore - a.karmaScore;
    })[0];
  }, [players]);

  const viciosoLeader = useMemo(() => {
    return [...players].sort((a, b) => b.hoursPlayed - a.hoursPlayed || b.sessionsPlayed - a.sessionsPlayed)[0];
  }, [players]);

  const humoLeader = useMemo(() => {
    return [...players].sort((a, b) => {
      const humScoreA = a.noShowCount * 3 + a.lateCount * 1.5 - a.karmaScore;
      const humScoreB = b.noShowCount * 3 + b.lateCount * 1.5 - b.karmaScore;
      return humScoreB - humScoreA;
    })[0];
  }, [players]);

  // Sorted and filtered player list
  const filteredPlayers = useMemo(() => {
    return players
      .filter((p) => {
        const query = searchQuery.toLowerCase().trim();
        return (
          p.displayName.toLowerCase().includes(query) ||
          p.discordUsername.toLowerCase().includes(query) ||
          p.activeTitle.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'karma') return b.karmaScore - a.karmaScore;
        if (sortBy === 'hours') return b.hoursPlayed - a.hoursPlayed;
        if (sortBy === 'punctuality') return b.onTimeCount - a.onTimeCount;
        return 0;
      });
  }, [players, searchQuery, sortBy]);

  // Handle Sanction submit
  const handleIssueSanction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId || !selectedTargetUserId || !reason.trim()) return;

    setIsSubmitting(true);
    try {
      issueDirectSanction(selectedSessionId, selectedTargetUserId, sanctionType, reason.trim());
      const targetPlayer = players.find((p) => p.id === selectedTargetUserId);
      setSuccessMessage(
        `⚖️ Sentencia emitida contra ${targetPlayer?.displayName || 'el jugador'}. Se publicaron las pruebas y el escarmiento en Discord.`
      );
      setReason('');
      setTimeout(() => setSuccessMessage(null), 6000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Ping late friend
  const handlePingPlayer = async (targetId: string) => {
    const target = players.find((p) => p.id === targetId);
    if (!target) return;
    const currentSession = sessions.find((s) => s.id === (activeSessionId || sessions[0]?.id));
    if (!currentSession) return;

    try {
      await pingLatePlayer(currentSession.id, targetId);
      setPingStatusMessage(
        `🚨 Reclamo de humo enviado a <@${target.discordUsername}> por Discord y Push!`
      );
      setTimeout(() => setPingStatusMessage(null), 5000);
    } catch {
      setPingStatusMessage(`No se pudo enviar el reclamo.`);
      setTimeout(() => setPingStatusMessage(null), 4000);
    }
  };

  const getKarmaColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (score >= 50) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
  };

  const getKarmaProgressBar = (score: number) => {
    if (score >= 80) return 'bg-gradient-to-r from-emerald-500 to-teal-400';
    if (score >= 50) return 'bg-gradient-to-r from-amber-500 to-yellow-400';
    return 'bg-gradient-to-r from-rose-600 to-red-500';
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#131c31] via-[#1a233d] to-[#111827] border border-indigo-900/50 p-6 sm:p-8 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
                <Scale className="w-3.5 h-3.5" />
                Sistema Penal de Asistencia
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Clock className="w-3.5 h-3.5" />
                Margen ±15m
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              El Tribunal del Humo ⚖️
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
              Acá no hay excusas. Si decís <span className="text-amber-300 font-semibold">22:00 ±15m</span> y aparecés 23:30, el Tribunal descuenta Karma, asigna títulos vergonzosos y te manda al banco de suplentes cuando se llena el lobby.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-[#090d16]/80 backdrop-blur-md rounded-2xl p-4 border border-indigo-900/60 text-center min-w-[130px]">
              <span className="block text-2xl font-black text-indigo-400">
                {sanctions.length}
              </span>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Sentencias Dictadas
              </span>
            </div>
            <div className="bg-[#090d16]/80 backdrop-blur-md rounded-2xl p-4 border border-indigo-900/60 text-center min-w-[130px]">
              <span className="block text-2xl font-black text-emerald-400">
                {players.reduce((acc, p) => acc + p.onTimeCount, 0)}
              </span>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Llegadas Puntuales
              </span>
            </div>
          </div>
        </div>

        {/* Ambient glow decoration */}
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Ping Feedback Banner */}
      {pingStatusMessage && (
        <div className="p-4 rounded-2xl bg-amber-500/20 border border-amber-500/50 text-amber-200 text-sm font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>{pingStatusMessage}</span>
          </div>
          <button
            onClick={() => setPingStatusMessage(null)}
            className="text-xs text-amber-300 hover:text-white"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 text-sm font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-xs text-emerald-300 hover:text-white"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* TOP PODIUM / HALL OF HONOR VS WALL OF SHAME */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <span>El Cuadro de Honor vs Muro de la Vergüenza</span>
          </h2>
          <span className="text-xs text-slate-400">
            Estadísticas calculadas en tiempo real
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* 1. El Reloj Suizo (Más Puntual) */}
          {punctualLeader && (
            <div className="relative rounded-2xl bg-gradient-to-b from-[#131c31] to-[#0c1424] border border-emerald-500/40 p-5 shadow-xl hover:border-emerald-500/70 transition-all group">
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  <Clock className="w-3.5 h-3.5" />
                  El Reloj Suizo
                </span>
                <span className="text-xl">⌚</span>
              </div>

              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <img
                    src={punctualLeader.avatarUrl}
                    alt={punctualLeader.displayName}
                    className="w-14 h-14 rounded-2xl object-cover ring-2 ring-emerald-400/50 shadow-lg shadow-emerald-500/20"
                  />
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-slate-950">
                    ✓
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-white group-hover:text-emerald-300 transition-colors">
                    {punctualLeader.displayName}
                  </h3>
                  <p className="text-xs text-emerald-400 font-semibold">
                    {punctualLeader.activeTitle}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    @{punctualLeader.discordUsername}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 gap-2 text-center">
                <div className="bg-[#090d16]/60 rounded-xl p-2 border border-slate-800/80">
                  <span className="block text-base font-black text-emerald-400">
                    {punctualLeader.onTimeCount}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    Puntuales
                  </span>
                </div>
                <div className="bg-[#090d16]/60 rounded-xl p-2 border border-slate-800/80">
                  <span className="block text-base font-black text-white">
                    {punctualLeader.karmaScore}%
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    Confiabilidad
                  </span>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-slate-300 italic text-center">
                &ldquo;Dijo 22:00 y a las 21:58 ya estaba en el lobby muteado esperando.&rdquo;
              </p>
            </div>
          )}

          {/* 2. El Más Vicioso (Más Horas & Partidas) */}
          {viciosoLeader && (
            <div className="relative rounded-2xl bg-gradient-to-b from-[#131c31] to-[#0c1424] border border-indigo-500/40 p-5 shadow-xl hover:border-indigo-500/70 transition-all group">
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  <Flame className="w-3.5 h-3.5 text-indigo-400" />
                  El Más Vicioso
                </span>
                <span className="text-xl">🔥</span>
              </div>

              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <img
                    src={viciosoLeader.avatarUrl}
                    alt={viciosoLeader.displayName}
                    className="w-14 h-14 rounded-2xl object-cover ring-2 ring-indigo-400/50 shadow-lg shadow-indigo-500/20"
                  />
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white">
                    ★
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-white group-hover:text-indigo-300 transition-colors">
                    {viciosoLeader.displayName}
                  </h3>
                  <p className="text-xs text-indigo-400 font-semibold">
                    {viciosoLeader.activeTitle}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    @{viciosoLeader.discordUsername}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 gap-2 text-center">
                <div className="bg-[#090d16]/60 rounded-xl p-2 border border-slate-800/80">
                  <span className="block text-base font-black text-indigo-400">
                    {viciosoLeader.hoursPlayed}h
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    Horas Jugadas
                  </span>
                </div>
                <div className="bg-[#090d16]/60 rounded-xl p-2 border border-slate-800/80">
                  <span className="block text-base font-black text-white">
                    {viciosoLeader.sessionsPlayed}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    Partidas Totales
                  </span>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-slate-300 italic text-center">
                &ldquo;No duerme. Juega hasta con 39° de fiebre y avisa siempre presente.&rdquo;
              </p>
            </div>
          )}

          {/* 3. El Rey del Humo (Más Tardanzas y Faltazos) */}
          {humoLeader && (
            <div className="relative rounded-2xl bg-gradient-to-b from-[#211119] to-[#120a10] border border-rose-500/50 p-5 shadow-xl hover:border-rose-500/80 transition-all group">
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  <Ghost className="w-3.5 h-3.5 text-rose-400" />
                  El Rey del Humo
                </span>
                <span className="text-xl">💨</span>
              </div>

              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <img
                    src={humoLeader.avatarUrl}
                    alt={humoLeader.displayName}
                    className="w-14 h-14 rounded-2xl object-cover ring-2 ring-rose-500/60 shadow-lg shadow-rose-500/20 grayscale group-hover:grayscale-0 transition-all"
                  />
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">
                    ✕
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-rose-300">
                    {humoLeader.displayName}
                  </h3>
                  <p className="text-xs text-rose-400 font-semibold">
                    {humoLeader.activeTitle}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    @{humoLeader.discordUsername}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-rose-950/60 grid grid-cols-2 gap-2 text-center">
                <div className="bg-[#090d16]/80 rounded-xl p-2 border border-rose-900/40">
                  <span className="block text-base font-black text-rose-400">
                    {humoLeader.noShowCount}
                  </span>
                  <span className="text-[10px] text-rose-300 uppercase font-semibold">
                    Faltazos Sin Aviso
                  </span>
                </div>
                <div className="bg-[#090d16]/80 rounded-xl p-2 border border-rose-900/40">
                  <span className="block text-base font-black text-amber-400">
                    {humoLeader.lateCount}
                  </span>
                  <span className="text-[10px] text-amber-300 uppercase font-semibold">
                    Tardanzas Graves
                  </span>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-rose-200 italic text-center">
                &ldquo;Especialidad: 'Ya salgo' (sale en 2 horas). En cuarentena de lobbies.&rdquo;
              </p>
            </div>
          )}
        </div>
      </section>

      {/* FULL RANKING TABLE */}
      <section className="rounded-3xl bg-[#131c31] border border-indigo-900/50 p-6 shadow-2xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
              <span>Tabla de Confiabilidad & Prioridad de Lobbies</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Si un juego permite 4 jugadores y son 5 en el canal, los de mayor Karma entran de titulares.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar amigo o título..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 rounded-xl bg-[#090d16] border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-48 sm:w-56"
              />
            </div>

            {/* Sort Toggle */}
            <div className="flex items-center gap-1 bg-[#090d16] p-1 rounded-xl border border-slate-800 text-xs font-semibold">
              <button
                onClick={() => setSortBy('karma')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  sortBy === 'karma'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Confiabilidad
              </button>
              <button
                onClick={() => setSortBy('punctuality')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  sortBy === 'punctuality'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Puntuales
              </button>
              <button
                onClick={() => setSortBy('hours')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  sortBy === 'hours'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Horas Vicio
              </button>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-indigo-950/80 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <th className="py-3 px-3">#</th>
                <th className="py-3 px-3">Jugador & Título</th>
                <th className="py-3 px-3">Confiabilidad (Karma)</th>
                <th className="py-3 px-3">Partidas / Horas</th>
                <th className="py-3 px-3">Asistencia</th>
                <th className="py-3 px-3">Racha</th>
                <th className="py-3 px-3">Prioridad en Lobbies</th>
                <th className="py-3 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-xs">
              {filteredPlayers.map((player, index) => {
                const isCurrentUser = player.id === currentUser.id;
                const position = index + 1;

                // Priority Badge logic
                let priorityLabel = 'Prioridad Normal';
                let priorityClass = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
                let priorityDesc = 'Entra por orden de llegada';
                if (player.karmaScore >= 75) {
                  priorityLabel = 'Alta Prioridad - Titular';
                  priorityClass = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
                  priorityDesc = 'Titular indiscutido si el cupo se llena';
                } else if (player.karmaScore < 50) {
                  priorityLabel = 'Baja Prioridad - Suplente';
                  priorityClass = 'bg-rose-500/10 text-rose-300 border-rose-500/30';
                  priorityDesc = 'Queda en cola de espera por humo';
                }

                return (
                  <tr
                    key={player.id}
                    className={`hover:bg-indigo-950/30 transition-colors ${
                      isCurrentUser ? 'bg-indigo-950/40' : ''
                    }`}
                  >
                    {/* Rank */}
                    <td className="py-3.5 px-3 font-black">
                      {position === 1 ? (
                        <span className="text-amber-400 text-base" title="Primer Puesto">
                          🥇
                        </span>
                      ) : position === 2 ? (
                        <span className="text-slate-300 text-base" title="Segundo Puesto">
                          🥈
                        </span>
                      ) : position === 3 ? (
                        <span className="text-amber-600 text-base" title="Tercer Puesto">
                          🥉
                        </span>
                      ) : (
                        <span className="text-slate-400">#{position}</span>
                      )}
                    </td>

                    {/* Player Info */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex-shrink-0">
                          <img
                            src={player.avatarUrl}
                            alt={player.displayName}
                            className="w-9 h-9 rounded-xl object-cover ring-1 ring-indigo-500/30"
                          />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[#131c31] ${
                              player.isOnline !== false ? 'bg-emerald-400' : 'bg-slate-600'
                            }`}
                          />
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white text-sm">
                              {player.displayName}
                            </span>
                            {isCurrentUser && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-300">
                                Vos
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-slate-400">
                            <span className="text-indigo-400 font-mono">
                              @{player.discordUsername}
                            </span>
                            <span>•</span>
                            <span className="text-slate-300 font-medium">
                              {player.activeTitle}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Confiabilidad (Karma Bar) */}
                    <td className="py-3.5 px-3 min-w-[170px]">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span
                            className={`font-black px-1.5 py-0.2 rounded border text-[11px] ${getKarmaColor(
                              player.karmaScore
                            )}`}
                          >
                            {player.karmaScore}%
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {player.karmaScore >= 80
                              ? 'Excelente'
                              : player.karmaScore >= 50
                              ? 'Aceptable'
                              : 'Riesgo Humo'}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${getKarmaProgressBar(
                              player.karmaScore
                            )}`}
                            style={{ width: `${Math.max(5, player.karmaScore)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Partidas & Horas */}
                    <td className="py-3.5 px-3">
                      <span className="font-semibold text-white block">
                        {player.sessionsPlayed} partidas
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {player.hoursPlayed} hs jugadas
                      </span>
                    </td>

                    {/* Asistencia */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span
                          className="flex items-center gap-0.5 text-emerald-400 font-medium"
                          title="Llegadas puntuales"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {player.onTimeCount}
                        </span>
                        <span
                          className="flex items-center gap-0.5 text-amber-400 font-medium"
                          title="Tardanzas fuera de margen"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          {player.lateCount}
                        </span>
                        <span
                          className="flex items-center gap-0.5 text-rose-400 font-medium"
                          title="Faltazos sin aviso"
                        >
                          <Ghost className="w-3 h-3" />
                          {player.noShowCount}
                        </span>
                      </div>
                    </td>

                    {/* Racha */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-1 font-bold text-amber-400">
                        <Flame className="w-3.5 h-3.5" />
                        <span>{player.currentStreak}</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          seguidas
                        </span>
                      </div>
                    </td>

                    {/* Prioridad de Lobby */}
                    <td className="py-3.5 px-3">
                      <div>
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${priorityClass}`}
                        >
                          {priorityLabel}
                        </span>
                        <span className="block text-[9px] text-slate-400 mt-0.5 max-w-[130px] truncate">
                          {priorityDesc}
                        </span>
                      </div>
                    </td>

                    {/* Acciones */}
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedTargetUserId(player.id);
                            // Scroll down smoothly to form
                            const formElement = document.getElementById('tribunal-form');
                            if (formElement) formElement.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition-colors"
                          title="Sancionar en el Tribunal"
                        >
                          ⚖️ Sancionar
                        </button>

                        <button
                          onClick={() => handlePingPlayer(player.id)}
                          className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition-colors"
                          title="Pegar el grito en Discord y Push por tardanza"
                        >
                          🚨 Reclamar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* FORM: EMITIR SENTENCIA EN EL TRIBUNAL DEL HUMO */}
      <section
        id="tribunal-form"
        className="rounded-3xl bg-gradient-to-br from-[#1c1328] via-[#131728] to-[#0c1220] border-2 border-rose-500/40 p-6 sm:p-8 shadow-2xl relative overflow-hidden"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-rose-600/30 border border-rose-500/50 flex items-center justify-center text-rose-300 shadow-lg shadow-rose-600/20">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              Emitir Sentencia en el Tribunal del Humo ⚖️
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              ¿Un amigo dijo que venía a las 22:00 y te dejó plantado? Aplicá la sanción pública.
            </p>
          </div>
        </div>

        <form onSubmit={handleIssueSanction} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. Sesión Involucrada */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                1. Sesión de Juego
              </label>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#090d16] border border-slate-700 text-sm text-white focus:outline-none focus:border-rose-500"
                required
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} ({session.date}) — {session.status.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Amigo Acusado */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                2. Amigo Acusado de Humo
              </label>
              <select
                value={selectedTargetUserId}
                onChange={(e) => setSelectedTargetUserId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#090d16] border border-slate-700 text-sm text-white focus:outline-none focus:border-rose-500"
                required
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} (@{p.discordUsername}) — {p.karmaScore}% Karma
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. Tipo de Falta */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
              3. Tipo de Falta y Quita de Karma
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSanctionType('late')}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  sanctionType === 'late'
                    ? 'bg-amber-500/20 border-amber-500 shadow-lg shadow-amber-500/10'
                    : 'bg-[#090d16]/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300 text-sm flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    Llegó Fuera de su Margen
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-500/30 text-amber-300 border border-amber-500/50">
                    -10 Karma
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Se anotó con margen (ej. ±15m) y apareció 30 o 60 minutos más tarde que el horario estricto.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSanctionType('no_show')}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  sanctionType === 'no_show'
                    ? 'bg-rose-500/20 border-rose-500 shadow-lg shadow-rose-500/10'
                    : 'bg-[#090d16]/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-300 text-sm flex items-center gap-1.5">
                    <Ghost className="w-4 h-4" />
                    Fantasma / Faltazo Total
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-500/30 text-rose-300 border border-rose-500/50">
                    -25 Karma
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Estaba confirmado, dejó el lobby colgado y no avisó ni apareció en toda la noche.
                </p>
              </button>
            </div>
          </div>

          {/* 4. Preset chips */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
              4. Motivo / Justificación del Jurado (Seleccioná una excusa clásica o escribí):
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_REASONS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setReason(preset)}
                  className="px-2.5 py-1 rounded-xl text-[11px] bg-[#090d16] hover:bg-indigo-950/60 text-slate-300 hover:text-white border border-slate-800 hover:border-indigo-500/50 transition-colors text-left"
                >
                  &ldquo;{preset}&rdquo;
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Dijo 22:00 ±15m y apareció a las 23:40 con la excusa de que se le quemaron las milanesas..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#090d16] border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none"
              required
            />
          </div>

          {/* Notice box */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-rose-400">
              <ShieldAlert className="w-4 h-4" />
              <span>Consecuencias Automáticas de la Sentencia:</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              El Karma del infractor se reduce de inmediato en su perfil. Si cae por debajo de 50%, pierde la prioridad de titular en lobbies llenos y recibe el título de <span className="text-rose-300 font-semibold">Fantasma Profesional</span>. Simultáneamente se despacha un Rich Embed con mención a su usuario en el canal oficial de Discord.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !reason.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-600 text-white font-bold text-sm shadow-xl shadow-rose-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Scale className="w-4 h-4" />
            <span>Emitir Sentencia Pública en el Tribunal & Notificar a Discord</span>
          </button>
        </form>
      </section>

      {/* SANCTION & ATTENDANCE AUDIT LOG */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-400" />
            <span>Registro Histórico de Sentencias & Auditoría de Humo</span>
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            {sanctions.length} registros
          </span>
        </div>

        {sanctions.length === 0 ? (
          <div className="rounded-2xl bg-[#131c31] border border-indigo-950/60 p-8 text-center text-slate-400">
            <Scale className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="font-semibold text-white">No hay sentencias emitidas todavía</p>
            <p className="text-xs text-slate-400 mt-1">
              Todos los amigos están cumpliendo sus horarios pactados... o nadie se animó a denunciar el humo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sanctions.map((sanction) => {
              const targetPlayer = players.find((p) => p.id === sanction.userId);
              const isBonus = sanction.type === 'on_time_bonus';
              const isLate = sanction.type === 'late';
              const isNoShow = sanction.type === 'no_show';

              return (
                <div
                  key={sanction.id}
                  className={`rounded-2xl p-4 border transition-all ${
                    isBonus
                      ? 'bg-emerald-950/30 border-emerald-500/30'
                      : isNoShow
                      ? 'bg-rose-950/30 border-rose-500/40'
                      : 'bg-[#131c31] border-amber-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          targetPlayer?.avatarUrl ||
                          'https://api.dicebear.com/7.x/bottts/svg?seed=tribunal'
                        }
                        alt={targetPlayer?.displayName || 'Jugador'}
                        className="w-10 h-10 rounded-xl object-cover ring-1 ring-slate-700"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-sm">
                            {targetPlayer?.displayName || 'Desconocido'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            @{targetPlayer?.discordUsername}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-300 font-medium">
                          {sanction.sessionTitle}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-black ${
                          sanction.karmaDelta > 0
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {sanction.karmaDelta > 0
                          ? `+${sanction.karmaDelta}`
                          : sanction.karmaDelta}{' '}
                        Karma
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        {sanction.date}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-300">
                    <span className="flex items-center gap-1 text-[11px]">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Pactó: <strong>{sanction.promisedTime} ±{sanction.precisionMinutes}m</strong></span>
                    </span>
                    <span className="text-[11px] font-semibold text-amber-300">
                      {sanction.actualTime ? `Llegó: ${sanction.actualTime}` : 'Nunca se presentó'}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate-300 bg-[#090d16]/70 p-2.5 rounded-xl border border-slate-800/60 leading-relaxed italic">
                    &ldquo;{sanction.description}&rdquo;
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
