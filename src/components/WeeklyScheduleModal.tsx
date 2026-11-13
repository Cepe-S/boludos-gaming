import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  DAYS_OF_WEEK,
  DayOfWeekKey,
  PrecisionMinutes,
  WeeklySchedule,
  EffectiveDailySchedule,
  PlayerProfile,
} from '../types/domain';
import {
  createDefaultWeeklySchedule,
  getDayOfWeekKey,
  getEffectiveScheduleForDate,
} from '../lib/matchmakingEngine';
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
  ChevronRight,
} from 'lucide-react';

const PRECISION_OPTIONS: PrecisionMinutes[] = [5, 15, 30, 60];

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
    mon: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 },
    tue: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 },
    wed: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 },
    thu: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 },
    fri: { enabled: true, availableFrom: '22:30', availableUntil: '02:00', precisionMinutes: 15 },
    sat: { enabled: true, availableFrom: '22:30', availableUntil: '02:30', precisionMinutes: 15 },
    sun: { enabled: true, availableFrom: '21:30', availableUntil: '00:30', precisionMinutes: 15 },
  };
}

function resolveEffectiveSchedule(player: PlayerProfile, dateStr: string): EffectiveDailySchedule {
  if (typeof getEffectiveScheduleForDate === 'function') {
    try {
      return getEffectiveScheduleForDate(player, dateStr);
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

  const def = {
    enabled: true,
    availableFrom: '22:00',
    availableUntil: '01:00',
    precisionMinutes: 15 as PrecisionMinutes,
  };
  const weekly = player.weeklySchedule?.[dayKey] ?? def;
  const override = player.dailyOverrides?.[dateStr];

  if (override) {
    if (override.status === 'not_playing') {
      return {
        plays: false,
        source: 'override',
        dayKey,
        availableFrom: weekly.availableFrom,
        availableUntil: weekly.availableUntil,
        precisionMinutes: weekly.precisionMinutes,
        reason: override.reason,
      };
    }
    return {
      plays: true,
      source: 'override',
      dayKey,
      availableFrom: override.availableFrom || weekly.availableFrom,
      availableUntil: override.availableUntil || weekly.availableUntil,
      precisionMinutes: override.precisionMinutes || weekly.precisionMinutes,
      reason: override.reason,
    };
  }

  return {
    plays: weekly.enabled,
    source: 'weekly',
    dayKey,
    availableFrom: weekly.availableFrom,
    availableUntil: weekly.availableUntil,
    precisionMinutes: weekly.precisionMinutes,
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

  // Presets for Tab 1
  const applyPresetWeekdays = () => {
    setDraftSchedule((prev) => ({
      ...prev,
      mon: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 },
      tue: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 },
      wed: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 },
      thu: { enabled: true, availableFrom: '22:00', availableUntil: '01:00', precisionMinutes: 15 },
    }));
  };

  const applyPresetWeekend = () => {
    setDraftSchedule((prev) => ({
      ...prev,
      fri: { enabled: true, availableFrom: '22:30', availableUntil: '02:30', precisionMinutes: 15 },
      sat: { enabled: true, availableFrom: '22:30', availableUntil: '02:30', precisionMinutes: 15 },
    }));
  };

  const applyPresetEveryDay = () => {
    const updated = { ...draftSchedule };
    (Object.keys(updated) as DayOfWeekKey[]).forEach((day) => {
      updated[day] = {
        enabled: true,
        availableFrom: '22:00',
        availableUntil: '01:30',
        precisionMinutes: 15,
      };
    });
    setDraftSchedule(updated);
  };

  const applyPresetOnlyWeekends = () => {
    const updated = { ...draftSchedule };
    updated.mon = { ...updated.mon, enabled: false };
    updated.tue = { ...updated.tue, enabled: false };
    updated.wed = { ...updated.wed, enabled: false };
    updated.thu = { ...updated.thu, enabled: false };
    updated.fri = { enabled: true, availableFrom: '22:30', availableUntil: '02:30', precisionMinutes: 15 };
    updated.sat = { enabled: true, availableFrom: '22:30', availableUntil: '02:30', precisionMinutes: 15 };
    updated.sun = { enabled: true, availableFrom: '21:30', availableUntil: '00:30', precisionMinutes: 15 };
    setDraftSchedule(updated);
  };

  const handleDayToggle = (day: DayOfWeekKey) => {
    setDraftSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        enabled: !prev[day].enabled,
      },
    }));
  };

  const handleDayTimeChange = (
    day: DayOfWeekKey,
    field: 'availableFrom' | 'availableUntil',
    value: string
  ) => {
    setDraftSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  const handleDayPrecisionChange = (day: DayOfWeekKey, precision: PrecisionMinutes) => {
    setDraftSchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        precisionMinutes: precision,
      },
    }));
  };

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
    setEditReason(eff.reason || 'Horario especial');
  };

  const handleSaveCustomTime = (dateStr: string) => {
    setDailyOverride(dateStr, {
      status: 'playing',
      availableFrom: editFrom,
      availableUntil: editUntil,
      precisionMinutes: editPrecision,
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
            <span>📅 Rutina Semanal Default</span>
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
              {/* Alert Explanation Box */}
              <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-start gap-3">
                <Zap className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-indigo-200 leading-relaxed">
                  <p className="font-semibold text-white mb-0.5">
                    ¿Cómo funciona la Auto-Inscripción?
                  </p>
                  En los días marcados como <strong>Activos</strong>, el sistema te anota
                  automáticamente en la sesión del día respetando tu horario y margen de precisión. Si un
                  día puntual no podés jugar, usá la pestaña de <strong>Excepciones</strong> o el botón{' '}
                  <strong>&quot;Hoy No Juego&quot;</strong> para salvarte del Tribunal del Humo.
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-900/30">
                <span className="text-xs font-bold text-slate-300">
                  ⚡ Presets rápidos de 1 click:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={applyPresetWeekdays}
                    className="px-2.5 py-1 rounded-lg bg-indigo-950 border border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-medium transition-colors"
                  >
                    Lun–Jue (22:00–01:00)
                  </button>
                  <button
                    type="button"
                    onClick={applyPresetWeekend}
                    className="px-2.5 py-1 rounded-lg bg-purple-950 border border-purple-500/30 text-purple-300 hover:text-white text-xs font-medium transition-colors"
                  >
                    Vie–Sáb (22:30–02:30)
                  </button>
                  <button
                    type="button"
                    onClick={applyPresetEveryDay}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-500/30 text-emerald-300 hover:text-white text-xs font-medium transition-colors"
                  >
                    Todos los días
                  </button>
                  <button
                    type="button"
                    onClick={applyPresetOnlyWeekends}
                    className="px-2.5 py-1 rounded-lg bg-amber-950 border border-amber-500/30 text-amber-300 hover:text-white text-xs font-medium transition-colors"
                  >
                    Solo Finde
                  </button>
                </div>
              </div>

              {/* 7 Days List */}
              <div className="space-y-3">
                {DAYS_OF_WEEK.map((day) => {
                  const cfg = draftSchedule[day.key];
                  const isEnabled = cfg.enabled;

                  return (
                    <div
                      key={day.key}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isEnabled
                          ? 'bg-[#0b1120] border-indigo-500/30 shadow-sm'
                          : 'bg-[#070b14]/60 border-slate-800/80 opacity-60'
                      }`}
                    >
                      {/* Day Label & Toggle */}
                      <div className="flex items-center gap-3 sm:w-44 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDayToggle(day.key)}
                          className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                            isEnabled ? 'bg-indigo-600 justify-end' : 'bg-slate-700 justify-start'
                          }`}
                        >
                          <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                        </button>

                        <div>
                          <span className="font-bold text-sm text-white block">{day.label}</span>
                          <span
                            className={`text-[10px] font-semibold ${
                              isEnabled ? 'text-emerald-400' : 'text-slate-500'
                            }`}
                          >
                            {isEnabled ? 'Juego normalmente' : 'Descanso'}
                          </span>
                        </div>
                      </div>

                      {/* Time Controls & Precision Pill */}
                      {isEnabled ? (
                        <div className="flex flex-wrap items-center gap-3 flex-1 sm:justify-end">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-400">Desde:</span>
                            <input
                              type="time"
                              value={cfg.availableFrom}
                              onChange={(e) =>
                                handleDayTimeChange(day.key, 'availableFrom', e.target.value)
                              }
                              className="px-2 py-1 rounded bg-[#131c31] border border-indigo-500/20 text-white text-xs font-mono focus:outline-none focus:border-indigo-400"
                            />
                          </div>

                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-400">Hasta:</span>
                            <input
                              type="time"
                              value={cfg.availableUntil}
                              onChange={(e) =>
                                handleDayTimeChange(day.key, 'availableUntil', e.target.value)
                              }
                              className="px-2 py-1 rounded bg-[#131c31] border border-indigo-500/20 text-white text-xs font-mono focus:outline-none focus:border-indigo-400"
                            />
                          </div>

                          {/* Precision Selector */}
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-slate-400 hidden sm:inline mr-1">
                              Precisión:
                            </span>
                            {PRECISION_OPTIONS.map((prec) => (
                              <button
                                key={prec}
                                type="button"
                                onClick={() => handleDayPrecisionChange(day.key, prec)}
                                className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                                  cfg.precisionMinutes === prec
                                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                ±{prec}m
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic sm:text-right flex-1">
                          No se te enrolará automáticamente este día
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Save Routine Footer */}
              <div className="pt-4 border-t border-indigo-900/30 flex items-center justify-between">
                <div>
                  {saveSuccessMessage && (
                    <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4" />
                      Rutina semanal guardada y aplicada exitosamente
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
                  para una fecha específica. Tu rutina semanal general no cambiará.
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
                                Rutina semanal: {eff.availableFrom} a {eff.availableUntil} (±{eff.precisionMinutes}m)
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
                                Excepción Activa: Horario especial {eff.availableFrom} a {eff.availableUntil} (±{eff.precisionMinutes}m) {eff.reason ? `(${eff.reason})` : ''}
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
