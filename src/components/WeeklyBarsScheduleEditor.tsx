import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  DAYS_OF_WEEK,
  DayOfWeekKey,
  DayScheduleConfig,
  PrecisionMinutes,
  TimeSlotBlock,
  WeeklySchedule,
} from '../types/domain';
import {
  Clock,
  Sparkles,
  Zap,
  Sliders,
  Trash2,
  Copy,
  Plus,
  Check,
  AlertTriangle,
  X,
  Info,
  CalendarCheck,
  CalendarOff,
} from 'lucide-react';

export interface WeeklyBarsScheduleEditorProps {
  schedule: WeeklySchedule;
  onChange: (updated: WeeklySchedule) => void;
  compact?: boolean;
}

// 12-hour window: 18:00 to 06:00 (+1 day) = 24 half-hour segments
const TOTAL_TICKS = 24;
const START_HOUR = 18;

const PRECISION_OPTIONS: PrecisionMinutes[] = [5, 15, 30, 60];

const CONFIDENCE_PRESETS: Array<{ value: number; label: string; desc: string }> = [
  { value: 25, label: '25% · Dudoso', desc: 'Poco probable / Quizás' },
  { value: 50, label: '50% · Mitad y mitad', desc: '50/50 · Puede ser' },
  { value: 75, label: '75% · Probable', desc: 'Probable presencia' },
  { value: 90, label: '90% · Muy probable', desc: 'Casi seguro de jugar' },
  { value: 95, label: '95% · Casi seguro', desc: 'Máximo en default' },
];

/**
 * Converts a "HH:mm" time string into tick index [0..24] relative to 18:00.
 */
export function timeToTick(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 8; // fallback 22:00
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;

  let minsFrom18: number;
  if (h >= 18) {
    minsFrom18 = (h - 18) * 60 + m;
  } else if (h <= 6) {
    minsFrom18 = (h + 24 - 18) * 60 + m; // 00:00 -> 360m, 01:00 -> 420m, 06:00 -> 720m
  } else {
    // daytime outside gaming window
    minsFrom18 = h > 12 ? 0 : 720;
  }

  const tick = minsFrom18 / 30;
  return Math.max(0, Math.min(TOTAL_TICKS, Math.round(tick)));
}

/**
 * Converts a tick index [0..24] into a "HH:mm" 24h formatted string.
 */
export function tickToTime(tick: number): string {
  const clampedTick = Math.max(0, Math.min(TOTAL_TICKS, Math.round(tick)));
  const totalMinsFrom18 = clampedTick * 30;
  const rawHour = START_HOUR + Math.floor(totalMinsFrom18 / 60);
  const hour = rawHour % 24;
  const mins = totalMinsFrom18 % 60;
  return `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Visual color styles and labels for confidence percentages.
 */
export function getConfidenceStyle(pct: number): {
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeBorder: string;
  glow: string;
  label: string;
} {
  if (pct <= 35) {
    return {
      bg: 'bg-amber-950/50',
      border: 'border-amber-500/60 border-dashed',
      text: 'text-amber-200',
      badgeBg: 'bg-amber-950/90',
      badgeBorder: 'border-amber-500/50',
      glow: 'shadow-amber-500/10',
      label: 'Dudoso / Poco probable',
    };
  }
  if (pct <= 60) {
    return {
      bg: 'bg-cyan-950/50',
      border: 'border-cyan-500/60',
      text: 'text-cyan-200',
      badgeBg: 'bg-cyan-950/90',
      badgeBorder: 'border-cyan-500/50',
      glow: 'shadow-cyan-500/10',
      label: '50/50 · Puede ser',
    };
  }
  if (pct <= 84) {
    return {
      bg: 'bg-indigo-950/60',
      border: 'border-indigo-500/70',
      text: 'text-indigo-200',
      badgeBg: 'bg-indigo-950/90',
      badgeBorder: 'border-indigo-500/50',
      glow: 'shadow-indigo-500/25 shadow-sm',
      label: 'Probable',
    };
  }
  return {
    bg: 'bg-emerald-950/60',
    border: 'border-emerald-500/70',
    text: 'text-emerald-200',
    badgeBg: 'bg-emerald-950/90',
    badgeBorder: 'border-emerald-500/50',
    glow: 'shadow-emerald-500/30 shadow-md',
    label: 'Muy probable · Casi seguro',
  };
}

/**
 * Normalizes a DayScheduleConfig so that it always has a valid array of TimeSlotBlocks.
 */
function normalizeSlotsForDay(dayKey: DayOfWeekKey, cfg: DayScheduleConfig): TimeSlotBlock[] {
  if (cfg.slots && cfg.slots.length > 0) {
    return cfg.slots;
  }
  if (!cfg.enabled) {
    return [];
  }
  return [
    {
      id: `slot-${dayKey}-initial`,
      from: cfg.availableFrom || '22:00',
      until: cfg.availableUntil || '01:30',
      confidencePercentage: Math.min(95, Math.max(10, cfg.confidencePercentage ?? 75)),
      precisionMinutes: cfg.precisionMinutes || 15,
    },
  ];
}

/**
 * Synchronizes single-slot legacy fields with the primary slot range.
 */
function syncDayConfigWithSlots(slots: TimeSlotBlock[], shouldBeEnabled = true): DayScheduleConfig {
  const sorted = [...slots].sort((a, b) => timeToTick(a.from) - timeToTick(b.from));

  if (sorted.length === 0) {
    return {
      enabled: false,
      availableFrom: '22:00',
      availableUntil: '01:30',
      precisionMinutes: 15,
      confidencePercentage: 75,
      slots: [],
    };
  }

  const maxConfidence = Math.min(95, Math.max(...sorted.map((s) => s.confidencePercentage), 75));

  return {
    enabled: shouldBeEnabled,
    availableFrom: sorted[0].from,
    availableUntil: sorted[sorted.length - 1].until,
    precisionMinutes: sorted[0].precisionMinutes,
    confidencePercentage: maxConfidence,
    slots: sorted,
  };
}

interface DragState {
  type: 'create' | 'resize-left' | 'resize-right' | 'move';
  dayKey: DayOfWeekKey;
  slotId?: string;
  initialStartTick: number;
  initialEndTick: number;
  clickTick: number;
  containerRect: DOMRect;
}

interface ContextMenuState {
  dayKey: DayOfWeekKey;
  slot: TimeSlotBlock;
  x: number;
  y: number;
}

export const WeeklyBarsScheduleEditor: React.FC<WeeklyBarsScheduleEditorProps> = ({
  schedule,
  onChange,
  compact = false,
}) => {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    dayKey: DayOfWeekKey;
    startTick: number;
    endTick: number;
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Ensure all 7 days have their normalized slots cached
  const normalizedSchedule = useMemo(() => {
    const result = { ...schedule };
    (DAYS_OF_WEEK.map((d) => d.key) as DayOfWeekKey[]).forEach((dayKey) => {
      const cfg = result[dayKey] ?? {
        enabled: true,
        availableFrom: '22:00',
        availableUntil: '01:30',
        precisionMinutes: 15,
      };
      const slots = normalizeSlotsForDay(dayKey, cfg);
      result[dayKey] = {
        ...cfg,
        slots,
      };
    });
    return result;
  }, [schedule]);

  // Handle Day enabled toggle
  const handleToggleDay = (dayKey: DayOfWeekKey) => {
    const current = normalizedSchedule[dayKey];
    const willBeEnabled = !current.enabled;

    let updatedSlots = current.slots || [];
    if (willBeEnabled && updatedSlots.length === 0) {
      updatedSlots = [
        {
          id: `slot-${dayKey}-${Date.now()}`,
          from: current.availableFrom || '22:00',
          until: current.availableUntil || '01:30',
          confidencePercentage: 75,
          precisionMinutes: 15,
        },
      ];
    }

    const updatedConfig = syncDayConfigWithSlots(updatedSlots, willBeEnabled);
    onChange({
      ...normalizedSchedule,
      [dayKey]: updatedConfig,
    });
  };

  // Preset Handlers
  const handleApplyPreset = (type: 'weekdays' | 'weekend' | 'everyday' | 'reset') => {
    const next = { ...normalizedSchedule };

    if (type === 'weekdays') {
      (['mon', 'tue', 'wed', 'thu', 'fri'] as DayOfWeekKey[]).forEach((d) => {
        next[d] = syncDayConfigWithSlots([
          {
            id: `slot-${d}-${Date.now()}`,
            from: '22:00',
            until: '01:00',
            confidencePercentage: 75,
            precisionMinutes: 15,
          },
        ]);
      });
    } else if (type === 'weekend') {
      (['fri', 'sat'] as DayOfWeekKey[]).forEach((d) => {
        next[d] = syncDayConfigWithSlots([
          {
            id: `slot-${d}-${Date.now()}`,
            from: '22:30',
            until: '02:30',
            confidencePercentage: 90,
            precisionMinutes: 15,
          },
        ]);
      });
    } else if (type === 'everyday') {
      (DAYS_OF_WEEK.map((d) => d.key) as DayOfWeekKey[]).forEach((d) => {
        next[d] = syncDayConfigWithSlots([
          {
            id: `slot-${d}-${Date.now()}`,
            from: '22:00',
            until: '01:30',
            confidencePercentage: 75,
            precisionMinutes: 15,
          },
        ]);
      });
    } else if (type === 'reset') {
      (DAYS_OF_WEEK.map((d) => d.key) as DayOfWeekKey[]).forEach((d) => {
        next[d] = {
          enabled: false,
          availableFrom: '22:00',
          availableUntil: '01:30',
          precisionMinutes: 15,
          confidencePercentage: 75,
          slots: [],
        };
      });
    }

    onChange(next);
  };

  // Convert mouse X client pos to tick [0..24]
  const getTickFromMouseEvent = useCallback((clientX: number, rect: DOMRect): number => {
    const rawX = clientX - rect.left;
    const clampedX = Math.max(0, Math.min(rect.width, rawX));
    const ratio = clampedX / rect.width;
    return Math.round(ratio * TOTAL_TICKS);
  }, []);

  // Mouse Down on Empty Timeline Area -> Create new slot
  const handleTimelineMouseDown = (dayKey: DayOfWeekKey, e: React.MouseEvent<HTMLDivElement>) => {
    // Only primary mouse button
    if (e.button !== 0) return;

    const container = rowRefs.current[dayKey];
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clickTick = getTickFromMouseEvent(e.clientX, rect);

    setDragState({
      type: 'create',
      dayKey,
      initialStartTick: clickTick,
      initialEndTick: clickTick,
      clickTick,
      containerRect: rect,
    });

    setDragPreview({
      dayKey,
      startTick: clickTick,
      endTick: Math.min(TOTAL_TICKS, clickTick + 1),
    });
  };

  // Mouse Down on Left Resize Handle
  const handleLeftHandleMouseDown = (
    dayKey: DayOfWeekKey,
    slot: TimeSlotBlock,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    const container = rowRefs.current[dayKey];
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startTick = timeToTick(slot.from);
    const endTick = timeToTick(slot.until);

    setDragState({
      type: 'resize-left',
      dayKey,
      slotId: slot.id,
      initialStartTick: startTick,
      initialEndTick: endTick,
      clickTick: startTick,
      containerRect: rect,
    });
  };

  // Mouse Down on Right Resize Handle
  const handleRightHandleMouseDown = (
    dayKey: DayOfWeekKey,
    slot: TimeSlotBlock,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    const container = rowRefs.current[dayKey];
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startTick = timeToTick(slot.from);
    const endTick = timeToTick(slot.until);

    setDragState({
      type: 'resize-right',
      dayKey,
      slotId: slot.id,
      initialStartTick: startTick,
      initialEndTick: endTick,
      clickTick: endTick,
      containerRect: rect,
    });
  };

  // Mouse Down on Slot Body -> Move Slot
  const handleSlotBodyMouseDown = (
    dayKey: DayOfWeekKey,
    slot: TimeSlotBlock,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    // Do not initiate drag on right click (let context menu open)
    if (e.button !== 0) return;

    const container = rowRefs.current[dayKey];
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startTick = timeToTick(slot.from);
    const endTick = timeToTick(slot.until);
    const clickTick = getTickFromMouseEvent(e.clientX, rect);

    setDragState({
      type: 'move',
      dayKey,
      slotId: slot.id,
      initialStartTick: startTick,
      initialEndTick: endTick,
      clickTick,
      containerRect: rect,
    });
  };

  // Open Context Menu
  const openContextMenu = (
    dayKey: DayOfWeekKey,
    slot: TimeSlotBlock,
    clientX: number,
    clientY: number
  ) => {
    // Clamp to viewport
    const menuWidth = 330;
    const menuHeight = 440;
    const clampedX = Math.max(10, Math.min(window.innerWidth - menuWidth - 16, clientX));
    const clampedY = Math.max(10, Math.min(window.innerHeight - menuHeight - 16, clientY));

    setContextMenu({
      dayKey,
      slot,
      x: clampedX,
      y: clampedY,
    });
  };

  // Global mouse move & mouse up listeners during drag
  useEffect(() => {
    if (!dragState) return;

    const onMouseMove = (e: MouseEvent) => {
      const currentTick = getTickFromMouseEvent(e.clientX, dragState.containerRect);

      if (dragState.type === 'create') {
        const from = Math.min(dragState.clickTick, currentTick);
        const to = Math.max(dragState.clickTick, currentTick);
        setDragPreview({
          dayKey: dragState.dayKey,
          startTick: from,
          endTick: Math.max(from + 1, to),
        });
      } else if (dragState.type === 'resize-left') {
        const newStart = Math.max(0, Math.min(dragState.initialEndTick - 1, currentTick));
        setDragPreview({
          dayKey: dragState.dayKey,
          startTick: newStart,
          endTick: dragState.initialEndTick,
        });
      } else if (dragState.type === 'resize-right') {
        const newEnd = Math.max(dragState.initialStartTick + 1, Math.min(TOTAL_TICKS, currentTick));
        setDragPreview({
          dayKey: dragState.dayKey,
          startTick: dragState.initialStartTick,
          endTick: newEnd,
        });
      } else if (dragState.type === 'move') {
        const duration = dragState.initialEndTick - dragState.initialStartTick;
        const delta = currentTick - dragState.clickTick;
        let newStart = dragState.initialStartTick + delta;
        newStart = Math.max(0, Math.min(TOTAL_TICKS - duration, newStart));
        const newEnd = newStart + duration;

        setDragPreview({
          dayKey: dragState.dayKey,
          startTick: newStart,
          endTick: newEnd,
        });
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      const finalTick = getTickFromMouseEvent(e.clientX, dragState.containerRect);

      const dayConfig = normalizedSchedule[dragState.dayKey];
      const existingSlots = [...(dayConfig.slots || [])];

      if (dragState.type === 'create') {
        let fromTick = Math.min(dragState.clickTick, finalTick);
        let toTick = Math.max(dragState.clickTick, finalTick);

        // If single click without drag, create a default 2-hour slot (4 ticks)
        if (Math.abs(finalTick - dragState.clickTick) <= 0) {
          fromTick = Math.max(0, Math.min(TOTAL_TICKS - 4, dragState.clickTick));
          toTick = Math.min(TOTAL_TICKS, fromTick + 4);
        } else if (toTick - fromTick < 1) {
          toTick = fromTick + 1;
        }

        const newSlot: TimeSlotBlock = {
          id: `slot-${dragState.dayKey}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          from: tickToTime(fromTick),
          until: tickToTime(toTick),
          confidencePercentage: 75,
          precisionMinutes: 15,
        };

        const updatedSlots = [...existingSlots, newSlot];
        const updatedDay = syncDayConfigWithSlots(updatedSlots, true);
        onChange({
          ...normalizedSchedule,
          [dragState.dayKey]: updatedDay,
        });
      } else if (dragState.slotId) {
        const slotIndex = existingSlots.findIndex((s) => s.id === dragState.slotId);
        if (slotIndex >= 0) {
          const currentSlot = existingSlots[slotIndex];

          let updatedFrom = currentSlot.from;
          let updatedUntil = currentSlot.until;

          if (dragState.type === 'resize-left') {
            const newStart = Math.max(0, Math.min(dragState.initialEndTick - 1, finalTick));
            updatedFrom = tickToTime(newStart);
          } else if (dragState.type === 'resize-right') {
            const newEnd = Math.max(dragState.initialStartTick + 1, Math.min(TOTAL_TICKS, finalTick));
            updatedUntil = tickToTime(newEnd);
          } else if (dragState.type === 'move') {
            const duration = dragState.initialEndTick - dragState.initialStartTick;
            const delta = finalTick - dragState.clickTick;
            let newStart = dragState.initialStartTick + delta;
            newStart = Math.max(0, Math.min(TOTAL_TICKS - duration, newStart));
            const newEnd = newStart + duration;

            updatedFrom = tickToTime(newStart);
            updatedUntil = tickToTime(newEnd);
          }

          existingSlots[slotIndex] = {
            ...currentSlot,
            from: updatedFrom,
            until: updatedUntil,
          };

          const updatedDay = syncDayConfigWithSlots(existingSlots, true);
          onChange({
            ...normalizedSchedule,
            [dragState.dayKey]: updatedDay,
          });
        }
      }

      setDragState(null);
      setDragPreview(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragState, getTickFromMouseEvent, normalizedSchedule, onChange]);

  // Context Menu Actions
  const handleUpdateSlotInContextMenu = (patch: Partial<TimeSlotBlock>) => {
    if (!contextMenu) return;

    const dayConfig = normalizedSchedule[contextMenu.dayKey];
    const existingSlots = [...(dayConfig.slots || [])];
    const idx = existingSlots.findIndex((s) => s.id === contextMenu.slot.id);

    if (idx >= 0) {
      const updatedSlot = {
        ...existingSlots[idx],
        ...patch,
      };
      existingSlots[idx] = updatedSlot;

      const updatedDay = syncDayConfigWithSlots(existingSlots, true);
      onChange({
        ...normalizedSchedule,
        [contextMenu.dayKey]: updatedDay,
      });

      setContextMenu((prev) => (prev ? { ...prev, slot: updatedSlot } : null));
    }
  };

  const handleDeleteSlotInContextMenu = () => {
    if (!contextMenu) return;

    const dayConfig = normalizedSchedule[contextMenu.dayKey];
    const remainingSlots = (dayConfig.slots || []).filter((s) => s.id !== contextMenu.slot.id);

    const updatedDay = syncDayConfigWithSlots(remainingSlots, remainingSlots.length > 0);
    onChange({
      ...normalizedSchedule,
      [contextMenu.dayKey]: updatedDay,
    });

    setContextMenu(null);
  };

  const handleCopySlotToDays = (targetDayKeys: DayOfWeekKey[]) => {
    if (!contextMenu) return;

    const sourceSlot = contextMenu.slot;
    const next = { ...normalizedSchedule };

    targetDayKeys.forEach((targetKey) => {
      const clonedSlot: TimeSlotBlock = {
        ...sourceSlot,
        id: `slot-${targetKey}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      };
      next[targetKey] = syncDayConfigWithSlots([clonedSlot], true);
    });

    onChange(next);
    setContextMenu(null);
  };

  return (
    <div className="space-y-4 text-slate-200 select-none">
      {/* 1. Header Hint Banner */}
      <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-slate-900 border border-indigo-500/30 flex items-start gap-3 shadow-md">
        <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-200 leading-relaxed">
          <p className="font-bold text-white mb-0.5">
            💡 Editor Interactivo de 7 Barras Semanales
          </p>
          <span>
            Arrastrá sobre cualquier barra para pintar tu horario y hacé{' '}
            <strong className="text-amber-300">CLIC DERECHO</strong> sobre una franja para elegir
            el <strong className="text-white">% de probabilidad</strong>, precisión horaria o{' '}
            <strong className="text-rose-300">borrarla</strong>. Recordá que en horario default la
            confianza máxima es <strong className="text-emerald-300">95%</strong> (100% solo al
            confirmar la sesión del día).
          </span>
        </div>
      </div>

      {/* 2. Quick Presets Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-indigo-900/30">
        <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Presets de 1 clic:</span>
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => handleApplyPreset('weekdays')}
            className="px-2.5 py-1 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/30 text-indigo-300 hover:text-white text-[11px] font-semibold transition-all active:scale-95"
            title="Aplica 22:00 a 01:00 de Lunes a Viernes"
          >
            ⚡ Lun–Vie (22:00–01:00)
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('weekend')}
            className="px-2.5 py-1 rounded-lg bg-purple-950/80 hover:bg-purple-900 border border-purple-500/30 text-purple-300 hover:text-white text-[11px] font-semibold transition-all active:scale-95"
            title="Aplica 22:30 a 02:30 para Viernes y Sábado"
          >
            🔥 Vie–Sáb (22:30–02:30)
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('everyday')}
            className="px-2.5 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/30 text-emerald-300 hover:text-white text-[11px] font-semibold transition-all active:scale-95"
            title="Aplica 22:00 a 01:30 todos los días"
          >
            🌙 Todos los días
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('reset')}
            className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white text-[11px] font-semibold transition-all active:scale-95"
            title="Deshabilita todos los días"
          >
            🔄 Limpiar
          </button>
        </div>
      </div>

      {/* 3. The 7 Timeline Rows Container */}
      <div className="bg-[#090d16] border border-indigo-500/30 rounded-2xl p-3 sm:p-4 shadow-xl shadow-black/40 space-y-2">
        {/* Time Axis Header */}
        <div className="flex items-center gap-3 pb-2 border-b border-indigo-900/40">
          {/* Day Label Spacer */}
          <div className="w-20 sm:w-28 shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">
            Día
          </div>

          {/* 24-Segment Axis Ruler */}
          <div className="relative flex-1 h-6">
            {/* Hour Markers */}
            {[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map((tick) => {
              const time = tickToTime(tick);
              const leftPercent = (tick / TOTAL_TICKS) * 100;
              const isMidnight = tick === 12;

              return (
                <div
                  key={tick}
                  className="absolute top-0 flex flex-col items-center -translate-x-1/2 pointer-events-none"
                  style={{ left: `${leftPercent}%` }}
                >
                  <span
                    className={`text-[10px] font-mono font-bold leading-none ${
                      isMidnight ? 'text-amber-300' : 'text-slate-400'
                    }`}
                  >
                    {isMidnight ? '00:00 🌙' : time}
                  </span>
                  <div
                    className={`w-px h-1.5 mt-1 ${
                      isMidnight ? 'bg-amber-400' : 'bg-slate-700'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* 7 Days Timeline Rows */}
        <div className="space-y-2 pt-1">
          {DAYS_OF_WEEK.map((day) => {
            const dayKey = day.key;
            const cfg = normalizedSchedule[dayKey];
            const isEnabled = cfg.enabled;
            const slots = cfg.slots || [];

            return (
              <div
                key={dayKey}
                className={`flex items-center gap-2 sm:gap-3 p-1.5 rounded-xl border transition-all ${
                  isEnabled
                    ? 'bg-[#0f172a]/90 border-indigo-500/30'
                    : 'bg-[#0a0f1d]/50 border-slate-800/80 opacity-60'
                }`}
              >
                {/* Day Toggle Button & Label */}
                <button
                  type="button"
                  onClick={() => handleToggleDay(dayKey)}
                  className={`w-20 sm:w-28 shrink-0 px-2 py-1.5 rounded-lg flex items-center justify-between text-left transition-all ${
                    isEnabled
                      ? 'bg-indigo-600/20 border border-indigo-500/40 text-white'
                      : 'bg-slate-800/40 border border-slate-700/50 text-slate-400 hover:text-slate-200'
                  }`}
                  title={isEnabled ? `Desactivar ${day.label}` : `Activar ${day.label}`}
                >
                  <div>
                    <span className="font-extrabold text-xs block leading-tight">
                      {day.shortLabel}
                    </span>
                    <span
                      className={`text-[9px] font-semibold block leading-tight ${
                        isEnabled ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {isEnabled ? 'Juego' : 'Descanso'}
                    </span>
                  </div>

                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center border text-[9px] ${
                      isEnabled
                        ? 'bg-emerald-500 border-emerald-400 text-black'
                        : 'bg-slate-800 border-slate-600 text-transparent'
                    }`}
                  >
                    ✓
                  </div>
                </button>

                {/* Interactive Horizontal Timeline Bar */}
                <div
                  ref={(el) => {
                    rowRefs.current[dayKey] = el;
                  }}
                  onMouseDown={(e) => handleTimelineMouseDown(dayKey, e)}
                  className={`relative flex-1 rounded-lg border overflow-hidden cursor-crosshair transition-colors ${
                    compact ? 'h-9' : 'h-11'
                  } ${
                    isEnabled
                      ? 'bg-[#0b1222] border-slate-800 hover:border-indigo-500/40'
                      : 'bg-[#080d19] border-slate-900 cursor-not-allowed opacity-50'
                  }`}
                  title={
                    isEnabled
                      ? 'Arrastrá para pintar horario. Hacé clic derecho sobre una franja para editar probabilidad o borrarla.'
                      : 'Hacé clic en el día para activarlo'
                  }
                >
                  {/* Background Half-Hour Grid lines */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {Array.from({ length: TOTAL_TICKS }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`flex-1 h-full border-r ${
                          idx === 11
                            ? 'border-amber-500/30' // Midnight separator
                            : idx % 2 === 1
                            ? 'border-slate-800/60' // Hour border
                            : 'border-slate-800/20' // 30-min subtle tick
                        }`}
                      />
                    ))}
                  </div>

                  {/* Empty state hint */}
                  {isEnabled && slots.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500 font-medium pointer-events-none">
                      Arrastrá aquí para añadir tu franja horaria
                    </div>
                  )}

                  {/* Render Existing Slot Blocks */}
                  {isEnabled &&
                    slots.map((slot) => {
                      const startTick = timeToTick(slot.from);
                      const endTick = timeToTick(slot.until);
                      const duration = Math.max(1, endTick - startTick);

                      const leftPct = (startTick / TOTAL_TICKS) * 100;
                      const widthPct = (duration / TOTAL_TICKS) * 100;

                      const style = getConfidenceStyle(slot.confidencePercentage);

                      return (
                        <div
                          key={slot.id}
                          onMouseDown={(e) => handleSlotBodyMouseDown(dayKey, slot, e)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openContextMenu(dayKey, slot, e.clientX, e.clientY);
                          }}
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                          }}
                          className={`group absolute top-1 bottom-1 rounded-md border flex items-center justify-between px-1.5 cursor-grab active:cursor-grabbing transition-all ${style.bg} ${style.border} ${style.glow}`}
                        >
                          {/* Left Resize Handle */}
                          <div
                            onMouseDown={(e) => handleLeftHandleMouseDown(dayKey, slot, e)}
                            className="absolute -left-1 top-0 bottom-0 w-2.5 hover:w-3 cursor-ew-resize flex items-center justify-center z-10 group/handle"
                            title="Arrastrar para ajustar hora de inicio"
                          >
                            <div className="w-1 h-4 bg-white/50 group-hover/handle:bg-white rounded-full transition-colors" />
                          </div>

                          {/* Slot Badge: From-Until · Conf% · Precision */}
                          <div className="flex-1 flex items-center gap-1 overflow-hidden pointer-events-none px-1">
                            <span
                              className={`font-mono font-black text-[10px] truncate ${style.text}`}
                            >
                              {slot.from}–{slot.until}
                            </span>
                            <span className="hidden sm:inline text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-black/50 text-white/90 shrink-0">
                              {slot.confidencePercentage}%
                            </span>
                            <span className="hidden md:inline text-[9px] font-semibold text-slate-300 shrink-0">
                              (±{slot.precisionMinutes}m)
                            </span>
                          </div>

                          {/* Quick Edit pill on hover for trackpad/mobile */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openContextMenu(dayKey, slot, e.clientX, e.clientY);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded bg-black/60 hover:bg-black text-slate-300 hover:text-white transition-opacity shrink-0"
                            title="Opciones de franja (Clic derecho)"
                          >
                            <Sliders className="w-2.5 h-2.5" />
                          </button>

                          {/* Right Resize Handle */}
                          <div
                            onMouseDown={(e) => handleRightHandleMouseDown(dayKey, slot, e)}
                            className="absolute -right-1 top-0 bottom-0 w-2.5 hover:w-3 cursor-ew-resize flex items-center justify-center z-10 group/handle"
                            title="Arrastrar para ajustar hora de fin"
                          >
                            <div className="w-1 h-4 bg-white/50 group-hover/handle:bg-white rounded-full transition-colors" />
                          </div>
                        </div>
                      );
                    })}

                  {/* Drag Preview Ghost Block */}
                  {dragPreview && dragPreview.dayKey === dayKey && (
                    <div
                      style={{
                        left: `${(dragPreview.startTick / TOTAL_TICKS) * 100}%`,
                        width: `${
                          ((dragPreview.endTick - dragPreview.startTick) / TOTAL_TICKS) * 100
                        }%`,
                      }}
                      className="absolute top-1 bottom-1 rounded-md border-2 border-dashed border-indigo-400 bg-indigo-500/25 pointer-events-none z-20 flex items-center justify-center text-[10px] font-mono font-bold text-white shadow-lg"
                    >
                      {tickToTime(dragPreview.startTick)} – {tickToTime(dragPreview.endTick)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Floating Right-Click Custom Context Menu */}
      {contextMenu && (
        <>
          {/* Backdrop to dismiss */}
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />

          {/* Context Menu Card */}
          <div
            style={{
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
            }}
            className="fixed z-50 w-[330px] bg-[#11192d] border border-indigo-500/40 rounded-2xl shadow-2xl shadow-black/80 p-4 space-y-4 text-slate-200 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Context Menu Header */}
            <div className="flex items-start justify-between border-b border-indigo-900/40 pb-2.5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">
                  Configurar Franja Horaria
                </span>
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span>
                    {DAYS_OF_WEEK.find((d) => d.key === contextMenu.dayKey)?.label} ·{' '}
                    {contextMenu.slot.from} a {contextMenu.slot.until}
                  </span>
                </h4>
              </div>

              <button
                type="button"
                onClick={() => setContextMenu(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Informative Rule Notice */}
            <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-start gap-2 text-[10px] text-amber-200 leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                En horario default la confianza máxima es <strong>95%</strong> (100% solo al
                confirmar la sesión del día).
              </span>
            </div>

            {/* Confidence Percentage Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">Probabilidad de Asistir:</span>
                <span
                  className={`font-extrabold px-2 py-0.5 rounded-full text-xs border ${
                    getConfidenceStyle(contextMenu.slot.confidencePercentage).badgeBg
                  } ${getConfidenceStyle(contextMenu.slot.confidencePercentage).badgeBorder} ${
                    getConfidenceStyle(contextMenu.slot.confidencePercentage).text
                  }`}
                >
                  {contextMenu.slot.confidencePercentage}% ·{' '}
                  {getConfidenceStyle(contextMenu.slot.confidencePercentage).label}
                </span>
              </div>

              {/* Slider (10% to 95%) */}
              <input
                type="range"
                min={10}
                max={95}
                step={5}
                value={contextMenu.slot.confidencePercentage}
                onChange={(e) =>
                  handleUpdateSlotInContextMenu({
                    confidencePercentage: parseInt(e.target.value, 10),
                  })
                }
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />

              {/* Quick Preset Pills */}
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {CONFIDENCE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() =>
                      handleUpdateSlotInContextMenu({ confidencePercentage: preset.value })
                    }
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-bold text-left transition-all ${
                      contextMenu.slot.confidencePercentage === preset.value
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/40 border border-indigo-400'
                        : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                    }`}
                  >
                    <div>{preset.label}</div>
                    <div className="text-[9px] opacity-75 font-normal">{preset.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Precision Selector */}
            <div className="space-y-1.5 pt-1 border-t border-indigo-900/30">
              <span className="text-xs font-bold text-slate-300 block">Precisión Horaria:</span>
              <div className="grid grid-cols-4 gap-1.5">
                {PRECISION_OPTIONS.map((prec) => (
                  <button
                    key={prec}
                    type="button"
                    onClick={() => handleUpdateSlotInContextMenu({ precisionMinutes: prec })}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                      contextMenu.slot.precisionMinutes === prec
                        ? 'bg-amber-500/25 border border-amber-500/60 text-amber-300'
                        : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 border border-slate-700/50'
                    }`}
                  >
                    ±{prec}m
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Copy Actions */}
            <div className="space-y-1.5 pt-1 border-t border-indigo-900/30">
              <span className="text-[11px] font-bold text-slate-400 block">
                📋 Copiar este horario a:
              </span>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() =>
                    handleCopySlotToDays(['mon', 'tue', 'wed', 'thu', 'fri'])
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Copiar a Lun–Vie</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCopySlotToDays(['sat', 'sun'])}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-purple-400" />
                  <span>Copiar a Fin de Semana (Sáb–Dom)</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleCopySlotToDays([
                      'mon',
                      'tue',
                      'wed',
                      'thu',
                      'fri',
                      'sat',
                      'sun',
                    ])
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copiar a toda la semana</span>
                </button>
              </div>
            </div>

            {/* Red Prominent Delete Action */}
            <div className="pt-2 border-t border-indigo-900/30">
              <button
                type="button"
                onClick={handleDeleteSlotInContextMenu}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-300 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-950/50"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>🗑️ Borrar franja horaria</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
