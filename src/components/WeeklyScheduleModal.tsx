import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  DAYS_OF_WEEK,
  DayOfWeekKey,
  PrecisionMinutes,
  WeeklySchedule,
  EffectiveDailySchedule,
  PlayerProfile,
  DayScheduleConfig,
} from '../types/domain';
import {
  createDefaultWeeklySchedule,
  getDayOfWeekKey,
  getEffectiveScheduleForDate,
} from '../lib/matchmakingEngine';
import { WeeklyBarsScheduleEditor, getConfidenceStyle } from './WeeklyBarsScheduleEditor';
import {
  X,
  CalendarCheck,
  CalendarOff,
  Clock,
  Zap,
  RotateCcw,
  Check,
  CheckCircle2,
  Calendar,
  Sparkles,
  Edit3,
  Save,
  HelpCircle,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';

const PRECISION_OPTIONS: PrecisionMinutes[] = [5, 15, 30, 60];

const CONFIDENCE_OPTIONS = [
  { value: 25, label: '25% · Dudoso' },
  { value: 50, label: '50% · Mitad y mitad' },
  { value: 75, label: '75% · Probable' },
  { value: 90, label: '90% · Muy probable' },
  { value: 95, label: '95% · Casi seguro' },
];

const REASON_PRESETS = [
  'Baja programada',
  'Cena / Salida con amigos',
  'Estudio / Examen mañana',
  'Cansado / Descanso',
  'Fuerza mayor',
];

function getSafeInitialSchedule(userSchedule?: WeeklySchedule): WeeklySchedule {
  if (userSchedule && Object.keys(userSchedule).length >= 7) {
    return userSchedule;
  }
  if (typeof createDefaultWeeklySchedule === 'function') {
    try {
      return createDefaultWeeklySchedule();
    } catch {
      // fallback below
    }
  }
  return {
    mon: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15, confidencePercentage: 75 },
    tue: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15, confidencePercentage: 75 },
    wed: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15, confidencePercentage: 75 },
    thu: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15, confidencePercentage: 75 },
    fri: { enabled: true, availableFrom: '22:30', availableUntil: '02:00', precisionMinutes: 15, confidencePercentage: 90 },
    sat: { enabled: true, availableFrom: '22:30', availableUntil: '02:30', precisionMinutes: 15, confidencePercentage: 90 },
    sun: { enabled: true, availableFrom: '21:30', availableUntil: '00:30', precisionMinutes: 15, confidencePercentage: 75 },
  };
}

function resolveEffectiveSchedule(player: PlayerProfile, dateStr: string): EffectiveDailySchedule {
  let eff: Partial<EffectiveDailySchedule> = {};
  if (typeof getEffectiveScheduleForDate === 'function') {
    try {
      eff = getEffectiveScheduleForDate(player, dateStr);
    } catch {
      // safe fallback below
    }
  }

  let dayKey: DayOfWeekKey = 'mon';
  if (typeof getDayOfWeekKey === 'function') {
    try {
      dayKey = getDayOfWeekKey(dateStr);
    } catch {
      // ignore
    }
  } else {
    const parts = dateStr.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const map: Record<number, DayOfWeekKey> = {
      0: 'sun',
      1: 'mon',
      2: 'tue',
      3: 'wed',
      4: 'thu',
      5: 'fri',
      6: 'sat',
    };
    dayKey = map[d.getDay()] || 'mon';
  }

  const def: DayScheduleConfig = {
    enabled: true,
    availableFrom: '22:00',
    availableUntil: '01:00',
    precisionMinutes: 15 as PrecisionMinutes,
    confidencePercentage: 75,
    slots: [],
  };
  const weekly = player.weeklySchedule?.[dayKey] ?? def;
  const override = player.dailyOverrides?.[dateStr];

  if (override) {
    if (override.status === 'not_playing') {
      return {
        plays: false,
        source: 'override',
        dayKey,
        availableFrom: eff.availableFrom || weekly.availableFrom,
        availableUntil: eff.availableUntil || weekly.availableUntil,
        precisionMinutes: eff.precisionMinutes || weekly.precisionMinutes,
        confidencePercentage: 0,
        slots: [],
        reason: override.reason,
      };
    }
    return {
      plays: true,
      source: 'override',
      dayKey,
      availableFrom: override.availableFrom || eff.availableFrom || weekly.availableFrom,
      availableUntil: override.availableUntil || eff.availableUntil || weekly.availableUntil,
      precisionMinutes: override.precisionMinutes || eff.precisionMinutes || weekly.precisionMinutes,
      confidencePercentage: override.confidencePercentage ?? eff.confidencePercentage ?? weekly.confidencePercentage ?? 75,
      slots: override.slots || eff.slots || weekly.slots || [],
      reason: override.reason,
    };
  }

  return {
    plays: eff.plays ?? weekly.enabled,
    source: eff.source ?? 'weekly',
    dayKey,
    availableFrom: eff.availableFrom || weekly.availableFrom,
    availableUntil: eff.availableUntil || weekly.availableUntil,
    precisionMinutes: eff.precisionMinutes || weekly.precisionMinutes,
    confidencePercentage: eff.confidencePercentage ?? weekly.confidencePercentage ?? 75,
    slots: eff.slots || weekly.slots || [],
    reason: eff.reason,
  };
}

function getNext7Days(): Array<{ dateStr: string; label: string; jsDate: Date }> {
  const result = [];
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayNum = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${dayNum}`;

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const weekday = dayNames[d.getDay()];

    let label = '';
    if (i === 0) {
      label = `Hoy (${weekday} ${dayNum}/${m})`;
    } else if (i === 1) {
      label = `Mañana (${weekday} ${dayNum}/${m})`;
    } else {
      label = `${weekday} (${dayNum}/${m})`;
    }

    result.push({ dateStr, label, jsDate: d });
  }

  return result;
}

export const WeeklyScheduleModal: React.FC = () => {
  const {
    showWeeklyScheduleModal,
    setShowWeeklyScheduleModal,
    currentUser,
    updateWeeklySchedule,
    setDailyOverride,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'routine' | 'exceptions'>('routine');

  // Tab 1: Draft Weekly Schedule
  const [draftSchedule, setDraftSchedule] = useState<WeeklySchedule>(() =>
    getSafeInitialSchedule(currentUser.weeklySchedule)
  );
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(false);

  // Tab 2: Inline editor state for date override
  const [editingDateStr, setEditingDateStr] = useState<string | null>(null);
  const [editFrom, setEditFrom] = useState('22:00');
  const [editUntil, setEditUntil] = useState('01:30');
  const [editPrecision, setEditPrecision] = useState<PrecisionMinutes>(15);
  const [editConfidence, setEditConfidence] = useState<number>(75);
  const [editReason, setEditReason] = useState('');

  // Keep draft in sync if user changes or modal opens
  useEffect(() => {
    if (showWeeklyScheduleModal) {
      setDraftSchedule(getSafeInitialSchedule(currentUser.weeklySchedule));
      setSaveSuccessMessage(false);
      setEditingDateStr(null);
    }
  }, [showWeeklyScheduleModal, currentUser]);

  const next7Days = useMemo(() => getNext7Days(), []);

  if (!showWeeklyScheduleModal) {
    return null;
  }

  const handleSaveRoutine = () => {
    updateWeeklySchedule(draftSchedule);
    setSaveSuccessMessage(true);
    setTimeout(() => {
      setSaveSuccessMessage(false);
    }, 3000);
  };

  // Tab 2 Override Handlers
  const handleMarkNotPlaying = (dateStr: string, reason = 'Baja programada') => {
    setDailyOverride(dateStr, {
      status: 'not_playing',
      reason,
    });
    if (editingDateStr === dateStr) {
      setEditingDateStr(null);
    }
  };

  const handleOpenEditCustomTime = (dateStr: string) => {
    const eff = resolveEffectiveSchedule(currentUser, dateStr);
    setEditingDateStr(dateStr);
    setEditFrom(eff.availableFrom || '22:00');
    setEditUntil(eff.availableUntil || '01:30');
    setEditPrecision(eff.precisionMinutes || 15);
    setEditConfidence(eff.confidencePercentage || 75);
    setEditReason(eff.reason || 'Horario especial');
  };

  const handleSaveCustomTime = (dateStr: string) => {
    setDailyOverride(dateStr, {
      status: 'playing',
      availableFrom: editFrom,
      availableUntil: editUntil,
      precisionMinutes: editPrecision,
      confidencePercentage: editConfidence,
      reason: editReason.trim() || undefined,
    });
    setEditingDateStr(null);
  };

  const handleRestoreDefault = (dateStr: string) => {
    setDailyOverride(dateStr, null);
    if (editingDateStr === dateStr) {
      setEditingDateStr(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-[#131c31] border border-indigo-500/30 rounded-2xl shadow-2xl shadow-indigo-950/50 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-indigo-900/40 flex items-center justify-between shrink-0 bg-[#0d1424]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-indigo-500/30 text-emerald-400">
              <Clock className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <span>Disponibilidad Semanal &amp; Excepciones</span>
              </h2>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                <span>
                  Perfil de <strong className="text-white">{currentUser.displayName}</strong>
                </span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold">{currentUser.karmaScore} Karma</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowWeeklyScheduleModal(false)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-6 pt-3 pb-2 bg-[#0e1627] border-b border-indigo-900/30 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('routine')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'routine'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            <span>📅 Rutina Semanal Default (7 Barras)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('exceptions')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'exceptions'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            <CalendarOff className="w-4 h-4" />
            <span>🎯 Excepciones por Día (Próximos 7 Días)</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 text-slate-200">
          {/* TAB 1: RUTINA SEMANAL DEFAULT */}
          {activeTab === 'routine' && (
            <div className="space-y-6 animate-in fade-in">
              {/* Alert Explanation Box: Probabilistic nature */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/70 via-purple-950/40 to-slate-900 border border-indigo-500/40 flex items-start gap-3 shadow-lg">
                <Zap className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-indigo-200 leading-relaxed">
                  <p className="font-bold text-white mb-0.5">
                    Horarios Probabilísticos (10% a 95%) — Cero Chamuyo
                  </p>
                  <span>
                    Tu rutina semanal es una estimación de probabilidad (máximo <strong>95%</strong>).
                    El sistema te enrola de forma preventiva como <em>&quot;probable&quot;</em>.
                    Pasarás a <strong className="text-emerald-400">&quot;100% Confirmado&quot;</strong> únicamente
                    cuando confirmes asistencia en la sesión del día. Si no podés jugar, marcá{' '}
                    <strong className="text-rose-300">&quot;Hoy No Juego&quot;</strong> para evitar sanciones
                    del Tribunal del Humo.
                  </span>
                </div>
              </div>

              {/* 7-Bar Interactive Schedule Editor */}
              <WeeklyBarsScheduleEditor
                schedule={draftSchedule}
                onChange={setDraftSchedule}
              />

              {/* Save Routine Footer */}
              <div className="pt-4 border-t border-indigo-900/30 flex items-center justify-between">
                <div>
                  {saveSuccessMessage && (
                    <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4" />
                      Rutina semanal guardada y sincronizada exitosamente
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSaveRoutine}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>Guardar Rutina Semanal</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: EXCEPCIONES POR DÍA */}
          {activeTab === 'exceptions' && (
            <div className="space-y-6 animate-in fade-in">
              {/* Alert Explanation Box */}
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-start gap-3">
                <CalendarOff className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200 leading-relaxed">
                  <p className="font-semibold text-white mb-0.5">
                    Modificar un día puntual sin tocar tu rutina
                  </p>
                  ¿Hoy salís a cenar, rendís examen o querés conectarte más tarde? Marcá una excepción
                  para una fecha específica y definí tu grado de confianza (25%, 50%, 75%, 90%). Tu rutina semanal general no cambiará.
                </div>
              </div>

              {/* 7 Calendar Days Starting from Today */}
              <div className="space-y-3.5">
                {next7Days.map(({ dateStr, label }) => {
                  const eff = resolveEffectiveSchedule(currentUser, dateStr);
                  const hasOverride = Boolean(currentUser.dailyOverrides?.[dateStr]);
                  const isEditingThisDate = editingDateStr === dateStr;

                  return (
                    <div
                      key={dateStr}
                      className="p-4 rounded-xl bg-[#0b1120] border border-indigo-500/20 hover:border-indigo-500/40 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Day & Current Status */}
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-bold text-sm text-white">{label}</span>
                            <span className="font-mono text-[11px] text-slate-500">({dateStr})</span>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {eff.source === 'weekly' && eff.plays && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                                <Zap className="w-3 h-3 text-emerald-400" />
                                Rutina semanal: {eff.availableFrom} a {eff.availableUntil} (±{eff.precisionMinutes}m) · {eff.confidencePercentage}% prob.
                              </span>
                            )}

                            {eff.source === 'weekly' && !eff.plays && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-400">
                                <CalendarOff className="w-3 h-3" />
                                Rutina semanal: No juega este día
                              </span>
                            )}

                            {eff.source === 'override' && !eff.plays && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/90 border border-rose-500/50 text-rose-300">
                                <CalendarOff className="w-3 h-3 text-rose-400" />
                                Excepción Activa: No juego este día {eff.reason ? `("${eff.reason}")` : ''}
                              </span>
                            )}

                            {eff.source === 'override' && eff.plays && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/90 border border-amber-500/50 text-amber-300">
                                <Edit3 className="w-3 h-3 text-amber-400" />
                                Excepción Activa: Horario especial {eff.availableFrom} a {eff.availableUntil} (±{eff.precisionMinutes}m) · {eff.confidencePercentage}% prob. {eff.reason ? `(${eff.reason})` : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* "No juego este día" */}
                          {(!hasOverride || eff.plays) && (
                            <button
                              type="button"
                              onClick={() => handleMarkNotPlaying(dateStr, 'Baja programada')}
                              className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                            >
                              <CalendarOff className="w-3.5 h-3.5" />
                              <span>🚫 No juego hoy</span>
                            </button>
                          )}

                          {/* "Cambiar horario solo este día" */}
                          {!isEditingThisDate && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditCustomTime(dateStr)}
                              className="px-3 py-1.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              <span>🕒 Horario especial</span>
                            </button>
                          )}

                          {/* "Restaurar default" */}
                          {hasOverride && (
                            <button
                              type="button"
                              onClick={() => handleRestoreDefault(dateStr)}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                              title="Eliminar excepción y volver a la rutina semanal normal"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>🔄 Reset a default</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline Custom Time Editor */}
                      {isEditingThisDate && (
                        <div className="mt-3 pt-3 border-t border-slate-800/80 bg-[#131c31] p-3 rounded-lg space-y-3 animate-in fade-in">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                              <Edit3 className="w-3.5 h-3.5" />
                              Definir horario especial solo para {label}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingDateStr(null)}
                              className="text-slate-400 hover:text-slate-200 text-xs"
                            >
                              Cancelar
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="text-slate-400">Desde:</span>
                              <input
                                type="time"
                                value={editFrom}
                                onChange={(e) => setEditFrom(e.target.value)}
                                className="px-2 py-1 rounded bg-[#0b1120] border border-indigo-500/30 text-white text-xs font-mono focus:outline-none focus:border-indigo-400"
                              />
                            </div>

                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="text-slate-400">Hasta:</span>
                              <input
                                type="time"
                                value={editUntil}
                                onChange={(e) => setEditUntil(e.target.value)}
                                className="px-2 py-1 rounded bg-[#0b1120] border border-indigo-500/30 text-white text-xs font-mono focus:outline-none focus:border-indigo-400"
                              />
                            </div>

                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-400 mr-1">Margen:</span>
                              {PRECISION_OPTIONS.map((prec) => (
                                <button
                                  key={prec}
                                  type="button"
                                  onClick={() => setEditPrecision(prec)}
                                  className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                                    editPrecision === prec
                                      ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  ±{prec}m
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Confidence Selector */}
                          <div className="space-y-1.5 pt-2 border-t border-slate-800">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-300 font-semibold">Probabilidad estimada:</span>
                              <span className="text-amber-300 font-bold">{editConfidence}%</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {CONFIDENCE_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setEditConfidence(opt.value)}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                    editConfidence === opt.value
                                      ? 'bg-indigo-600 text-white border border-indigo-400 shadow-sm'
                                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className="text-[11px] text-slate-400 block mb-1">
                              Motivo / Razón opcional (para avisar al grupo):
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              {REASON_PRESETS.map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => setEditReason(p)}
                                  className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                                >
                                  {p}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              placeholder="Ej: Llego media hora más tarde por el tráfico..."
                              className="w-full px-3 py-1.5 rounded bg-[#0b1120] border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-400"
                            />
                          </div>

                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingDateStr(null)}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveCustomTime(dateStr)}
                              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/30"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Aplicar Horario Especial</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-indigo-900/40 bg-[#0d1424] flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Los cambios se guardan y sincronizan en tiempo real
          </span>

          <button
            type="button"
            onClick={() => setShowWeeklyScheduleModal(false)}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
