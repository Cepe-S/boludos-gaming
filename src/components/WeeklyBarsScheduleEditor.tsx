import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  Zap,
  Sliders,
  Trash2,
  Copy,
  X,
} from 'lucide-react';

export interface WeeklyBarsScheduleEditorProps {
  schedule: WeeklySchedule;
  onChange: (updated: WeeklySchedule) => void;
  compact?: boolean;
}

// 15-hour window: 12:00 (mediodía) to 03:00 (+1 day madrugada) = 30 half-hour segments
const TOTAL_TICKS = 30;
const START_HOUR = 12;

const PRECISION_OPTIONS: PrecisionMinutes[] = [5, 15, 30, 60];

const CONFIDENCE_PRESETS: Array<{ value: number; label: string; desc: string }> = [
  { value: 25, label: '25% · Dudoso', desc: 'Poco probable / Quizás' },
  { value: 50, label: '50% · Mitad y mitad', desc: '50/50 · Puede ser' },
  { value: 75, label: '75% · Probable', desc: 'Probable presencia' },
  { value: 90, label: '90% · Muy probable', desc: 'Casi seguro de jugar' },
  { value: 95, label: '95% · Casi seguro', desc: 'Máximo en default' },
];

/**
 * Converts a "HH:mm" time string into tick index [0..30] relative to 12:00.
 */
export function timeToTick(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 20; // fallback 22:00 (tick 20)
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;

  let minsFrom12: number;
  if (h >= 12) {
    minsFrom12 = (h - 12) * 60 + m;
  } else if (h <= 3) {
    minsFrom12 = (h + 24 - 12) * 60 + m; // 00:00 -> 720m (tick 24), 03:00 -> 900m (tick 30)
  } else {
    // daytime outside gaming window (04:00 to 11:59)
    minsFrom12 = h < 8 ? 900 : 0;
  }

  const tick = minsFrom12 / 30;
  return Math.max(0, Math.min(TOTAL_TICKS, Math.round(tick)));
}

/**
 * Converts a tick index [0..30] into a "HH:mm" 24h formatted string.
 */
export function tickToTime(tick: number): string {
  const clampedTick = Math.max(0, Math.min(TOTAL_TICKS, Math.round(tick)));
  const totalMinsFrom12 = clampedTick * 30;
  const rawHour = START_HOUR + Math.floor(totalMinsFrom12 / 60);
  const hour = rawHour % 24;
  const mins = totalMinsFrom12 % 60;
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
      bg: 'bg-warning/50',
      border: 'border-warning/60 border-dashed',
      text: 'text-warning',
      badgeBg: 'bg-warning/90',
      badgeBorder: 'border-warning/50',
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
      bg: 'bg-primary/60',
      border: 'border-[#5865F2]/70',
      text: 'text-primary',
      badgeBg: 'bg-primary/90',
      badgeBorder: 'border-[#5865F2]/50',
      glow: 'shadow-none',
      label: 'Probable',
    };
  }
  return {
    bg: 'bg-success/15',
    border: 'border-success/70',
    text: 'text-success',
    badgeBg: 'bg-success/15',
    badgeBorder: 'border-success/50',
    glow: 'shadow-success/30 shadow-md',
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
  anchorX: number;
  anchorY: number;
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
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
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

  // Convert mouse X client pos to tick [0..30]
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

  // Open Context Menu (initial estimate; refined with actual DOM dimensions in useLayoutEffect)
  const openContextMenu = (
    dayKey: DayOfWeekKey,
    slot: TimeSlotBlock,
    clientX: number,
    clientY: number
  ) => {
    const margin = 12;
    const estWidth = 330;
    const estHeight = 480;
    const openLeft = clientX + estWidth > window.innerWidth - margin && clientX - estWidth >= margin;
    const openUp = clientY + estHeight > window.innerHeight - margin && clientY > window.innerHeight / 2;

    const initialX = Math.max(
      margin,
      Math.min(window.innerWidth - estWidth - margin, openLeft ? clientX - estWidth : clientX)
    );
    const initialY = Math.max(
      margin,
      Math.min(window.innerHeight - estHeight - margin, openUp ? clientY - estHeight : clientY)
    );

    setContextMenu({
      dayKey,
      slot,
      anchorX: clientX,
      anchorY: clientY,
      x: initialX,
      y: initialY,
    });
  };

  // Refine context menu position using actual rendered size so it always opens toward available space
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;

    const margin = 12;
    const rect = contextMenuRef.current.getBoundingClientRect();
    const { anchorX, anchorY } = contextMenu;

    const spaceRight = window.innerWidth - anchorX - margin;
    const spaceLeft = anchorX - margin;
    let nextX =
      spaceRight >= rect.width || spaceRight >= spaceLeft
        ? anchorX
        : anchorX - rect.width;
    nextX = Math.max(margin, Math.min(window.innerWidth - rect.width - margin, nextX));

    const spaceBelow = window.innerHeight - anchorY - margin;
    const spaceAbove = anchorY - margin;
    let nextY =
      spaceBelow >= rect.height || spaceBelow >= spaceAbove
        ? anchorY
        : anchorY - rect.height;
    nextY = Math.max(margin, Math.min(window.innerHeight - rect.height - margin, nextY));

    if (Math.abs(nextX - contextMenu.x) > 1 || Math.abs(nextY - contextMenu.y) > 1) {
      setContextMenu((prev) => (prev ? { ...prev, x: nextX, y: nextY } : null));
    }
  }, [contextMenu]);

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
          toTick = Math.min(TOTAL_TICKS, fromTick + 1);
          if (toTick === fromTick) fromTick = Math.max(0, toTick - 1);
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
    <div className="space-y-3 text-foreground select-none">
      {/* Quick Presets Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#232834]">
        <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-warning" strokeWidth={1.75} />
          <span>Presets</span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleApplyPreset('weekdays')}
            className="px-2.5 py-1 rounded-md bg-[#5865F2]/15 hover:bg-[#5865F2]/25 border border-[#232834] text-primary hover:text-white text-[11px] font-semibold transition-all active:scale-95"
            title="Aplicar 22:00–01:00 de Lun a Vie"
            aria-label="Preset Lun–Vie 22:00–01:00"
          >
            Lun–Vie
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('weekend')}
            className="px-2.5 py-1 rounded-md bg-primary/15 hover:bg-primary/15 border border-primary/40 text-primary hover:text-white text-[11px] font-semibold transition-all active:scale-95"
            title="Aplicar 22:30–02:30 Vie y Sáb"
            aria-label="Preset Vie–Sáb 22:30–02:30"
          >
            Vie–Sáb
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('everyday')}
            className="px-2.5 py-1 rounded-md bg-success/15 hover:bg-success/90 border border-success/30 text-success hover:text-white text-[11px] font-semibold transition-all active:scale-95"
            title="Aplicar 22:00–01:30 todos los días"
            aria-label="Preset todos los días"
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('reset')}
            className="p-1.5 rounded-md bg-[#1F242E] hover:bg-[#2A303E] border border-[#232834] text-muted-foreground hover:text-destructive transition-all active:scale-95"
            title="Limpiar todos los días"
            aria-label="Limpiar todos los días"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* 3. The 7 Timeline Rows Container */}
      <div className="bg-background/45 border border-[#232834] rounded-md p-3 sm:p-4 shadow-sm space-y-2">
        {/* Time Axis Header */}
        <div className="flex items-center gap-3 pb-2 border-b border-[#232834]">
          {/* Day Label Spacer */}
          <div className="w-20 sm:w-28 shrink-0 text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1">
            Día
          </div>

          {/* 30-Segment Axis Ruler (12:00 to 03:00) */}
          <div className="relative flex-1 h-6">
            {/* Hour Markers */}
            {[0, 4, 8, 12, 16, 20, 24, 28, 30].map((tick) => {
              const time = tickToTime(tick);
              const leftPercent = (tick / TOTAL_TICKS) * 100;
              const isMidnight = tick === 24;
              const isNoon = tick === 0;

              let label = time;
              if (isMidnight) label = '00:00 🌙';
              else if (isNoon) label = '12:00 ☀️';

              return (
                <div
                  key={tick}
                  className={`absolute top-0 flex flex-col pointer-events-none ${
                    tick === 0
                      ? 'items-start translate-x-0'
                      : tick === 30
                      ? 'items-end -translate-x-full'
                      : 'items-center -translate-x-1/2'
                  } ${tick === 28 ? 'hidden sm:flex' : 'flex'}`}
                  style={{ left: `${leftPercent}%` }}
                >
                  <span
                    className={`text-[9px] sm:text-[10px] font-mono font-bold leading-none select-none ${
                      isMidnight
                        ? 'text-warning'
                        : isNoon
                        ? 'text-warning'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {label}
                  </span>
                  <div
                    className={`w-px h-1.5 mt-1 ${
                      isMidnight
                        ? 'bg-warning'
                        : isNoon
                        ? 'bg-warning/80'
                        : 'bg-[#2A303E]'
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
                className={`flex items-center gap-2 sm:gap-3 p-1.5 rounded-md border transition-all ${
                  isEnabled
                    ? 'bg-card/50 border-[#232834]'
                    : 'bg-background/70 border-[#232834] opacity-60'
                }`}
              >
                {/* Day Toggle Button & Label */}
                <button
                  type="button"
                  onClick={() => handleToggleDay(dayKey)}
                  className={`w-20 sm:w-28 shrink-0 px-2 py-1.5 rounded-lg flex items-center justify-between text-left transition-all ${
                    isEnabled
                      ? 'bg-[#5865F2]/15 border border-[#5865F2]/40 text-white'
                      : 'bg-secondary/70 border border-[#232834] text-muted-foreground hover:text-foreground'
                  }`}
                  title={isEnabled ? `Desactivar ${day.label}` : `Activar ${day.label}`}
                >
                  <div>
                    <span className="font-extrabold text-xs block leading-tight">
                      {day.shortLabel}
                    </span>
                    <span
                      className={`text-[9px] font-semibold block leading-tight ${
                        isEnabled ? 'text-success' : 'text-muted-foreground'
                      }`}
                    >
                      {isEnabled ? 'Juego' : 'Descanso'}
                    </span>
                  </div>

                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center border text-[9px] ${
                      isEnabled
                        ? 'bg-success border-success text-black'
                        : 'bg-[#1F242E] border-border text-transparent'
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
                      ? 'bg-background/45 border-[#232834] hover:border-[#5865F2]/40'
                      : 'bg-background/45 border-[#232834] cursor-not-allowed opacity-50'
                  }`}
                  title={
                    isEnabled
                      ? 'Arrastrá para pintar horario. Hacé clic derecho sobre una franja para editar probabilidad o borrarla.'
                      : 'Hacé clic en el día para activarlo'
                  }
                >
                  {/* Background Half-Hour Grid lines */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {Array.from({ length: TOTAL_TICKS + 1 }).map((_, tick) => {
                      if (tick === 0 || tick === TOTAL_TICKS) return null;
                      const isMidnight = tick === 24;
                      const isHour = tick % 2 === 0;
                      const leftPct = (tick / TOTAL_TICKS) * 100;

                      return (
                        <div
                          key={tick}
                          style={{ left: `${leftPct}%` }}
                          className={`absolute top-0 bottom-0 w-px ${
                            isMidnight
                              ? 'bg-warning/50 z-10 shadow-[0_0_8px_rgba(251,191,36,0.4)]'
                              : isHour
                              ? 'bg-secondary'
                              : 'bg-[#1F242E]/40'
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* Empty state hint */}
                  {isEnabled && slots.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-600 font-medium pointer-events-none">
                      Sin franja
                    </div>
                  )}

                  {/* Render Existing Slot Blocks */}
                  {isEnabled &&
                    slots.map((slot) => {
                      const rawStart = timeToTick(slot.from);
                      const rawEnd = timeToTick(slot.until);
                      const startTick = Math.min(TOTAL_TICKS - 1, Math.max(0, rawStart));
                      const endTick = Math.min(TOTAL_TICKS, Math.max(startTick + 1, rawEnd));
                      const duration = endTick - startTick;

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
                            <span className="hidden md:inline text-[9px] font-semibold text-muted-foreground shrink-0">
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
                            className="opacity-0 group-hover:opacity-100 p-1 rounded bg-black/60 hover:bg-black text-muted-foreground hover:text-white transition-opacity shrink-0"
                            title="Editar franja"
                            aria-label="Editar franja"
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
                      className="absolute top-1 bottom-1 rounded-md border-2 border-dashed border-primary bg-primary/25 pointer-events-none z-20 flex items-center justify-center text-[10px] font-mono font-bold text-white shadow-none"
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

      {/* 4. Floating Right-Click Custom Context Menu (Portal so modals never clip or offset fixed coords) */}
      {contextMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* Backdrop to dismiss */}
            <div
              className="fixed inset-0 z-[9998] bg-black/40 "
              onClick={() => setContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu(null);
              }}
            />

            {/* Context Menu Card */}
            <div
              ref={contextMenuRef}
              style={{
                top: `${contextMenu.y}px`,
                left: `${contextMenu.x}px`,
              }}
              className="fixed z-[9999] w-[330px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto bg-secondary/55 border border-[#5865F2]/40 rounded-md shadow-none p-4 space-y-4 text-foreground animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
            {/* Context Menu Header */}
            <div className="flex items-center justify-between border-b border-[#232834] pb-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                <span>
                  {DAYS_OF_WEEK.find((d) => d.key === contextMenu.dayKey)?.label} ·{' '}
                  {contextMenu.slot.from}–{contextMenu.slot.until}
                </span>
              </h4>

              <button
                type="button"
                onClick={() => setContextMenu(null)}
                className="p-1 text-muted-foreground hover:text-white rounded-md hover:bg-[#1F242E] transition-colors"
                title="Cerrar"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Confidence Percentage Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-muted-foreground">Probabilidad</span>
                <span
                  className={`font-extrabold px-2 py-0.5 rounded-full text-[11px] border ${
                    getConfidenceStyle(contextMenu.slot.confidencePercentage).badgeBg
                  } ${getConfidenceStyle(contextMenu.slot.confidencePercentage).badgeBorder} ${
                    getConfidenceStyle(contextMenu.slot.confidencePercentage).text
                  }`}
                >
                  {contextMenu.slot.confidencePercentage}%
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
                className="w-full h-1.5 bg-[#1F242E] rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />

              {/* Quick Preset Pills */}
              <div className="grid grid-cols-5 gap-1 pt-0.5">
                {CONFIDENCE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() =>
                      handleUpdateSlotInContextMenu({ confidencePercentage: preset.value })
                    }
                    title={`${preset.label} — ${preset.desc}`}
                    className={`py-1 rounded text-[10px] font-bold text-center transition-all ${
                      contextMenu.slot.confidencePercentage === preset.value
                        ? 'bg-[#5865F2] text-white border border-primary'
                        : 'bg-[#1F242E] text-muted-foreground hover:text-foreground border border-[#232834]'
                    }`}
                  >
                    {preset.value}%
                  </button>
                ))}
              </div>
            </div>

            {/* Precision Selector */}
            <div className="space-y-1.5 pt-2 border-t border-[#232834]">
              <span className="text-xs font-bold text-muted-foreground block">Margen</span>
              <div className="grid grid-cols-4 gap-1.5">
                {PRECISION_OPTIONS.map((prec) => (
                  <button
                    key={prec}
                    type="button"
                    onClick={() => handleUpdateSlotInContextMenu({ precisionMinutes: prec })}
                    className={`py-1 rounded-md text-xs font-bold transition-all ${
                      contextMenu.slot.precisionMinutes === prec
                        ? 'bg-warning/25 border border-warning/60 text-warning'
                        : 'bg-[#1F242E] text-muted-foreground hover:text-foreground border border-[#232834]'
                    }`}
                  >
                    ±{prec}m
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Copy Actions */}
            <div className="space-y-1.5 pt-2 border-t border-[#232834]">
              <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <Copy className="w-3 h-3" />
                <span>Copiar a</span>
              </span>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() =>
                    handleCopySlotToDays(['mon', 'tue', 'wed', 'thu', 'fri'])
                  }
                  className="px-2 py-1 rounded-md bg-secondary/55 hover:bg-[#1F242E] border border-[#232834] text-muted-foreground hover:text-white text-[11px] font-semibold transition-colors"
                  title="Copiar a Lunes–Viernes"
                >
                  Lun–Vie
                </button>
                <button
                  type="button"
                  onClick={() => handleCopySlotToDays(['sat', 'sun'])}
                  className="px-2 py-1 rounded-md bg-secondary/55 hover:bg-[#1F242E] border border-[#232834] text-muted-foreground hover:text-white text-[11px] font-semibold transition-colors"
                  title="Copiar a Sábado–Domingo"
                >
                  Sáb–Dom
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
                  className="px-2 py-1 rounded-md bg-secondary/55 hover:bg-[#1F242E] border border-[#232834] text-muted-foreground hover:text-white text-[11px] font-semibold transition-colors"
                  title="Copiar a toda la semana"
                >
                  Semana
                </button>
              </div>
            </div>

            {/* Delete Action */}
            <div className="pt-2 border-t border-[#232834]">
              <button
                type="button"
                onClick={handleDeleteSlotInContextMenu}
                className="w-full py-2 px-3 rounded-md bg-destructive/15 hover:bg-destructive/90 border border-destructive/50 text-destructive hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                title="Borrar franja horaria"
                aria-label="Borrar franja horaria"
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                <span>Borrar</span>
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
