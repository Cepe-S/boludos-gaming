import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ViewLoadingScreenProps {
  label?: string;
  compact?: boolean;
  className?: string;
}

/**
 * Lightweight, low-footprint loading screen shown only when a view chunk
 * or uncached remote resource genuinely cannot be rendered instantaneously.
 */
export const ViewLoadingScreen: React.FC<ViewLoadingScreenProps> = ({
  label = 'Cargando...',
  compact = false,
  className,
}) => {
  return (
    <div
      className={cn(
        'w-full flex flex-col items-center justify-center gap-3 px-4 animate-in fade-in duration-150',
        compact ? 'min-h-[220px] py-8' : 'min-h-[55vh] py-12',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="relative w-11 h-11 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/60 animate-spin" />
        <div className="relative z-10 w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center text-primary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
        </div>
      </div>

      <span className="text-[11px] font-mono font-medium text-muted-foreground tracking-wider uppercase">
        {label}
      </span>
    </div>
  );
};

/**
 * Non-blocking slim loading indicator for background SWR refreshes
 * when cached data is already visible on screen.
 */
export const InlineRefreshPill: React.FC<{ label?: string; className?: string }> = ({
  label = 'Actualizando',
  className,
}) => (
  <span
    role="status"
    aria-live="polite"
    className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-secondary/90 border border-border text-[10px] font-mono text-muted-foreground',
      className
    )}
  >
    <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" strokeWidth={2} />
    <span>{label}</span>
  </span>
);
