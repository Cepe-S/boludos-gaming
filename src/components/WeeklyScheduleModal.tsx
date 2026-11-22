import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  DayOfWeekKey,
  PrecisionMinutes,
  WeeklySchedule,
  EffectiveDailySchedule,
  PlayerProfile,
  DayScheduleConfig,
  TimeSlotBlock,
} from '../types/domain';
import {
  createDefaultWeeklySchedule,
  getDayOfWeekKey,
  getEffectiveScheduleForDate,
  normalizeDaySlots,
} from '../lib/matchmakingEngine';
import { WeeklyBarsScheduleEditor, getConfidenceStyle } from './WeeklyBarsScheduleEditor';
import {
  X,
  CalendarCheck,
  CalendarOff,
  Clock,
  RotateCcw,
  Check,
  CheckCircle2,
  Calendar,
  Edit3,
  Save,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
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

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function formatDateToStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface MonthCalendarCell {
  date: Date;
  dateStr: string;
  dayNumber: number;
  dayKey: DayOfWeekKey;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
}

function generateMonthGrid(monthDate: Date, todayStr: string): MonthCalendarCell[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const firstDay = new Date(year, month, 1);
  // (0 = Sun, 1 = Mon, ..., 6 = Sat) -> Mon is 0, Sun is 6
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: MonthCalendarCell[] = [];

  // 1. Previous month leading days
  for (let i = leadingDays - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, daysInPrevMonth - i);
    const dateStr = formatDateToStr(d);
    cells.push({
      date: d,
      dateStr,
      dayNumber: d.getDate(),
      dayKey: getDayOfWeekKey(dateStr),
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
    });
  }

  // 2. Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const dateStr = formatDateToStr(d);
    cells.push({
      date: d,
      dateStr,
      dayNumber: day,
      dayKey: getDayOfWeekKey(dateStr),
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
    });
  }

  // 3. Trailing days to fill the last row (multiple of 7)
  const trailingDays = (7 - (cells.length % 7)) % 7;
  for (let day = 1; day <= trailingDays; day++) {
    const d = new Date(year, month + 1, day);
    const dateStr = formatDateToStr(d);
    cells.push({
      date: d,
      dateStr,
      dayNumber: day,
      dayKey: getDayOfWeekKey(dateStr),
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
    });
  }

  return cells;
}

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

function getSlotsForDateCell(
  user: PlayerProfile,
  dateStr: string,
  dayKey: DayOfWeekKey
): {
  baseSlots: TimeSlotBlock[];
  displaySlots: TimeSlotBlock[];
  isCancelledMap: Record<string, boolean>;
} {
  const weekly = user.weeklySchedule?.[dayKey] ?? {
    enabled: true,
    availableFrom: '22:00',
    availableUntil: '01:30',
    precisionMinutes: 15 as PrecisionMinutes,
    confidencePercentage: 75,
  };

  const baseSlots = normalizeDaySlots(weekly, dayKey);
  const override = user.dailyOverrides?.[dateStr];

  // Include baseSlots, and if override has extra custom slots, include those as well
  const displaySlots: TimeSlotBlock[] = [...baseSlots];
  if (override?.status === 'playing' && Array.isArray(override.slots)) {
    for (const extraSlot of override.slots) {
      if (!displaySlots.some((s) => s.id === extraSlot.id)) {
        displaySlots.push(extraSlot);
      }
    }
  }

  const isCancelledMap: Record<string, boolean> = {};
  displaySlots.forEach((slot) => {
    const isCancelled =
      override?.status === 'not_playing' ||
      Boolean(override?.cancelledSlotIds?.includes(slot.id)) ||
      Boolean(
        override?.status === 'playing' &&
          Array.isArray(override.slots) &&
          override.slots.length > 0 &&
          !override.slots.some((s) => s.id === slot.id)
      );
    isCancelledMap[slot.id] = isCancelled;
  });

  return { baseSlots, displaySlots, isCancelledMap };
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

  // Tab 2: Monthly Calendar Navigation & Selection
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => formatDateToStr(today), [today]);

  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedSlotKeys, setSelectedSlotKeys] = useState<string[]>([]);
  const [actionBarFeedback, setActionBarFeedback] = useState<string | null>(null);

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
      setSelectedSlotKeys([]);
      setActionBarFeedback(null);
    }
  }, [showWeeklyScheduleModal, currentUser]);

  const isCurrentMonthViewing = useMemo(() => {
    return (
      currentMonthDate.getFullYear() === today.getFullYear() &&
      currentMonthDate.getMonth() === today.getMonth()
    );
  }, [currentMonthDate, today]);

  const monthCells = useMemo(() => {
    return generateMonthGrid(currentMonthDate, todayStr);
  }, [currentMonthDate, todayStr]);

  // Active overrides in the current viewed month
  const monthOverrides = useMemo(() => {
    const overrides = currentUser.dailyOverrides || {};
    return Object.values(overrides)
      .filter((ov) => {
        if (!ov || !ov.date) return false;
        const [yStr, mStr] = ov.date.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10) - 1;
        return (
          y === currentMonthDate.getFullYear() &&
          m === currentMonthDate.getMonth()
        );
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [currentUser.dailyOverrides, currentMonthDate]);

  const editingDateFormatted = useMemo(() => {
    if (!editingDateStr) return '';
    const [y, m, d] = editingDateStr.split('-').map(Number);
    const jsDate = new Date(y, m - 1, d);
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const weekday = dayNames[jsDate.getDay()];
    return `${weekday} ${d} de ${MONTH_NAMES_ES[m - 1]} de ${y}`;
  }, [editingDateStr]);

  if (!showWeeklyScheduleModal) {
    return null;
  }

  // Routine Tab Save
  const handleSaveRoutine = () => {
    updateWeeklySchedule(draftSchedule);
    setSaveSuccessMessage(true);
    setTimeout(() => {
      setSaveSuccessMessage(false);
    }, 3000);
  };

  // Calendar Month Navigation Handlers
  const handlePrevMonth = () => {
    setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleGoToToday = () => {
    setCurrentMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  // Slot Selection Handlers
  const toggleSlotSelection = (dateStr: string, slotId: string) => {
    const key = `${dateStr}::${slotId}`;
    setSelectedSlotKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleToggleSelectAllDay = (dateStr: string, daySlots: TimeSlotBlock[]) => {
    if (daySlots.length === 0) return;
    const dayKeys = daySlots.map((s) => `${dateStr}::${s.id}`);
    const allSelected = dayKeys.every((k) => selectedSlotKeys.includes(k));
    if (allSelected) {
      setSelectedSlotKeys((prev) => prev.filter((k) => !dayKeys.includes(k)));
    } else {
      setSelectedSlotKeys((prev) => Array.from(new Set([...prev, ...dayKeys])));
    }
  };

  // Bulk Cancel Selected Slots
  const handleCancelSelectedSlots = () => {
    if (selectedSlotKeys.length === 0) return;

    const groupedByDate: Record<string, string[]> = {};
    selectedSlotKeys.forEach((key) => {
      const [dStr, sId] = key.split('::');
      if (dStr && sId) {
        if (!groupedByDate[dStr]) groupedByDate[dStr] = [];
        groupedByDate[dStr].push(sId);
      }
    });

    Object.entries(groupedByDate).forEach(([dateStr, slotIdsToCancel]) => {
      const dayKey = getDayOfWeekKey(dateStr);
      const weekly = currentUser.weeklySchedule?.[dayKey] ?? {
        enabled: true,
        availableFrom: '22:00',
        availableUntil: '01:30',
        precisionMinutes: 15 as PrecisionMinutes,
        confidencePercentage: 75,
      };
      const baseSlots = normalizeDaySlots(weekly, dayKey);
      const existingOverride = currentUser.dailyOverrides?.[dateStr];

      const existingCancelled: string[] =
        existingOverride?.cancelledSlotIds ||
        (existingOverride?.status === 'not_playing' ? baseSlots.map((s) => s.id) : []);

      const updatedCancelledIds = Array.from(
        new Set([...existingCancelled, ...slotIdsToCancel])
      );
      const remainingSlots = baseSlots.filter((s) => !updatedCancelledIds.includes(s.id));

      if (remainingSlots.length === 0) {
        setDailyOverride(dateStr, {
          status: 'not_playing',
          cancelledSlotIds: updatedCancelledIds,
          slots: [],
          reason: 'Franjas canceladas en calendario',
        });
      } else {
        setDailyOverride(dateStr, {
          status: 'playing',
          availableFrom: remainingSlots[0].from,
          availableUntil: remainingSlots[remainingSlots.length - 1].until,
          precisionMinutes: remainingSlots[0].precisionMinutes,
          confidencePercentage: Math.max(...remainingSlots.map((s) => s.confidencePercentage)),
          slots: remainingSlots,
          cancelledSlotIds: updatedCancelledIds,
          reason: 'Franja parcial cancelada',
        });
      }
    });

    const count = selectedSlotKeys.length;
    setSelectedSlotKeys([]);
    setActionBarFeedback(`🚫 ${count} franja(s) cancelada(s) correctamente.`);
    setTimeout(() => setActionBarFeedback(null), 4000);
  };

  // Bulk Restore Selected Slots
  const handleRestoreSelectedSlots = () => {
    if (selectedSlotKeys.length === 0) return;

    const groupedByDate: Record<string, string[]> = {};
    selectedSlotKeys.forEach((key) => {
      const [dStr, sId] = key.split('::');
      if (dStr && sId) {
        if (!groupedByDate[dStr]) groupedByDate[dStr] = [];
        groupedByDate[dStr].push(sId);
      }
    });

    Object.entries(groupedByDate).forEach(([dateStr, slotIdsToRestore]) => {
      const dayKey = getDayOfWeekKey(dateStr);
      const weekly = currentUser.weeklySchedule?.[dayKey] ?? {
        enabled: true,
        availableFrom: '22:00',
        availableUntil: '01:30',
        precisionMinutes: 15 as PrecisionMinutes,
        confidencePercentage: 75,
      };
      const baseSlots = normalizeDaySlots(weekly, dayKey);
      const existingOverride = currentUser.dailyOverrides?.[dateStr];

      if (!existingOverride) return;

      const restoreSet = new Set(slotIdsToRestore);
      let currentlyCancelled: string[] = [];
      if (existingOverride.cancelledSlotIds && existingOverride.cancelledSlotIds.length > 0) {
        currentlyCancelled = existingOverride.cancelledSlotIds;
      } else if (existingOverride.status === 'not_playing') {
        currentlyCancelled = baseSlots.map((s) => s.id);
      }

      const remainingCancelledIds = currentlyCancelled.filter((id) => !restoreSet.has(id));

      if (remainingCancelledIds.length === 0) {
        // If no slots remain cancelled on dateStr, restore default weekly schedule
        setDailyOverride(dateStr, null);
      } else {
        const remainingSlots = baseSlots.filter((s) => !remainingCancelledIds.includes(s.id));
        if (remainingSlots.length === 0) {
          setDailyOverride(dateStr, {
            status: 'not_playing',
            cancelledSlotIds: remainingCancelledIds,
            slots: [],
            reason: 'Franjas canceladas en calendario',
          });
        } else {
          setDailyOverride(dateStr, {
            status: 'playing',
            availableFrom: remainingSlots[0].from,
            availableUntil: remainingSlots[remainingSlots.length - 1].until,
            precisionMinutes: remainingSlots[0].precisionMinutes,
            confidencePercentage: Math.max(...remainingSlots.map((s) => s.confidencePercentage)),
            slots: remainingSlots,
            cancelledSlotIds: remainingCancelledIds,
            reason: 'Franja parcial cancelada',
          });
        }
      }
    });

    const count = selectedSlotKeys.length;
    setSelectedSlotKeys([]);
    setActionBarFeedback(`✅ ${count} franja(s) restaurada(s) a la rutina semanal.`);
    setTimeout(() => setActionBarFeedback(null), 4000);
  };

  // Day Level Handlers
  const handleMarkNotPlaying = (dateStr: string, reason = 'Baja programada') => {
    const dayKey = getDayOfWeekKey(dateStr);
    const weekly = currentUser.weeklySchedule?.[dayKey] ?? {
      enabled: true,
      availableFrom: '22:00',
      availableUntil: '01:30',
      precisionMinutes: 15 as PrecisionMinutes,
      confidencePercentage: 75,
    };
    const baseSlots = normalizeDaySlots(weekly, dayKey);
    const allSlotIds = baseSlots.map((s) => s.id);

    setDailyOverride(dateStr, {
      status: 'not_playing',
      cancelledSlotIds: allSlotIds,
      slots: [],
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
    const customSlot: TimeSlotBlock = {
      id: `slot-override-${dateStr}-${Date.now()}`,
      from: editFrom,
      until: editUntil,
      precisionMinutes: editPrecision,
      confidencePercentage: editConfidence,
    };

    setDailyOverride(dateStr, {
      status: 'playing',
      availableFrom: editFrom,
      availableUntil: editUntil,
      precisionMinutes: editPrecision,
      confidencePercentage: editConfidence,
      slots: [customSlot],
      cancelledSlotIds: [],
      reason: editReason.trim() || undefined,
    });
    setEditingDateStr(null);
    setActionBarFeedback(`Horario especial guardado para ${dateStr}`);
    setTimeout(() => setActionBarFeedback(null), 3500);
  };

  const handleRestoreDefault = (dateStr: string) => {
    setDailyOverride(dateStr, null);
    setSelectedSlotKeys((prev) => prev.filter((k) => !k.startsWith(`${dateStr}::`)));
    if (editingDateStr === dateStr) {
      setEditingDateStr(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="relative w-full max-w-6xl bg-background/78 backdrop-blur-xl border border-white/12 ring-1 ring-inset ring-white/5 rounded-lg shadow-[0_28px_80px_-16px_rgba(0,0,0,0.85)] flex flex-col max-h-[94vh] overflow-hidden animate-lol-modal-in">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border/70 flex items-center justify-between shrink-0 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-md bg-primary/15 border border-border/70 text-success">
              <Clock className="w-5 h-5 text-success" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <span>Disponibilidad &amp; Excepciones</span>
              </h2>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                <span className="text-white font-medium">{currentUser.displayName}</span>
                <span>·</span>
                <span className="text-success font-semibold">{currentUser.karmaScore} Karma</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowWeeklyScheduleModal(false)}
            className="p-2 rounded-md text-muted-foreground hover:text-white hover:bg-secondary/60 transition-colors"
            title="Cerrar"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-6 pt-3 pb-2 bg-secondary border-b border-border/70 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('routine')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${
              activeTab === 'routine'
                ? 'bg-primary text-white shadow-none'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            <span>Rutina Semanal</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('exceptions')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${
              activeTab === 'exceptions'
                ? 'bg-primary text-white shadow-none'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <CalendarOff className="w-4 h-4" />
            <span>Excepciones</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-3 sm:p-5 md:p-6 overflow-y-auto flex-1 text-foreground space-y-5">
          {/* TAB 1: RUTINA SEMANAL DEFAULT */}
          {activeTab === 'routine' && (
            <div className="space-y-4 animate-in fade-in">
              {/* 7-Bar Interactive Schedule Editor */}
              <WeeklyBarsScheduleEditor
                schedule={draftSchedule}
                onChange={setDraftSchedule}
              />

              {/* Save Routine Footer */}
              <div className="pt-4 border-t border-border/70 flex items-center justify-between">
                <div>
                  {saveSuccessMessage && (
                    <span className="flex items-center gap-1.5 text-success text-xs font-bold animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4" />
                      Rutina guardada
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSaveRoutine}
                  className="px-5 py-2 rounded-md bg-primary hover:bg-primary/90 active:scale-95 text-white text-xs font-bold flex items-center gap-2 shadow-none transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>Guardar</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: CALENDARIO DE EXCEPCIONES MENSUAL CON BARRITAS HORARIAS */}
          {activeTab === 'exceptions' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Monthly Calendar Navigation Bar */}
              <div className="p-3 rounded-md bg-background/45 border border-border/70 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-md bg-primary/10 border border-border/70 text-primary">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-white capitalize flex items-center gap-2">
                    <span>
                      {MONTH_NAMES_ES[currentMonthDate.getMonth()]} {currentMonthDate.getFullYear()}
                    </span>
                    {isCurrentMonthViewing && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/20 text-success border border-success/30">
                        Actual
                      </span>
                    )}
                  </h3>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-md bg-secondary/60 hover:bg-accent/70 border border-border/70 text-foreground transition-all active:scale-95"
                    title="Mes anterior"
                    aria-label="Mes anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleGoToToday}
                    className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-all active:scale-95 ${
                      isCurrentMonthViewing
                        ? 'bg-primary/25 border-primary/50 text-primary'
                        : 'bg-primary hover:bg-primary/90 text-white border-transparent'
                    }`}
                    title="Ir a hoy"
                  >
                    Hoy
                  </button>

                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-md bg-secondary/60 hover:bg-accent/70 border border-border/70 text-foreground transition-all active:scale-95"
                    title="Mes siguiente"
                    aria-label="Mes siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Sticky Action Bar for Selection */}
              {(selectedSlotKeys.length > 0 || actionBarFeedback) && (
                <div className="sticky top-0 z-20 p-3 rounded-md bg-secondary border border-border/70 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {selectedSlotKeys.length > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/40 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        {selectedSlotKeys.length} selec.
                      </span>
                    )}

                    {actionBarFeedback && (
                      <span className="text-xs text-success font-bold flex items-center gap-1.5 animate-in fade-in">
                        <CheckCircle2 className="w-4 h-4" />
                        {actionBarFeedback}
                      </span>
                    )}
                  </div>

                  {selectedSlotKeys.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCancelSelectedSlots}
                        className="px-3 py-1.5 rounded-md bg-destructive hover:bg-destructive active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 transition-all"
                        title="Cancelar franjas seleccionadas"
                        aria-label="Cancelar franjas seleccionadas"
                      >
                        <CalendarOff className="w-3.5 h-3.5" />
                        <span>Cancelar ({selectedSlotKeys.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleRestoreSelectedSlots}
                        className="px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-success active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 transition-all"
                        title="Restaurar franjas seleccionadas"
                        aria-label="Restaurar franjas seleccionadas"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restaurar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedSlotKeys([])}
                        className="p-1.5 rounded-md bg-secondary/60 hover:bg-accent/70 text-muted-foreground transition-colors"
                        title="Limpiar selección"
                        aria-label="Limpiar selección"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Inline Custom Time Editor Card (when editingDateStr is active) */}
              {editingDateStr && (
                <div className="p-4 rounded-md bg-secondary border border-warning/50 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-warning/20 pb-2">
                    <div className="flex items-center gap-2">
                      <Edit3 className="w-4 h-4 text-warning" />
                      <span className="text-xs sm:text-sm font-bold text-warning">
                        {editingDateFormatted} ({editingDateStr})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingDateStr(null)}
                      className="text-muted-foreground hover:text-white p-1 rounded-md hover:bg-secondary/60"
                      title="Cerrar"
                      aria-label="Cerrar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground font-medium">Desde:</span>
                      <input
                        type="time"
                        value={editFrom}
                        onChange={(e) => setEditFrom(e.target.value)}
                        className="px-2.5 py-1 rounded bg-background/45 border border-border/70 text-white text-xs font-mono focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground font-medium">Hasta:</span>
                      <input
                        type="time"
                        value={editUntil}
                        onChange={(e) => setEditUntil(e.target.value)}
                        className="px-2.5 py-1 rounded bg-background/45 border border-border/70 text-white text-xs font-mono focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-muted-foreground mr-1 font-medium">Margen:</span>
                      {PRECISION_OPTIONS.map((prec) => (
                        <button
                          key={prec}
                          type="button"
                          onClick={() => setEditPrecision(prec)}
                          className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                            editPrecision === prec
                              ? 'bg-warning/20 border border-warning/50 text-warning'
                              : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          ±{prec}m
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-semibold">Probabilidad</span>
                      <span className="text-warning font-bold">{editConfidence}%</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CONFIDENCE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setEditConfidence(opt.value)}
                          title={opt.label}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                            editConfidence === opt.value
                              ? 'bg-primary text-white border border-primary'
                              : 'bg-secondary/60 text-muted-foreground hover:text-foreground border border-border/70'
                          }`}
                        >
                          {opt.value}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] text-muted-foreground block mb-1">
                      Motivo
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {REASON_PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setEditReason(p)}
                          className="px-2 py-0.5 rounded text-[10px] bg-secondary/60 hover:bg-accent/70 text-muted-foreground border border-border/70 transition-colors"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Motivo opcional..."
                      className="w-full px-3 py-1.5 rounded bg-background/45 border border-border/70 text-foreground text-xs focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => handleMarkNotPlaying(editingDateStr, 'Baja programada')}
                      className="px-3 py-1.5 rounded-md bg-destructive/15 hover:bg-destructive/90 border border-destructive/40 text-destructive hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      title="Cancelar todo el día"
                    >
                      <CalendarOff className="w-3.5 h-3.5" />
                      <span>Baja día</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingDateStr(null)}
                        className="px-3 py-1.5 rounded-md bg-secondary/60 text-muted-foreground text-xs font-medium hover:bg-accent/70"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveCustomTime(editingDateStr)}
                        className="px-4 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Aplicar</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 7-Column Month Calendar Grid Container */}
              <div className="bg-background/45 border border-border/70 rounded-md p-2.5 sm:p-4 shadow-sm space-y-2">
                {/* 7 Weekday Headers */}
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {WEEKDAY_HEADERS.map((dayName, idx) => (
                    <div
                      key={dayName}
                      className={`py-1.5 text-center text-xs font-bold uppercase tracking-wider rounded-lg border ${
                        idx >= 5
                          ? 'bg-primary/15 border-primary/40 text-primary'
                          : 'bg-secondary border-border/70 text-muted-foreground'
                      }`}
                    >
                      {dayName}
                    </div>
                  ))}
                </div>

                {/* Day Cells Grid */}
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {monthCells.map((cell) => {
                    const { baseSlots, displaySlots, isCancelledMap } = getSlotsForDateCell(
                      currentUser,
                      cell.dateStr,
                      cell.dayKey
                    );
                    const override = currentUser.dailyOverrides?.[cell.dateStr];
                    const hasOverride = Boolean(override);
                    const isFullyCancelled = override?.status === 'not_playing';
                    const isEditing = editingDateStr === cell.dateStr;

                    const allSlotsSelected =
                      displaySlots.length > 0 &&
                      displaySlots.every((s) => selectedSlotKeys.includes(`${cell.dateStr}::${s.id}`));
                    const anySlotSelected = displaySlots.some((s) =>
                      selectedSlotKeys.includes(`${cell.dateStr}::${s.id}`)
                    );

                    return (
                      <div
                        key={cell.dateStr}
                        className={`relative min-h-[110px] sm:min-h-[125px] p-2 rounded-md border flex flex-col justify-between transition-all group ${
                          cell.isCurrentMonth
                            ? cell.isToday
                              ? 'bg-secondary border-success/60 ring-2 ring-success'
                              : hasOverride
                              ? 'bg-secondary border-primary/40 hover:border-primary/60'
                              : 'bg-background border-border/70 hover:border-primary/40'
                            : 'bg-background/60 border-border/70/60 opacity-40 hover:opacity-75'
                        } ${isEditing ? 'ring-2 ring-amber-400 border-warning bg-warning/20' : ''}`}
                      >
                        {/* Day Cell Header */}
                        <div className="flex items-center justify-between gap-1 pb-1 mb-1 border-b border-border/70">
                          <div className="flex items-center gap-1 min-w-0">
                            <span
                              className={`text-xs font-bold leading-none ${
                                cell.isToday
                                  ? 'text-success font-extrabold'
                                  : cell.isCurrentMonth
                                  ? 'text-foreground'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {cell.dayNumber}
                            </span>
                            {cell.isToday && (
                              <span className="px-1 py-0.2 rounded text-[8px] font-extrabold bg-success/20 text-success border border-success/30">
                                HOY
                              </span>
                            )}
                            {isFullyCancelled && (
                              <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-destructive/15 text-destructive border border-destructive/40">
                                BAJA
                              </span>
                            )}
                          </div>

                          {/* Quick Day Cell Actions */}
                          {cell.isCurrentMonth && (
                            <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                              {displaySlots.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleSelectAllDay(cell.dateStr, displaySlots)}
                                  className={`px-1 py-0.5 rounded text-[9px] font-bold transition-all ${
                                    allSlotsSelected
                                      ? 'bg-warning/30 text-warning border border-warning/50'
                                      : anySlotSelected
                                      ? 'bg-warning/20 text-warning'
                                      : 'hover:bg-secondary/60 text-muted-foreground hover:text-white'
                                  }`}
                                  title={
                                    allSlotsSelected
                                      ? 'Deseleccionar todas las franjas de este día'
                                      : 'Seleccionar todas las franjas de este día'
                                  }
                                >
                                  {allSlotsSelected ? '☑' : '☐'}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleOpenEditCustomTime(cell.dateStr)}
                                className="p-0.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors"
                                title="Horario especial"
                                aria-label={`Editar horario especial ${cell.dateStr}`}
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>

                              {!isFullyCancelled && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMarkNotPlaying(cell.dateStr, 'Baja programada en calendario')
                                  }
                                  className="p-0.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Cancelar día"
                                  aria-label={`Cancelar día ${cell.dateStr}`}
                                >
                                  <CalendarOff className="w-3 h-3" />
                                </button>
                              )}

                              {hasOverride && (
                                <button
                                  type="button"
                                  onClick={() => handleRestoreDefault(cell.dateStr)}
                                  className="p-0.5 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                                  title="Restaurar rutina"
                                  aria-label={`Restaurar rutina ${cell.dateStr}`}
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Day Slots Body: Horizontal Bar for Each Slot */}
                        <div className="flex-1 space-y-1">
                          {displaySlots.length === 0 ? (
                            <div className="h-full flex items-center justify-center py-2">
                              <span className="text-[10px] text-muted-foreground italic">
                                Descanso
                              </span>
                            </div>
                          ) : (
                            displaySlots.map((slot) => {
                              const isCancelled = Boolean(isCancelledMap[slot.id]);
                              const slotKey = `${cell.dateStr}::${slot.id}`;
                              const isSelected = selectedSlotKeys.includes(slotKey);
                              const confStyle = getConfidenceStyle(slot.confidencePercentage);

                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  onClick={() => toggleSlotSelection(cell.dateStr, slot.id)}
                                  className={`w-full text-left px-1.5 py-1 rounded-md text-[10px] font-medium transition-all flex items-center justify-between gap-1 group/bar ${
                                    isCancelled
                                      ? 'bg-destructive/15 border border-destructive/40 text-destructive line-through opacity-75 hover:opacity-100'
                                      : `${confStyle.bg} border ${confStyle.border} ${confStyle.text} hover:brightness-125`
                                  } ${
                                    isSelected
                                      ? 'ring-2 ring-amber-400 bg-warning/20 text-white shadow-md shadow-amber-500/25'
                                      : ''
                                  }`}
                                  title={`${cell.dateStr}: ${slot.from}–${slot.until} (${slot.confidencePercentage}% prob, ±${slot.precisionMinutes}m). ${
                                    isCancelled ? '🚫 CANCELADO.' : 'Activo.'
                                  } Clic para ${isSelected ? 'deseleccionar' : 'seleccionar para cancelar o restaurar'}.`}
                                >
                                  <div className="flex items-center gap-1 min-w-0 truncate">
                                    {isSelected ? (
                                      <span className="text-warning font-bold shrink-0 text-[10px]">
                                        ✓
                                      </span>
                                    ) : isCancelled ? (
                                      <span className="text-destructive font-bold shrink-0 text-[10px]">
                                        🚫
                                      </span>
                                    ) : (
                                      <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                                    )}
                                    <span className="font-mono font-semibold truncate leading-none">
                                      {slot.from}–{slot.until}
                                    </span>
                                  </div>

                                  <span className="text-[9px] font-bold opacity-80 shrink-0 leading-none">
                                    {slot.confidencePercentage}%
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>

                        {/* Day Cell Footer: Reason note if present */}
                        {override?.reason && (
                          <div
                            className="mt-1 pt-0.5 border-t border-border/70 text-[9px] text-muted-foreground truncate"
                            title={override.reason}
                          >
                            💬 {override.reason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Calendar Color Legend */}
              <div className="p-2.5 rounded-md bg-background/45 border border-border/70 flex flex-wrap items-center gap-3 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-success" />
                  <span className="text-muted-foreground">90–95%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-primary" />
                  <span className="text-muted-foreground">75%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-cyan-500" />
                  <span className="text-muted-foreground">50%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-destructive" />
                  <span className="text-destructive">Cancelada</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded ring-2 ring-amber-400 bg-warning/30" />
                  <span className="text-warning font-semibold">Selec.</span>
                </div>
              </div>

              {/* Month Exceptions Summary Table/List */}
              {monthOverrides.length > 0 && (
                <div className="p-3.5 rounded-md bg-background/45 border border-border/70 space-y-2.5">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    <span>Excepciones ({monthOverrides.length})</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {monthOverrides.map((ov) => {
                      const dayKey = getDayOfWeekKey(ov.date);
                      const isNotPlaying = ov.status === 'not_playing';

                      return (
                        <div
                          key={ov.date}
                          className="p-2.5 rounded-lg bg-secondary border border-border/70 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                              <span>{ov.date}</span>
                              <span className="text-[10px] text-muted-foreground font-normal">
                                ({dayKey})
                              </span>
                            </div>

                            <div className="text-[11px] mt-0.5 truncate">
                              {isNotPlaying ? (
                                <span className="text-destructive font-medium">🚫 No juego</span>
                              ) : (
                                <span className="text-warning font-medium">
                                  🕒 {ov.availableFrom}–{ov.availableUntil} (±{ov.precisionMinutes}m)
                                </span>
                              )}
                              {ov.reason && (
                                <span className="text-muted-foreground ml-1">· {ov.reason}</span>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRestoreDefault(ov.date)}
                            className="p-1.5 rounded-md hover:bg-secondary/60 text-muted-foreground hover:text-white transition-colors shrink-0"
                            title="Restaurar rutina"
                            aria-label={`Restaurar rutina ${ov.date}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-border/70 bg-card flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={() => setShowWeeklyScheduleModal(false)}
            className="px-4 py-1.5 rounded-md bg-secondary/60 hover:bg-accent/70 text-foreground text-xs font-bold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
