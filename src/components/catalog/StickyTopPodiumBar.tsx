import React, { useState } from 'react';
import { PodiumGameEntry } from '@/types/domain';
import { getSafeCoverUrl, handleImageFallback } from './sharedCatalogConstants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowDownToLine, Award, Check, Sparkles, Trophy, X } from 'lucide-react';

export interface StickyTopPodiumBarProps {
  mpGames: PodiumGameEntry[];
  spGames: PodiumGameEntry[];
  selectedCount: number;
  minRequiredCount?: number;
  onDropGame: (
    type: 'mp' | 'sp',
    rank: 1 | 2 | 3,
    e: React.DragEvent<HTMLDivElement>
  ) => void;
  onRemoveGame: (type: 'mp' | 'sp', rank: 1 | 2 | 3) => void;
  onUpdateHours: (type: 'mp' | 'sp', rank: 1 | 2 | 3, hours: number) => void;
  headerActions?: React.ReactNode;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
}

const RANKS: Array<1 | 2 | 3> = [1, 2, 3];

export const StickyTopPodiumBar: React.FC<StickyTopPodiumBarProps> = ({
  mpGames,
  spGames,
  selectedCount,
  minRequiredCount = 10,
  onDropGame,
  onRemoveGame,
  onUpdateHours,
  headerActions,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionDisabled,
}) => {
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [editingHoursSlot, setEditingHoursSlot] = useState<string | null>(null);
  const meetsMinimum = selectedCount >= minRequiredCount;
  const isCtaDisabled = primaryActionDisabled ?? !meetsMinimum;
  const showTopStrip = Boolean(
    headerActions || (primaryActionLabel && onPrimaryAction)
  );

  const handleDragOver = (
    slotKey: string,
    e: React.DragEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (dragOverSlot !== slotKey) {
      setDragOverSlot(slotKey);
    }
  };

  const handleDragLeave = (slotKey: string) => {
    if (dragOverSlot === slotKey) {
      setDragOverSlot(null);
    }
  };

  const handleDrop = (
    type: 'mp' | 'sp',
    rank: 1 | 2 | 3,
    e: React.DragEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    setDragOverSlot(null);
    onDropGame(type, rank, e);
  };

  const renderPodiumGroup = (
    type: 'mp' | 'sp',
    title: string,
    entries: PodiumGameEntry[],
    icon: React.ReactNode
  ) => (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-[11px] font-semibold text-foreground inline-flex items-center gap-1.5 truncate">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {entries.length}/3
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {RANKS.map((rank) => {
          const entry = entries.find((e) => e.rank === rank);
          const slotKey = `${type}-${rank}`;
          const isOver = dragOverSlot === slotKey;
          const coverUrl = entry ? getSafeCoverUrl(entry.coverUrl) : '';

          return (
            <div
              key={slotKey}
              onDragOver={(e) => handleDragOver(slotKey, e)}
              onDragLeave={() => handleDragLeave(slotKey)}
              onDrop={(e) => handleDrop(type, rank, e)}
              className={cn(
                'rounded-md border transition-all duration-150 min-w-0',
                isOver
                  ? 'scale-[1.02] ring-2 ring-primary border-primary bg-primary/15'
                  : entry
                    ? 'border-border bg-background'
                    : 'border-dashed border-border bg-background/50'
              )}
            >
              {entry ? (
                <div className="p-1.5 flex items-center gap-1.5 min-w-0">
                  <div className="relative w-11 h-7 rounded overflow-hidden bg-background/45 border border-border shrink-0">
                    <img
                      src={coverUrl}
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-sm"
                    />
                    <img
                      src={coverUrl}
                      alt={entry.name}
                      onError={handleImageFallback}
                      className="relative z-10 h-full w-full object-contain"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-mono font-bold text-warning leading-none">
                        #{rank}
                      </span>
                      <span className="text-[10px] font-semibold text-foreground truncate">
                        {entry.name}
                      </span>
                    </div>

                    {editingHoursSlot === slotKey ? (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <input
                          type="number"
                          autoFocus
                          min={0}
                          max={20000}
                          value={Math.round(entry.hoursPlayed ?? 0)}
                          onChange={(e) =>
                            onUpdateHours(type, rank, Number(e.target.value) || 0)
                          }
                          onBlur={() => setEditingHoursSlot(null)}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                            if (e.key === 'Enter' || e.key === 'Escape') {
                              setEditingHoursSlot(null);
                            }
                          }}
                          aria-label={`Horas en #${rank} ${entry.name}`}
                          className="w-10 bg-secondary/55 border border-primary/60 rounded px-1 text-[9px] font-mono text-right text-foreground focus:outline-none"
                        />
                        <span className="text-[9px] text-muted-foreground">h</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingHoursSlot(slotKey)}
                        title="Editar horas"
                        aria-label={`Editar horas de #${rank} ${entry.name}`}
                        className="mt-0.5 inline-flex items-center px-1.5 py-0.2 rounded bg-secondary/55 border border-border hover:border-primary/50 text-[9px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        {Math.round(entry.hoursPlayed ?? 0)}h
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveGame(type, rank)}
                    title="Quitar"
                    aria-label={`Quitar ${entry.name}`}
                    className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-3 h-3" strokeWidth={1.75} />
                  </button>
                </div>
              ) : (
                <div className="px-2 py-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                  <ArrowDownToLine className="w-3 h-3" strokeWidth={1.75} />
                  <span className="font-mono font-semibold">#{rank}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="sticky top-0 z-30 bg-background/60 backdrop-blur-xl border border-white/12 ring-1 ring-inset ring-white/5 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.75)] rounded-md p-2.5 space-y-2.5">
      {/* Top Strip (only rendered when headerActions or primaryActionLabel is provided) */}
      {showTopStrip && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge
              variant={meetsMinimum ? 'success' : 'warning'}
              className="text-[11px] font-mono px-2 py-0.5"
            >
              {meetsMinimum && <Check className="w-3 h-3 mr-1" strokeWidth={2} />}
              <span>
                {selectedCount}/{minRequiredCount} mín.
              </span>
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {headerActions}
            {primaryActionLabel && onPrimaryAction && (
              <Button
                type="button"
                size="xs"
                disabled={isCtaDisabled}
                onClick={onPrimaryAction}
                title={
                  isCtaDisabled
                    ? `Seleccioná al menos ${minRequiredCount} juegos`
                    : primaryActionLabel
                }
              >
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>{primaryActionLabel}</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Both Top 3 Podiums Always Visible Simultaneously */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {renderPodiumGroup(
          'mp',
          'Top 3 Multiplayers',
          mpGames,
          <Trophy className="w-3.5 h-3.5 text-warning shrink-0" strokeWidth={1.75} />
        )}
        {renderPodiumGroup(
          'sp',
          'Top 3 Singleplayers',
          spGames,
          <Award className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.75} />
        )}
      </div>
    </div>
  );
};
